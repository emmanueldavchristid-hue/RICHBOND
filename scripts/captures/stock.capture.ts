import path from "node:path";
import { test, type Page } from "@playwright/test";
import { logout, seedPassword, SEED_EMAILS, type E2ERole } from "../../tests/e2e/helpers/auth";
import { resetLicense } from "../../tests/e2e/helpers/license";

/**
 * Captures de contrôle visuel des écrans de stock (LOT-07) : 1366×768 et tablette 1024×768, clair et sombre.
 * Sortie : docs/captures/stock/<LxH>/<theme>/<role>-<page>.png
 * Lancer : npm run captures -- scripts/captures/stock.capture.ts
 */

const OUT = path.join(process.cwd(), "docs", "captures", "stock");
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
    test(`stock ${vp.name} ${theme}`, async ({ browser }) => {
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

      // Magasinier : stock sans prix d'achat, sortie tablette (erreurs, stock insuffisant), réappro.
      await login(page, "MAGASINIER");
      await page.goto("/stock/articles");
      await snap("magasinier-articles");
      await page.goto("/stock/sorties");
      await snap("magasinier-sorties");
      await page.goto("/stock/sorties/nouvelle");
      await snap("magasinier-sortie-vide");
      await page.getByTestId("sor-submit").click();
      await snap("magasinier-sortie-erreurs");
      await page.getByTestId("sor-item-search").click();
      const option = page.locator('[data-testid^="sor-item-option-"]').first();
      if (await option.count()) {
        await option.click();
        const qty = page.locator('[data-testid^="sor-qty-"]').first();
        await qty.fill("999999");
        await snap("magasinier-sortie-stock-insuffisant");
      }
      await page.goto("/stock/reappro");
      await snap("magasinier-reappro");
      await page.goto("/stock/mouvements");
      await snap("magasinier-mouvements");
      await logout(page);

      // Responsable : stock avec valeur, mouvements, fiche de stock, dialogues, réappro avec valeurs suggérées.
      await login(page, "RESPONSABLE_ACHATS");
      await page.goto("/stock/articles");
      await snap("responsable-articles");
      await page.goto("/stock/mouvements");
      await snap("responsable-mouvements");
      await page.getByTestId("mvt-transfer").click();
      await page.getByTestId("stk-transfer-dialog").waitFor();
      await page.getByTestId("stk-transfer-qty").click();
      await snap("responsable-dialogue-transfert", false);
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await page.getByTestId("mvt-adjust").click();
      await page.getByTestId("stk-adjust-dialog").waitFor();
      await page.getByTestId("stk-adjust-qty").click();
      await snap("responsable-dialogue-ajustement", false);
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await page.goto("/stock/sorties");
      await snap("responsable-sorties");
      const issue = page.locator('[data-testid="sor-link"]:visible').first();
      if (await issue.count()) {
        await issue.click();
        await page.waitForURL(/\/stock\/sorties\/[^/]+$/);
        await snap("responsable-sortie-fiche");
      }
      await page.goto("/stock/articles");
      await settle(page);
      await page.locator('[data-testid="item-link"]:visible').first().click();
      await page.waitForURL(/\/stock\/articles\/[^/]+$/);
      await page.getByTestId("item-tabs-tab-fiche-de-stock").click();
      await snap("responsable-fiche-de-stock");
      await page.goto("/stock/reappro");
      await snap("responsable-reappro");
      await logout(page);
      await context.close();
    });
  }
}
