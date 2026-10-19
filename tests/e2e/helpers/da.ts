import { expect, type Page } from "@playwright/test";
import { dbOne, dbQuery } from "./db";

/** Helpers e2e des demandes d'achat (LOT-04). Tout passe par l'interface, comme les vrais utilisateurs. */

export const dayOffset = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

export const norm = (s: string | null | undefined) =>
  (s ?? "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();

/** Ouvre une page et attend l'hydratation. */
export async function ready(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

/** Titre de la page affichée (Next conserve masquées les pages précédentes). */
export const title = (page: Page) => page.locator('[data-testid="page-title"]:visible');

/** Étiquette unique d'un jeu de test (retrouver ses DA par la recherche de la liste). */
export const uniqueTag = (prefix: string, projectName: string) =>
  `${prefix}${projectName.slice(0, 3).toUpperCase()}${Date.now()}`;

export interface LineInput {
  /** Texte recherché dans la liste d'articles (désignation) ; sinon `free` = désignation libre. */
  search?: string;
  free?: string;
  qty: string;
  price?: string;
}

export interface PrInput {
  department: string;
  reason: string;
  urgency?: "NORMALE" | "URGENTE" | "ARRET_PRODUCTION";
  neededBy?: string;
  type?: "LOCAL" | "IMPORT" | "A_DEFINIR";
  lines: LineInput[];
}

/** Ouvre le formulaire « Nouvelle DA » depuis la liste et le remplit (sans enregistrer). */
export async function fillNewPr(page: Page, o: PrInput) {
  await ready(page, "/achats/demandes");
  await expect(t(page, "pr-create")).toBeEnabled();
  await t(page, "pr-create").click();
  await expect(t(page, "pr-form")).toBeVisible();
  await page.waitForLoadState("networkidle");

  await t(page, "pr-department").selectOption({ label: o.department });
  if (o.urgency && o.urgency !== "NORMALE") await t(page, `pr-urgency-${o.urgency}`).check();
  if (o.neededBy) await t(page, "pr-needed-by").fill(o.neededBy);
  if (o.type) await t(page, "pr-type").selectOption(o.type);
  await t(page, "pr-reason").fill(o.reason);

  let n = 0;
  for (const l of o.lines) {
    n += 1;
    if (l.free) {
      await t(page, "pr-add-free").click();
      await t(page, `pr-line-${n}-designation`).fill(l.free);
    } else {
      const input = t(page, "pr-item-search");
      await input.click();
      await input.fill(l.search!);
      await t(page, "pr-item-search-results")
        .getByRole("option", { name: new RegExp(l.search!, "i") })
        .first()
        .click();
    }
    await expect(t(page, `pr-line-${n}-qty`)).toBeVisible();
    await t(page, `pr-line-${n}-qty`).fill(l.qty);
    if (l.price !== undefined) await t(page, `pr-line-${n}-price`).fill(l.price);
  }
}

/** Soumet depuis le formulaire (bouton + confirmation) et renvoie le numéro DA attribué. */
export async function submitForm(page: Page): Promise<string> {
  await t(page, "pr-submit").click();
  await t(page, "pr-submit-dialog-confirm").click();
  await expect(title(page)).toHaveText(/^DA-\d{4}-\d{5}$/);
  return norm(await title(page).textContent());
}

/** Crée puis soumet une DA complète ; renvoie son numéro. */
export async function createAndSubmitPr(page: Page, o: PrInput): Promise<string> {
  await fillNewPr(page, o);
  return submitForm(page);
}

/** Ouvre la liste filtrée sur une étiquette puis la fiche d'une DA. */
export async function openPr(page: Page, number: string, tab = "toutes") {
  await ready(page, `/achats/demandes?onglet=${tab}&q=${encodeURIComponent(number)}`);
  await expect(t(page, `pr-row-${number}`)).toBeVisible();
  await t(page, `pr-row-${number}`).getByTestId("pr-link").click();
  await expect(title(page)).toHaveText(number);
  await page.waitForLoadState("networkidle");
}

/** Ouvre le panneau des notifications ; renvoie le texte de la liste (se rafraîchit à l'ouverture). */
export async function openBell(page: Page) {
  await t(page, "notifications").click();
  await expect(t(page, "notifications-panel")).toBeVisible();
}

export async function closeBell(page: Page) {
  await page.keyboard.press("Escape");
  await expect(t(page, "notifications-panel")).toBeHidden();
}

/** La cloche contient une notification dont le titre contient le texte ; l'ouvre ou non. */
export async function expectNotification(page: Page, text: string | RegExp) {
  await openBell(page);
  await expect(t(page, "notification-item").filter({ hasText: text }).first()).toBeVisible();
}

// --- Effets en base --------------------------------------------------------------------------------

export async function prRow(number: string) {
  return dbOne<{
    id: string;
    status: string;
    kind: string;
    urgency: string;
    priority: number;
    type: string;
    assigned_buyer_id: string | null;
    approved_by_id: string | null;
    created_by_id: string;
    rejected_reason: string | null;
    submitted_at: Date | null;
  }>(
    `SELECT id, status, kind, urgency, priority, type, assigned_buyer_id, approved_by_id, created_by_id, rejected_reason, submitted_at
       FROM purchase_requests WHERE number = $1`,
    [number],
  );
}

export async function prLines(number: string) {
  return dbQuery<{
    line_no: number;
    quantity: string;
    approved_qty: string | null;
    free_designation: string | null;
    name: string | null;
  }>(
    `SELECT l.line_no, l.quantity::text, l.approved_qty::text, l.free_designation, i.name
       FROM purchase_request_lines l JOIN purchase_requests p ON p.id = l.request_id
       LEFT JOIN items i ON i.id = l.item_id WHERE p.number = $1 ORDER BY l.line_no`,
    [number],
  );
}

export async function prEvents(number: string) {
  return dbQuery<{
    type: string;
    from_status: string | null;
    to_status: string | null;
    comment: string | null;
    payload: unknown;
  }>(
    `SELECT e.type, e.from_status, e.to_status, e.comment, e.payload
       FROM purchase_request_events e JOIN purchase_requests p ON p.id = e.request_id WHERE p.number = $1 ORDER BY e.created_at, e.id`,
    [number],
  );
}

export async function notificationsFor(email: string, number: string) {
  return dbQuery<{ type: string; severity: string; title: string; read_at: Date | null }>(
    `SELECT n.type, n.severity, n.title, n.read_at FROM notifications n JOIN users u ON u.id = n.recipient_id
      WHERE u.email = $1 AND n.title LIKE $2 ORDER BY n.created_at`,
    [email, `%${number}%`],
  );
}

export async function auditCount(entityId: string, action: string): Promise<number> {
  const r = await dbOne<{ n: string }>(
    `SELECT count(*)::text AS n FROM audit_logs WHERE entity_id = $1 AND action = $2`,
    [entityId, action],
  );
  return Number(r.n);
}

export async function emailOf(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  return (await dbOne<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [userId])).email;
}

/** Élément visible portant ce data-testid (Next garde les pages précédentes masquées dans le DOM). */
export const t = (page: Page, id: string) => page.locator(`[data-testid="${id}"]:visible`);

/**
 * Acheteur local : DA locale soumise, puis validée par le Responsable (qté inchangées) ; renvoie son numéro.
 * L'utilisateur courant est déconnecté puis reconnecté en acheteur local à la fin si `backToBuyer`.
 */
export async function createValidatedLocalPr(
  page: Page,
  o: { reason: string; lines: LineInput[]; department?: string },
  login: (role: "ACHETEUR_LOCAL" | "RESPONSABLE_ACHATS") => Promise<void>,
  logoutFn: () => Promise<void>,
): Promise<string> {
  await login("ACHETEUR_LOCAL");
  const number = await createAndSubmitPr(page, {
    department: o.department ?? "Administration",
    reason: o.reason,
    neededBy: dayOffset(7),
    type: "LOCAL",
    lines: o.lines,
  });
  await logoutFn();
  await login("RESPONSABLE_ACHATS");
  await openPr(page, number, "a-valider");
  await t(page, "pr-action-approve").click();
  await expect(t(page, "pr-approve-dialog")).toBeVisible();
  await t(page, "pr-approve-confirm").click();
  await expect(t(page, "status-VALIDEE")).toBeVisible();
  await logoutFn();
  return number;
}
