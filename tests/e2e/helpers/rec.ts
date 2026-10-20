import { expect, type Page } from "@playwright/test";
import { dbOne, dbQuery } from "./db";
import { dayOffset, norm, ready, t, title } from "./da";
import { confirmFromPage, createValidatedDirectOrder, sendFromPage, type DirectLine } from "./po";

/** Helpers e2e des réceptions (LOT-06). Tout passe par l'interface ; la base ne sert qu'à vérifier les effets. */

export const REC_NUMBER = /^REC-\d{4}-\d{5}$/;
export const NC_NUMBER = /^NC-\d{4}-\d{5}$/;

/** Format d'affichage des montants : « 1 250 000 » (espaces normalisés par `norm`). */
export const spaced = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

export const itemId = async (name: string) => (await dbOne<{ id: string }>(`SELECT id FROM items WHERE name = $1`, [name])).id;

/** Stock et PMP d'un article dans un dépôt (0 si le couple n'existe pas encore). */
export async function stockOf(itemName: string, warehouseId: string): Promise<{ qty: number; pmp: number }> {
  const rows = await dbQuery<{ qty: string; pmp: string }>(
    `SELECT s.quantity::text AS qty, s.pmp::text AS pmp FROM stock_levels s JOIN items i ON i.id = s.item_id
      WHERE i.name = $1 AND s.warehouse_id = $2`,
    [itemName, warehouseId],
  );
  return rows.length ? { qty: Number(rows[0].qty), pmp: Number(rows[0].pmp) } : { qty: 0, pmp: 0 };
}

/** Dépôt prévu d'un BC (tel que proposé par l'écran de réception). */
export async function orderWarehouseId(orderId: string): Promise<string> {
  const r = await dbOne<{ warehouse_id: string }>(`SELECT warehouse_id FROM purchase_orders WHERE id = $1`, [orderId]);
  return r.warehouse_id;
}

export const receiptByNumber = (n: string) =>
  dbOne<{
    id: string;
    status: string;
    order_id: string;
    warehouse_id: string;
    delivery_note_ref: string;
    days_late: number;
    in_full: boolean;
    cancelled_reason: string | null;
    created_by_id: string;
  }>(
    `SELECT id, status::text, order_id, warehouse_id, delivery_note_ref, days_late, in_full, cancelled_reason, created_by_id FROM receipts WHERE number = $1`,
    [n],
  );

export const receiptLines = (receiptId: string) =>
  dbQuery<{
    delivered: string;
    accepted: string;
    refused: string;
    accepted_stock: string;
    reason: string | null;
    unit_cost: string;
  }>(
    `SELECT delivered_qty::text AS delivered, accepted_qty::text AS accepted, refused_qty::text AS refused,
            accepted_stock_qty::text AS accepted_stock, refusal_reason::text AS reason, unit_cost_xof::text AS unit_cost
       FROM receipt_lines WHERE receipt_id = $1 ORDER BY id`,
    [receiptId],
  );

export const receiptMovements = (receiptId: string) =>
  dbQuery<{
    type: string;
    quantity: string;
    unit_cost: string;
    value: number;
    pmp_before: string;
    pmp_after: string;
    stock_after: string;
    reversal_of_id: string | null;
    document_ref: string;
  }>(
    `SELECT type::text, quantity::text, unit_cost::text, value, pmp_before::text, pmp_after::text, stock_after::text, reversal_of_id, document_ref
       FROM stock_movements WHERE document_type = 'RECEPTION' AND document_id = $1 ORDER BY created_at, id`,
    [receiptId],
  );

export const ncOfReceipt = (receiptId: string) =>
  dbQuery<{ id: string; number: string; qty: string; reason: string; status: string; decision: string | null }>(
    `SELECT id, number, qty::text, reason::text, status::text, decision::text FROM non_conformities WHERE receipt_id = $1 ORDER BY number`,
    [receiptId],
  );

export const orderReceiptState = (orderId: string) =>
  dbQuery<{ line_no: number; quantity: string; received_qty: string; closed_qty: string }>(
    `SELECT line_no, quantity::text, received_qty::text, closed_qty::text FROM purchase_order_lines WHERE order_id = $1 ORDER BY line_no`,
    [orderId],
  );

export async function receiptCount(orderId: string): Promise<number> {
  const r = await dbOne<{ n: string }>(`SELECT count(*)::text AS n FROM receipts WHERE order_id = $1`, [orderId]);
  return Number(r.n);
}

/**
 * Responsable (déjà connecté) : commande directe validée, envoyée puis confirmée par le fournisseur (date promise = aujourd'hui,
 * donc dans le bloc « Attendues aujourd'hui » de l'écran Réceptions). Renvoie id et numéro du BC.
 */
export async function createReceivableOrder(
  page: Page,
  o: { supplier: string; reason: string; lines: DirectLine[]; promised?: string },
): Promise<{ id: string; number: string }> {
  const po = await createValidatedDirectOrder(page, { supplier: o.supplier, reason: o.reason, lines: o.lines });
  await sendFromPage(page, "EMAIL");
  await confirmFromPage(page, o.promised ?? dayOffset(0), "CONF-" + o.reason.slice(-8));
  return po;
}

/** Magasinier : de l'écran Réceptions (recherche du n° de BC) à la saisie de la réception. */
export async function openReceiptForm(page: Page, poNumber: string) {
  await ready(page, "/stock/receptions");
  await t(page, "rec-search").fill(poNumber);
  const row = t(page, `rec-expected-${poNumber}`);
  await expect(row).toBeVisible();
  await t(page, `rec-receive-${poNumber}`).click();
  await expect(t(page, "rec-form")).toBeVisible();
  await page.waitForLoadState("networkidle");
}

/** Renseigne l'en-tête (N° de BL) et, par ligne (1-based), livré / refusé / motif. */
export async function fillReceipt(
  page: Page,
  o: { bl: string; lines?: Record<number, { delivered?: string; refused?: string; reason?: string }> },
) {
  await t(page, "rec-bl").fill(o.bl);
  for (const [n, l] of Object.entries(o.lines ?? {})) {
    if (l.delivered !== undefined) await t(page, `rec-delivered-${n}`).fill(l.delivered);
    if (l.refused !== undefined) await t(page, `rec-refused-${n}`).fill(l.refused);
    if (l.reason) await t(page, `rec-reason-${n}`).selectOption(l.reason);
  }
}

/** « Valider la réception » + confirmation ; attend la fiche de la réception et renvoie son numéro REC-AAAA-NNNNN. */
export async function submitReceipt(page: Page): Promise<string> {
  await t(page, "rec-submit").click();
  await expect(t(page, "rec-confirm")).toBeVisible();
  await t(page, "rec-confirm-confirm").click();
  await expect(page).toHaveURL(/\/stock\/receptions\/(?!nouvelle|non-conformites)[^/?]+$/);
  await expect(title(page)).toHaveText(REC_NUMBER);
  await page.waitForLoadState("networkidle");
  return norm(await title(page).textContent());
}

/** Hauteur minimale tactile (44 px) d'un élément visible. */
export async function expectTouchHeight(page: Page, testId: string, min = 44) {
  const box = await t(page, testId).first().boundingBox();
  expect(box, `${testId} introuvable`).not.toBeNull();
  expect(box!.height, `${testId} : hauteur ${box!.height}px < ${min}px`).toBeGreaterThanOrEqual(min - 0.5);
}
