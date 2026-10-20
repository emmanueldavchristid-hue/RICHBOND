import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { currentYear, todayAbidjan } from "@/lib/dates";
import { cleanTestUsers, createTestUser } from "../helpers/db";
import { IT_PREFIX, cleanReferentials, ensureCurrencies } from "../helpers/referentials";
import { cleanPurchaseOrders } from "../helpers/purchase-orders";
import { applyMovement, getStockLevel } from "@/modules/stock";
import {
  cancelReceipt,
  closeRemainder,
  createReceipt,
  createSupplierReturn,
  decideNonConformity,
  getOrderForReceipt,
  listExpected,
  listNonConformities,
} from "@/modules/receiving";
import type { OrderActor } from "@/modules/purchase-orders";

let resp: OrderActor;
let achLocal: OrderActor;
let achImport: OrderActor;
let mag: OrderActor;
let wh: { id: string };
let itemA: { id: string }; // achat en CARTON, stock en U, 1 carton = 10 U
let supplier: { id: string };

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
/** BC local déjà envoyé / confirmé, une ligne de `qty` cartons à 10 000 FCFA (net 100 000 pour 10) : coût d'entrée 1 000 FCFA par unité de stock. */
async function makeOrder(over: { status?: "VALIDE" | "ENVOYE" | "CONFIRME" | "PARTIELLEMENT_RECU"; qty?: number; requestedOffset?: number } = {}) {
  const qty = over.qty ?? 10;
  seq += 1;
  const po = await db.purchaseOrder.create({
    data: {
      number: `BC-${currentYear()}-9${String(seq).padStart(4, "0")}`,
      status: over.status ?? "CONFIRME",
      sentAt: over.status === "VALIDE" ? null : new Date(),
      confirmedAt: (over.status ?? "CONFIRME") === "CONFIRME" ? new Date() : null,
      type: "LOCAL",
      origin: "DIRECT",
      supplierId: supplier.id,
      createdById: achLocal.id,
      currencyCode: "XOF",
      paymentTerm: "J30",
      warehouseId: wh.id,
      deliveryAddress: "Zone industrielle, Abidjan",
      requestedDate: new Date(dayOffset(over.requestedOffset ?? -5)),
      expectedDate: new Date(dayOffset(over.requestedOffset ?? -5)),
      lines: { create: [{ lineNo: 1, itemId: itemA.id, quantity: qty, unit: "CARTON", stockQty: qty * 10, unitPrice: 10000, vatRate: 18, netAmount: qty * 10000 }] },
    },
    include: { lines: true },
  });
  return { id: po.id, lineId: po.lines[0].id };
}

const input = (orderId: string, lineId: string, accepted: number, extra: { refused?: number; reason?: string; receivedAt?: string; approved?: boolean } = {}) => ({
  orderId,
  deliveryNoteRef: "BL-TEST-001",
  receivedAt: extra.receivedAt ?? today(),
  lines: [{ orderLineId: lineId, deliveredQty: accepted + (extra.refused ?? 0), acceptedQty: accepted, refusedQty: extra.refused ?? 0, refusalReason: extra.reason ?? null }],
  ...(extra.approved ? { overDeliveryApproved: true, overDeliveryReason: "Accord verbal du fournisseur" } : {}),
});

const stock = async () => (await getStockLevel(db, itemA.id, wh.id)).quantity.toString();
const orderOf = (id: string) => db.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { lines: true } });

async function wipe() {
  await cleanPurchaseOrders();
  await cleanReferentials();
  await cleanTestUsers();
  await db.setting.deleteMany({ where: { key: { startsWith: "receipt." } } });
  await db.auditLog.deleteMany({ where: { entity: { in: ["Receipt", "NonConformity", "SupplierReturn"] } } });
  await db.notification.deleteMany({ where: { entity: { in: ["Receipt", "SupplierReturn"] } } });
}

beforeEach(async () => {
  await wipe();
  await ensureCurrencies();
  resp = toActor(await createTestUser("rc-resp", { role: "RESPONSABLE_ACHATS" }));
  achLocal = toActor(await createTestUser("rc-loc", { role: "ACHETEUR", purchaseScope: "LOCAL" }));
  achImport = toActor(await createTestUser("rc-imp", { role: "ACHETEUR", purchaseScope: "IMPORT" }));
  mag = toActor(await createTestUser("rc-mag", { role: "MAGASINIER" }));
  wh = await db.warehouse.create({ data: { code: `${IT_PREFIX}RC-WH`, name: "Dépôt réception test" } });
  itemA = await db.item.create({ data: { code: `${IT_PREFIX}RC-A`, name: "Roulement test réception", category: "PDR", stockUnit: "U", purchaseUnit: "CARTON", conversionFactor: 10 } });
  supplier = await db.supplier.create({ data: { code: `${IT_PREFIX}RC-S`, name: "Fournisseur réception test", type: "LOCAL", currencyCode: "XOF", paymentTerm: "J30" } });
});

afterAll(async () => {
  await wipe();
  await db.$disconnect();
});

describe("réception partielle puis complète", () => {
  it("stock, PMP, numéros, statut du BC et ponctualité sont cohérents à chaque étape", async () => {
    const { id, lineId } = await makeOrder();
    const r1 = await createReceipt(mag, input(id, lineId, 4));
    expect(r1.number).toBe(`REC-${currentYear()}-00001`);
    expect(r1.orderStatus).toBe("PARTIELLEMENT_RECU");
    expect(r1.inFull).toBe(false);
    expect(r1.daysLate).toBe(5);
    expect(await stock()).toBe("40");
    expect((await getStockLevel(db, itemA.id, wh.id)).pmp.toString()).toBe("1000");
    let po = await orderOf(id);
    expect(po.lines[0].receivedQty.toString()).toBe("4");

    const r2 = await createReceipt(mag, input(id, lineId, 6));
    expect(r2.number).toBe(`REC-${currentYear()}-00002`);
    expect(r2.orderStatus).toBe("RECU");
    expect(r2.inFull).toBe(true);
    expect(await stock()).toBe("100");
    po = await orderOf(id);
    expect(po.status).toBe("RECU");
    const movements = await db.stockMovement.findMany({ where: { itemId: itemA.id }, orderBy: { createdAt: "asc" } });
    expect(movements.map((m) => [m.type, m.quantity.toString(), m.unitCost.toString(), m.value])).toEqual([
      ["ENTREE_RECEPTION", "40", "1000", 40000],
      ["ENTREE_RECEPTION", "60", "1000", 60000],
    ]);
    expect(await db.auditLog.count({ where: { entity: "Receipt", action: "RECEIPT_CREATE" } })).toBe(2);
    // Le BC est soldé : plus de réception possible.
    expect(await code(createReceipt(mag, input(id, lineId, 1)))).toBe("ORDER_NOT_RECEIVABLE");
  });

  it("refuse un BC non envoyé, une date future, un rôle sans droit", async () => {
    const valide = await makeOrder({ status: "VALIDE" });
    expect(await code(createReceipt(mag, input(valide.id, valide.lineId, 1)))).toBe("ORDER_NOT_SENT");
    const { id, lineId } = await makeOrder();
    const future = new Date(dayOffset(3)).toISOString().slice(0, 10);
    expect(await code(createReceipt(mag, input(id, lineId, 1, { receivedAt: future })))).toBe("DATE_FUTURE");
    expect(await code(createReceipt(achLocal, input(id, lineId, 1)))).toBe("FORBIDDEN");
    expect(await db.receipt.count()).toBe(0);
    expect(await stock()).toBe("0");
  });
});

describe("sur-livraison", () => {
  it("refusée à 0 % ; refusée au Magasinier même avec accord ; forcée par le Responsable avec motif et trace", async () => {
    const { id, lineId } = await makeOrder();
    expect(await code(createReceipt(mag, input(id, lineId, 12)))).toBe("OVER_DELIVERY");
    expect(await code(createReceipt(mag, input(id, lineId, 12, { approved: true })))).toBe("FORBIDDEN");
    expect(await db.receipt.count()).toBe(0);
    expect(await stock()).toBe("0");

    const r = await createReceipt(resp, input(id, lineId, 12, { approved: true }));
    expect(r.orderStatus).toBe("RECU");
    expect(await stock()).toBe("120");
    const rec = await db.receipt.findUniqueOrThrow({ where: { id: r.id } });
    expect(rec.overDeliveryApprovedById).toBe(resp.id);
    expect(rec.overDeliveryReason).toContain("Accord");
  });

  it("la tolérance réglée (5 %) autorise un léger dépassement sans accord", async () => {
    await db.setting.create({ data: { key: "receipt.overDeliveryPct", value: 5 } });
    const { id, lineId } = await makeOrder();
    expect(await code(createReceipt(mag, input(id, lineId, 10.6)))).toBe("OVER_DELIVERY");
    expect(await code(createReceipt(mag, input(id, lineId, 10.5)))).toBe("OK");
  });
});

describe("refus partiel et non-conformité", () => {
  it("crée une NC ouverte, laisse le refusé dû, puis la décision la clôture", async () => {
    const { id, lineId } = await makeOrder();
    const r = await createReceipt(mag, input(id, lineId, 7, { refused: 3, reason: "ABIME" }));
    expect(r.orderStatus).toBe("PARTIELLEMENT_RECU");
    expect(r.nonConformities).toHaveLength(1);
    expect(r.nonConformities[0].number).toBe(`NC-${currentYear()}-00001`);
    expect(await stock()).toBe("70"); // seul l'accepté entre en stock
    const po = await orderOf(id);
    expect(po.lines[0].receivedQty.toString()).toBe("7");
    const nc = await db.nonConformity.findUniqueOrThrow({ where: { id: r.nonConformities[0].id } });
    expect([nc.status, nc.qty.toString(), nc.reason]).toEqual(["OUVERTE", "3", "ABIME"]);

    const open = await listNonConformities(achLocal, { status: "OUVERTE" });
    expect(open).toHaveLength(1);
    expect(open[0].canDecide).toBe(true);
    expect(await code(decideNonConformity(mag, { id: nc.id, decision: "AVOIR" }))).toBe("FORBIDDEN");
    await decideNonConformity(achLocal, { id: nc.id, decision: "AVOIR", comment: "Avoir demandé" });
    const closed = await db.nonConformity.findUniqueOrThrow({ where: { id: nc.id } });
    expect([closed.status, closed.decision, closed.decidedById]).toEqual(["CLOTUREE", "AVOIR", achLocal.id]);
    expect(await code(decideNonConformity(resp, { id: nc.id, decision: "RETOUR" }))).toBe("NC_ALREADY_DECIDED");
    expect(await db.auditLog.count({ where: { entity: "NonConformity", action: { in: ["NC_CREATE", "NC_DECIDE"] } } })).toBe(2);
  });

  it("une ligne refusée sans motif est rejetée", async () => {
    const { id, lineId } = await makeOrder();
    expect(await code(createReceipt(mag, input(id, lineId, 7, { refused: 3 })))).toBe("VALIDATION");
  });
});

describe("contre-passation", () => {
  it("rétablit stock, quantité reçue et statut ; ne se fait pas deux fois ; réservée au Responsable", async () => {
    const { id, lineId } = await makeOrder();
    const r1 = await createReceipt(mag, input(id, lineId, 4));
    const r2 = await createReceipt(mag, input(id, lineId, 6, { refused: 0 }));
    expect(r2.orderStatus).toBe("RECU");

    expect(await code(cancelReceipt(achLocal, { id: r2.id, reason: "Erreur de saisie" }))).toBe("FORBIDDEN");
    expect(await code(cancelReceipt(mag, { id: r2.id, reason: "Erreur de saisie" }))).toBe("FORBIDDEN");
    const c = await cancelReceipt(resp, { id: r2.id, reason: "Erreur de saisie" });
    expect(c.orderStatus).toBe("PARTIELLEMENT_RECU");
    expect(await stock()).toBe("40");
    expect((await orderOf(id)).lines[0].receivedQty.toString()).toBe("4");
    expect((await db.receipt.findUniqueOrThrow({ where: { id: r2.id } })).status).toBe("ANNULEE");
    expect(await code(cancelReceipt(resp, { id: r2.id, reason: "Encore une fois" }))).toBe("RECEIPT_ALREADY_CANCELLED");

    await cancelReceipt(resp, { id: r1.id, reason: "Livraison refusée par erreur" });
    expect(await stock()).toBe("0");
    expect((await orderOf(id)).status).toBe("CONFIRME");
    expect(await db.stockMovement.count({ where: { reversalOfId: { not: null } } })).toBe(2);
    expect(await db.auditLog.count({ where: { action: "RECEIPT_CANCEL" } })).toBe(2);
  });

  it("est refusée si le stock a été sorti depuis, sans rien modifier", async () => {
    const { id, lineId } = await makeOrder();
    const r = await createReceipt(mag, input(id, lineId, 10));
    await db.$transaction((tx) =>
      applyMovement(tx, { itemId: itemA.id, warehouseId: wh.id, type: "SORTIE", quantity: -30, documentType: "SORTIE", documentRef: "SOR-TEST-1", occurredAt: new Date(), createdById: mag.id }),
    );
    expect(await code(cancelReceipt(resp, { id: r.id, reason: "Doublon de réception" }))).toBe("STOCK_INSUFFICIENT");
    expect(await stock()).toBe("70");
    expect((await orderOf(id)).lines[0].receivedQty.toString()).toBe("10");
    expect((await db.receipt.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("VALIDEE");
    expect((await orderOf(id)).status).toBe("RECU");
  });
});

describe("solde du reliquat", () => {
  it("un BC partiellement reçu passe à REÇU ; réservé au périmètre de l'acheteur", async () => {
    const { id, lineId } = await makeOrder();
    expect(await code(closeRemainder(achLocal, { orderId: id, reason: "Fournisseur ne livrera plus" }))).toBe("INVALID_STATUS"); // pas encore reçu
    await createReceipt(mag, input(id, lineId, 4));
    expect(await code(closeRemainder(mag, { orderId: id, reason: "Fournisseur ne livrera plus" }))).toBe("FORBIDDEN");
    expect(await code(closeRemainder(achImport, { orderId: id, reason: "Fournisseur ne livrera plus" }))).toBe("FORBIDDEN"); // BC local
    const r = await closeRemainder(achLocal, { orderId: id, reason: "Fournisseur ne livrera plus" });
    expect(r).toMatchObject({ orderStatus: "RECU", closedLines: 1 });
    const po = await orderOf(id);
    expect([po.lines[0].closedQty.toString(), po.lines[0].receivedQty.toString()]).toEqual(["6", "4"]);
    expect(await db.auditLog.count({ where: { action: "PO_CLOSE_REMAINDER" } })).toBe(1);
  });
});

describe("Magasinier : aucun prix", () => {
  it("la réponse ne contient aucun champ de prix, sauf réglage contraire ; Acheteur et Responsable les voient", async () => {
    const { id, lineId } = await makeOrder();
    const asMag = await getOrderForReceipt(mag, { orderId: id });
    const json = JSON.stringify(asMag);
    expect(json).not.toMatch(/unitPrice|netAmount|discountPct|currencyCode|10000/);
    expect(asMag.pricesVisible).toBe(false);
    expect(asMag.lines[0].remainingQty).toBe("10");
    expect(asMag.receivable).toBe(true);

    const r = await createReceipt(mag, input(id, lineId, 4));
    const { getReceipt } = await import("@/modules/receiving");
    const detail = JSON.stringify(await getReceipt(mag, { id: r.id }));
    expect(detail).not.toMatch(/unitCostXof|valueXof|totalValueXof/);
    const asBuyer = await getOrderForReceipt(achLocal, { orderId: id });
    expect(asBuyer.lines[0].netAmount).toBe("100000");
    expect(asBuyer.receivable).toBe(false); // un acheteur ne reçoit pas
    expect((await getReceipt(resp, { id: r.id })).totalValueXof).toBe(40000);

    await db.setting.create({ data: { key: "receipt.showPricesToStorekeeper", value: true } });
    expect((await getOrderForReceipt(mag, { orderId: id })).lines[0].netAmount).toBe("100000");
  });
});

describe("concurrence", () => {
  it("deux réceptions simultanées du même BC ne dépassent jamais la quantité commandée", async () => {
    const { id, lineId } = await makeOrder();
    const results = await Promise.all([code(createReceipt(mag, input(id, lineId, 10))), code(createReceipt(mag, input(id, lineId, 10)))]);
    expect(results.filter((r) => r === "OK")).toHaveLength(1);
    expect(results.filter((r) => r !== "OK")[0]).toMatch(/ORDER_NOT_RECEIVABLE|OVER_DELIVERY/);
    expect((await orderOf(id)).lines[0].receivedQty.toString()).toBe("10");
    expect(await stock()).toBe("100");
    expect(await db.receipt.count()).toBe(1);
  });
});

describe("écran des attendus", () => {
  it("classe les BC en retard, du jour et de la semaine ; ignore un BC soldé", async () => {
    const late = await makeOrder({ requestedOffset: -3 });
    const dueToday = await makeOrder({ requestedOffset: 0 });
    const soon = await makeOrder({ requestedOffset: 4 });
    await makeOrder({ requestedOffset: 30 }); // hors fenêtre
    const done = await makeOrder({ requestedOffset: -1 });
    await createReceipt(mag, input(done.id, done.lineId, 10));
    const b = await listExpected(mag, {}, new Date());
    expect(b.late.map((o) => o.orderId)).toEqual([late.id]);
    expect(b.late[0].daysLate).toBe(3);
    expect(b.today.map((o) => o.orderId)).toEqual([dueToday.id]);
    expect(b.thisWeek.map((o) => o.orderId)).toEqual([soon.id]);
  });
});

describe("retour fournisseur (P2)", () => {
  it("sort du stock au PMP et rouvre le BC ; refuse plus que le reçu", async () => {
    const { id, lineId } = await makeOrder();
    await createReceipt(mag, input(id, lineId, 10));
    expect(await code(createSupplierReturn(achLocal, { orderId: id, reason: "Défaut constaté", returnedAt: today(), lines: [{ orderLineId: lineId, quantity: 11 }] }))).toBe("RETURN_TOO_MUCH");
    const r = await createSupplierReturn(achLocal, { orderId: id, reason: "Défaut constaté", returnedAt: today(), lines: [{ orderLineId: lineId, quantity: 3 }] });
    expect(r.number).toBe(`RET-${currentYear()}-00001`);
    expect(r.totalValueXof).toBe(30000);
    expect(r.orderStatus).toBe("PARTIELLEMENT_RECU");
    expect(await stock()).toBe("70");
    expect((await orderOf(id)).lines[0].receivedQty.toString()).toBe("7");
    expect(await code(createSupplierReturn(mag, { orderId: id, reason: "Défaut constaté", returnedAt: today(), lines: [{ orderLineId: lineId, quantity: 1 }] }))).toBe("FORBIDDEN");
  });
});
