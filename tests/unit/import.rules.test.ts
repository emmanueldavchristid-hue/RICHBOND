import { readFileSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { resolveMapping, suggestMapping } from "@/modules/import/mapping";
import { parseImportFile } from "@/modules/import/parse";
import { buildImportReportWorkbook, buildTemplate } from "@/modules/import/templates";
import { IMPORT_FIELDS, IMPORT_TYPES } from "@/modules/import/types";
import { emptyContext, validateRows, type ItemRef } from "@/modules/import/validate";
import { isAmbiguousNumber, parseDecimalString } from "@/modules/import/values";

const fixture = (name: string) => readFileSync(path.resolve(__dirname, "../fixtures/import", name));

async function preview(
  name: string,
  type: "ARTICLES" | "FOURNISSEURS" | "ARTICLE_FOURNISSEUR" | "STOCK_INITIAL",
  ctx = emptyContext("2026-10-25"),
) {
  const parsed = await parseImportFile(name, fixture(name));
  const mapping = resolveMapping(type, parsed.headers);
  return validateRows(type, parsed.lines, mapping, ctx);
}

describe("import : lecture des fichiers et détection des colonnes", () => {
  it("détecte les colonnes Sage dans le désordre et lit un CSV à virgules", async () => {
    const parsed = await parseImportFile("articles-desordre.csv", fixture("articles-desordre.csv"));
    expect(parsed.headers).toEqual(["Unité", "Famille", "Désignation", "Catégorie", "Référence"]);
    const m = suggestMapping("ARTICLES", parsed.headers);
    expect(m).toMatchObject({
      code: "Référence",
      name: "Désignation",
      category: "Catégorie",
      stockUnit: "Unité",
      family: "Famille",
    });
    const rows = await preview("articles-desordre.csv", "ARTICLES");
    expect(rows.map((r) => r.status)).toEqual(["OK", "OK"]);
    expect(rows[1].data.name).toBe("Huile hydraulique, ISO 46");
  });

  it("lit le Latin1 et l'Excel, et accepte un mapping explicite", async () => {
    const latin = Buffer.from("Ref;Libellé;Cat;Unité\nIT-L1;Joint torique;PDR;U\n", "latin1");
    const parsed = await parseImportFile("x.csv", latin);
    expect(parsed.lines[0].cells["Libellé"]).toBe("Joint torique");
    const mapping = resolveMapping("ARTICLES", parsed.headers, { code: "Ref", category: "Cat" });
    expect(mapping).toMatchObject({ code: "Ref", name: "Libellé", category: "Cat", stockUnit: "Unité" });
    expect(() => resolveMapping("ARTICLES", parsed.headers, { code: "Inexistante" })).toThrow(/n'existe pas/);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Articles");
    ws.addRow(["Référence", "Désignation", "Catégorie", "Unité"]);
    ws.addRow(["IT-X1", "Courroie", "PDR", "U"]);
    ws.addRow([]);
    ws.addRow(["IT-X2", "Graisse", "Intrant", "KG"]);
    const x = await parseImportFile("x.xlsx", Buffer.from(await wb.xlsx.writeBuffer()));
    expect(x.lines.map((l) => [l.line, l.cells["Référence"]])).toEqual([
      [2, "IT-X1"],
      [4, "IT-X2"],
    ]);
  });

  it("le modèle téléchargeable est relu tel quel avec toutes ses colonnes reconnues", async () => {
    for (const type of IMPORT_TYPES) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load((await buildTemplate(type)) as unknown as ArrayBuffer);
      const headers = (wb.worksheets[0].getRow(1).values as string[]).slice(1);
      const m = suggestMapping(type, headers);
      for (const f of IMPORT_FIELDS[type]) expect(m[f.key], `${type}.${f.key}`).toBe(f.aliases[0]);
    }
    const report = await buildImportReportWorkbook(
      {
        batchId: "b",
        type: "ARTICLES",
        fileName: "a.csv",
        totalRows: 1,
        okCount: 0,
        errorCount: 1,
        created: 0,
        updated: 0,
        unchanged: 0,
      },
      [{ line: 2, ref: "X", outcome: "ERREUR", message: "Code manquant." }],
    );
    expect(report.length).toBeGreaterThan(1000);
  });
});

describe("import : aperçu des erreurs par ligne", () => {
  it("articles : code manquant, catégorie inconnue, doublon, unité inconnue", async () => {
    const rows = await preview("articles-erreurs.csv", "ARTICLES");
    expect(rows.map((r) => r.status)).toEqual(["ERREUR", "ERREUR", "OK", "ERREUR", "ERREUR", "OK"]);
    expect(rows[0].errors.join()).toMatch(/manquant/);
    expect(rows[1].errors.join()).toMatch(/Catégorie inconnue/);
    expect(rows[3].errors.join()).toMatch(/Doublon dans le fichier.*ligne 4/);
    expect(rows[4].errors.join()).toMatch(/Unité inconnue/);
  });

  it("fournisseurs : email invalide ; article-fournisseur : prix invalide et article inconnu", async () => {
    const f = await preview("fournisseurs.csv", "FOURNISSEURS", {
      ...emptyContext("2026-10-25"),
      currencies: new Set(["XOF", "EUR"]),
    });
    expect(f.map((r) => r.status)).toEqual(["OK", "OK", "ERREUR"]);
    expect(f[2].errors.join()).toMatch(/Email invalide/);

    const ctx = emptyContext("2026-10-25");
    ctx.currencies = new Set(["XOF", "EUR"]);
    const item = { id: "i1", code: "IT-IMP-001", stocked: true, purchaseUnit: "U" } as ItemRef;
    ctx.items.set("IT-IMP-001", item);
    ctx.items.set("IT-IMP-002", { ...item, id: "i2", code: "IT-IMP-002" });
    ctx.suppliers.set("IT-FRS-001", {
      id: "s1",
      code: "IT-FRS-001",
      name: "S1",
      status: "ACTIF",
      currencyCode: "XOF",
    } as never);
    ctx.suppliers.set("IT-FRS-002", {
      id: "s2",
      code: "IT-FRS-002",
      name: "S2",
      status: "ACTIF",
      currencyCode: "EUR",
    } as never);
    const l = await preview("article-fournisseur.csv", "ARTICLE_FOURNISSEUR", ctx);
    expect(l.map((r) => r.status)).toEqual(["OK", "OK", "ERREUR", "ERREUR"]);
    expect(l[0].data).toMatchObject({ price: "4500", leadTimeDays: 7 });
    expect(l[1].data.price).toBe("3.8");
    expect(l[2].errors.join()).toMatch(/Prix invalide/);
    expect(l[3].errors.join()).toMatch(/Article inconnu/);
  });

  it("stock initial : quantité négative, PMP manquant, doublon article/dépôt, déjà importé", async () => {
    const ctx = emptyContext("2026-10-25");
    ctx.warehouses.set("IT-DEP", { id: "w", code: "IT-DEP" });
    for (const c of ["IT-IMP-001", "IT-IMP-002", "IT-IMP-003", "IT-IMP-004"])
      ctx.items.set(c, { id: c, code: c, stocked: true } as ItemRef);
    ctx.stockState.set("IT-IMP-001|IT-DEP", { initial: true, other: false });
    const rows = await preview("stock-initial.csv", "STOCK_INITIAL", ctx);
    expect(rows.map((r) => r.status)).toEqual(["OK", "OK", "ERREUR", "ERREUR"]);
    expect(rows[0]).toMatchObject({ action: "UNCHANGED" });
    expect(rows[0].warnings?.[0]).toMatch(/déjà importé/);
    expect(rows[1].data).toMatchObject({ quantity: "3.5", unitCost: "18000.5", date: "2025-12-31" });
    expect(rows[2].errors.join()).toMatch(/ne peut pas être négative/);
    expect(rows[3].errors.join()).toMatch(/PMP initial manquant/);
  });

  it("articles : catégorie par défaut si colonne non associée ou cellule vide, erreur sinon", async () => {
    const csv = Buffer.from("Référence;Désignation;Unité;Catégorie\nIT-D1;Vis;U;\nIT-D2;Écrou;U;Gadget\nIT-D3;Joint;U;Service\n", "utf8");
    const parsed = await parseImportFile("d.csv", csv);
    const mapping = resolveMapping("ARTICLES", parsed.headers);
    const sans = validateRows("ARTICLES", parsed.lines, mapping, emptyContext("2026-10-25"));
    expect(sans[0].errors.join()).toMatch(/Catégorie manquante/);

    const ctx = emptyContext("2026-10-25");
    ctx.defaultCategory = "PDR";
    const avec = validateRows("ARTICLES", parsed.lines, mapping, ctx);
    expect(avec[0]).toMatchObject({ status: "OK", data: { category: "PDR" } });
    expect(avec[1].errors.join()).toMatch(/Catégorie inconnue/);
    expect(avec[2].data.category).toBe("SERVICE");

    // Colonne non associée : la valeur par défaut s'applique à toutes les lignes.
    const nonMapped = { ...mapping, category: null };
    const all = validateRows("ARTICLES", parsed.lines, nonMapped, ctx);
    expect(all.map((r) => [r.status, r.data.category])).toEqual([["OK", "PDR"], ["OK", "PDR"], ["OK", "PDR"]]);
  });

  it("stock initial : quantité 0 ignorée avec avertissement, négative en erreur", async () => {
    const csv = Buffer.from("Référence;Dépôt;Quantité;PMP\nIT-Z1;IT-DEP;0;\nIT-Z2;IT-DEP;-1;100\n", "utf8");
    const parsed = await parseImportFile("z.csv", csv);
    const ctx = emptyContext("2026-10-25");
    ctx.warehouses.set("IT-DEP", { id: "w", code: "IT-DEP" });
    for (const c of ["IT-Z1", "IT-Z2"]) ctx.items.set(c, { id: c, code: c, stocked: true } as ItemRef);
    const rows = validateRows("STOCK_INITIAL", parsed.lines, resolveMapping("STOCK_INITIAL", parsed.headers), ctx);
    expect(rows[0]).toMatchObject({ status: "OK", action: "UNCHANGED", errors: [] });
    expect(rows[0].warnings?.join()).toMatch(/Quantité à 0/);
    expect(rows[1].status).toBe("ERREUR");
  });

  it("quantités ambiguës « 1.250 » / « 1,250 » : valide mais avertissement", async () => {
    expect(isAmbiguousNumber("1.250")).toBe(true);
    expect(isAmbiguousNumber("1,250")).toBe(true);
    expect(isAmbiguousNumber("0,500")).toBe(false);
    expect(isAmbiguousNumber("1 250,5")).toBe(false);
    expect(isAmbiguousNumber("12,5")).toBe(false);
    const csv = Buffer.from("Référence;Dépôt;Quantité;PMP\nIT-A1;IT-DEP;1.250;100\nIT-A2;IT-DEP;1,5;100\n", "utf8");
    const parsed = await parseImportFile("a.csv", csv);
    const ctx = emptyContext("2026-10-25");
    ctx.warehouses.set("IT-DEP", { id: "w", code: "IT-DEP" });
    for (const c of ["IT-A1", "IT-A2"]) ctx.items.set(c, { id: c, code: c, stocked: true } as ItemRef);
    const rows = validateRows("STOCK_INITIAL", parsed.lines, resolveMapping("STOCK_INITIAL", parsed.headers), ctx);
    expect(rows[0]).toMatchObject({ status: "OK", data: { quantity: "1.25" } });
    expect(rows[0].warnings?.join()).toMatch(/1,25/);
    expect(rows[1].warnings).toBeUndefined();
  });

  it("xlsx creux : une cellule en XFD1048576 est refusée vite", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Articles");
    ws.addRow(["Référence", "Désignation", "Catégorie", "Unité"]);
    ws.addRow(["IT-X1", "Courroie", "PDR", "U"]);
    ws.getCell("XFD1048576").value = "x";
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const t0 = Date.now();
    await expect(parseImportFile("creux.xlsx", buf)).rejects.toMatchObject({
      code: expect.stringMatching(/^IMPORT_TROP_(LONG|LARGE)$/),
    });
    expect(Date.now() - t0).toBeLessThan(5000);
  });

  it("nombres : notation française et anglaise, rejets", () => {
    expect(parseDecimalString("1 250,50", 2)).toBe("1250.5");
    expect(parseDecimalString("1.250.000", 0)).toBe("1250000");
    expect(parseDecimalString("1,250.50", 2)).toBe("1250.5");
    expect(parseDecimalString("12,3456", 3)).toBeNull();
    expect(parseDecimalString("abc", 2)).toBeNull();
    expect(parseDecimalString("1,2,3.4", 2)).toBeNull();
  });
});
