import path from "node:path";
import { test, type Page } from "@playwright/test";
import { logout, seedPassword, SEED_EMAILS, type E2ERole } from "../../tests/e2e/helpers/auth";
import { resetLicense } from "../../tests/e2e/helpers/license";

/**
 * Captures de contrôle visuel (DESIGN.md §7) : 1366×768 et 1920×1080, thème clair et sombre,
 * pages principales par rôle. Sortie : docs/captures/<LxH>/<theme>/<role>-<page>.png
 * Lancer : npm run captures   (filtre : npm run captures -- -g "1366x768 clair")
 */

const OUT = path.join(process.cwd(), "docs", "captures");
const VIEWPORTS = [
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1920x1080", width: 1920, height: 1080 },
];
const THEMES = ["clair", "sombre"] as const;

interface Shot {
  /** Nom du fichier (sans extension). */
  name: string;
  url: string;
  fullPage?: boolean;
  /** Joué dans toutes les combinaisons ; sinon seulement 1366×768. */
  core?: boolean;
  /** Ouvre la première fiche de la liste (lien portant ce data-testid). */
  openFirst?: string;
}

const ROLE_SHOTS: Record<string, { role: E2ERole; shots: Shot[] }> = {
  responsable: {
    role: "RESPONSABLE_ACHATS",
    shots: [
      { name: "accueil", url: "/accueil", core: true },
      { name: "da-liste", url: "/achats/demandes?onglet=a-valider", core: true },
      { name: "da-toutes", url: "/achats/demandes?onglet=toutes" },
      { name: "da-fiche", url: "/achats/demandes?onglet=toutes", openFirst: "pr-link", fullPage: true, core: true },
      { name: "da-nouvelle", url: "/achats/demandes/nouvelle", fullPage: true },
      { name: "bc-liste", url: "/achats/commandes?onglet=tous", core: true },
      { name: "bc-fiche", url: "/achats/commandes?onglet=tous", openFirst: "po-link", fullPage: true, core: true },
      { name: "a-commander", url: "/achats/commandes/a-commander" },
      { name: "articles", url: "/stock/articles", core: true },
      { name: "article-fiche", url: "/stock/articles", openFirst: "item-link", fullPage: true },
      { name: "fournisseurs", url: "/fournisseurs" },
      { name: "fournisseur-fiche", url: "/fournisseurs", openFirst: "supplier-link", fullPage: true },
      { name: "utilisateurs", url: "/parametres/utilisateurs" },
      { name: "journal", url: "/parametres/journal" },
      { name: "parametres", url: "/parametres" },
      { name: "reglages", url: "/parametres/reglages", fullPage: true },
      { name: "devises", url: "/parametres/devises" },
      { name: "depots", url: "/parametres/depots" },
      { name: "services", url: "/parametres/services" },
      { name: "mon-compte", url: "/mon-compte" },
      { name: "rapports", url: "/rapports" },
      { name: "stock", url: "/stock" },
    ],
  },
  acheteur: {
    role: "ACHETEUR_LOCAL",
    shots: [
      { name: "accueil", url: "/accueil", core: true },
      { name: "da-assignees", url: "/achats/demandes?onglet=assignees" },
      { name: "a-commander", url: "/achats/commandes/a-commander" },
      { name: "bc-liste", url: "/achats/commandes?onglet=en-cours" },
      { name: "fournisseurs", url: "/fournisseurs" },
    ],
  },
  magasinier: {
    role: "MAGASINIER",
    shots: [
      { name: "accueil", url: "/accueil", core: true },
      { name: "da-mes-demandes", url: "/achats/demandes?onglet=mes-demandes" },
      { name: "da-nouvelle", url: "/achats/demandes/nouvelle", fullPage: true },
      { name: "articles", url: "/stock/articles" },
    ],
  },
  admin: {
    role: "SUPER_ADMIN",
    shots: [
      { name: "licence", url: "/parametres/licence", core: true },
      { name: "utilisateurs", url: "/parametres/utilisateurs" },
      { name: "journal", url: "/parametres/journal" },
    ],
  },
};

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(500);
}

for (const vp of VIEWPORTS) {
  for (const theme of THEMES) {
    test(`captures ${vp.name} ${theme}`, async ({ browser }) => {
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
      const snap = async (name: string, fullPage = false) => {
        await settle(page);
        await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage });
      };
      const all = vp.name === "1366x768";
      await resetLicense(12);

      // Connexion (non connecté), puis erreur d'identifiants.
      await page.goto("/connexion");
      await settle(page);
      await snap("connexion");
      await page.getByTestId("login-email").fill("responsable@richbond.test");
      await page.getByTestId("login-password").fill("incorrect");
      await page.getByTestId("login-submit").click();
      await page.getByTestId("login-error").waitFor();
      await snap("connexion-erreur");

      for (const [key, group] of Object.entries(ROLE_SHOTS)) {
        const shots = group.shots.filter((s) => all || s.core);
        if (shots.length === 0) continue;
        await page.goto("/connexion");
        await page.waitForLoadState("networkidle");
        await page.getByTestId("login-email").fill(SEED_EMAILS[group.role]);
        await page.getByTestId("login-password").fill(seedPassword());
        await page.getByTestId("login-submit").click();
        await page.waitForURL(/\/accueil/);
        // La fenêtre d'essai s'affiche à la première connexion : on la capture avant de la fermer.
        if (key === "responsable") {
          await page.getByTestId("trial-dialog").waitFor();
          await snap("fenetre-essai");
        }
        await page.getByTestId("trial-continue").click({ timeout: 4000 }).catch(() => undefined);
        for (const s of shots) {
          await page.goto(s.url);
          await settle(page);
          if (s.openFirst) {
            await page.locator(`[data-testid="${s.openFirst}"]:visible`).first().click();
            await page.waitForURL((u) => /\/(achats\/(demandes|commandes)|stock\/articles|fournisseurs)\/[^/]+$/.test(u.pathname));
          }
          await snap(`${key}-${s.name}`, s.fullPage ?? false);
        }
        if (key === "responsable") {
          await page.goto("/accueil");
          await settle(page);
          await page.keyboard.press("Control+k");
          await page.getByTestId("global-search-input").fill("DA-");
          await page.getByTestId("global-search-result").first().waitFor().catch(() => undefined);
          await snap("responsable-recherche-globale");
          await page.keyboard.press("Escape");
          await page.getByTestId("notifications").click();
          await snap("responsable-notifications");
          await page.keyboard.press("Escape");
        }
        await logout(page);
      }
      await context.close();
    });
  }
}
