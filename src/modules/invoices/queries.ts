import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { now } from "@/lib/clock";
import { diffDays, todayAbidjan } from "@/lib/dates";
import { BusinessError } from "@/lib/errors";
import { requireAction } from "@/lib/permissions";
import { parseInput } from "@/modules/purchase-requests/parse";
import { EXPORT_MAX_ROWS, toPage, type Page } from "@/modules/referentials/list-query";
import { dateOnly, isoDay, type OrderActor } from "@/modules/purchase-orders/internal";
import { assertCoversTypes, invoiceScopeWhere, orderScopeWhere } from "./scope";
import { INVOICEABLE_ORDER_STATUSES, OPEN_INVOICE_STATUSES } from "./rules";
import { INVOICE_TAB_STATUSES, type InvoiceMatchCode, type InvoiceStatusCode } from "./labels";
import { invoiceableReceiptsSchema, invoiceIdSchema, listInvoicesSchema, type ListInvoicesFilters, type ListInvoicesInput } from "./schemas";
import type {
  DueBucket,
  DueSchedule,
  InvoiceDetail,
  InvoiceDiscrepancyRow,
  InvoiceExportRow,
  InvoiceRow,
  InvoiceableLine,
} from "./types";

const DAY_MS = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00.000Z`) + n * DAY_MS).toISOString().slice(0, 10);
const endOfMonth = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const OPEN: InvoiceStatusCode[] = [...OPEN_INVOICE_STATUSES];
const designationOf = (l: { freeDesignation: string | null; item: { name: string } | null }) => l.item?.name ?? l.freeDesignation ?? "Article hors catalogue";

// ------------------------------------------------------------------ filtres

function buildWhere(f: ListInvoicesFilters, at: Date): Prisma.SupplierInvoiceWhereInput {
  const today = todayAbidjan(at);
  const and: Prisma.SupplierInvoiceWhereInput[] = [];
  const tab = INVOICE_TAB_STATUSES[f.onglet];
  if (tab) and.push({ status: { in: [...tab] } });
  if (f.statut) and.push({ status: f.statut });
  if (f.fournisseur) and.push({ supplierId: f.fournisseur });
  if (f.echeance) {
    and.push({ status: { in: OPEN } });
    if (f.echeance === "en-retard") and.push({ dueDate: { lt: dateOnly(today) } });
    else if (f.echeance === "semaine") and.push({ dueDate: { gte: dateOnly(today), lte: dateOnly(addDays(today, 6)) } });
    else and.push({ dueDate: { gte: dateOnly(today), lte: dateOnly(endOfMonth(today)) } });
  }
  const q = f.q?.trim();
  if (q) {
    and.push({
      OR: [
        { number: { contains: q, mode: "insensitive" } },
        { supplierInvoiceNo: { contains: q, mode: "insensitive" } },
        { supplier: { name: { contains: q, mode: "insensitive" } } },
        { lines: { some: { orderLine: { order: { number: { contains: q, mode: "insensitive" } } } } } },
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

function buildOrderBy(f: ListInvoicesFilters): Prisma.SupplierInvoiceOrderByWithRelationInput[] {
  const dir = f.ordre;
  switch (f.tri) {
    case "echeance":
      return [{ dueDate: dir }, { number: "asc" }];
    case "montant":
      return [{ totalTtcXof: { sort: dir, nulls: "last" } }, { number: "asc" }];
    case "numero":
      return [{ number: dir }];
    case "fournisseur":
      return [{ supplier: { name: dir } }, { number: "asc" }];
    case "date":
      return [{ invoiceDate: dir }, { number: "asc" }];
    default:
      return [{ createdAt: "desc" }];
  }
}

const LIST_INCLUDE = {
  supplier: { select: { name: true } },
  lines: { select: { match: true, orderLine: { select: { order: { select: { number: true } } } } } },
} as const;

function toRow(i: Prisma.SupplierInvoiceGetPayload<{ include: typeof LIST_INCLUDE }>, todayIso: string): InvoiceRow {
  const open = (OPEN as string[]).includes(i.status);
  return {
    id: i.id,
    number: i.number,
    supplierInvoiceNo: i.supplierInvoiceNo,
    supplierId: i.supplierId,
    supplierName: i.supplier.name,
    status: i.status,
    invoiceDate: i.invoiceDate,
    dueDate: i.dueDate,
    currencyCode: i.currencyCode,
    totalTtc: i.totalTtc.toString(),
    totalTtcXof: i.totalTtcXof,
    daysOverdue: open ? Math.max(0, diffDays(isoDay(i.dueDate), todayIso)) : 0,
    orderNumbers: [...new Set(i.lines.map((l) => l.orderLine.order.number).filter((n): n is string => !!n))],
    gapLineCount: i.lines.filter((l) => l.match && l.match !== "CONFORME").length,
  };
}

export async function listInvoices(user: OrderActor, raw: ListInvoicesInput = {}, at: Date = now()): Promise<Page<InvoiceRow> & { counts: Record<string, number> }> {
  requireAction(user, "invoice.view");
  const f = parseInput(listInvoicesSchema, raw);
  const scope = invoiceScopeWhere(user);
  const where: Prisma.SupplierInvoiceWhereInput = { AND: [buildWhere(f, at), scope] };
  const [total, rows, grouped] = await Promise.all([
    db.supplierInvoice.count({ where }),
    db.supplierInvoice.findMany({ where, orderBy: buildOrderBy(f), include: LIST_INCLUDE, skip: (f.page - 1) * f.taille, take: f.taille }),
    db.supplierInvoice.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
  ]);
  const byStatus = new Map(grouped.map((g) => [g.status, g._count._all]));
  const count = (statuses: readonly InvoiceStatusCode[] | null) => (statuses ? statuses.reduce((n, s) => n + (byStatus.get(s) ?? 0), 0) : [...byStatus.values()].reduce((a, b) => a + b, 0));
  const counts = Object.fromEntries(Object.entries(INVOICE_TAB_STATUSES).map(([tab, st]) => [tab, count(st)]));
  const today = todayAbidjan(at);
  return { ...toPage(rows.map((r) => toRow(r, today)), total, f), counts };
}

// ------------------------------------------------------------------ détail

export async function getInvoice(user: OrderActor, raw: unknown, at: Date = now()): Promise<InvoiceDetail> {
  requireAction(user, "invoice.view");
  const { id } = parseInput(invoiceIdSchema, raw);
  void at;
  const inv = await db.supplierInvoice.findUnique({
    where: { id },
    include: {
      supplier: { select: { id: true, code: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      lines: {
        orderBy: { lineNo: "asc" },
        include: { orderLine: { include: { item: { select: { name: true } }, order: { select: { id: true, number: true, status: true, type: true } } } } },
      },
      attachments: { where: { removedAt: null }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!inv) throw new BusinessError("NOT_FOUND", "Facture introuvable.");
  assertCoversTypes(user, inv.lines.map((l) => l.orderLine.order.type));
  const orders = new Map(inv.lines.map((l) => [l.orderLine.order.id, l.orderLine.order]));
  const receipts = await db.receipt.findMany({
    where: { orderId: { in: [...orders.keys()] }, status: "VALIDEE" },
    orderBy: { receivedAt: "asc" },
    select: { id: true, number: true, orderId: true, receivedAt: true, deliveryNoteRef: true },
  });
  return {
    id: inv.id,
    number: inv.number,
    supplierInvoiceNo: inv.supplierInvoiceNo,
    supplier: inv.supplier,
    status: inv.status,
    invoiceDate: inv.invoiceDate,
    dueDate: inv.dueDate,
    currencyCode: inv.currencyCode,
    totalHt: inv.totalHt.toString(),
    totalVat: inv.totalVat.toString(),
    totalTtc: inv.totalTtc.toString(),
    totalTtcXof: inv.totalTtcXof,
    notes: inv.notes,
    litigeReason: inv.litigeReason,
    cancelledReason: inv.cancelledReason,
    matchedAt: inv.matchedAt,
    payApprovedAt: inv.payApprovedAt,
    transmittedAt: inv.transmittedAt,
    createdAt: inv.createdAt,
    createdBy: inv.createdBy,
    lines: inv.lines.map((l) => ({
      id: l.id,
      lineNo: l.lineNo,
      orderLineId: l.orderLineId,
      orderId: l.orderLine.order.id,
      orderNumber: l.orderLine.order.number ?? "",
      orderLineNo: l.orderLine.lineNo,
      designation: designationOf(l.orderLine),
      unit: l.orderLine.unit,
      quantity: l.quantity.toString(),
      unitPrice: l.unitPrice.toString(),
      discountPct: l.discountPct.toString(),
      vatRate: l.vatRate.toString(),
      netAmount: l.netAmount.toString(),
      match: l.match,
      billableQty: l.matchReceivedQty?.toString() ?? null,
      poPrice: l.matchPoPrice?.toString() ?? null,
      priceDeltaPct: l.matchPriceDeltaPct?.toString() ?? null,
      qtyDelta: l.matchQtyDelta?.toString() ?? null,
    })),
    orders: [...orders.values()].map((o) => ({ id: o.id, number: o.number ?? "", status: o.status })),
    receipts,
    attachments: inv.attachments.map((a) => ({ id: a.id, fileName: a.fileName, mimeType: a.mimeType, size: a.size, createdAt: a.createdAt })),
  };
}

// ------------------------------------------------------------------ pré-remplissage

/**
 * Lignes de BC reçues (acceptées) et pas encore facturées pour un fournisseur : base du pré-remplissage de la saisie.
 * Quantité facturable = reçue acceptée - facturée par les factures non annulées.
 */
export async function listInvoiceableReceipts(user: OrderActor, raw: unknown): Promise<InvoiceableLine[]> {
  requireAction(user, "invoice.view");
  const { supplierId } = parseInput(invoiceableReceiptsSchema, raw);
  const lines = await db.purchaseOrderLine.findMany({
    where: { order: { supplierId, status: { in: [...INVOICEABLE_ORDER_STATUSES] }, ...orderScopeWhere(user) }, receivedQty: { gt: 0 } },
    include: { item: { select: { name: true } }, order: { select: { id: true, number: true, currencyCode: true } } },
    orderBy: [{ order: { number: "asc" } }, { lineNo: "asc" }],
  });
  const sums = await db.supplierInvoiceLine.groupBy({
    by: ["orderLineId"],
    where: { orderLineId: { in: lines.map((l) => l.id) }, invoice: { status: { not: "ANNULEE" } } },
    _sum: { quantity: true },
  });
  const invoiced = new Map(sums.map((s) => [s.orderLineId, s._sum.quantity ?? new Prisma.Decimal(0)]));
  return lines
    .map((l) => ({ l, billable: l.receivedQty.minus(invoiced.get(l.id) ?? 0) }))
    .filter((x) => x.billable.gt(0))
    .map(({ l, billable }) => ({
      orderLineId: l.id,
      orderId: l.order.id,
      orderNumber: l.order.number ?? "",
      lineNo: l.lineNo,
      designation: designationOf(l),
      unit: l.unit,
      billableQty: billable.toString(),
      poPrice: l.unitPrice.toString(),
      discountPct: l.discountPct.toString(),
      vatRate: l.vatRate.toString(),
      currencyCode: l.order.currencyCode,
    }));
}

// ------------------------------------------------------------------ échéancier

const SCHEDULE_ITEMS_MAX = 100;

function bucket(rows: DueSchedule["late"]["items"]): DueBucket {
  return {
    count: rows.length,
    totalXof: rows.reduce((s, r) => s + (r.totalTtcXof ?? 0), 0),
    unknownXof: rows.filter((r) => r.totalTtcXof === null).length,
    items: rows.slice(0, SCHEDULE_ITEMS_MAX),
  };
}

/** Factures ni transmises ni annulées : en retard, à échéance cette semaine (7 jours) et ce mois. Information de trésorerie. */
export async function dueSchedule(user: OrderActor | null, at: Date = now()): Promise<DueSchedule> {
  if (user) requireAction(user, "invoice.view");
  const today = todayAbidjan(at);
  const rows = await db.supplierInvoice.findMany({
    where: { AND: [{ status: { in: OPEN }, dueDate: { lte: dateOnly(endOfMonth(today)) } }, invoiceScopeWhere(user)] },
    orderBy: [{ dueDate: "asc" }, { number: "asc" }],
    include: { supplier: { select: { name: true } } },
  });
  const items = rows.map((i) => ({
    id: i.id,
    number: i.number,
    supplierInvoiceNo: i.supplierInvoiceNo,
    supplierName: i.supplier.name,
    status: i.status as InvoiceStatusCode,
    dueDate: i.dueDate,
    totalTtc: i.totalTtc.toString(),
    totalTtcXof: i.totalTtcXof,
    currencyCode: i.currencyCode,
    daysOverdue: Math.max(0, diffDays(isoDay(i.dueDate), today)),
  }));
  const weekEnd = addDays(today, 6);
  const day = (i: (typeof items)[number]) => isoDay(i.dueDate);
  return {
    todayIso: today,
    late: bucket(items.filter((i) => day(i) < today)),
    week: bucket(items.filter((i) => day(i) >= today && day(i) <= weekEnd)),
    month: bucket(items.filter((i) => day(i) >= today)),
  };
}

/** Compteurs pour le digest et le tableau de bord. */
export async function invoiceCounters(at: Date = now(), user?: OrderActor | null) {
  const today = todayAbidjan(at);
  const sc = invoiceScopeWhere(user);
  const [conforme, ecart, dueWeek] = await Promise.all([
    db.supplierInvoice.count({ where: { AND: [{ status: "CONFORME" }, sc] } }),
    db.supplierInvoice.count({ where: { AND: [{ status: "ECART" }, sc] } }),
    db.supplierInvoice.count({ where: { AND: [{ status: { in: OPEN }, dueDate: { lte: dateOnly(addDays(today, 6)) } }, sc] } }),
  ]);
  return { conforme, ecart, dueWeek };
}

// ------------------------------------------------------------------ exports

export async function invoiceDiscrepancyRows(user: OrderActor, raw: unknown = {}, at: Date = now()): Promise<InvoiceDiscrepancyRow[]> {
  requireAction(user, "invoice.view");
  const f = parseInput(listInvoicesSchema, raw);
  const base = buildWhere(f, at);
  const where: Prisma.SupplierInvoiceLineWhereInput = {
    match: { not: null },
    AND: [{ NOT: { match: "CONFORME" } }],
    invoice: { AND: [base, { status: { not: "ANNULEE" } }, invoiceScopeWhere(user)] },
  };
  const total = await db.supplierInvoiceLine.count({ where });
  if (total > EXPORT_MAX_ROWS) throw new BusinessError("EXPORT_TOO_LARGE", `Trop de lignes (${total}) : affinez les filtres (maximum ${EXPORT_MAX_ROWS}).`);
  const lines = await db.supplierInvoiceLine.findMany({
    where,
    orderBy: [{ invoice: { number: "asc" } }, { lineNo: "asc" }],
    include: {
      invoice: { include: { supplier: { select: { name: true } } } },
      orderLine: { include: { item: { select: { name: true } }, order: { select: { number: true } } } },
    },
  });
  return lines.map((l) => ({
    invoiceNumber: l.invoice.number,
    supplierInvoiceNo: l.invoice.supplierInvoiceNo,
    supplier: l.invoice.supplier.name,
    invoiceDate: l.invoice.invoiceDate,
    dueDate: l.invoice.dueDate,
    status: l.invoice.status,
    orderNumber: l.orderLine.order.number ?? "",
    lineNo: l.lineNo,
    designation: designationOf(l.orderLine),
    unit: l.orderLine.unit,
    match: l.match as InvoiceMatchCode,
    invoicedQty: Number(l.quantity),
    billableQty: l.matchReceivedQty === null ? null : Number(l.matchReceivedQty),
    qtyDelta: l.matchQtyDelta === null ? null : Number(l.matchQtyDelta),
    invoicePrice: Number(l.unitPrice),
    poPrice: l.matchPoPrice === null ? null : Number(l.matchPoPrice),
    priceDeltaPct: l.matchPriceDeltaPct === null ? null : Number(l.matchPriceDeltaPct),
    currencyCode: l.invoice.currencyCode,
  }));
}

export async function exportInvoices(user: OrderActor, raw: unknown = {}, at: Date = now()): Promise<InvoiceExportRow[]> {
  requireAction(user, "invoice.view");
  const f = parseInput(listInvoicesSchema, raw);
  const where: Prisma.SupplierInvoiceWhereInput = { AND: [buildWhere(f, at), invoiceScopeWhere(user)] };
  const total = await db.supplierInvoice.count({ where });
  if (total > EXPORT_MAX_ROWS) throw new BusinessError("EXPORT_TOO_LARGE", `Trop de factures (${total}) : affinez les filtres (maximum ${EXPORT_MAX_ROWS}).`);
  const rows = await db.supplierInvoice.findMany({
    where,
    orderBy: buildOrderBy(f),
    include: { supplier: { select: { name: true } }, createdBy: { select: { name: true } }, lines: { select: { orderLine: { select: { order: { select: { number: true } } } } } } },
  });
  return rows.map((i) => ({
    number: i.number,
    supplierInvoiceNo: i.supplierInvoiceNo,
    supplier: i.supplier.name,
    status: i.status,
    invoiceDate: i.invoiceDate,
    dueDate: i.dueDate,
    orderNumbers: [...new Set(i.lines.map((l) => l.orderLine.order.number).filter(Boolean))].join(", "),
    currencyCode: i.currencyCode,
    totalHt: Number(i.totalHt),
    totalVat: Number(i.totalVat),
    totalTtc: Number(i.totalTtc),
    totalTtcXof: i.totalTtcXof,
    createdBy: i.createdBy.name,
  }));
}
