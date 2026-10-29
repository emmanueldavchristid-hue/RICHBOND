import { expect, test, type Page } from "@playwright/test";
import { loginAs, logout } from "../helpers/auth";
import { setTestNow } from "../helpers/clock";
import { norm, ready, t, title } from "../helpers/da";
import { dbOne, dbQuery } from "../helpers/db";
import { resetLicense } from "../helpers/license";
import { expectTouchHeight } from "../helpers/rec";
import { auditTotal } from "../helpers/stock";

/**
 * S5 – Inventaire tournant sur tablette (LOT-11, EX-32). Tablette et bureau (projets Playwright).
 * Le Responsable prépare, le Magasinier compte A L'AVEUGLE (le HTML ne contient jamais la quantité théorique ni le PMP),
 * un gros écart impose un recomptage, le Responsable motive l'écart, valide, et l'ajustement apparaît dans les mouvements.
 */

const INV_NUMBER = /^INV-\d{4}-\d{4,5}$/;
/** Champs qui ne doivent jamais atteindre le navigateur du Magasinier pendant le comptage. */
const LEAKS = /theoreticalQty|theoretical_qty|varianceQty|varianceValue|variancePct|"pmp"|\\"pmp\\"|unitCost/;

interface Target {
  id: string;
  code: string;
  name: string;
  qty: number;
  pmp: number;
}

async function targetIn(warehouseId: string, names: string[]): Promise<Target> {
  const r = await dbOne<{ id: string; code: string; name: string; qty: string; pmp: string }>(
    `SELECT i.id, i.code, i.name, s.quantity::text AS qty, s.pmp::text AS pmp
       FROM items i JOIN stock_levels s ON s.item_id = i.id
      WHERE s.warehouse_id = $1 AND i.name = ANY($2) AND s.quantity > 0
        AND NOT EXISTS (SELECT 1 FROM inventory_count_lines l JOIN inventory_counts c ON c.id = l.count_id
                         WHERE l.item_id = i.id AND c.warehouse_id = $1 AND c.status IN ('PREPARE','EN_COMPTAGE','A_VALIDER'))
      ORDER BY array_position($2::text[], i.name) LIMIT 1`,
    [warehouseId, names],
  );
  return { id: r.id, code: r.code, name: r.name, qty: Number(r.qty), pmp: Number(r.pmp) };
}

/** Saisie au pavé numérique à l'écran (comme au doigt sur la tablette). */
async function tapKeys(page: Page, digits: string) {
  for (const d of digits) await t(page, `cnt-key-${d}`).click();
}

test.beforeEach(async ({ context }) => {
  await resetLicense(30);
  await setTestNow(context, null);
});

test.afterEach(async () => {
  await resetLicense(30);
});

test("S5 – Inventaire : préparation, comptage aveugle, recomptage d'un gros écart, validation et ajustement", async ({ page }, testInfo) => {
  const tablet = testInfo.project.name === "tablette";
  const base = await dbOne<{ warehouse_id: string; wh: string }>(
    `SELECT s.warehouse_id, w.name AS wh FROM stock_levels s JOIN items i ON i.id = s.item_id JOIN warehouses w ON w.id = s.warehouse_id
      WHERE i.name = 'Roulement 6308' AND s.quantity > 0 ORDER BY s.quantity DESC LIMIT 1`,
  );
  const A = await targetIn(base.warehouse_id, ["Roulement 6308"]);
  const B = await targetIn(base.warehouse_id, ["Buse de mélange", "Graisse multi-usage", "Rame papier A4", "Polyol polyéther PO-3000"]);
  // Premier comptage très éloigné du théorique (30 % en moins) : dépasse le seuil de 5 % et de 100 000 FCFA.
  const firstCount = Math.floor(A.qty * 0.7);
  expect(A.qty - firstCount).toBeGreaterThan(A.qty * 0.05);

  let countId = "";
  let number = "";
  const posts: string[] = [];

  await test.step("Responsable : l'entrée « Inventaires » est au menu, les inventaires de démonstration sont listés", async () => {
    await loginAs(page, "RESPONSABLE_ACHATS");
    await ready(page, "/stock/inventaires");
    await expect(title(page)).toHaveText("Inventaires");
    await expect(t(page, "nav-stock/inventaires")).toBeVisible();
    await expect(page.locator('[data-testid^="inv-row-INV-"]:visible').first()).toBeVisible();
    await expect(t(page, "status-VALIDE").first()).toBeVisible();
    await expect(t(page, "status-EN_COMPTAGE").first()).toBeVisible();
    await expect(t(page, "inv-kpi-last-reliability-value")).toContainText("%");
  });

  await test.step("Responsable : prépare un inventaire de deux articles (proposition tournante, retrait, ajout par recherche)", async () => {
    await t(page, "inv-new").click();
    await expect(title(page)).toHaveText("Préparer un inventaire");
    await t(page, "inv-warehouse").selectOption({ label: base.wh });
    await expect(t(page, "inv-prep-loading")).toHaveCount(0);
    await t(page, "inv-prep-clear").click(); // la proposition est remplacée par notre sélection
    await expect(t(page, "inv-prep-empty")).toBeVisible();
    await t(page, "inv-prep-submit").click();
    await expect(page.getByText("Ajoutez au moins un article.")).toBeVisible(); // liste vide : rien n'est créé
    for (const it of [A, B]) {
      await t(page, "inv-picker-input").fill(it.code);
      await t(page, `inv-picker-option-${it.code}`).click();
      await expect(t(page, `inv-prep-row-${it.code}`)).toBeVisible();
    }
    await expect(t(page, "inv-prep-summary")).toContainText("2 articles");
    await t(page, "inv-prep-submit").click();
    await expect(page).toHaveURL(/\/stock\/inventaires\/(?!nouveau)[^/?]+$/);
    await expect(title(page)).toHaveText(INV_NUMBER);
    number = norm(await title(page).textContent());
    countId = page.url().split("/").pop()!;
    await expect(t(page, "status-PREPARE")).toBeVisible();
    await expect(t(page, `inv-line-${A.code}`)).toBeVisible();
    await expect(t(page, `inv-line-${B.code}`)).toBeVisible();
    // Effet métier : préparé, théorique pas encore figé.
    const c = await dbOne<{ status: string; n: string; frozen: string }>(
      `SELECT c.status::text, count(l.id)::text AS n, count(l.theoretical_qty)::text AS frozen
         FROM inventory_counts c JOIN inventory_count_lines l ON l.count_id = c.id WHERE c.id = $1 GROUP BY c.id`,
      [countId],
    );
    expect([c.status, c.n, c.frozen]).toEqual(["PREPARE", "2", "0"]);
    await logout(page);
  });

  await test.step("Magasinier : ouvre le comptage ; l'écran est aveugle (ni théorique, ni PMP, ni valeur dans le HTML)", async () => {
    await loginAs(page, "MAGASINIER");
    await ready(page, "/stock/inventaires");
    await expect(t(page, `inv-row-${number}`)).toBeVisible();
    await expect(t(page, "inv-new")).toHaveCount(0); // la préparation est réservée au Responsable
    await t(page, `inv-link-${number}`).click();
    await expect(title(page)).toHaveText(number);
    await expect(t(page, "inv-open")).toBeVisible();
    await t(page, "inv-open").click();
    await t(page, "inv-open-confirm-confirm").click();
    await expect(page).toHaveURL(new RegExp(`/stock/inventaires/${countId}/comptage$`));
    await expect(t(page, "cnt-screen")).toBeVisible();
    await page.waitForLoadState("networkidle");
    page.on("response", async (res) => {
      if (res.request().method() === "POST") posts.push(await res.text().catch(() => ""));
    });

    // Effet métier : le théorique est figé à l'ouverture (stock du moment).
    const lv = await dbOne<{ theo: string; pmp: string }>(
      `SELECT theoretical_qty::text AS theo, pmp::text AS pmp FROM inventory_count_lines WHERE count_id = $1 AND item_id = $2`,
      [countId, A.id],
    );
    expect(Number(lv.theo)).toBe(A.qty);

    // Le HTML complet (rendu serveur + données RSC) ne contient aucun champ théorique/PMP/valeur.
    const html = await (await page.request.get(page.url())).text();
    expect(html).toContain(A.code); // la page est bien celle du comptage
    expect(html).not.toMatch(LEAKS);
    const text = norm(await page.locator("main").innerText());
    expect(text).not.toMatch(/théorique|FCFA|PMP/i);
    await expect(t(page, "cnt-progress")).toHaveText("0 / 2 comptés");
    await expect(t(page, "cnt-submit")).toBeDisabled();
    await expect(t(page, "cnt-remaining")).toContainText("Il reste 2 articles à compter.");
    if (tablet) {
      for (const id of [`cnt-row-${A.code}`, "cnt-search", "cnt-submit", "cnt-filter-todo"]) await expectTouchHeight(page, id);
    }
  });

  await test.step("Magasinier : saisie au pavé numérique, sauvegarde automatique, gros écart => « à recompter » sans révéler le théorique", async () => {
    await t(page, `cnt-row-${A.code}`).click();
    await expect(t(page, "cnt-active-code")).toHaveText(A.code);
    await expect(t(page, "cnt-input")).toHaveValue("");
    if (tablet) {
      for (const id of ["cnt-key-5", "cnt-key-comma", "cnt-key-back", "cnt-ok", "cnt-input"]) await expectTouchHeight(page, id, 56);
    }
    await t(page, "cnt-ok").click(); // rien saisi : refus explicite
    await expect(t(page, "cnt-input-error")).toContainText("Saisissez la quantité comptée");
    await tapKeys(page, String(firstCount));
    await expect(t(page, "cnt-input")).toHaveValue(String(firstCount));
    await t(page, "cnt-ok").click();
    // Sauvegarde automatique (sans bouton « Enregistrer »), puis recomptage exigé.
    await expect(t(page, `cnt-recount-${A.code}`)).toBeVisible();
    await expect(page.getByText(/à recompter/).first()).toBeVisible();
    await expect(t(page, "cnt-save-status")).toHaveAttribute("data-state", "saved");
    const l = await dbOne<{ counted: string; recount: boolean }>(
      `SELECT counted_qty::text AS counted, recount_required AS recount FROM inventory_count_lines WHERE count_id = $1 AND item_id = $2`,
      [countId, A.id],
    );
    expect([Number(l.counted), l.recount]).toEqual([firstCount, true]);

    // Article B : compté exact avec le clavier physique (champ de saisie), Entrée valide.
    await t(page, `cnt-row-${B.code}`).click();
    await t(page, "cnt-input").fill(String(B.qty));
    await t(page, "cnt-input").press("Enter");
    await expect(t(page, `cnt-row-${B.code}`)).toHaveCount(0); // compté : il quitte la liste « À faire »
    await t(page, "cnt-filter-done").click();
    await expect(t(page, `cnt-value-${B.code}`)).toContainText(String(B.qty));
    await expect(t(page, "cnt-save-status")).toHaveAttribute("data-state", "saved");
    await expect(t(page, "cnt-progress")).toHaveText("1 / 2 comptés"); // A est à refaire, il ne compte plus

    // Envoi impossible tant que A n'est pas recompté.
    await expect(t(page, "cnt-submit")).toBeDisabled();
    await expect(t(page, "cnt-remaining")).toContainText("1 à recompter");
  });

  await test.step("Magasinier : recomptage à l'aveugle (champ vide), puis envoi du comptage avec confirmation", async () => {
    await t(page, "cnt-filter-all").click();
    await t(page, `cnt-row-${A.code}`).click();
    await expect(t(page, "cnt-input")).toHaveValue(""); // la première saisie n'est pas réaffichée
    await tapKeys(page, String(firstCount)); // même quantité : le comptage est confirmé
    await t(page, "cnt-ok").click();
    await expect(t(page, `cnt-value-${A.code}`)).toContainText(String(firstCount));
    await expect(t(page, "cnt-save-status")).toHaveAttribute("data-state", "saved");
    await expect(t(page, "cnt-progress")).toHaveText("2 / 2 comptés");
    await expect(t(page, "cnt-submit")).toBeEnabled();
    // La sauvegarde automatique part ~0,5 s après la saisie : on attend l'enregistrement en base.
    await expect
      .poll(async () => {
        const l = await dbOne<{ recount: string | null; required: boolean }>(
          `SELECT recount_qty::text AS recount, recount_required AS required FROM inventory_count_lines WHERE count_id = $1 AND item_id = $2`,
          [countId, A.id],
        );
        return [Number(l.recount), l.required];
      })
      .toEqual([firstCount, false]);

    await t(page, "cnt-submit").click();
    await expect(t(page, "cnt-submit-confirm")).toBeVisible();
    await t(page, "cnt-submit-confirm-confirm").click();
    await expect(page).toHaveURL(new RegExp(`/stock/inventaires/${countId}$`));
    await expect(t(page, "status-A_VALIDER")).toBeVisible();
    await expect(t(page, "inv-status-hint")).toContainText("Le Responsable Achats doit valider");

    // Ni les réponses du serveur pendant le comptage, ni la fiche du Magasinier ne laissent filtrer de théorique.
    expect(posts.length).toBeGreaterThan(0);
    for (const body of posts) expect(body).not.toMatch(LEAKS);
    const html = await (await page.request.get(page.url())).text();
    expect(html).not.toMatch(LEAKS);
    // Le stock n'a pas bougé : seul le Responsable valide.
    const lvl = await dbOne<{ q: string }>(`SELECT quantity::text AS q FROM stock_levels WHERE item_id = $1 AND warehouse_id = $2`, [A.id, base.warehouse_id]);
    expect(Number(lvl.q)).toBe(A.qty);
    await logout(page);
  });

  await test.step("Responsable : revue des écarts en quantité et en valeur ; la validation exige un motif pour l'écart important", async () => {
    await loginAs(page, "RESPONSABLE_ACHATS");
    await ready(page, `/stock/inventaires/${countId}`);
    await expect(title(page)).toHaveText(number);
    await expect(t(page, "status-A_VALIDER")).toBeVisible();
    const gap = firstCount - A.qty; // négatif
    await expect(t(page, `inv-rv-theo-${A.code}`)).toContainText(String(A.qty));
    await expect(t(page, `inv-rv-final-${A.code}`)).toContainText(String(firstCount));
    await expect(t(page, `inv-rv-first-${A.code}`)).toContainText(String(firstCount)); // 1er comptage conservé à titre d'information
    await expect(t(page, `inv-rv-var-${A.code}`)).toContainText(String(gap).replace("-", "-"));
    await expect(t(page, `inv-rv-value-${A.code}`)).toContainText("-");
    await expect(t(page, `inv-rv-value-${A.code}`)).toContainText("FCFA");
    await expect(t(page, `inv-rv-var-${B.code}`)).toHaveText("0");
    await expect(t(page, "inv-kpi-reliability-value")).toContainText("50");
    await expect(t(page, "inv-kpi-exceeding-value")).toHaveText("1");

    const audits0 = await auditTotal("INVENTORY_VALIDATE");
    await t(page, "inv-validate").click();
    await expect(t(page, `inv-rv-reason-error-${A.code}`)).toBeVisible();
    await expect(t(page, "inv-validate-confirm")).toHaveCount(0);
    expect(await auditTotal("INVENTORY_VALIDATE")).toBe(audits0);

    await t(page, `inv-rv-reason-${A.code}`).fill("Casse constatée en rayon");
    await t(page, "inv-validate").click();
    await expect(t(page, "inv-validate-confirm")).toBeVisible();
    await t(page, "inv-validate-confirm-confirm").click();
    await expect(t(page, "status-VALIDE")).toBeVisible();
    await expect(t(page, "inv-validated-note")).toBeVisible();
    await expect.poll(() => auditTotal("INVENTORY_VALIDATE")).toBe(audits0 + 1);
  });

  await test.step("Effet métier : stock corrigé par UN mouvement AJUSTEMENT_INVENTAIRE, visible dans les mouvements", async () => {
    const lvl = await dbOne<{ q: string }>(`SELECT quantity::text AS q FROM stock_levels WHERE item_id = $1 AND warehouse_id = $2`, [A.id, base.warehouse_id]);
    expect(Number(lvl.q)).toBe(firstCount);
    const mv = await dbQuery<{ type: string; quantity: string; item_id: string; value: number }>(
      `SELECT type::text, quantity::text, item_id, value FROM stock_movements WHERE document_ref = $1`,
      [number],
    );
    expect(mv).toHaveLength(1); // B était exact : aucun mouvement
    expect(mv[0].type).toBe("AJUSTEMENT_INVENTAIRE");
    expect(mv[0].item_id).toBe(A.id);
    expect(Number(mv[0].quantity)).toBe(firstCount - A.qty);
    expect(mv[0].value).toBeLessThan(0);
    const done = await dbOne<{ status: string; reliability: string; reason: string }>(
      `SELECT c.status::text, c.reliability_pct::text AS reliability, l.variance_reason AS reason
         FROM inventory_counts c JOIN inventory_count_lines l ON l.count_id = c.id AND l.item_id = $2 WHERE c.id = $1`,
      [countId, A.id],
    );
    expect(done.status).toBe("VALIDE");
    expect(Number(done.reliability)).toBe(50);
    expect(done.reason).toBe("Casse constatée en rayon");

    await t(page, "inv-see-movements").click();
    await expect(page).toHaveURL(/\/stock\/mouvements/);
    const row = t(page, `mvt-row-${number}-${A.code}`);
    await expect(row).toBeVisible();
    await expect(row).toContainText("Ajustement d'inventaire");
    await expect(row).toContainText(`-${A.qty - firstCount}`);
  });
});
