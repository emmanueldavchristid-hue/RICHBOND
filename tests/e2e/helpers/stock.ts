import { dbOne, dbQuery } from "./db";

/** Helpers e2e du stock (LOT-07). Tout passe par l'interface ; la base ne sert qu'à préparer et vérifier les effets. */

export const SOR_NUMBER = /^SOR-\d{4}-\d{5}$/;
export const TRF_NUMBER = /^TRF-\d{4}-\d{5}$/;
export const AJU_NUMBER = /^AJU-\d{4}-\d{5}$/;

export const itemRow = (name: string) =>
  dbOne<{ id: string; code: string }>(`SELECT id, code FROM items WHERE name = $1`, [name]);

/** Stock d'un article par dépôt (nom du dépôt -> quantité). */
export async function levelsOf(itemId: string): Promise<Record<string, number>> {
  const rows = await dbQuery<{ name: string; qty: string }>(
    `SELECT w.name, s.quantity::text AS qty FROM stock_levels s JOIN warehouses w ON w.id = s.warehouse_id WHERE s.item_id = $1`,
    [itemId],
  );
  return Object.fromEntries(rows.map((r) => [r.name, Number(r.qty)]));
}

export const movementCount = async (itemId: string) =>
  Number((await dbOne<{ n: string }>(`SELECT count(*)::text AS n FROM stock_movements WHERE item_id = $1`, [itemId])).n);

export const movementsOfRef = (ref: string) =>
  dbQuery<{ type: string; quantity: string; value: number; warehouse: string; stock_after: string; comment: string | null }>(
    `SELECT m.type::text, m.quantity::text, m.value, w.name AS warehouse, m.stock_after::text, m.comment
       FROM stock_movements m JOIN warehouses w ON w.id = m.warehouse_id WHERE m.document_ref = $1 ORDER BY m.created_at, m.id`,
    [ref],
  );

export const auditTotal = async (action: string) =>
  Number((await dbOne<{ n: string }>(`SELECT count(*)::text AS n FROM audit_logs WHERE action = $1`, [action])).n);

/** DA ouvertes (statuts « en cours ») portant l'article : instantané pour les neutraliser puis les rétablir. */
export const openRequestsOf = (itemId: string) =>
  dbQuery<{ id: string; status: string }>(
    `SELECT DISTINCT p.id, p.status::text AS status FROM purchase_requests p JOIN purchase_request_lines l ON l.request_id = p.id
      WHERE l.item_id = $1 AND p.status IN ('SOUMISE','A_COMPLETER','VALIDEE','EN_CONSULTATION')`,
    [itemId],
  );

export const setRequestStatus = (id: string, status: string) =>
  dbQuery(`UPDATE purchase_requests SET status = $2::"PurchaseRequestStatus" WHERE id = $1`, [id, status]);
