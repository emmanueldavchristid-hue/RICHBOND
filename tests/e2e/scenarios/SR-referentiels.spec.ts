import { expect, test, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import { loginAs, logout } from "../helpers/auth";
import { setTestNow, simulatedAt } from "../helpers/clock";
import { dbOne, dbQuery } from "../helpers/db";
import { resetLicense, trialEndDay } from "../helpers/license";

/**
 * SR1 à SR6 (LOT-03, EX-10, EX-11) – Référentiels : articles, fournisseurs, devises et taux.
 * Exécutés en desktop et en tablette (projets Playwright). Chaque scénario vérifie l'interface et l'effet en base.
 */

const norm = (s: string | null | undefined) => (s ?? "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
const dayOffset = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

/** Ouvre une page et attend l'hydratation (formulaires clients). */
async function ready(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

/** « 1–25 sur 41 » -> 41. */
async function rangeTotal(page: Page, table: "articles" | "suppliers"): Promise<number> {
  const text = norm(await page.getByTestId(`${table}-range`).textContent());
  const m = /sur (\d+)$/.exec(text);
  if (!m) throw new Error(`Plage illisible : « ${text} »`);
  return Number(m[1]);
}

/** Titre de la page affichée (Next conserve masquées les pages précédentes). */
const title = (page: Page) => page.locator('[data-testid="page-title"]:visible');
const itemRows = (page: Page) => page.locator('tr[data-testid^="article-row-"]');
const supplierRows = (page: Page) => page.locator('tr[data-testid^="supplier-row-"]');

async function readExport(path: string, sheet: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.getWorksheet(sheet);
  if (!ws) throw new Error(`Feuille « ${sheet} » absente.`);
  const header = (ws.getRow(1).values as unknown[]).slice(1).map((v) => String(v ?? ""));
  const rows: Record<string, string>[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const vals = (row.values as unknown[]).slice(1);
    rows.push(Object.fromEntries(header.map((h, i) => [h, String(vals[i] ?? "")])));
  });
  return { header, rows };
}

async function downloadFrom(page: Page, testId: string) {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId(testId).click()]);
  const path = await download.path();
  return { name: download.suggestedFilename(), path };
}

test.beforeEach(async ({ context }) => {
  await resetLicense(30);
  await setTestNow(context, null);
});

test.afterAll(async () => {
  await resetLicense(30);
  await dbQuery(`UPDATE settings SET value = 'false'::jsonb WHERE key = 'warehouse.showPurchasePrice'`);
});

// ---------------------------------------------------------------------------------------------------
test.describe("SR1 – Acheteur import : fournisseur Chine, article PDR, historique des prix", () => {
  test("création du fournisseur, de l'article, du lien et de deux prix", async ({ page }, testInfo) => {
    const tag = `${testInfo.project.name}-${Date.now()}`;
    const supplierName = `Shenzhen E2E Bearings ${tag}`;
    const itemName = `Roulement 6308 E2E ${tag}`;
    let supplierId = "";
    let supplierCode = "";
    let itemId = "";
    let itemCode = "";

    await test.step("L'acheteur import se connecte et ouvre « Nouveau fournisseur »", async () => {
      await loginAs(page, "ACHETEUR_IMPORT");
      await ready(page, "/fournisseurs");
      await expect(title(page)).toHaveText("Fournisseurs");
      await page.getByTestId("supplier-create").click();
      await expect(page).toHaveURL(/\/fournisseurs\/nouveau$/);
      await page.waitForLoadState("networkidle");
    });

    await test.step("Il saisit un fournisseur Chine, CNY, FOB, avec 2 contacts", async () => {
      await page.getByTestId("supplier-name").fill(supplierName);
      await page.getByTestId("supplier-type").selectOption("IMPORT");
      await page.getByTestId("supplier-country").selectOption("CN");
      await page.getByTestId("supplier-city").fill("Shenzhen");
      await page.getByTestId("supplier-currency").selectOption("CNY");
      await page.getByTestId("supplier-payment").selectOption("J60");
      await page.getByTestId("supplier-incoterm").selectOption("FOB");
      await page.getByTestId("supplier-category-PDR").check();
      await page.getByTestId("supplier-contact-add").click();
      await page.getByTestId("contact-name-0").fill("Li Wei");
      await page.getByTestId("contact-phone-0").fill("+86 755 1234 5678");
      await page.getByTestId("contact-email-0").fill("li.wei@e2e-fournisseur.test");
      await page.getByTestId("supplier-contact-add").click();
      await page.getByTestId("contact-name-1").fill("Zhang Min");
      await page.getByTestId("contact-role-1").fill("Export");
      await page.getByTestId("contact-primary-0").check();
      await page.getByTestId("supplier-save").click();
    });

    await test.step("La fiche s'ouvre : code généré FRS-xxxxx, statut, 2 contacts", async () => {
      await expect(page).toHaveURL(/\/fournisseurs\/(?!nouveau)[a-z0-9]+$/);
      await expect(title(page)).toHaveText(supplierName);
      await expect(page.getByText(/Code FRS-\d{5}/).first()).toBeVisible();
      await expect(page.getByTestId("supplier-tabs-tab-contacts")).toContainText("Contacts (2)");
      const row = await dbOne<{ id: string; code: string; incoterm: string; currency_code: string; type: string }>(
        "SELECT id, code, incoterm::text, currency_code, type::text FROM suppliers WHERE name = $1",
        [supplierName],
      );
      supplierId = row.id;
      supplierCode = row.code;
      expect(row.code).toMatch(/^FRS-\d{5}$/);
      expect([row.type, row.incoterm, row.currency_code]).toEqual(["IMPORT", "FOB", "CNY"]);
      const contacts = await dbOne<{ n: string; primaries: string }>(
        "SELECT count(*) AS n, count(*) FILTER (WHERE is_primary) AS primaries FROM supplier_contacts WHERE supplier_id = $1",
        [supplierId],
      );
      expect([contacts.n, contacts.primaries]).toEqual(["2", "1"]);
      const audit = await dbQuery("SELECT 1 FROM audit_logs WHERE action = 'SUPPLIER_CREATE' AND entity_id = $1", [supplierId]);
      expect(audit).toHaveLength(1);
    });

    await test.step("Il crée l'article PDR critique « Roulement 6308 » (carton de 10 U)", async () => {
      await ready(page, "/stock/articles/nouveau");
      await page.getByTestId("item-name").fill(itemName);
      await page.getByTestId("item-category").selectOption("PDR");
      await page.getByTestId("item-criticality").selectOption("CRITIQUE");
      await page.getByTestId("item-family").fill("Roulements");
      await page.getByTestId("item-equipment").fill("Ligne mousse continue");
      await page.getByTestId("item-stock-unit").selectOption("U");
      await page.getByTestId("item-purchase-unit").selectOption("CARTON");
      await page.getByTestId("item-coef").fill("10");
      await expect(page.getByTestId("item-conversion-preview")).toContainText(/1 Carton .* = 10 U/);
      await page.getByTestId("item-main-supplier").selectOption({ label: `${supplierName} (${supplierCode})` });
      await page.getByTestId("item-save").click();
    });

    await test.step("La fiche article s'ouvre : code ART-xxxxx, criticité, statut", async () => {
      await expect(page).toHaveURL(/\/stock\/articles\/(?!nouveau)[a-z0-9]+$/);
      await expect(title(page)).toHaveText(itemName);
      await expect(page.getByTestId("status-CRITIQUE").first()).toBeVisible();
      const row = await dbOne<{ id: string; code: string; conversion_factor: string; equipment: string; main_supplier_id: string }>(
        "SELECT id, code, conversion_factor::text, equipment, main_supplier_id FROM items WHERE name = $1",
        [itemName],
      );
      itemId = row.id;
      itemCode = row.code;
      expect(row.code).toMatch(/^ART-\d{5}$/);
      expect(Number(row.conversion_factor)).toBe(10);
      expect(row.equipment).toBe("Ligne mousse continue");
      expect(row.main_supplier_id).toBe(supplierId);
    });

    await test.step("Le lien fournisseur a été créé automatiquement (fournisseur principal)", async () => {
      await page.getByTestId("item-tabs-tab-fournisseurs").click();
      const link = page.getByTestId(`item-link-row-${supplierCode}`);
      await expect(link).toBeVisible();
      await expect(link).toContainText("Principal");
    });

    for (const [price, display] of [
      ["12.50", "12,50 CNY"],
      ["13.75", "13,75 CNY"],
    ] as const) {
      await test.step(`Prix du fournisseur : ${display}`, async () => {
        await page.getByTestId(`item-link-row-${supplierCode}`).getByTestId("item-link-edit").click();
        const dialog = page.getByTestId("item-link-dialog");
        await expect(dialog).toBeVisible();
        await page.getByTestId("link-ref").fill("RB-6308-CN");
        await page.getByTestId("link-price").fill(price);
        await page.getByTestId("link-currency").selectOption("CNY");
        await page.getByTestId("link-save").click();
        await expect(dialog).toBeHidden();
        await expect(page.getByTestId(`item-link-row-${supplierCode}`)).toContainText(display);
      });
    }

    await test.step("L'onglet « Historique des prix » montre les deux prix, le taux et l'équivalent FCFA", async () => {
      await page.getByTestId("item-tabs-tab-prix").click();
      const rows = page.getByTestId("price-history-row");
      await expect(rows).toHaveCount(2);
      const text = norm(await page.getByTestId("item-price-history").textContent());
      expect(text).toContain("12,50 CNY");
      expect(text).toContain("13,75 CNY");
      expect(text).toContain("Saisie manuelle");
      expect(text).toContain(supplierName);
      expect(text).toMatch(/FCFA/);
      const hist = await dbQuery<{ price: string; currency_code: string; rate_to_xof: string | null; source: string }>(
        "SELECT price::text, currency_code, rate_to_xof::text, source::text FROM item_price_history WHERE item_id = $1 ORDER BY created_at",
        [itemId],
      );
      expect(hist.map((h) => [Number(h.price), h.currency_code, h.source])).toEqual([
        [12.5, "CNY", "MANUEL"],
        [13.75, "CNY", "MANUEL"],
      ]);
      expect(Number(hist[1].rate_to_xof)).toBeGreaterThan(0); // taux CNY figé à la date
      const audit = await dbQuery("SELECT 1 FROM audit_logs WHERE action = 'ITEM_SUPPLIER_UPDATE' AND after::text LIKE $1", [`%${supplierId}%`]);
      expect(audit.length).toBeGreaterThanOrEqual(2);
    });

    await test.step("La fiche fournisseur liste l'article (« Articles fournis ») et la recherche le retrouve", async () => {
      await ready(page, `/fournisseurs/${supplierId}`);
      await page.getByTestId("supplier-tabs-tab-articles").click();
      await expect(page.getByTestId(`supplier-item-${itemCode}`)).toContainText(itemName);
      await ready(page, `/stock/articles?q=${encodeURIComponent(itemName)}`);
      await expect(itemRows(page)).toHaveCount(1);
      await expect(page.getByTestId("articles-range")).toHaveText("1–1 sur 1");
    });
  });
});

// ---------------------------------------------------------------------------------------------------
test.describe("SR2 – Magasinier sur tablette : lecture seule, sans prix", () => {
  test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true });

  test("filtre PDR critiques, fiche sans bouton d'écriture ni prix, puis réglage Responsable", async ({ page }) => {
    await test.step("Le magasinier ouvre la liste des articles et filtre PDR + Critique + équipement", async () => {
      await loginAs(page, "MAGASINIER");
      await ready(page, "/stock/articles");
      await expect(title(page)).toHaveText("Articles");
      await expect(page.getByTestId("item-create")).toHaveCount(0);
      await page.getByTestId("articles-filter-categorie").selectOption("PDR");
      await expect(page).toHaveURL(/categorie=PDR/);
      await page.getByTestId("articles-filter-criticite").selectOption("CRITIQUE");
      await expect(page).toHaveURL(/criticite=CRITIQUE/);
      await page.getByTestId("articles-filter-equipement").fill("Ligne mousse continue");
      await expect(page).toHaveURL(/equipement=Ligne/);
      await expect(itemRows(page).first()).toBeVisible();
      await expect.poll(() => rangeTotal(page, "articles")).toBeGreaterThanOrEqual(5);
      const n = await itemRows(page).count();
      expect(n).toBeGreaterThanOrEqual(5);
      for (let i = 0; i < n; i++) {
        const t = norm(await itemRows(page).nth(i).textContent());
        expect(t).toContain("Pièce de rechange");
        expect(t).toContain("Critique");
        expect(t).toContain("Ligne mousse continue");
      }
      await expect(page.getByTestId("article-row-ART-00017")).toContainText("Roulement 6308");
    });

    await test.step("Il ouvre la fiche du Roulement 6308 : lecture seule, aucun bouton d'écriture", async () => {
      await page.getByTestId("article-row-ART-00017").locator("td").nth(1).click();
      await expect(page).toHaveURL(/\/stock\/articles\/[a-z0-9]+$/);
      await expect(title(page)).toHaveText("Roulement 6308");
      await expect(page.getByTestId("item-readonly-note")).toBeVisible();
      for (const id of ["item-save", "item-status-actions", "item-photo-change", "item-code-change-open"]) {
        await expect(page.getByTestId(id)).toHaveCount(0);
      }
      await expect(page.getByTestId("item-name")).toBeDisabled();
    });

    await test.step("Aucun prix : ni onglet d'historique, ni colonne de prix, ni donnée de prix dans la page", async () => {
      await expect(page.getByTestId("item-tabs-tab-prix")).toHaveCount(0);
      await page.getByTestId("item-tabs-tab-fournisseurs").click();
      await expect(page.getByTestId("item-suppliers-table")).toBeVisible();
      await expect(page.getByTestId("item-link-add")).toHaveCount(0);
      await expect(page.getByTestId("item-suppliers-table")).not.toContainText("Dernier prix");
      await expect(page.getByTestId("money")).toHaveCount(0);
      const html = await (await page.request.get(page.url())).text();
      expect(html).not.toMatch(/11[\s  ]?500/); // prix du fournisseur local de ce roulement
      expect(html).not.toContain("lastPrice\":\"");
    });

    await test.step("Fournisseurs et export des fournisseurs refusés au magasinier", async () => {
      await page.goto("/fournisseurs");
      await expect(page).toHaveURL(/\/acces-refuse/);
      const res = await page.request.get("/api/export/fournisseurs");
      expect(res.status()).toBe(403);
    });

    await test.step("Le Responsable active « Afficher les prix d'achat au Magasinier »", async () => {
      await logout(page);
      await loginAs(page, "RESPONSABLE_ACHATS");
      await ready(page, "/parametres/reglages");
      await page.getByTestId("setting-show-purchase-price").check();
      await page.getByTestId("settings-save").click();
      await expect(page.getByText("Les prix d'achat sont maintenant visibles par le Magasinier.")).toBeVisible();
      const s = await dbOne<{ value: boolean }>("SELECT value FROM settings WHERE key = 'warehouse.showPurchasePrice'");
      expect(s.value).toBe(true);
    });

    await test.step("Le magasinier voit maintenant les prix, toujours en lecture seule", async () => {
      await logout(page);
      await loginAs(page, "MAGASINIER");
      await ready(page, "/stock/articles?q=ART-00017");
      await page.getByTestId("article-row-ART-00017").locator("td").nth(1).click();
      await expect(title(page)).toHaveText("Roulement 6308");
      await expect(page.getByTestId("item-tabs-tab-prix")).toBeVisible();
      await page.getByTestId("item-tabs-tab-prix").click();
      await expect(page.getByTestId("price-history-row").first()).toBeVisible();
      await expect(page.getByTestId("item-save")).toHaveCount(0);
    });

    await test.step("Réglage remis à « masqué » : le prix redisparaît", async () => {
      await logout(page);
      await loginAs(page, "RESPONSABLE_ACHATS");
      await ready(page, "/parametres/reglages");
      await page.getByTestId("setting-show-purchase-price").uncheck();
      await page.getByTestId("settings-save").click();
      await expect(page.getByText("Les prix d'achat sont maintenant masqués pour le Magasinier.")).toBeVisible();
      await logout(page);
      await loginAs(page, "MAGASINIER");
      await ready(page, "/stock/articles?q=ART-00017");
      await page.getByTestId("article-row-ART-00017").locator("td").nth(1).click();
      await expect(title(page)).toHaveText("Roulement 6308");
      await expect(page.getByTestId("item-tabs-tab-prix")).toHaveCount(0);
    });
  });
});

// ---------------------------------------------------------------------------------------------------
test.describe("SR3 – Blocage et déblocage d'un fournisseur", () => {
  test("motif obligatoire, avertissement articles, déblocage réservé au Responsable", async ({ page }) => {
    const supplier = await dbOne<{ id: string; name: string; code: string }>(
      "SELECT id, name, code FROM suppliers WHERE code = 'FRS-00004'",
    );
    const reason = "Retards de livraison répétés (test E2E).";
    const auditCount = async (action: string) =>
      Number((await dbOne<{ n: string }>("SELECT count(*) AS n FROM audit_logs WHERE action = $1 AND entity_id = $2", [action, supplier.id])).n);
    const blocksBefore = await auditCount("SUPPLIER_BLOCK");
    const unblocksBefore = await auditCount("SUPPLIER_UNBLOCK");
    try {
      await test.step("Acheteur local : ouvre la fiche du fournisseur depuis la liste", async () => {
        await loginAs(page, "ACHETEUR_LOCAL");
        await ready(page, `/fournisseurs?q=${encodeURIComponent(supplier.name)}`);
        await page.getByTestId("supplier-link").first().click();
        await expect(page).toHaveURL(new RegExp(`/fournisseurs/${supplier.id}$`));
        await expect(title(page)).toHaveText(supplier.name);
        await expect(page.getByTestId("supplier-blocked-banner")).toHaveCount(0);
        await page.waitForLoadState("networkidle");
      });

      await test.step("Le motif est obligatoire (5 caractères minimum)", async () => {
        await page.getByTestId("supplier-block").click();
        await expect(page.getByTestId("supplier-block-dialog")).toBeVisible();
        await page.getByTestId("supplier-block-confirm").click();
        await expect(page.getByTestId("supplier-block-error")).toBeVisible();
        await page.getByTestId("supplier-block-reason").fill("abc");
        await page.getByTestId("supplier-block-confirm").click();
        await expect(page.getByTestId("supplier-block-error")).toBeVisible();
        const still = await dbOne<{ status: string }>("SELECT status::text FROM suppliers WHERE id = $1", [supplier.id]);
        expect(still.status).toBe("ACTIF");
      });

      await test.step("Avertissement : liste des articles dont il est le fournisseur principal", async () => {
        await expect(page.getByTestId("supplier-block-warning")).toContainText(/fournisseur principal de \d+ article/);
        await expect(page.getByTestId("supplier-block-warning")).toContainText("Roulement 6205");
      });

      await test.step("Blocage avec motif : bandeau rouge, statut Bloqué, trace au journal", async () => {
        await page.getByTestId("supplier-block-reason").fill(reason);
        await page.getByTestId("supplier-block-confirm").click();
        await expect(page.getByTestId("supplier-block-dialog")).toBeHidden();
        await expect(page.getByTestId("supplier-blocked-banner")).toContainText("aucun bon de commande possible");
        await expect(page.getByTestId("supplier-blocked-reason")).toHaveText(reason);
        await expect(page.getByTestId("status-BLOQUE").first()).toBeVisible();
        const row = await dbOne<{ status: string; blocked_reason: string; blocked_at: string | null; blocked_by_id: string | null }>(
          "SELECT status::text, blocked_reason, blocked_at::text, blocked_by_id FROM suppliers WHERE id = $1",
          [supplier.id],
        );
        expect(row.status).toBe("BLOQUE");
        expect(row.blocked_reason).toBe(reason);
        expect(row.blocked_at).not.toBeNull();
        expect(row.blocked_by_id).not.toBeNull();
        expect(await auditCount("SUPPLIER_BLOCK")).toBe(blocksBefore + 1);
      });

      await test.step("L'acheteur ne peut pas débloquer", async () => {
        await expect(page.getByTestId("supplier-unblock")).toHaveCount(0);
        await expect(page.getByTestId("supplier-unblock-hint")).toHaveText("Seul le Responsable Achats peut débloquer.");
      });

      await test.step("Le fournisseur bloqué n'est plus proposé comme fournisseur principal d'un article", async () => {
        await ready(page, "/stock/articles/nouveau");
        await expect(page.getByTestId("item-main-supplier").locator("option", { hasText: supplier.code })).toHaveCount(0);
        await expect(page.getByTestId("item-main-supplier").locator("option", { hasText: "FRS-00005" })).toHaveCount(1);
      });

      await test.step("Responsable : débloque le fournisseur", async () => {
        await logout(page);
        await loginAs(page, "RESPONSABLE_ACHATS");
        await ready(page, `/fournisseurs/${supplier.id}`);
        await expect(page.getByTestId("supplier-blocked-banner")).toBeVisible();
        await page.getByTestId("supplier-unblock").click();
        await expect(page.getByTestId("supplier-unblock-dialog")).toBeVisible();
        await page.getByTestId("supplier-unblock-status").selectOption("ACTIF");
        await page.getByTestId("supplier-unblock-confirm").click();
        await expect(page.getByTestId("supplier-unblock-dialog")).toBeHidden();
        await expect(page.getByTestId("supplier-blocked-banner")).toHaveCount(0);
        await expect(page.getByTestId("supplier-block")).toBeVisible();
        const row = await dbOne<{ status: string; blocked_reason: string | null }>(
          "SELECT status::text, blocked_reason FROM suppliers WHERE id = $1",
          [supplier.id],
        );
        expect(row.status).toBe("ACTIF");
        expect(row.blocked_reason).toBeNull();
        expect(await auditCount("SUPPLIER_UNBLOCK")).toBe(unblocksBefore + 1);
      });

      await test.step("Le journal de la fiche garde le blocage et le déblocage", async () => {
        await page.getByTestId("supplier-tabs-tab-journal").click();
        await expect(page.getByText("Blocage d'un fournisseur").first()).toBeVisible();
        await expect(page.getByText("Déblocage d'un fournisseur").first()).toBeVisible();
      });

      await test.step("Le fournisseur est de nouveau proposé pour un article", async () => {
        await ready(page, "/stock/articles/nouveau");
        await expect(page.getByTestId("item-main-supplier").locator("option", { hasText: supplier.code })).toHaveCount(1);
      });
    } finally {
      await dbQuery("UPDATE suppliers SET status = 'ACTIF', blocked_reason = NULL, blocked_at = NULL, blocked_by_id = NULL WHERE id = $1", [
        supplier.id,
      ]);
    }
  });
});

// ---------------------------------------------------------------------------------------------------
test.describe("SR4 – Listes : recherche, tri, filtres, pagination, export", () => {
  test("articles : pagination, tri, recherche, filtres, URL, export Excel", async ({ page }) => {
    await loginAs(page, "RESPONSABLE_ACHATS");
    let total = 0;

    await test.step("Liste des articles : « 1–25 sur N » puis page 2", async () => {
      await ready(page, "/stock/articles");
      await expect(title(page)).toHaveText("Articles");
      total = await rangeTotal(page, "articles");
      expect(total).toBeGreaterThan(25);
      await expect(page.getByTestId("articles-range")).toHaveText(`1–25 sur ${total}`);
      await expect(itemRows(page)).toHaveCount(25);
      await expect(page.getByTestId("articles-prev")).toBeDisabled();
      await page.getByTestId("articles-next").click();
      await expect(page).toHaveURL(/page=2/);
      await expect(page.getByTestId("articles-page")).toHaveText(/Page 2 \/ \d+/);
      await expect(page.getByTestId("articles-range")).toHaveText(`26–${Math.min(50, total)} sur ${total}`);
      await page.getByTestId("articles-prev").click();
      await expect(page.getByTestId("articles-page")).toHaveText(/Page 1 \//);
    });

    await test.step("Tri par désignation : croissant puis décroissant (tout sur une page)", async () => {
      await page.getByTestId("articles-size").selectOption("100");
      await expect(page).toHaveURL(/taille=100/);
      await expect(itemRows(page)).toHaveCount(total);
      await page.getByTestId("articles-sort-name").click();
      await expect(page).toHaveURL(/tri=name/);
      await expect(page.getByTestId("articles-sort-name")).toHaveCount(1);
      const names = async () =>
        Promise.all((await itemRows(page).all()).map(async (r) => norm(await r.locator("td").nth(1).textContent())));
      await expect(page.locator("th[aria-sort]")).toContainText("Désignation");
      const asc = await names();
      await page.getByTestId("articles-sort-name").click();
      await expect(page).toHaveURL(/ordre=desc/);
      await expect(page.locator("th[aria-sort='descending']")).toContainText("Désignation");
      await expect.poll(async () => (await names())[0]).toBe(asc[asc.length - 1]);
      const desc = await names();
      expect(desc).toEqual([...asc].reverse());
    });

    await test.step("Recherche par désignation puis par référence fournisseur", async () => {
      await ready(page, "/stock/articles");
      await page.getByTestId("articles-search").fill("roulement");
      await expect(page).toHaveURL(/q=roulement/);
      await expect.poll(() => rangeTotal(page, "articles")).toBeGreaterThanOrEqual(2);
      for (const r of await itemRows(page).all()) expect(norm(await r.textContent()).toLowerCase()).toContain("roulement");
      await page.getByTestId("articles-search").fill("REF-016-1");
      await expect(page).toHaveURL(/q=REF-016-1/);
      await expect(itemRows(page)).toHaveCount(1);
      await expect(page.getByTestId("article-row-ART-00016")).toContainText("Roulement 6205");
    });

    await test.step("Recherche sans résultat : message clair puis « Réinitialiser »", async () => {
      await page.getByTestId("articles-search").fill("zzzz-introuvable");
      await expect(page.getByText("Aucun article trouvé")).toBeVisible();
      await expect(page.getByTestId("articles-range")).toHaveText("0–0 sur 0");
      await page.getByTestId("articles-reset").click();
      await expect(page).not.toHaveURL(/q=/);
      await expect(page.getByTestId("articles-range")).toHaveText(`1–25 sur ${total}`);
    });

    await test.step("Filtres catégorie « Service » et famille ; l'état est dans l'URL", async () => {
      await page.getByTestId("articles-filter-categorie").selectOption("SERVICE");
      await expect(page).toHaveURL(/categorie=SERVICE/);
      await expect(page.getByTestId("articles-range")).toHaveText("1–3 sur 3");
      for (const r of await itemRows(page).all()) expect(norm(await r.textContent())).toContain("Service");
      // URL partageable : rechargée telle quelle, même résultat.
      await ready(page, page.url());
      await expect(page.getByTestId("articles-filter-categorie")).toHaveValue("SERVICE");
      await expect(page.getByTestId("articles-range")).toHaveText("1–3 sur 3");
      await page.getByTestId("articles-reset").click();
      await expect(page).not.toHaveURL(/categorie=/);
      await page.getByTestId("articles-filter-famille").selectOption("Roulements");
      await expect(page).toHaveURL(/famille=Roulements/);
      await expect.poll(() => rangeTotal(page, "articles")).toBeGreaterThanOrEqual(2);
      await page.getByTestId("articles-reset").click();
      await expect(page).not.toHaveURL(/famille=/);
    });

    await test.step("Export Excel avec le filtre « Service » : lignes = liste filtrée", async () => {
      await page.getByTestId("articles-filter-categorie").selectOption("SERVICE");
      await expect(page.getByTestId("articles-range")).toHaveText("1–3 sur 3");
      const file = await downloadFrom(page, "articles-export");
      expect(file.name).toMatch(/^articles_\d{8}\.xlsx$/);
      const xl = await readExport(file.path, "Articles");
      expect(xl.header).toEqual(expect.arrayContaining(["Code", "Désignation", "Catégorie", "Criticité", "Statut"]));
      expect(xl.header.some((h) => /prix/i.test(h))).toBe(false);
      expect(xl.rows).toHaveLength(3);
      for (const r of xl.rows) expect(r["Catégorie"]).toBe("Service");
    });

    await test.step("Export sans filtre : autant de lignes que la liste complète", async () => {
      await page.getByTestId("articles-reset").click();
      await expect(page.getByTestId("articles-range")).toHaveText(`1–25 sur ${total}`);
      const file = await downloadFrom(page, "articles-export");
      const xl = await readExport(file.path, "Articles");
      expect(xl.rows).toHaveLength(total);
    });
  });

  test("fournisseurs : filtres type/pays/statut, tri, export Excel", async ({ page }) => {
    await loginAs(page, "RESPONSABLE_ACHATS");
    await ready(page, "/fournisseurs");
    await expect(title(page)).toHaveText("Fournisseurs");

    await test.step("Par défaut : actifs et en évaluation, le fournisseur bloqué n'apparaît pas", async () => {
      await expect.poll(() => rangeTotal(page, "suppliers")).toBeGreaterThanOrEqual(24);
      await page.getByTestId("suppliers-size").selectOption("100");
      await expect(page).toHaveURL(/taille=100/);
      await expect(supplierRows(page).first()).toBeVisible();
      await expect(page.getByTestId("supplier-row-FRS-00025")).toHaveCount(0);
    });

    await test.step("Filtre « Bloqués » : le fournisseur bloqué du seed, avec son statut", async () => {
      await page.getByTestId("suppliers-filter-statut").selectOption("BLOQUE");
      await expect(page).toHaveURL(/statut=BLOQUE/);
      await expect(page.getByTestId("supplier-row-FRS-00025")).toContainText("Bloqué");
      await expect(page.getByTestId("supplier-row-FRS-00025")).toContainText("Ahmedabad");
    });

    await test.step("Filtres Import + Chine, tri par raison sociale décroissante", async () => {
      await page.getByTestId("suppliers-filter-statut").selectOption("");
      await expect(page).not.toHaveURL(/statut=/);
      await page.getByTestId("suppliers-filter-type").selectOption("IMPORT");
      await expect(page).toHaveURL(/type=IMPORT/);
      await page.getByTestId("suppliers-filter-pays").selectOption("CN");
      await expect(page).toHaveURL(/pays=CN/);
      await expect.poll(() => rangeTotal(page, "suppliers")).toBeGreaterThanOrEqual(6);
      for (const r of await supplierRows(page).all()) {
        const t = norm(await r.textContent());
        expect(t).toContain("Import");
        expect(t).toContain("Chine");
      }
      await page.getByTestId("suppliers-sort-name").click();
      await page.getByTestId("suppliers-sort-name").click();
      await expect(page).toHaveURL(/ordre=desc/);
      const names = await Promise.all((await supplierRows(page).all()).map(async (r) => norm(await r.locator("td").nth(1).textContent())));
      expect(names.length).toBeGreaterThanOrEqual(6);
      expect(names[0].toLowerCase() >= names[names.length - 1].toLowerCase()).toBe(true);
    });

    await test.step("Export Excel des fournisseurs : mêmes lignes que la liste filtrée", async () => {
      const total = await rangeTotal(page, "suppliers");
      const file = await downloadFrom(page, "suppliers-export");
      expect(file.name).toMatch(/^fournisseurs_\d{8}\.xlsx$/);
      const xl = await readExport(file.path, "Fournisseurs");
      expect(xl.rows).toHaveLength(total);
      for (const r of xl.rows) {
        expect(r["Type"]).toBe("Import");
        expect(r["Pays"]).toBe("CN");
      }
    });

    await test.step("Recherche par NCC d'un fournisseur local", async () => {
      await page.getByTestId("suppliers-reset").click();
      await page.getByTestId("suppliers-search").fill("2100003A");
      await expect(page).toHaveURL(/q=2100003A/);
      await expect(supplierRows(page)).toHaveCount(1);
      await expect(page.getByTestId("supplier-row-FRS-00003")).toContainText("TEXTILES DU BANDAMA");
    });
  });

  test("recherche tapée puis clic immédiat sur une ligne : la fiche s'ouvre sans retour à la liste (debounce)", async ({ page }) => {
    await loginAs(page, "RESPONSABLE_ACHATS");
    await page.clock.install(); // le temps réel continue de s'écouler ; runFor déclenche les minuteries en attente
    await ready(page, "/stock/articles");
    const first = page.getByTestId("article-row-ART-00001");
    await expect(first).toContainText("Polyol");
    await page.getByTestId("articles-search").fill("polyol");
    await first.locator("td").nth(1).click(); // moins de 300 ms après la frappe
    await expect(page).toHaveURL(/\/stock\/articles\/[a-z0-9]+$/);
    await expect(title(page)).toHaveText("Polyol polyéther PO-3000");
    await page.clock.runFor(2000); // laisse passer le délai de recherche (300 ms) et la navigation éventuelle
    await expect(title(page)).toHaveText("Polyol polyéther PO-3000");
    await expect(page).toHaveURL(/\/stock\/articles\/[a-z0-9]+$/);
    await expect(page).not.toHaveURL(/q=/);
  });
});

// ---------------------------------------------------------------------------------------------------
test.describe("SR5 – Essai expiré : consultation et export seulement", () => {
  test.afterEach(async () => {
    await resetLicense(30);
  });

  test("listes et export OK, boutons d'écriture désactivés", async ({ page, context }) => {
    await resetLicense(30);
    const endDay = trialEndDay(30);

    await test.step("Heure simulée après la fin d'essai : connexion OK, bandeau rouge", async () => {
      await setTestNow(context, simulatedAt(endDay, -1, "08:00"));
      await loginAs(page, "RESPONSABLE_ACHATS");
      await expect(page.getByTestId("read-only-banner")).toBeVisible();
    });

    await test.step("Articles : consultation possible, « Nouvel article » grisé", async () => {
      await ready(page, "/stock/articles");
      await expect(itemRows(page).first()).toBeVisible();
      await expect(page.getByTestId("item-create")).toBeDisabled();
      await expect(page.getByTestId("write-disabled-hint").first()).toBeVisible();
    });

    await test.step("Export Excel des articles autorisé en lecture seule", async () => {
      const total = await rangeTotal(page, "articles");
      const file = await downloadFrom(page, "articles-export");
      expect(file.name).toMatch(/^articles_\d{8}\.xlsx$/);
      expect((await readExport(file.path, "Articles")).rows).toHaveLength(total);
    });

    await test.step("Fournisseurs : consultation, export, « Nouveau fournisseur » grisé", async () => {
      await ready(page, "/fournisseurs");
      await expect(supplierRows(page).first()).toBeVisible();
      await expect(page.getByTestId("supplier-create")).toBeDisabled();
      const file = await downloadFrom(page, "suppliers-export");
      expect(file.name).toMatch(/^fournisseurs_\d{8}\.xlsx$/);
    });

    await test.step("Fiche article et fiche fournisseur : enregistrer et bloquer désactivés", async () => {
      await page.goto("/stock/articles");
      await page.getByTestId("article-row-ART-00017").locator("td").nth(1).click();
      await expect(title(page)).toHaveText("Roulement 6308");
      await expect(page.getByTestId("item-save")).toBeDisabled();
      await page.goto("/fournisseurs?q=FRS-00004");
      await page.getByTestId("supplier-link").first().click();
      await expect(page.getByTestId("supplier-block")).toBeDisabled();
      await expect(page.getByTestId("supplier-save")).toBeDisabled();
    });

    await test.step("Devises et réglages : consultables, écriture grisée", async () => {
      await ready(page, "/parametres/devises");
      await expect(page.getByTestId("currency-row-EUR")).toBeVisible();
      await expect(page.getByTestId("rate-add-EUR")).toBeDisabled();
      await ready(page, "/parametres/reglages");
      await expect(page.getByTestId("settings-save")).toBeDisabled();
    });
  });
});

// ---------------------------------------------------------------------------------------------------
test.describe("SR6 – Devises et taux de change", () => {
  const NOTE = "e2e-sr6";
  let agedCny = false;
  test.afterEach(async () => {
    await dbQuery("DELETE FROM exchange_rates WHERE note = $1", [NOTE]);
    if (agedCny) await dbQuery("UPDATE exchange_rates SET date = date + 60 WHERE currency_code = 'CNY'");
    agedCny = false;
    await resetLicense(30);
  });

  test("parité EUR confirmée, virgule, doublon, droits acheteur, alerte « taux ancien »", async ({ page }, testInfo) => {
    const offset = testInfo.project.name === "desktop" ? -3 : -4; // jours distincts par projet
    const rateDay = dayOffset(offset);

    await test.step("Responsable : XOF devise de base, taux EUR du seed, aucune alerte", async () => {
      await loginAs(page, "RESPONSABLE_ACHATS");
      await ready(page, "/parametres/devises");
      await expect(page.getByTestId("currency-rate-XOF")).toContainText("devise de base");
      await expect(page.getByTestId("currency-rate-EUR")).toHaveText("655,957");
      await expect(page.getByTestId("rates-stale-alert")).toHaveCount(0);
    });

    await test.step("Taux EUR ≠ 655,957 : confirmation demandée, « Annuler » n'enregistre rien", async () => {
      await page.getByTestId("rate-add-EUR").click();
      await expect(page.getByTestId("rate-dialog")).toBeVisible();
      await page.getByTestId("rate-date").fill(rateDay);
      await page.getByTestId("rate-value").fill("600");
      await page.getByTestId("rate-note").fill(NOTE);
      await page.getByTestId("rate-save").click();
      const confirm = page.getByTestId("rate-eur-confirm");
      await expect(confirm).toBeVisible();
      await expect(confirm).toContainText("655,957");
      await confirm.getByTestId("rate-eur-confirm-cancel").click();
      await expect(confirm).toBeHidden();
      const none = await dbQuery("SELECT 1 FROM exchange_rates WHERE currency_code = 'EUR' AND note = $1", [NOTE]);
      expect(none).toHaveLength(0);
    });

    await test.step("Confirmer enregistre le taux et le journal le trace", async () => {
      await page.getByTestId("rate-save").click();
      await page.getByTestId("rate-eur-confirm-confirm").click();
      await expect(page.getByTestId("rate-dialog")).toBeHidden();
      const row = await dbOne<{ rate: string; date: string; id: string }>(
        "SELECT rate::text, date::text, id FROM exchange_rates WHERE currency_code = 'EUR' AND note = $1",
        [NOTE],
      );
      expect(Number(row.rate)).toBe(600);
      expect(row.date).toContain(rateDay);
      const audit = await dbQuery("SELECT 1 FROM audit_logs WHERE action = 'EXCHANGE_RATE_CREATE' AND entity_id = $1", [row.id]);
      expect(audit).toHaveLength(1);
      // Le dernier taux affiché reste celui de la veille (plus récent que le taux saisi à J-3/J-4).
      await expect(page.getByTestId("currency-rate-EUR")).toHaveText("655,957");
    });

    await test.step("Taux USD saisi avec une virgule : accepté sans confirmation, doublon de date refusé", async () => {
      await page.getByTestId("rate-add-USD").click();
      await page.getByTestId("rate-date").fill(rateDay);
      await page.getByTestId("rate-value").fill("610,5");
      await page.getByTestId("rate-note").fill(NOTE);
      await page.getByTestId("rate-save").click();
      await expect(page.getByTestId("rate-dialog")).toBeHidden();
      const row = await dbOne<{ rate: string }>("SELECT rate::text FROM exchange_rates WHERE currency_code = 'USD' AND note = $1", [NOTE]);
      expect(Number(row.rate)).toBeCloseTo(610.5, 6);
      await page.getByTestId("rate-add-USD").click();
      await page.getByTestId("rate-date").fill(rateDay);
      await page.getByTestId("rate-value").fill("611");
      await page.getByTestId("rate-save").click();
      await expect(page.getByTestId("rate-date-error")).toBeVisible();
      await page.getByTestId("rate-dialog").getByRole("button", { name: "Annuler" }).click();
      await page.getByTestId("rate-history-USD").click();
      await expect(page.getByTestId("rate-history-dialog")).toBeVisible();
      expect(await page.getByTestId("rate-history-row").count()).toBeGreaterThanOrEqual(3);
      await expect(page.getByTestId("rate-history-table")).toContainText("610,5");
      await page.keyboard.press("Escape");
    });

    await test.step("Acheteur : saisit un taux mais ne crée pas de devise et n'ouvre pas les dépôts", async () => {
      await logout(page);
      await loginAs(page, "ACHETEUR_LOCAL");
      await ready(page, "/parametres/devises");
      await expect(page.getByTestId("rate-add-CNY")).toBeEnabled();
      await expect(page.getByTestId("currency-create")).toHaveCount(0);
      await expect(page.getByTestId("currency-deactivate-CNY")).toHaveCount(0);
      await page.goto("/parametres/depots");
      await expect(page).toHaveURL(/\/acces-refuse/);
    });

    // Le cookie rb-test-now n'est pas lu par cette page (now() synchrone) : on vieillit les taux CNY en base.
    await test.step("Taux CNY de plus de 30 jours : alerte « taux ancien » pour cette devise seule", async () => {
      await logout(page);
      await loginAs(page, "RESPONSABLE_ACHATS");
      await dbQuery("UPDATE exchange_rates SET date = date - 60 WHERE currency_code = 'CNY'");
      agedCny = true;
      await ready(page, "/parametres/devises");
      await expect(page.getByTestId("rates-stale-alert")).toBeVisible();
      await expect(page.getByTestId("rates-stale-CNY")).toContainText("plus de 30 jours");
      await expect(page.getByTestId("rates-stale-EUR")).toHaveCount(0);
      await expect(page.getByTestId("currency-row-CNY")).toContainText("Taux ancien");
    });

    await test.step("La saisie du taux du jour pour CNY retire l'alerte", async () => {
      await page.getByTestId("rate-add-CNY").click();
      await expect(page.getByTestId("rate-date")).toHaveValue(dayOffset(0));
      await page.getByTestId("rate-value").fill("84,25");
      await page.getByTestId("rate-note").fill(NOTE);
      await page.getByTestId("rate-save").click();
      await expect(page.getByTestId("rate-dialog")).toBeHidden();
      await expect(page.getByTestId("rates-stale-alert")).toHaveCount(0);
      await expect(page.getByTestId("currency-rate-CNY")).toHaveText("84,25");
    });
  });
});
