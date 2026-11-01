import "server-only";
import { db } from "@/lib/db";
import { now as clockNow } from "@/lib/clock";
import { todayAbidjan } from "@/lib/dates";
import { BusinessError } from "@/lib/errors";
import { formatFcfa } from "@/lib/money";
import type { PermissionUser } from "@/lib/permissions";
import { PO_STATUS_LABELS, PO_TYPE_LABELS, type PoStatus } from "@/modules/purchase-orders/labels";
import { getSettings } from "@/modules/settings";
import { MOVEMENT_TYPE_LABELS, type MovementTypeCode } from "@/modules/stock/labels";
import {
  averageStock,
  invoiceConformityRate,
  localSharePct,
  meanOf,
  onTimeRate,
  otifRate,
  serviceRate,
  stockCoverageDays,
  stockRotation,
  variationPct,
  average,
  sharePct,
} from "./kpi";
import {
  orderedInPeriod,
  movementsValueSince,
  orderToReceiptDelay,
  receiptsOnTime,
  requestToOrderDelay,
  stockoutsInPeriod,
  stockValueNow,
  topSuppliers,
} from "./queries";
import { assertReportAccess, type ReportAccess } from "./report-access";
import { GAINS_UNAVAILABLE, KPI_DEFS, REPORT_CATEGORY_LABELS, SUPPLIER_EVAL_UNAVAILABLE, type KpiKey } from "./report-defs";
import { elapsedDays, reportQuerySchema, resolveReportPeriod, type ReportPeriod } from "./report-period";
import {
  closedImportFiles,
  consumptionValue,
  countRequests,
  dormantItems,
  invoiceConformity,
  lateOrders,
  movementSummary,
  ordersIssued,
  otifCounts,
  purchasesByCategory,
  purchasesByType,
  receiptsList,
  requestValidationDelay,
  serviceLines,
  stockoutRows,
  topConsumption,
  validatedInventories,
} from "./report-queries";
import { REPORT_KINDS, REPORT_LABELS, type Report, type ReportCell, type ReportColumn, type ReportFilterValue, type ReportKind, type ReportKpi, type ReportTable } from "./report-types";
import type { QueryFilter } from "./sql-filters";
import { nextDayIso } from "./period";

/**
 * Rapports quotidien, hebdomadaire et mensuel (LOT-15, EX-61 à EX-63). Lectures seules.
 * Contrôle serveur : droit `report.*` et périmètre de l'Acheteur (LOCAL / IMPORT) appliqué à toutes les données de BC.
 * Les filtres dépôt et catégorie s'appliquent au stock et aux achats ; acheteur et fournisseur aux achats et factures
 * (voir les notes de chaque rapport). Une donnée non disponible (LOT-10, LOT-14) est annoncée, jamais inventée.
 */
const TABLE_LIMIT = 200;
const MIN = (a: string, b: string): string => (a < b ? a : b);

function kpi(key: KpiKey, value: number | null, previous: number | null = null, extra: { hint?: string; unavailable?: string } = {}): ReportKpi {
  const d = KPI_DEFS[key];
  return {
    key,
    label: d.label,
    unit: d.unit,
    value,
    previous,
    variationPct: variationPct(value, previous),
    goodDirection: d.good,
    help: d.help,
    ...extra,
  };
}

function table(
  key: string,
  title: string,
  columns: ReportColumn[],
  rows: Record<string, ReportCell>[],
  emptyText: string,
  extra: { note?: string; unavailable?: string } = {},
): ReportTable {
  return { key, title, columns, rows, emptyText, ...extra };
}

const col = (key: string, label: string, type: ReportColumn["type"] = "text"): ReportColumn => ({ key, label, type });
const truncNote = (shown: number, total: number): string | undefined => (total > shown ? `${shown} premières lignes sur ${total}.` : undefined);

// ------------------------------------------------------------------ filtres

export interface ReportUser extends PermissionUser {
  id: string;
}

async function resolveFilters(
  access: ReportAccess,
  q: { category?: string; buyerId?: string; supplierId?: string; warehouseId?: string },
): Promise<{ f: QueryFilter; shown: ReportFilterValue[] }> {
  const f: QueryFilter = { scope: access.scope };
  const shown: ReportFilterValue[] = [];
  if (access.scope) shown.push({ label: "Périmètre", value: access.scope === "LOCAL" ? "Achats locaux" : "Achats import" });
  if (q.category) {
    f.category = q.category;
    shown.push({ label: "Catégorie", value: REPORT_CATEGORY_LABELS[q.category] ?? q.category });
  }
  if (q.buyerId) {
    const u = await db.user.findUnique({ where: { id: q.buyerId }, select: { name: true } });
    if (!u) throw new BusinessError("VALIDATION", "Acheteur introuvable.");
    f.buyerId = q.buyerId;
    shown.push({ label: "Acheteur", value: u.name });
  }
  if (q.supplierId) {
    const s = await db.supplier.findUnique({ where: { id: q.supplierId }, select: { name: true } });
    if (!s) throw new BusinessError("VALIDATION", "Fournisseur introuvable.");
    f.supplierId = q.supplierId;
    shown.push({ label: "Fournisseur", value: s.name });
  }
  if (q.warehouseId) {
    const w = await db.warehouse.findUnique({ where: { id: q.warehouseId }, select: { name: true } });
    if (!w) throw new BusinessError("VALIDATION", "Dépôt introuvable.");
    f.warehouseId = q.warehouseId;
    shown.push({ label: "Dépôt", value: w.name });
  }
  return { f, shown };
}

const FILTER_NOTE =
  "Les filtres Acheteur et Fournisseur s'appliquent aux DA, BC, réceptions et factures ; Dépôt et Catégorie s'appliquent aussi aux mouvements et à la valeur du stock.";

// ------------------------------------------------------------------ rapport quotidien

async function dailyReport(f: QueryFilter, per: ReportPeriod, at: Date): Promise<Pick<Report, "kpis" | "tables" | "notes">> {
  const today = todayAbidjan(at);
  const asOf = MIN(per.to, today);
  const p = per.period;
  const [daCreated, daApproved, ordered, receipts, moves, late, ruptureCount, ruptures, issued, recList] = await Promise.all([
    countRequests(f, p, "created"),
    countRequests(f, p, "approved"),
    orderedInPeriod(p, f),
    receiptsOnTime(p, f),
    movementSummary(f, p),
    lateOrders(f, asOf, TABLE_LIMIT),
    stockoutsInPeriod(p, f),
    stockoutRows(f, p, TABLE_LIMIT),
    ordersIssued(f, p, TABLE_LIMIT),
    receiptsList(f, p, TABLE_LIMIT),
  ]);
  const entries = moves.filter((m) => m.direction === "ENTREE").reduce((s, m) => s + m.valueXof, 0);
  const exits = moves.filter((m) => m.direction === "SORTIE").reduce((s, m) => s + m.valueXof, 0);

  const kpis = [
    kpi("da-creees", daCreated),
    kpi("da-validees", daApproved),
    kpi("bc-emis", ordered.count, null, { hint: formatFcfa(ordered.sum) }),
    kpi("receptions", receipts.total),
    kpi("valeur-entrees", entries),
    kpi("valeur-sorties", exits),
    kpi("bc-en-retard", late.total),
    kpi("ruptures", ruptureCount),
  ];
  const tables = [
    table(
      "bc-emis",
      "BC émis dans la journée",
      [col("number", "BC", "doc"), col("supplier", "Fournisseur"), col("type", "Type"), col("buyer", "Acheteur"), col("amount", "Montant HT", "money")],
      issued.map((o) => ({ number: o.number, supplier: o.supplier, type: PO_TYPE_LABELS[o.type as "LOCAL" | "IMPORT"], buyer: o.buyer, amount: o.amountXof })),
      "Aucun BC émis ce jour.",
      { note: truncNote(issued.length, ordered.count) },
    ),
    table(
      "receptions",
      "Réceptions",
      [col("number", "Réception", "doc"), col("order", "BC", "doc"), col("supplier", "Fournisseur"), col("date", "Date", "date"), col("late", "Retard (jours)", "int"), col("full", "BC soldé")],
      recList.map((r) => ({ number: r.number, order: r.order, supplier: r.supplier, date: r.receivedAt, late: Math.max(0, r.daysLate), full: r.inFull ? "Oui" : "Non" })),
      "Aucune réception ce jour.",
      { note: truncNote(recList.length, receipts.total) },
    ),
    table(
      "mouvements",
      "Entrées et sorties de stock",
      [col("direction", "Sens"), col("type", "Type de mouvement"), col("count", "Mouvements", "int"), col("value", "Valeur", "money")],
      moves.map((m) => ({
        direction: m.direction === "ENTREE" ? "Entrée" : "Sortie",
        type: MOVEMENT_TYPE_LABELS[m.type as MovementTypeCode] ?? m.type,
        count: m.count,
        value: m.valueXof,
      })),
      "Aucun mouvement de stock ce jour.",
    ),
    table(
      "retards",
      "BC en retard",
      [col("number", "BC", "doc"), col("supplier", "Fournisseur"), col("type", "Type"), col("status", "Statut"), col("expected", "Date attendue", "date"), col("late", "Retard (jours)", "int"), col("amount", "Montant HT", "money")],
      late.rows.map((o) => ({
        number: o.number,
        supplier: o.supplier,
        type: PO_TYPE_LABELS[o.type as "LOCAL" | "IMPORT"],
        status: PO_STATUS_LABELS[o.status as PoStatus] ?? o.status,
        expected: o.expectedDate,
        late: o.daysLate,
        amount: o.amountXof,
      })),
      "Aucun BC en retard.",
      { note: truncNote(late.rows.length, late.total) },
    ),
    table(
      "ruptures",
      "Ruptures du jour",
      [col("code", "Article", "doc"), col("name", "Désignation"), col("warehouse", "Dépôt"), col("date", "Dernière sortie", "date")],
      ruptures.map((r) => ({ code: r.code, name: r.name, warehouse: r.warehouse, date: r.lastAt })),
      "Aucune rupture ce jour.",
    ),
  ];
  return {
    kpis,
    tables,
    notes: [
      "BC en retard : BC encore ouverts à la date de génération dont la date attendue précède la fin de la journée.",
      FILTER_NOTE,
    ],
  };
}

// ------------------------------------------------------------------ rapport hebdomadaire

async function weeklyReport(f: QueryFilter, per: ReportPeriod, at: Date): Promise<Pick<Report, "kpis" | "tables" | "notes">> {
  const today = todayAbidjan(at);
  const asOf = MIN(per.to, today);
  const p = per.period;
  const pp = per.previous.period;
  const [daC, daCp, daA, daAp, ord, ordp, rec, recp, rup, rupp, late, inventories, conso, recList] = await Promise.all([
    countRequests(f, p, "created"),
    countRequests(f, pp, "created"),
    countRequests(f, p, "approved"),
    countRequests(f, pp, "approved"),
    orderedInPeriod(p, f),
    orderedInPeriod(pp, f),
    receiptsOnTime(p, f),
    receiptsOnTime(pp, f),
    stockoutsInPeriod(p, f),
    stockoutsInPeriod(pp, f),
    lateOrders(f, asOf, TABLE_LIMIT),
    validatedInventories(f, p),
    topConsumption(f, p, 10),
    receiptsList(f, p, TABLE_LIMIT),
  ]);
  const reliability = meanOf(inventories.map((i) => i.reliabilityPct));
  const kpis = [
    kpi("da-creees", daC, daCp),
    kpi("da-validees", daA, daAp),
    kpi("bc-emis", ord.count, ordp.count),
    kpi("montant-achete", ord.sum, ordp.sum),
    kpi("receptions", rec.total, recp.total),
    kpi("taux-a-temps", onTimeRate(rec.onTime, rec.total), onTimeRate(recp.onTime, recp.total)),
    kpi("bc-en-retard", late.total),
    kpi("ruptures", rup, rupp),
    kpi("fiabilite-inventaire", reliability, null, { hint: inventories.length === 0 ? "Aucun inventaire validé cette semaine" : `${inventories.length} inventaire${inventories.length > 1 ? "s" : ""} validé${inventories.length > 1 ? "s" : ""}` }),
  ];
  const tables = [
    table(
      "retards",
      "BC en retard",
      [col("number", "BC", "doc"), col("supplier", "Fournisseur"), col("type", "Type"), col("status", "Statut"), col("expected", "Date attendue", "date"), col("late", "Retard (jours)", "int"), col("amount", "Montant HT", "money")],
      late.rows.map((o) => ({
        number: o.number,
        supplier: o.supplier,
        type: PO_TYPE_LABELS[o.type as "LOCAL" | "IMPORT"],
        status: PO_STATUS_LABELS[o.status as PoStatus] ?? o.status,
        expected: o.expectedDate,
        late: o.daysLate,
        amount: o.amountXof,
      })),
      "Aucun BC en retard.",
      { note: truncNote(late.rows.length, late.total) },
    ),
    table(
      "inventaires",
      "Inventaires validés dans la semaine",
      [col("number", "Inventaire", "doc"), col("warehouse", "Dépôt"), col("date", "Validé le", "date"), col("lines", "Articles comptés", "int"), col("reliability", "Fiabilité", "pct")],
      inventories.map((i) => ({ number: i.number, warehouse: i.warehouse, date: i.validatedAt, lines: i.lines, reliability: i.reliabilityPct })),
      "Aucun inventaire validé cette semaine.",
    ),
    table(
      "consommations",
      "Top 10 des consommations",
      [col("code", "Article", "doc"), col("name", "Désignation"), col("qty", "Quantité sortie", "qty"), col("unit", "Unité"), col("value", "Valeur au PMP", "money")],
      conso.map((c) => ({ code: c.code, name: c.name, qty: c.qty, unit: c.unit, value: c.valueXof })),
      "Aucune sortie de stock cette semaine.",
    ),
    table(
      "receptions",
      "Réceptions de la semaine",
      [col("number", "Réception", "doc"), col("order", "BC", "doc"), col("supplier", "Fournisseur"), col("date", "Date", "date"), col("late", "Retard (jours)", "int"), col("full", "BC soldé")],
      recList.map((r) => ({ number: r.number, order: r.order, supplier: r.supplier, date: r.receivedAt, late: Math.max(0, r.daysLate), full: r.inFull ? "Oui" : "Non" })),
      "Aucune réception cette semaine.",
      { note: truncNote(recList.length, rec.total) },
    ),
  ];
  return {
    kpis,
    tables,
    notes: [
      "Comparaison avec la semaine précédente (lundi au dimanche).",
      "BC en retard : BC encore ouverts à la date de génération dont la date attendue précède la fin de la période.",
      FILTER_NOTE,
    ],
  };
}

// ------------------------------------------------------------------ rapport mensuel

async function monthlyReport(f: QueryFilter, per: ReportPeriod, at: Date, access: ReportAccess): Promise<Pick<Report, "kpis" | "tables" | "notes">> {
  const today = todayAbidjan(at);
  const settings = await getSettings();
  const p = per.period;
  const pp = per.previous.period;
  const days = elapsedDays(per, today);
  const prevDays = dayCount(per.previous.from, per.previous.to);
  const endDay = nextDayIso(MIN(per.to, today));
  const prevEndDay = nextDayIso(MIN(per.previous.to, today));
  const cutoff = new Date(at.getTime() - settings.stockDormantDays * 86_400_000);

  const [
    ord, ordp, byType, byTypePrev, byCategory, bySupplier,
    valC, valCp, daBc, daBcp, bcRec, bcRecp, otif, otifp, service, servicep,
    rup, rupp, conso, consop, stockNow, sinceStart, sinceEnd, sincePrevStart,
    invoices, invoicesPrev, inventories, inventoriesPrev, dormants, imports,
  ] = await Promise.all([
    orderedInPeriod(p, f),
    orderedInPeriod(pp, f),
    purchasesByType(f, p),
    purchasesByType(f, pp),
    purchasesByCategory(f, p),
    topSuppliers(p, 50, f),
    requestValidationDelay(f, p),
    requestValidationDelay(f, pp),
    requestToOrderDelay(p, f),
    requestToOrderDelay(pp, f),
    orderToReceiptDelay(p, f),
    orderToReceiptDelay(pp, f),
    otifCounts(f, p, endDay),
    otifCounts(f, pp, prevEndDay),
    serviceLines(f, p),
    serviceLines(f, pp),
    stockoutsInPeriod(p, f),
    stockoutsInPeriod(pp, f),
    consumptionValue(f, p),
    consumptionValue(f, pp),
    stockValueNow(f),
    movementsValueSince(p.start, f),
    movementsValueSince(p.endExclusive, f),
    movementsValueSince(pp.start, f),
    invoiceConformity(f, p),
    invoiceConformity(f, pp),
    validatedInventories(f, p),
    validatedInventories(f, pp),
    dormantItems(f, cutoff),
    access.scope === "LOCAL" ? Promise.resolve([]) : closedImportFiles(f, p),
  ]);

  const amountOf = (rows: { type: string; amount: number }[], t: string) => rows.find((r) => r.type === t)?.amount ?? 0;
  const totalAmount = ord.sum;
  const localShare = access.scope ? null : localSharePct(amountOf(byType, "LOCAL"), byType.reduce((s, r) => s + r.amount, 0));
  const localSharePrev = access.scope ? null : localSharePct(amountOf(byTypePrev, "LOCAL"), byTypePrev.reduce((s, r) => s + r.amount, 0));

  // Valeur du stock reconstituée : valeur actuelle - mouvements postérieurs à la date.
  const endValue = stockNow - sinceEnd;
  const startValue = stockNow - sinceStart;
  const prevStartValue = stockNow - sincePrevStart;
  const avgNow = averageStock(startValue, endValue);
  const avgPrev = averageStock(prevStartValue, startValue);
  const dormantTotal = dormants.reduce((s, d) => s + d.valueXof, 0);
  const coefficients = imports.map((i) => i.coefficient);

  const kpis: ReportKpi[] = [
    kpi("montant-achete", ord.sum, ordp.sum),
    kpi("bc-emis", ord.count, ordp.count),
    kpi("part-locale", localShare, localSharePrev, access.scope ? { unavailable: "Non disponible pour votre périmètre (calculée sur local + import)." } : {}),
    kpi("delai-validation-da", average(valC.sum, valC.count), average(valCp.sum, valCp.count)),
    kpi("delai-da-bc", average(daBc.sum, daBc.count), average(daBcp.sum, daBcp.count)),
    kpi("delai-bc-reception", average(bcRec.sum, bcRec.count), average(bcRecp.sum, bcRecp.count)),
    kpi("otif", otifRate(otif.ok, otif.total), otifRate(otifp.ok, otifp.total), { hint: otif.total > 0 ? `${otif.ok} BC sur ${otif.total}` : "Aucun BC échu sur la période" }),
    kpi("taux-service", serviceRate(service.served, service.total), serviceRate(servicep.served, servicep.total), { hint: service.total > 0 ? `${service.served} lignes sur ${service.total}` : undefined }),
    kpi("ruptures", rup, rupp),
    kpi("valeur-stock", endValue, startValue),
    kpi("rotation", stockRotation(conso, avgNow, days), stockRotation(consop, avgPrev, prevDays)),
    kpi("couverture", stockCoverageDays(avgNow, conso, days), stockCoverageDays(avgPrev, consop, prevDays)),
    kpi("valeur-dormants", dormantTotal, null, { hint: `${dormants.length} article${dormants.length > 1 ? "s" : ""} sans mouvement depuis ${settings.stockDormantDays} jours` }),
    kpi("gains-achats", null, null, { unavailable: GAINS_UNAVAILABLE }),
    kpi("conformite-factures", invoiceConformityRate(invoices.conform, invoices.total), invoiceConformityRate(invoicesPrev.conform, invoicesPrev.total), { hint: invoices.total > 0 ? `${invoices.conform} factures sur ${invoices.total}` : "Aucune facture rapprochée sur la période" }),
    kpi("fiabilite-inventaire", meanOf(inventories.map((i) => i.reliabilityPct)), meanOf(inventoriesPrev.map((i) => i.reliabilityPct)), { hint: inventories.length === 0 ? "Aucun inventaire validé sur la période" : undefined }),
    access.scope === "LOCAL"
      ? kpi("cout-approche", null, null, { unavailable: "Non disponible pour votre périmètre (achats import)." })
      : kpi("cout-approche", meanOf(coefficients), null, { hint: imports.length > 0 ? `${imports.length} dossier${imports.length > 1 ? "s" : ""} clôturé${imports.length > 1 ? "s" : ""}` : "Aucun dossier clôturé sur la période" }),
    kpi("evaluation-fournisseurs", null, null, { unavailable: SUPPLIER_EVAL_UNAVAILABLE }),
  ];

  const typeTotal = byType.reduce((s, r) => s + r.amount, 0);
  const tables = [
    table(
      "achats-type",
      "Achats par type",
      [col("type", "Type"), col("count", "BC", "int"), col("amount", "Montant HT", "money"), col("share", "Part", "pct")],
      byType
        .sort((a, b) => b.amount - a.amount)
        .map((r) => ({ type: PO_TYPE_LABELS[r.type], count: r.count, amount: r.amount, share: sharePct(r.amount, typeTotal) })),
      "Aucun achat sur la période.",
    ),
    table(
      "achats-categorie",
      "Achats par catégorie",
      [col("category", "Catégorie"), col("amount", "Montant HT", "money"), col("share", "Part", "pct")],
      byCategory.map((r) => ({ category: REPORT_CATEGORY_LABELS[r.category] ?? r.category, amount: r.amount, share: sharePct(r.amount, totalAmount) })),
      "Aucun achat sur la période.",
    ),
    table(
      "achats-fournisseur",
      "Achats par fournisseur",
      [col("supplier", "Fournisseur"), col("amount", "Montant HT", "money"), col("share", "Part", "pct")],
      bySupplier.map((r) => ({ supplier: r.name, amount: r.amount, share: sharePct(r.amount, totalAmount) })),
      "Aucun achat sur la période.",
      { note: bySupplier.length >= 50 ? "50 premiers fournisseurs." : undefined },
    ),
    table(
      "dormants",
      "Articles dormants",
      [col("code", "Article", "doc"), col("name", "Désignation"), col("category", "Catégorie"), col("qty", "Quantité", "qty"), col("value", "Valeur au PMP", "money"), col("last", "Dernier mouvement", "date")],
      dormants.slice(0, TABLE_LIMIT).map((d) => ({ code: d.code, name: d.name, category: REPORT_CATEGORY_LABELS[d.category] ?? d.category, qty: d.qty, value: d.valueXof, last: d.lastMovement })),
      "Aucun article dormant.",
      { note: `Sans mouvement depuis plus de ${settings.stockDormantDays} jours, situation à la date de génération.${dormants.length > TABLE_LIMIT ? ` ${TABLE_LIMIT} premières lignes sur ${dormants.length}.` : ""}` },
    ),
    access.scope === "LOCAL"
      ? table("import", "Dossiers import clôturés", [], [], "", { unavailable: "Non disponible pour votre périmètre (achats import)." })
      : table(
          "import",
          "Dossiers import clôturés : coût moyen d'approche",
          [col("number", "Dossier", "doc"), col("supplier", "Fournisseur"), col("closed", "Clôturé le", "date"), col("coef", "Coefficient d'approche", "qty"), col("costs", "Frais intégrés au coût", "money")],
          imports.map((i) => ({ number: i.number, supplier: i.supplier, closed: i.closedAt, coef: i.coefficient, costs: i.costsXof })),
          "Aucun dossier import clôturé sur la période.",
        ),
    table(
      "inventaires",
      "Inventaires validés",
      [col("number", "Inventaire", "doc"), col("warehouse", "Dépôt"), col("date", "Validé le", "date"), col("lines", "Articles comptés", "int"), col("reliability", "Fiabilité", "pct")],
      inventories.map((i) => ({ number: i.number, warehouse: i.warehouse, date: i.validatedAt, lines: i.lines, reliability: i.reliabilityPct })),
      "Aucun inventaire validé sur la période.",
    ),
    table("gains", "Gains achats", [], [], "", { unavailable: GAINS_UNAVAILABLE }),
    table("evaluation", "Évaluation des fournisseurs", [], [], "", { unavailable: SUPPLIER_EVAL_UNAVAILABLE }),
  ];
  return {
    kpis,
    tables,
    notes: [
      "Variations : comparaison avec le mois précédent. Mois en cours : les taux annualisés (rotation, couverture) utilisent les jours écoulés.",
      "Valeur du stock : valeur actuelle moins les mouvements postérieurs à la date (reconstitution).",
      FILTER_NOTE,
    ],
  };
}

const dayCount = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000) + 1;

// ------------------------------------------------------------------ point d'entrée

export function isReportKind(v: string): v is ReportKind {
  return (REPORT_KINDS as readonly string[]).includes(v);
}

/** Construit un rapport. `raw` : paramètres de l'adresse (date, month, category, buyerId, supplierId, warehouseId). */
export async function buildReport(user: ReportUser, kind: ReportKind, raw: unknown, at: Date = clockNow()): Promise<Report> {
  const access = assertReportAccess(user);
  const parsed = reportQuerySchema.safeParse(raw ?? {});
  if (!parsed.success) throw new BusinessError("VALIDATION", parsed.error.issues[0]?.message ?? "Paramètres du rapport invalides.");
  const q = parsed.data;
  const per = resolveReportPeriod(kind, { date: q.date, month: q.month }, at);
  const { f, shown } = await resolveFilters(access, q);
  const body = kind === "quotidien" ? await dailyReport(f, per, at) : kind === "hebdomadaire" ? await weeklyReport(f, per, at) : await monthlyReport(f, per, at, access);
  const company = (await getSettings()).company.name;
  return {
    kind,
    title: REPORT_LABELS[kind],
    periodLabel: per.label,
    from: per.from,
    to: per.to,
    generatedAt: at.toISOString(),
    company,
    filters: shown,
    ...body,
  };
}
