import "server-only";
import { db } from "@/lib/db";
import { now as clockNow } from "@/lib/clock";
import { ageInDays, diffDays, todayAbidjan } from "@/lib/dates";
import { BusinessError } from "@/lib/errors";
import { can, type PermissionUser } from "@/lib/permissions";
import { displayOrderNumber, type PoStatus } from "@/modules/purchase-orders/labels";
import { daysLate as orderDaysLate, needsReminder } from "@/modules/purchase-orders/lateness";
import { getSettings } from "@/modules/settings";
import { FORECAST_ITEM_SELECT, buildForecast, loadStats } from "@/modules/stock/stats";
import { addDaysIso } from "@/modules/stock/forecast";
import { average, cardTone, onTimeRate, previousStockValue, sharePct, variationPct } from "./kpi";
import { lastTwelveMonths, monthComparison, monthLabel, twelveMonthsPeriod, weekBounds } from "./period";
import {
  belowReorderCandidates,
  countOrdersLate,
  expectedDeliveries,
  movementsValueSince,
  orderedInPeriod,
  orderToReceiptDelay,
  purchasesByMonthAndType,
  receiptsOnTime,
  reminderCandidates,
  requestToOrderDelay,
  stockoutsInPeriod,
  stockValueByCategory,
  stockValueNow,
  topSuppliers,
  type ExpectedOrderRow,
} from "./queries";
import {
  DASHBOARD_LIST_LIMIT,
  DASHBOARD_RISK_LIMIT,
  type ActionCard,
  type BelowReorderRow,
  type BuyerDashboard,
  type BuyerOrderRow,
  type BuyerRequestRow,
  type DashboardData,
  type ExpectedDeliveryRow,
  type GoodDirection,
  type KpiCard,
  type KpiUnit,
  type ResponsibleDashboard,
  type RuptureRiskRow,
  type StorekeeperDashboard,
} from "./types";

export interface DashboardUser extends PermissionUser {
  id: string;
}

const DAY_MS = 86_400_000;
const CATEGORY_LABELS: Record<string, string> = {
  MATIERE_PREMIERE: "Matières premières",
  INTRANT: "Intrants",
  PDR: "Pièces de rechange",
  FOURNITURE: "Fournitures",
  SERVICE: "Services",
};
const OPEN_FOR_BUYER = ["VALIDEE", "EN_CONSULTATION", "PARTIELLEMENT_COMMANDEE"] as const;
const SEVERITY_RANK = { ROUGE: 0, ORANGE: 1, VERT: 2 } as const;

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

function kpi(
  key: string,
  label: string,
  unit: KpiUnit,
  value: number | null,
  previous: number | null,
  goodDirection: GoodDirection,
  extra: { href?: string; help?: string } = {},
): KpiCard {
  return { key, label, unit, value, previous, variationPct: variationPct(value, previous), goodDirection, ...extra };
}

// ------------------------------------------------------------------ risques de rupture (T4)

/** Articles classe A ou CRITIQUE dont la rupture prévue précède la prochaine livraison : même prévision que `/stock/reappro`. */
export async function ruptureRisks(at: Date): Promise<{ total: number; rows: RuptureRiskRow[] }> {
  const settings = await getSettings();
  const items = await db.item.findMany({
    where: { stocked: true, status: "ACTIF", OR: [{ abcClass: "A" }, { criticality: "CRITIQUE" }] },
    select: FORECAST_ITEM_SELECT,
  });
  if (items.length === 0) return { total: 0, rows: [] };
  const stats = await loadStats(db, { itemIds: items.map((i) => i.id), at, settings });
  const today = todayAbidjan(at);
  const risky: RuptureRiskRow[] = [];
  for (const item of items) {
    const fc = buildForecast(item, stats.get(item.id), settings, today);
    if (!fc.ruptureBeforeDelivery) continue;
    // Couverture confortable (sévérité VERT) : du bruit, pas un risque à afficher.
    if (fc.severity === "VERT") continue;
    risky.push({
      itemId: item.id,
      code: item.code,
      name: item.name,
      abcClass: (item.abcClass as "A" | "B" | "C" | null) ?? null,
      criticality: item.criticality,
      stockUnit: item.stockUnit,
      onHand: fc.onHand,
      coverageDays: fc.coverageDays,
      stockoutDate: fc.stockoutDate,
      nextDeliveryDate: fc.nextDeliveryDate,
      severity: fc.severity,
      href: `/stock/articles/${item.id}`,
    });
  }
  risky.sort((a, b) => (a.stockoutDate ?? "9999").localeCompare(b.stockoutDate ?? "9999") || a.code.localeCompare(b.code));
  return { total: risky.length, rows: risky.slice(0, DASHBOARD_RISK_LIMIT) };
}

// ------------------------------------------------------------------ Responsable Achats

export async function responsibleDashboard(at: Date = clockNow()): Promise<ResponsibleDashboard> {
  const cmp = monthComparison(at);
  const twelve = twelveMonthsPeriod(at);
  const today = todayAbidjan(at);

  const [
    toValidateDa,
    stopsDa,
    toValidateBc,
    lateBc,
    openNc,
    risks,
    ordCur,
    ordPrev,
    daCur,
    daPrev,
    recCur,
    recPrev,
    onTimeCur,
    onTimePrev,
    stockNow,
    movedSince,
    outCur,
    outPrev,
    byMonthType,
    top,
    byCategory,
  ] = await Promise.all([
    db.purchaseRequest.count({ where: { status: "SOUMISE" } }),
    db.purchaseRequest.count({ where: { status: "SOUMISE", priority: 0 } }),
    db.purchaseOrder.count({ where: { status: "A_VALIDER" } }),
    countOrdersLate(today),
    db.nonConformity.count({ where: { status: "OUVERTE" } }),
    ruptureRisks(at),
    orderedInPeriod(cmp.current),
    orderedInPeriod(cmp.previous),
    requestToOrderDelay(cmp.current),
    requestToOrderDelay(cmp.previous),
    orderToReceiptDelay(cmp.current),
    orderToReceiptDelay(cmp.previous),
    receiptsOnTime(cmp.current),
    receiptsOnTime(cmp.previous),
    stockValueNow(),
    movementsValueSince(cmp.current.start),
    stockoutsInPeriod(cmp.current),
    stockoutsInPeriod(cmp.previous),
    purchasesByMonthAndType(twelve),
    topSuppliers(twelve, 10),
    stockValueByCategory(),
  ]);

  const cards: ActionCard[] = [
    {
      key: "da-a-valider",
      label: "DA à valider",
      count: toValidateDa,
      href: "/achats/demandes?onglet=a-valider",
      tone: cardTone(toValidateDa, "attention"),
      hint: stopsDa > 0 ? `dont ${stopsDa} ${plural(stopsDa, "arrêt", "arrêts")} de production` : undefined,
    },
    { key: "bc-a-valider", label: "BC à valider", count: toValidateBc, href: "/achats/commandes?onglet=a-valider", tone: cardTone(toValidateBc, "attention") },
    { key: "bc-en-retard", label: "BC en retard", count: lateBc, href: "/achats/commandes?onglet=en-retard", tone: cardTone(lateBc, "critical") },
    { key: "risques-rupture", label: "Articles critiques en risque de rupture", count: risks.total, href: "/stock/reappro", tone: cardTone(risks.total, "critical") },
    { key: "nc-ouvertes", label: "Non-conformités ouvertes", count: openNc, href: "/stock/receptions/non-conformites", tone: cardTone(openNc, "attention") },
  ];

  const stockPrev = previousStockValue(stockNow, movedSince);
  const kpis: KpiCard[] = [
    kpi("montant-commande", "Montant commandé", "FCFA", ordCur.sum, ordPrev.sum, "NONE", {
      href: "/achats/commandes?onglet=en-cours",
      help: "Total HT des BC validés ce mois, comparé au mois précédent à la même date.",
    }),
    kpi("nombre-bc", "Nombre de BC", "COUNT", ordCur.count, ordPrev.count, "NONE", { href: "/achats/commandes", help: "BC validés ce mois." }),
    kpi("delai-da-bc", "Délai DA → BC", "DAYS", average(daCur.sum, daCur.count), average(daPrev.sum, daPrev.count), "DOWN", {
      help: "Jours entre la validation de la DA et la validation du BC (moyenne).",
    }),
    kpi("delai-bc-reception", "Délai BC → réception", "DAYS", average(recCur.sum, recCur.count), average(recPrev.sum, recPrev.count), "DOWN", {
      help: "Jours entre la validation du BC et sa première réception (moyenne).",
    }),
    kpi("taux-a-temps", "Livraisons à temps", "PERCENT", onTimeRate(onTimeCur.onTime, onTimeCur.total), onTimeRate(onTimePrev.onTime, onTimePrev.total), "UP", {
      href: "/stock/receptions?onglet=recentes",
      help: "Part des réceptions du mois livrées à la date prévue ou avant.",
    }),
    kpi("valeur-stock", "Valeur du stock", "FCFA", stockNow, stockPrev, "NONE", {
      href: "/stock",
      help: "Quantité × PMP de tous les dépôts, comparée à la fin du mois précédent.",
    }),
    kpi("ruptures", "Ruptures", "COUNT", outCur, outPrev, "DOWN", {
      href: "/stock?situation=RUPTURE",
      help: "Articles dont une sortie du mois a laissé le stock à zéro.",
    }),
  ];

  const months = lastTwelveMonths(at);
  const purchasesByMonth = months.map((month) => {
    const local = byMonthType.filter((r) => r.month === month && r.type === "LOCAL").reduce((s, r) => s + r.amount, 0);
    const imp = byMonthType.filter((r) => r.month === month && r.type === "IMPORT").reduce((s, r) => s + r.amount, 0);
    return { month, label: monthLabel(month), localXof: local, importXof: imp, totalXof: local + imp };
  });
  const total12 = purchasesByMonth.reduce((s, m) => s + m.totalXof, 0);
  const stockTotal = byCategory.reduce((s, c) => s + c.value, 0);

  return {
    kind: "RESPONSABLE",
    generatedAt: at.toISOString(),
    month: cmp.month,
    previousMonth: cmp.previousMonth,
    comparedUntil: cmp.comparedUntil,
    cards,
    kpis,
    purchasesByMonth,
    topSuppliers: top.map((t) => ({
      supplierId: t.supplierId,
      name: t.name,
      amountXof: t.amount,
      sharePct: sharePct(t.amount, total12),
      href: `/achats/commandes?fournisseur=${t.supplierId}`,
    })),
    stockByCategory: byCategory
      .sort((a, b) => b.value - a.value)
      .map((c) => ({ category: c.category, label: CATEGORY_LABELS[c.category] ?? c.category, valueXof: c.value, sharePct: sharePct(c.value, stockTotal) })),
    ruptureRisks: risks,
  };
}

// ------------------------------------------------------------------ Acheteur

type OrderFields = {
  id: string;
  number: string | null;
  version: number;
  status: string;
  type: "LOCAL" | "IMPORT";
  supplierName: string;
  sentAt: Date | null;
  lastRemindedAt: Date | null;
  expectedDate: Date;
  totalXof: number | null;
  updatedAt: Date;
};

function buyerOrderRow(o: OrderFields, at: Date, reminderDays: number): BuyerOrderRow {
  const status = o.status as PoStatus;
  const displayNumber = displayOrderNumber(o);
  return {
    id: o.id,
    number: o.number ?? displayNumber,
    displayNumber,
    updatedAt: o.updatedAt.toISOString(),
    status,
    type: o.type,
    supplierName: o.supplierName,
    expectedDate: o.expectedDate.toISOString().slice(0, 10),
    daysLate: orderDaysLate({ status, expectedDate: o.expectedDate }, at),
    totalXof: o.totalXof,
    needsReminder: needsReminder({ status, sentAt: o.sentAt, lastRemindedAt: o.lastRemindedAt, expectedDate: o.expectedDate }, at, reminderDays),
    lastRemindedAt: o.lastRemindedAt ? o.lastRemindedAt.toISOString() : null,
    href: `/achats/commandes/${o.id}`,
  };
}

const ORDER_SELECT = {
  id: true,
  number: true,
  version: true,
  status: true,
  type: true,
  sentAt: true,
  lastRemindedAt: true,
  expectedDate: true,
  totalHtXof: true,
  updatedAt: true,
  supplier: { select: { name: true } },
} as const;

type OrderRecord = {
  id: string;
  number: string | null;
  version: number;
  status: string;
  type: "LOCAL" | "IMPORT";
  sentAt: Date | null;
  lastRemindedAt: Date | null;
  expectedDate: Date;
  totalHtXof: number | null;
  updatedAt: Date;
  supplier: { name: string };
};

const fromRecord = (o: OrderRecord): OrderFields => ({
  id: o.id,
  number: o.number,
  version: o.version,
  status: o.status,
  type: o.type,
  supplierName: o.supplier.name,
  sentAt: o.sentAt,
  lastRemindedAt: o.lastRemindedAt,
  expectedDate: o.expectedDate,
  totalXof: o.totalHtXof,
  updatedAt: o.updatedAt,
});

/** Acheteur : uniquement SES DA assignées et SES BC (créés par lui). */
export async function buyerDashboard(user: DashboardUser, at: Date = clockNow()): Promise<BuyerDashboard> {
  const today = todayAbidjan(at);
  const settings = await getSettings();
  const reminderDays = settings.purchaseOrderReminderAfterDays;
  const myOrders = { createdById: user.id };
  const lateWhere = { ...myOrders, status: { in: ["VALIDE", "ENVOYE", "CONFIRME", "PARTIELLEMENT_RECU"] as PoStatus[] }, expectedDate: { lt: new Date(`${today}T00:00:00.000Z`) } };

  const [reqTotal, reqRows, toSendTotal, toSendRows, lateTotal, lateRows, remindCandidates] = await Promise.all([
    db.purchaseRequest.count({ where: { assignedBuyerId: user.id, status: { in: [...OPEN_FOR_BUYER] } } }),
    db.purchaseRequest.findMany({
      where: { assignedBuyerId: user.id, status: { in: [...OPEN_FOR_BUYER] } },
      orderBy: [{ priority: "asc" }, { neededBy: "asc" }, { id: "asc" }],
      take: DASHBOARD_LIST_LIMIT,
      select: {
        id: true,
        number: true,
        urgency: true,
        requesterName: true,
        neededBy: true,
        approvedAt: true,
        estimatedTotal: true,
        department: { select: { name: true } },
      },
    }),
    db.purchaseOrder.count({ where: { ...myOrders, status: "VALIDE" } }),
    db.purchaseOrder.findMany({ where: { ...myOrders, status: "VALIDE" }, orderBy: [{ expectedDate: "asc" }, { id: "asc" }], take: DASHBOARD_LIST_LIMIT, select: ORDER_SELECT }),
    countOrdersLate(today, user.id),
    db.purchaseOrder.findMany({ where: lateWhere, orderBy: [{ expectedDate: "asc" }, { id: "asc" }], take: DASHBOARD_LIST_LIMIT, select: ORDER_SELECT }),
    reminderCandidates(user.id, today, reminderDays),
  ]);

  const toRemind = remindCandidates
    .map((c) =>
      buyerOrderRow(
        {
          id: c.id,
          number: c.number,
          version: c.version,
          status: c.status,
          type: c.type,
          supplierName: c.supplier_name,
          sentAt: c.sent_at,
          lastRemindedAt: c.last_reminded_at,
          expectedDate: c.expected_date,
          totalXof: c.total_ht_xof,
          updatedAt: c.updated_at,
        },
        at,
        reminderDays,
      ),
    )
    .filter((r) => r.needsReminder);

  const myRequests: BuyerRequestRow[] = reqRows.map((r) => ({
    id: r.id,
    number: r.number ?? "",
    urgency: r.urgency,
    departmentName: r.department.name,
    requesterName: r.requesterName,
    neededBy: r.neededBy.toISOString().slice(0, 10),
    ageDays: r.approvedAt ? ageInDays(r.approvedAt, at) : 0,
    estimatedTotal: r.estimatedTotal,
    href: `/achats/demandes/${r.id}`,
  }));

  const mine = `acheteur=${user.id}`;
  const cards: ActionCard[] = [
    { key: "mes-da", label: plural(reqTotal, "DA assignée à traiter", "DA assignées à traiter"), count: reqTotal, href: "/achats/demandes?onglet=assignees", tone: cardTone(reqTotal, "attention") },
    { key: "mes-bc-a-envoyer", label: "BC à envoyer", count: toSendTotal, href: `/achats/commandes?onglet=en-cours&statut=VALIDE&${mine}`, tone: cardTone(toSendTotal, "attention") },
    { key: "mes-bc-en-retard", label: "BC en retard", count: lateTotal, href: `/achats/commandes?onglet=en-retard&${mine}`, tone: cardTone(lateTotal, "critical") },
    { key: "mes-bc-a-relancer", label: "BC à relancer", count: toRemind.length, href: `/achats/commandes?onglet=en-cours&relance=1&${mine}`, tone: cardTone(toRemind.length, "attention") },
  ];

  return {
    kind: "ACHETEUR",
    generatedAt: at.toISOString(),
    cards,
    myRequests: { total: reqTotal, rows: myRequests },
    ordersToSend: { total: toSendTotal, rows: toSendRows.map((o) => buyerOrderRow(fromRecord(o as OrderRecord), at, reminderDays)) },
    lateOrders: { total: lateTotal, rows: lateRows.map((o) => buyerOrderRow(fromRecord(o as OrderRecord), at, reminderDays)) },
    ordersToRemind: { total: toRemind.length, rows: toRemind.slice(0, DASHBOARD_LIST_LIMIT) },
  };
}

// ------------------------------------------------------------------ Magasinier (aucun montant)

function deliveryRow(r: ExpectedOrderRow, at: Date): ExpectedDeliveryRow {
  return {
    orderId: r.id,
    number: displayOrderNumber({ id: r.id, number: r.number, version: r.version }),
    supplierName: r.supplierName,
    expectedDate: r.expectedDate,
    daysLate: Math.max(0, diffDays(r.expectedDate, at)),
    lineCount: r.openLines,
    href: `/stock/receptions/nouvelle?bc=${r.id}`,
  };
}

export async function belowReorderItems(at: Date): Promise<{ total: number; rows: BelowReorderRow[] }> {
  const settings = await getSettings();
  const windowStart = new Date(at.getTime() - settings.stockConsumptionWindowDays * DAY_MS);
  const ids = await belowReorderCandidates(windowStart);
  if (ids.length === 0) return { total: 0, rows: [] };
  const items = await db.item.findMany({ where: { id: { in: ids } }, select: FORECAST_ITEM_SELECT });
  const stats = await loadStats(db, { itemIds: ids, at, settings });
  const today = todayAbidjan(at);
  const rows: (BelowReorderRow & { sort: number })[] = [];
  for (const item of items) {
    const fc = buildForecast(item, stats.get(item.id), settings, today);
    if (!fc.belowReorderPoint) continue;
    rows.push({
      itemId: item.id,
      code: item.code,
      name: item.name,
      stockUnit: item.stockUnit,
      onHand: fc.onHand,
      onOrder: fc.onOrder,
      reorderPoint: Number(fc.reorderPoint) > 0 ? fc.reorderPoint : null,
      coverageDays: fc.coverageDays,
      severity: fc.severity,
      href: `/stock/articles/${item.id}`,
      sort: fc.severity ? SEVERITY_RANK[fc.severity] : 3,
    });
  }
  rows.sort((a, b) => a.sort - b.sort || (a.coverageDays ?? 9999) - (b.coverageDays ?? 9999) || a.code.localeCompare(b.code));
  return { total: rows.length, rows: rows.slice(0, DASHBOARD_LIST_LIMIT).map((r) => ({ itemId: r.itemId, code: r.code, name: r.name, stockUnit: r.stockUnit, onHand: r.onHand, onOrder: r.onOrder, reorderPoint: r.reorderPoint, coverageDays: r.coverageDays, severity: r.severity, href: r.href })) };
}

/** Magasinier : AUCUN champ monétaire (ni valeur, ni PMP, ni prix) dans la réponse. */
export async function storekeeperDashboard(_user: DashboardUser, at: Date = clockNow()): Promise<StorekeeperDashboard> {
  const today = todayAbidjan(at);
  const { sunday } = weekBounds(at);
  const weekEnd = addDaysIso(today, 7) > sunday ? addDaysIso(today, 7) : sunday;
  const [late, todayDeliveries, week, below, issues] = await Promise.all([
    expectedDeliveries(null, addDaysIso(today, -1), 0),
    expectedDeliveries(today, today, DASHBOARD_LIST_LIMIT),
    expectedDeliveries(addDaysIso(today, 1), weekEnd, DASHBOARD_LIST_LIMIT),
    belowReorderItems(at),
    db.stockIssue.findMany({
      where: { status: "VALIDEE" },
      orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
      take: 10,
      select: { id: true, number: true, issuedAt: true, requesterName: true, department: { select: { name: true } }, _count: { select: { lines: true } } },
    }),
  ]);

  const cards: ActionCard[] = [
    { key: "livraisons-aujourdhui", label: "Réceptions attendues aujourd'hui", count: todayDeliveries.total, href: "/stock/receptions", tone: cardTone(todayDeliveries.total, "attention") },
    { key: "livraisons-semaine", label: "Réceptions attendues cette semaine", count: week.total, href: "/stock/receptions", tone: "neutral" },
    { key: "livraisons-retard", label: "Livraisons en retard", count: late.total, href: "/stock/receptions", tone: cardTone(late.total, "critical") },
    { key: "sous-seuil", label: "Articles sous le point de commande", count: below.total, href: "/stock?situation=SOUS_POINT", tone: cardTone(below.total, "attention") },
  ];

  return {
    kind: "MAGASINIER",
    generatedAt: at.toISOString(),
    cards,
    expectedToday: { total: todayDeliveries.total, rows: todayDeliveries.rows.map((r) => deliveryRow(r, at)) },
    expectedThisWeek: { total: week.total, rows: week.rows.map((r) => deliveryRow(r, at)) },
    belowReorder: below,
    recentIssues: issues.map((i) => ({
      id: i.id,
      number: i.number,
      issuedAt: i.issuedAt.toISOString().slice(0, 10),
      departmentName: i.department.name,
      requesterName: i.requesterName,
      lineCount: i._count.lines,
      href: `/stock/sorties/${i.id}`,
    })),
  };
}

// ------------------------------------------------------------------ aiguillage

/** Tableau de bord du rôle de l'utilisateur (Super-admin : vue Responsable en lecture seule). */
export async function dashboardFor(user: DashboardUser, at: Date = clockNow()): Promise<DashboardData> {
  if (!can(user, "dashboard.view")) throw new BusinessError("FORBIDDEN", "Vous n'avez pas les droits pour cette action.");
  switch (user.role) {
    case "ACHETEUR":
      return buyerDashboard(user, at);
    case "MAGASINIER":
      return storekeeperDashboard(user, at);
    default:
      return responsibleDashboard(at);
  }
}
