import { expect, test } from "@playwright/test";
import { loginAs, logout } from "../helpers/auth";
import { setTestNow, simulatedAt } from "../helpers/clock";
import {
  auditCount,
  expectNotification,
  norm,
  notificationsFor,
  prLines,
  prRow,
  ready,
  t,
  title,
} from "../helpers/da";
import { dbOne, dbQuery } from "../helpers/db";
import { resetLicense, trialEndDay } from "../helpers/license";
import { expectTouchHeight } from "../helpers/rec";
import {
  AJU_NUMBER,
  auditTotal,
  itemRow,
  levelsOf,
  movementCount,
  movementsOfRef,
  openRequestsOf,
  setRequestStatus,
  SOR_NUMBER,
  TRF_NUMBER,
} from "../helpers/stock";

/**
 * S3 – Rupture anticipée et réappro (LOT-07, EX-31). Desktop et tablette (projets Playwright).
 * Article critique : « Roulement 6205 » du seed (stock 25 U, point de commande 40 U, délai 20 jours, ~1,4 U/jour).
 * Chaque étape vérifie l'interface et l'effet métier en base (stock, mouvement, DA, audit, notification).
 */

const ITEM = "Roulement 6205";
const PDR = "MAGASIN PDR";
const CENTRAL = "MAGASIN CENTRAL";

let itemId = "";
let code = "";
let snapshot: { id: string; status: string }[] = [];

test.beforeEach(async ({ context }) => {
  await resetLicense(30);
  await setTestNow(context, null);
  const it = await itemRow(ITEM);
  itemId = it.id;
  code = it.code;
  // Arrangement : la DA de démo (validée) qui porte déjà l'article le signalerait « en cours » avant l'heure ; on la met de côté.
  snapshot = await openRequestsOf(itemId);
  for (const r of snapshot) await setRequestStatus(r.id, "ANNULEE");
});

test.afterEach(async () => {
  // Les DA de réappro créées par le scénario sont annulées ; celles du seed retrouvent leur statut.
  const created = await dbQuery<{ id: string }>(
    `SELECT DISTINCT p.id FROM purchase_requests p JOIN purchase_request_lines l ON l.request_id = p.id
      WHERE l.item_id = $1 AND p.kind = 'REAPPRO' AND p.status = 'SOUMISE'`,
    [itemId],
  );
  for (const r of created) await setRequestStatus(r.id, "ANNULEE");
  for (const r of snapshot) await setRequestStatus(r.id, r.status);
  await resetLicense(30);
});

// ---------------------------------------------------------------------------------------------------
test("S3 – Article critique : sortie (refus puis succès), réappro en DA, transfert, ajustement réservé au Responsable", async ({
  page,
}, testInfo) => {
  const tablet = testInfo.project.name === "tablette";
  const tag = `S3${testInfo.project.name.slice(0, 3).toUpperCase()}${Date.now()}`;
  let stock0 = 0;
  let issueNumber = "";
  let daNumber = "";
  let suggested = "";

  await test.step("Constat : l'article critique est sous son point de commande, couverture rouge, sur l'écran Articles et stock", async () => {
    stock0 = (await levelsOf(itemId))[PDR];
    expect(stock0).toBeGreaterThan(5);
    expect(stock0).toBeLessThan(40);
    await loginAs(page, "MAGASINIER");
    await ready(page, `/stock/articles?q=${encodeURIComponent(code)}`);
    await expect(title(page)).toHaveText("Articles et stock");
    const row = t(page, `article-row-${code}`);
    await expect(row).toBeVisible();
    const total = Object.values(await levelsOf(itemId)).reduce((x, y) => x + y, 0); // la liste affiche le total de tous les dépôts
    await expect(t(page, `stk-onhand-${code}`)).toContainText(`${total} U`);
    await expect(t(page, `stk-coverage-${code}`)).toHaveAttribute("data-tone", "red");
    expect(norm(await page.locator("main").innerText())).not.toMatch(/prix d'achat|dernier prix/i); // PMP visible au Magasinier (droit price.viewPmp), jamais le prix d'achat
    await expect(t(page, "stk-abc-recompute")).toHaveCount(0); // « Recalculer » est réservé au Responsable
  });

  await test.step("Sortie – formulaire incomplet : chaque champ obligatoire est signalé, rien n'est écrit", async () => {
    const mv0 = await movementCount(itemId);
    await ready(page, "/stock/sorties/nouvelle");
    await expect(t(page, "sor-form")).toBeVisible();
    await t(page, "sor-submit").click();
    await expect(page.getByText("Choisissez le service demandeur.")).toBeVisible();
    await expect(page.getByText("Indiquez le nom du demandeur.")).toBeVisible();
    await expect(page.getByText("Indiquez le motif de la sortie.")).toBeVisible();
    await expect(page.getByText("Ajoutez au moins un article à sortir.")).toBeVisible();
    await expect(t(page, "sor-confirm")).toHaveCount(0);
    expect(await movementCount(itemId)).toBe(mv0);
  });

  await test.step("Sortie – quantité supérieure au stock : message clair, validation bloquée, aucun mouvement", async () => {
    const mv0 = await movementCount(itemId);
    await t(page, "sor-warehouse").selectOption({ label: PDR }); // le dépôt proposé par défaut est le premier de la liste, pas celui des pièces
    await t(page, "sor-department").selectOption({ label: "Maintenance" });
    await t(page, "sor-requester").fill("Kouadio Yao");
    await t(page, "sor-reason").fill(`Remplacement palier ${tag}`);
    await t(page, "sor-item-search").click();
    await t(page, "sor-item-search").fill(ITEM);
    const option = t(page, `sor-item-option-${code}`);
    await expect(option).toContainText(`${stock0} U dispo`);
    await option.click();
    await expect(t(page, `sor-line-${code}`)).toContainText(`Disponible : ${stock0} U`);
    await expect(t(page, "sor-equipment")).toBeVisible(); // pièce de rechange : la machine devient obligatoire
    await t(page, `sor-qty-${code}`).fill(String(stock0 + 1));
    await expect(t(page, `sor-line-error-${code}`)).toContainText(
      `Stock insuffisant : ${stock0} U disponibles`,
    );
    await t(page, "sor-equipment").fill("Ligne mousse continue");
    await t(page, "sor-submit").click();
    await expect(t(page, "sor-confirm")).toHaveCount(0); // l'erreur bloque la confirmation
    expect(await movementCount(itemId)).toBe(mv0);
    expect((await levelsOf(itemId))[PDR]).toBe(stock0);
  });

  await test.step("Sortie – refus côté serveur : si le stock a baissé entre-temps, message « Stock insuffisant : N U disponibles au dépôt … », rien n'est écrit", async () => {
    const mv0 = await movementCount(itemId);
    // Un autre magasinier a sorti presque tout pendant la saisie : il reste 3 U (écart simulé en base, rétabli ensuite).
    const other = stock0 - 3;
    await dbQuery(
      `UPDATE stock_levels SET quantity = quantity - $3 WHERE item_id = $1 AND warehouse_id = (SELECT id FROM warehouses WHERE name = $2)`,
      [itemId, PDR, other],
    );
    try {
      await t(page, `sor-qty-${code}`).fill("5");
      await expect(t(page, `sor-line-error-${code}`)).toHaveCount(0); // le formulaire, périmé, croit encore au stock affiché
      await t(page, "sor-submit").click();
      await t(page, "sor-confirm-confirm").click();
      await expect(t(page, "sor-error")).toContainText(`Stock insuffisant : 3 U disponibles au dépôt ${PDR}`);
      await expect(t(page, "sor-confirm")).toHaveCount(0);
      expect(await movementCount(itemId)).toBe(mv0);
    } finally {
      await dbQuery(
        `UPDATE stock_levels SET quantity = quantity + $3 WHERE item_id = $1 AND warehouse_id = (SELECT id FROM warehouses WHERE name = $2)`,
        [itemId, PDR, other],
      );
    }
    expect((await levelsOf(itemId))[PDR]).toBe(stock0);
  });

  await test.step("Sortie – valide : 2 U, saisie tactile, bon SOR-AAAA-NNNNN, fiche sans prix", async () => {
    if (tablet) {
      for (const id of [
        "sor-warehouse",
        "sor-department",
        "sor-requester",
        "sor-reason",
        "sor-equipment",
        `sor-qty-${code}`,
        "sor-submit",
      ]) {
        await expectTouchHeight(page, id);
      }
    }
    await t(page, `sor-qty-${code}`).fill("2");
    await expect(t(page, `sor-line-error-${code}`)).toHaveCount(0);
    await t(page, "sor-submit").click();
    await expect(t(page, "sor-confirm")).toBeVisible();
    await t(page, "sor-confirm-confirm").click();
    await expect(page).toHaveURL(/\/stock\/sorties\/(?!nouvelle)[^/?]+$/);
    await expect(title(page)).toHaveText(SOR_NUMBER);
    await page.waitForLoadState("networkidle");
    issueNumber = norm(await title(page).textContent());
    await expect(t(page, "status-VALIDEE")).toBeVisible();
    await expect(t(page, "sor-requester-value")).toHaveText("Kouadio Yao");
    await expect(t(page, `sor-line-row-${code}`)).toContainText("2");
    await expect(page.getByText("Ligne mousse continue")).toBeVisible();
    await expect(t(page, "sor-cancel")).toHaveCount(0); // seul le Responsable annule
  });

  await test.step("Effet métier de la sortie : stock −2, un seul mouvement SORTIE de −2, audit, aucun mouvement des tentatives refusées", async () => {
    expect((await levelsOf(itemId))[PDR]).toBe(stock0 - 2);
    const mv = await movementsOfRef(issueNumber);
    expect(mv).toHaveLength(1);
    expect(mv[0]).toMatchObject({ type: "SORTIE", warehouse: PDR });
    expect(Number(mv[0].quantity)).toBe(-2);
    expect(Number(mv[0].stock_after)).toBe(stock0 - 2);
    expect(mv[0].value).toBeLessThan(0);
    const issue = await dbOne<{ id: string; status: string }>(
      `SELECT id, status::text FROM stock_issues WHERE number = $1`,
      [issueNumber],
    );
    expect(issue.status).toBe("VALIDEE");
    expect(await auditCount(issue.id, "STOCK_ISSUE_CREATE")).toBe(1);
    await ready(page, `/stock/mouvements?q=${issueNumber}`);
    const row = t(page, `mvt-row-${issueNumber}-${code}`);
    await expect(row).toBeVisible();
    await expect(row).toContainText("Sortie");
    await expect(row).toContainText("-2 U");
  });

  await test.step("Réappro – l'article est en tête de /stock/reappro (couverture rouge, point de commande 40 U), sans DA en cours", async () => {
    await ready(page, "/stock/reappro");
    await expect(title(page)).toHaveText("Réapprovisionnement");
    const row = t(page, `reap-row-${code}`);
    await expect(row).toBeVisible();
    await expect(row.locator('[data-tone="red"]')).toBeVisible();
    await expect(row).toContainText("40 U");
    await expect(t(page, `reap-existing-${code}`)).toHaveCount(0);
    await expect(t(page, `reap-check-${code}`)).toBeChecked();
    await expect(t(page, "reap-apply-thresholds")).toHaveCount(0); // seuils suggérés : Responsable seulement
    suggested = await t(page, `reap-qty-${code}`).inputValue();
    expect(Number(suggested.replace(",", "."))).toBeGreaterThan(0);
  });

  await test.step("Réappro – « Créer les DA » pour cet article seul : une DA de réappro soumise, l'article est ensuite signalé « DA en cours »", async () => {
    // On ne garde que l'article du scénario.
    await t(page, "reap-check-all").uncheck();
    await expect(t(page, "reap-summary")).toContainText("0 sélectionné");
    await t(page, "reap-create").click();
    await expect(page.getByText("Cochez au moins un article.")).toBeVisible();
    await t(page, `reap-check-${code}`).check();
    await expect(t(page, "reap-summary")).toContainText("1 sélectionné");
    await t(page, `reap-qty-${code}`).fill("0");
    await t(page, "reap-create").click();
    await expect(page.getByText("Corrigez les quantités à commander.")).toBeVisible();
    await t(page, `reap-qty-${code}`).fill(suggested);
    await t(page, "reap-create").click();
    await expect(t(page, "reap-confirm")).toBeVisible();
    await t(page, "reap-confirm-confirm").click();
    const badge = t(page, `reap-existing-${code}`);
    await expect(badge).toContainText(/^DA-\d{4}-\d{5} en cours$/);
    daNumber = norm((await badge.textContent())!).replace(" en cours", "");
    await expect(t(page, `reap-check-${code}`)).not.toBeChecked();
  });

  await test.step("Effet métier du réappro : DA REAPPRO SOUMISE avec la quantité suggérée, tracée et notifiée au Responsable", async () => {
    const pr = await prRow(daNumber);
    expect([pr.kind, pr.status]).toEqual(["REAPPRO", "SOUMISE"]);
    const lines = await prLines(daNumber);
    expect(lines).toHaveLength(1);
    expect(lines[0].name).toBe(ITEM);
    expect(Number(lines[0].quantity)).toBe(Number(suggested.replace(/\s/g, "").replace(",", ".")));
    expect(await auditCount(pr.id, "PR_SUBMIT")).toBeGreaterThanOrEqual(1);
    expect((await notificationsFor("responsable@richbond.test", daNumber)).length).toBeGreaterThan(0);
  });

  await test.step("Transfert (Magasinier) : 2 U du Magasin PDR vers le Magasin central, depuis la fiche de stock", async () => {
    const before = await levelsOf(itemId);
    await ready(page, `/stock/articles/${itemId}?onglet=fiche-de-stock`);
    await expect(t(page, "stk-sheet")).toBeVisible();
    await expect(t(page, "stk-item-adjust")).toHaveCount(0); // l'ajustement n'est pas proposé au Magasinier
    await t(page, "stk-item-transfer").click();
    await expect(t(page, "stk-transfer-dialog")).toBeVisible();
    await t(page, "stk-transfer-from").selectOption({ label: PDR });
    await t(page, "stk-transfer-to").selectOption({ label: CENTRAL });
    await t(page, "stk-transfer-qty").fill("9999");
    await t(page, "stk-transfer-submit").click();
    await expect(t(page, "stk-transfer-dialog")).toContainText("Stock insuffisant");
    await t(page, "stk-transfer-qty").fill("2");
    await t(page, "stk-transfer-comment").fill(`Réserve atelier ${tag}`);
    await t(page, "stk-transfer-submit").click();
    await expect(t(page, "stk-transfer-dialog")).toBeHidden();
    const after = await levelsOf(itemId);
    expect(after[PDR]).toBe(before[PDR] - 2);
    expect(after[CENTRAL] ?? 0).toBe((before[CENTRAL] ?? 0) + 2);
    const mv = await dbQuery<{ document_ref: string }>(
      `SELECT document_ref FROM stock_movements WHERE item_id = $1 AND type = 'TRANSFERT' AND comment LIKE $2 LIMIT 1`,
      [itemId, `%${tag}%`],
    );
    expect(mv[0].document_ref).toMatch(TRF_NUMBER);
    const pair = await movementsOfRef(mv[0].document_ref);
    expect(pair.map((m) => [m.warehouse, Number(m.quantity)]).sort()).toEqual(
      [
        [CENTRAL, 2],
        [PDR, -2],
      ].sort(),
    );
    await expect(t(page, "stk-ledger")).toContainText(mv[0].document_ref);
    await expect(t(page, `stk-level-${CENTRAL}`)).toContainText(String(after[CENTRAL]));
  });

  await test.step("Ajustement : aucun accès pour le Magasinier (ni sur la fiche, ni sur Mouvements)", async () => {
    await ready(page, "/stock/mouvements");
    await expect(title(page)).toHaveText("Mouvements de stock");
    await expect(t(page, "mvt-transfer")).toBeVisible();
    await expect(t(page, "mvt-adjust")).toHaveCount(0);
    await logout(page);
  });

  await test.step("Ajustement (Responsable) : motif obligatoire ; −1 U enregistré, AJU-AAAA-NNNNN, audit, stock à jour", async () => {
    await loginAs(page, "RESPONSABLE_ACHATS");
    const before = (await levelsOf(itemId))[PDR];
    const audits0 = await auditTotal("STOCK_ADJUST");
    await ready(page, `/stock/articles/${itemId}?onglet=fiche-de-stock`);
    await t(page, "stk-item-adjust").click();
    await expect(t(page, "stk-adjust-dialog")).toBeVisible();
    await t(page, "stk-adjust-warehouse").selectOption({ label: PDR });
    await t(page, "stk-adjust-sign-minus").click();
    await t(page, "stk-adjust-qty").fill("1");
    await t(page, "stk-adjust-submit").click();
    await expect(page.getByText("Motif obligatoire (5 caractères minimum).")).toBeVisible();
    await expect(t(page, "stk-adjust-confirm")).toHaveCount(0);
    expect((await levelsOf(itemId))[PDR]).toBe(before);
    await t(page, "stk-adjust-reason").fill(`Casse constatée au comptage ${tag}`);
    await t(page, "stk-adjust-submit").click();
    await expect(t(page, "stk-adjust-confirm")).toBeVisible();
    await t(page, "stk-adjust-confirm-confirm").click();
    await expect(page.getByText("Ajustement enregistré.")).toBeVisible();
    await expect(t(page, "stk-adjust-dialog")).toBeHidden();
    await expect.poll(async () => (await levelsOf(itemId))[PDR]).toBe(before - 1);
    const mv = await dbQuery<{ document_ref: string; type: string; quantity: string }>(
      `SELECT document_ref, type::text, quantity::text FROM stock_movements WHERE item_id = $1 AND type = 'AJUSTEMENT' AND comment LIKE $2`,
      [itemId, `%${tag}%`],
    );
    expect(mv).toHaveLength(1);
    expect(mv[0].document_ref).toMatch(AJU_NUMBER);
    expect(Number(mv[0].quantity)).toBe(-1);
    expect(await auditTotal("STOCK_ADJUST")).toBe(audits0 + 1);
    await ready(page, `/stock/mouvements?q=${mv[0].document_ref}`);
    await expect(t(page, `mvt-row-${mv[0].document_ref}-${code}`)).toContainText("Ajustement");
  });

  await test.step("Responsable : voit le bon de sortie avec sa valeur et peut l'annuler ; « Recalculer » l'ABC est tracé", async () => {
    await ready(page, `/stock/sorties?q=${issueNumber}`);
    await t(page, `sor-row-${issueNumber}`).click();
    await expect(title(page)).toHaveText(issueNumber);
    await expect(page.getByText("Valeur totale")).toBeVisible();
    await expect(t(page, "sor-cancel")).toBeEnabled();
    const audits0 = await auditTotal("ITEM_ABC_RECOMPUTE");
    await ready(page, "/stock/articles");
    await t(page, "stk-abc-recompute").click();
    await expect(page.getByText(/Classe ABC recalculée/)).toBeVisible();
    await expect.poll(() => auditTotal("ITEM_ABC_RECOMPUTE")).toBe(audits0 + 1);
    await ready(page, "/stock/reappro");
    await expect(t(page, "reap-apply-thresholds")).toBeVisible();
    // La DA de réappro est dans la liste du Responsable.
    await expectNotification(page, daNumber);
  });
});

// ---------------------------------------------------------------------------------------------------
test.describe("S3 – Essai expiré : consultation seulement", () => {
  test("le stock et le réappro se consultent ; sortie, transfert, ajustement et création de DA sont désactivés ; rien ne change en base", async ({
    page,
    context,
  }) => {
    let mv0 = 0;
    let da0 = 0;

    await test.step("Après la fin d'essai : le Magasinier se connecte, bandeau « lecture seule », stock consultable", async () => {
      mv0 = await movementCount(itemId);
      da0 = Number(
        (
          await dbOne<{ n: string }>(
            `SELECT count(*)::text AS n FROM purchase_requests WHERE kind = 'REAPPRO'`,
          )
        ).n,
      );
      await setTestNow(context, simulatedAt(trialEndDay(30), -1, "08:00"));
      await loginAs(page, "MAGASINIER");
      await expect(t(page, "read-only-banner")).toBeVisible();
      await ready(page, `/stock/articles?q=${encodeURIComponent(code)}`);
      await expect(t(page, `article-row-${code}`)).toBeVisible();
    });

    await test.step("Sorties et mouvements consultables ; « Nouvelle sortie » et « Transfert » désactivés", async () => {
      await ready(page, "/stock/sorties");
      await expect(t(page, "sor-new")).toBeDisabled();
      await ready(page, "/stock/mouvements");
      await expect(t(page, "mvt-transfer")).toBeDisabled();
      await ready(page, "/stock/sorties/nouvelle");
      await expect(t(page, "sor-submit")).toBeDisabled();
    });

    await test.step("Réappro consultable ; « Créer les DA » désactivé", async () => {
      await ready(page, "/stock/reappro");
      await expect(title(page)).toHaveText("Réapprovisionnement");
      await expect(t(page, "reap-create")).toBeDisabled();
    });

    await test.step("Responsable : « Ajuster le stock » et « Recalculer » désactivés", async () => {
      await logout(page);
      await loginAs(page, "RESPONSABLE_ACHATS");
      await ready(page, `/stock/articles/${itemId}?onglet=fiche-de-stock`);
      await expect(t(page, "stk-item-adjust")).toBeDisabled();
      await expect(t(page, "stk-item-transfer")).toBeDisabled();
      await ready(page, "/stock/articles");
      await expect(t(page, "stk-abc-recompute")).toBeDisabled();
    });

    await test.step("Rien n'a changé en base : mouvements et DA de réappro", async () => {
      expect(await movementCount(itemId)).toBe(mv0);
      const da1 = Number(
        (
          await dbOne<{ n: string }>(
            `SELECT count(*)::text AS n FROM purchase_requests WHERE kind = 'REAPPRO'`,
          )
        ).n,
      );
      expect(da1).toBe(da0);
    });
  });
});
