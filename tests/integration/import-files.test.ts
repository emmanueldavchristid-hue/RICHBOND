import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { currentYear, todayAbidjan } from "@/lib/dates";
import { cleanTestUsers, createTestUser } from "../helpers/db";
import { IT_PREFIX, cleanReferentials, ensureCurrencies } from "../helpers/referentials";
import { cleanPurchaseOrders } from "../helpers/purchase-orders";
import { applyMovement, getStockLevel } from "@/modules/stock";
import { createReceipt } from "@/modules/receiving";
import {
  addCost,
  cancelImportFile,
  closeImportFile,
  createImportFile,
  exportCostSheetPdf,
  exportCostSheetXlsx,
  getImportFile,
  listImportFiles,
  listLateMilestones,
  setLineLogistics,
  updateCost,
  updateMilestone,
} from "@/modules/import-files";
import type { OrderActor } from "@/modules/purchase-orders";

let resp: OrderActor;
let achLocal: OrderActor;
let achImport: OrderActor;
let mag: OrderActor;
let wh: { id: string };
let itemA: { id: string };
let itemB: { id: string };
let supplier: { id: string };
let types: { fret: string; droits: string; tva: string };

const toActor = (u: { id: string; role: OrderActor["role"]; purchaseScope: OrderActor["purchaseScope"] }): OrderActor => ({ id: u.id, role: u.role, purchaseScope: u.purchaseScope });
const today = () => todayAbidjan(new Date());
const dayOffset = (n: number) => new Date(`${today()}T00:00:00.000Z`).getTime() + n * 86_400_000;

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "OK";
  } catch (e) {
    return (e as { code?: string }).code ?? `ERR:${(e as Error).message}`;
  }
}

let seq = 0;
/** BC import en USD au taux 600 : ligne A 100 U à 10 USD (600 000 FCFA), ligne B 50 U à 20 USD (600 000 FCFA). */
async function makeOrder(status: "CONFIRME" | "BROUILLON" = "CONFIRME") {
  seq += 1;
  const po = await db.purchaseOrder.create({
    data: {
      number: status === "BROUILLON" ? null : `BC-${currentYear()}-8${String(seq).padStart(4, "0")}`,
      status,
      type: "IMPORT",
      origin: "DIRECT",
      supplierId: supplier.id,
      createdById: achImport.id,
      currencyCode: "USD",
      exchangeRate: 600,
      paymentTerm: "J30",
      warehouseId: wh.id,
      deliveryAddress: "Zone industrielle, Abidjan",
      requestedDate: new Date(dayOffset(-5)),
      expectedDate: new Date(dayOffset(-5)),
      lines: {
        create: [
          { lineNo: 1, itemId: itemA.id, quantity: 100, unit: "U", stockQty: 100, unitPrice: 10, vatRate: 0, netAmount: 1000 },
          { lineNo: 2, itemId: itemB.id, quantity: 50, unit: "U", stockQty: 50, unitPrice: 20, vatRate: 0, netAmount: 1000 },
        ],
      },
    },
    include: { lines: { orderBy: { lineNo: "asc" } } },
  });
  return { id: po.id, lineA: po.lines[0].id, lineB: po.lines[1].id };
}

const receiveAll = (o: { id: string; lineA: string; lineB: string }) =>
  createReceipt(mag, {
    orderId: o.id,
    deliveryNoteRef: "BL-IMP-001",
    receivedAt: today(),
    lines: [
      { orderLineId: o.lineA, deliveredQty: 100, acceptedQty: 100, refusedQty: 0 },
      { orderLineId: o.lineB, deliveredQty: 50, acceptedQty: 50, refusedQty: 0 },
    ],
  });

async function wipe() {
  await cleanPurchaseOrders();
  await cleanReferentials();
  await cleanTestUsers();
  await db.approachCoefficientDefault.deleteMany();
  await db.approachCostType.deleteMany();
  await db.setting.deleteMany({ where: { key: { startsWith: "receipt." } } });
  await db.auditLog.deleteMany({ where: { entity: { in: ["Receipt", "NonConformity", "SupplierReturn", "ImportFile"] } } });
  await db.notification.deleteMany({ where: { entity: { in: ["Receipt", "ImportFile"] } } });
}

beforeEach(async () => {
  await wipe();
  await ensureCurrencies();
  await db.currency.upsert({ where: { code: "USD" }, update: { active: true }, create: { code: "USD", name: "Dollar", symbol: "$", decimals: 2 } });
  resp = toActor(await createTestUser("imp-resp", { role: "RESPONSABLE_ACHATS" }));
  achLocal = toActor(await createTestUser("imp-loc", { role: "ACHETEUR", purchaseScope: "LOCAL" }));
  achImport = toActor(await createTestUser("imp-imp", { role: "ACHETEUR", purchaseScope: "IMPORT" }));
  mag = toActor(await createTestUser("imp-mag", { role: "MAGASINIER" }));
  wh = await db.warehouse.create({ data: { code: `${IT_PREFIX}IMP-WH`, name: "Dépôt import test" } });
  itemA = await db.item.create({ data: { code: `${IT_PREFIX}IMP-A`, name: "Roulement A import", category: "PDR", stockUnit: "U", purchaseUnit: "U" } });
  itemB = await db.item.create({ data: { code: `${IT_PREFIX}IMP-B`, name: "Roulement B import", category: "PDR", stockUnit: "U", purchaseUnit: "U" } });
  supplier = await db.supplier.create({ data: { code: `${IT_PREFIX}IMP-S`, name: "Bearing test Ltd", type: "IMPORT", country: "SG", currencyCode: "USD", paymentTerm: "J30" } });
  const fret = await db.approachCostType.create({ data: { code: "T_FRET", label: "Fret test", sortOrder: 1 } });
  const droits = await db.approachCostType.create({ data: { code: "T_DROITS", label: "Droits test", sortOrder: 2 } });
  const tva = await db.approachCostType.create({ data: { code: "T_TVA", label: "TVA import test", sortOrder: 3, vatRecoverableDefault: true } });
  types = { fret: fret.id, droits: droits.id, tva: tva.id };
  await db.approachCoefficientDefault.createMany({
    data: [
      { mode: "MARITIME", typeId: fret.id, pctOfValue: 5 },
      { mode: "MARITIME", typeId: droits.id, pctOfValue: 6 },
    ],
  });
});

afterAll(async () => {
  await wipe();
  await db.$disconnect();
});

describe("périmètre : l'acheteur local n'a aucun accès", () => {
  it("création, lecture, liste et clôture refusées (FORBIDDEN) ; magasinier aussi", async () => {
    const o = await makeOrder();
    expect(await code(createImportFile(achLocal, { supplierId: supplier.id, mode: "MARITIME", orderIds: [o.id] }))).toBe("FORBIDDEN");
    expect(await code(listImportFiles(achLocal, {}))).toBe("FORBIDDEN");
    expect(await code(listLateMilestones(achLocal))).toBe("FORBIDDEN");
    expect(await code(createImportFile(mag, { supplierId: supplier.id, mode: "MARITIME" }))).toBe("FORBIDDEN");
    const f = await createImportFile(achImport, { supplierId: supplier.id, mode: "MARITIME", orderIds: [o.id] });
    expect(await code(getImportFile(achLocal, { id: f.id }))).toBe("FORBIDDEN");
    expect(await code(closeImportFile(achLocal, { id: f.id }))).toBe("FORBIDDEN");
  });
});

describe("création du dossier", () => {
  it("numéro IMP, 10 jalons, frais estimés par les coefficients du mode ; règles de rattachement", async () => {
    const o = await makeOrder();
    const f = await createImportFile(achImport, { supplierId: supplier.id, mode: "MARITIME", incoterm: "CIF", orderIds: [o.id] });
    expect(f.number).toBe(`IMP-${currentYear()}-0001`);
    const file = await db.importFile.findUniqueOrThrow({ where: { id: f.id }, include: { milestones: true, costs: true } });
    expect(file.milestones).toHaveLength(10);
    expect(file.costs.map((c) => [c.status, c.autoEstimate, c.amountXof]).sort()).toEqual([["ESTIME", true, 60_000], ["ESTIME", true, 72_000]]);
    expect(await db.auditLog.count({ where: { entity: "ImportFile", entityId: f.id, action: "IMPORT_FILE_CREATE" } })).toBe(1);

    // Un BC n'appartient qu'à un dossier ; un brouillon ou un BC local ne se rattache pas.
    expect(await code(createImportFile(achImport, { supplierId: supplier.id, mode: "AERIEN", orderIds: [o.id] }))).toBe("BC_DEJA_RATTACHE");
    const draft = await makeOrder("BROUILLON");
    expect(await code(createImportFile(achImport, { supplierId: supplier.id, mode: "AERIEN", orderIds: [draft.id] }))).toBe("BC_NON_VALIDE");
    const local = await db.supplier.create({ data: { code: `${IT_PREFIX}IMP-L`, name: "Local", type: "LOCAL", currencyCode: "XOF", paymentTerm: "J30" } });
    expect(await code(createImportFile(achImport, { supplierId: local.id, mode: "ROUTIER" }))).toBe("FOURNISSEUR_LOCAL");
  });
});

describe("scénario S6 : frais estimés -> réels, réception, clôture, PMP réajusté", () => {
  it("clôture transactionnelle : coût dédouané, coefficient, historique, PMP du stock restant, audit", async () => {
    const o = await makeOrder();
    const f = await createImportFile(achImport, { supplierId: supplier.id, mode: "MARITIME", orderIds: [o.id] });

    // Refus tant que le BC n'est pas réceptionné.
    expect(await code(closeImportFile(achImport, { id: f.id }))).toBe("BC_NON_RECEPTIONNE");
    await receiveAll(o);
    // Refus tant que des frais sont estimés sans accord explicite.
    expect(await code(closeImportFile(achImport, { id: f.id }))).toBe("FRAIS_ESTIMES");

    // Frais estimé -> réel : le montant réel est obligatoire pour remplacer une estimation automatique.
    const detail = await getImportFile(achImport, { id: f.id });
    const fretCost = detail.sheet.costs.find((c) => c.typeCode === "T_FRET")!;
    const droitsCost = detail.sheet.costs.find((c) => c.typeCode === "T_DROITS")!;
    expect(await code(updateCost(achImport, { costId: fretCost.id, status: "REEL" }))).toBe("MONTANT_REEL_REQUIS");
    await updateCost(achImport, { costId: fretCost.id, status: "REEL", amount: 100, currencyCode: "USD", rate: 610, allocationKey: "POIDS", payee: "Armateur test", reason: "Facture reçue" });
    await updateCost(achImport, { costId: droitsCost.id, status: "REEL", amount: 70_000, currencyCode: "XOF" });
    const fret = await db.approachCost.findUniqueOrThrow({ where: { id: fretCost.id } });
    expect(fret).toMatchObject({ status: "REEL", amountXof: 61_000, autoEstimate: false, allocationKey: "POIDS" });
    expect(fret.rate.toString()).toBe("610");
    // TVA import récupérable : exclue du coût de revient.
    await addCost(achImport, { fileId: f.id, typeId: types.tva, status: "REEL", amount: 216_000, currencyCode: "XOF" });
    expect(await db.approachCostAdjustment.count({ where: { fileId: f.id } })).toBeGreaterThanOrEqual(3);

    // Poids par unité : A 1 kg, B 4 kg => fret réparti 1/3 - 2/3 (20 333 + 40 667).
    await setLineLogistics(achImport, { fileId: f.id, lines: [{ orderLineId: o.lineA, unitWeightKg: 1, unitVolumeM3: null }, { orderLineId: o.lineB, unitWeightKg: 4, unitVolumeM3: null }] });

    // 20 unités de B déjà sorties avant la clôture : l'écart sur ces sorties est exposé, pas réécrit.
    await db.$transaction((tx) => applyMovement(tx, { itemId: itemB.id, warehouseId: wh.id, type: "SORTIE", quantity: -20, documentType: "SORTIE", documentRef: "SOR-TEST", occurredAt: new Date(), createdById: mag.id }));
    const before = await getStockLevel(db, itemB.id, wh.id);
    expect(before.quantity.toString()).toBe("30");
    expect(before.pmp.toString()).toBe("12000");

    const live = await getImportFile(achImport, { id: f.id });
    expect(live.sheet.final).toBe(false);
    expect(live.closable.ok).toBe(true);
    expect(live.sheet.totals).toMatchObject({ goodsValueXof: 1_200_000, costsXof: 131_000, excludedXof: 216_000, landedXof: 1_331_000, estimatedCostCount: 0 });

    const res = await closeImportFile(achImport, { id: f.id });
    expect(res.coefficient).toBe("1.1092");
    expect(res).toMatchObject({ status: "CLOTURE", landedXof: 1_331_000, movements: 2, appliedXof: 55_333 + 45_400, exposedXof: 30_267 });

    // Coût d'arrivée dédouané écrit sur les lignes de réception.
    const rls = await db.receiptLine.findMany({ where: { receipt: { orderId: o.id } }, orderBy: { orderLine: { lineNo: "asc" } } });
    expect(rls.map((r) => r.landedUnitCostXof?.toString())).toEqual(["6553.33", "13513.34"]);
    expect(rls.map((r) => r.unitCostXof.toString())).toEqual(["6000", "12000"]);

    // PMP réajusté sur le stock restant seulement ; quantités intactes ; mouvements de quantité 0.
    const a = await getStockLevel(db, itemA.id, wh.id);
    const b = await getStockLevel(db, itemB.id, wh.id);
    expect(a.quantity.toString()).toBe("100");
    expect(a.pmp.toString()).toBe("6553.33");
    expect(b.quantity.toString()).toBe("30");
    expect(b.pmp.toString()).toBe("13513.3333");
    const revals = await db.stockMovement.findMany({ where: { type: "REEVALUATION_COUT" } });
    expect(revals).toHaveLength(2);
    expect(revals.every((m) => m.quantity.isZero() && m.documentType === "DOSSIER_IMPORT" && m.documentRef === f.number)).toBe(true);
    expect(revals.map((m) => m.value).sort((x, y) => x - y)).toEqual([45_400, 55_333]);

    // Historique du coefficient, fiche figée, audit, jalon de réception.
    const hist = await db.approachCoefficientHistory.findMany({ where: { fileId: f.id } });
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ supplierId: supplier.id, origin: "SG", mode: "MARITIME", goodsValueXof: 1_200_000, costsXof: 131_000 });
    expect(hist[0].coefficient.toString()).toBe("1.1092");
    const closed = await getImportFile(achImport, { id: f.id });
    expect(closed.status).toBe("CLOTURE");
    expect(closed.sheet.final).toBe(true);
    expect(closed.sheet.reappraisal.find((r) => r.itemId === itemB.id)).toMatchObject({ appliedXof: 45_400, exposedXof: 30_267 });
    expect(closed.milestones.find((m) => m.code === "RECEPTION_MAGASIN")?.actualDate).toBe(today());
    expect(await db.auditLog.count({ where: { entity: "ImportFile", entityId: f.id, action: "IMPORT_FILE_CLOSE" } })).toBe(1);

    // Une seconde clôture est refusée ; un dossier clôturé n'accepte plus de frais.
    expect(await code(closeImportFile(resp, { id: f.id }))).toBe("INVALID_STATUS");
    expect(await code(addCost(achImport, { fileId: f.id, typeId: types.fret, status: "REEL", amount: 1, currencyCode: "XOF" }))).toBe("INVALID_STATUS");

    // Fiche exportable en Excel et en PDF, y compris après clôture.
    const xlsx = await exportCostSheetXlsx(achImport, { id: f.id });
    expect(xlsx.fileName).toBe(`fiche-cout-revient-${f.number}.xlsx`);
    expect(xlsx.bytes.subarray(0, 2).toString()).toBe("PK");
    const pdf = await exportCostSheetPdf(resp, { id: f.id });
    expect(pdf.bytes.subarray(0, 4).toString()).toBe("%PDF");
  }, 60_000);

  it("clôture avec confirmation explicite des frais encore estimés", async () => {
    const o = await makeOrder();
    const f = await createImportFile(resp, { supplierId: supplier.id, mode: "MARITIME", orderIds: [o.id] });
    await receiveAll(o);
    const res = await closeImportFile(resp, { id: f.id, confirmEstimated: true });
    expect(res).toMatchObject({ status: "CLOTURE", costsXof: 132_000 });
    expect(res.coefficient).toBe("1.11");
    expect(await db.stockMovement.count({ where: { type: "REEVALUATION_COUT" } })).toBe(2);
    const stockA = await getStockLevel(db, itemA.id, wh.id);
    expect(stockA.pmp.toString()).toBe("6660");
  }, 30_000);
});

describe("jalons, retards, annulation", () => {
  it("retard d'un jalon : alerte et filtre ; date réelle future refusée", async () => {
    const o = await makeOrder();
    const f = await createImportFile(achImport, { supplierId: supplier.id, mode: "AERIEN", orderIds: [o.id] });
    const yesterday = new Date(dayOffset(-1)).toISOString().slice(0, 10);
    const tomorrow = new Date(dayOffset(1)).toISOString().slice(0, 10);
    await updateMilestone(achImport, { fileId: f.id, code: "PROFORMA_RECUE", actualDate: yesterday });
    await updateMilestone(achImport, { fileId: f.id, code: "PAIEMENT_OU_CREDOC", plannedDate: yesterday });
    expect(await code(updateMilestone(achImport, { fileId: f.id, code: "EMBARQUEMENT_ETD", actualDate: tomorrow }))).toBe("DATE_FUTURE");

    const late = await listLateMilestones(achImport);
    expect(late).toHaveLength(1);
    expect(late[0]).toMatchObject({ number: f.number, code: "PAIEMENT_OU_CREDOC", daysLate: 1 });
    const list = await listImportFiles(achImport, { lateOnly: true });
    expect(list.total).toBe(1);
    expect(list.rows[0].current?.code).toBe("PAIEMENT_OU_CREDOC");
    expect((await listImportFiles(achImport, { milestone: "PROFORMA_RECUE" })).total).toBe(0);
  });

  it("annulation : motif obligatoire, le BC redevient rattachable", async () => {
    const o = await makeOrder();
    const f = await createImportFile(achImport, { supplierId: supplier.id, mode: "ROUTIER", orderIds: [o.id] });
    expect(await code(cancelImportFile(achImport, { id: f.id, reason: "x" }))).toBe("VALIDATION");
    await cancelImportFile(achImport, { id: f.id, reason: "Commande reportée par le fournisseur" });
    expect((await db.importFile.findUniqueOrThrow({ where: { id: f.id } })).status).toBe("ANNULE");
    expect(await db.importFileOrder.count({ where: { orderId: o.id } })).toBe(0);
    const f2 = await createImportFile(achImport, { supplierId: supplier.id, mode: "ROUTIER", orderIds: [o.id] });
    expect(f2.number).toBe(`IMP-${currentYear()}-0002`);
  });
});
