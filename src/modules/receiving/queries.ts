import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { now } from "@/lib/clock";
import { todayAbidjan } from "@/lib/dates";
import { BusinessError } from "@/lib/errors";
import { can, canSeePurchasePrice, requireAction } from "@/lib/permissions";
import { parseInput } from "@/modules/purchase-requests/parse";
import { dateOnly, isoDay, type OrderActor } from "@/modules/purchase-orders/internal";
import { displayOrderNumber, type PoStatus } from "@/modules/purchase-orders/labels";
import { daysLate as orderDaysLate } from "@/modules/purchase-orders/lateness";
import { getSettings } from "@/modules/settings";
import { movementValue } from "@/modules/stock/pmp";
import type { NonConformityDecisionCode, NonConformityStatusCode, ReceiptStatusCode, RefusalReasonCode } from "./labels";
import { maxAcceptableQty, receivableProblem, remainingQty, stockFactor } from "./rules";
import {
  listExpectedSchema,
  listNonConformitiesSchema,
  listRecentSchema,
  orderForReceiptSchema,
  receiptIdSchema,
  type ListExpectedInput,
  type ListNonConformitiesInput,
  type ListRecentInput,
} from "./schemas";
import type {
  ExpectedBlocks,
  ExpectedOrder,
  NonConformityRow,
  ReceiptDetail,
  ReceiptOrderLine,
  ReceiptOrderView,
  RecentReceipt,
} from "./types";

/** BC dont une réception est attendue (ENVOYE, CONFIRME, PARTIELLEMENT_RECU). */
const EXPECTED_STATUSES: PoStatus[] = ["ENVOYE", "CONFIRME", "PARTIELLEMENT_RECU"];
const WEEK_DAYS = 7;
const DAY_MS = 86_400_000;

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00.000Z`) + n * DAY_MS).toISOString().slice(0, 10);

// ------------------------------------------------------------------ écran principal

/**
 * Trois blocs : en retard, attendus aujourd'hui, attendus dans les 7 jours. Recherche par n° de BC ou fournisseur.
 * Aucun prix (jamais utile ici).
 */
export async function listExpected(user: OrderActor, raw: ListExpectedInput = {}, at: Date = now()): Promise<ExpectedBlocks> {
  requireAction(user, "receipt.view");
  const input = parseInput(listExpectedSchema, raw);
  const todayIso = todayAbidjan(at);
  const q = input.q?.trim();
  const orders = await db.purchaseOrder.findMany({
    where: {
      status: { in: EXPECTED_STATUSES },
      expectedDate: { lte: dateOnly(addDays(todayIso, WEEK_DAYS)) },
      ...(q
        ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { supplier: { name: { contains: q, mode: "insensitive" } } }] }
        : {}),
    },
    include: { supplier: { select: { name: true } }, warehouse: { select: { name: true } }, lines: { select: { quantity: true, receivedQty: true, closedQty: true } } },
    orderBy: [{ expectedDate: "asc" }, { number: "asc" }],
    take: 300,
  });
  const blocks: ExpectedBlocks = { todayIso, today: [], thisWeek: [], late: [] };
  for (const o of orders) {
    const openLineCount = o.lines.filter((l) => remainingQty(l).gt(0)).length;
    if (openLineCount === 0) continue;
    const day = isoDay(o.expectedDate);
    const row: ExpectedOrder = {
      orderId: o.id,
      number: displayOrderNumber(o),
      supplierName: o.supplier.name,
      type: o.type,
      status: o.status,
      warehouseName: o.warehouse.name,
      expectedDate: o.expectedDate,
      daysLate: orderDaysLate({ status: o.status, expectedDate: o.expectedDate }, at),
      lineCount: o.lines.length,
      openLineCount,
    };
    if (day < todayIso) blocks.late.push(row);
    else if (day === todayIso) blocks.today.push(row);
    else blocks.thisWeek.push(row);
  }
  return blocks;
}

/** Réceptions récentes (les plus récentes d'abord), annulées comprises. */
export async function listRecent(user: OrderActor, raw: ListRecentInput = {}): Promise<RecentReceipt[]> {
  requireAction(user, "receipt.view");
  const input = parseInput(listRecentSchema, raw);
  const q = input.q?.trim();
  const rows = await db.receipt.findMany({
    where: q
      ? {
          OR: [
            { number: { contains: q, mode: "insensitive" } },
            { deliveryNoteRef: { contains: q, mode: "insensitive" } },
            { order: { number: { contains: q, mode: "insensitive" } } },
            { supplier: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {},
    include: {
      order: { select: { id: true, number: true, version: true } },
      supplier: { select: { name: true } },
      warehouse: { select: { name: true } },
      createdBy: { select: { name: true } },
      _count: { select: { lines: true, nonConformities: true } },
    },
    orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
    take: input.limit,
  });
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    status: r.status as ReceiptStatusCode,
    orderId: r.orderId,
    orderNumber: displayOrderNumber(r.order),
    supplierName: r.supplier.name,
    warehouseName: r.warehouse.name,
    deliveryNoteRef: r.deliveryNoteRef,
    receivedAt: r.receivedAt,
    daysLate: r.daysLate,
    inFull: r.inFull,
    lineCount: r._count.lines,
    nonConformityCount: r._count.nonConformities,
    createdByName: r.createdBy.name,
  }));
}

// ------------------------------------------------------------------ saisie d'une réception

/**
 * BC préparé pour la saisie : restant dû par ligne, tolérance, réceptions déjà faites. Sans aucun champ de prix pour
 * un Magasinier (sauf réglage `receipt.showPricesToStorekeeper`) : les champs sont absents, pas à zéro.
 */
export async function getOrderForReceipt(user: OrderActor, raw: unknown): Promise<ReceiptOrderView> {
  requireAction(user, "receipt.view");
  const { orderId } = parseInput(orderForReceiptSchema, raw);
  const [po, settings] = await Promise.all([
    db.purchaseOrder.findUnique({
      where: { id: orderId },
      include: {
        supplier: { select: { id: true, name: true } },
        warehouse: { select: { id: true, name: true } },
        lines: { orderBy: { lineNo: "asc" }, include: { item: { select: { code: true, name: true, stockUnit: true, conversionFactor: true } } } },
        receipts: { orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }], select: { id: true, number: true, status: true, receivedAt: true, deliveryNoteRef: true } },
      },
    }),
    getSettings(),
  ]);
  if (!po || !po.number || po.status === "BROUILLON" || po.status === "A_VALIDER") throw new BusinessError("NOT_FOUND", "Bon de commande introuvable.");
  const prices = canSeePurchasePrice(user, { showPurchasePriceToWarehouse: settings.receiptShowPricesToStorekeeper });
  const problem = receivableProblem(po.status);
  const lines: ReceiptOrderLine[] = po.lines.map((l) => {
    const line: ReceiptOrderLine = {
      id: l.id,
      lineNo: l.lineNo,
      itemId: l.itemId,
      itemCode: l.item?.code ?? null,
      designation: l.item?.name ?? l.freeDesignation ?? "Article hors catalogue",
      supplierRef: l.supplierRef,
      unit: l.unit,
      stockUnit: l.item?.stockUnit ?? null,
      conversionFactor: stockFactor(l, l.item?.conversionFactor).toString(),
      quantity: l.quantity.toString(),
      receivedQty: l.receivedQty.toString(),
      closedQty: l.closedQty.toString(),
      remainingQty: remainingQty(l).toString(),
      maxAcceptableQty: maxAcceptableQty(l, settings.receiptOverDeliveryPct).toString(),
    };
    if (prices) {
      line.unitPrice = l.unitPrice.toString();
      line.discountPct = l.discountPct.toString();
      line.netAmount = l.netAmount.toString();
    }
    return line;
  });
  const view: ReceiptOrderView = {
    orderId: po.id,
    number: displayOrderNumber(po),
    version: po.version,
    status: po.status,
    type: po.type,
    supplierId: po.supplier.id,
    supplierName: po.supplier.name,
    warehouseId: po.warehouse.id,
    warehouseName: po.warehouse.name,
    requestedDate: po.requestedDate,
    promisedDate: po.promisedDate,
    expectedDate: po.expectedDate,
    receivable: problem === null && can(user, "receipt.create"),
    notReceivableReason: problem ? problem.message : can(user, "receipt.create") ? null : "Vous n'avez pas les droits pour enregistrer une réception.",
    overDeliveryPct: settings.receiptOverDeliveryPct,
    canApproveOverDelivery: can(user, "receipt.approveOverDelivery"),
    pricesVisible: prices,
    lines,
    receipts: po.receipts.map((r) => ({ id: r.id, number: r.number, status: r.status as ReceiptStatusCode, receivedAt: r.receivedAt, deliveryNoteRef: r.deliveryNoteRef })),
  };
  if (prices) view.currencyCode = po.currencyCode;
  return view;
}

// ------------------------------------------------------------------ fiche réception

export async function getReceipt(user: OrderActor, raw: unknown): Promise<ReceiptDetail> {
  requireAction(user, "receipt.view");
  const { id } = parseInput(receiptIdSchema, raw);
  const [r, settings] = await Promise.all([
    db.receipt.findUnique({
      where: { id },
      include: {
        order: { select: { id: true, number: true, version: true, status: true } },
        supplier: { select: { id: true, name: true } },
        warehouse: { select: { name: true } },
        createdBy: { select: { name: true } },
        lines: {
          orderBy: { orderLine: { lineNo: "asc" } },
          include: { orderLine: { select: { lineNo: true, unit: true, freeDesignation: true } }, item: { select: { code: true, name: true, stockUnit: true } } },
        },
        nonConformities: { orderBy: { number: "asc" }, include: { item: { select: { code: true } } } },
      },
    }),
    getSettings(),
  ]);
  if (!r) throw new BusinessError("NOT_FOUND", "Réception introuvable.");
  const prices = canSeePurchasePrice(user, { showPurchasePriceToWarehouse: settings.receiptShowPricesToStorekeeper });
  const cancelledBy = r.cancelledById ? await db.user.findUnique({ where: { id: r.cancelledById }, select: { name: true } }) : null;
  let total = 0;
  const lines = r.lines.map((l) => {
    const value = movementValue(l.acceptedStockQty, l.unitCostXof);
    total += value;
    const line: ReceiptDetail["lines"][number] = {
      id: l.id,
      lineNo: l.orderLine.lineNo,
      itemCode: l.item?.code ?? null,
      designation: l.item?.name ?? l.orderLine.freeDesignation ?? "Article hors catalogue",
      unit: l.orderLine.unit,
      stockUnit: l.item?.stockUnit ?? null,
      deliveredQty: l.deliveredQty.toString(),
      acceptedQty: l.acceptedQty.toString(),
      refusedQty: l.refusedQty.toString(),
      acceptedStockQty: l.acceptedStockQty.toString(),
      refusalReason: l.refusalReason as RefusalReasonCode | null,
      lotNumber: l.lotNumber,
    };
    if (prices) {
      line.unitCostXof = l.unitCostXof.toString();
      line.valueXof = value;
    }
    return line;
  });
  const detail: ReceiptDetail = {
    id: r.id,
    number: r.number,
    status: r.status as ReceiptStatusCode,
    orderId: r.order.id,
    orderNumber: displayOrderNumber(r.order),
    orderStatus: r.order.status,
    supplierId: r.supplier.id,
    supplierName: r.supplier.name,
    warehouseName: r.warehouse.name,
    deliveryNoteRef: r.deliveryNoteRef,
    receivedAt: r.receivedAt,
    carrier: r.carrier,
    comment: r.comment,
    referenceDate: r.referenceDate,
    daysLate: r.daysLate,
    inFull: r.inFull,
    overDeliveryApproved: r.overDeliveryApprovedById !== null,
    overDeliveryReason: r.overDeliveryReason,
    createdByName: r.createdBy.name,
    createdAt: r.createdAt,
    cancelledAt: r.cancelledAt,
    cancelledByName: cancelledBy?.name ?? null,
    cancelledReason: r.cancelledReason,
    pricesVisible: prices,
    canCancel: r.status === "VALIDEE" && can(user, "receipt.cancel"),
    lines,
    nonConformities: r.nonConformities.map((n) => ({
      id: n.id,
      number: n.number,
      status: n.status as NonConformityStatusCode,
      decision: n.decision as NonConformityDecisionCode | null,
      qty: n.qty.toString(),
      reason: n.reason as RefusalReasonCode,
      itemCode: n.item?.code ?? null,
    })),
  };
  if (prices) detail.totalValueXof = total;
  return detail;
}

// ------------------------------------------------------------------ non-conformités

export async function listNonConformities(user: OrderActor, raw: ListNonConformitiesInput = {}): Promise<NonConformityRow[]> {
  requireAction(user, "receipt.view");
  const input = parseInput(listNonConformitiesSchema, raw);
  const q = input.q?.trim();
  const where: Prisma.NonConformityWhereInput = {
    ...(input.status ? { status: input.status } : {}),
    ...(q
      ? {
          OR: [
            { number: { contains: q, mode: "insensitive" } },
            { supplier: { name: { contains: q, mode: "insensitive" } } },
            { order: { number: { contains: q, mode: "insensitive" } } },
            { receipt: { number: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const rows = await db.nonConformity.findMany({
    where,
    include: {
      supplier: { select: { name: true } },
      order: { select: { id: true, number: true, version: true } },
      receipt: { select: { number: true } },
      item: { select: { code: true, name: true } },
      receiptLine: { select: { orderLine: { select: { unit: true, freeDesignation: true } } } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: input.limit,
  });
  const deciderIds = [...new Set(rows.map((r) => r.decidedById).filter((v): v is string => !!v))];
  const deciders = deciderIds.length ? await db.user.findMany({ where: { id: { in: deciderIds } }, select: { id: true, name: true } }) : [];
  const nameOf = new Map(deciders.map((u) => [u.id, u.name]));
  const mayDecide = can(user, "nonConformity.decide");
  return rows.map((n) => ({
    id: n.id,
    number: n.number,
    status: n.status as NonConformityStatusCode,
    decision: n.decision as NonConformityDecisionCode | null,
    createdAt: n.createdAt,
    supplierId: n.supplierId,
    supplierName: n.supplier.name,
    orderId: n.orderId,
    orderNumber: displayOrderNumber(n.order),
    receiptId: n.receiptId,
    receiptNumber: n.receipt.number,
    itemCode: n.item?.code ?? null,
    designation: n.item?.name ?? n.receiptLine.orderLine.freeDesignation ?? "Article hors catalogue",
    unit: n.receiptLine.orderLine.unit,
    qty: n.qty.toString(),
    reason: n.reason as RefusalReasonCode,
    comment: n.comment,
    decidedAt: n.decidedAt,
    decidedByName: n.decidedById ? (nameOf.get(n.decidedById) ?? null) : null,
    canDecide: mayDecide && n.status === "OUVERTE",
  }));
}
