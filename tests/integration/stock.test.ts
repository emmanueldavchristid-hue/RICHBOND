import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { currentYear, todayAbidjan } from "@/lib/dates";
import { cleanTestUsers, createTestUser } from "../helpers/db";
import { IT_PREFIX, cleanReferentials } from "../helpers/referentials";
import { cleanPurchaseRequests } from "../helpers/purchase-requests";
import { cleanStock } from "../helpers/stock";
import {
  adjust,
  applyMovement,
  applySuggestedThresholds,
  cancelIssue,
  createIssue,
  createReorderRequests,
  getStockLevel,
  itemForecast,
  itemLedger,
  listMovements,
  listReorder,
  listStock,
  recomputeAbc,
  transfer,
  type StockActor,
} from "@/modules/stock";

const session: { current: { user: { id: string; sessionVersion: number } } | null } = { current: null };
vi.mock("@/lib/auth", () => ({ auth: async () => session.current }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/modules/auth/ip", () => ({ getClientIp: async () => "127.0.0.1" }));
const sorties = await import("@/app/(app)/stock/sorties/actions");
const mouvements = await import("@/app/(app)/stock/mouvements/actions");

let resp: StockActor;
let mag: StockActor;
let ach: StockActor;
let respUser: { id: string; sessionVersion: number };
let magUser: { id: string; sessionVersion: number };
let whA: { id: string };
let whB: { id: string };
let dept: { id: string };
let item: { id: string };
let pdr: { id: string };
let savedLicenses: Awaited<ReturnType<typeof db.license.findMany>> = [];

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const toActor = (u: { id: string; role: StockActor["role"]; purchaseScope: StockActor["purchaseScope"] }): StockActor => ({ id: u.id, role: u.role, purchaseScope: u.purchaseScope });

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "OK";
  } catch (e) {
    return (e as { code?: string }).code ?? `ERR:${(e as Error).message}`;
  }
}

async function message(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "";
  } catch (e) {
    return (e as { messageFr?: string }).messageFr ?? (e as Error).message;
  }
}

/** Mouvement posé par la porte unique, dans sa propre transaction. */
const move = (over: Record<string, unknown>) =>
  db.$transaction((tx) =>
    applyMovement(tx, {
      itemId: item.id,
      warehouseId: whA.id,
      type: "ENTREE_RECEPTION",
      quantity: 100,
      unitCost: 1000,
      documentType: "RECEPTION",
      documentRef: "REC-IT-00001",
      occurredAt: new Date(),
      createdById: resp.id,
      ...over,
    } as Parameters<typeof applyMovement>[1]),
  );
const level = async (itemId = item.id, warehouseId = whA.id) => (await getStockLevel(db, itemId, warehouseId)).quantity.toString();

const issueInput = (qty: number, over: Record<string, unknown> = {}) => ({
  warehouseId: whA.id,
  departmentId: dept.id,
  requesterName: "Chef d'équipe test",
  reason: "Maintenance préventive",
  equipment: "Ensacheuse",
  lines: [{ itemId: item.id, quantity: qty }],
  ...over,
});

async function setLicense(status: "TRIAL" | "EXPIRED") {
  await db.license.deleteMany();
  const now = Date.now();
  await db.license.create({ data: { status, trialStartsAt: new Date(now - 60 * DAY), trialEndsAt: new Date(now + (status === "EXPIRED" ? -1 : 10) * DAY) } });
}

async function wipe() {
  await cleanPurchaseRequests();
  await cleanReferentials();
  await cleanTestUsers();
  await db.setting.deleteMany({ where: { key: { startsWith: "stock." } } });
  await db.auditLog.deleteMany({ where: { entity: { in: ["StockIssue", "StockMovement"] } } });
}

beforeAll(async () => {
  savedLicenses = await db.license.findMany();
});

beforeEach(async () => {
  await wipe();
  session.current = null;
  await setLicense("TRIAL");
  const r = await createTestUser("sk-resp", { role: "RESPONSABLE_ACHATS" });
  const m = await createTestUser("sk-mag", { role: "MAGASINIER" });
  const a = await createTestUser("sk-ach", { role: "ACHETEUR", purchaseScope: "ALL" });
  resp = toActor(r);
  mag = toActor(m);
  ach = toActor(a);
  respUser = { id: r.id, sessionVersion: r.sessionVersion };
  magUser = { id: m.id, sessionVersion: m.sessionVersion };
  whA = await db.warehouse.create({ data: { code: `${IT_PREFIX}SK-A`, name: "Principal" } });
  whB = await db.warehouse.create({ data: { code: `${IT_PREFIX}SK-B`, name: "Annexe" } });
  dept = await db.department.create({ data: { code: `${IT_PREFIX}SK-D`, name: "Service stock test" } });
  item = await db.item.create({ data: { code: `${IT_PREFIX}SK-1`, name: "Courroie test stock", category: "FOURNITURE", stockUnit: "U", purchaseUnit: "U", createdById: r.id } });
  pdr = await db.item.create({ data: { code: `${IT_PREFIX}SK-2`, name: "Roulement test stock", category: "PDR", stockUnit: "U", purchaseUnit: "U", createdById: r.id } });
});

afterAll(async () => {
  await wipe();
  await db.license.deleteMany();
  if (savedLicenses.length) await db.license.createMany({ data: savedLicenses });
  await db.$disconnect();
});

describe("bon de sortie", () => {
  it("sortie nominale : numéro SOR, valorisation au PMP, stock mis à jour, audit", async () => {
    await move({});
    const r = await createIssue(mag, issueInput(30));
    expect(r.number).toBe(`SOR-${currentYear()}-00001`);
    expect(r.totalValue).toBe(30000);
    expect(await level()).toBe("70");
    const line = await db.stockIssueLine.findFirstOrThrow({ where: { issueId: r.id } });
    expect(line.unitCost.toString()).toBe("1000");
    expect(line.value).toBe(30000);
    const m = await db.stockMovement.findFirstOrThrow({ where: { issueLineId: line.id } });
    expect([m.type, m.quantity.toString(), m.value, m.documentRef]).toEqual(["SORTIE", "-30", -30000, r.number]);
    expect(await db.auditLog.count({ where: { action: "STOCK_ISSUE_CREATE", entityId: r.id } })).toBe(1);
  });

  it("stock insuffisant : message clair, aucun mouvement, numéro non consommé", async () => {
    await move({ quantity: 10 });
    const before = await db.stockMovement.count();
    expect(await message(createIssue(mag, issueInput(200)))).toBe("Stock insuffisant : 10 U disponibles au dépôt Principal.");
    expect(await db.stockMovement.count()).toBe(before);
    expect(await db.stockIssue.count()).toBe(0);
    expect(await level()).toBe("10");
    const ok = await createIssue(mag, issueInput(1));
    expect(ok.number).toBe(`SOR-${currentYear()}-00001`);
  });

  it("machine obligatoire pour une PDR ; date future refusée ; article en double refusé", async () => {
    await move({ itemId: pdr.id });
    expect(await code(createIssue(mag, issueInput(1, { equipment: null, lines: [{ itemId: pdr.id, quantity: 1 }] })))).toBe("MACHINE_OBLIGATOIRE");
    const future = new Date(Date.now() + 3 * DAY).toISOString().slice(0, 10);
    await move({});
    expect(await code(createIssue(mag, issueInput(1, { issuedAt: future })))).toBe("DATE_FUTURE");
    expect(await code(createIssue(mag, issueInput(1, { lines: [{ itemId: item.id, quantity: 1 }, { itemId: item.id, quantity: 2 }] })))).toBe("VALIDATION");
    expect(await level()).toBe("100");
  });

  it("deux sorties parallèles sur le dernier stock : une seule réussit", async () => {
    await move({ quantity: 5 });
    const results = await Promise.all([code(createIssue(mag, issueInput(4))), code(createIssue(mag, issueInput(4)))]);
    expect(results.sort()).toEqual(["OK", "STOCK_INSUFFICIENT"]);
    expect(await level()).toBe("1");
    expect(await db.stockIssue.count()).toBe(1);
  });

  it("annulation par contre-passation : Responsable seul, stock remis, une seule fois", async () => {
    await move({});
    const r = await createIssue(mag, issueInput(30));
    expect(await code(cancelIssue(mag, { id: r.id, reason: "Erreur de saisie" }))).toBe("FORBIDDEN");
    expect(await code(cancelIssue(resp, { id: r.id, reason: "ok" }))).toBe("VALIDATION");
    await cancelIssue(resp, { id: r.id, reason: "Erreur de saisie" });
    expect(await level()).toBe("100");
    expect((await db.stockIssue.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("ANNULEE");
    expect(await code(cancelIssue(resp, { id: r.id, reason: "Erreur de saisie" }))).toBe("ISSUE_ALREADY_CANCELLED");
    expect(await level()).toBe("100");
    expect(await db.stockMovement.count({ where: { reversalOfId: { not: null } } })).toBe(1);
  });
});

describe("transfert et ajustement", () => {
  it("transfert : deux mouvements liés TRF, sortie au PMP source, PMP destination recalculé", async () => {
    await move({});
    await move({ warehouseId: whB.id, quantity: 50, unitCost: 1600 });
    const r = await transfer(mag, { fromWarehouseId: whA.id, toWarehouseId: whB.id, itemId: item.id, quantity: 30, comment: "Réarmement annexe" });
    expect(r.number).toBe(`TRF-${currentYear()}-00001`);
    expect(await level(item.id, whA.id)).toBe("70");
    expect(await level(item.id, whB.id)).toBe("80");
    expect((await getStockLevel(db, item.id, whB.id)).pmp.toString()).toBe("1375"); // (50 x 1600 + 30 x 1000) / 80
    expect((await getStockLevel(db, item.id, whA.id)).pmp.toString()).toBe("1000");
    const ms = await db.stockMovement.findMany({ where: { documentRef: r.number }, orderBy: { quantity: "asc" } });
    expect(ms.map((m) => [m.type, m.quantity.toString(), m.value])).toEqual([["TRANSFERT", "-30", -30000], ["TRANSFERT", "30", 30000]]);
    expect(await code(transfer(mag, { fromWarehouseId: whA.id, toWarehouseId: whA.id, itemId: item.id, quantity: 1 }))).toBe("VALIDATION");
    expect(await code(transfer(mag, { fromWarehouseId: whA.id, toWarehouseId: whB.id, itemId: item.id, quantity: 500 }))).toBe("STOCK_INSUFFICIENT");
    expect(await code(transfer(ach, { fromWarehouseId: whA.id, toWarehouseId: whB.id, itemId: item.id, quantity: 1 }))).toBe("FORBIDDEN");
    expect(await level(item.id, whA.id)).toBe("70");
  });

  it("deux transferts inverses simultanés ne s'interbloquent pas", async () => {
    await move({});
    await move({ warehouseId: whB.id });
    const r = await Promise.all([
      code(transfer(mag, { fromWarehouseId: whA.id, toWarehouseId: whB.id, itemId: item.id, quantity: 10 })),
      code(transfer(mag, { fromWarehouseId: whB.id, toWarehouseId: whA.id, itemId: item.id, quantity: 20 })),
    ]);
    expect(r).toEqual(["OK", "OK"]);
    expect(await level(item.id, whA.id)).toBe("110");
    expect(await level(item.id, whB.id)).toBe("90");
  });

  it("ajustement : Responsable seul, motif obligatoire, valorisé au PMP, tracé", async () => {
    await move({});
    expect(await code(adjust(mag, { itemId: item.id, warehouseId: whA.id, quantity: -5, reason: "Casse constatée" }))).toBe("FORBIDDEN");
    expect(await code(adjust(resp, { itemId: item.id, warehouseId: whA.id, quantity: -5, reason: "" }))).toBe("VALIDATION");
    expect(await code(adjust(resp, { itemId: item.id, warehouseId: whA.id, quantity: 0, reason: "Casse constatée" }))).toBe("VALIDATION");
    const r = await adjust(resp, { itemId: item.id, warehouseId: whA.id, quantity: -5, reason: "Casse constatée" });
    expect(r.number).toBe(`AJU-${currentYear()}-00001`);
    expect(await level()).toBe("95");
    const m = await db.stockMovement.findFirstOrThrow({ where: { documentRef: r.number } });
    expect([m.type, m.value]).toEqual(["AJUSTEMENT", -5000]);
    expect(await db.auditLog.count({ where: { action: "STOCK_ADJUST", entityId: m.id } })).toBe(1);
    // Ajout sans PMP connu : le coût est exigé.
    expect(await code(adjust(resp, { itemId: pdr.id, warehouseId: whA.id, quantity: 3, reason: "Trouvé en rayon" }))).toBe("COUT_INVALIDE");
    await adjust(resp, { itemId: pdr.id, warehouseId: whA.id, quantity: 3, unitCost: 2500, reason: "Trouvé en rayon" });
    expect(await level(pdr.id)).toBe("3");
  });

  it("essai expiré : écritures refusées, lectures autorisées", async () => {
    await move({});
    await setLicense("EXPIRED");
    session.current = { user: magUser };
    const w = await sorties.createIssueAction(issueInput(1));
    expect(w.ok === false && w.code).toBe("LICENSE_READ_ONLY");
    session.current = { user: respUser };
    const a = await mouvements.adjustAction({ itemId: item.id, warehouseId: whA.id, quantity: -1, reason: "Casse constatée" });
    expect(a.ok === false && a.code).toBe("LICENSE_READ_ONLY");
    const list = await mouvements.listMovementsAction({});
    expect(list.ok).toBe(true);
    expect(await level()).toBe("100");
  });

  it("Magasinier : l'ajustement est refusé par l'action", async () => {
    await move({});
    session.current = { user: magUser };
    const a = await mouvements.adjustAction({ itemId: item.id, warehouseId: whA.id, quantity: -1, reason: "Casse constatée" });
    expect(a.ok === false && a.code).toBe("FORBIDDEN");
  });
});

describe("consultations", () => {
  it("journal filtrable, fiche de stock avec solde progressif, coûts d'entrée masqués au Magasinier", async () => {
    await move({ occurredAt: daysAgo(10) });
    await createIssue(mag, issueInput(30));
    const all = await listMovements(resp, { article: item.id });
    expect(all.total).toBe(2);
    expect(all.rows[0].type).toBe("SORTIE");
    expect(all.rows[0].departmentName).toBe("Service stock test");
    expect(all.rows[0].documentHref).toMatch(/^\/stock\/sorties\//);
    expect((await listMovements(resp, { article: item.id, type: "SORTIE" })).total).toBe(1);
    expect((await listMovements(resp, { article: item.id, du: todayAbidjan(new Date()) })).total).toBe(1);
    const magRows = (await listMovements(mag, { article: item.id })).rows;
    expect(magRows.find((r) => r.type === "ENTREE_RECEPTION")!.unitCost).toBeUndefined();
    expect(magRows.find((r) => r.type === "SORTIE")!.unitCost).toBe("1000");
    expect((await listMovements(resp, { article: item.id })).rows.find((r) => r.type === "ENTREE_RECEPTION")!.unitCost).toBe("1000");

    const ledger = await itemLedger(resp, { itemId: item.id });
    expect(ledger.rows.map((r) => [r.type, r.quantity, r.balance])).toEqual([["SORTIE", "-30", "70"], ["ENTREE_RECEPTION", "100", "100"]]);
    expect(ledger.warehouses.map((w) => [w.warehouseName, w.quantity])).toEqual([["Principal", "70"]]);
  });

  it("prévision sur un jeu connu : consommation, couverture, rupture, seuils suggérés, dormant", async () => {
    await db.item.update({ where: { id: item.id }, data: { criticality: "CRITIQUE", leadTimeDays: 30 } });
    await move({ quantity: 200, occurredAt: daysAgo(100) });
    for (let i = 0; i < 9; i++) {
      await move({ type: "SORTIE", quantity: -10, documentType: "SORTIE", documentRef: `SOR-IT-${i}`, occurredAt: daysAgo(80 - i * 9) });
    }
    const f = (await itemForecast(item.id))!;
    expect(f.onHand).toBe("110");
    expect(f.avgDailyConsumption).toBe("1"); // 90 U sur 90 jours
    expect(f.coverageDays).toBe(110);
    expect(f.severity).toBe("VERT"); // 110 >= 2 x 30
    expect(f.suggestedSafetyStock).toBe("30");
    expect(f.suggestedReorderPoint).toBe("60");
    expect(f.belowReorderPoint).toBe(false);
    expect(f.stockoutDate).toBe(new Date(Date.now() + 110 * DAY).toISOString().slice(0, 10));

    // Dormant : en stock, aucun mouvement depuis plus de 180 jours.
    await move({ itemId: pdr.id, quantity: 4, occurredAt: daysAgo(200) });
    const dormants = await listStock(resp, { situation: "DORMANT", q: "test stock" });
    expect(dormants.rows.map((r) => r.code)).toEqual([`${IT_PREFIX}SK-2`]);
    const row = (await listStock(resp, { q: "Courroie test" })).rows[0];
    expect([row.onHand, row.coverageDays, row.value, row.pmp, row.reorderPoint]).toEqual(["110", 110, 110000, 1000, "60"]);
    expect((await listStock(mag, { q: "Courroie test" })).rows[0].value).toBe(110000); // le Magasinier voit le PMP
  });

  it("filtres de la liste du stock : famille, équipement, statut ; les services n'y figurent jamais", async () => {
    await db.item.update({ where: { id: pdr.id }, data: { family: "Roulements", equipment: "Ensacheuse test" } });
    const service = await db.item.create({ data: { code: `${IT_PREFIX}SK-SV`, name: "Maintenance test stock", category: "SERVICE", stocked: false, stockUnit: "U", purchaseUnit: "U", createdById: respUser.id } });
    const blocked = await db.item.create({ data: { code: `${IT_PREFIX}SK-BL`, name: "Article bloqué test stock", category: "FOURNITURE", status: "BLOQUE", stockUnit: "U", purchaseUnit: "U", createdById: respUser.id } });
    const codes = async (over: Record<string, unknown>) => (await listStock(resp, { q: "test stock", ...over })).rows.map((r) => r.code).sort();

    // Défaut : articles actifs et stockés seulement.
    expect(await codes({})).toEqual([`${IT_PREFIX}SK-1`, `${IT_PREFIX}SK-2`]);
    // Un service n'apparaît pas, même en le demandant par catégorie ou avec « tous les statuts ».
    expect(await codes({ categorie: "SERVICE" })).toEqual([]);
    expect(await codes({ statut: "TOUS" })).not.toContain(service.code);
    // Statut (comme la liste des articles).
    expect(await codes({ statut: "BLOQUE" })).toEqual([blocked.code]);
    expect(await codes({ statut: "TOUS" })).toEqual([`${IT_PREFIX}SK-1`, blocked.code, `${IT_PREFIX}SK-2`].sort());
    // Famille et équipement (la recherche couvre aussi l'équipement).
    expect(await codes({ famille: "roulements" })).toEqual([`${IT_PREFIX}SK-2`]);
    expect(await codes({ categorie: "PDR", equipement: "ensacheuse" })).toEqual([`${IT_PREFIX}SK-2`]);
    expect(await codes({ q: "Ensacheuse test" })).toEqual([`${IT_PREFIX}SK-2`]);
    // Les totaux ne comptent que les articles stockés.
    expect((await listStock(resp, { q: "test stock" })).totals.count).toBe(2);
  });

  it("seuils suggérés : appliqués sur demande du Responsable seulement, tracés ; ABC recalculée", async () => {
    await db.item.update({ where: { id: item.id }, data: { criticality: "CRITIQUE", leadTimeDays: 30 } });
    await move({ quantity: 200, occurredAt: daysAgo(100) });
    await move({ itemId: pdr.id, quantity: 200, occurredAt: daysAgo(100) });
    for (let i = 0; i < 9; i++) {
      await move({ type: "SORTIE", quantity: -10, documentType: "SORTIE", documentRef: `SOR-IT-${i}`, occurredAt: daysAgo(80 - i * 9) });
    }
    await move({ itemId: pdr.id, type: "SORTIE", quantity: -1, documentType: "SORTIE", documentRef: "SOR-IT-X", occurredAt: daysAgo(5) });
    expect(await code(applySuggestedThresholds(mag, {}))).toBe("FORBIDDEN");
    const r = await applySuggestedThresholds(resp, { itemIds: [item.id, pdr.id] });
    expect(r.updated).toBe(2);
    const it = await db.item.findUniqueOrThrow({ where: { id: item.id } });
    expect([it.safetyStock?.toString(), it.reorderPoint?.toString()]).toEqual(["30", "60"]);
    expect(await db.auditLog.count({ where: { action: "ITEM_THRESHOLDS_APPLY", entityId: item.id } })).toBe(1);

    expect(await code(recomputeAbc(mag))).toBe("FORBIDDEN");
    const abc = await recomputeAbc(resp);
    expect(abc.A).toBeGreaterThanOrEqual(1);
    expect((await db.item.findUniqueOrThrow({ where: { id: item.id } })).abcClass).toBe("A");
    expect((await db.item.findUniqueOrThrow({ where: { id: pdr.id } })).abcClass).toBe("C"); // part cumulée avant lui : 90 000 / 91 000 = 98,9 %
  });
});

describe("réapprovisionnement", () => {
  async function reorderSetup() {
    const local = await db.supplier.create({ data: { code: `${IT_PREFIX}SK-FL`, name: "Fournisseur local test", type: "LOCAL", currencyCode: "XOF", paymentTerm: "J30", createdById: resp.id } });
    const imp = await db.supplier.create({ data: { code: `${IT_PREFIX}SK-FI`, name: "Fournisseur import test", type: "IMPORT", currencyCode: "EUR", paymentTerm: "J30", createdById: resp.id } });
    // item : achat en carton de 12, minimum de commande 10 cartons, point de commande 50
    await db.item.update({
      where: { id: item.id },
      data: { purchaseUnit: "CARTON", conversionFactor: 12, reorderPoint: 50, economicOrderQty: 100, leadTimeDays: 10, mainSupplierId: local.id },
    });
    await db.itemSupplier.create({ data: { itemId: item.id, supplierId: local.id, minOrderQty: 10, createdById: resp.id } });
    await db.item.update({ where: { id: pdr.id }, data: { reorderPoint: 5, economicOrderQty: 3, leadTimeDays: 30, mainSupplierId: imp.id } });
    await move({ quantity: 10 });
    await move({ itemId: pdr.id, quantity: 2 });
  }

  it("liste les articles sous le point de commande, quantité arrondie à l'unité d'achat et au minimum du fournisseur", async () => {
    await reorderSetup();
    const rows = (await listReorder(mag)).filter((r) => r.code.startsWith(IT_PREFIX));
    const a = rows.find((r) => r.itemId === item.id)!;
    expect([a.purchaseType, a.suggestedQty, a.minOrderQty, a.position]).toEqual(["LOCAL", "10", "10", "10"]); // 100 U / 12 = 9 cartons -> minimum 10
    const b = rows.find((r) => r.itemId === pdr.id)!;
    expect([b.purchaseType, b.suggestedQty]).toEqual(["IMPORT", "3"]);
    expect(a.existingRequest).toBeNull();
  });

  it("Créer les DA : une DA REAPPRO SOUMISE par type, numérotée, tracée ; article déjà couvert signalé", async () => {
    await reorderSetup();
    const r = await createReorderRequests(mag, { items: [{ itemId: item.id, quantity: null }, { itemId: pdr.id, quantity: 4 }] });
    expect(r.requests.map((x) => x.type).sort()).toEqual(["IMPORT", "LOCAL"]);
    const prs = await db.purchaseRequest.findMany({ include: { lines: true }, orderBy: { number: "asc" } });
    expect(prs).toHaveLength(2);
    expect(prs.every((p) => p.status === "SOUMISE" && p.kind === "REAPPRO" && p.number !== null && p.createdById === mag.id)).toBe(true);
    const local = prs.find((p) => p.type === "LOCAL")!;
    expect(local.lines.map((l) => [l.itemId, l.quantity.toString(), l.unit, l.stockQty?.toString()])).toEqual([[item.id, "10", "CARTON", "120"]]);
    expect(prs.find((p) => p.type === "IMPORT")!.lines[0].quantity.toString()).toBe("4");
    expect(await db.auditLog.count({ where: { action: "PR_SUBMIT", entityId: { in: prs.map((p) => p.id) } } })).toBe(2);

    const rows = await listReorder(mag);
    expect(rows.find((x) => x.itemId === item.id)!.existingRequest?.number).toBe(local.number);
  });

  it("refuse un article qui n'est pas sous son point de commande, et un rôle sans droit", async () => {
    await reorderSetup();
    await move({ quantity: 500 });
    expect(await code(createReorderRequests(mag, { items: [{ itemId: item.id }] }))).toBe("HORS_REAPPRO");
    expect(await code(createReorderRequests({ id: "x", role: "SUPER_ADMIN" }, { items: [{ itemId: pdr.id }] }))).toBe("FORBIDDEN");
    expect(await db.purchaseRequest.count()).toBe(0);
  });
});

describe("le stock ne change que par applyMovement", () => {
  it("cleanStock laisse la base cohérente (garde-fou du test)", async () => {
    await move({});
    await cleanStock();
    expect(await db.stockLevel.count()).toBe(0);
  });
});
