import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { dayKeyOf } from "@/lib/dates";
import { PO_COUNTED_STATUSES, PO_LATE_STATUSES } from "@/modules/purchase-orders/labels";
import type { Period } from "./period";

/**
 * Requêtes agrégées des tableaux de bord (LOT-08, EX-60) : `$queryRaw` paramétré (jamais de concaténation) ou
 * `groupBy`. Aucune liste complète n'est chargée : la base renvoie des sommes, des effectifs et au plus quelques lignes.
 * Fuseau : Africa/Abidjan = UTC+0 sans changement d'heure ; les `timestamp` sont stockés en UTC et comparés à des
 * bornes issues de `period.ts` (instants UTC), les colonnes `date` à des jours `yyyy-MM-dd`.
 */

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
/** Instant UTC sans « Z » : cast `::timestamp` (colonnes `timestamp(3)` de Prisma, stockées en UTC). */
const ts = (d: Date): string => d.toISOString().slice(0, 23);
const day = (d: Date): string => dayKeyOf(d);
const list = (xs: readonly string[]) => Prisma.join(xs);

const COUNTED = PO_COUNTED_STATUSES as readonly string[];
const LATE = PO_LATE_STATUSES as readonly string[];
const EXPECTED = ["ENVOYE", "CONFIRME", "PARTIELLEMENT_RECU"];

export interface SumCount {
  sum: number;
  count: number;
}

// ------------------------------------------------------------------ achats

/** Montant commandé (FCFA) et nombre de BC validés dans la période (date de validation, hors annulés / refusés). */
export async function orderedInPeriod(p: Period): Promise<SumCount> {
  const rows = await db.$queryRaw<{ sum: bigint | null; count: bigint }[]>`
    SELECT COALESCE(SUM(total_ht_xof), 0)::bigint AS sum, COUNT(*)::bigint AS count
    FROM purchase_orders
    WHERE approved_at >= ${ts(p.start)}::timestamp AND approved_at < ${ts(p.endExclusive)}::timestamp
      AND status::text IN (${list(COUNTED)})`;
  return { sum: num(rows[0]?.sum), count: num(rows[0]?.count) };
}

export interface MonthTypeAmount {
  month: string;
  type: "LOCAL" | "IMPORT";
  amount: number;
}

/** Achats par mois et par type (BC validés de la fenêtre). */
export async function purchasesByMonthAndType(p: Period): Promise<MonthTypeAmount[]> {
  const rows = await db.$queryRaw<{ month: string; type: "LOCAL" | "IMPORT"; amount: bigint }[]>`
    SELECT to_char(approved_at, 'YYYY-MM') AS month, type::text AS type, COALESCE(SUM(total_ht_xof), 0)::bigint AS amount
    FROM purchase_orders
    WHERE approved_at >= ${ts(p.start)}::timestamp AND approved_at < ${ts(p.endExclusive)}::timestamp
      AND status::text IN (${list(COUNTED)})
    GROUP BY 1, 2`;
  return rows.map((r) => ({ month: r.month, type: r.type, amount: num(r.amount) }));
}

export interface SupplierAmount {
  supplierId: string;
  name: string;
  amount: number;
}

/** Top fournisseurs en montant sur la fenêtre. */
export async function topSuppliers(p: Period, limit: number): Promise<SupplierAmount[]> {
  const rows = await db.$queryRaw<{ supplier_id: string; name: string; amount: bigint }[]>`
    SELECT po.supplier_id, s.name, COALESCE(SUM(po.total_ht_xof), 0)::bigint AS amount
    FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id
    WHERE po.approved_at >= ${ts(p.start)}::timestamp AND po.approved_at < ${ts(p.endExclusive)}::timestamp
      AND po.status::text IN (${list(COUNTED)})
    GROUP BY po.supplier_id, s.name
    HAVING COALESCE(SUM(po.total_ht_xof), 0) > 0
    ORDER BY amount DESC, s.name ASC
    LIMIT ${limit}`;
  return rows.map((r) => ({ supplierId: r.supplier_id, name: r.name, amount: num(r.amount) }));
}

/**
 * Délai DA -> BC : somme et effectif des écarts en jours calendaires (validation du BC - validation de la DA),
 * un couple (BC, DA) compté une fois, pour les BC validés dans la période.
 */
export async function requestToOrderDelay(p: Period): Promise<SumCount> {
  const rows = await db.$queryRaw<{ sum: bigint | null; count: bigint }[]>`
    SELECT COALESCE(SUM(d), 0)::bigint AS sum, COUNT(*)::bigint AS count FROM (
      SELECT DISTINCT po.id AS po_id, pr.id AS pr_id, (po.approved_at::date - pr.approved_at::date) AS d
      FROM purchase_orders po
      JOIN purchase_order_lines pol ON pol.order_id = po.id
      JOIN purchase_order_line_allocations a ON a.order_line_id = pol.id
      JOIN purchase_request_lines prl ON prl.id = a.request_line_id
      JOIN purchase_requests pr ON pr.id = prl.request_id
      WHERE po.approved_at >= ${ts(p.start)}::timestamp AND po.approved_at < ${ts(p.endExclusive)}::timestamp
        AND po.status::text IN (${list(COUNTED)}) AND pr.approved_at IS NOT NULL
    ) t`;
  return { sum: num(rows[0]?.sum), count: num(rows[0]?.count) };
}

/** Délai BC -> réception : 1re réception non annulée du BC, tombant dans la période, moins la validation du BC (jours). */
export async function orderToReceiptDelay(p: Period): Promise<SumCount> {
  const rows = await db.$queryRaw<{ sum: bigint | null; count: bigint }[]>`
    SELECT COALESCE(SUM(d), 0)::bigint AS sum, COUNT(*)::bigint AS count FROM (
      SELECT (MIN(r.received_at) - po.approved_at::date) AS d
      FROM receipts r JOIN purchase_orders po ON po.id = r.order_id
      WHERE r.status::text = 'VALIDEE' AND po.approved_at IS NOT NULL
      GROUP BY po.id, po.approved_at
      HAVING MIN(r.received_at) >= ${day(p.start)}::date AND MIN(r.received_at) < ${day(p.endExclusive)}::date
    ) t`;
  return { sum: num(rows[0]?.sum), count: num(rows[0]?.count) };
}

/** Réceptions de la période (hors annulées) : effectif total et à temps (`daysLate <= 0`). */
export async function receiptsOnTime(p: Period): Promise<{ onTime: number; total: number }> {
  const rows = await db.$queryRaw<{ on_time: bigint; total: bigint }[]>`
    SELECT COUNT(*) FILTER (WHERE days_late <= 0)::bigint AS on_time, COUNT(*)::bigint AS total
    FROM receipts
    WHERE status::text = 'VALIDEE'
      AND received_at >= ${day(p.start)}::date AND received_at < ${day(p.endExclusive)}::date`;
  return { onTime: num(rows[0]?.on_time), total: num(rows[0]?.total) };
}

// ------------------------------------------------------------------ stock

/** Valeur du stock (FCFA) : Σ quantité x PMP par dépôt, arrondie par ligne comme `loadStats`. */
export async function stockValueNow(): Promise<number> {
  const rows = await db.$queryRaw<{ value: bigint | null }[]>`
    SELECT COALESCE(SUM(ROUND(quantity * pmp)), 0)::bigint AS value FROM stock_levels`;
  return num(rows[0]?.value);
}

/** Σ des valeurs signées des mouvements depuis `since` (T3 : valeur de fin de mois précédent = valeur actuelle - ce total). */
export async function movementsValueSince(since: Date): Promise<number> {
  const rows = await db.$queryRaw<{ value: bigint | null }[]>`
    SELECT COALESCE(SUM(value), 0)::bigint AS value FROM stock_movements WHERE occurred_at >= ${ts(since)}::timestamp`;
  return num(rows[0]?.value);
}

/** Valeur du stock par catégorie d'article. */
export async function stockValueByCategory(): Promise<{ category: string; value: number }[]> {
  const rows = await db.$queryRaw<{ category: string; value: bigint | null }[]>`
    SELECT i.category::text AS category, COALESCE(SUM(ROUND(sl.quantity * sl.pmp)), 0)::bigint AS value
    FROM stock_levels sl JOIN items i ON i.id = sl.item_id
    GROUP BY i.category`;
  return rows.map((r) => ({ category: r.category, value: num(r.value) })).filter((r) => r.value > 0);
}

/** Ruptures (T3) : articles stockés dont une sortie de la période a laissé le stock à 0 (ou moins) dans un dépôt. */
export async function stockoutsInPeriod(p: Period): Promise<number> {
  const rows = await db.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(DISTINCT m.item_id)::bigint AS count
    FROM stock_movements m JOIN items i ON i.id = m.item_id
    WHERE i.stocked = true AND m.stock_after <= 0 AND m.quantity < 0
      AND m.occurred_at >= ${ts(p.start)}::timestamp AND m.occurred_at < ${ts(p.endExclusive)}::timestamp`;
  return num(rows[0]?.count);
}

// ------------------------------------------------------------------ compteurs « à traiter »

export async function countOrdersLate(todayIso: string, createdById?: string): Promise<number> {
  const mine = createdById ? Prisma.sql`AND created_by_id = ${createdById}` : Prisma.empty;
  const rows = await db.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM purchase_orders
    WHERE status::text IN (${list(LATE)}) AND expected_date < ${todayIso}::date ${mine}`;
  return num(rows[0]?.count);
}

export interface ExpectedOrderRow {
  id: string;
  number: string | null;
  version: number;
  supplierName: string;
  expectedDate: string;
  openLines: number;
}

/**
 * Livraisons attendues entre deux jours (inclus) : BC envoyés / confirmés / partiellement reçus ayant encore au moins
 * une ligne à recevoir. `from` null = sans borne basse. Renvoie l'effectif et les `limit` premières lignes.
 */
export async function expectedDeliveries(
  from: string | null,
  to: string,
  limit: number,
): Promise<{ total: number; rows: ExpectedOrderRow[] }> {
  const lower = from ? Prisma.sql`AND po.expected_date >= ${from}::date` : Prisma.empty;
  const open = Prisma.sql`EXISTS (SELECT 1 FROM purchase_order_lines l WHERE l.order_id = po.id AND l.quantity - l.received_qty - l.closed_qty > 0)`;
  const [countRows, rows] = await Promise.all([
    db.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM purchase_orders po
      WHERE po.status::text IN (${list(EXPECTED)}) AND po.expected_date <= ${to}::date ${lower} AND ${open}`,
    db.$queryRaw<{ id: string; number: string | null; version: number; supplier_name: string; expected_date: Date; open_lines: bigint }[]>`
      SELECT po.id, po.number, po.version, s.name AS supplier_name, po.expected_date,
        (SELECT COUNT(*) FROM purchase_order_lines l WHERE l.order_id = po.id AND l.quantity - l.received_qty - l.closed_qty > 0)::bigint AS open_lines
      FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id
      WHERE po.status::text IN (${list(EXPECTED)}) AND po.expected_date <= ${to}::date ${lower} AND ${open}
      ORDER BY po.expected_date ASC, po.number ASC
      LIMIT ${limit}`,
  ]);
  return {
    total: num(countRows[0]?.count),
    rows: rows.map((r) => ({
      id: r.id,
      number: r.number,
      version: r.version,
      supplierName: r.supplier_name,
      expectedDate: r.expected_date.toISOString().slice(0, 10),
      openLines: num(r.open_lines),
    })),
  };
}

/** Articles candidats « sous le point de commande » : seuil saisi atteint, ou seuil suggéré (sorties récentes). Surensemble, affiné ensuite par `itemForecast`. */
export async function belowReorderCandidates(windowStart: Date): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT i.id FROM items i
    WHERE i.stocked = true AND i.status::text = 'ACTIF'
      AND (
        (i.reorder_point IS NOT NULL AND i.reorder_point > 0
          AND COALESCE((SELECT SUM(sl.quantity) FROM stock_levels sl WHERE sl.item_id = i.id), 0) <= i.reorder_point)
        OR (i.reorder_point IS NULL
          AND EXISTS (SELECT 1 FROM stock_movements m WHERE m.item_id = i.id AND m.type::text = 'SORTIE'
                      AND m.occurred_at >= ${ts(windowStart)}::timestamp))
      )`;
  return rows.map((r) => r.id);
}

export interface ReminderCandidateRow {
  id: string;
  number: string | null;
  version: number;
  status: string;
  type: "LOCAL" | "IMPORT";
  supplier_name: string;
  sent_at: Date | null;
  last_reminded_at: Date | null;
  expected_date: Date;
  total_ht_xof: number | null;
  updated_at: Date;
}

/** Candidats « à relancer » d'un acheteur : surensemble calendaire, affiné ensuite par `needsReminder` (jours ouvrés). */
export async function reminderCandidates(createdById: string, todayIso: string, afterDays: number): Promise<ReminderCandidateRow[]> {
  return db.$queryRaw<ReminderCandidateRow[]>`
    SELECT po.id, po.number, po.version, po.status::text AS status, po.type::text AS type, s.name AS supplier_name,
      po.sent_at, po.last_reminded_at, po.expected_date, po.total_ht_xof, po.updated_at
    FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id
    WHERE po.created_by_id = ${createdById}
      AND po.status::text IN (${list(EXPECTED)})
      AND (
        (po.status::text = 'ENVOYE'
          AND GREATEST(po.sent_at, po.last_reminded_at)::date <= (${todayIso}::date - ${afterDays}::int))
        OR (po.expected_date < ${todayIso}::date
          AND GREATEST(po.last_reminded_at::date, po.expected_date) <= (${todayIso}::date - 2))
      )
    ORDER BY po.expected_date ASC
    LIMIT 200`;
}
