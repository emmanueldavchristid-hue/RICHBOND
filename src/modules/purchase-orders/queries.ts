import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { now } from "@/lib/clock";
import { ageInDays, ageSeverity, type AgeSeverity } from "@/lib/dates";
import { BusinessError } from "@/lib/errors";
import { toFcfa } from "@/lib/money";
import { can, canViewOrder, requireAction } from "@/lib/permissions";
import { dayKey, isRateStale } from "@/modules/currencies/rate";
import { EXPORT_MAX_ROWS, toPage, type Page } from "@/modules/referentials/list-query";
import { serialize, type Serialized } from "@/modules/referentials/serialize";
import { buyerCoversType } from "@/modules/purchase-requests/assignment";
import { requestOrderQuantities } from "@/modules/purchase-requests/order-links";
import { parseInput } from "@/modules/purchase-requests/parse";
import { displayNumber } from "@/modules/purchase-requests/labels";
import { getSettings } from "@/modules/settings";
import { convertQty, isQtyOverWarning, qtyOverPct } from "./allocation";
import { latestRate, type OrderActor } from "./internal";
import { PO_LATE_STATUSES, displayOrderNumber, type PoStatus } from "./labels";
import { daysLate, isLate, needsReminder, REMINDABLE_STATUSES } from "./lateness";
import { lastPrices } from "./pricing";
import { checkPrice, priceAlertMessage } from "./price-check";
import { mailtoLink, reminderText, sendText, whatsappLink } from "./reminder-text";
import { checkOrderDuplicatesSchema, listOrdersSchema, orderIdSchema, priceCheckSchema, searchOrderableLinesSchema, type ListOrdersFilters, type ListOrdersInput } from "./schemas";
import { computeTotals } from "./totals";
import { alreadyOrderedWarnings } from "./warnings";
import { isSupplierEvaluationStale } from "./supplier-evaluation";
import { availableActions, isUnderApprovalThreshold } from "./workflow";
import { buildSnapshot, type OrderSnapshot } from "./snapshot";

const ONGOING: PoStatus[] = ["VALIDE", "ENVOYE", "CONFIRME", "PARTIELLEMENT_RECU"];
const OPEN_FOR_ORDER = ["VALIDEE", "EN_CONSULTATION", "PARTIELLEMENT_COMMANDEE"] as const;

type Where = Prisma.PurchaseOrderWhereInput;

/** Visibilité (D24) : les brouillons restent privés à leur créateur (un avenant en brouillon est aussi visible du Responsable). */
function visibilityWhere(user: OrderActor): Where {
  const hidden: Where = { status: "BROUILLON", createdById: { not: user.id } };
  if (user.role === "RESPONSABLE_ACHATS") hidden.version = { lte: 1 };
  return { NOT: hidden };
}

/** En retard : même règle que `isLate` (D19), exprimée en SQL. */
export function lateWhere(at: Date): Where {
  return { status: { in: [...PO_LATE_STATUSES] }, expectedDate: { lt: dayKey(at) } };
}

/** Filtre partagé par la liste, les compteurs et l'export. `remindIds` : identifiants « à relancer » déjà calculés. */
export function buildOrderWhere(user: OrderActor, f: ListOrdersFilters, at: Date, remindIds?: string[]): Where {
  const and: Where[] = [visibilityWhere(user)];
  switch (f.onglet) {
    case "a-valider":
      and.push({ status: "A_VALIDER" });
      break;
    case "en-cours":
      and.push({ status: { in: ONGOING } });
      break;
    case "en-retard":
      and.push(lateWhere(at));
      break;
    case "recus":
      and.push({ status: { in: ["RECU", "CLOTURE"] } });
      break;
    default:
      break;
  }
  if (f.statut) and.push({ status: f.statut });
  if (f.fournisseur) and.push({ supplierId: f.fournisseur });
  if (f.acheteur) and.push({ createdById: f.acheteur });
  if (f.type) and.push({ type: f.type });
  if (f.devise) and.push({ currencyCode: f.devise });
  if (f.relance) and.push({ id: { in: remindIds ?? [] } });
  if (f.q) {
    and.push({
      OR: [
        { number: { contains: f.q, mode: "insensitive" } },
        { supplier: { name: { contains: f.q, mode: "insensitive" } } },
        { supplier: { code: { contains: f.q, mode: "insensitive" } } },
        { supplierRef: { contains: f.q, mode: "insensitive" } },
        {
          lines: {
            some: {
              OR: [
                { freeDesignation: { contains: f.q, mode: "insensitive" } },
                { item: { code: { contains: f.q, mode: "insensitive" } } },
                { item: { name: { contains: f.q, mode: "insensitive" } } },
                { allocations: { some: { requestLine: { request: { number: { contains: f.q, mode: "insensitive" } } } } } },
              ],
            },
          },
        },
      ],
    });
  }
  return { AND: and };
}

export function buildOrderOrder(f: Pick<ListOrdersFilters, "tri" | "ordre" | "onglet">): Prisma.PurchaseOrderOrderByWithRelationInput[] {
  const order: Prisma.PurchaseOrderOrderByWithRelationInput[] = [];
  if (f.tri) {
    if (f.tri === "supplier") order.push({ supplier: { name: f.ordre } });
    else if (f.tri === "number") order.push({ number: { sort: f.ordre, nulls: "last" } });
    else if (f.tri === "totalTtcXof") order.push({ totalTtcXof: { sort: f.ordre, nulls: "last" } });
    else order.push({ [f.tri]: f.ordre });
  }
  if (f.onglet === "a-valider") order.push({ submittedAt: { sort: "asc", nulls: "last" } }, { id: "asc" });
  else if (f.onglet === "en-retard") order.push({ expectedDate: "asc" }, { id: "asc" });
  else order.push({ createdAt: "desc" }, { id: "asc" });
  return order;
}

/** Identifiants des BC « à relancer » (règle en jours ouvrés, calculée en code puis passée en filtre SQL). */
async function remindableIds(user: OrderActor, at: Date, afterDays: number): Promise<string[]> {
  const rows = await db.purchaseOrder.findMany({
    where: { AND: [visibilityWhere(user), { status: { in: [...REMINDABLE_STATUSES] } }] },
    select: { id: true, status: true, sentAt: true, lastRemindedAt: true, expectedDate: true },
  });
  return rows.filter((r) => needsReminder(r, at, afterDays)).map((r) => r.id);
}

export interface OrderRow {
  id: string;
  number: string | null;
  version: number;
  displayNumber: string;
  status: PoStatus;
  type: "LOCAL" | "IMPORT";
  origin: "DA" | "DIRECT" | "OFFRE";
  supplier: { id: string; code: string; name: string };
  currencyCode: string;
  totalTtc: Prisma.Decimal;
  totalTtcXof: number | null;
  requestedDate: Date;
  promisedDate: Date | null;
  expectedDate: Date;
  late: boolean;
  daysLate: number;
  needsReminder: boolean;
  /** Ancienneté utile : depuis la soumission (à valider) ou l'envoi (envoyé sans confirmation) ; null sinon. */
  ageDays: number | null;
  ageSeverity: AgeSeverity | null;
  createdBy: { id: string; name: string };
  lineCount: number;
  submittedAt: Date | null;
  sentAt: Date | null;
  lastRemindedAt: Date | null;
  reminderCount: number;
  amendment: boolean;
  updatedAt: Date;
}

export interface OrderCounts {
  aValider: number;
  enRetard: number;
  aRelancer: number;
}

export async function orderCounts(user: OrderActor, at: Date = now()): Promise<OrderCounts> {
  const settings = await getSettings();
  const base = visibilityWhere(user);
  const [aValider, enRetard, remind] = await Promise.all([
    db.purchaseOrder.count({ where: { AND: [base, { status: "A_VALIDER" }] } }),
    db.purchaseOrder.count({ where: { AND: [base, lateWhere(at)] } }),
    remindableIds(user, at, settings.purchaseOrderReminderAfterDays),
  ]);
  return { aValider, enRetard, aRelancer: remind.length };
}

export async function listOrders(
  user: OrderActor,
  raw: ListOrdersInput = {},
  at: Date = now(),
): Promise<Page<OrderRow> & { counts: OrderCounts }> {
  requireAction(user, "purchaseOrder.view");
  const f = parseInput(listOrdersSchema, raw);
  const settings = await getSettings();
  const remindIds = f.relance ? await remindableIds(user, at, settings.purchaseOrderReminderAfterDays) : undefined;
  const where = buildOrderWhere(user, f, at, remindIds);
  const [rows, total, counts] = await Promise.all([
    db.purchaseOrder.findMany({
      where,
      orderBy: buildOrderOrder(f),
      skip: (f.page - 1) * f.taille,
      take: f.taille,
      include: {
        supplier: { select: { id: true, code: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { lines: true } },
      },
    }),
    db.purchaseOrder.count({ where }),
    orderCounts(user, at),
  ]);
  const mapped: OrderRow[] = rows.map((r) => {
    const age = r.status === "A_VALIDER" ? r.submittedAt : r.status === "ENVOYE" ? r.sentAt : null;
    return {
      id: r.id,
      number: r.number,
      version: r.version,
      displayNumber: displayOrderNumber(r),
      status: r.status,
      type: r.type,
      origin: r.origin,
      supplier: r.supplier,
      currencyCode: r.currencyCode,
      totalTtc: r.totalTtc,
      totalTtcXof: r.totalTtcXof,
      requestedDate: r.requestedDate,
      promisedDate: r.promisedDate,
      expectedDate: r.expectedDate,
      late: isLate(r, at),
      daysLate: daysLate(r, at),
      needsReminder: needsReminder(r, at, settings.purchaseOrderReminderAfterDays),
      ageDays: age ? ageInDays(age, at) : null,
      ageSeverity: age ? ageSeverity(age, at) : null,
      createdBy: r.createdBy,
      lineCount: r._count.lines,
      submittedAt: r.submittedAt,
      sentAt: r.sentAt,
      lastRemindedAt: r.lastRemindedAt,
      reminderCount: r.reminderCount,
      amendment: r.version > 1,
      updatedAt: r.updatedAt,
    };
  });
  return { ...toPage(mapped, total, f), counts };
}

// ------------------------------------------------------------------ fiche

const DETAIL_INCLUDE = {
  supplier: { include: { contacts: { where: { active: true }, orderBy: [{ isPrimary: "desc" as const }, { name: "asc" as const }] } } },
  warehouse: { select: { id: true, code: true, name: true, address: true } },
  currency: { select: { code: true, name: true, decimals: true, symbol: true } },
  createdBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
  lines: {
    orderBy: { lineNo: "asc" as const },
    include: {
      item: { select: { id: true, code: true, name: true, purchaseUnit: true, stockUnit: true, conversionFactor: true } },
      allocations: { include: { requestLine: { select: { id: true, lineNo: true, unit: true, request: { select: { id: true, number: true, status: true } } } } } },
    },
  },
  charges: { orderBy: { id: "asc" as const } },
  events: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }], include: { user: { select: { id: true, name: true } } } },
  versions: { orderBy: { version: "asc" as const }, select: { version: true, approvedAt: true, approvedById: true } },
} satisfies Prisma.PurchaseOrderInclude;

export type AlertKind = "PRICE" | "QTY_OVER" | "RATE_STALE" | "RATE_MISSING" | "SUPPLIER_IN_EVALUATION" | "SUPPLIER_NOT_EVALUATED" | "SUPPLIER_BLOCKED" | "UNDER_THRESHOLD";

export interface OrderAlert {
  kind: AlertKind;
  message: string;
  lineNo?: number;
}

/** Fiche d'un BC pour son lecteur : données, droits d'action, alertes du validateur (D14, D8, D13, D15, D3). */
export async function getOrder(user: OrderActor, id: string, at: Date = now()) {
  requireAction(user, "purchaseOrder.view");
  const po = await db.purchaseOrder.findUnique({ where: { id }, include: DETAIL_INCLUDE });
  if (!po) throw new BusinessError("NOT_FOUND", "Bon de commande introuvable.");
  if (!canViewOrder(user, po)) throw new BusinessError("FORBIDDEN", "Vous n'avez pas accès à ce bon de commande.");
  const settings = await getSettings();
  const hasReceipts = po.lines.some((l) => l.receivedQty.gt(0));
  const actions = availableActions({ ...po, hasReceipts }, user);
  const totals = computeTotals(
    po.lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, discountPct: l.discountPct, vatRate: l.vatRate })),
    po.charges.map((c) => ({ amount: c.amount, vatRate: c.vatRate })),
    { currencyCode: po.currencyCode, decimals: po.currency.decimals, rate: po.exchangeRate },
  );

  // Alertes montrées au validateur (et au créateur) tant que le BC n'est pas validé.
  const alerts: OrderAlert[] = [];
  const last = await lastPrices(db, po.lines.flatMap((l) => (l.itemId ? [l.itemId] : [])));
  for (const l of po.lines) {
    if (l.priceDeltaPct && Math.abs(l.priceDeltaPct.toNumber()) > settings.purchaseOrderPriceAlertPct) {
      const info = l.itemId ? last.get(l.itemId) : undefined;
      alerts.push({
        kind: "PRICE",
        lineNo: l.lineNo,
        message: l.lastPriceXof !== null && info
          ? `Ligne ${l.lineNo} : ${priceAlertMessage(l.priceDeltaPct, { lastPriceXof: l.lastPriceXof, date: info.date instanceof Date ? info.date : new Date(info.date), supplierCode: info.supplierCode })}`
          : `Ligne ${l.lineNo} : écart de prix de ${l.priceDeltaPct.toString()} % par rapport au dernier prix.`,
      });
    }
    if (l.item && l.allocations.length > 0) {
      let sum = new Prisma.Decimal(0);
      for (const a of l.allocations) sum = sum.plus(convertQty(a.qty, a.requestLine.unit, l.unit, l.item));
      const pct = qtyOverPct(l.quantity, sum);
      if (isQtyOverWarning(pct)) alerts.push({ kind: "QTY_OVER", lineNo: l.lineNo, message: `Ligne ${l.lineNo} : quantité commandée +${pct!.toString().replace(".", ",")} % par rapport aux demandes d'achat.` });
    }
  }
  if (po.currencyCode !== "XOF" && !["VALIDE", "ENVOYE", "CONFIRME", "PARTIELLEMENT_RECU", "RECU", "CLOTURE"].includes(po.status)) {
    const found = await latestRate(db, po.currencyCode, at);
    if (!found) alerts.push({ kind: "RATE_MISSING", message: `Aucun taux ${po.currencyCode} connu : saisissez-le avant de valider.` });
    else if (isRateStale(found.date, at)) alerts.push({ kind: "RATE_STALE", message: `Le dernier taux ${po.currencyCode} date de plus de 30 jours.` });
  }
  if (po.supplier.status === "BLOQUE") alerts.push({ kind: "SUPPLIER_BLOCKED", message: `Le fournisseur « ${po.supplier.name} » est bloqué : le bon ne peut plus être soumis ni validé.` });
  if (po.supplier.status === "EN_EVALUATION") alerts.push({ kind: "SUPPLIER_IN_EVALUATION", message: `Le fournisseur « ${po.supplier.name} » est en évaluation.` });
  if ((await isSupplierEvaluationStale(db, po.supplierId, at)) === true) {
    alerts.push({ kind: "SUPPLIER_NOT_EVALUATED", message: "Fournisseur non évalué depuis 12 mois." });
  }
  if (po.status === "A_VALIDER" && isUnderApprovalThreshold(po.totalTtcXof, settings.purchaseOrderApprovalThreshold)) {
    alerts.push({ kind: "UNDER_THRESHOLD", message: "Montant sous le seuil de validation." });
  }

  const sourceMap = new Map<string, { id: string; number: string | null; displayNumber: string; status: string }>();
  for (const l of po.lines) {
    for (const a of l.allocations) {
      const r = a.requestLine.request;
      sourceMap.set(r.id, { id: r.id, number: r.number, displayNumber: displayNumber(r), status: r.status });
    }
  }
  const age = po.status === "A_VALIDER" ? po.submittedAt : po.status === "ENVOYE" ? po.sentAt : null;
  const { events, versions, lines, ...head } = po;
  return serialize({
    ...head,
    displayNumber: displayOrderNumber(po),
    amendment: po.version > 1,
    totals: {
      totalHt: totals.totalHt,
      totalVat: totals.totalVat,
      totalTtc: totals.totalTtc,
      chargesTotal: totals.chargesTotal,
      totalHtXof: totals.totalHtXof,
      totalTtcXof: totals.totalTtcXof,
      vat: totals.vat,
    },
    lines: lines.map((l) => ({
      ...l,
      remainingQty: Prisma.Decimal.max(l.quantity.minus(l.receivedQty), new Prisma.Decimal(0)),
      designation: l.item ? `${l.item.code} – ${l.item.name}` : (l.freeDesignation ?? ""),
      allocations: l.allocations.map((a) => ({
        id: a.id,
        requestLineId: a.requestLineId,
        requestId: a.requestLine.request.id,
        requestNumber: a.requestLine.request.number,
        requestLineNo: a.requestLine.lineNo,
        qty: a.qty,
        unit: a.requestLine.unit,
      })),
    })),
    events: events.map((e) => ({ ...e, user: e.user })),
    versions,
    sourceRequests: [...sourceMap.values()],
    alerts,
    actions,
    canEdit: actions.includes("edit"),
    hasReceipts,
    late: isLate(po, at),
    daysLate: daysLate(po, at),
    needsReminder: needsReminder(po, at, settings.purchaseOrderReminderAfterDays),
    ageDays: age ? ageInDays(age, at) : null,
    ageSeverity: age ? ageSeverity(age, at) : null,
    settings: { priceAlertPct: settings.purchaseOrderPriceAlertPct, approvalThreshold: settings.purchaseOrderApprovalThreshold, reminderAfterDays: settings.purchaseOrderReminderAfterDays },
  });
}

export type OrderDetail = Awaited<ReturnType<typeof getOrder>>;

// ------------------------------------------------------------------ « À commander » (D6)

export interface OrderableLine {
  requestLineId: string;
  requestId: string;
  requestNumber: string;
  urgency: "NORMALE" | "URGENTE" | "ARRET_PRODUCTION";
  neededBy: Date;
  itemId: string | null;
  itemCode: string | null;
  designation: string;
  /** Unité de la ligne de DA. */
  unit: string;
  purchaseUnit: string | null;
  need: Prisma.Decimal;
  reserved: Prisma.Decimal;
  /** Reste à commander, en unité de la ligne de DA. */
  remaining: Prisma.Decimal;
  /** Reste converti en unité d'achat (celle du BC). */
  remainingPurchaseQty: Prisma.Decimal | null;
  mainSupplier: { id: string; code: string; name: string; type: "LOCAL" | "IMPORT"; status: string } | null;
}

/** Lignes de DA restant à commander et visibles de l'utilisateur : siennes (acheteur) ou toutes (Responsable). */
async function orderableLines(user: OrderActor, opts: { q?: string; supplierId?: string | null; requestId?: string; limit?: number }): Promise<OrderableLine[]> {
  requireAction(user, "purchaseOrder.create");
  const q = opts.q?.trim();
  const rows = await db.purchaseRequestLine.findMany({
    where: {
      OR: [{ approvedQty: null }, { approvedQty: { gt: 0 } }],
      ...(opts.requestId ? { requestId: opts.requestId } : {}),
      request: {
        status: { in: [...OPEN_FOR_ORDER] },
        ...(user.role === "ACHETEUR" ? { OR: [{ assignedBuyerId: user.id }, { assignedBuyerId: null }] } : {}),
      },
      ...(opts.supplierId
        ? { item: { OR: [{ mainSupplierId: opts.supplierId }, { suppliers: { some: { supplierId: opts.supplierId, active: true } } }] } }
        : {}),
      ...(q
        ? {
            OR: [
              { item: { code: { contains: q, mode: "insensitive" } } },
              { item: { name: { contains: q, mode: "insensitive" } } },
              { freeDesignation: { contains: q, mode: "insensitive" } },
              { request: { number: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: {
      request: { select: { id: true, number: true, urgency: true, priority: true, neededBy: true, type: true, assignedBuyerId: true } },
      item: { include: { mainSupplier: { select: { id: true, code: true, name: true, type: true, status: true } } } },
    },
    orderBy: [{ request: { priority: "asc" } }, { request: { neededBy: "asc" } }, { id: "asc" }],
    take: Math.min((opts.limit ?? 500) * 3, 1500),
  });
  const quantities = await requestOrderQuantities(db, rows);
  const out: OrderableLine[] = [];
  for (const r of rows) {
    const t = r.request.type;
    if (user.role === "ACHETEUR" && !r.request.assignedBuyerId && (t === "A_DEFINIR" || !buyerCoversType(user.purchaseScope, t))) continue;
    const qn = quantities.get(r.id)!;
    if (qn.remainingQty.lte(0)) continue;
    const item = r.item;
    out.push({
      requestLineId: r.id,
      requestId: r.request.id,
      requestNumber: r.request.number ?? "",
      urgency: r.request.urgency,
      neededBy: r.request.neededBy,
      itemId: r.itemId,
      itemCode: item?.code ?? null,
      designation: item?.name ?? r.freeDesignation ?? "",
      unit: r.unit,
      purchaseUnit: item?.purchaseUnit ?? null,
      need: r.approvedQty ?? r.quantity,
      reserved: qn.reservedQty,
      remaining: qn.remainingQty,
      remainingPurchaseQty: item ? convertQty(qn.remainingQty, r.unit, item.purchaseUnit, item) : null,
      mainSupplier: item?.mainSupplier ?? null,
    });
  }
  return out.slice(0, opts.limit ?? 500);
}

export interface OrderableGroup {
  supplier: OrderableLine["mainSupplier"];
  lines: OrderableLine[];
}

/** Écran « À commander » : lignes à commander groupées par fournisseur principal de l'article, « sans fournisseur » à part (en dernier). */
export async function listOrderableLines(user: OrderActor): Promise<{ groups: Serialized<OrderableGroup>[] }> {
  const lines = await orderableLines(user, {});
  const groups = new Map<string, OrderableGroup>();
  for (const l of lines) {
    const key = l.mainSupplier?.id ?? "";
    const g = groups.get(key) ?? { supplier: l.mainSupplier, lines: [] };
    g.lines.push(l);
    groups.set(key, g);
  }
  const sorted = [...groups.values()].sort((a, b) => {
    if (!a.supplier) return 1;
    if (!b.supplier) return -1;
    return a.supplier.name.localeCompare(b.supplier.name, "fr");
  });
  return serialize({ groups: sorted }) as unknown as { groups: Serialized<OrderableGroup>[] };
}

/** Lignes restant à commander d'une seule DA (« Créer le BC » depuis la fiche DA), groupées par fournisseur principal. */
export async function listOrderableLinesOfRequest(user: OrderActor, requestId: string): Promise<{ groups: Serialized<OrderableGroup>[] }> {
  const lines = await orderableLines(user, { requestId });
  const groups = new Map<string, OrderableGroup>();
  for (const l of lines) {
    const key = l.mainSupplier?.id ?? "";
    const g = groups.get(key) ?? { supplier: l.mainSupplier, lines: [] };
    g.lines.push(l);
    groups.set(key, g);
  }
  const sorted = [...groups.values()].sort((a, b) => (!a.supplier ? 1 : !b.supplier ? -1 : a.supplier.name.localeCompare(b.supplier.name, "fr")));
  return serialize({ groups: sorted }) as unknown as { groups: Serialized<OrderableGroup>[] };
}

/** Recherche clavier d'une ligne à commander pour le formulaire (par article, désignation ou numéro de DA). */
export async function searchOrderableLines(user: OrderActor, raw: unknown) {
  const input = parseInput(searchOrderableLinesSchema, raw);
  return serialize(await orderableLines(user, { q: input.q, supplierId: input.supplierId, limit: input.limit }));
}

// ------------------------------------------------------------------ aides à la saisie (lectures)

/** Contrôle de prix en direct (D14) pour le formulaire : dernier prix connu et écart par article. */
export async function priceCheckLines(user: OrderActor, raw: unknown, at: Date = now()) {
  requireAction(user, "purchaseOrder.view");
  const input = parseInput(priceCheckSchema, raw);
  const settings = await getSettings();
  const items = await db.item.findMany({ where: { id: { in: input.lines.map((l) => l.itemId) } }, select: { id: true, purchaseUnit: true } });
  const units = new Map(items.map((i) => [i.id, i.purchaseUnit]));
  const rate = input.currencyCode === "XOF" ? null : ((await latestRate(db, input.currencyCode, at))?.rate ?? null);
  const last = await lastPrices(db, input.lines.map((l) => l.itemId));
  return serialize(
    input.lines.map((l) => {
      const info = last.get(l.itemId) ?? null;
      const res = checkPrice({ unitPrice: l.unitPrice, discountPct: l.discountPct, currencyCode: input.currencyCode, rate, unit: units.get(l.itemId) ?? "", last: info, thresholdPct: settings.purchaseOrderPriceAlertPct });
      return {
        itemId: l.itemId,
        lastPriceXof: res.lastPriceXof,
        lastPriceDate: info ? new Date(info.date) : null,
        lastSupplierCode: info?.supplierCode ?? null,
        deltaPct: res.deltaPct,
        alert: res.alert,
        message: res.alert && res.deltaPct && res.lastPriceXof !== null && info ? priceAlertMessage(res.deltaPct, { lastPriceXof: res.lastPriceXof, date: new Date(info.date), supplierCode: info.supplierCode }) : null,
      };
    }),
  );
}

/** « Déjà commandé : BC-…, 40 U attendues le 12/11 » pour la saisie d'un BC (jamais de prix ni de fournisseur). */
export async function checkOrderDuplicates(user: OrderActor, raw: unknown) {
  requireAction(user, "purchaseOrder.view");
  const input = parseInput(checkOrderDuplicatesSchema, raw);
  return alreadyOrderedWarnings(db, input.itemIds, input.excludeId);
}

/** Texte de relance prêt à copier + liens WhatsApp / e-mail (D20). */
export async function getReminderText(user: OrderActor, raw: unknown, at: Date = now()) {
  requireAction(user, "purchaseOrder.view");
  const { id } = parseInput(orderIdSchema, raw);
  const po = await db.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: { include: { contacts: { where: { active: true }, orderBy: [{ isPrimary: "desc" }, { name: "asc" }] } } },
      lines: { orderBy: { lineNo: "asc" }, include: { item: { select: { code: true, name: true } } } },
    },
  });
  if (!po) throw new BusinessError("NOT_FOUND", "Bon de commande introuvable.");
  if (!canViewOrder(user, po)) throw new BusinessError("FORBIDDEN", "Vous n'avez pas accès à ce bon de commande.");
  const settings = await getSettings();
  const buyer = await db.user.findUnique({ where: { id: user.id }, select: { name: true } });
  const contact = po.supplier.contacts[0] ?? null;
  const label = displayOrderNumber(po);
  const text = reminderText({
    orderNumber: label,
    orderDate: po.approvedAt ?? po.createdAt,
    contactName: contact?.name ?? null,
    expectedDate: po.expectedDate,
    daysLate: daysLate(po, at),
    lines: po.lines.map((l) => ({
      designation: l.item ? `${l.item.code} – ${l.item.name}` : (l.freeDesignation ?? ""),
      remainingQty: l.quantity.minus(l.receivedQty).toString(),
      unit: l.unit,
    })),
    buyerName: buyer?.name ?? "",
    companyName: settings.company.name,
  });
  const phone = contact?.phone ?? po.supplier.phone;
  return {
    text,
    subject: `Relance bon de commande ${label}`,
    contact: contact ? { name: contact.name, phone: contact.phone, email: contact.email } : null,
    whatsappLink: whatsappLink(phone, text),
    mailtoLink: mailtoLink(contact?.email ?? po.supplier.email, `Relance bon de commande ${label}`, text),
  };
}

/** Texte d'accompagnement de l'envoi du PDF (copiable) + liens e-mail et WhatsApp (D17). */
export async function getSendText(user: OrderActor, raw: unknown) {
  requireAction(user, "purchaseOrder.view");
  const { id } = parseInput(orderIdSchema, raw);
  const po = await db.purchaseOrder.findUnique({
    where: { id },
    include: { supplier: { include: { contacts: { where: { active: true }, orderBy: [{ isPrimary: "desc" }, { name: "asc" }] } } } },
  });
  if (!po) throw new BusinessError("NOT_FOUND", "Bon de commande introuvable.");
  if (!canViewOrder(user, po)) throw new BusinessError("FORBIDDEN", "Vous n'avez pas accès à ce bon de commande.");
  const settings = await getSettings();
  const buyer = await db.user.findUnique({ where: { id: user.id }, select: { name: true } });
  const contact = po.supplier.contacts[0] ?? null;
  const label = displayOrderNumber(po);
  const text = sendText({ orderNumber: label, contactName: contact?.name ?? null, requestedDate: po.requestedDate, buyerName: buyer?.name ?? "", companyName: settings.company.name });
  const subject = `Bon de commande ${label}`;
  return {
    text,
    subject,
    contact: contact ? { name: contact.name, phone: contact.phone, email: contact.email } : null,
    whatsappLink: whatsappLink(contact?.phone ?? po.supplier.phone, text),
    mailtoLink: mailtoLink(contact?.email ?? po.supplier.email, subject, text),
  };
}

// ------------------------------------------------------------------ export

/** Export : une ligne par ligne de BC ; mêmes filtres que la liste ; plafonné (EXPORT_MAX_ROWS). */
export async function exportOrders(user: OrderActor, raw: ListOrdersInput = {}, at: Date = now()) {
  requireAction(user, "purchaseOrder.view");
  const f = parseInput(listOrdersSchema, raw);
  const settings = await getSettings();
  const remindIds = f.relance ? await remindableIds(user, at, settings.purchaseOrderReminderAfterDays) : undefined;
  const where = buildOrderWhere(user, f, at, remindIds);
  const total = await db.purchaseOrderLine.count({ where: { order: where } });
  if (total > EXPORT_MAX_ROWS) {
    throw new BusinessError("EXPORT_TOO_LARGE", `Trop de lignes (${total}) : affinez les filtres (maximum ${EXPORT_MAX_ROWS}).`);
  }
  const orders = await db.purchaseOrder.findMany({
    where,
    orderBy: buildOrderOrder(f),
    include: {
      supplier: { select: { code: true, name: true } },
      createdBy: { select: { name: true } },
      currency: { select: { decimals: true } },
      lines: { orderBy: { lineNo: "asc" }, include: { item: { select: { code: true, name: true } } } },
    },
  });
  return orders.flatMap((po) =>
    po.lines.map((l) => ({
      number: displayOrderNumber(po),
      version: po.version,
      status: po.status,
      type: po.type,
      supplierCode: po.supplier.code,
      supplier: po.supplier.name,
      createdBy: po.createdBy.name,
      lineNo: l.lineNo,
      itemCode: l.item?.code ?? null,
      designation: l.item?.name ?? l.freeDesignation ?? "",
      quantity: Number(l.quantity),
      receivedQty: Number(l.receivedQty),
      remainingQty: Math.max(Number(l.quantity.minus(l.receivedQty)), 0),
      unit: l.unit,
      unitPrice: Number(l.unitPrice),
      discountPct: Number(l.discountPct),
      currency: po.currencyCode,
      netAmount: Number(l.netAmount),
      netAmountXof: po.currencyCode === "XOF" ? Number(l.netAmount) : po.exchangeRate ? toFcfa(l.netAmount.toFixed(2), po.exchangeRate.toFixed(6)) : null,
      totalTtcXof: po.totalTtcXof,
      requestedDate: po.requestedDate,
      promisedDate: po.promisedDate,
      expectedDate: po.expectedDate,
      daysLate: daysLate(po, at),
    })),
  );
}

// ------------------------------------------------------------------ accueil

export interface HomeOrderSummary {
  /** BC en attente de validation (Responsable). */
  toValidate: number;
  /** BC en retard (Responsable : tous ; Acheteur : les siens). */
  late: number;
  /** BC à relancer (Responsable : tous ; Acheteur : les siens). */
  toRemind: number;
}

export async function homeOrderSummary(user: OrderActor, at: Date = now()): Promise<HomeOrderSummary> {
  if (!can(user, "purchaseOrder.view") || user.role === "MAGASINIER") return { toValidate: 0, late: 0, toRemind: 0 };
  const mine: Where = user.role === "ACHETEUR" ? { createdById: user.id } : {};
  const settings = await getSettings();
  const [toValidate, late, remindable] = await Promise.all([
    user.role === "RESPONSABLE_ACHATS" ? db.purchaseOrder.count({ where: { status: "A_VALIDER" } }) : Promise.resolve(0),
    db.purchaseOrder.count({ where: { AND: [visibilityWhere(user), mine, lateWhere(at)] } }),
    db.purchaseOrder.findMany({
      where: { AND: [visibilityWhere(user), mine, { status: { in: [...REMINDABLE_STATUSES] } }] },
      select: { status: true, sentAt: true, lastRemindedAt: true, expectedDate: true },
    }),
  ]);
  return { toValidate, late, toRemind: remindable.filter((r) => needsReminder(r, at, settings.purchaseOrderReminderAfterDays)).length };
}

// ------------------------------------------------------------------ PDF

export interface OrderPdfSource {
  snapshot: OrderSnapshot;
  /** Aperçu d'un brouillon / d'un BC à valider : filigrane « NON VALIDÉ – NE PAS ENVOYER ». */
  preview: boolean;
  fileName: string;
}

/**
 * Données du PDF : sans `version`, la version courante (aperçu filigrané tant que le BC n'est pas validé) ;
 * avec `version`, l'instantané de cette version validée.
 */
export async function getOrderPdfSource(user: OrderActor, id: string, version?: number): Promise<OrderPdfSource> {
  requireAction(user, "purchaseOrder.view");
  const po = await db.purchaseOrder.findUnique({ where: { id }, select: { id: true, number: true, version: true, status: true, createdById: true, type: true } });
  if (!po) throw new BusinessError("NOT_FOUND", "Bon de commande introuvable.");
  if (!canViewOrder(user, po)) throw new BusinessError("FORBIDDEN", "Vous n'avez pas accès à ce bon de commande.");
  const pending = po.status === "BROUILLON" || po.status === "A_VALIDER";
  if (version === undefined && pending) {
    // Aperçu de l'état courant (jamais de numéro avant validation).
    const full = await db.purchaseOrder.findUniqueOrThrow({
      where: { id },
      include: {
        lines: { orderBy: { lineNo: "asc" }, include: { allocations: true, item: true } },
        charges: { orderBy: { id: "asc" } },
        supplier: { include: { contacts: { where: { active: true }, orderBy: [{ isPrimary: "desc" }, { name: "asc" }] } } },
        warehouse: true,
        currency: true,
        createdBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
      },
    });
    return { snapshot: buildSnapshot(full, null), preview: true, fileName: `BC-brouillon-${po.id.slice(-6).toUpperCase()}-apercu.pdf` };
  }
  const v = version ?? po.version;
  const row = await db.purchaseOrderVersion.findUnique({ where: { orderId_version: { orderId: id, version: v } } });
  if (!row) throw new BusinessError("NOT_FOUND", "Cette version du bon de commande n'existe pas.");
  const snapshot = row.snapshot as unknown as OrderSnapshot;
  return { snapshot, preview: false, fileName: `${po.number ?? snapshot.number ?? "BC"}-v${v}.pdf` };
}
