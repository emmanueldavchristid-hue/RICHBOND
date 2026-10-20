import path from "node:path";
import { test, type Page } from "@playwright/test";
import { logout, seedPassword, SEED_EMAILS, type E2ERole } from "../../tests/e2e/helpers/auth";
import { resetLicense } from "../../tests/e2e/helpers/license";

/**
 * Captures de contrôle visuel des écrans de réception (LOT-06) : 1366×768 et tablette 1024×768, clair et sombre.
 * Sortie : docs/captures/receptions/<LxH>/<theme>/<role>-<page>.png
 * Lancer : npm run captures -- scripts/captures/receptions.capture.ts
 */

const OUT = path.join(process.cwd(), "docs", "captures", "receptions");
const VIEWPORTS = [
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1024x768", width: 1024, height: 768 },
];
const THEMES = ["clair", "sombre"] as const;

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(500);
}

async function login(page: Page, role: E2ERole) {
  await page.goto("/connexion");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("login-email").fill(SEED_EMAILS[role]);
  await page.getByTestId("login-password").fill(seedPassword());
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/accueil/);
  await page.getByTestId("trial-continue").click({ timeout: 4000 }).catch(() => undefined);
}

for (const vp of VIEWPORTS) {
  for (const theme of THEMES) {
    test(`receptions ${vp.name} ${theme}`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        locale: "fr-FR",
        timezoneId: "Africa/Abidjan",
        baseURL: "http://localhost:3100",
      });
      await context.addInitScript((t) => {
        try {
          localStorage.setItem("rb-theme", t === "sombre" ? "dark" : "light");
        } catch {
          // ignoré
        }
      }, theme);
      const page = await context.newPage();
      const dir = path.join(OUT, vp.name, theme);
      const snap = async (name: string, fullPage = true) => {
        await settle(page);
        await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage });
      };
      await resetLicense(12);

      // Magasinier : liste, saisie tablette (aucun prix), erreurs de validation.
      await login(page, "MAGASINIER");
      await page.goto("/stock/receptions");
      await snap("magasinier-receptions");
      const receive = page.locator('[data-testid^="rec-receive-"]:visible').first();
      if (await receive.count()) {
        await receive.click();
        await page.waitForURL(/\/stock\/receptions\/nouvelle/);
        await snap("magasinier-saisie");
        await page.getByTestId("rec-submit").click();
        await snap("magasinier-saisie-erreurs");
        const refused = page.locator('[data-testid^="rec-refused-"]').first();
        await refused.fill("1");
        await snap("magasinier-saisie-refus");
      }
      await logout(page);

      // Responsable : liste, fiche réception, non-conformités, fiche BC.
      await login(page, "RESPONSABLE_ACHATS");
      await page.goto("/stock/receptions");
      await snap("responsable-receptions");
      const row = page.locator('[data-testid^="rec-row-"] a').first();
      if (await row.count()) {
        await row.click();
        await page.waitForURL(/\/stock\/receptions\/[^/]+$/);
        await snap("responsable-fiche-reception");
      }
      await page.goto("/stock/receptions/non-conformites");
      await snap("responsable-non-conformites");
      const decide = page.locator('[data-testid^="nc-decide-"]').first();
      if (await decide.count()) {
        await decide.click();
        await page.getByTestId("nc-decision-dialog").waitFor();
        await snap("responsable-decision-nc", false);
        await page.keyboard.press("Escape");
      }
      await page.goto("/achats/commandes?onglet=tous");
      await settle(page);
      await page.locator('[data-testid="po-link"]:visible').first().click();
      await page.waitForURL(/\/achats\/commandes\/[^/]+$/);
      await snap("responsable-bc-fiche");
      await logout(page);
      await context.close();
    });
  }
}
