import { expect, test } from "@playwright/test";
import { loginAs, SEED_EMAILS } from "../helpers/auth";
import { setTestNow } from "../helpers/clock";
import { dbOne, dbQuery } from "../helpers/db";
import { resetLicense } from "../helpers/license";

/**
 * S7 – Alertes (LOT-16) : centre de notifications, bandeau des alertes critiques non lues,
 * digest quotidien par rôle via /api/cron/alertes (secret fictif injecté dans playwright.config.ts).
 */

const CRON_SECRET = "e2e-only-cron-secret-0123456789abcdef";
const PREFIX = "S7 – ";
const EMAIL = SEED_EMAILS.ACHETEUR_LOCAL;

async function userId(email: string): Promise<string> {
  return (await dbOne<{ id: string }>("SELECT id FROM users WHERE email = $1", [email])).id;
}

async function clean() {
  await dbQuery("DELETE FROM notifications WHERE title LIKE $1 OR entity = 'digest'", [`${PREFIX}%`]);
}

async function seedNotifications(uid: string) {
  const rows: [string, string][] = [
    ["CRITIQUE", "Rupture imminente"],
    ["CRITIQUE", "BC très en retard"],
    ["IMPORTANT", "Livraison à confirmer"],
    ["INFO", "Rappel de routine"],
  ];
  for (const [sev, label] of rows) {
    await dbQuery(
      `INSERT INTO notifications (id, recipient_id, type, severity, title, link, created_at)
       VALUES ('s7-' || md5(random()::text), $1, 'TEST', $2::"NotificationSeverity", $3, '/accueil', now())`,
      [uid, sev, `${PREFIX}${label}`],
    );
  }
}

test.beforeEach(async ({ context }) => {
  await resetLicense(30);
  await setTestNow(context, null);
  await clean();
});
test.afterEach(async () => {
  await clean();
  await resetLicense(30);
});

test("S7 – Centre de notifications : compteur, filtre gravité, lecture, bandeau critique", async ({ page }) => {
  const uid = await userId(EMAIL);
  const before = Number(
    (await dbOne<{ n: string }>("SELECT count(*)::text AS n FROM notifications WHERE recipient_id = $1 AND read_at IS NULL", [uid])).n,
  );
  await seedNotifications(uid);
  await loginAs(page, "ACHETEUR_LOCAL");

  // Compteur de la cloche et bandeau critique.
  await expect(page.getByTestId("notifications-count")).toHaveText(String(before + 4));
  await expect(page.getByTestId("unread-critical-banner")).toContainText(/Vous avez \d+ alertes? critiques? non lues?/);

  // Cloche -> « Voir toutes » -> page.
  await page.getByTestId("notifications").click();
  await page.getByTestId("notifications-see-all").click();
  await expect(page).toHaveURL(/\/notifications/);
  await expect(page.getByTestId("notification-row").filter({ hasText: PREFIX })).toHaveCount(4);

  // Filtre gravité critique.
  await page.getByTestId("filter-gravite-CRITIQUE").click();
  await expect(page).toHaveURL(/gravite=CRITIQUE/);
  const rows = page.getByTestId("notification-row");
  await expect(rows.filter({ hasText: PREFIX })).toHaveCount(2);
  await expect(page.getByText(`${PREFIX}Rappel de routine`)).toHaveCount(0);

  // Lien du bandeau -> même filtre.
  await page.goto("/accueil");
  await page.getByTestId("unread-critical-banner-link").click();
  await expect(page).toHaveURL(/gravite=CRITIQUE/);

  // Marquer lu au clic, puis arrivée sur le lien.
  await rows.filter({ hasText: `${PREFIX}Rupture imminente` }).click();
  await expect(page).toHaveURL(/\/accueil/);
  const read = await dbOne<{ read_at: Date | null }>("SELECT read_at FROM notifications WHERE title = $1", [`${PREFIX}Rupture imminente`]);
  expect(read.read_at).not.toBeNull();

  // Tout marquer comme lu : plus de compteur ni de bandeau.
  await page.goto("/notifications");
  await page.getByTestId("notifications-page-mark-all").click();
  await expect(page.getByTestId("notifications-page-unread")).toHaveText(/^0 non lue/);
  await page.goto("/accueil");
  await expect(page.getByTestId("notifications-count")).toHaveCount(0);
  await expect(page.getByTestId("unread-critical-banner")).toHaveCount(0);
});

test("S7 – Digest quotidien : un par rôle, aucun doublon au second appel", async ({ page, context }) => {
  // Créneau du matin simulé : 08:00 Abidjan (= UTC) un jour ouvré.
  await setTestNow(context, new Date().toISOString().slice(0, 10) + "T08:00:00.000Z");
  await loginAs(page, "RESPONSABLE_ACHATS");

  const call = (secret: string | null) =>
    page.request.get("/api/cron/alertes", { headers: secret ? { Authorization: `Bearer ${secret}` } : {}, failOnStatusCode: false });

  expect((await call(null)).status()).toBe(401);
  expect((await call("mauvais-secret")).status()).toBe(401);

  const first = await call(CRON_SECRET);
  expect(first.ok()).toBe(true);
  const digests = () =>
    dbQuery<{ role: string; n: string }>(
      `SELECT u.role::text AS role, count(*)::text AS n FROM notifications n JOIN users u ON u.id = n.recipient_id
        WHERE n.entity = 'digest' GROUP BY u.role`,
    );
  const afterFirst = await digests();
  expect(afterFirst.length).toBeGreaterThanOrEqual(3); // Responsable, Acheteur, Magasinier
  for (const r of afterFirst) expect(Number(r.n)).toBe(r.role === "ACHETEUR" ? 2 : 1);

  const second = await call(CRON_SECRET);
  expect(second.ok()).toBe(true);
  expect(await digests()).toEqual(afterFirst);

  // Le digest apparaît dans la cloche du Responsable.
  await page.goto("/notifications");
  await expect(page.getByTestId("notification-row").first()).toBeVisible();
});
