import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { PO_COUNTED_STATUSES, PO_LATE_STATUSES } from "@/modules/purchase-orders/labels";
import type { Period } from "./period";
import { day, ts } from "./queries";
import { invoiceWhere, levelWhere, movementWhere, poWhere, prWhere, receiptWhere, type QueryFilter } from "./sql-filters";

/**
 * Requêtes agrégées propres aux rapports (LOT-15). Même règles que `queries.ts` : SQL paramétré, jamais de concaténation,
 * la base renvoie des sommes et au plus quelques dizaines de lignes. Les agrégats déjà écrits pour le tableau de bord
 * (`orderedInPeriod`, délais, `receiptsOnTime`, ruptures, valeur du stock) sont réutilisés avec le filtre en option.
 */
const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const iso = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);
const list = (xs: readonly string[]) => Prisma.join(xs);
const COUNTED = PO_COUNTED_STATUSES as readonly string[];
const LATE = PO_LATE_STATUSES as readonly string[];
const DELIVERABLE = [...LATE, "RECU", "CLOTURE"];

const inP = (col: Prisma.Sql, p: Period) => Prisma.sql`${col} >= ${ts(p.start)}::timestamp AND ${col} < ${ts(p.endExclusive)}::timestamp`;

// ------------------------------------------------------------------ DA

export async function countRequests(f: QueryFilter, p: Period, by: "created" | "approved"): Promise<number> {
  const col = by === "created" ? Prisma.sql`pr.created_at` : Prisma.sql`pr.approved_at`;
  const rows = await db.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM purchase_requests pr WHERE ${inP(col, p)} AND ${prWhere(f)}`;
  return num(rows[0]?.count);
}

/** Délai de traitement d'une DA : jours calendaires entre soumission et validation, DA validées dans la période. */
export async function requestValidationDelay(f: QueryFilter, p: Period): Promise<{ sum: number; count: number }> {
  const rows = await db.$queryRaw<{ sum: bigint | null; count: bigint }[]>`
    SELECT COALESCE(SUM(d), 0)::bigint AS sum, COUNT(*)::bigint AS count FROM (
      SELECT (pr.approved_at::date - pr.submitted_at::date) AS d
      FROM purchase_requests pr
      WHERE ${inP(Prisma.sql`pr.approved_at`, p)} AND pr.submitted_at IS NOT NULL AND ${prWhere(f)}
    ) t`;
  return { sum: num(rows[0]?.sum), count: num(rows[0]?.count) };
}

// ------------------------------------------------------------------ achats

export async function purchasesByType(f: QueryFilter, p: Period): Promise<{ type: "LOCAL" | "IMPORT"; amount: number; count: number }[]> {
  const rows = await db.$queryRaw<{ type: "LOCAL" | "IMPORT"; amount: bigint; count: bigint }[]>`
    SELECT po.type::text AS type, COALESCE(SUM(po.total_ht_xof), 0)::bigint AS amount, COUNT(*)::bigint AS count
    FROM purchase_orders po
    WHERE ${inP(Prisma.sql`po.approved_at`, p)} AND po.status::text IN (${list(COUNTED)}) AND ${poWhere(f)}
    GROUP BY 1`;
  return rows.map((r) => ({ type: r.type, amount: num(r.amount), count: num(r.count) }));
}

/** Montant par catégorie d'article (lignes de BC ; lignes sans article = « Hors catalogue »). Équivalent FCFA au taux figé du BC. */
export async function purchasesByCategory(f: QueryFilter, p: Period): Promise<{ category: string; amount: number }[]> {
  const only = f.category ? Prisma.sql`AND i.category::text = ${f.category}` : Prisma.empty;
  const rows = await db.$queryRaw<{ category: string; amount: bigint }[]>`
    SELECT COALESCE(i.category::text, 'HORS_CATALOGUE') AS category,
      COALESCE(SUM(ROUND(l.net_amount * COALESCE(po.exchange_rate, 1))), 0)::bigint AS amount
    FROM purchase_order_lines l
    JOIN purchase_orders po ON po.id = l.order_id
    LEFT JOIN items i ON i.id = l.item_id
    WHERE ${inP(Prisma.sql`po.approved_at`, p)} AND po.status::text IN (${list(COUNTED)}) AND ${poWhere(f)} ${only}
    GROUP BY 1 ORDER BY amount DESC`;
  return rows.map((r) => ({ category: r.category, amount: num(r.amount) }));
}

export interface IssuedOrderRow {
  number: string | null;
  supplier: string;
  type: string;
  buyer: string;
  amountXof: number | null;
  approvedAt: string | null;
}

export async function ordersIssued(f: QueryFilter, p: Period, limit: number): Promise<IssuedOrderRow[]> {
  const rows = await db.$queryRaw<{ number: string | null; supplier: string; type: string; buyer: string; amount: number | null; approved_at: Date | null }[]>`
    SELECT po.number, s.name AS supplier, po.type::text AS type, u.name AS buyer, po.total_ht_xof AS amount, po.approved_at
    FROM purchase_orders po
    JOIN suppliers s ON s.id = po.supplier_id JOIN users u ON u.id = po.created_by_id
    WHERE ${inP(Prisma.sql`po.approved_at`, p)} AND po.status::text IN (${list(COUNTED)}) AND ${poWhere(f)}
    ORDER BY po.approved_at ASC, po.number ASC LIMIT ${limit}`;
  return rows.map((r) => ({ number: r.number, supplier: r.supplier, type: r.type, buyer: r.buyer, amountXof: r.amount, approvedAt: iso(r.approved_at) }));
}

export interface LateOrderRow {
  number: string | null;
  supplier: string;
  type: string;
  status: string;
  expectedDate: string;
  daysLate: number;
  amountXof: number | null;
}

/** BC en retard à la fin du jour `asOf` (inclus) : statut actuel et date attendue antérieure à ce jour. */
export async function lateOrders(f: QueryFilter, asOf: string, limit: number): Promise<{ total: number; rows: LateOrderRow[] }> {
  const where = Prisma.sql`po.status::text IN (${list(LATE)}) AND po.expected_date <= ${asOf}::date - 1 AND ${poWhere(f)}`;
  const [count, rows] = await Promise.all([
    db.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM purchase_orders po WHERE ${where}`,
    db.$queryRaw<{ number: string | null; supplier: string; type: string; status: string; expected_date: Date; days_late: number; amount: number | null }[]>`
      SELECT po.number, s.name AS supplier, po.type::text AS type, po.status::text AS status, po.expected_date,
        (${asOf}::date - po.expected_date)::int AS days_late, po.total_ht_xof AS amount
      FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id
      WHERE ${where}
      ORDER BY days_late DESC, po.number ASC LIMIT ${limit}`,
  ]);
  return {
    total: num(count[0]?.count),
    rows: rows.map((r) => ({
      number: r.number,
      supplier: r.supplier,
      type: r.type,
      status: r.status,
      expectedDate: iso(r.expected_date)!,
      daysLate: num(r.days_late),
      amountXof: r.amount,
    })),
  };
}

/**
 * OTIF : BC dont la date promise initiale (sinon la date demandée) tombe dans la période et est déjà échue (`endDay` exclu),
 * et part de ceux qui ont une réception qui les solde, à temps. Un BC échu jamais soldé est compté comme manqué.
 */
export async function otifCounts(f: QueryFilter, p: Period, endDay: string): Promise<{ ok: number; total: number }> {
  const rows = await db.$queryRaw<{ ok: bigint; total: bigint }[]>`
    SELECT COUNT(*) FILTER (WHERE t.ok)::bigint AS ok, COUNT(*)::bigint AS total FROM (
      SELECT EXISTS (
        SELECT 1 FROM receipts r
        WHERE r.order_id = po.id AND r.status::text = 'VALIDEE' AND r.in_full = true AND r.days_late <= 0
      ) AS ok
      FROM purchase_orders po
      WHERE po.status::text IN (${list(DELIVERABLE)})
        AND COALESCE(po.first_promised_date, po.requested_date) >= ${day(p.start)}::date
        AND COALESCE(po.first_promised_date, po.requested_date) < ${day(p.endExclusive) < endDay ? day(p.endExclusive) : endDay}::date
        AND ${poWhere(f)}
    ) t`;
  return { ok: num(rows[0]?.ok), total: num(rows[0]?.total) };
}

// ------------------------------------------------------------------ réceptions

export interface ReceiptRow {
  number: string;
  order: string | null;
  supplier: string;
  receivedAt: string;
  daysLate: number;
  inFull: boolean;
}

export async function receiptsList(f: QueryFilter, p: Period, limit: number): Promise<ReceiptRow[]> {
  const rows = await db.$queryRaw<{ number: string; order_no: string | null; supplier: string; received_at: Date; days_late: number; in_full: boolean }[]>`
    SELECT r.number, po.number AS order_no, s.name AS supplier, r.received_at, r.days_late, r.in_full
    FROM receipts r JOIN purchase_orders po ON po.id = r.order_id JOIN suppliers s ON s.id = r.supplier_id
    WHERE r.status::text = 'VALIDEE'
      AND r.received_at >= ${day(p.start)}::date AND r.received_at < ${day(p.endExclusive)}::date AND ${receiptWhere(f)}
    ORDER BY r.received_at ASC, r.number ASC LIMIT ${limit}`;
  return rows.map((r) => ({
    number: r.number,
    order: r.order_no,
    supplier: r.supplier,
    receivedAt: iso(r.received_at)!,
    daysLate: num(r.days_late),
    inFull: r.in_full,
  }));
}

// ------------------------------------------------------------------ mouvements de stock

export interface MovementSummaryRow {
  type: string;
  direction: "ENTREE" | "SORTIE";
  count: number;
  valueXof: number;
}

/** Mouvements par type et par sens (transferts et réévaluations de coût exclus : sans effet sur la quantité globale). */
export async function movementSummary(f: QueryFilter, p: Period): Promise<MovementSummaryRow[]> {
  const rows = await db.$queryRaw<{ type: string; direction: "ENTREE" | "SORTIE"; count: bigint; value: bigint }[]>`
    SELECT m.type::text AS type, CASE WHEN m.quantity > 0 THEN 'ENTREE' ELSE 'SORTIE' END AS direction,
      COUNT(*)::bigint AS count, ABS(COALESCE(SUM(m.value), 0))::bigint AS value
    FROM stock_movements m JOIN items i ON i.id = m.item_id
    WHERE ${inP(Prisma.sql`m.occurred_at`, p)} AND m.type::text NOT IN ('TRANSFERT', 'REEVALUATION_COUT') AND m.quantity <> 0
      AND ${movementWhere(f)}
    GROUP BY 1, 2 ORDER BY 2, 1`;
  return rows.map((r) => ({ type: r.type, direction: r.direction, count: num(r.count), valueXof: num(r.value) }));
}

export interface StockoutRow {
  code: string;
  name: string;
  warehouse: string;
  lastAt: string;
}

export async function stockoutRows(f: QueryFilter, p: Period, limit: number): Promise<StockoutRow[]> {
  const rows = await db.$queryRaw<{ code: string; name: string; warehouse: string; last_at: Date }[]>`
    SELECT i.code, i.name, w.name AS warehouse, MAX(m.occurred_at) AS last_at
    FROM stock_movements m JOIN items i ON i.id = m.item_id JOIN warehouses w ON w.id = m.warehouse_id
    WHERE i.stocked = true AND m.stock_after <= 0 AND m.quantity < 0 AND ${inP(Prisma.sql`m.occurred_at`, p)} AND ${movementWhere(f)}
    GROUP BY i.code, i.name, w.name ORDER BY last_at ASC, i.code ASC LIMIT ${limit}`;
  return rows.map((r) => ({ code: r.code, name: r.name, warehouse: r.warehouse, lastAt: iso(r.last_at)! }));
}

export interface ConsumptionRow {
  code: string;
  name: string;
  unit: string;
  qty: number;
  valueXof: number;
}

/** Consommation = sorties nettes des annulations (contre-passations incluses), valeur au PMP. */
export async function topConsumption(f: QueryFilter, p: Period, limit: number): Promise<ConsumptionRow[]> {
  const rows = await db.$queryRaw<{ code: string; name: string; unit: string; qty: string; value: bigint }[]>`
    SELECT i.code, i.name, i.stock_unit AS unit, (-SUM(m.quantity))::text AS qty, (-SUM(m.value))::bigint AS value
    FROM stock_movements m JOIN items i ON i.id = m.item_id
    WHERE m.type::text = 'SORTIE' AND ${inP(Prisma.sql`m.occurred_at`, p)} AND ${movementWhere(f)}
    GROUP BY i.code, i.name, i.stock_unit
    HAVING -SUM(m.value) > 0
    ORDER BY value DESC, i.code ASC LIMIT ${limit}`;
  return rows.map((r) => ({ code: r.code, name: r.name, unit: r.unit, qty: num(r.qty), valueXof: num(r.value) }));
}

export async function consumptionValue(f: QueryFilter, p: Period): Promise<number> {
  const rows = await db.$queryRaw<{ value: bigint | null }[]>`
    SELECT (-COALESCE(SUM(m.value), 0))::bigint AS value
    FROM stock_movements m JOIN items i ON i.id = m.item_id
    WHERE m.type::text = 'SORTIE' AND ${inP(Prisma.sql`m.occurred_at`, p)} AND ${movementWhere(f)}`;
  return num(rows[0]?.value);
}

/** Lignes de sortie de la période et part de celles qui laissent un stock restant > 0. */
export async function serviceLines(f: QueryFilter, p: Period): Promise<{ served: number; total: number }> {
  const rows = await db.$queryRaw<{ served: bigint; total: bigint }[]>`
    SELECT COUNT(*) FILTER (WHERE m.stock_after > 0)::bigint AS served, COUNT(*)::bigint AS total
    FROM stock_movements m JOIN items i ON i.id = m.item_id
    WHERE m.type::text = 'SORTIE' AND m.quantity < 0 AND i.stocked = true AND ${inP(Prisma.sql`m.occurred_at`, p)} AND ${movementWhere(f)}`;
  return { served: num(rows[0]?.served), total: num(rows[0]?.total) };
}

export interface DormantRow {
  code: string;
  name: string;
  category: string;
  qty: number;
  valueXof: number;
  lastMovement: string | null;
}

/** Articles en stock sans aucun mouvement depuis `cutoff` (ou jamais), du plus cher au moins cher. */
export async function dormantItems(f: QueryFilter, cutoff: Date): Promise<DormantRow[]> {
  const rows = await db.$queryRaw<{ code: string; name: string; category: string; qty: string; value: bigint; last_move: Date | null }[]>`
    SELECT * FROM (
      SELECT i.code, i.name, i.category::text AS category, SUM(sl.quantity)::text AS qty,
        SUM(ROUND(sl.quantity * sl.pmp))::bigint AS value, SUM(sl.quantity) AS qty_num,
        (SELECT MAX(m.occurred_at) FROM stock_movements m WHERE m.item_id = i.id) AS last_move
      FROM stock_levels sl JOIN items i ON i.id = sl.item_id
      WHERE i.stocked = true AND ${levelWhere(f)}
      GROUP BY i.id, i.code, i.name, i.category
    ) t
    WHERE t.qty_num > 0 AND (t.last_move IS NULL OR t.last_move < ${ts(cutoff)}::timestamp)
    ORDER BY t.value DESC, t.code ASC`;
  return rows.map((r) => ({ code: r.code, name: r.name, category: r.category, qty: num(r.qty), valueXof: num(r.value), lastMovement: iso(r.last_move) }));
}

// ------------------------------------------------------------------ inventaires, factures, import

export interface InventoryRow {
  number: string;
  warehouse: string;
  validatedAt: string | null;
  lines: number;
  reliabilityPct: number | null;
}

export async function validatedInventories(f: QueryFilter, p: Period): Promise<InventoryRow[]> {
  const wh = f.warehouseId ? Prisma.sql`AND ic.warehouse_id = ${f.warehouseId}` : Prisma.empty;
  const rows = await db.$queryRaw<{ number: string; warehouse: string; validated_at: Date | null; lines: bigint; reliability: string | null }[]>`
    SELECT ic.number, w.name AS warehouse, ic.validated_at, ic.reliability_pct::text AS reliability,
      (SELECT COUNT(*) FROM inventory_count_lines l WHERE l.count_id = ic.id)::bigint AS lines
    FROM inventory_counts ic JOIN warehouses w ON w.id = ic.warehouse_id
    WHERE ic.status::text = 'VALIDE' AND ${inP(Prisma.sql`ic.validated_at`, p)} ${wh}
    ORDER BY ic.validated_at ASC, ic.number ASC`;
  return rows.map((r) => ({
    number: r.number,
    warehouse: r.warehouse,
    validatedAt: iso(r.validated_at),
    lines: num(r.lines),
    reliabilityPct: r.reliability === null ? null : Number(r.reliability),
  }));
}

/** Factures rapprochées (hors annulées) de la période et part de celles dont toutes les lignes sont conformes. */
export async function invoiceConformity(f: QueryFilter, p: Period): Promise<{ conform: number; total: number }> {
  const rows = await db.$queryRaw<{ conform: bigint; total: bigint }[]>`
    SELECT COUNT(*) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM supplier_invoice_lines l WHERE l.invoice_id = si.id AND l.match IS DISTINCT FROM 'CONFORME'
      ))::bigint AS conform, COUNT(*)::bigint AS total
    FROM supplier_invoices si
    WHERE si.status::text <> 'ANNULEE' AND si.matched_at IS NOT NULL
      AND si.invoice_date >= ${day(p.start)}::date AND si.invoice_date < ${day(p.endExclusive)}::date AND ${invoiceWhere(f)}`;
  return { conform: num(rows[0]?.conform), total: num(rows[0]?.total) };
}

export interface ClosedImportRow {
  number: string;
  supplier: string;
  closedAt: string | null;
  coefficient: number | null;
  costsXof: number;
}

/** Dossiers import clôturés dans la période, avec leur coefficient d'approche et le total des frais intégrés au coût. */
export async function closedImportFiles(f: QueryFilter, p: Period): Promise<ClosedImportRow[]> {
  const sup = f.supplierId ? Prisma.sql`AND imp.supplier_id = ${f.supplierId}` : Prisma.empty;
  const rows = await db.$queryRaw<{ number: string; supplier: string; closed_at: Date | null; coefficient: string | null; costs: bigint }[]>`
    SELECT imp.number, s.name AS supplier, imp.closed_at, imp.coefficient::text AS coefficient,
      COALESCE((SELECT SUM(c.amount_xof) FROM approach_costs c WHERE c.file_id = imp.id AND c.vat_recoverable = false), 0)::bigint AS costs
    FROM import_files imp JOIN suppliers s ON s.id = imp.supplier_id
    WHERE imp.status::text = 'CLOTURE' AND ${inP(Prisma.sql`imp.closed_at`, p)} ${sup}
    ORDER BY imp.closed_at ASC, imp.number ASC`;
  return rows.map((r) => ({
    number: r.number,
    supplier: r.supplier,
    closedAt: iso(r.closed_at),
    coefficient: r.coefficient === null ? null : Number(r.coefficient),
    costsXof: num(r.costs),
  }));
}
