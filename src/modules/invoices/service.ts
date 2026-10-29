import "server-only";
import { Prisma, type InvoiceStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { now } from "@/lib/clock";
import { currentYear } from "@/lib/dates";
import { BusinessError } from "@/lib/errors";
import { can, requireAction } from "@/lib/permissions";
import { log } from "@/modules/audit";
import { notify } from "@/modules/notifications";
import { formatDocumentNumber, nextNumber } from "@/modules/numbering";
import { parseInput } from "@/modules/purchase-requests/parse";
import { activeResponsableIds, dateOnly, recordEvent, type OrderActor, type Tx } from "@/modules/purchase-orders/internal";
import { computeTotals, effectiveUnitPrice } from "@/modules/purchase-orders/totals";
import { getSettings } from "@/modules/settings";
import { assertCoversTypes, assertInvoiceInScope } from "./scope";
import { invoiceLink, type InvoiceMatchCode, type InvoiceStatusCode } from "./labels";
import {
  INVOICEABLE_ORDER_STATUSES,
  computeDueDate,
  invoiceStatusFromLines,
  isOrderFullyInvoiced,
  matchLine,
  normalizeSupplierInvoiceNo,
  type PaymentTermCode,
  type Tolerances,
} from "./rules";
import {
  approvePaymentSchema,
  cancelInvoiceSchema,
  createInvoiceSchema,
  invoiceIdSchema,
  litigeSchema,
  updateInvoiceSchema,
  type CreateInvoiceInput,
} from "./schemas";
import type { InvoiceResult } from "./types";

/**
 * Factures fournisseurs et rapprochement 3 voies BC / réception / facture (LOT-13).
 * Chaque écriture : une transaction (verrou facture puis BC, ordre d'identifiant croissant) -> lignes -> rapprochement ->
 * quantités facturées du BC -> clôture éventuelle -> audit -> notification. Aucune écriture de stock ici.
 * La licence (essai expiré = lecture seule) est contrôlée par les actions serveur (`withAction`).
 */

const ZERO = new Prisma.Decimal(0);

const lockOrders = async (tx: Tx, ids: string[]) => {
  const sorted = [...new Set(ids)].sort();
  if (sorted.length > 0) await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ANY(${sorted}) ORDER BY id FOR UPDATE`;
};
const lockInvoice = (tx: Tx, id: string) => tx.$queryRaw`SELECT id FROM supplier_invoices WHERE id = ${id} FOR UPDATE`;

const doubleError = (existing?: string) =>
  new BusinessError(
    "FACTURE_EN_DOUBLE",
    existing
      ? `Cette facture fournisseur a déjà été saisie (${existing}) : même fournisseur, même numéro.`
      : "Cette facture fournisseur a déjà été saisie : même fournisseur, même numéro.",
  );

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

// ------------------------------------------------------------------ rapprochement

async function invoicedElsewhere(tx: Tx, orderLineIds: string[], excludeInvoiceId?: string): Promise<Map<string, Prisma.Decimal>> {
  if (orderLineIds.length === 0) return new Map();
  const rows = await tx.supplierInvoiceLine.groupBy({
    by: ["orderLineId"],
    where: {
      orderLineId: { in: orderLineIds },
      invoice: { status: { not: "ANNULEE" }, ...(excludeInvoiceId ? { id: { not: excludeInvoiceId } } : {}) },
    },
    _sum: { quantity: true },
  });
  return new Map(rows.map((r) => [r.orderLineId, r._sum.quantity ?? ZERO]));
}

/** Quantités facturées des lignes de BC = somme des factures non annulées. */
async function refreshInvoicedQty(tx: Tx, orderLineIds: string[]): Promise<void> {
  const sums = await invoicedElsewhere(tx, orderLineIds);
  for (const id of orderLineIds) await tx.purchaseOrderLine.update({ where: { id }, data: { invoicedQty: sums.get(id) ?? ZERO } });
}

const tolerancesOf = (s: { invoicePriceTolerancePct: number; invoiceQtyTolerance: number }): Tolerances => ({
  pricePct: s.invoicePriceTolerancePct,
  qty: s.invoiceQtyTolerance,
});

const clampPct = (n: number) => Math.max(-99999, Math.min(99999, n));

/** Calcule et fige le rapprochement de chaque ligne ; renvoie le statut de la facture (CONFORME ou ECART). */
async function applyMatch(tx: Tx, invoiceId: string, tol: Tolerances, at: Date): Promise<{ status: "CONFORME" | "ECART"; matches: InvoiceMatchCode[] }> {
  const lines = await tx.supplierInvoiceLine.findMany({ where: { invoiceId }, include: { orderLine: true }, orderBy: { lineNo: "asc" } });
  const elsewhere = await invoicedElsewhere(tx, lines.map((l) => l.orderLineId), invoiceId);
  const matches: InvoiceMatchCode[] = [];
  for (const l of lines) {
    const poPrice = effectiveUnitPrice(l.orderLine.unitPrice, l.orderLine.discountPct);
    const r = matchLine(
      {
        invoicedQty: l.quantity,
        invoicePrice: effectiveUnitPrice(l.unitPrice, l.discountPct),
        poPrice,
        receivedAcceptedQty: l.orderLine.receivedQty,
        alreadyInvoicedElsewhere: elsewhere.get(l.orderLineId) ?? ZERO,
      },
      tol,
    );
    matches.push(r.match);
    await tx.supplierInvoiceLine.update({
      where: { id: l.id },
      data: {
        match: r.match,
        matchReceivedQty: r.billableQty,
        matchPoPrice: poPrice.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
        matchPriceDeltaPct: clampPct(r.priceDeltaPct),
        matchQtyDelta: r.qtyDelta,
      },
    });
  }
  await tx.supplierInvoice.update({ where: { id: invoiceId }, data: { matchedAt: at } });
  return { status: invoiceStatusFromLines(matches), matches };
}

/** Clôture les BC reçus et facturés en totalité ; avec `allowReopen`, rouvre ceux qui ne le sont plus (annulation de facture). */
async function syncOrders(tx: Tx, orderIds: string[], actor: { id: string }, at: Date, opts: { allowReopen?: boolean; ref: string }) {
  const closed: string[] = [];
  const reopened: string[] = [];
  for (const orderId of [...new Set(orderIds)].sort()) {
    const po = await tx.purchaseOrder.findUnique({ where: { id: orderId }, include: { lines: true } });
    if (!po) continue;
    const full = isOrderFullyInvoiced(po.lines);
    let to: "CLOTURE" | "RECU" | null = null;
    if (po.status === "RECU" && full) to = "CLOTURE";
    else if (opts.allowReopen && po.status === "CLOTURE" && !full) to = "RECU";
    if (!to) continue;
    await tx.purchaseOrder.update({ where: { id: orderId }, data: { status: to } });
    await recordEvent(tx, {
      orderId,
      version: po.version,
      type: "STATUS_SYNC",
      userId: actor.id,
      from: po.status,
      to,
      comment: to === "CLOTURE" ? `Reçu et facturé en totalité (facture ${opts.ref})` : `Rouvert : facture ${opts.ref} annulée`,
      at,
    });
    await log(tx, {
      userId: actor.id,
      action: to === "CLOTURE" ? "PO_CLOSE" : "PO_STATUS_SYNC",
      entity: "PurchaseOrder",
      entityId: orderId,
      before: { status: po.status },
      after: { status: to, invoice: opts.ref },
    });
    (to === "CLOTURE" ? closed : reopened).push(po.number ?? orderId);
  }
  return { closed, reopened };
}

async function notifyMatch(tx: Tx, actor: { id: string }, inv: { id: string; number: string; supplierName: string }, status: "CONFORME" | "ECART") {
  const recipients = (await activeResponsableIds(tx)).filter((id) => id !== actor.id);
  await notify(tx, recipients, {
    type: status === "ECART" ? "INVOICE_GAP" : "INVOICE_TO_APPROVE",
    severity: status === "ECART" ? "IMPORTANT" : "INFO",
    title: status === "ECART" ? `Facture ${inv.number} en écart` : `Facture ${inv.number} à mettre en bon à payer`,
    body: `${inv.supplierName} – ${status === "ECART" ? "écart avec le bon de commande ou la réception, à traiter." : "conforme au bon de commande et à la réception."}`,
    link: invoiceLink(inv.id),
    entity: "SupplierInvoice",
    entityId: inv.id,
  });
}

// ------------------------------------------------------------------ préparation des lignes

type PreparedOrderLine = Prisma.PurchaseOrderLineGetPayload<{
  include: { order: { select: { id: true; number: true; supplierId: true; status: true; type: true; currencyCode: true; exchangeRate: true; paymentTerm: true; paymentTermNote: true; currency: { select: { decimals: true } } } } };
}>;

const ORDER_SELECT = {
  id: true,
  number: true,
  supplierId: true,
  status: true,
  type: true,
  currencyCode: true,
  exchangeRate: true,
  paymentTerm: true,
  paymentTermNote: true,
  currency: { select: { decimals: true } },
} as const;

/** Verrouille les BC visés puis charge leurs lignes ; contrôle fournisseur, statut et devise. */
async function loadOrderLines(tx: Tx, actor: OrderActor, supplierId: string, input: Pick<CreateInvoiceInput, "lines" | "currencyCode">, extraOrderIds: string[] = []) {
  const ids = input.lines.map((l) => l.orderLineId);
  const probe = await tx.purchaseOrderLine.findMany({ where: { id: { in: ids } }, select: { id: true, orderId: true } });
  if (probe.length !== new Set(ids).size) throw new BusinessError("LIGNE_INTROUVABLE", "Une ligne de la facture ne correspond à aucune ligne de bon de commande.");
  await lockOrders(tx, [...probe.map((p) => p.orderId), ...extraOrderIds]);
  const lines: PreparedOrderLine[] = await tx.purchaseOrderLine.findMany({ where: { id: { in: ids } }, include: { order: { select: ORDER_SELECT } } });
  assertCoversTypes(actor, lines.map((l) => l.order.type));
  const byId = new Map(lines.map((l) => [l.id, l]));
  const ordered = ids.map((id) => byId.get(id)!);
  for (const l of ordered) {
    if (l.order.supplierId !== supplierId) {
      throw new BusinessError("FACTURE_AUTRE_FOURNISSEUR", `La ligne ${l.lineNo} du bon ${l.order.number ?? ""} appartient à un autre fournisseur que celui de la facture.`);
    }
    if (!(INVOICEABLE_ORDER_STATUSES as readonly string[]).includes(l.order.status)) {
      throw new BusinessError("BC_NON_FACTURABLE", `Le bon ${l.order.number ?? ""} n'a encore rien reçu (ou est annulé) : il ne peut pas être facturé.`);
    }
  }
  const currencies = new Set(ordered.map((l) => l.order.currencyCode));
  if (currencies.size > 1) throw new BusinessError("FACTURE_DEVISE", "Les bons de commande d'une même facture doivent avoir la même devise.");
  const currencyCode = [...currencies][0];
  if (input.currencyCode && input.currencyCode !== currencyCode) {
    throw new BusinessError("FACTURE_DEVISE", `La facture doit être dans la devise du bon de commande (${currencyCode}), pas en ${input.currencyCode}.`);
  }
  return { ordered, currencyCode, firstOrder: ordered[0].order };
}

function buildLineData(ordered: PreparedOrderLine[], input: Pick<CreateInvoiceInput, "lines">, currencyCode: string, firstOrder: PreparedOrderLine["order"]) {
  const rows = input.lines.map((l, i) => ({
    orderLineId: l.orderLineId,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    discountPct: l.discountPct,
    vatRate: l.vatRate ?? Number(ordered[i].vatRate),
  }));
  const totals = computeTotals(rows, [], { currencyCode, decimals: firstOrder.currency.decimals, rate: firstOrder.exchangeRate });
  return { rows, totals };
}

// ------------------------------------------------------------------ création

export async function createInvoice(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<InvoiceResult> {
  requireAction(actor, "invoice.manage");
  const input = parseInput(createInvoiceSchema, raw);
  const settings = await getSettings();
  const supplierInvoiceNo = normalizeSupplierInvoiceNo(input.supplierInvoiceNo);
  if (!supplierInvoiceNo) throw new BusinessError("VALIDATION", "Saisissez le numéro de la facture du fournisseur.");
  try {
    return await db.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId }, select: { id: true, name: true } });
      if (!supplier) throw new BusinessError("NOT_FOUND", "Fournisseur introuvable.");
      const { ordered, currencyCode, firstOrder } = await loadOrderLines(tx, actor, supplier.id, input);
      const dup = await tx.supplierInvoice.findUnique({ where: { supplierId_supplierInvoiceNo: { supplierId: supplier.id, supplierInvoiceNo } }, select: { number: true } });
      if (dup) throw doubleError(dup.number);

      const { rows, totals } = buildLineData(ordered, input, currencyCode, firstOrder);
      const year = currentYear(at);
      const number = formatDocumentNumber("FAC", year, await nextNumber("FAC", year, tx));
      const dueDate = input.dueDate ?? computeDueDate(input.invoiceDate, firstOrder.paymentTerm as PaymentTermCode, firstOrder.paymentTermNote);
      const inv = await tx.supplierInvoice.create({
        data: {
          number,
          supplierInvoiceNo,
          supplierId: supplier.id,
          status: "SAISIE",
          invoiceDate: dateOnly(input.invoiceDate),
          dueDate: dateOnly(dueDate),
          currencyCode,
          totalHt: totals.totalHt,
          totalVat: totals.totalVat,
          totalTtc: totals.totalTtc,
          totalTtcXof: totals.totalTtcXof,
          notes: input.notes,
          createdById: actor.id,
          lines: {
            create: rows.map((r, i) => ({
              lineNo: i + 1,
              orderLineId: r.orderLineId,
              quantity: r.quantity,
              unitPrice: r.unitPrice,
              discountPct: r.discountPct,
              vatRate: r.vatRate,
              netAmount: totals.lineNets[i],
            })),
          },
        },
      });
      const { status, matches } = await applyMatch(tx, inv.id, tolerancesOf(settings), at);
      await tx.supplierInvoice.update({ where: { id: inv.id }, data: { status } });
      const lineIds = rows.map((r) => r.orderLineId);
      await refreshInvoicedQty(tx, lineIds);
      const sync = await syncOrders(tx, ordered.map((l) => l.orderId), actor, at, { ref: number });
      await log(tx, {
        userId: actor.id,
        action: "INVOICE_CREATE",
        entity: "SupplierInvoice",
        entityId: inv.id,
        after: {
          number,
          supplierInvoiceNo,
          supplier: supplier.name,
          status,
          dueDate,
          currency: currencyCode,
          totalTtc: totals.totalTtc.toString(),
          orders: [...new Set(ordered.map((l) => l.order.number))],
          matches,
          closedOrders: sync.closed,
        },
        ip,
      });
      await notifyMatch(tx, actor, { id: inv.id, number, supplierName: supplier.name }, status);
      return { id: inv.id, number, status, closedOrders: sync.closed, reopenedOrders: sync.reopened, lineMatches: matches };
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw doubleError();
    throw e;
  }
}

// ------------------------------------------------------------------ modification

const EDITABLE: InvoiceStatus[] = ["SAISIE", "ECART", "LITIGE"];

export async function updateInvoice(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<InvoiceResult> {
  requireAction(actor, "invoice.manage");
  const input = parseInput(updateInvoiceSchema, raw);
  const settings = await getSettings();
  const supplierInvoiceNo = normalizeSupplierInvoiceNo(input.supplierInvoiceNo);
  try {
    return await db.$transaction(async (tx) => {
      await lockInvoice(tx, input.id);
      const inv = await tx.supplierInvoice.findUnique({ where: { id: input.id }, include: { lines: true } });
      if (!inv) throw new BusinessError("NOT_FOUND", "Facture introuvable.");
      await assertInvoiceInScope(tx, actor, inv.id);
      if (!EDITABLE.includes(inv.status)) {
        throw new BusinessError("INVALID_STATUS", "Seule une facture saisie, en écart ou en litige peut être modifiée.");
      }
      const oldLineIds = inv.lines.map((l) => l.orderLineId);
      const oldOrders = (await tx.purchaseOrderLine.findMany({ where: { id: { in: oldLineIds } }, select: { orderId: true } })).map((o) => o.orderId);
      const { ordered, currencyCode, firstOrder } = await loadOrderLines(tx, actor, inv.supplierId, input, oldOrders);
      const dup = await tx.supplierInvoice.findFirst({ where: { supplierId: inv.supplierId, supplierInvoiceNo, id: { not: inv.id } }, select: { number: true } });
      if (dup) throw doubleError(dup.number);

      const { rows, totals } = buildLineData(ordered, input, currencyCode, firstOrder);
      const dueDate = input.dueDate ?? computeDueDate(input.invoiceDate, firstOrder.paymentTerm as PaymentTermCode, firstOrder.paymentTermNote);
      await tx.supplierInvoiceLine.deleteMany({ where: { invoiceId: inv.id } });
      await tx.supplierInvoice.update({
        where: { id: inv.id },
        data: {
          supplierInvoiceNo,
          invoiceDate: dateOnly(input.invoiceDate),
          dueDate: dateOnly(dueDate),
          currencyCode,
          totalHt: totals.totalHt,
          totalVat: totals.totalVat,
          totalTtc: totals.totalTtc,
          totalTtcXof: totals.totalTtcXof,
          notes: input.notes,
          lines: {
            create: rows.map((r, i) => ({
              lineNo: i + 1,
              orderLineId: r.orderLineId,
              quantity: r.quantity,
              unitPrice: r.unitPrice,
              discountPct: r.discountPct,
              vatRate: r.vatRate,
              netAmount: totals.lineNets[i],
            })),
          },
        },
      });
      const { status: matched, matches } = await applyMatch(tx, inv.id, tolerancesOf(settings), at);
      const status: InvoiceStatus = inv.status === "LITIGE" ? "LITIGE" : matched;
      await tx.supplierInvoice.update({ where: { id: inv.id }, data: { status } });
      await refreshInvoicedQty(tx, [...new Set([...oldLineIds, ...rows.map((r) => r.orderLineId)])]);
      const sync = await syncOrders(tx, [...oldOrders, ...ordered.map((l) => l.orderId)], actor, at, { allowReopen: true, ref: inv.number });
      await log(tx, {
        userId: actor.id,
        action: "INVOICE_UPDATE",
        entity: "SupplierInvoice",
        entityId: inv.id,
        before: { status: inv.status, supplierInvoiceNo: inv.supplierInvoiceNo, totalTtc: inv.totalTtc.toString() },
        after: { status, supplierInvoiceNo, totalTtc: totals.totalTtc.toString(), matches },
        ip,
      });
      if (status !== inv.status && (status === "ECART" || status === "CONFORME")) {
        const supplier = await tx.supplier.findUniqueOrThrow({ where: { id: inv.supplierId }, select: { name: true } });
        await notifyMatch(tx, actor, { id: inv.id, number: inv.number, supplierName: supplier.name }, status);
      }
      return { id: inv.id, number: inv.number, status, closedOrders: sync.closed, reopenedOrders: sync.reopened, lineMatches: matches };
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw doubleError();
    throw e;
  }
}

// ------------------------------------------------------------------ transitions

/** Charge la facture verrouillée et ses BC (verrous dans l'ordre : facture, puis BC). */
async function lockedInvoice(tx: Tx, actor: OrderActor, id: string) {
  await lockInvoice(tx, id);
  const inv = await tx.supplierInvoice.findUnique({ where: { id }, include: { lines: { include: { orderLine: { select: { id: true, orderId: true } } } }, supplier: { select: { name: true } } } });
  if (!inv) throw new BusinessError("NOT_FOUND", "Facture introuvable.");
  await assertInvoiceInScope(tx, actor, id);
  await lockOrders(tx, inv.lines.map((l) => l.orderLine.orderId));
  return inv;
}

/** Rapproche de nouveau (réception ou facture voisine survenue depuis) : SAISIE, CONFORME ou ECART. */
export async function rematchInvoice(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<InvoiceResult> {
  requireAction(actor, "invoice.manage");
  const input = parseInput(invoiceIdSchema, raw);
  const settings = await getSettings();
  return db.$transaction(async (tx) => {
    const inv = await lockedInvoice(tx, actor, input.id);
    if (!["SAISIE", "CONFORME", "ECART"].includes(inv.status)) {
      throw new BusinessError("INVALID_STATUS", "Le rapprochement ne se refait que sur une facture saisie, conforme ou en écart.");
    }
    const { status, matches } = await applyMatch(tx, inv.id, tolerancesOf(settings), at);
    await tx.supplierInvoice.update({ where: { id: inv.id }, data: { status } });
    await log(tx, { userId: actor.id, action: "INVOICE_MATCH", entity: "SupplierInvoice", entityId: inv.id, before: { status: inv.status }, after: { status, matches }, ip });
    if (status !== inv.status) await notifyMatch(tx, actor, { id: inv.id, number: inv.number, supplierName: inv.supplier.name }, status);
    return { id: inv.id, number: inv.number, status, closedOrders: [], reopenedOrders: [], lineMatches: matches };
  });
}

/** Bon à payer (Responsable seul). Facture en écart : motif de dérogation obligatoire. */
export async function approvePayment(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<InvoiceResult> {
  requireAction(actor, "invoice.approvePayment");
  const input = parseInput(approvePaymentSchema, raw);
  const settings = await getSettings();
  return db.$transaction(async (tx) => {
    const inv = await lockedInvoice(tx, actor, input.id);
    if (inv.status !== "CONFORME" && inv.status !== "ECART") {
      throw new BusinessError("INVALID_STATUS", "Seule une facture conforme (ou en écart avec dérogation) peut être mise en bon à payer.");
    }
    // Les quantités ont pu bouger depuis la saisie : le rapprochement est refait avant de décider.
    const { status: fresh, matches } = await applyMatch(tx, inv.id, tolerancesOf(settings), at);
    if (fresh === "ECART" && !input.derogationReason) {
      throw new BusinessError("FACTURE_ECART_MOTIF", "Cette facture est en écart : indiquez le motif de la dérogation pour la mettre en bon à payer.");
    }
    const derogation = fresh === "ECART" ? input.derogationReason : null;
    await tx.supplierInvoice.update({
      where: { id: inv.id },
      data: {
        status: "BON_A_PAYER",
        payApprovedAt: at,
        payApprovedById: actor.id,
        ...(derogation ? { notes: [inv.notes, `Dérogation bon à payer : ${derogation}`].filter(Boolean).join("\n").slice(0, 2000) } : {}),
      },
    });
    await log(tx, {
      userId: actor.id,
      action: "INVOICE_APPROVE_PAYMENT",
      entity: "SupplierInvoice",
      entityId: inv.id,
      before: { status: inv.status },
      after: { status: "BON_A_PAYER", matchStatus: fresh, derogationReason: derogation, matches },
      ip,
    });
    return { id: inv.id, number: inv.number, status: "BON_A_PAYER" as const, closedOrders: [], reopenedOrders: [], lineMatches: matches };
  });
}

async function simpleTransition(
  actor: OrderActor,
  id: string,
  opts: { from: InvoiceStatus[]; to: InvoiceStatus; action: string; message: string; data?: Prisma.SupplierInvoiceUpdateInput; extra?: Record<string, unknown> },
  ip: string | null | undefined,
): Promise<InvoiceResult> {
  return db.$transaction(async (tx) => {
    await lockInvoice(tx, id);
    const inv = await tx.supplierInvoice.findUnique({ where: { id } });
    if (!inv) throw new BusinessError("NOT_FOUND", "Facture introuvable.");
    await assertInvoiceInScope(tx, actor, id);
    if (!opts.from.includes(inv.status)) throw new BusinessError("INVALID_STATUS", opts.message);
    await tx.supplierInvoice.update({ where: { id }, data: { status: opts.to, ...opts.data } });
    await log(tx, { userId: actor.id, action: opts.action, entity: "SupplierInvoice", entityId: id, before: { status: inv.status }, after: { status: opts.to, number: inv.number, ...opts.extra }, ip });
    return { id, number: inv.number, status: opts.to as InvoiceStatusCode, closedOrders: [], reopenedOrders: [], lineMatches: [] };
  });
}

export async function markTransmitted(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<InvoiceResult> {
  requireAction(actor, "invoice.manage");
  const input = parseInput(invoiceIdSchema, raw);
  return simpleTransition(
    actor,
    input.id,
    { from: ["BON_A_PAYER"], to: "TRANSMISE", action: "INVOICE_TRANSMIT", message: "Seule une facture en bon à payer peut être transmise à la comptabilité.", data: { transmittedAt: at, transmittedById: actor.id } },
    ip,
  );
}

export async function markLitige(actor: OrderActor, raw: unknown, ip?: string | null): Promise<InvoiceResult> {
  requireAction(actor, "invoice.manage");
  const input = parseInput(litigeSchema, raw);
  return simpleTransition(
    actor,
    input.id,
    {
      from: ["SAISIE", "CONFORME", "ECART", "BON_A_PAYER"],
      to: "LITIGE",
      action: "INVOICE_LITIGE",
      message: "Cette facture ne peut plus être mise en litige (déjà transmise, annulée ou en litige).",
      data: { litigeReason: input.reason },
      extra: { reason: input.reason },
    },
    ip,
  );
}

/** Litige levé : retour en SAISIE puis nouveau rapprochement. */
export async function resolveLitige(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<InvoiceResult> {
  requireAction(actor, "invoice.manage");
  const input = parseInput(invoiceIdSchema, raw);
  const settings = await getSettings();
  return db.$transaction(async (tx) => {
    const inv = await lockedInvoice(tx, actor, input.id);
    if (inv.status !== "LITIGE") throw new BusinessError("INVALID_STATUS", "Cette facture n'est pas en litige.");
    const { status, matches } = await applyMatch(tx, inv.id, tolerancesOf(settings), at);
    await tx.supplierInvoice.update({ where: { id: inv.id }, data: { status, litigeReason: null, payApprovedAt: null, payApprovedById: null } });
    await log(tx, { userId: actor.id, action: "INVOICE_LITIGE_RESOLVE", entity: "SupplierInvoice", entityId: inv.id, before: { status: "LITIGE", reason: inv.litigeReason }, after: { status, matches }, ip });
    await notifyMatch(tx, actor, { id: inv.id, number: inv.number, supplierName: inv.supplier.name }, status);
    return { id: inv.id, number: inv.number, status, closedOrders: [], reopenedOrders: [], lineMatches: matches };
  });
}

/** Annulation (motif) par le Responsable ou le créateur, jamais après transmission. Libère les quantités facturées et rouvre un BC clôturé. */
export async function cancelInvoice(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<InvoiceResult> {
  requireAction(actor, "invoice.manage");
  const input = parseInput(cancelInvoiceSchema, raw);
  return db.$transaction(async (tx) => {
    const inv = await lockedInvoice(tx, actor, input.id);
    if (inv.status === "ANNULEE") throw new BusinessError("INVALID_STATUS", "Cette facture est déjà annulée.");
    if (inv.status === "TRANSMISE") throw new BusinessError("INVALID_STATUS", "Cette facture a été transmise à la comptabilité : elle ne peut plus être annulée.");
    if (!can(actor, "invoice.approvePayment") && inv.createdById !== actor.id) {
      throw new BusinessError("FORBIDDEN", "Seul le Responsable Achats ou l'auteur de la saisie peut annuler cette facture.");
    }
    await tx.supplierInvoice.update({
      where: { id: inv.id },
      data: {
        status: "ANNULEE",
        cancelledReason: input.reason,
        // Libère le couple fournisseur / n° pour une saisie corrigée ; le n° d'origine reste dans l'audit.
        supplierInvoiceNo: `${inv.supplierInvoiceNo}~ANN-${inv.number}`.slice(0, 100),
      },
    });
    await refreshInvoicedQty(tx, inv.lines.map((l) => l.orderLineId));
    const sync = await syncOrders(tx, inv.lines.map((l) => l.orderLine.orderId), actor, at, { allowReopen: true, ref: inv.number });
    await log(tx, {
      userId: actor.id,
      action: "INVOICE_CANCEL",
      entity: "SupplierInvoice",
      entityId: inv.id,
      before: { status: inv.status, supplierInvoiceNo: inv.supplierInvoiceNo },
      after: { status: "ANNULEE", number: inv.number, reason: input.reason, reopenedOrders: sync.reopened },
      ip,
    });
    return { id: inv.id, number: inv.number, status: "ANNULEE" as const, closedOrders: sync.closed, reopenedOrders: sync.reopened, lineMatches: [] };
  });
}
