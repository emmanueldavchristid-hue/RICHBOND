import "server-only";
import { Prisma, type PurchaseOrderStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { now } from "@/lib/clock";
import { currentYear, noonAbidjan, todayAbidjan } from "@/lib/dates";
import { BusinessError } from "@/lib/errors";
import { can, requireAction } from "@/lib/permissions";
import { log } from "@/modules/audit";
import { notify } from "@/modules/notifications";
import { formatDocumentNumber, nextNumber } from "@/modules/numbering";
import { parseInput } from "@/modules/purchase-requests/parse";
import { displayOrderNumber } from "@/modules/purchase-orders/labels";
import {
  activeResponsableIds,
  dateOnly,
  loadFull,
  orderLink,
  recordEvent,
  type FullOrder,
  type OrderActor,
  type Tx,
} from "@/modules/purchase-orders/internal";
import { refreshReceivedStatus } from "@/modules/purchase-orders/service";
import { getSettings } from "@/modules/settings";
import { applyMovements, type MovementInput } from "@/modules/stock";
import { Decimal } from "@/modules/stock/pmp";
import { REFUSAL_REASON_LABELS, type RefusalReasonCode } from "./labels";
import {
  assertReceivable,
  assertReceivedAtValid,
  entryUnitCost,
  isOrderComplete,
  lineQuantityProblem,
  overDeliveryExcess,
  receiptDaysLate,
  remainingQty,
  stockFactor,
  toStock,
} from "./rules";
import {
  cancelReceiptSchema,
  closeRemainderSchema,
  createReceiptSchema,
  createSupplierReturnSchema,
  decideNonConformitySchema,
} from "./schemas";
import type {
  CancelReceiptResult,
  CloseRemainderResult,
  CreateReceiptResult,
  DecideNonConformityResult,
  SupplierReturnResult,
} from "./types";

/**
 * Réceptions, non-conformités, reliquats et retours fournisseur (LOT-06).
 * Chaque écriture : une transaction (verrou du BC -> mouvements de stock -> quantités reçues -> statut du BC -> audit).
 * Le stock ne change que par `applyMovements` ; aucune quantité de StockLevel n'est écrite ici.
 */

const dec = (v: number | string | Prisma.Decimal) => new Decimal(String(v));

const lockOrder = (tx: Tx, orderId: string) => tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${orderId} FOR UPDATE`;

const designationOf = (l: { freeDesignation: string | null; item: { name: string } | null }) => l.item?.name ?? l.freeDesignation ?? "Article hors catalogue";

/** Date métier d'un mouvement : l'instant réel si la réception est du jour, sinon midi (Abidjan) du jour saisi. */
const movementDate = (day: string, today: string, at: Date) => (day === today ? at : noonAbidjan(day));

// ------------------------------------------------------------------ création

export async function createReceipt(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<CreateReceiptResult> {
  requireAction(actor, "receipt.create");
  const input = parseInput(createReceiptSchema, raw);
  const settings = await getSettings();
  const today = todayAbidjan(at);
  assertReceivedAtValid(input.receivedAt, today);

  return db.$transaction(async (tx) => {
    // 1. Verrou du BC : deux réceptions parallèles du même BC se suivent, la seconde voit les quantités de la première.
    await lockOrder(tx, input.orderId);
    const po = await loadFull(tx, input.orderId);
    if (!po.number) throw new BusinessError("NOT_FOUND", "Bon de commande introuvable.");
    assertReceivable(po.status);
    if (po.currencyCode !== "XOF" && !po.exchangeRate) {
      throw new BusinessError("TAUX_MANQUANT", "Le taux de change de ce bon de commande n'est pas renseigné : réception impossible.");
    }
    const warehouseId = input.warehouseId ?? po.warehouseId;
    const warehouse = await tx.warehouse.findUnique({ where: { id: warehouseId }, select: { id: true, active: true } });
    if (!warehouse || !warehouse.active) throw new BusinessError("DEPOT_INTROUVABLE", "Dépôt introuvable ou inactif.");

    // 2. Contrôle des lignes (R3, R4).
    const lineById = new Map(po.lines.map((l) => [l.id, l]));
    interface Prepared {
      line: FullOrder["lines"][number];
      delivered: Decimal;
      accepted: Decimal;
      refused: Decimal;
      refusalReason: RefusalReasonCode | null;
      lotNumber: string | null;
      factor: Decimal;
      acceptedStock: Decimal;
      unitCost: Decimal;
    }
    const prepared: Prepared[] = [];
    const over: string[] = [];
    for (const il of input.lines) {
      if (il.deliveredQty <= 0) continue;
      const line = lineById.get(il.orderLineId);
      if (!line) throw new BusinessError("LIGNE_INTROUVABLE", "Une ligne de la réception n'appartient pas à ce bon de commande.");
      const delivered = dec(il.deliveredQty);
      const accepted = dec(il.acceptedQty);
      const refused = dec(il.refusedQty);
      const problem = lineQuantityProblem({ delivered, accepted, refused, refusalReason: il.refusalReason });
      if (problem) throw new BusinessError("VALIDATION", `Ligne ${line.lineNo} : ${problem}`);
      if (overDeliveryExcess(line, accepted, settings.receiptOverDeliveryPct).gt(0)) {
        over.push(
          `ligne ${line.lineNo} (${designationOf(line)}) : ${accepted.toString()} ${line.unit} acceptées pour ${remainingQty(line).toString()} ${line.unit} restant dû`,
        );
      }
      const factor = stockFactor(line, line.item?.conversionFactor);
      prepared.push({
        line,
        delivered,
        accepted,
        refused,
        refusalReason: refused.gt(0) ? (il.refusalReason as RefusalReasonCode) : null,
        lotNumber: il.lotNumber,
        factor,
        acceptedStock: toStock(accepted, factor),
        unitCost: entryUnitCost({ netAmount: line.netAmount, quantity: line.quantity, exchangeRate: po.exchangeRate, factor }),
      });
    }
    if (prepared.length === 0) throw new BusinessError("VALIDATION", "Saisissez au moins une quantité livrée.");

    let overApprovedBy: string | null = null;
    if (over.length > 0) {
      if (!input.overDeliveryApproved) {
        throw new BusinessError(
          "OVER_DELIVERY",
          `Livraison supérieure à la quantité commandée : ${over.join(" ; ")}. Refusez l'excédent ou demandez l'accord du Responsable Achats.`,
        );
      }
      if (!can(actor, "receipt.approveOverDelivery")) {
        throw new BusinessError("FORBIDDEN", "Seul le Responsable Achats peut accorder une livraison supérieure à la quantité commandée.");
      }
      overApprovedBy = actor.id;
    }

    // 3. Pièce, ponctualité, complétude (R6).
    const year = currentYear(at);
    const number = formatDocumentNumber("REC", year, await nextNumber("REC", year, tx));
    const referenceDate = po.firstPromisedDate ?? po.requestedDate;
    const daysLate = receiptDaysLate(referenceDate, input.receivedAt);
    const acceptedByLine = new Map(prepared.map((p) => [p.line.id, p.accepted]));
    const inFull = isOrderComplete(po.lines, acceptedByLine);

    const receipt = await tx.receipt.create({
      data: {
        number,
        status: "VALIDEE",
        orderId: po.id,
        supplierId: po.supplierId,
        warehouseId,
        deliveryNoteRef: input.deliveryNoteRef,
        receivedAt: dateOnly(input.receivedAt),
        carrier: input.carrier,
        comment: input.comment,
        referenceDate,
        daysLate,
        inFull,
        overDeliveryApprovedById: overApprovedBy,
        overDeliveryReason: overApprovedBy ? input.overDeliveryReason : null,
        createdById: actor.id,
      },
    });
    const rows: Prisma.ReceiptLineGetPayload<object>[] = [];
    for (const p of prepared) {
      rows.push(
        await tx.receiptLine.create({
          data: {
            receiptId: receipt.id,
            orderLineId: p.line.id,
            itemId: p.line.itemId,
            deliveredQty: p.delivered,
            acceptedQty: p.accepted,
            refusedQty: p.refused,
            acceptedStockQty: p.acceptedStock,
            refusalReason: p.refusalReason,
            lotNumber: p.lotNumber,
            unitCostXof: p.unitCost,
          },
        }),
      );
    }

    // 4. Stock : une entrée par ligne acceptée d'un article géré en stock (R5).
    const occurredAt = movementDate(input.receivedAt, today, at);
    const movements: MovementInput[] = [];
    prepared.forEach((p, i) => {
      if (!p.line.itemId || !p.line.item?.stocked || p.acceptedStock.lte(0)) return;
      movements.push({
        itemId: p.line.itemId,
        warehouseId,
        type: "ENTREE_RECEPTION",
        quantity: p.acceptedStock,
        unitCost: p.unitCost,
        documentType: "RECEPTION",
        documentId: receipt.id,
        documentRef: number,
        receiptLineId: rows[i].id,
        occurredAt,
        createdById: actor.id,
      });
    });
    await applyMovements(tx, movements);

    // 5. Quantités reçues du BC : seule la quantité acceptée compte, le refusé reste dû.
    for (const p of prepared) {
      if (p.accepted.gt(0)) await tx.purchaseOrderLine.update({ where: { id: p.line.id }, data: { receivedQty: { increment: p.accepted } } });
    }

    // 6. Non-conformités : une par ligne refusée (R9).
    const ncs: { id: string; number: string }[] = [];
    for (const [i, p] of prepared.entries()) {
      if (p.refused.lte(0)) continue;
      const ncNumber = formatDocumentNumber("NC", year, await nextNumber("NC", year, tx));
      const nc = await tx.nonConformity.create({
        data: {
          number: ncNumber,
          supplierId: po.supplierId,
          orderId: po.id,
          receiptId: receipt.id,
          receiptLineId: rows[i].id,
          itemId: p.line.itemId,
          qty: p.refused,
          reason: p.refusalReason!,
          status: "OUVERTE",
        },
      });
      ncs.push({ id: nc.id, number: nc.number });
      await log(tx, {
        userId: actor.id,
        action: "NC_CREATE",
        entity: "NonConformity",
        entityId: nc.id,
        after: { number: nc.number, receipt: number, order: po.number, qty: p.refused.toString(), reason: p.refusalReason },
        ip,
      });
    }

    // 7. Statut du BC.
    const order = await refreshReceivedStatus(tx, po.id, actor, at);

    await log(tx, {
      userId: actor.id,
      action: "RECEIPT_CREATE",
      entity: "Receipt",
      entityId: receipt.id,
      after: {
        number,
        order: po.number,
        supplierId: po.supplierId,
        warehouseId,
        deliveryNoteRef: input.deliveryNoteRef,
        receivedAt: input.receivedAt,
        daysLate,
        inFull,
        orderStatus: order.status,
        overDeliveryApprovedBy: overApprovedBy,
        overDeliveryReason: overApprovedBy ? input.overDeliveryReason : null,
        lines: prepared.map((p) => ({
          lineNo: p.line.lineNo,
          delivered: p.delivered.toString(),
          accepted: p.accepted.toString(),
          refused: p.refused.toString(),
          reason: p.refusalReason,
        })),
        nonConformities: ncs.map((n) => n.number),
      },
      ip,
    });

    // 8. Notifications : l'acheteur du BC (et le Responsable) sont prévenus d'un refus.
    if (ncs.length > 0) {
      const recipients = [po.createdById, ...(await activeResponsableIds(tx))].filter((id) => id !== actor.id);
      await notify(tx, recipients, {
        type: "NC_OPENED",
        severity: "IMPORTANT",
        title: `Non-conformité sur ${displayOrderNumber(po)}`,
        body: `${po.supplier.name} – ${ncs.map((n) => n.number).join(", ")} à traiter (retour, avoir ou remplacement).`,
        link: `/stock/receptions/non-conformites`,
        entity: "Receipt",
        entityId: receipt.id,
      });
    }

    return { id: receipt.id, number, orderId: po.id, orderStatus: order.status, daysLate, inFull, nonConformities: ncs };
  });
}

// ------------------------------------------------------------------ annulation par contre-passation (R7)

export async function cancelReceipt(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<CancelReceiptResult> {
  requireAction(actor, "receipt.cancel");
  const input = parseInput(cancelReceiptSchema, raw);
  return db.$transaction(async (tx) => {
    // Verrou de la réception puis du BC (même ordre que partout) : deux annulations simultanées ne passent pas toutes les deux.
    await tx.$queryRaw`SELECT id FROM receipts WHERE id = ${input.id} FOR UPDATE`;
    const receipt = await tx.receipt.findUnique({ where: { id: input.id }, include: { lines: true } });
    if (!receipt) throw new BusinessError("NOT_FOUND", "Réception introuvable.");
    if (receipt.status !== "VALIDEE") throw new BusinessError("RECEIPT_ALREADY_CANCELLED", "Cette réception est déjà annulée.");
    await lockOrder(tx, receipt.orderId);
    const po = await loadFull(tx, receipt.orderId);
    if (!["ENVOYE", "CONFIRME", "PARTIELLEMENT_RECU", "RECU"].includes(po.status)) {
      throw new BusinessError("ORDER_NOT_RECEIVABLE", "Le bon de commande est clôturé ou annulé : cette réception ne peut plus être contre-passée.");
    }
    if (po.lines.some((l) => l.closedQty.gt(0))) {
      throw new BusinessError("REMAINDER_CLOSED", "Un reliquat a été soldé sur ce bon de commande : contre-passation impossible.");
    }
    const lineById = new Map(po.lines.map((l) => [l.id, l]));
    for (const rl of receipt.lines) {
      const line = lineById.get(rl.orderLineId);
      if (line && line.receivedQty.lt(rl.acceptedQty)) {
        throw new BusinessError("RETURN_EXISTS", "Un retour fournisseur a déjà été enregistré sur ce bon de commande : contre-passation impossible.");
      }
    }

    // Mouvements d'entrée de cette réception, contre-passés un par un (échec STOCK_INSUFFICIENT si déjà sortis).
    const originals = await tx.stockMovement.findMany({
      where: { receiptLineId: { in: receipt.lines.map((l) => l.id) }, type: "ENTREE_RECEPTION", reversalOfId: null },
      orderBy: { createdAt: "asc" },
    });
    await applyMovements(
      tx,
      originals.map((m) => ({
        itemId: m.itemId,
        warehouseId: m.warehouseId,
        type: m.type,
        quantity: m.quantity,
        documentType: "RECEPTION" as const,
        documentId: receipt.id,
        documentRef: receipt.number,
        reversalOfId: m.id,
        comment: `Annulation : ${input.reason}`,
        occurredAt: at,
        createdById: actor.id,
      })),
    );

    for (const rl of receipt.lines) {
      if (rl.acceptedQty.gt(0)) await tx.purchaseOrderLine.update({ where: { id: rl.orderLineId }, data: { receivedQty: { decrement: rl.acceptedQty } } });
    }
    // Le refus d'une réception annulée n'a plus d'objet : ses non-conformités ouvertes sont closées.
    await tx.nonConformity.updateMany({
      where: { receiptId: receipt.id, status: "OUVERTE" },
      data: { status: "CLOTUREE", comment: `Réception ${receipt.number} annulée : ${input.reason}`, decidedById: actor.id, decidedAt: at },
    });
    await tx.receipt.update({
      where: { id: receipt.id },
      data: { status: "ANNULEE", cancelledAt: at, cancelledById: actor.id, cancelledReason: input.reason },
    });
    const order = await refreshReceivedStatus(tx, po.id, actor, at);
    await log(tx, {
      userId: actor.id,
      action: "RECEIPT_CANCEL",
      entity: "Receipt",
      entityId: receipt.id,
      before: { status: "VALIDEE" },
      after: { status: "ANNULEE", number: receipt.number, reason: input.reason, reversedMovements: originals.length, orderStatus: order.status },
      ip,
    });
    return { id: receipt.id, number: receipt.number, orderStatus: order.status };
  });
}

// ------------------------------------------------------------------ solde du reliquat (R8)

export async function closeRemainder(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<CloseRemainderResult> {
  const input = parseInput(closeRemainderSchema, raw);
  return db.$transaction(async (tx) => {
    await lockOrder(tx, input.orderId);
    const po = await loadFull(tx, input.orderId);
    requireAction(actor, "purchaseOrder.closeRemainder", { scope: po.type });
    if (po.status !== "PARTIELLEMENT_RECU") {
      throw new BusinessError("INVALID_STATUS", "Le reliquat ne se solde que sur un bon de commande partiellement reçu.");
    }
    const wanted = input.lineIds ? new Set(input.lineIds) : null;
    if (wanted) {
      for (const id of wanted) if (!po.lines.some((l) => l.id === id)) throw new BusinessError("LIGNE_INTROUVABLE", "Une ligne indiquée n'appartient pas à ce bon de commande.");
    }
    const targets = po.lines.filter((l) => (!wanted || wanted.has(l.id)) && remainingQty(l).gt(0));
    if (targets.length === 0) throw new BusinessError("NOTHING_TO_CLOSE", "Aucune ligne n'a de reliquat à solder.");
    const closed: { lineNo: number; qty: string }[] = [];
    for (const l of targets) {
      const left = remainingQty(l);
      await tx.purchaseOrderLine.update({ where: { id: l.id }, data: { closedQty: { increment: left }, closedReason: input.reason } });
      closed.push({ lineNo: l.lineNo, qty: left.toString() });
    }
    const order = await refreshReceivedStatus(tx, po.id, actor, at);
    await recordEvent(tx, {
      orderId: po.id,
      version: po.version,
      type: "COMMENT",
      userId: actor.id,
      comment: `Reliquat soldé : ${input.reason}`,
      payload: { closedRemainder: closed },
      at,
    });
    await log(tx, {
      userId: actor.id,
      action: "PO_CLOSE_REMAINDER",
      entity: "PurchaseOrder",
      entityId: po.id,
      before: { status: po.status },
      after: { status: order.status, reason: input.reason, lines: closed },
      ip,
    });
    return { orderId: po.id, orderStatus: order.status, closedLines: closed.length };
  });
}

// ------------------------------------------------------------------ décision sur une non-conformité (R9)

export async function decideNonConformity(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<DecideNonConformityResult> {
  requireAction(actor, "nonConformity.decide");
  const input = parseInput(decideNonConformitySchema, raw);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM non_conformities WHERE id = ${input.id} FOR UPDATE`;
    const nc = await tx.nonConformity.findUnique({ where: { id: input.id } });
    if (!nc) throw new BusinessError("NOT_FOUND", "Non-conformité introuvable.");
    if (nc.status !== "OUVERTE") throw new BusinessError("NC_ALREADY_DECIDED", "Cette non-conformité est déjà clôturée.");
    const after = await tx.nonConformity.update({
      where: { id: nc.id },
      data: { decision: input.decision, status: "CLOTUREE", comment: input.comment ?? nc.comment, decidedById: actor.id, decidedAt: at },
    });
    await log(tx, {
      userId: actor.id,
      action: "NC_DECIDE",
      entity: "NonConformity",
      entityId: nc.id,
      before: { status: nc.status, decision: nc.decision },
      after: { number: nc.number, status: after.status, decision: after.decision, comment: input.comment, reason: REFUSAL_REASON_LABELS[nc.reason] },
      ip,
    });
    return { id: nc.id, number: nc.number, decision: input.decision, status: "CLOTUREE" as const };
  });
}

// ------------------------------------------------------------------ retour fournisseur (R10, P2)

/**
 * Bon de retour `RET-AAAA-NNNNN` pour de la marchandise DÉJÀ entrée en stock : sortie RETOUR_FOURNISSEUR au PMP du moment,
 * quantité reçue du BC diminuée (le BC se rouvre). Un refus à la livraison n'a jamais de mouvement.
 */
export async function createSupplierReturn(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<SupplierReturnResult> {
  requireAction(actor, "supplierReturn.create");
  const input = parseInput(createSupplierReturnSchema, raw);
  const today = todayAbidjan(at);
  assertReceivedAtValid(input.returnedAt, today);
  return db.$transaction(async (tx) => {
    await lockOrder(tx, input.orderId);
    const po = await loadFull(tx, input.orderId);
    const statuses: PurchaseOrderStatus[] = ["ENVOYE", "CONFIRME", "PARTIELLEMENT_RECU", "RECU"];
    if (!po.number || !statuses.includes(po.status)) {
      throw new BusinessError("ORDER_NOT_RECEIVABLE", "Un retour n'est possible que sur un bon de commande déjà réceptionné et non clôturé.");
    }
    const warehouseId = input.warehouseId ?? po.warehouseId;
    const year = currentYear(at);
    const number = formatDocumentNumber("RET", year, await nextNumber("RET", year, tx));
    const header = await tx.supplierReturn.create({
      data: { number, status: "VALIDE", supplierId: po.supplierId, orderId: po.id, warehouseId, reason: input.reason, returnedAt: dateOnly(input.returnedAt), createdById: actor.id },
    });

    const lineById = new Map(po.lines.map((l) => [l.id, l]));
    const seen = new Set<string>();
    const prepared: { line: FullOrder["lines"][number]; qty: Decimal; stockQty: Decimal }[] = [];
    for (const il of input.lines) {
      const line = lineById.get(il.orderLineId);
      if (!line) throw new BusinessError("LIGNE_INTROUVABLE", "Une ligne indiquée n'appartient pas à ce bon de commande.");
      if (seen.has(line.id)) throw new BusinessError("VALIDATION", "Une ligne de bon de commande ne peut figurer qu'une fois dans le retour.");
      seen.add(line.id);
      if (!line.itemId || !line.item?.stocked) {
        throw new BusinessError("ARTICLE_NON_STOCKE", `Ligne ${line.lineNo} : seule la marchandise entrée en stock peut faire l'objet d'un retour.`);
      }
      const qty = dec(il.quantity);
      if (qty.gt(line.receivedQty)) {
        throw new BusinessError("RETURN_TOO_MUCH", `Ligne ${line.lineNo} : vous ne pouvez pas retourner plus que la quantité reçue (${line.receivedQty.toString()} ${line.unit}).`);
      }
      prepared.push({ line, qty, stockQty: toStock(qty, stockFactor(line, line.item.conversionFactor)) });
    }

    const moves = await applyMovements(
      tx,
      prepared.map((p) => ({
        itemId: p.line.itemId!,
        warehouseId,
        type: "RETOUR_FOURNISSEUR" as const,
        quantity: p.stockQty.neg(),
        documentType: "RETOUR" as const,
        documentId: header.id,
        documentRef: number,
        comment: input.reason,
        occurredAt: movementDate(input.returnedAt, today, at),
        createdById: actor.id,
      })),
    );
    let total = 0;
    for (const [i, p] of prepared.entries()) {
      const value = -moves[i].value;
      total += value;
      await tx.supplierReturnLine.create({
        data: { returnId: header.id, orderLineId: p.line.id, itemId: p.line.itemId!, quantity: p.stockQty, unitCost: moves[i].unitCost, value },
      });
      await tx.purchaseOrderLine.update({ where: { id: p.line.id }, data: { receivedQty: { decrement: p.qty } } });
    }
    const order = await refreshReceivedStatus(tx, po.id, actor, at);
    await log(tx, {
      userId: actor.id,
      action: "RETURN_CREATE",
      entity: "SupplierReturn",
      entityId: header.id,
      after: { number, order: po.number, reason: input.reason, totalValueXof: total, orderStatus: order.status, lines: prepared.map((p) => ({ lineNo: p.line.lineNo, qty: p.qty.toString() })) },
      ip,
    });
    await notify(tx, [po.createdById], {
      type: "SUPPLIER_RETURN",
      title: `Retour fournisseur ${number}`,
      body: `${displayOrderNumber(po)} : ${input.reason}`.slice(0, 200),
      link: orderLink(po.id),
      entity: "SupplierReturn",
      entityId: header.id,
    });
    return { id: header.id, number, orderId: po.id, orderStatus: order.status, totalValueXof: total };
  });
}
