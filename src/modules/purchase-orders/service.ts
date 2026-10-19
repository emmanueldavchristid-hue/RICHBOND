import "server-only";
import { Prisma, type PurchaseOrderStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { now } from "@/lib/clock";
import { formatDateOnly, noonAbidjan, todayAbidjan, currentYear } from "@/lib/dates";
import { BusinessError } from "@/lib/errors";
import { formatAmount } from "@/lib/money";
import { isRateStale } from "@/modules/currencies/rate";
import { log } from "@/modules/audit";
import { notify } from "@/modules/notifications";
import { formatDocumentNumber, nextNumber } from "@/modules/numbering";
import { parseInput } from "@/modules/purchase-requests/parse";
import { refreshOrderedStatus } from "@/modules/purchase-requests/service";
import { getSettings } from "@/modules/settings";
import { assertSupplierCanOrder } from "@/modules/suppliers";
import { buildContent, checkAllocations, type ParsedOrderInput, type PreparedContent } from "./content";
import {
  activeResponsableIds,
  dateOnly,
  expectedDateColumn,
  isoDay,
  latestRate,
  loadFull,
  loadLocked,
  lockRequests,
  orderLink,
  orderedByRequestLine,
  orderResult,
  recordEvent,
  requestLink,
  sourceRequests,
  toWorkflow,
  type FullOrder,
  type OrderActor,
  type OrderResult,
  type Tx,
} from "./internal";
import { displayOrderNumber } from "./labels";
import { assertNotFuture, assertPromisedDate, assertRequestedDateNotPast, assertSubmittable } from "./rules";
import {
  approveOrderSchema,
  cancelOrderSchema,
  changePromisedDateSchema,
  closeOrderSchema,
  commentOrderSchema,
  confirmOrderSchema,
  createOrderSchema,
  markSentSchema,
  orderVersionSchema,
  rejectOrderSchema,
  remindOrderSchema,
  returnOrderSchema,
  updateOrderSchema,
} from "./schemas";
import { applyPriceChecks, recordPriceHistory } from "./pricing";
import { buildSnapshot, restoreFromSnapshot, type OrderSnapshot } from "./snapshot";
import { computeTotals, assertWithinCeiling } from "./totals";
import { alreadyOrderedWarnings, type OrderWarning } from "./warnings";
import { assertTransition, isUnderApprovalThreshold, receivedStatusOf, statusBeforeReceipts } from "./workflow";

export type { OrderActor, OrderResult } from "./internal";

const todayIso = (at: Date) => todayAbidjan(at);

export interface OrderWithWarnings extends OrderResult {
  warnings: OrderWarning[];
}

function auditView(po: {
  number: string | null;
  version: number;
  status: string;
  type: string;
  origin: string;
  supplierId: string;
  currencyCode: string;
  totalTtc: Prisma.Decimal;
  totalTtcXof: number | null;
  requestedDate: Date;
  promisedDate?: Date | null;
}, lineCount?: number) {
  return {
    number: po.number,
    version: po.version,
    status: po.status,
    type: po.type,
    origin: po.origin,
    supplierId: po.supplierId,
    currencyCode: po.currencyCode,
    totalTtc: po.totalTtc.toString(),
    totalTtcXof: po.totalTtcXof,
    requestedDate: isoDay(po.requestedDate),
    promisedDate: po.promisedDate ? isoDay(po.promisedDate) : null,
    ...(lineCount === undefined ? {} : { lines: lineCount }),
  };
}

const amountText = (po: { totalTtc: Prisma.Decimal; currencyCode: string; currency?: { decimals: number } }) =>
  formatAmount(po.totalTtc.toString(), po.currencyCode, po.currency?.decimals ?? 2);

// ------------------------------------------------------------------ création / modification

function persistable(c: PreparedContent) {
  return {
    lines: c.lines.map((l) => ({
      lineNo: l.lineNo,
      itemId: l.itemId,
      freeDesignation: l.freeDesignation,
      supplierRef: l.supplierRef,
      quantity: l.quantity,
      unit: l.unit,
      stockQty: l.stockQty,
      unitPrice: l.unitPrice,
      discountPct: l.discountPct,
      vatRate: l.vatRate,
      netAmount: l.netAmount,
      note: l.note,
      allocations: { create: l.allocations.map((a) => ({ requestLineId: a.requestLineId, qty: a.qty })) },
    })),
    charges: c.charges,
  };
}

/** Création d'un brouillon (depuis des DA ou commande directe du Responsable). Aucun numéro : il est attribué à la validation. */
export async function createDraft(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<OrderWithWarnings> {
  const input = parseInput(createOrderSchema, raw);
  const settings = await getSettings();
  return db.$transaction(async (tx) => {
    const content = await buildContent(tx, actor, input, { at, today: todayIso(at), existing: null, defaultVatRate: settings.purchaseOrderDefaultVatRate });
    const p = persistable(content);
    const po = await tx.purchaseOrder.create({
      data: {
        ...content.header,
        status: "BROUILLON",
        version: 1,
        createdById: actor.id,
        expectedDate: dateOnly(input.requestedDate),
        lines: { create: p.lines },
        charges: { create: p.charges },
      },
    });
    await recordEvent(tx, { orderId: po.id, version: 1, type: "CREATED", userId: actor.id, to: "BROUILLON", payload: { lines: content.lines.length, origin: po.origin }, at });
    await log(tx, { userId: actor.id, action: "PO_CREATE", entity: "PurchaseOrder", entityId: po.id, after: auditView(po, content.lines.length), ip });
    return { ...orderResult(po), warnings: content.warnings };
  });
}

/** Modification du contenu d'un brouillon (ou d'un avenant en brouillon), version contrôlée ; les besoins sont re-réservés sous verrou. */
export async function updateDraft(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<OrderWithWarnings> {
  const input = parseInput(updateOrderSchema, raw);
  const settings = await getSettings();
  return db.$transaction(async (tx) => {
    const before = await loadLocked(tx, input.id, input.expectedUpdatedAt);
    assertTransition(toWorkflow(before), "edit", actor);
    const content = await buildContent(tx, actor, input as ParsedOrderInput, { at, today: todayIso(at), existing: before, defaultVatRate: settings.purchaseOrderDefaultVatRate });
    await tx.purchaseOrderLine.deleteMany({ where: { orderId: before.id } });
    await tx.purchaseOrderCharge.deleteMany({ where: { orderId: before.id } });
    const p = persistable(content);
    const after = await tx.purchaseOrder.update({
      where: { id: before.id },
      data: {
        ...content.header,
        expectedDate: expectedDateColumn({ promisedDate: before.promisedDate, requestedDate: content.header.requestedDate }),
        lines: { create: p.lines },
        charges: { create: p.charges },
      },
    });
    await recordEvent(tx, { orderId: before.id, version: before.version, type: "UPDATED", userId: actor.id, payload: { lines: content.lines.length }, at });
    await log(tx, {
      userId: actor.id,
      action: "PO_UPDATE",
      entity: "PurchaseOrder",
      entityId: before.id,
      before: auditView(before, before.lines.length),
      after: auditView(after, content.lines.length),
      ip,
    });
    return { ...orderResult(after), warnings: content.warnings };
  });
}

// ------------------------------------------------------------------ soumission

export interface SubmitOrderResult extends OrderResult {
  /** Vrai si le montant est sous le seuil de validation : la soumission a valant validation (D3). */
  autoApproved: boolean;
  warnings: OrderWarning[];
}

/**
 * BROUILLON -> A_VALIDER. Revérifie le fournisseur, les articles, les besoins rattachés (sous verrou) et mémorise
 * le contrôle de prix (D14). Sous le seuil `purchaseOrder.approvalThreshold` (> 0), la soumission vaut validation.
 */
export async function submitOrder(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<SubmitOrderResult> {
  const input = parseInput(orderVersionSchema, raw);
  const settings = await getSettings();
  return db.$transaction(async (tx) => {
    const po = await loadLocked(tx, input.id, input.expectedUpdatedAt);
    const { to } = assertTransition(toWorkflow(po), "submit", actor);
    assertSupplierCanOrder(po.supplier);
    assertSubmittable({ type: po.type, incoterm: po.incoterm, incotermPlace: po.incotermPlace, deliveryAddress: po.deliveryAddress, lines: po.lines });
    if (po.version === 1) assertRequestedDateNotPast(isoDay(po.requestedDate), todayIso(at));
    assertItemsActive(po);
    await checkAllocations(tx, actor, po.lines, po, null);

    // Taux et montants FCFA mis à jour à la soumission (indicatifs ; figés à la validation).
    const refreshed = await refreshIndicativeAmounts(tx, po, at);
    await applyPriceChecks(tx, refreshed, settings.purchaseOrderPriceAlertPct);
    const warnings: OrderWarning[] = await alreadyOrderedWarnings(tx, po.lines.flatMap((l) => (l.itemId ? [l.itemId] : [])), po.id);
    if (po.supplier.status === "EN_EVALUATION") warnings.push({ code: "SUPPLIER_IN_EVALUATION", message: `Le fournisseur « ${po.supplier.name} » est en évaluation.` });

    await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: to!, submittedAt: at, rejectedReason: null } });
    await recordEvent(tx, { orderId: po.id, version: po.version, type: "SUBMITTED", userId: actor.id, from: po.status, to: to!, at });
    await log(tx, {
      userId: actor.id,
      action: "PO_SUBMIT",
      entity: "PurchaseOrder",
      entityId: po.id,
      before: { status: po.status, version: po.version },
      after: { status: to, totalTtc: refreshed.totalTtc.toString(), totalTtcXof: refreshed.totalTtcXof },
      ip,
    });

    const submitted = await loadFull(tx, po.id);
    if (isUnderApprovalThreshold(submitted.totalTtcXof, settings.purchaseOrderApprovalThreshold)) {
      const approved = await performApproval(tx, submitted, actor, { autoApproved: false, underThreshold: true, at, ip, comment: null });
      return { ...approved.result, autoApproved: true, warnings: [...warnings, ...approved.warnings] };
    }
    await notify(tx, await activeResponsableIds(tx, actor.id), {
      type: "PO_SUBMITTED",
      title: `${displayOrderNumber(submitted)} à valider`,
      body: `${submitted.supplier.name} – ${amountText(submitted)}${submitted.version > 1 ? " – avenant" : ""}`,
      link: orderLink(po.id),
      entity: "PurchaseOrder",
      entityId: po.id,
    });
    return { ...orderResult(submitted), autoApproved: false, warnings };
  });
}

function assertItemsActive(po: FullOrder): void {
  const inactive = po.lines.filter((l) => l.item && l.item.status !== "ACTIF");
  if (inactive.length > 0) {
    throw new BusinessError("ITEM_NOT_ACTIVE", `Article(s) bloqué(s) ou obsolète(s) : ${inactive.map((l) => l.item!.code).join(", ")}. Retirez-les avant de continuer.`);
  }
}

/** Recalcule taux indicatif et équivalents FCFA (sans toucher aux lignes) ; renvoie le BC rechargé. */
async function refreshIndicativeAmounts(tx: Tx, po: FullOrder, at: Date): Promise<FullOrder> {
  const found = await latestRate(tx, po.currencyCode, at);
  const rate = po.currencyCode === "XOF" ? null : (found?.rate ?? null);
  const totals = computeTotals(
    po.lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, discountPct: l.discountPct, vatRate: l.vatRate })),
    po.charges.map((c) => ({ amount: c.amount, vatRate: c.vatRate })),
    { currencyCode: po.currencyCode, decimals: po.currency.decimals, rate },
  );
  await tx.purchaseOrder.update({
    where: { id: po.id },
    data: {
      exchangeRate: rate,
      rateDate: rate && found ? found.date : null,
      totalHt: totals.totalHt,
      totalVat: totals.totalVat,
      totalTtc: totals.totalTtc,
      totalHtXof: totals.totalHtXof,
      totalTtcXof: totals.totalTtcXof,
    },
  });
  return loadFull(tx, po.id);
}

// ------------------------------------------------------------------ validation

export interface ApproveOrderResult extends OrderResult {
  autoApproved: boolean;
  underThreshold: boolean;
  warnings: OrderWarning[];
}

interface ApprovalOptions {
  autoApproved: boolean;
  underThreshold: boolean;
  at: Date;
  ip?: string | null;
  comment: string | null;
}

/**
 * A_VALIDER -> VALIDE. Dans la même transaction : taux figé (D13), numéro BC-AAAA-NNNNN attribué à la première
 * validation seulement (D4), instantané de version, historique de prix (D14), statut des DA sources (D9).
 */
export async function approveOrder(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<ApproveOrderResult> {
  const input = parseInput(approveOrderSchema, raw);
  return db.$transaction(async (tx) => {
    const po = await loadLocked(tx, input.id, input.expectedUpdatedAt);
    const { autoApproved } = assertTransition(toWorkflow(po), "approve", actor);
    const r = await performApproval(tx, po, actor, { autoApproved, underThreshold: false, at, ip, comment: input.comment });
    return { ...r.result, autoApproved, underThreshold: false, warnings: r.warnings };
  });
}

async function performApproval(
  tx: Tx,
  po: FullOrder,
  actor: OrderActor,
  o: ApprovalOptions,
): Promise<{ result: OrderResult; warnings: OrderWarning[] }> {
  assertSupplierCanOrder(po.supplier); // blocage intervenu depuis la soumission
  assertItemsActive(po);
  await checkAllocations(tx, actor, po.lines, po, null);

  // D13 : le validateur engage un montant FCFA réel ; aucun taux connu = validation refusée.
  const warnings: OrderWarning[] = [];
  let rate: Prisma.Decimal | null = null;
  let rateDate: Date | null = null;
  if (po.currencyCode !== "XOF") {
    const found = await latestRate(tx, po.currencyCode, o.at);
    if (!found) throw new BusinessError("RATE_MISSING", `Saisir le taux ${po.currencyCode} du jour (Paramètres > Devises) avant de valider.`);
    rate = found.rate;
    rateDate = found.date;
    if (isRateStale(found.date, o.at)) {
      warnings.push({ code: "RATE_STALE", message: `Le taux ${po.currencyCode} utilisé date du ${formatDateOnly(found.date)} (plus de 30 jours).` });
    }
  }
  const totals = computeTotals(
    po.lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, discountPct: l.discountPct, vatRate: l.vatRate })),
    po.charges.map((c) => ({ amount: c.amount, vatRate: c.vatRate })),
    { currencyCode: po.currencyCode, decimals: po.currency.decimals, rate },
  );
  assertWithinCeiling(totals.totalTtcXof);

  // D4 : le numéro n'est attribué qu'ici, dans la transaction de validation, et jamais réattribué (avenant).
  let number = po.number;
  if (!number) {
    const year = currentYear(o.at);
    number = formatDocumentNumber("BC", year, await nextNumber("BC", year, tx));
  }
  const amendment = po.version > 1;
  const updated = await tx.purchaseOrder.update({
    where: { id: po.id },
    data: {
      number,
      status: "VALIDE",
      resumeStatus: null,
      exchangeRate: rate,
      rateDate,
      totalHt: totals.totalHt,
      totalVat: totals.totalVat,
      totalTtc: totals.totalTtc,
      totalHtXof: totals.totalHtXof,
      totalTtcXof: totals.totalTtcXof,
      approvedAt: o.at,
      approvedById: actor.id,
      rejectedReason: null,
      ...(amendment ? { sentAt: null, sentChannel: null, confirmedAt: null } : {}),
    },
  });
  for (const [i, l] of po.lines.entries()) {
    if (!l.netAmount.eq(totals.lineNets[i])) await tx.purchaseOrderLine.update({ where: { id: l.id }, data: { netAmount: totals.lineNets[i] } });
  }

  const full = await loadFull(tx, po.id);
  const snapshot = buildSnapshot(full, { approvedAt: o.at, approvedById: actor.id, approvedByName: await userName(tx, actor.id), autoApproved: o.autoApproved, underThreshold: o.underThreshold });
  await tx.purchaseOrderVersion.create({
    data: { orderId: po.id, version: po.version, snapshot: snapshot as unknown as Prisma.InputJsonValue, approvedAt: o.at, approvedById: actor.id },
  });
  await recordPriceHistory(tx, full, number, o.at, actor.id);
  await refreshSourceRequests(tx, full, actor, o.at);

  await recordEvent(tx, {
    orderId: po.id,
    version: po.version,
    type: "APPROVED",
    userId: actor.id,
    from: po.status,
    to: "VALIDE",
    comment: o.comment,
    payload: { number, autoApproved: o.autoApproved, underThreshold: o.underThreshold, amendment, rate: rate?.toString() ?? null, totalTtcXof: totals.totalTtcXof },
    at: o.at,
  });
  await log(tx, {
    userId: actor.id,
    action: "PO_APPROVE",
    entity: "PurchaseOrder",
    entityId: po.id,
    before: { status: po.status, number: po.number, version: po.version },
    after: { ...auditView(updated), autoApproved: o.autoApproved, underThreshold: o.underThreshold, rate: rate?.toString() ?? null },
    ip: o.ip,
  });

  const label = displayOrderNumber(updated);
  if (po.createdById !== actor.id) {
    await notify(tx, [po.createdById], {
      type: "PO_APPROVED",
      title: `${label} validé`,
      body: `${po.supplier.name} – ${amountText(updated)}${amendment ? " (avenant à renvoyer au fournisseur)" : ""}`,
      link: orderLink(po.id),
      entity: "PurchaseOrder",
      entityId: po.id,
    });
  }
  for (const src of await sourceRequests(tx, full)) {
    if (src.createdById === actor.id || src.createdById === po.createdById) continue;
    await notify(tx, [src.createdById], {
      type: "PO_REQUEST_ORDERED",
      title: `${src.number ?? "DA"} commandée : ${label}`,
      body: `Fournisseur ${po.supplier.name}.`,
      link: requestLink(src.id),
      entity: "PurchaseRequest",
      entityId: src.id,
    });
  }
  return { result: orderResult(updated), warnings };
}

async function userName(tx: Tx, id: string): Promise<string> {
  return (await tx.user.findUnique({ where: { id }, select: { name: true } }))?.name ?? "";
}

/** D9 : recalcule le statut de chaque DA source (validation, annulation, refus) dans la transaction en cours. */
async function refreshSourceRequests(tx: Tx, po: FullOrder, actor: { id: string }, at: Date): Promise<void> {
  const sources = await sourceRequests(tx, po);
  await lockRequests(tx, sources.map((s) => s.id));
  for (const s of sources) await refreshOrderedStatus(tx, s.id, await orderedByRequestLine(tx, s.id), actor, at);
}

// ------------------------------------------------------------------ refus, renvoi, annulation

/** Remet un avenant dans l'état de la version précédente (avenant refusé ou abandonné). */
export async function restorePreviousVersion(tx: Tx, po: FullOrder): Promise<{ restoredVersion: number; status: PurchaseOrderStatus }> {
  const previous = po.version - 1;
  const row = await tx.purchaseOrderVersion.findUnique({ where: { orderId_version: { orderId: po.id, version: previous } } });
  if (!row) throw new BusinessError("VERSION_MISSING", "La version précédente de ce bon de commande est introuvable : impossible de la restaurer.");
  const status = po.resumeStatus ?? "VALIDE";
  await restoreFromSnapshot(tx, po.id, row.snapshot as unknown as OrderSnapshot);
  await tx.purchaseOrder.update({ where: { id: po.id }, data: { version: previous, status, resumeStatus: null, submittedAt: null, rejectedReason: null } });
  return { restoredVersion: previous, status };
}

/** A_VALIDER -> REFUSE (motif). Un avenant refusé retrouve sa version précédente et son statut d'origine. */
export async function rejectOrder(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<OrderResult> {
  const input = parseInput(rejectOrderSchema, raw);
  return db.$transaction(async (tx) => {
    const po = await loadLocked(tx, input.id, input.expectedUpdatedAt);
    const { to } = assertTransition(toWorkflow(po), "reject", actor);
    const amendment = po.version > 1;
    if (amendment) {
      await restorePreviousVersion(tx, po);
    } else {
      await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: to!, rejectedReason: input.reason } });
    }
    const after = await loadFull(tx, po.id);
    await recordEvent(tx, { orderId: po.id, version: po.version, type: "REJECTED", userId: actor.id, from: po.status, to: to!, comment: input.reason, payload: { amendment }, at });
    await log(tx, {
      userId: actor.id,
      action: "PO_REJECT",
      entity: "PurchaseOrder",
      entityId: po.id,
      before: { status: po.status, version: po.version },
      after: { status: after.status, version: after.version, reason: input.reason },
      ip,
    });
    await refreshSourceRequests(tx, after, actor, at);
    if (po.createdById !== actor.id) {
      await notify(tx, [po.createdById], {
        type: "PO_REJECTED",
        severity: "IMPORTANT",
        title: `${displayOrderNumber(po)} refusé${amendment ? " (avenant)" : ""}`,
        body: input.reason.slice(0, 200),
        link: orderLink(po.id),
        entity: "PurchaseOrder",
        entityId: po.id,
      });
    }
    return orderResult(after);
  });
}

/** A_VALIDER -> BROUILLON « renvoyé pour correction » (commentaire obligatoire). */
export async function returnToDraft(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<OrderResult> {
  const input = parseInput(returnOrderSchema, raw);
  return db.$transaction(async (tx) => {
    const po = await loadLocked(tx, input.id, input.expectedUpdatedAt);
    const { to } = assertTransition(toWorkflow(po), "return", actor);
    const after = await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: to!, submittedAt: null } });
    await recordEvent(tx, { orderId: po.id, version: po.version, type: "RETURNED", userId: actor.id, from: po.status, to: to!, comment: input.comment, at });
    await log(tx, {
      userId: actor.id,
      action: "PO_RETURN",
      entity: "PurchaseOrder",
      entityId: po.id,
      before: { status: po.status },
      after: { status: after.status, comment: input.comment },
      ip,
    });
    if (po.createdById !== actor.id) {
      await notify(tx, [po.createdById], {
        type: "PO_RETURNED",
        severity: "IMPORTANT",
        title: `${displayOrderNumber(po)} renvoyé pour correction`,
        body: input.comment.slice(0, 200),
        link: orderLink(po.id),
        entity: "PurchaseOrder",
        entityId: po.id,
      });
    }
    return orderResult(after);
  });
}

/**
 * Annulation avec motif. Avant validation : créateur ou Responsable. Après validation (VALIDE/ENVOYE/CONFIRME) :
 * Responsable seul, et seulement si rien n'a été reçu. Les besoins rattachés sont libérés et les DA rouvertes (D9).
 */
export async function cancelOrder(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<OrderResult> {
  const input = parseInput(cancelOrderSchema, raw);
  return db.$transaction(async (tx) => {
    const po = await loadLocked(tx, input.id, input.expectedUpdatedAt);
    const { to } = assertTransition(toWorkflow(po), "cancel", actor);
    const wasValidated = !["BROUILLON", "A_VALIDER"].includes(po.status);
    const after = await tx.purchaseOrder.update({
      where: { id: po.id },
      data: { status: to!, cancelledReason: input.reason, cancelledAt: at, cancelledById: actor.id },
    });
    await recordEvent(tx, { orderId: po.id, version: po.version, type: "CANCELLED", userId: actor.id, from: po.status, to: to!, comment: input.reason, at });
    await log(tx, {
      userId: actor.id,
      action: "PO_CANCEL",
      entity: "PurchaseOrder",
      entityId: po.id,
      before: { status: po.status, number: po.number },
      after: { status: after.status, reason: input.reason },
      ip,
    });
    const full = await loadFull(tx, po.id);
    await refreshSourceRequests(tx, full, actor, at);

    const label = displayOrderNumber(po);
    const recipients = new Set<string>();
    if (po.createdById !== actor.id) recipients.add(po.createdById);
    await notify(tx, recipients, {
      type: "PO_CANCELLED",
      severity: wasValidated ? "IMPORTANT" : "INFO",
      title: `${label} annulé`,
      body: input.reason.slice(0, 200),
      link: orderLink(po.id),
      entity: "PurchaseOrder",
      entityId: po.id,
    });
    if (wasValidated) {
      for (const src of await sourceRequests(tx, full)) {
        const to2 = new Set([src.createdById, ...(src.assignedBuyerId ? [src.assignedBuyerId] : [])]);
        to2.delete(actor.id);
        await notify(tx, to2, {
          type: "PO_REQUEST_REOPENED",
          severity: "IMPORTANT",
          title: `${src.number ?? "DA"} rouverte : ${label} annulé`,
          body: input.reason.slice(0, 200),
          link: requestLink(src.id),
          entity: "PurchaseRequest",
          entityId: src.id,
        });
      }
    }
    return orderResult(after);
  });
}

// ------------------------------------------------------------------ envoi, confirmation, report, relance

/** VALIDE -> ENVOYE : trace du moyen d'envoi (aucun envoi réel avant LOT-16). */
export async function markSent(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<OrderResult> {
  const input = parseInput(markSentSchema, raw);
  return db.$transaction(async (tx) => {
    const po = await loadLocked(tx, input.id, input.expectedUpdatedAt);
    const { to } = assertTransition(toWorkflow(po), "send", actor);
    const today = todayIso(at);
    const day = input.sentDate ?? today;
    assertNotFuture(day, today);
    const sentAt = day === today ? at : noonAbidjan(day);
    const after = await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: to!, sentAt, sentChannel: input.channel } });
    await recordEvent(tx, {
      orderId: po.id,
      version: po.version,
      type: "SENT",
      userId: actor.id,
      from: po.status,
      to: to!,
      payload: { channel: input.channel, contact: input.contact, sentDate: day },
      at,
    });
    await log(tx, {
      userId: actor.id,
      action: "PO_SEND",
      entity: "PurchaseOrder",
      entityId: po.id,
      before: { status: po.status },
      after: { status: after.status, channel: input.channel, contact: input.contact, sentDate: day },
      ip,
    });
    return orderResult(after);
  });
}

/** ENVOYE -> CONFIRME : date promise obligatoire ; la première date est conservée pour l'OTIF (D18). */
export async function confirmOrder(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<OrderResult> {
  const input = parseInput(confirmOrderSchema, raw);
  return db.$transaction(async (tx) => {
    const po = await loadLocked(tx, input.id, input.expectedUpdatedAt);
    const { to } = assertTransition(toWorkflow(po), "confirm", actor);
    assertPromisedDate(input.promisedDate, po.approvedAt ? todayAbidjan(po.approvedAt) : todayIso(at));
    const promised = dateOnly(input.promisedDate);
    const moved = po.promisedDate !== null && po.promisedDate.getTime() !== promised.getTime();
    const after = await tx.purchaseOrder.update({
      where: { id: po.id },
      data: {
        status: to!,
        confirmedAt: at,
        promisedDate: promised,
        firstPromisedDate: po.firstPromisedDate ?? promised,
        promisedDateChanges: moved ? { increment: 1 } : undefined,
        expectedDate: promised,
        ...(input.supplierRef ? { supplierRef: input.supplierRef } : {}),
      },
    });
    await recordEvent(tx, {
      orderId: po.id,
      version: po.version,
      type: "CONFIRMED",
      userId: actor.id,
      from: po.status,
      to: to!,
      payload: { promisedDate: input.promisedDate, supplierRef: input.supplierRef },
      at,
    });
    await log(tx, {
      userId: actor.id,
      action: "PO_CONFIRM",
      entity: "PurchaseOrder",
      entityId: po.id,
      before: { status: po.status, promisedDate: po.promisedDate ? isoDay(po.promisedDate) : null },
      after: { status: after.status, promisedDate: input.promisedDate, firstPromisedDate: isoDay(after.firstPromisedDate!) },
      ip,
    });
    return orderResult(after);
  });
}

/** Report de la date promise : motif obligatoire, compteur de glissements, avant/après tracés (D18). */
export async function changePromisedDate(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<OrderResult & { promisedDateChanges: number }> {
  const input = parseInput(changePromisedDateSchema, raw);
  return db.$transaction(async (tx) => {
    const po = await loadLocked(tx, input.id, input.expectedUpdatedAt);
    assertTransition(toWorkflow(po), "changePromisedDate", actor);
    assertPromisedDate(input.promisedDate, po.approvedAt ? todayAbidjan(po.approvedAt) : todayIso(at));
    const before = po.promisedDate ? isoDay(po.promisedDate) : null;
    if (before === input.promisedDate) throw new BusinessError("PROMISED_DATE_UNCHANGED", "La date promise est inchangée.");
    const promised = dateOnly(input.promisedDate);
    const after = await tx.purchaseOrder.update({
      where: { id: po.id },
      data: {
        promisedDate: promised,
        firstPromisedDate: po.firstPromisedDate ?? promised,
        promisedDateChanges: { increment: 1 },
        expectedDate: promised,
      },
    });
    await recordEvent(tx, {
      orderId: po.id,
      version: po.version,
      type: "PROMISED_DATE_CHANGED",
      userId: actor.id,
      comment: input.reason,
      payload: { before, after: input.promisedDate, changes: after.promisedDateChanges },
      at,
    });
    await log(tx, {
      userId: actor.id,
      action: "PO_PROMISED_DATE_CHANGE",
      entity: "PurchaseOrder",
      entityId: po.id,
      before: { promisedDate: before },
      after: { promisedDate: input.promisedDate, reason: input.reason, changes: after.promisedDateChanges },
      ip,
    });
    return { ...orderResult(after), promisedDateChanges: after.promisedDateChanges };
  });
}

/** Trace d'une relance fournisseur (moyen, contact, commentaire) : `lastRemindedAt` et compteur mis à jour (D20). */
export async function remindSupplier(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<OrderResult & { reminderCount: number }> {
  const input = parseInput(remindOrderSchema, raw);
  return db.$transaction(async (tx) => {
    const po = await loadLocked(tx, input.id, input.expectedUpdatedAt);
    assertTransition(toWorkflow(po), "remind", actor);
    const after = await tx.purchaseOrder.update({ where: { id: po.id }, data: { lastRemindedAt: at, reminderCount: { increment: 1 } } });
    await recordEvent(tx, {
      orderId: po.id,
      version: po.version,
      type: "REMINDED",
      userId: actor.id,
      comment: input.comment,
      payload: { channel: input.channel, contact: input.contact, count: after.reminderCount },
      at,
    });
    await log(tx, {
      userId: actor.id,
      action: "PO_REMIND",
      entity: "PurchaseOrder",
      entityId: po.id,
      before: { lastRemindedAt: po.lastRemindedAt?.toISOString() ?? null, reminderCount: po.reminderCount },
      after: { lastRemindedAt: at.toISOString(), reminderCount: after.reminderCount, channel: input.channel, contact: input.contact },
      ip,
    });
    return { ...orderResult(after), reminderCount: after.reminderCount };
  });
}

/** RECU -> CLOTURE (Responsable). */
export async function closeOrder(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<OrderResult> {
  const input = parseInput(closeOrderSchema, raw);
  return db.$transaction(async (tx) => {
    const po = await loadLocked(tx, input.id, input.expectedUpdatedAt);
    const { to } = assertTransition(toWorkflow(po), "close", actor);
    const after = await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: to!, closedAt: at } });
    await recordEvent(tx, { orderId: po.id, version: po.version, type: "CLOSED", userId: actor.id, from: po.status, to: to!, comment: input.comment, at });
    await log(tx, {
      userId: actor.id,
      action: "PO_CLOSE",
      entity: "PurchaseOrder",
      entityId: po.id,
      before: { status: po.status },
      after: { status: after.status, comment: input.comment },
      ip,
    });
    return orderResult(after);
  });
}

/** Commentaire libre ; ne modifie pas le BC (pas de conflit de version). */
export async function addComment(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<{ id: string }> {
  const input = parseInput(commentOrderSchema, raw);
  return db.$transaction(async (tx) => {
    const po = await loadFull(tx, input.id);
    assertTransition(toWorkflow(po), "comment", actor);
    await recordEvent(tx, { orderId: po.id, version: po.version, type: "COMMENT", userId: actor.id, comment: input.comment, at });
    await log(tx, { userId: actor.id, action: "PO_COMMENT", entity: "PurchaseOrder", entityId: po.id, after: { comment: input.comment }, ip });
    if (po.createdById !== actor.id) {
      await notify(tx, [po.createdById], {
        type: "PO_COMMENT",
        title: `Commentaire sur ${displayOrderNumber(po)}`,
        body: input.comment.slice(0, 200),
        link: orderLink(po.id),
        entity: "PurchaseOrder",
        entityId: po.id,
      });
    }
    return { id: po.id };
  });
}

// ------------------------------------------------------------------ réception (LOT-06)

/**
 * Appelé depuis la transaction de réception (LOT-06) après mise à jour de `receivedQty` :
 * tout reçu -> RECU, reçu en partie -> PARTIELLEMENT_RECU, plus rien de reçu -> retour à CONFIRME / ENVOYE / VALIDE.
 * Idempotent. Verrouille la ligne du BC.
 */
export async function refreshReceivedStatus(tx: Tx, orderId: string, actor: { id: string }, at: Date = now()): Promise<OrderResult> {
  await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${orderId} FOR UPDATE`;
  const po = await loadFull(tx, orderId);
  const eligible: PurchaseOrderStatus[] = ["VALIDE", "ENVOYE", "CONFIRME", "PARTIELLEMENT_RECU", "RECU"];
  if (!eligible.includes(po.status)) return orderResult(po);
  const target = receivedStatusOf(po.lines) ?? statusBeforeReceipts(po);
  if (target === po.status) return orderResult(po);
  const system = { id: actor.id, role: "RESPONSABLE_ACHATS" as const };
  const action = target === "RECU" ? "markReceived" : target === "PARTIELLEMENT_RECU" ? "markPartiallyReceived" : "markReceptionReverted";
  assertTransition(toWorkflow(po), action, system);
  const after = await tx.purchaseOrder.update({ where: { id: orderId }, data: { status: target } });
  await recordEvent(tx, { orderId, version: po.version, type: "STATUS_SYNC", userId: actor.id, from: po.status, to: target, at });
  await log(tx, {
    userId: actor.id,
    action: "PO_STATUS_SYNC",
    entity: "PurchaseOrder",
    entityId: orderId,
    before: { status: po.status },
    after: { status: after.status },
  });
  return orderResult(after);
}
