import path from "node:path";
import ExcelJS from "exceljs";
import { expect, test, type Page } from "@playwright/test";
import { loginAs, logout } from "../helpers/auth";
import { norm, ready, t, title } from "../helpers/da";
import { dbOne, dbQuery } from "../helpers/db";

/**
 * S-import – Import Excel/CSV des données initiales (LOT-09, EX-12). Desktop et tablette.
 * Responsable : modèle téléchargeable, fichier avec erreurs, aperçu par ligne, import des lignes valides,
 * rapport téléchargeable, ré-import sans doublon, stock initial. Acheteur et Magasinier : accès refusé.
 * Les effets sont comparés à la base (articles, mouvements de stock, journal d'audit).
 */

const FIXTURES = path.resolve(__dirname, "../../fixtures/import");
const fixture = (name: string) => path.join(FIXTURES, name);

const cleanup = async () => {
  const ids = "(SELECT id FROM items WHERE code LIKE 'IT-IMP-%')";
  await dbQuery(`DELETE FROM stock_movements WHERE item_id IN ${ids}`);
  await dbQuery(`DELETE FROM stock_levels WHERE item_id IN ${ids}`);
  await dbQuery(`DELETE FROM item_price_history WHERE item_id IN ${ids}`);
  await dbQuery(`DELETE FROM item_suppliers WHERE item_id IN ${ids}`);
  await dbQuery(`DELETE FROM items WHERE code LIKE 'IT-IMP-%'`);
};
const countItems = async () =>
  Number((await dbOne<{ n: string }>(`SELECT count(*)::text AS n FROM items WHERE code LIKE 'IT-IMP-%'`)).n);
const importAudits = async () =>
  Number(
    (await dbOne<{ n: string }>(`SELECT count(*)::text AS n FROM audit_logs WHERE action = 'IMPORT_COMMIT'`))
      .n,
  );

async function openImport(page: Page) {
  await ready(page, "/parametres/import");
  await expect(title(page)).toHaveText("Import de données");
  await expect(t(page, "import-step-file")).toBeVisible();
}

async function pickType(page: Page, type: string) {
  await page.locator(`[data-testid="import-type-${type}"]`).check();
}

/** Téléverse un fichier (chemin ou contenu CSV) puis passe à la correspondance des colonnes. */
async function upload(page: Page, file: string | { name: string; text: string }) {
  const input = page.locator('[data-testid="import-file"]');
  if (typeof file === "string") await input.setInputFiles(file);
  else
    await input.setInputFiles({
      name: file.name,
      mimeType: "text/csv",
      buffer: Buffer.from(file.text, "utf8"),
    });
  await expect(t(page, "import-file-name")).not.toHaveText("Aucun fichier choisi");
  await t(page, "import-analyse").click();
  await expect(t(page, "import-step-mapping")).toBeVisible();
}

async function toPreview(page: Page) {
  await t(page, "import-preview").click();
  await expect(t(page, "import-step-preview")).toBeVisible();
}

async function commit(page: Page) {
  await t(page, "import-commit").click();
  await t(page, "import-confirm-confirm").click();
  await expect(t(page, "import-step-result")).toBeVisible();
}

const summaryText = async (page: Page) => norm(await t(page, "import-summary").textContent());

test.beforeEach(async () => {
  await cleanup();
});
test.afterAll(async () => {
  await cleanup();
});

// ---------------------------------------------------------------------------------------------------
test("S-import – Responsable : modèle, fichier avec erreurs, aperçu par ligne, import des valides, rapport, ré-import sans doublon", async ({
  page,
}) => {
  const audits0 = await importAudits();
  let batch = "";

  await test.step("Connexion Responsable : l'import est proposé dans les paramètres", async () => {
    await loginAs(page, "RESPONSABLE_ACHATS");
    await ready(page, "/parametres");
    await expect(t(page, "parametres-lien-import")).toBeVisible();
    await t(page, "parametres-lien-import").click();
    await expect(title(page)).toHaveText("Import de données");
  });

  await test.step("Téléchargement du modèle Articles : un fichier Excel avec les colonnes usuelles de Sage", async () => {
    const [download] = await Promise.all([page.waitForEvent("download"), t(page, "import-template").click()]);
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile((await download.path())!);
    const headers = (wb.worksheets[0].getRow(1).values as unknown[]).map((v) => norm(String(v ?? "")));
    expect(headers).toEqual(expect.arrayContaining(["Référence", "Désignation"]));
    expect(wb.worksheets.map((w) => w.name)).toContain("Aide");
  });

  await test.step("Téléversement d'un fichier avec erreurs : les colonnes sont reconnues", async () => {
    await pickType(page, "ARTICLES");
    await upload(page, fixture("articles-erreurs.csv"));
    await expect(t(page, "import-map-code")).toHaveValue("Référence");
    await expect(t(page, "import-map-name")).toHaveValue("Désignation");
  });

  await test.step("Aperçu : 2 lignes valides, 4 en erreur, avec le motif de chaque ligne", async () => {
    await toPreview(page);
    await expect(t(page, "import-count-ok")).toHaveText("2");
    await expect(t(page, "import-count-error")).toHaveText("4");
    const err = (line: number) => t(page, `import-row-${line}`).getByTestId("import-row-errors");
    await expect(err(2)).toContainText(/manquant/i); // code manquant
    await expect(err(3)).toContainText("Catégorie inconnue"); // catégorie inconnue
    await expect(err(5)).toContainText("Doublon dans le fichier"); // doublon
    await expect(err(6)).toContainText("Unité inconnue"); // unité inconnue
    await expect(err(4)).toContainText("Sera créé");
    await expect(err(7)).toContainText("Sera créé");
  });

  await test.step("Filtre « Erreurs seulement » : seules les 4 lignes en erreur restent", async () => {
    await t(page, "import-errors-only").check();
    await expect(t(page, "import-table").locator("tbody tr")).toHaveCount(4);
    await expect(t(page, "import-row-4")).toHaveCount(0);
    await t(page, "import-errors-only").uncheck();
    await expect(t(page, "import-table").locator("tbody tr")).toHaveCount(6);
  });

  await test.step("Rien n'est enregistré avant l'accord : aucun article en base", async () => {
    expect(await countItems()).toBe(0);
  });

  await test.step("Import des lignes valides seulement : 2 créés, 4 ignorés", async () => {
    await commit(page);
    const s = await summaryText(page);
    expect(s).toContain("Créés : 2");
    expect(s).toContain("Mis à jour : 0");
    expect(s).toContain("Lignes en erreur, non importées : 4");
    expect(s).toContain("articles-erreurs.csv");
    const rows = await dbQuery<{ code: string }>(
      `SELECT code FROM items WHERE code LIKE 'IT-IMP-%' ORDER BY code`,
    );
    expect(rows.map((r) => r.code)).toEqual(["IT-IMP-102", "IT-IMP-104"]);
    const item = await dbOne<{ category: string; name: string }>(
      `SELECT category::text, name FROM items WHERE code = 'IT-IMP-102'`,
    );
    expect(item).toMatchObject({ category: "PDR", name: "Premier" });
  });

  await test.step("Import tracé dans le journal d'audit (fichier, lignes, erreurs)", async () => {
    expect(await importAudits()).toBe(audits0 + 1);
    const href = await t(page, "import-report").getAttribute("href");
    batch = new URL(href!, "http://localhost").searchParams.get("batch")!;
    const a = await dbOne<{
      after: { fileName: string; totalRows: number; errorCount: number; created: number };
    }>(`SELECT after FROM audit_logs WHERE action = 'IMPORT_COMMIT' AND entity_id = $1`, [batch]);
    expect(a.after).toMatchObject({
      fileName: "articles-erreurs.csv",
      totalRows: 6,
      errorCount: 4,
      created: 2,
    });
  });

  await test.step("Rapport téléchargeable : un fichier Excel avec le détail ligne par ligne", async () => {
    const [download] = await Promise.all([page.waitForEvent("download"), t(page, "import-report").click()]);
    expect(download.suggestedFilename()).toMatch(/^rapport_import_articles_.*\.xlsx$/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile((await download.path())!);
    const text: string[] = [];
    for (const ws of wb.worksheets) ws.eachRow((r) => text.push(norm((r.values as unknown[]).join(" "))));
    const all = text.join("\n");
    expect(all).toContain("IT-IMP-102");
    expect(all).toContain("IT-IMP-104");
    expect(all).toMatch(/Catégorie inconnue/);
    expect(all).toMatch(/Doublon dans le fichier/);
  });

  await test.step("Ré-import du même fichier : les 2 lignes valides sont « déjà à jour », aucun doublon", async () => {
    await t(page, "import-restart").click();
    await pickType(page, "ARTICLES");
    await upload(page, fixture("articles-erreurs.csv"));
    await toPreview(page);
    await expect(t(page, "import-count-ok")).toHaveText("2");
    await expect(t(page, "import-count-error")).toHaveText("4");
    await expect(t(page, "import-row-4").getByTestId("import-row-errors")).toContainText("Déjà à jour");
    await commit(page);
    const s = await summaryText(page);
    expect(s).toContain("Créés : 0");
    expect(s).toContain("Mis à jour : 0");
    expect(s).toContain("Déjà à jour (sans effet) : 2");
    expect(await countItems()).toBe(2);
    expect(await importAudits()).toBe(audits0 + 2);
  });
});

// ---------------------------------------------------------------------------------------------------
test("S-import – Responsable : colonnes dans le désordre, mise à jour par code, puis stock initial par mouvements", async ({
  page,
}) => {
  await test.step("Connexion Responsable et import d'articles dont les colonnes sont dans le désordre", async () => {
    await loginAs(page, "RESPONSABLE_ACHATS");
    await openImport(page);
    await pickType(page, "ARTICLES");
    await upload(page, fixture("articles-desordre.csv"));
    await toPreview(page);
    await expect(t(page, "import-count-error")).toHaveText("0");
    await commit(page);
    expect(await summaryText(page)).toContain("Lignes en erreur, non importées : 0");
  });

  await test.step("Mise à jour par code : un fichier modifié met à jour sans créer de doublon", async () => {
    const before = await countItems();
    expect(before).toBeGreaterThan(0);
    await t(page, "import-restart").click();
    await pickType(page, "ARTICLES");
    await upload(page, {
      name: "maj.csv",
      text: "Référence;Désignation;Catégorie;Famille;Unité\nIT-IMP-001;Désignation corrigée;PDR;Divers;U\n",
    });
    await toPreview(page);
    await expect(t(page, "import-row-2").getByTestId("import-row-errors")).toBeVisible();
    await commit(page);
    const s = await summaryText(page);
    expect(s).toContain("Créés : 0");
    expect(s).toContain("Mis à jour : 1");
    expect(await dbOne<{ name: string }>(`SELECT name FROM items WHERE code = 'IT-IMP-001'`)).toMatchObject({
      name: "Désignation corrigée",
    });
  });

  const stockCsv =
    "Référence;Dépôt;Quantité;PMP;Date\nIT-IMP-001;MAG-PDR;12;4 250;31/12/2025\nIT-IMP-002;MAG-PDR;-4;1000;31/12/2025\n";
  await test.step("Stock initial : 1 ligne valide, 1 ligne en erreur (quantité négative)", async () => {
    await t(page, "import-restart").click();
    await pickType(page, "STOCK_INITIAL");
    await upload(page, { name: "stock.csv", text: stockCsv });
    await toPreview(page);
    await expect(t(page, "import-count-ok")).toHaveText("1");
    await expect(t(page, "import-count-error")).toHaveText("1");
    await expect(t(page, "import-row-3").getByTestId("import-row-errors")).toContainText(/quantité/i);
    await commit(page);
    expect(await summaryText(page)).toContain("Créés : 1");
  });

  await test.step("Effet métier : un mouvement AJUSTEMENT_INVENTAIRE, stock 12 et PMP 4 250 ; rien pour la ligne en erreur", async () => {
    const mv = await dbQuery<{ type: string; quantity: string; unit_cost: string; code: string }>(
      `SELECT m.type::text, m.quantity::text, m.unit_cost::text, i.code FROM stock_movements m JOIN items i ON i.id = m.item_id WHERE i.code LIKE 'IT-IMP-%'`,
    );
    expect(mv).toHaveLength(1);
    expect(mv[0]).toMatchObject({ type: "AJUSTEMENT_INVENTAIRE", code: "IT-IMP-001" });
    expect(Number(mv[0].quantity)).toBe(12);
    expect(Number(mv[0].unit_cost)).toBe(4250);
    const lvl = await dbOne<{ quantity: string; pmp: string }>(
      `SELECT l.quantity::text, l.pmp::text FROM stock_levels l JOIN items i ON i.id = l.item_id WHERE i.code = 'IT-IMP-001'`,
    );
    expect(Number(lvl.quantity)).toBe(12);
    expect(Number(lvl.pmp)).toBe(4250);
  });

  await test.step("Ré-import du stock initial : ligne ignorée, le stock reste à 12", async () => {
    await t(page, "import-restart").click();
    await pickType(page, "STOCK_INITIAL");
    await upload(page, { name: "stock.csv", text: stockCsv });
    await toPreview(page);
    await expect(t(page, "import-row-2").getByTestId("import-row-errors")).toContainText("Déjà à jour");
    await commit(page);
    expect(await summaryText(page)).toContain("Créés : 0");
    const n = await dbOne<{ n: string }>(
      `SELECT count(*)::text AS n FROM stock_movements m JOIN items i ON i.id = m.item_id WHERE i.code = 'IT-IMP-001'`,
    );
    expect(Number(n.n)).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------------
test("S-import – Acheteur et Magasinier : accès refusé à l'import (écran, modèle et rapport)", async ({
  page,
}) => {
  for (const role of ["ACHETEUR_LOCAL", "MAGASINIER"] as const) {
    await test.step(`${role} : pas de lien « Import de données » et redirection vers « accès refusé »`, async () => {
      await loginAs(page, role);
      await page.goto("/parametres/import");
      await expect(page).toHaveURL(/\/acces-refuse/);
      await expect(t(page, "acces-refuse")).toBeVisible();
      await expect(t(page, "import-step-file")).toHaveCount(0);
    });
    await test.step(`${role} : le modèle et le rapport répondent 403, rien n'est importé`, async () => {
      const m = await page.request.get("/parametres/import/modele?type=ARTICLES");
      expect(m.status()).toBe(403);
      const r = await page.request.get("/parametres/import/rapport?batch=inconnu");
      expect(r.status()).toBe(403);
      expect(await countItems()).toBe(0);
    });
    await logout(page);
  }
});
