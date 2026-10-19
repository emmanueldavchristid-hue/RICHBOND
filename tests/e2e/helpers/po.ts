import { expect, type Page } from "@playwright/test";
import { extractText, getDocumentProxy } from "unpdf";
import { dbOne, dbQuery } from "./db";
import { ready, t, title, norm } from "./da";

/** Helpers e2e des bons de commande (LOT-05). Tout passe par l'interface ; la base ne sert qu'à vérifier les effets. */

export const BC_NUMBER = /^BC-\d{4}-\d{5}$/;

export type PoRow = {
  id: string;
  number: string | null;
  version: number;
  status: string;
  type: string;
  origin: string;
  currency_code: string;
  total_ht: string;
  total_ttc: string;
  total_ttc_xof: number | null;
  promised_date: Date | null;
  first_promised_date: Date | null;
  promised_date_changes: number;
  expected_date: Date;
  requested_date: Date;
  sent_channel: string | null;
  reminder_count: number;
  last_reminded_at: Date | null;
  approved_by_id: string | null;
  created_by_id: string;
  exchange_rate: string | null;
  supplier_id: string;
}

const PO_COLS = `id, number, version, status, type, origin, currency_code, total_ht::text, total_ttc::text, total_ttc_xof, promised_date,
  first_promised_date, promised_date_changes, expected_date, requested_date, sent_channel, reminder_count, last_reminded_at,
  approved_by_id, created_by_id, exchange_rate::text, supplier_id`;

export const poById = (id: string) =>
  dbOne<PoRow>(`SELECT ${PO_COLS} FROM purchase_orders WHERE id = $1`, [id]);
export const poByNumber = (n: string) =>
  dbOne<PoRow>(`SELECT ${PO_COLS} FROM purchase_orders WHERE number = $1`, [n]);

export async function poLines(orderId: string) {
  return dbQuery<{
    line_no: number;
    quantity: string;
    unit_price: string;
    net_amount: string;
    received_qty: string;
    name: string | null;
  }>(
    `SELECT l.line_no, l.quantity::text, l.unit_price::text, l.net_amount::text, l.received_qty::text, i.name
       FROM purchase_order_lines l LEFT JOIN items i ON i.id = l.item_id WHERE l.order_id = $1 ORDER BY l.line_no`,
    [orderId],
  );
}

export const poEvents = (orderId: string) =>
  dbQuery<{
    type: string;
    version: number;
    from_status: string | null;
    to_status: string | null;
    comment: string | null;
    payload: unknown;
  }>(
    `SELECT type::text, version, from_status::text, to_status::text, comment, payload FROM purchase_order_events WHERE order_id = $1 ORDER BY created_at, id`,
    [orderId],
  );

export async function poAuditCount(orderId: string, action: string): Promise<number> {
  const r = await dbOne<{ n: string }>(
    `SELECT count(*)::text AS n FROM audit_logs WHERE entity_id = $1 AND action = $2`,
    [orderId, action],
  );
  return Number(r.n);
}

export const poAllocations = (orderId: string) =>
  dbQuery<{ qty: string; request_number: string }>(
    `SELECT a.qty::text, p.number AS request_number FROM purchase_order_line_allocations a
       JOIN purchase_order_lines l ON l.id = a.order_line_id
       JOIN purchase_request_lines rl ON rl.id = a.request_line_id JOIN purchase_requests p ON p.id = rl.request_id
      WHERE l.order_id = $1 ORDER BY p.number`,
    [orderId],
  );

export async function setSupplierStatus(code: string, status: "ACTIF" | "BLOQUE") {
  await dbQuery(
    `UPDATE suppliers SET status = $2::"SupplierStatus", blocked_reason = $3, blocked_at = $4 WHERE code = $1`,
    [
      code,
      status,
      status === "BLOQUE" ? "Blocage de test e2e" : null,
      status === "BLOQUE" ? new Date() : null,
    ],
  );
}

/** Dernier BC en brouillon d'un acheteur sur un fournisseur (id du BC créé depuis l'écran « À commander »). */
export const idFromUrl = (page: Page) => /\/achats\/commandes\/([^/?]+)/.exec(page.url())![1];

/** Ouvre la liste des BC (onglet) filtrée sur un texte puis la fiche. */
export async function openPo(page: Page, id: string) {
  await ready(page, `/achats/commandes/${id}`);
  await expect(t(page, "po-info")).toBeVisible();
}

/** Prépare le brouillon depuis la fiche d'une DA : « Créer le BC » → lignes pré-cochées → « Créer le BC (n) ». */
export async function createDraftFromPr(page: Page, supplierCode: string): Promise<string> {
  await t(page, "pr-action-create-order").click();
  await expect(page).toHaveURL(/\/achats\/commandes\/nouvelle\?da=/);
  await page.waitForLoadState("networkidle");
  const group = t(page, `to-order-group-${supplierCode}`);
  await expect(group).toBeVisible();
  await group.getByTestId("to-order-create").click();
  await expect(page).toHaveURL(/\/achats\/commandes\/[^/]+\/modifier/);
  await page.waitForLoadState("networkidle");
  await expect(t(page, "po-form")).toBeVisible();
  return /\/achats\/commandes\/([^/]+)\/modifier/.exec(page.url())![1];
}

/** Saisit les prix des lignes (1-based) puis « Enregistrer et soumettre » + confirmation ; attend la fiche en « À valider ». */
export async function fillPricesAndSubmit(page: Page, prices: Record<number, string>) {
  for (const [n, price] of Object.entries(prices)) {
    await t(page, `po-form-price-${n}`).fill(price);
  }
  await t(page, "po-form-submit").click();
  await t(page, "po-form-submit-dialog-confirm").click();
  await expect(t(page, "status-A_VALIDER")).toBeVisible();
}

/** Valide depuis la fiche (Responsable) ; renvoie le numéro attribué. */
export async function approveFromPage(page: Page): Promise<string> {
  await t(page, "po-action-approve").click();
  await expect(t(page, "po-approve-dialog")).toBeVisible();
  await t(page, "po-approve-confirm").click();
  await expect(t(page, "status-VALIDE")).toBeVisible();
  await expect(title(page)).toHaveText(/^BC-\d{4}-\d{5}( v\d+)?$/);
  return norm(await title(page).textContent()).replace(/ v\d+$/, "");
}

/** Télécharge le PDF avec la session du navigateur ; renvoie en-têtes, octets et texte extrait. */
export async function downloadPdf(page: Page, orderId: string, version?: number) {
  const res = await page.request.get(`/api/purchase-orders/${orderId}/pdf${version ? `?v=${version}` : ""}`);
  const body = await res.body();
  let text = "";
  if (res.status() === 200) {
    const pdf = await getDocumentProxy(new Uint8Array(body));
    const out = await extractText(pdf, { mergePages: true });
    text = norm(out.text as string);
  }
  return {
    status: res.status(),
    type: res.headers()["content-type"] ?? "",
    disposition: res.headers()["content-disposition"] ?? "",
    size: body.length,
    text,
  };
}

/** Envoi (moyen + date du jour) depuis la fiche. */
export async function sendFromPage(page: Page, channel: string, contact = "Service commercial") {
  await t(page, "po-action-send").click();
  await expect(t(page, "po-send-dialog")).toBeVisible();
  await t(page, "po-send-channel").selectOption(channel);
  await t(page, "po-send-contact").fill(contact);
  await t(page, "po-send-confirm").click();
  await expect(t(page, "status-ENVOYE")).toBeVisible();
}

/** Confirmation du fournisseur avec date promise. */
export async function confirmFromPage(page: Page, promised: string, ref = "") {
  await t(page, "po-action-confirm").click();
  await expect(t(page, "po-confirm-dialog")).toBeVisible();
  await t(page, "po-confirm-dialog-date").fill(promised);
  if (ref) await t(page, "po-confirm-dialog-ref").fill(ref);
  await t(page, "po-confirm-dialog-confirm").click();
  await expect(t(page, "status-CONFIRME")).toBeVisible();
}

export async function supplierId(code: string): Promise<string> {
  return (await dbOne<{ id: string }>(`SELECT id FROM suppliers WHERE code = $1`, [code])).id;
}

export interface DirectLine {
  search: string;
  qty: string;
  price: string;
}

/**
 * Responsable : commande directe (motif obligatoire) puis « Enregistrer et soumettre » ; renvoie l'id du BC (fiche « À valider »).
 * L'utilisateur doit déjà être connecté en Responsable.
 */
export async function createDirectOrder(
  page: Page,
  o: { supplier: string; reason: string; lines: DirectLine[] },
): Promise<string> {
  await ready(page, "/achats/commandes/nouvelle");
  await expect(t(page, "po-form")).toBeVisible();
  await t(page, "po-origin-DIRECT").check();
  await t(page, "po-direct-reason").fill(o.reason);
  await t(page, "po-supplier").selectOption(await supplierId(o.supplier));
  let n = 0;
  for (const l of o.lines) {
    n += 1;
    const input = t(page, "po-item-search");
    await input.click();
    await input.fill(l.search);
    await t(page, "po-item-search-results")
      .getByRole("option", { name: new RegExp(l.search, "i") })
      .first()
      .click();
    await expect(t(page, `po-form-qty-${n}`)).toBeVisible();
    await t(page, `po-form-qty-${n}`).fill(l.qty);
    await t(page, `po-form-price-${n}`).fill(l.price);
  }
  await t(page, "po-form-submit").click();
  await t(page, "po-form-submit-dialog-confirm").click();
  await expect(t(page, "status-A_VALIDER")).toBeVisible();
  return idFromUrl(page);
}

/** Commande directe complète : créée, soumise puis validée par le Responsable (auto-validée) ; renvoie id et numéro. */
export async function createValidatedDirectOrder(
  page: Page,
  o: { supplier: string; reason: string; lines: DirectLine[] },
) {
  const id = await createDirectOrder(page, o);
  await page.waitForLoadState("networkidle");
  const number = await approveFromPage(page);
  return { id, number };
}

/** Saisit un motif dans un ReasonDialog (testId du dialogue) puis le confirme. */
export async function confirmReason(page: Page, dialogTestId: string, reason: string) {
  await expect(t(page, dialogTestId)).toBeVisible();
  await t(page, `${dialogTestId}-text`).fill(reason);
  await t(page, `${dialogTestId}-confirm`).click();
}

/** Un motif vide est refusé dans un ReasonDialog (message sous le champ) ; le dialogue reste ouvert. */
export async function expectReasonRequired(page: Page, dialogTestId: string) {
  await t(page, `${dialogTestId}-confirm`).click();
  await expect(t(page, dialogTestId).getByText(/obligatoire \(5 caractères minimum\)/)).toBeVisible();
}
