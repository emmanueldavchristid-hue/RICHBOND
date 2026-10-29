import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { currentYear } from "@/lib/dates";
import { cleanTestUsers, createTestUser } from "../helpers/db";
import { IT_PREFIX, cleanReferentials } from "../helpers/referentials";
import { cleanPurchaseRequests } from "../helpers/purchase-requests";
import { applyMovement, getStockLevel } from "@/modules/stock";
import {
  cancelInventoryCount,
  createInventoryCount,
  getBlindSheet,
  getInventoryReview,
  openInventoryCount,
  proposeInventorySelection,
  saveInventoryCount,
  saveInventoryRecount,
  submitInventoryCount,
  validateInventoryCount,
  type InventoryActor,
} from "@/modules/inventory";

const session: { current: { user: { id: string; sessionVersion: number } } | null } = { current: null };
vi.mock("@/lib/auth", () => ({ auth: async () => session.current }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/modules/auth/ip", () => ({ getClientIp: async () => "127.0.0.1" }));
const actions = await import("@/app/(app)/stock/inventaires/actions");

let resp: InventoryActor;
let mag: InventoryActor;
let ach: InventoryActor;
let magUser: { id: string; sessionVersion: number };
let wh: { id: string };
let itemA: { id: string; code: string };
let itemB: { id: string; code: string };
let itemC: { id: string; code: string };
let savedLicenses: Awaited<ReturnType<typeof db.license.findMany>> = [];

const toActor = (u: { id: string; role: InventoryActor["role"]; purchaseScope: InventoryActor["purchaseScope"] }): InventoryActor => ({ id: u.id, role: u.role, purchaseScope: u.purchaseScope });

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "OK";
  } catch (e) {
    return (e as { code?: string }).code ?? `ERR:${(e as Error).message}`;
  }
}

const move = (itemId: string, quantity: number, over: Record<string, unknown> = {}) =>
  db.$transaction((tx) =>
    applyMovement(tx, {
      itemId,
      warehouseId: wh.id,
      type: quantity > 0 ? "ENTREE_RECEPTION" : "SORTIE",
      quantity,
      unitCost: 1000,
      documentType: quantity > 0 ? "RECEPTION" : "SORTIE",
      documentRef: "REC-IT-00001",
      occurredAt: new Date(),
      createdById: resp.id,
      ...over,
    } as Parameters<typeof applyMovement>[1]),
  );
const qty = async (itemId: string) => (await getStockLevel(db, itemId, wh.id)).quantity.toString();
const wait = (ms = 15) => new Promise((r) => setTimeout(r, ms));

async function wipe() {
  await cleanPurchaseRequests();
  await cleanReferentials();
  await cleanTestUsers();
  await db.setting.deleteMany({ where: { key: { startsWith: "inventory." } } });
}

/** Inventaire complet des 3 articles, ouvert : A=100, B=50, C=10 en stock. */
async function openedCount() {
  const c = await createInventoryCount(resp, { warehouseId: wh.id, kind: "COMPLET" });
  await openInventoryCount(mag, { countId: c.id });
  const lines = await db.inventoryCountLine.findMany({ where: { countId: c.id }, include: { item: true } });
  const line = (item: { id: string }) => lines.find((l) => l.itemId === item.id)!;
  return { id: c.id, number: c.number, line };
}

beforeAll(async () => {
  savedLicenses = await db.license.findMany();
});

beforeEach(async () => {
  await wipe();
  session.current = null;
  await db.license.deleteMany();
  await db.license.create({ data: { status: "TRIAL", trialStartsAt: new Date(Date.now() - 86_400_000), trialEndsAt: new Date(Date.now() + 10 * 86_400_000) } });
  const r = await createTestUser("inv-resp", { role: "RESPONSABLE_ACHATS" });
  const m = await createTestUser("inv-mag", { role: "MAGASINIER" });
  const a = await createTestUser("inv-ach", { role: "ACHETEUR", purchaseScope: "ALL" });
  resp = toActor(r);
  mag = toActor(m);
  ach = toActor(a);
  magUser = { id: m.id, sessionVersion: m.sessionVersion };
  wh = await db.warehouse.create({ data: { code: `${IT_PREFIX}INV-A`, name: "Principal inventaire" } });
  const mk = (n: number, abc: string | null) => db.item.create({ data: { code: `${IT_PREFIX}INV-${n}`, name: `Article inventaire ${n}`, category: "PDR", stockUnit: "U", purchaseUnit: "U", abcClass: abc, defaultWarehouseId: wh.id, createdById: r.id } });
  itemA = await mk(1, "A");
  itemB = await mk(2, "B");
  itemC = await mk(3, "C");
  await move(itemA.id, 100);
  await move(itemB.id, 50);
  await move(itemC.id, 10);
});

afterAll(async () => {
  await wipe();
  await db.license.deleteMany();
  if (savedLicenses.length) await db.license.createMany({ data: savedLicenses });
  await db.$disconnect();
});

describe("préparation et numérotation", () => {
  it("numéro INV-AAAA-0001 séquentiel, statut PREPARE, audit", async () => {
    const c1 = await createInventoryCount(resp, { warehouseId: wh.id, kind: "COMPLET" });
    expect(c1.number).toBe(`INV-${currentYear()}-0001`);
    expect(c1.lineCount).toBe(3);
    const row = await db.inventoryCount.findUniqueOrThrow({ where: { id: c1.id } });
    expect(row.status).toBe("PREPARE");
    expect(Number(row.thresholdPct)).toBe(5);
    expect(row.thresholdValue).toBe(100_000);
    expect(await db.auditLog.count({ where: { entity: "InventoryCount", entityId: c1.id, action: "INVENTORY_CREATE" } })).toBe(1);
    // Les articles du 1er inventaire sont pris : le second n'a plus rien à proposer.
    expect(await code(createInventoryCount(resp, { warehouseId: wh.id, kind: "COMPLET" }))).toBe("SELECTION_VIDE");
    await cancelInventoryCount(resp, { countId: c1.id, reason: "Test annulation" });
    const c2 = await createInventoryCount(resp, { warehouseId: wh.id, kind: "COMPLET" });
    expect(c2.number).toBe(`INV-${currentYear()}-0002`);
  });

  it("sélection tournante : jamais comptés = dus ; un article compté récemment sort de la liste", async () => {
    const first = await proposeInventorySelection(resp, { warehouseId: wh.id });
    expect(first.map((r) => r.reason).sort()).toEqual(["CLASSE_A", "CLASSE_B", "CLASSE_C"]);
    const c = await createInventoryCount(resp, { warehouseId: wh.id, kind: "TOURNANT" });
    expect(c.lineCount).toBe(3);
    await cancelInventoryCount(resp, { countId: c.id, reason: "Test annulation" });
    // Un inventaire validé aujourd'hui retire l'article de la sélection.
    await db.inventoryCount.create({
      data: {
        number: "INV-IT-9999", status: "VALIDE", warehouseId: wh.id, thresholdPct: 5, thresholdValue: 100_000, createdById: resp.id, validatedAt: new Date(),
        lines: { create: [{ itemId: itemA.id, selectionReason: "CLASSE_A", theoreticalQty: 100, pmp: 1000, countedQty: 100 }] },
      },
    });
    const next = await proposeInventorySelection(resp, { warehouseId: wh.id });
    expect(next.map((r) => r.itemId)).not.toContain(itemA.id);
    expect(next).toHaveLength(2);
  });

  it("l'ajout manuel et la liste explicite sont réservés au Responsable", async () => {
    expect(await code(createInventoryCount(mag, { warehouseId: wh.id, kind: "COMPLET" }))).toBe("FORBIDDEN");
    expect(await code(createInventoryCount(ach, { warehouseId: wh.id, kind: "COMPLET" }))).toBe("FORBIDDEN");
    const c = await createInventoryCount(resp, { warehouseId: wh.id, kind: "TOURNANT", itemIds: [itemB.id] });
    expect(c.lineCount).toBe(1);
    const lines = await db.inventoryCountLine.findMany({ where: { countId: c.id } });
    expect(lines[0].selectionReason).toBe("CLASSE_B");
  });
});

describe("ouverture : théorique figé", () => {
  it("fige quantité et PMP à l'ouverture ; un mouvement ultérieur ne les change pas", async () => {
    const c = await openedCount();
    expect(c.line(itemA).theoreticalQty?.toString()).toBe("100");
    expect(c.line(itemA).pmp?.toString()).toBe("1000");
    await move(itemA.id, 20, { unitCost: 2000 });
    const again = await db.inventoryCountLine.findUniqueOrThrow({ where: { id: c.line(itemA).id } });
    expect(again.theoreticalQty?.toString()).toBe("100");
    expect(again.pmp?.toString()).toBe("1000");
  });

  it("avant l'ouverture, le théorique n'existe pas (PREPARE) et on ne peut pas saisir", async () => {
    const created = await createInventoryCount(resp, { warehouseId: wh.id, kind: "COMPLET" });
    const l = await db.inventoryCountLine.findFirstOrThrow({ where: { countId: created.id } });
    expect(l.theoreticalQty).toBeNull();
    expect(await code(saveInventoryCount(mag, { countId: created.id, lines: [{ lineId: l.id, quantity: 1 }] }))).toBe("STATUT_INVALIDE");
  });
});

describe("comptage aveugle", () => {
  it("la feuille du Magasinier ne contient ni théorique ni PMP (action serveur, sérialisée)", async () => {
    const c = await openedCount();
    session.current = { user: magUser };
    const res = await actions.getBlindSheetAction({ countId: c.id });
    expect(res.ok).toBe(true);
    const json = JSON.stringify(res);
    expect(json).not.toMatch(/theoretical|pmp|"value"/i);
    // Aucune des quantités théoriques (100, 50, 10) n'apparaît comme champ ; les clés sont celles du DTO aveugle.
    if (res.ok) {
      expect(Object.keys(res.data.lines[0]).sort()).toEqual(["barcode", "code", "countedQty", "id", "itemId", "name", "recountQty", "recountRequired", "unit"]);
    }
  });

  it("le Magasinier n'a pas accès à la revue des écarts", async () => {
    const c = await openedCount();
    expect(await code(getInventoryReview(mag, { countId: c.id }))).toBe("FORBIDDEN");
    session.current = { user: magUser };
    const res = await actions.getInventoryReviewAction({ countId: c.id });
    expect(res.ok).toBe(false);
    expect((await getBlindSheet(mag, { countId: c.id })).blind).toBe(true);
  });

  it("la réponse de sauvegarde ne contient aucune quantité attendue", async () => {
    const c = await openedCount();
    const r = await saveInventoryCount(mag, { countId: c.id, lines: [{ lineId: c.line(itemA).id, quantity: 60 }] });
    expect(Object.keys(r).sort()).toEqual(["progress", "recountLineIds", "saved", "unchanged"]);
    expect(r.recountLineIds).toEqual([c.line(itemA).id]);
  });
});

describe("saisie idempotente et recomptage", () => {
  it("renvoyer la même saisie ne change rien et n'ajoute pas d'audit", async () => {
    const c = await openedCount();
    const body = { countId: c.id, lines: [{ lineId: c.line(itemA).id, quantity: 100 }] };
    expect((await saveInventoryCount(mag, body)).saved).toBe(1);
    const audits = await db.auditLog.count({ where: { entity: "InventoryCount", entityId: c.id, action: "INVENTORY_COUNT_SAVE" } });
    const again = await saveInventoryCount(mag, body);
    expect(again).toMatchObject({ saved: 0, unchanged: 1 });
    expect(await db.auditLog.count({ where: { entity: "InventoryCount", entityId: c.id, action: "INVENTORY_COUNT_SAVE" } })).toBe(audits);
  });

  it("écart au-dessus du seuil : soumission refusée tant que non recompté ; le recomptage remplace", async () => {
    const c = await openedCount();
    await saveInventoryCount(mag, { countId: c.id, lines: [{ lineId: c.line(itemA).id, quantity: 80 }, { lineId: c.line(itemB).id, quantity: 50 }, { lineId: c.line(itemC).id, quantity: 10 }] });
    expect(await code(submitInventoryCount(mag, { countId: c.id }))).toBe("RECOMPTAGE_REQUIS");
    await saveInventoryRecount(mag, { countId: c.id, lines: [{ lineId: c.line(itemA).id, quantity: 99 }] });
    expect(await code(submitInventoryCount(mag, { countId: c.id }))).toBe("OK");
    expect((await db.inventoryCount.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("A_VALIDER");
  });

  it("soumission refusée si des articles ne sont pas comptés", async () => {
    const c = await openedCount();
    await saveInventoryCount(mag, { countId: c.id, lines: [{ lineId: c.line(itemA).id, quantity: 100 }] });
    expect(await code(submitInventoryCount(mag, { countId: c.id }))).toBe("COMPTAGE_INCOMPLET");
  });
});

describe("mouvements pendant le comptage", () => {
  it("un mouvement après le comptage de l'article bloque la soumission jusqu'au recomptage ; la revue le signale", async () => {
    const c = await openedCount();
    await wait();
    await saveInventoryCount(mag, { countId: c.id, lines: [{ lineId: c.line(itemA).id, quantity: 100 }, { lineId: c.line(itemB).id, quantity: 50 }, { lineId: c.line(itemC).id, quantity: 10 }] });
    await wait();
    await move(itemB.id, -5, { documentRef: "SOR-IT-00001" });
    expect(await code(submitInventoryCount(mag, { countId: c.id }))).toBe("COMPTAGE_PERIME");
    const review = await getInventoryReview(resp, { countId: c.id });
    expect(review.lines.find((l) => l.itemId === itemB.id)?.movedDuringCount).toBe(true);
    expect(review.lines.find((l) => l.itemId === itemA.id)?.movedDuringCount).toBe(false);
    await wait();
    await saveInventoryRecount(mag, { countId: c.id, lines: [{ lineId: c.line(itemB).id, quantity: 45 }] });
    expect(await code(submitInventoryCount(mag, { countId: c.id }))).toBe("OK");
  });

  it("recompter la même quantité après un mouvement confirme le comptage (date rafraîchie)", async () => {
    const c = await openedCount();
    await wait();
    await saveInventoryCount(mag, { countId: c.id, lines: [{ lineId: c.line(itemA).id, quantity: 100 }, { lineId: c.line(itemB).id, quantity: 50 }, { lineId: c.line(itemC).id, quantity: 10 }] });
    await wait();
    await move(itemB.id, -5, { documentRef: "SOR-IT-00002" });
    expect(await code(submitInventoryCount(mag, { countId: c.id }))).toBe("COMPTAGE_PERIME");
    await wait();
    await saveInventoryCount(mag, { countId: c.id, lines: [{ lineId: c.line(itemB).id, quantity: 50 }] });
    expect(await code(submitInventoryCount(mag, { countId: c.id }))).toBe("OK");
  });
});

describe("validation : ajustements créés à la validation seulement", () => {
  it("aucun mouvement ni changement de stock avant validation ; ensuite AJUSTEMENT_INVENTAIRE, fiabilité, audit", async () => {
    const c = await openedCount();
    // A : 100 -> 97 (3 %, 3 000 FCFA : sous le seuil). B : exact. C : 10 -> 10.
    await saveInventoryCount(mag, { countId: c.id, lines: [{ lineId: c.line(itemA).id, quantity: 97 }, { lineId: c.line(itemB).id, quantity: 50 }, { lineId: c.line(itemC).id, quantity: 10 }] });
    await submitInventoryCount(mag, { countId: c.id });
    const before = await db.stockMovement.count({ where: { type: "AJUSTEMENT_INVENTAIRE" } });
    expect(before).toBe(0);
    expect(await qty(itemA.id)).toBe("100");

    expect(await code(validateInventoryCount(mag, { countId: c.id }))).toBe("FORBIDDEN");
    expect(await code(validateInventoryCount(ach, { countId: c.id }))).toBe("FORBIDDEN");
    expect(await db.stockMovement.count({ where: { type: "AJUSTEMENT_INVENTAIRE" } })).toBe(0);
    expect(await qty(itemA.id)).toBe("100");

    const res = await validateInventoryCount(resp, { countId: c.id });
    expect(res.adjustments).toBe(1);
    expect(res.netAdjustmentValue).toBe(-3000);
    expect(res.reliabilityPct).toBe("66.67");
    expect(await qty(itemA.id)).toBe("97");
    expect(await qty(itemB.id)).toBe("50");
    const mv = await db.stockMovement.findMany({ where: { type: "AJUSTEMENT_INVENTAIRE" } });
    expect(mv).toHaveLength(1);
    expect(mv[0]).toMatchObject({ itemId: itemA.id, documentType: "INVENTAIRE", documentRef: c.number, documentId: c.id });
    expect(mv[0].quantity.toString()).toBe("-3");
    const done = await db.inventoryCount.findUniqueOrThrow({ where: { id: c.id } });
    expect(done.status).toBe("VALIDE");
    expect(done.validatedById).toBe(resp.id);
    expect(await db.auditLog.count({ where: { entity: "InventoryCount", entityId: c.id, action: "INVENTORY_VALIDATE" } })).toBe(1);
    // Une seconde validation est refusée (pas de double ajustement).
    expect(await code(validateInventoryCount(resp, { countId: c.id }))).toBe("STATUT_INVALIDE");
    expect(await db.stockMovement.count({ where: { type: "AJUSTEMENT_INVENTAIRE" } })).toBe(1);
  });

  it("écart important encore présent après recomptage : motif obligatoire, puis ajustement au PMP", async () => {
    const c = await openedCount();
    const all = (a: number) => [{ lineId: c.line(itemA).id, quantity: a }, { lineId: c.line(itemB).id, quantity: 50 }, { lineId: c.line(itemC).id, quantity: 10 }];
    await saveInventoryCount(mag, { countId: c.id, lines: all(70) });
    await saveInventoryRecount(mag, { countId: c.id, lines: [{ lineId: c.line(itemA).id, quantity: 70 }] });
    await submitInventoryCount(mag, { countId: c.id });
    const review = await getInventoryReview(resp, { countId: c.id });
    const la = review.lines.find((l) => l.itemId === itemA.id)!;
    expect(la).toMatchObject({ theoreticalQty: "100", varianceQty: "-30", varianceValue: -30_000, exceedsThreshold: true, finalQty: "70" });
    expect(review.totals.exceeding).toBe(1);

    expect(await code(validateInventoryCount(resp, { countId: c.id }))).toBe("MOTIF_OBLIGATOIRE");
    expect(await db.stockMovement.count({ where: { type: "AJUSTEMENT_INVENTAIRE" } })).toBe(0);
    const ok = await validateInventoryCount(resp, { countId: c.id, reasons: [{ lineId: c.line(itemA).id, reason: "Casse constatée en rayon" }] });
    expect(ok.netAdjustmentValue).toBe(-30_000);
    expect(await qty(itemA.id)).toBe("70");
    const mv = await db.stockMovement.findFirstOrThrow({ where: { type: "AJUSTEMENT_INVENTAIRE" } });
    expect(mv.comment).toContain("Casse constatée");
  });

  it("seuil de valeur : un petit pourcentage sur un article cher exige aussi un recomptage", async () => {
    const big = await db.item.create({ data: { code: `${IT_PREFIX}INV-9`, name: "Article cher", category: "PDR", stockUnit: "U", purchaseUnit: "U", defaultWarehouseId: wh.id } });
    await move(big.id, 1000, { unitCost: 50_000 });
    const c = await createInventoryCount(resp, { warehouseId: wh.id, kind: "TOURNANT", itemIds: [big.id] });
    await openInventoryCount(mag, { countId: c.id });
    const line = await db.inventoryCountLine.findFirstOrThrow({ where: { countId: c.id } });
    // 1 % d'écart mais 3 x 50 000 = 150 000 FCFA > 100 000.
    const r = await saveInventoryCount(mag, { countId: c.id, lines: [{ lineId: line.id, quantity: 997 }] });
    expect(r.recountLineIds).toEqual([line.id]);
  });

  it("annulation : pas d'ajustement ; impossible après validation", async () => {
    const c = await openedCount();
    expect(await code(cancelInventoryCount(mag, { countId: c.id, reason: "Test" }))).toBe("FORBIDDEN");
    await cancelInventoryCount(resp, { countId: c.id, reason: "Comptage reporté" });
    expect(await db.stockMovement.count({ where: { type: "AJUSTEMENT_INVENTAIRE" } })).toBe(0);
    expect(await code(cancelInventoryCount(resp, { countId: c.id, reason: "Encore" }))).toBe("STATUT_INVALIDE");
  });
});

describe("licence (lecture seule)", () => {
  it("essai expiré : les actions d'écriture sont refusées, la lecture reste possible", async () => {
    const c = await openedCount();
    await db.license.deleteMany();
    await db.license.create({ data: { status: "EXPIRED", trialStartsAt: new Date(Date.now() - 60 * 86_400_000), trialEndsAt: new Date(Date.now() - 86_400_000) } });
    session.current = { user: magUser };
    const w = await actions.saveInventoryCountAction({ countId: c.id, lines: [{ lineId: c.line(itemA).id, quantity: 1 }] });
    expect(w.ok).toBe(false);
    const r = await actions.getBlindSheetAction({ countId: c.id });
    expect(r.ok).toBe(true);
  });
});
