import path from "node:path";
import { test, type Page } from "@playwright/test";
import { logout, seedPassword, SEED_EMAILS, type E2ERole } from "../../tests/e2e/helpers/auth";
import { resetLicense } from "../../tests/e2e/helpers/license";

/**
 * Captures des écrans clés de la démonstration (docs/demo-1.md), thème clair, 1366×768 et tablette 1024×768.
 * Sortie (JPEG léger) : docs/captures/ecrans-cles/<LxH>/<nom>.jpg
 * Lancer : npm run captures -- scripts/captures/ecrans-cles.capture.ts
 */

const OUT = path.join(process.cwd(), "docs", "captures", "ecrans-cles");
const VIEWPORTS = [
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1024x768", width: 1024, height: 768 },
];

interface Shot {
  name: string;
  url: string;
  /** Ouvre le premier lien dont l'adresse correspond (ex. fiche détail). */
  openHref?: RegExp;
  /** Ajoute ce suffixe de requête après ouverture (ex. onglet). */
  suffix?: string;
  fullPage?: boolean;
}

const GROUPS: { role: E2ERole; prefix: string; shots: Shot[] }[] = [
  {
    role: "RESPONSABLE_ACHATS",
    prefix: "resp",
    shots: [
      { name: "accueil", url: "/accueil" },
      { name: "da-liste", url: "/achats/demandes?onglet=toutes" },
      { name: "da-fiche", url: "/achats/demandes?onglet=toutes", openHref: /^\/achats\/demandes\/[^/]+$/, fullPage: true },
      { name: "bc-liste", url: "/achats/commandes?onglet=tous" },
      { name: "bc-fiche", url: "/achats/commandes?onglet=tous", openHref: /^\/achats\/commandes\/[^/]+$/, fullPage: true },
      { name: "receptions", url: "/stock/receptions" },
      { name: "stock", url: "/stock" },
      { name: "factures", url: "/achats/factures" },
      { name: "facture-rapprochement", url: "/achats/factures", openHref: /^\/achats\/factures\/(?!nouvelle)[^/]+$/, fullPage: true },
      { name: "import-liste", url: "/import" },
      { name: "import-detail", url: "/import", openHref: /^\/import\/(?!nouveau)[^/]+$/, fullPage: true },
      { name: "import-frais", url: "/import", openHref: /^\/import\/(?!nouveau)[^/]+$/, suffix: "?onglet=frais", fullPage: true },
      { name: "import-cout", url: "/import", openHref: /^\/import\/(?!nouveau)[^/]+$/, suffix: "?onglet=cout", fullPage: true },
      { name: "rapport-quotidien", url: "/rapports/quotidien", fullPage: true },
      { name: "rapport-hebdomadaire", url: "/rapports/hebdomadaire", fullPage: true },
      { name: "rapport-mensuel", url: "/rapports/mensuel", fullPage: true },
      { name: "notifications", url: "/notifications" },
    ],
  },
  {
    role: "ACHETEUR_LOCAL",
    prefix: "ach",
    shots: [
      { name: "accueil", url: "/accueil" },
      { name: "a-commander", url: "/achats/commandes/a-commander" },
    ],
  },
  {
    role: "MAGASINIER",
    prefix: "mag",
    shots: [
      { name: "accueil", url: "/accueil" },
      { name: "reception-nouvelle", url: "/stock/receptions/nouvelle" },
      { name: "sortie-nouvelle", url: "/stock/sorties/nouvelle" },
      { name: "inventaires", url: "/stock/inventaires" },
      { name: "inventaire-comptage", url: "/stock/inventaires", openHref: /^\/stock\/inventaires\/[^/]+\/comptage$/, fullPage: true },
    ],
  },
];

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
}

for (const vp of VIEWPORTS) {
  test(`écrans clés ${vp.name}`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: "fr-FR",
      timezoneId: "Africa/Abidjan",
      baseURL: "http://localhost:3100",
    });
    await context.addInitScript(() => {
      try {
        localStorage.setItem("rb-theme", "light");
      } catch {
        // ignoré
      }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    const dir = path.join(OUT, vp.name);
    const snap = async (name: string, fullPage = false) => {
      await settle(page);
      await page.screenshot({ path: path.join(dir, `${name}.jpg`), type: "jpeg", quality: 70, fullPage });
    };
    // Essai à 12 jours : bandeau et fenêtre de compte à rebours visibles.
    await resetLicense(12);

    await page.goto("/connexion");
    await settle(page);
    await snap("connexion");

    for (const g of GROUPS) {
      await login(page, g.role);
      if (g.role === "RESPONSABLE_ACHATS") {
        await page.getByTestId("trial-dialog").waitFor().catch(() => undefined);
        await snap("essai-fenetre");
      }
      await page.getByTestId("trial-continue").click({ timeout: 4000 }).catch(() => undefined);
      for (const s of g.shots) {
        try {
          await page.goto(s.url);
          await settle(page);
          if (s.openHref) {
            const re = s.openHref;
            const hrefs = await page.locator("a[href]:visible").evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
            const target = hrefs.find((h) => re.test(h));
            if (!target) throw new Error(`aucun lien pour ${s.name}`);
            await page.goto(target + (s.suffix ?? ""));
            await settle(page);
          }
          await snap(`${g.prefix}-${s.name}`, s.fullPage ?? false);
        } catch (e) {
          console.log(`ECHEC ${vp.name} ${g.prefix}-${s.name}: ${(e as Error).message.split("\n")[0]}`);
        }
      }
      await logout(page);
    }
    await context.close();
  });
}
