import { expect, test, type Page } from "@playwright/test";
import { loginAs, logout } from "../helpers/auth";
import { setTestNow, simulatedAt } from "../helpers/clock";
import { norm, ready, t, title } from "../helpers/da";
import { dbOne, dbQuery } from "../helpers/db";
import { resetLicense, trialEndDay } from "../helpers/license";
import { expectTouchHeight } from "../helpers/rec";

/**
 * S-dashboard – Tableau de bord d'accueil par rôle (LOT-08, EX-60). Desktop et tablette (projets Playwright).
 * Chaque rôle voit son tableau ; chaque carte « à traiter » mène à la liste filtrée correspondante ;
 * le Magasinier ne voit aucun montant ; essai expiré = lecture seule mais tableau affiché.
 * Les compteurs affichés sont comparés à la base (effet métier), jamais à des valeurs figées.
 */

const RISK_ITEM = "Roulement 6205";

const count = async (sql: string, params: unknown[] = []) =>
  Number((await dbOne<{ n: string }>(sql, params)).n);
const cardCount = async (page: Page, key: string) =>
  Number(norm(await t(page, `dash-action-${key}-count`).textContent()).replace(/\s/g, ""));
/** Clic sur le lien étendu de la carte (le testid historique est conservé pour certaines cartes). */
const clickCard = (page: Page, key: string) =>
  page.locator(`[data-dash-link="dash-action-${key}-link"]`).click();

test.beforeEach(async ({ context }) => {
  await resetLicense(30);
  await setTestNow(context, null);
});
test.afterEach(async () => {
  await resetLicense(30);
});

// ---------------------------------------------------------------------------------------------------
test("S-dashboard – Responsable : cartes à traiter, KPI, graphiques, risques de rupture, clic vers la liste filtrée", async ({
  page,
}) => {
  await test.step("Connexion : l'accueil affiche le tableau du Responsable Achats", async () => {
    await loginAs(page, "RESPONSABLE_ACHATS");
    await page.waitForLoadState("networkidle");
    await expect(title(page)).toHaveText("Accueil");
    await expect(t(page, "dash-responsable")).toBeVisible();
    await expect(t(page, "accueil-bonjour")).toContainText("Responsable");
  });

  await test.step("Cartes « à traiter » : les compteurs sont ceux de la base", async () => {
    await expect(t(page, "dash-actions")).toBeVisible();
    expect(await cardCount(page, "da-a-valider")).toBe(
      await count(`SELECT count(*) AS n FROM purchase_requests WHERE status = 'SOUMISE'`),
    );
    expect(await cardCount(page, "bc-a-valider")).toBe(
      await count(`SELECT count(*) AS n FROM purchase_orders WHERE status = 'A_VALIDER'`),
    );
    expect(await cardCount(page, "nc-ouvertes")).toBe(
      await count(`SELECT count(*) AS n FROM non_conformities WHERE status = 'OUVERTE'`),
    );
    await expect(t(page, "dash-action-bc-en-retard")).toBeVisible();
    await expect(t(page, "dash-action-risques-rupture")).toBeVisible();
  });

  await test.step("KPI du mois : montant, nombre de BC, délais, livraisons à temps, valeur du stock (6 au plus)", async () => {
    await expect(t(page, "dash-kpis")).toBeVisible();
    for (const k of [
      "montant-commande",
      "nombre-bc",
      "delai-da-bc",
      "taux-a-temps",
      "valeur-stock",
      "ruptures",
    ]) {
      await expect(t(page, `dash-kpi-${k}`)).toBeVisible();
    }
    await expect(t(page, "dash-kpi-montant-commande-value")).toContainText("FCFA");
    await expect(t(page, "dash-kpi-valeur-stock-value")).toContainText("FCFA");
    await expect(t(page, "dash-kpi-taux-a-temps-value")).toContainText("%");
    await expect(
      t(page, "dash-kpis").locator('[data-testid^="dash-kpi-"][data-testid$="-value"]'),
    ).toHaveCount(6);
  });

  await test.step("Graphiques : achats par mois, top fournisseurs, valeur du stock par catégorie", async () => {
    await expect(t(page, "dash-purchases")).toBeVisible();
    await expect(t(page, "dash-chart-purchases")).toBeVisible();
    await expect(t(page, "dash-suppliers")).toBeVisible();
    await expect(t(page, "dash-chart-suppliers")).toBeVisible();
    await expect(t(page, "dash-stock-value")).toBeVisible();
    await expect(t(page, "dash-chart-stock")).toBeVisible();
    await expect(t(page, "dash-chart-purchases").locator("svg").first()).toBeVisible(); // le graphique est réellement dessiné
  });

  await test.step("Risques de rupture : le Roulement 6205 (critique) est listé, aucun article en couverture confortable", async () => {
    const code = (await dbOne<{ code: string }>(`SELECT code FROM items WHERE name = $1`, [RISK_ITEM])).code;
    await expect(t(page, "dash-rupture")).toBeVisible();
    await expect(t(page, "dash-rupture-table")).toBeVisible();
    const row = t(page, `dash-rupture-row-${code}`);
    await expect(row).toBeVisible();
    await expect(row).toContainText(RISK_ITEM);
    // Le bruit (sévérité VERT, ex. Roulement 6308 : 207 jours de couverture) n'est pas affiché.
    const quiet = await dbQuery<{ code: string }>(`SELECT code FROM items WHERE name = 'Roulement 6308'`);
    for (const q of quiet) await expect(t(page, `dash-rupture-row-${q.code}`)).toHaveCount(0);
    expect(await cardCount(page, "risques-rupture")).toBeGreaterThanOrEqual(1);
  });

  await test.step("Clic sur « DA à valider » : liste des DA filtrée sur l'onglet « à valider », même compteur", async () => {
    const n = await cardCount(page, "da-a-valider");
    await clickCard(page, "da-a-valider");
    await expect(page).toHaveURL(/\/achats\/demandes\?.*onglet=a-valider/);
    await expect(title(page)).toHaveText("Demandes d'achat");
    await expect(t(page, "pr-tab-a-valider")).toHaveAttribute("aria-selected", "true");
    if (n > 0) await expect(t(page, "pr-tab-a-valider-count")).toHaveText(String(n));
  });

  await test.step("Clic sur « BC en retard » : liste des BC sur l'onglet « en retard »", async () => {
    await ready(page, "/accueil");
    await clickCard(page, "bc-en-retard");
    await expect(page).toHaveURL(/\/achats\/commandes\?.*onglet=en-retard/);
    await expect(t(page, "po-tab-en-retard")).toHaveAttribute("aria-selected", "true");
  });

  await test.step("Clic sur « Non-conformités ouvertes » puis sur « risques de rupture » : écrans correspondants", async () => {
    await ready(page, "/accueil");
    await clickCard(page, "nc-ouvertes");
    await expect(page).toHaveURL(/\/stock\/receptions\/non-conformites/);
    await ready(page, "/accueil");
    await clickCard(page, "risques-rupture");
    await expect(page).toHaveURL(/\/stock\/reappro/);
    await expect(title(page)).toHaveText("Réapprovisionnement");
  });
});

// ---------------------------------------------------------------------------------------------------
test("S-dashboard – Acheteur : uniquement ses DA et ses BC, bouton Relancer, pas le tableau du Responsable", async ({
  page,
}, testInfo) => {
  const email = "acheteur.local@richbond.test";
  let myDa: { number: string }[] = [];
  let lateOrder: { id: string; number: string } | undefined;

  await test.step("Connexion Acheteur local : tableau Acheteur, ni KPI ni graphiques du Responsable", async () => {
    await loginAs(page, "ACHETEUR_LOCAL");
    await page.waitForLoadState("networkidle");
    await expect(t(page, "dash-acheteur")).toBeVisible();
    await expect(t(page, "dash-responsable")).toHaveCount(0);
    await expect(t(page, "dash-kpis")).toHaveCount(0);
    await expect(t(page, "dash-chart-purchases")).toHaveCount(0);
    await expect(t(page, "dash-rupture")).toHaveCount(0);
  });

  await test.step("Mes DA : seulement celles qui me sont assignées (jamais celles de l'autre acheteur)", async () => {
    myDa = await dbQuery<{ number: string }>(
      `SELECT p.number FROM purchase_requests p JOIN users u ON u.id = p.assigned_buyer_id
        WHERE u.email = $1 AND p.status IN ('VALIDEE','EN_CONSULTATION','PARTIELLEMENT_COMMANDEE')`,
      [email],
    );
    const others = await dbQuery<{ number: string }>(
      `SELECT p.number FROM purchase_requests p JOIN users u ON u.id = p.assigned_buyer_id
        WHERE u.email <> $1 AND p.status IN ('VALIDEE','EN_CONSULTATION','PARTIELLEMENT_COMMANDEE')`,
      [email],
    );
    expect(myDa.length).toBeGreaterThan(0);
    expect(await cardCount(page, "mes-da")).toBe(myDa.length);
    await expect(t(page, "dash-my-requests")).toBeVisible();
    for (const d of myDa) await expect(t(page, `dash-request-${d.number}`)).toBeVisible();
    for (const d of others) await expect(t(page, `dash-request-${d.number}`)).toHaveCount(0);
  });

  await test.step("Mes BC en retard : le BC envoyé et dépassé est listé avec « Relancer » ; aucun BC d'un autre acheteur", async () => {
    lateOrder = await dbOne<{ id: string; number: string }>(
      `SELECT o.id, o.number FROM purchase_orders o JOIN users u ON u.id = o.created_by_id
        WHERE u.email = $1 AND o.status = 'ENVOYE' AND o.expected_date < now() ORDER BY o.expected_date LIMIT 1`,
      [email],
    );
    await expect(t(page, "dash-orders-late")).toBeVisible();
    await expect(t(page, "dash-orders-late")).toContainText(lateOrder.number);
    await expect(t(page, "dash-orders-late")).toContainText(/retard/i);
    const foreign = await dbQuery<{ number: string }>(
      `SELECT o.number FROM purchase_orders o JOIN users u ON u.id = o.created_by_id
        WHERE u.email <> $1 AND o.status IN ('VALIDE','ENVOYE') AND o.number IS NOT NULL`,
      [email],
    );
    for (const f of foreign) await expect(page.getByTestId("dash-acheteur")).not.toContainText(f.number);
    await expect(page.getByTestId("dash-acheteur")).not.toContainText("Nouvelle commande");
  });

  await test.step("Relancer : le bouton ouvre la fenêtre de relance du BC (texte prêt à copier), rien n'est écrit tant qu'on ne confirme pas", async () => {
    const before = await dbOne<{ r: string | null }>(
      `SELECT last_reminded_at::text AS r FROM purchase_orders WHERE id = $1`,
      [lateOrder!.id],
    );
    const button = t(page, `dash-remind-${lateOrder!.id}`).first();
    await expect(button).toBeVisible();
    await expect(button).toContainText("Relancer");
    if (testInfo.project.name === "tablette")
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(36);
    await button.click();
    await expect(t(page, "po-remind-dialog")).toBeVisible();
    await expect(t(page, "po-remind-dialog")).toContainText(lateOrder!.number);
    await t(page, "po-remind-cancel").click();
    await expect(t(page, "po-remind-dialog")).toBeHidden();
    const after = await dbOne<{ r: string | null }>(
      `SELECT last_reminded_at::text AS r FROM purchase_orders WHERE id = $1`,
      [lateOrder!.id],
    );
    expect(after.r).toBe(before.r);
  });

  await test.step("Clic sur « Mes DA » : liste des DA sur l'onglet « assignées »", async () => {
    await clickCard(page, "mes-da");
    await expect(page).toHaveURL(/\/achats\/demandes\?.*onglet=assignees/);
    await expect(title(page)).toHaveText("Demandes d'achat");
  });

  await test.step("Clic sur « BC en retard » : liste des BC en retard limitée à mes commandes", async () => {
    await ready(page, "/accueil");
    await clickCard(page, "mes-bc-en-retard");
    await expect(page).toHaveURL(/\/achats\/commandes\?.*onglet=en-retard/);
    await expect(page).toHaveURL(/acheteur=/);
    await expect(t(page, "po-tab-en-retard")).toHaveAttribute("aria-selected", "true");
  });
});

// ---------------------------------------------------------------------------------------------------
test("S-dashboard – Magasinier : gros boutons, réceptions et sorties, aucun montant (texte et HTML)", async ({
  page,
}, testInfo) => {
  const tablet = testInfo.project.name === "tablette";

  await test.step("Connexion Magasinier : tableau Magasinier, rien du Responsable ni de l'Acheteur", async () => {
    await loginAs(page, "MAGASINIER");
    await page.waitForLoadState("networkidle");
    await expect(t(page, "dash-magasinier")).toBeVisible();
    for (const id of ["dash-responsable", "dash-acheteur", "dash-kpis", "dash-rupture"])
      await expect(t(page, id)).toHaveCount(0);
  });

  await test.step("Gros boutons « Recevoir une livraison » et « Enregistrer une sortie » (zone tactile ≥ 44 px, 56 px visés)", async () => {
    await expect(t(page, "dash-new-receipt")).toContainText("Recevoir une livraison");
    await expect(t(page, "dash-new-issue")).toContainText("Enregistrer une sortie");
    await expectTouchHeight(page, "dash-new-receipt", tablet ? 52 : 44);
    await expectTouchHeight(page, "dash-new-issue", tablet ? 52 : 44);
  });

  await test.step("Cartes et listes du magasin : réceptions attendues, articles sous le point de commande, dernières sorties", async () => {
    await expect(t(page, "dash-actions")).toBeVisible();
    await expect(t(page, "dash-action-livraisons-aujourdhui")).toBeVisible();
    await expect(t(page, "dash-action-sous-seuil")).toBeVisible();
    await expect(t(page, "dash-expected-today")).toBeVisible();
    await expect(t(page, "dash-expected-week")).toBeVisible();
    await expect(t(page, "dash-below-reorder")).toBeVisible();
    await expect(t(page, "dash-recent-issues")).toBeVisible();
    const lastIssue = await dbQuery<{ number: string }>(
      `SELECT number FROM stock_issues WHERE status = 'VALIDEE' ORDER BY issued_at DESC, created_at DESC LIMIT 1`,
    );
    if (lastIssue.length > 0) await expect(t(page, `dash-issue-${lastIssue[0].number}`)).toBeVisible();
    else await expect(t(page, "dash-recent-issues")).toContainText("Aucune sortie enregistrée"); // seed sans sortie : état vide explicite
    if (tablet)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); // pas de défilement horizontal
  });

  await test.step("Aucun montant : ni dans le texte affiché ni dans le HTML livré (FCFA, PMP, prix, valeur)", async () => {
    const text = norm(await t(page, "dash-magasinier").innerText());
    expect(text).not.toMatch(/FCFA|\bXOF\b|PMP|prix|montant|valeur/i);
    const html = await page.content();
    expect(html).not.toMatch(/FCFA|\bXOF\b|totalXof|estimatedTotal|unitCost|\bpmp\b|valueXof/);
    expect(html).not.toMatch(/\d[\d  ]*\s?FCFA/);
  });

  await test.step("Clic sur la carte « sous le point de commande » : stock filtré sur cette situation", async () => {
    await clickCard(page, "sous-seuil");
    await expect(page).toHaveURL(/\/stock\?.*situation=SOUS_POINT/);
  });

  await test.step("Clic sur « Recevoir une livraison » : écran de réception", async () => {
    await ready(page, "/accueil");
    await t(page, "dash-new-receipt").click();
    await expect(page).toHaveURL(/\/stock\/receptions\/nouvelle/);
  });
});

// ---------------------------------------------------------------------------------------------------
test.describe("S-dashboard – Essai expiré : lecture seule, mais le tableau s'affiche", () => {
  test("Responsable, Acheteur et Magasinier voient leur tableau ; les actions d'écriture sont désactivées ; rien ne change en base", async ({
    page,
    context,
  }) => {
    let reminded0 = "";
    const remindedCount = async () =>
      (
        await dbOne<{ n: string }>(
          `SELECT count(*)::text AS n FROM purchase_orders WHERE last_reminded_at IS NOT NULL`,
        )
      ).n;

    await test.step("Après la fin d'essai : le Responsable se connecte, bandeau « lecture seule », cartes, KPI et risques affichés", async () => {
      reminded0 = await remindedCount();
      await setTestNow(context, simulatedAt(trialEndDay(30), -1, "08:00"));
      await loginAs(page, "RESPONSABLE_ACHATS");
      await expect(t(page, "read-only-banner")).toBeVisible();
      await expect(t(page, "dash-responsable")).toBeVisible();
      await expect(t(page, "dash-actions")).toBeVisible();
      await expect(t(page, "dash-kpis")).toBeVisible();
      await expect(t(page, "dash-rupture")).toBeVisible();
      await expect(page.getByText("Une erreur est survenue")).toHaveCount(0);
    });

    await test.step("Les cartes restent des liens de consultation vers les listes", async () => {
      await clickCard(page, "da-a-valider");
      await expect(page).toHaveURL(/\/achats\/demandes\?.*onglet=a-valider/);
      await expect(t(page, "read-only-banner")).toBeVisible();
    });

    await test.step("Acheteur : tableau affiché, bouton « Relancer » désactivé", async () => {
      await logout(page);
      await loginAs(page, "ACHETEUR_LOCAL");
      await expect(t(page, "read-only-banner")).toBeVisible();
      await expect(t(page, "dash-acheteur")).toBeVisible();
      const buttons = page.locator('[data-testid^="dash-remind-"]:visible');
      expect(await buttons.count()).toBeGreaterThan(0);
      for (const b of await buttons.all()) await expect(b).toBeDisabled();
    });

    await test.step("Magasinier : tableau affiché, toujours sans montant", async () => {
      await logout(page);
      await loginAs(page, "MAGASINIER");
      await expect(t(page, "read-only-banner")).toBeVisible();
      await expect(t(page, "dash-magasinier")).toBeVisible();
      await expect(t(page, "dash-recent-issues")).toBeVisible();
      expect(await page.content()).not.toMatch(/FCFA|\bXOF\b/);
    });

    await test.step("Rien n'a changé en base : aucune relance enregistrée", async () => {
      expect(await remindedCount()).toBe(reminded0);
    });
  });
});
