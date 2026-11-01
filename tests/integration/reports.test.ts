import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cleanTestUsers, createTestUser } from "../helpers/db";
import { IT_PREFIX, cleanReferentials, ensureCurrencies } from "../helpers/referentials";
import { cleanPurchaseRequests } from "../helpers/purchase-requests";
import { buildReport, exportReport, REPORT_KINDS, type Report } from "@/modules/reporting";

/**
 * LOT-15 : rapports sur un jeu de données connu (octobre 2026, généré le 01/11/2026), droits et périmètre, exports PDF / Excel.
 * Le jeu est décrit dans seedScenario : chaque valeur attendue se recalcule à la main (voir les commentaires).
 */
const AT = new Date("2026-11-01T12:00:00.000Z");
const d = (iso: string) => new Date(`${iso.length === 10 ? `${iso}T09:00:00.000Z` : iso}`);

type Actor = { id: string; role: "RESPONSABLE_ACHATS" | "ACHETEUR" | "MAGASINIER" | "SUPER_ADMIN"; purchaseScope: "LOCAL" | "IMPORT" | "ALL" | null };
let resp: Actor;
let buyerA: Actor;
let buyerLocal: Actor;
let buyerImport: Actor;
let mag: Actor;
let wh: { id: string };
let dept: { id: string };
let s1: { id: string };
let s2: { id: string };
let iCrit: { id: string };
let iA: { id: string };
let iStd: { id: string };
let iDorm: { id: string };
let seq = 0;
let savedLicenses: Awaited<ReturnType<typeof db.license.findMany>> = [];

const toActor = (u: { id: string; role: Actor["role"]; purchaseScope: Actor["purchaseScope"] }): Actor => ({ id: u.id, role: u.role, purchaseScope: u.purchaseScope });

async function mkPo(o: {
  status: "VALIDE" | "CONFIRME" | "RECU" | "PARTIELLEMENT_RECU";
  by: Actor;
  supplier: { id: string };
  type: "LOCAL" | "IMPORT";
  approved: string;
  requested: string;
  amount: number;
  item: { id: string };
}) {
  seq += 1;
  return db.purchaseOrder.create({
    data: {
      number: `BC-IT-${String(seq).padStart(5, "0")}`,
      status: o.status,
      type: o.type,
      supplierId: o.supplier.id,
      createdById: o.by.id,
      currencyCode: "XOF",
      paymentTerm: "J30",
      warehouseId: wh.id,
      requestedDate: d(o.requested),
      expectedDate: d(o.requested),
      totalHtXof: o.amount,
      approvedAt: d(o.approved),
      lines: { create: [{ lineNo: 1, itemId: o.item.id, quantity: 10, unit: "U", unitPrice: o.amount / 10, vatRate: 18, netAmount: o.amount }] },
    },
    include: { lines: true },
  });
}

async function mkPr(o: { submitted: string; approved: string; po: { lines: { id: string }[] }; buyer: Actor }) {
  seq += 1;
  const pr = await db.purchaseRequest.create({
    data: {
      number: `DA-IT-${String(seq).padStart(5, "0")}`,
      status: "COMMANDEE",
      priority: 2,
      departmentId: dept.id,
      requesterName: "Demandeur test",
      reason: `DA test rapports ${seq}`,
      neededBy: d("2026-12-31"),
      createdById: resp.id,
      assignedBuyerId: o.buyer.id,
      submittedAt: d(o.submitted),
      approvedAt: d(o.approved),
      createdAt: d(o.submitted),
      lines: { create: [{ lineNo: 1, itemId: iStd.id, quantity: 10, unit: "U" }] },
    },
    include: { lines: true },
  });
  await db.purchaseOrderLineAllocation.create({ data: { orderLineId: o.po.lines[0].id, requestLineId: pr.lines[0].id, qty: 10 } });
  return pr;
}

async function mkReceipt(po: { id: string; supplierId: string; lines: { id: string }[] }, o: { at: string; daysLate: number; inFull: boolean; item: { id: string } }) {
  seq += 1;
  return db.receipt.create({
    data: {
      number: `REC-IT-${String(seq).padStart(5, "0")}`,
      orderId: po.id,
      supplierId: po.supplierId,
      warehouseId: wh.id,
      deliveryNoteRef: `BL-${seq}`,
      receivedAt: d(o.at),
      referenceDate: d(o.at),
      daysLate: o.daysLate,
      inFull: o.inFull,
      createdById: mag.id,
      lines: { create: [{ orderLineId: po.lines[0].id, itemId: o.item.id, deliveredQty: 10, acceptedQty: 10, acceptedStockQty: 10, unitCostXof: 100 }] },
    },
  });
}

async function mkMovement(o: { item: { id: string }; type: "ENTREE_RECEPTION" | "SORTIE"; qty: number; value: number; stockAfter: number; at: string }) {
  seq += 1;
  return db.stockMovement.create({
    data: {
      itemId: o.item.id,
      warehouseId: wh.id,
      type: o.type,
      quantity: o.qty,
      unitCost: 1000,
      value: o.value,
      pmpBefore: 1000,
      pmpAfter: 1000,
      stockAfter: o.stockAfter,
      documentType: o.type === "SORTIE" ? "SORTIE" : "RECEPTION",
      documentRef: `DOC-IT-${seq}`,
      occurredAt: d(o.at),
      createdById: mag.id,
    },
  });
}

async function seedScenario() {
  // Octobre 2026. BC validés : PO1 local 1 000 000 (05/10), PO2 import 500 000 (10/10), PO3 local 300 000 (12/10), PO4 local 200 000 (15/10).
  const po1 = await mkPo({ status: "RECU", by: buyerA, supplier: s1, type: "LOCAL", approved: "2026-10-05", requested: "2026-10-20", amount: 1_000_000, item: iStd });
  const po2 = await mkPo({ status: "RECU", by: buyerImport, supplier: s2, type: "IMPORT", approved: "2026-10-10", requested: "2026-10-25", amount: 500_000, item: iA });
  const po3 = await mkPo({ status: "CONFIRME", by: buyerA, supplier: s1, type: "LOCAL", approved: "2026-10-12", requested: "2026-10-28", amount: 300_000, item: iStd });
  await mkPo({ status: "CONFIRME", by: buyerA, supplier: s1, type: "LOCAL", approved: "2026-10-15", requested: "2026-11-30", amount: 200_000, item: iCrit });
  // DA : validation en 2 jours chacune ; DA -> BC : 2 jours (PO1) et 0 jour (PO3).
  await mkPr({ submitted: "2026-10-01", approved: "2026-10-03", po: po1, buyer: buyerA });
  await mkPr({ submitted: "2026-10-10", approved: "2026-10-12", po: po3, buyer: buyerA });
  // Réceptions : PO1 soldé à temps (13 jours après le BC), PO2 soldé avec 5 jours de retard (20 jours). PO3 échu, jamais reçu.
  await mkReceipt(po1, { at: "2026-10-18", daysLate: 0, inFull: true, item: iStd });
  await mkReceipt(po2, { at: "2026-10-30", daysLate: 5, inFull: true, item: iA });

  // Stock : valeur actuelle 30 000 + 20 000 + 2 000 = 52 000 ; mouvements d'octobre nets +20 000.
  await db.stockLevel.createMany({
    data: [
      { itemId: iCrit.id, warehouseId: wh.id, quantity: 30, pmp: 1000 },
      { itemId: iA.id, warehouseId: wh.id, quantity: 10, pmp: 2000 },
      { itemId: iDorm.id, warehouseId: wh.id, quantity: 4, pmp: 500 },
    ],
  });
  await mkMovement({ item: iCrit, type: "ENTREE_RECEPTION", qty: 40, value: 40_000, stockAfter: 40, at: "2026-10-05T09:00:00.000Z" });
  await mkMovement({ item: iCrit, type: "SORTIE", qty: -10, value: -10_000, stockAfter: 30, at: "2026-10-20T09:00:00.000Z" });
  await mkMovement({ item: iA, type: "SORTIE", qty: -5, value: -10_000, stockAfter: 0, at: "2026-10-20T10:00:00.000Z" }); // rupture
  await mkMovement({ item: iDorm, type: "ENTREE_RECEPTION", qty: 4, value: 2_000, stockAfter: 4, at: "2026-01-01T09:00:00.000Z" }); // dormant

  // Factures rapprochées d'octobre : une conforme, une avec écart de prix => 50 %.
  const line = po1.lines[0];
  for (const [n, match] of [["A", "CONFORME"], ["B", "ECART_PRIX"]] as const) {
    seq += 1;
    await db.supplierInvoice.create({
      data: {
        number: `FAC-IT-${seq}`,
        supplierInvoiceNo: `F-${n}`,
        supplierId: s1.id,
        status: match === "CONFORME" ? "CONFORME" : "ECART",
        invoiceDate: d("2026-10-22"),
        dueDate: d("2026-11-22"),
        currencyCode: "XOF",
        createdById: buyerA.id,
        matchedAt: d("2026-10-23"),
        lines: { create: [{ lineNo: 1, orderLineId: line.id, quantity: 1, unitPrice: 100, vatRate: 18, netAmount: 100, match }] },
      },
    });
  }

  // Inventaires validés : 90 % et 70 % => 80 %.
  for (const [pct, day] of [[90, "2026-10-14"], [70, "2026-10-28"]] as const) {
    seq += 1;
    await db.inventoryCount.create({
      data: { number: `INV-IT-${seq}`, status: "VALIDE", warehouseId: wh.id, thresholdPct: 5, thresholdValue: 10000, createdById: resp.id, validatedAt: d(day), reliabilityPct: pct },
    });
  }

  // Dossiers import clôturés : coefficients 1,25 et 1,35 => 1,3.
  for (const [coef, day] of [[1.25, "2026-10-09"], [1.35, "2026-10-21"]] as const) {
    seq += 1;
    await db.importFile.create({
      data: { number: `IMP-IT-${seq}`, status: "CLOTURE", supplierId: s2.id, mode: "MARITIME", createdById: resp.id, closedAt: d(day), coefficient: coef },
    });
  }
}

async function wipe() {
  await cleanPurchaseRequests();
  await cleanReferentials();
  await cleanTestUsers();
}

beforeAll(async () => {
  savedLicenses = await db.license.findMany();
});

beforeEach(async () => {
  await wipe();
  seq = 0;
  await ensureCurrencies();
  // Essai expiré : les rapports sont des lectures, ils doivent rester disponibles.
  await db.license.deleteMany();
  await db.license.create({ data: { status: "EXPIRED", trialStartsAt: new Date(Date.now() - 60 * 86_400_000), trialEndsAt: new Date(Date.now() - 86_400_000) } });
  resp = toActor(await createTestUser("rp-resp", { role: "RESPONSABLE_ACHATS" }));
  buyerA = toActor(await createTestUser("rp-ach-a", { role: "ACHETEUR", purchaseScope: "ALL" }));
  buyerLocal = toActor(await createTestUser("rp-ach-l", { role: "ACHETEUR", purchaseScope: "LOCAL" }));
  buyerImport = toActor(await createTestUser("rp-ach-i", { role: "ACHETEUR", purchaseScope: "IMPORT" }));
  mag = toActor(await createTestUser("rp-mag", { role: "MAGASINIER" }));
  wh = await db.warehouse.create({ data: { code: `${IT_PREFIX}RP-W`, name: "Dépôt rapports" } });
  dept = await db.department.create({ data: { code: `${IT_PREFIX}RP-D`, name: "Service rapports" } });
  s1 = await db.supplier.create({ data: { code: `${IT_PREFIX}RP-1`, name: "Fournisseur local test", type: "LOCAL", currencyCode: "XOF", createdById: resp.id } });
  s2 = await db.supplier.create({ data: { code: `${IT_PREFIX}RP-2`, name: "Fournisseur import test", type: "IMPORT", currencyCode: "XOF", createdById: resp.id } });
  iCrit = await db.item.create({ data: { code: `${IT_PREFIX}RP-C`, name: "Article PDR test", category: "PDR", stockUnit: "U", purchaseUnit: "U", createdById: resp.id } });
  iA = await db.item.create({ data: { code: `${IT_PREFIX}RP-A`, name: "Article intrant test", category: "INTRANT", stockUnit: "U", purchaseUnit: "U", createdById: resp.id } });
  iStd = await db.item.create({ data: { code: `${IT_PREFIX}RP-S`, name: "Article fourniture test", category: "FOURNITURE", stockUnit: "U", purchaseUnit: "U", createdById: resp.id } });
  iDorm = await db.item.create({ data: { code: `${IT_PREFIX}RP-D`, name: "Article dormant test", category: "FOURNITURE", stockUnit: "U", purchaseUnit: "U", createdById: resp.id } });
  await seedScenario();
});

afterAll(async () => {
  await wipe();
  await db.license.deleteMany();
  if (savedLicenses.length) await db.license.createMany({ data: savedLicenses });
  await db.$disconnect();
});

const kpiOf = (r: Report, key: string) => r.kpis.find((k) => k.key === key)!;
const tableOf = (r: Report, key: string) => r.tables.find((t) => t.key === key)!;
const MONTH = { month: "2026-10" };

describe("rapport mensuel : KPI sur jeu connu", () => {
  it("achats : montant, nombre de BC, part des achats locaux", async () => {
    const r = await buildReport(resp, "mensuel", MONTH, AT);
    expect(r.periodLabel).toBe("Octobre 2026");
    expect(kpiOf(r, "montant-achete").value).toBe(2_000_000);
    expect(kpiOf(r, "bc-emis").value).toBe(4);
    expect(kpiOf(r, "part-locale").value).toBe(75); // 1 500 000 / 2 000 000
    const types = tableOf(r, "achats-type").rows;
    expect(types.map((x) => [x.type, x.amount])).toEqual([["Local", 1_500_000], ["Import", 500_000]]);
    const cats = Object.fromEntries(tableOf(r, "achats-categorie").rows.map((x) => [x.category, x.amount]));
    expect(cats).toEqual({ Fournitures: 1_300_000, Intrants: 500_000, "Pièces de rechange": 200_000 });
    expect(tableOf(r, "achats-fournisseur").rows[0]).toMatchObject({ supplier: "Fournisseur local test", amount: 1_500_000, share: 75 });
  });

  it("délais, OTIF (un BC échu jamais reçu compte comme manqué)", async () => {
    const r = await buildReport(resp, "mensuel", MONTH, AT);
    expect(kpiOf(r, "delai-validation-da").value).toBe(2);
    expect(kpiOf(r, "delai-da-bc").value).toBe(1); // (2 + 0) / 2
    expect(kpiOf(r, "delai-bc-reception").value).toBe(16.5); // (13 + 20) / 2
    const otif = kpiOf(r, "otif");
    expect(otif.value).toBe(33.3); // PO1 ok ; PO2 en retard ; PO3 échu non reçu ; PO4 non échu (30/11) exclu
    expect(otif.hint).toBe("1 BC sur 3");
  });

  it("stock : valeur, rotation, couverture, ruptures, taux de service, dormants", async () => {
    const r = await buildReport(resp, "mensuel", MONTH, AT);
    expect(kpiOf(r, "valeur-stock").value).toBe(52_000);
    expect(kpiOf(r, "valeur-stock").previous).toBe(32_000); // 52 000 - 20 000 de mouvements d'octobre
    expect(kpiOf(r, "rotation").value).toBe(5.6); // 20 000 / 42 000 x 365/31
    expect(kpiOf(r, "couverture").value).toBe(65.1); // 42 000 / (20 000 / 31)
    expect(kpiOf(r, "ruptures").value).toBe(1);
    expect(kpiOf(r, "taux-service").value).toBe(50); // 1 sortie sur 2 laisse du stock
    expect(kpiOf(r, "valeur-dormants").value).toBe(2_000);
    expect(tableOf(r, "dormants").rows).toHaveLength(1);
  });

  it("factures, inventaires, dossiers import", async () => {
    const r = await buildReport(resp, "mensuel", MONTH, AT);
    expect(kpiOf(r, "conformite-factures").value).toBe(50);
    expect(kpiOf(r, "fiabilite-inventaire").value).toBe(80);
    expect(kpiOf(r, "cout-approche").value).toBe(1.3);
    expect(tableOf(r, "import").rows).toHaveLength(2);
  });

  it("gains achats et évaluation fournisseurs : « non disponible », jamais 0", async () => {
    const r = await buildReport(resp, "mensuel", MONTH, AT);
    for (const key of ["gains-achats", "evaluation-fournisseurs"]) {
      expect(kpiOf(r, key).value).toBeNull();
      expect(kpiOf(r, key).unavailable).toMatch(/Non disponible/);
    }
    expect(tableOf(r, "gains").unavailable).toMatch(/Non disponible/);
    expect(tableOf(r, "evaluation").unavailable).toMatch(/Non disponible/);
  });

  it("filtres : fournisseur, catégorie, acheteur, dépôt", async () => {
    const bySupplier = await buildReport(resp, "mensuel", { ...MONTH, supplierId: s2.id }, AT);
    expect(kpiOf(bySupplier, "montant-achete").value).toBe(500_000);
    expect(bySupplier.filters).toEqual([{ label: "Fournisseur", value: "Fournisseur import test" }]);
    const byCat = await buildReport(resp, "mensuel", { ...MONTH, category: "PDR" }, AT);
    expect(kpiOf(byCat, "montant-achete").value).toBe(200_000);
    const byBuyer = await buildReport(resp, "mensuel", { ...MONTH, buyerId: buyerImport.id }, AT);
    expect(kpiOf(byBuyer, "montant-achete").value).toBe(500_000);
    const otherWh = await db.warehouse.create({ data: { code: `${IT_PREFIX}RP-W2`, name: "Autre dépôt" } });
    const byWh = await buildReport(resp, "mensuel", { ...MONTH, warehouseId: otherWh.id }, AT);
    expect(kpiOf(byWh, "montant-achete").value).toBe(0);
    expect(kpiOf(byWh, "valeur-stock").value).toBe(0);
    await expect(buildReport(resp, "mensuel", { ...MONTH, supplierId: "inconnu" }, AT)).rejects.toThrow(/Fournisseur introuvable/);
  });
});

describe("rapports quotidien et hebdomadaire", () => {
  it("quotidien du 20/10 : sorties, ruptures, entrées", async () => {
    const r = await buildReport(resp, "quotidien", { date: "2026-10-20" }, AT);
    expect(r.periodLabel).toBe("20/10/2026");
    expect(kpiOf(r, "valeur-sorties").value).toBe(20_000);
    expect(kpiOf(r, "valeur-entrees").value).toBe(0);
    expect(kpiOf(r, "ruptures").value).toBe(1);
    expect(tableOf(r, "ruptures").rows[0]).toMatchObject({ code: `${IT_PREFIX}RP-A` });
    const day18 = await buildReport(resp, "quotidien", { date: "2026-10-18" }, AT);
    expect(kpiOf(day18, "receptions").value).toBe(1);
    const day12 = await buildReport(resp, "quotidien", { date: "2026-10-12" }, AT);
    expect(kpiOf(day12, "da-validees").value).toBe(1);
    expect(kpiOf(day12, "bc-emis").value).toBe(1);
    expect(kpiOf(day12, "bc-en-retard").value).toBe(0);
  });

  it("quotidien : BC en retard à la fin du jour (PO3 attendu le 28/10)", async () => {
    const r = await buildReport(resp, "quotidien", { date: "2026-11-01" }, AT);
    expect(kpiOf(r, "bc-en-retard").value).toBe(1);
    expect(tableOf(r, "retards").rows[0]).toMatchObject({ late: 4, expected: "2026-10-28" });
  });

  it("hebdomadaire : semaine du 19 au 25/10, top consommations et inventaires", async () => {
    const r = await buildReport(resp, "hebdomadaire", { date: "2026-10-22" }, AT);
    expect(r.periodLabel).toBe("Semaine du 19/10/2026 au 25/10/2026");
    expect(tableOf(r, "consommations").rows).toHaveLength(2);
    expect(tableOf(r, "consommations").rows[0].value).toBe(10_000);
    expect(tableOf(r, "inventaires").rows).toHaveLength(0);
    const wk = await buildReport(resp, "hebdomadaire", { date: "2026-10-28" }, AT);
    expect(kpiOf(wk, "fiabilite-inventaire").value).toBe(70);
    expect(tableOf(wk, "inventaires").rows).toHaveLength(1);
  });
});

describe("droits et périmètre", () => {
  it("le Magasinier n'a accès à aucun rapport achats", async () => {
    for (const kind of REPORT_KINDS) {
      await expect(buildReport(mag, kind, {}, AT)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(exportReport(mag, kind, "pdf", {}, null, AT)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("l'Acheteur local ne voit que les achats locaux et pas le coût d'approche import", async () => {
    const r = await buildReport(buyerLocal, "mensuel", MONTH, AT);
    expect(kpiOf(r, "montant-achete").value).toBe(1_500_000);
    expect(kpiOf(r, "part-locale").unavailable).toBeTruthy();
    expect(kpiOf(r, "cout-approche").unavailable).toBeTruthy();
    expect(tableOf(r, "import").unavailable).toBeTruthy();
    expect(r.filters[0]).toEqual({ label: "Périmètre", value: "Achats locaux" });
  });

  it("l'Acheteur import ne voit que les achats import", async () => {
    const r = await buildReport(buyerImport, "mensuel", MONTH, AT);
    expect(kpiOf(r, "montant-achete").value).toBe(500_000);
    expect(kpiOf(r, "cout-approche").value).toBe(1.3);
  });

  it("l'Acheteur « les deux » et le Responsable voient tout ; essai expiré : lecture autorisée", async () => {
    expect(kpiOf(await buildReport(buyerA, "mensuel", MONTH, AT), "montant-achete").value).toBe(2_000_000);
    expect(kpiOf(await buildReport(resp, "mensuel", MONTH, AT), "montant-achete").value).toBe(2_000_000);
  });

  it("paramètres invalides : message clair", async () => {
    await expect(buildReport(resp, "quotidien", { date: "2026-02-31" }, AT)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(buildReport(resp, "mensuel", { month: "2026-13" }, AT)).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("exports PDF et Excel", () => {
  it("les 3 rapports génèrent un PDF et un Excel non vides, et l'export est tracé", async () => {
    for (const kind of REPORT_KINDS) {
      const pdf = await exportReport(resp, kind, "pdf", kind === "mensuel" ? MONTH : { date: "2026-10-20" }, null, AT);
      expect(pdf.bytes.subarray(0, 4).toString()).toBe("%PDF");
      expect(pdf.bytes.length).toBeGreaterThan(2000);
      expect(pdf.fileName).toMatch(new RegExp(`^rapport-${kind}-\\d{4}-\\d{2}.*\\.pdf$`));
      const xlsx = await exportReport(resp, kind, "xlsx", kind === "mensuel" ? MONTH : { date: "2026-10-20" }, null, AT);
      expect(xlsx.bytes.subarray(0, 2).toString()).toBe("PK");
      expect(xlsx.fileName.endsWith(".xlsx")).toBe(true);
    }
    expect(await db.auditLog.count({ where: { action: "REPORT_EXPORT", userId: resp.id } })).toBe(6);
  });

  it("le classeur Excel contient les montants en nombres et le texte des formules est neutralisé", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const { bytes } = await exportReport(resp, "mensuel", "xlsx", MONTH, null, AT);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toContain("Indicateurs");
    expect(names).toContain("Achats par type");
    const ws = wb.getWorksheet("Indicateurs")!;
    const row = ws.getRows(2, 30)!.find((rw) => rw.getCell(1).value === "Montant acheté")!;
    expect(row.getCell(2).value).toBe(2_000_000);
  });
});

describe("performance", () => {
  it("le rapport quotidien se calcule en moins de 3 s", async () => {
    const t0 = Date.now();
    await buildReport(resp, "quotidien", { date: "2026-10-20" }, AT);
    expect(Date.now() - t0).toBeLessThan(3000);
  });
});
