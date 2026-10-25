import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { currentYear } from "@/lib/dates";
import { cleanTestUsers, createTestUser } from "../helpers/db";
import { cleanReferentials, ensureCurrencies } from "../helpers/referentials";
import { cleanPurchaseOrders } from "../helpers/purchase-orders";
import { FUTURE_DAY, cleanPurchaseRequests, parkSeedBuyers } from "../helpers/purchase-requests";
import { approveRequest, createRequest, duplicateWarnings, submitRequest, type RequestUser } from "@/modules/purchase-requests";
import {
  abandonAmendment,
  addComment,
  approveOrder,
  cancelOrder,
  changePromisedDate,
  checkOrderDuplicates,
  closeOrder,
  confirmOrder,
  createDraft,
  createDraftFromRequestLines,
  exportOrders,
  getOrder,
  getOrderPdfSource,
  homeOrderSummary,
  listOrderableLines,
  listOrders,
  markSent,
  refreshReceivedStatus,
  rejectOrder,
  remindSupplier,
  returnToDraft,
  startAmendment,
  submitOrder,
  updateDraft,
  type OrderActor,
} from "@/modules/purchase-orders";
import { loadBranding, renderOrderPdf } from "@/modules/purchase-orders/pdf/render";

let resp: OrderActor;
let achLocal: OrderActor;
let achImport: OrderActor;
let achAll: OrderActor;
let mag: OrderActor;
let restoreBuyers: () => Promise<void>;
let savedRates: Awaited<ReturnType<typeof db.exchangeRate.findMany>> = [];

let dept: { id: string };
let wh: { id: string };
let itemA: { id: string; code: string }; // CARTON x10 -> U
let itemB: { id: string; code: string }; // KG / KG
let supLocal: { id: string };
let supImport: { id: string };
let supBlocked: { id: string };

const toActor = (u: { id: string; role: OrderActor["role"]; purchaseScope: OrderActor["purchaseScope"] }): OrderActor => ({ id: u.id, role: u.role, purchaseScope: u.purchaseScope });

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "OK";
  } catch (e) {
    return (e as { code?: string }).code ?? `ERR:${(e as Error).message}`;
  }
}

async function setSetting(key: string, value: unknown) {
  await db.setting.upsert({ where: { key }, update: { value: value as never }, create: { key, value: value as never } });
}

/** DA validée (type LOCAL) : retourne l'identifiant de la DA et de ses lignes. */
async function validatedDa(lines: { item: { id: string }; qty: number; approved?: number }[], over: { type?: "LOCAL" | "IMPORT"; assigned?: boolean } = {}) {
  const type = over.type ?? "LOCAL";
  const creator = type === "LOCAL" ? achLocal : achImport;
  const d = await createRequest(creator as RequestUser, {
    departmentId: dept.id,
    requesterName: "Awa Koné",
    reason: "Besoin de test BC",
    urgency: "NORMALE",
    neededBy: FUTURE_DAY(10),
    type,
    lines: lines.map((l) => ({ itemId: l.item.id, quantity: l.qty, estimatedUnitPrice: 1000 })),
  });
  const s = await submitRequest(creator as RequestUser, { id: d.id, expectedUpdatedAt: d.updatedAt });
  const a = await approveRequest(resp as RequestUser, {
    id: d.id,
    expectedUpdatedAt: s.updatedAt,
    type,
    buyerId: creator.id,
    lines: lines.some((l) => l.approved !== undefined)
      ? (await db.purchaseRequestLine.findMany({ where: { requestId: d.id }, orderBy: { lineNo: "asc" } })).map((l, i) => ({ lineId: l.id, approvedQty: lines[i].approved ?? lines[i].qty }))
      : undefined,
  });
  if (over.assigned === false) await db.purchaseRequest.update({ where: { id: d.id }, data: { assignedBuyerId: null } });
  const full = await db.purchaseRequest.findUniqueOrThrow({ where: { id: d.id }, include: { lines: { orderBy: { lineNo: "asc" } } } });
  return { id: d.id, number: a.number!, lineIds: full.lines.map((l) => l.id) };
}

const ordInput = (supplierId: string, over: Record<string, unknown> = {}) => ({
  supplierId,
  origin: "DA",
  warehouseId: wh.id,
  requestedDate: FUTURE_DAY(15),
  ...over,
});

/** Brouillon de BC local rattaché à une ligne de DA (quantités en unité d'achat). */
async function draftOrder(actor: OrderActor, da: { lineIds: string[] }, over: { qty?: number; alloc?: number; price?: number; item?: { id: string }; supplier?: { id: string }; line?: number; extra?: Record<string, unknown> } = {}) {
  return createDraft(actor, ordInput((over.supplier ?? supLocal).id, {
    lines: [
      {
        itemId: (over.item ?? itemA).id,
        quantity: over.qty ?? 5,
        unitPrice: over.price ?? 10000,
        allocations: [{ requestLineId: da.lineIds[over.line ?? 0], qty: over.alloc ?? over.qty ?? 5 }],
      },
    ],
    ...over.extra,
  }));
}

async function toValidate(actor: OrderActor, orderId: string) {
  const o = await db.purchaseOrder.findUniqueOrThrow({ where: { id: orderId } });
  return submitOrder(actor, { id: orderId, expectedUpdatedAt: o.updatedAt });
}

async function validate(orderId: string, actor: OrderActor = resp) {
  const o = await db.purchaseOrder.findUniqueOrThrow({ where: { id: orderId } });
  return approveOrder(actor, { id: orderId, expectedUpdatedAt: o.updatedAt });
}

/** Brouillon -> soumis -> validé (par le Responsable). */
async function validatedOrder(da: { lineIds: string[] }, over: Parameters<typeof draftOrder>[2] = {}, creator: OrderActor = achLocal) {
  const d = await draftOrder(creator, da, over);
  await toValidate(creator, d.id);
  await validate(d.id);
  return d.id;
}

const reload = (id: string) => db.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { lines: { orderBy: { lineNo: "asc" }, include: { allocations: true } }, charges: true } });
const ver = async (id: string) => (await db.purchaseOrder.findUniqueOrThrow({ where: { id } })).updatedAt;
const prStatus = async (id: string) => (await db.purchaseRequest.findUniqueOrThrow({ where: { id } })).status;

beforeAll(async () => {
  restoreBuyers = await parkSeedBuyers();
  // Les taux USD du seed (base de test partagée) sont retirés le temps de la suite : chaque test pose les siens.
  savedRates = await db.exchangeRate.findMany({ where: { currencyCode: "USD" } });
});

async function wipe() {
  await cleanPurchaseOrders();
  await cleanPurchaseRequests();
  await cleanReferentials();
  await cleanTestUsers();
}

beforeEach(async () => {
  await wipe();
  await ensureCurrencies();
  await db.exchangeRate.deleteMany({ where: { currencyCode: "USD" } });
  await db.currency.upsert({ where: { code: "USD" }, update: { active: true }, create: { code: "USD", name: "Dollar US", symbol: "$", decimals: 2 } });
  resp = toActor(await createTestUser("po-resp", { role: "RESPONSABLE_ACHATS" }));
  achLocal = toActor(await createTestUser("po-loc", { role: "ACHETEUR", purchaseScope: "LOCAL" }));
  achImport = toActor(await createTestUser("po-imp", { role: "ACHETEUR", purchaseScope: "IMPORT" }));
  achAll = toActor(await createTestUser("po-all", { role: "ACHETEUR", purchaseScope: "ALL" }));
  mag = toActor(await createTestUser("po-mag", { role: "MAGASINIER" }));
  dept = await db.department.create({ data: { code: "IT-PO", name: "Service BC test" } });
  wh = await db.warehouse.create({ data: { code: "IT-PO-WH", name: "Dépôt BC test", address: "Zone industrielle, Abidjan" } });
  itemA = await db.item.create({ data: { code: "IT-PO-A", name: "Roulement test BC", category: "PDR", stockUnit: "U", purchaseUnit: "CARTON", conversionFactor: 10 } });
  itemB = await db.item.create({ data: { code: "IT-PO-B", name: "Graisse test BC", category: "INTRANT", stockUnit: "KG", purchaseUnit: "KG" } });
  supLocal = await db.supplier.create({ data: { code: "IT-PO-L", name: "Fournisseur local test", type: "LOCAL", currencyCode: "XOF", paymentTerm: "J30" } });
  supImport = await db.supplier.create({ data: { code: "IT-PO-I", name: "Fournisseur import test", type: "IMPORT", currencyCode: "USD", paymentTerm: "J60", incoterm: "FOB" } });
  supBlocked = await db.supplier.create({ data: { code: "IT-PO-X", name: "Fournisseur bloqué test", type: "LOCAL", currencyCode: "XOF", status: "BLOQUE", blockedReason: "Litige" } });
});

afterAll(async () => {
  await wipe();
  await db.exchangeRate.deleteMany({ where: { currencyCode: "USD" } });
  if (savedRates.length) await db.exchangeRate.createMany({ data: savedRates, skipDuplicates: true });
  await restoreBuyers();
  await db.$disconnect();
});

describe("brouillon et numérotation (D4)", () => {
  it("un brouillon n'a pas de numéro, ne consomme pas de compteur, copie l'adresse du dépôt et trace la création", async () => {
    const da = await validatedDa([{ item: itemA, qty: 5 }]);
    const d = await draftOrder(achLocal, da);
    const po = await reload(d.id);
    expect(po.number).toBeNull();
    expect(po.status).toBe("BROUILLON");
    expect(d.displayNumber).toMatch(/^BC-BROUILLON-/);
    expect(po.type).toBe("LOCAL");
    expect(po.deliveryAddress).toBe("Zone industrielle, Abidjan");
    expect(po.paymentTerm).toBe("J30");
    expect(po.lines[0].stockQty?.toString()).toBe("50"); // 5 CARTON x 10
    expect(po.totalTtc.toString()).toBe("59000"); // 50 000 HT + 18 %
    expect(await db.counter.count({ where: { key: "BC" } })).toBe(0);
    expect(await db.purchaseOrderEvent.count({ where: { orderId: d.id, type: "CREATED" } })).toBe(1);
    expect(await db.auditLog.count({ where: { entity: "PurchaseOrder", entityId: d.id, action: "PO_CREATE" } })).toBe(1);
  });

  it("le numéro BC-AAAA-00001 est attribué à la validation, conservé ensuite ; renvoi, refus et annulation n'en consomment pas", async () => {
    const da = await validatedDa([{ item: itemA, qty: 30 }]);
    const a = await draftOrder(achLocal, da, { qty: 5 });
    await toValidate(achLocal, a.id);
    expect((await reload(a.id)).number).toBeNull();
    // renvoi pour correction
    await returnToDraft(resp, { id: a.id, expectedUpdatedAt: await ver(a.id), comment: "Précisez le prix" });
    expect((await reload(a.id)).status).toBe("BROUILLON");
    await toValidate(achLocal, a.id);
    // refus
    await rejectOrder(resp, { id: a.id, expectedUpdatedAt: await ver(a.id), reason: "Prix trop élevé" });
    expect((await reload(a.id)).status).toBe("REFUSE");
    // annulation d'un brouillon
    const b = await draftOrder(achLocal, da, { qty: 5 });
    await cancelOrder(achLocal, { id: b.id, expectedUpdatedAt: await ver(b.id), reason: "Plus nécessaire" });
    expect(await db.counter.count({ where: { key: "BC" } })).toBe(0);
    // validation : premier numéro
    const c = await draftOrder(achLocal, da, { qty: 5 });
    await toValidate(achLocal, c.id);
    await validate(c.id);
    const year = currentYear();
    expect((await reload(c.id)).number).toBe(`BC-${year}-00001`);
    const d = await draftOrder(achLocal, da, { qty: 5 });
    await toValidate(achLocal, d.id);
    await validate(d.id);
    expect((await reload(d.id)).number).toBe(`BC-${year}-00002`);
    // le numéro ne change plus
    await markSent(achLocal, { id: c.id, expectedUpdatedAt: await ver(c.id), channel: "EMAIL" });
    expect((await reload(c.id)).number).toBe(`BC-${year}-00001`);
  });

  it("20 validations en parallèle : BC-AAAA-00001 à 00020 sans trou ni doublon", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) {
      const d = await createDraft(resp, ordInput(supLocal.id, { origin: "DIRECT", directReason: "Commande directe de test", lines: [{ itemId: itemB.id, quantity: 1 + i, unitPrice: 1000 }] }));
      await toValidate(resp, d.id);
      ids.push(d.id);
    }
    const results = await Promise.allSettled(ids.map((id) => validate(id)));
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(0);
    const numbers = (await db.purchaseOrder.findMany({ where: { id: { in: ids } }, select: { number: true } })).map((o) => Number(o.number!.slice(-5))).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect((await db.counter.findFirstOrThrow({ where: { key: "BC" } })).value).toBe(20);
  }, 60_000);
});

describe("workflow et droits (service)", () => {
  it("un acheteur ne valide pas ; le Responsable valide et son auto-validation est marquée", async () => {
    const da = await validatedDa([{ item: itemA, qty: 30 }]);
    const d = await draftOrder(achLocal, da);
    await toValidate(achLocal, d.id);
    expect(await code(validate(d.id, achLocal))).toBe("FORBIDDEN");
    const own = await createDraft(resp, ordInput(supLocal.id, { origin: "DIRECT", directReason: "Commande directe de test", lines: [{ itemId: itemB.id, quantity: 2, unitPrice: 500 }] }));
    await toValidate(resp, own.id);
    const r = await validate(own.id);
    expect(r.autoApproved).toBe(true);
    const ev = await db.purchaseOrderEvent.findFirstOrThrow({ where: { orderId: own.id, type: "APPROVED" } });
    expect((ev.payload as { autoApproved: boolean }).autoApproved).toBe(true);
  });

  it("commande directe sans DA : Responsable seul", async () => {
    const input = ordInput(supLocal.id, { origin: "DIRECT", directReason: "Commande directe de test", lines: [{ itemId: itemB.id, quantity: 2, unitPrice: 500 }] });
    expect(await code(createDraft(achLocal, input))).toBe("FORBIDDEN");
    expect(await code(createDraft(resp, input))).toBe("OK");
  });

  it("le Magasinier n'a aucun accès aux BC ; l'acheteur local ne crée pas de BC import", async () => {
    const da = await validatedDa([{ item: itemA, qty: 5 }]);
    expect(await code(draftOrder(mag, da))).toBe("FORBIDDEN");
    expect(await code(listOrders(mag))).toBe("FORBIDDEN");
    expect(await code(createDraft(achLocal, ordInput(supImport.id, { origin: "DIRECT", directReason: "Commande directe de test", lines: [] })))).toBe("FORBIDDEN");
    expect(await code(getOrder(mag, (await draftOrder(achLocal, da)).id))).toBe("FORBIDDEN");
  });

  it("un brouillon reste privé à son créateur", async () => {
    const da = await validatedDa([{ item: itemA, qty: 5 }]);
    const d = await draftOrder(achLocal, da);
    expect(await code(getOrder(achAll, d.id))).toBe("FORBIDDEN");
    expect(await code(getOrder(resp, d.id))).toBe("FORBIDDEN");
    expect((await listOrders(achAll)).rows.map((r) => r.id)).not.toContain(d.id);
    expect((await listOrders(achLocal)).rows.map((r) => r.id)).toContain(d.id);
  });

  it("recherche : le libellé d'un brouillon (BC-BROUILLON-…) retrouve ce brouillon, sans numéro", async () => {
    const da = await validatedDa([{ item: itemA, qty: 5 }]);
    const d = await draftOrder(achLocal, da);
    const hit = await listOrders(achLocal, { onglet: "tous", q: d.displayNumber });
    expect(hit.rows.map((r) => r.id)).toEqual([d.id]);
  });

  it("les acheteurs voient tous les BC soumis (H26), même hors périmètre", async () => {
    const da = await validatedDa([{ item: itemA, qty: 5 }]);
    const d = await draftOrder(achLocal, da);
    await toValidate(achLocal, d.id);
    expect((await getOrder(achImport, d.id)).id).toBe(d.id);
    expect((await listOrders(achImport)).rows.map((r) => r.id)).toContain(d.id);
  });

  it("conflit de version : CONFLICT si le BC a changé entre-temps", async () => {
    const da = await validatedDa([{ item: itemA, qty: 5 }]);
    const d = await draftOrder(achLocal, da);
    const stale = d.updatedAt;
    await toValidate(achLocal, d.id);
    expect(await code(submitOrder(achLocal, { id: d.id, expectedUpdatedAt: stale }))).toBe("CONFLICT");
  });

  it("chaque décision écrit 1 AuditLog et 1 PurchaseOrderEvent", async () => {
    const da = await validatedDa([{ item: itemA, qty: 30 }]);
    const d = await draftOrder(achLocal, da);
    await toValidate(achLocal, d.id);
    await validate(d.id);
    await markSent(achLocal, { id: d.id, expectedUpdatedAt: await ver(d.id), channel: "WHATSAPP", contact: "M. Koffi" });
    await confirmOrder(achLocal, { id: d.id, expectedUpdatedAt: await ver(d.id), promisedDate: FUTURE_DAY(20) });
    await remindSupplier(achLocal, { id: d.id, expectedUpdatedAt: await ver(d.id), channel: "TELEPHONE", contact: "M. Koffi" });
    await addComment(achLocal, { id: d.id, comment: "RAS" });
    const actions = (await db.auditLog.findMany({ where: { entity: "PurchaseOrder", entityId: d.id } })).map((a) => a.action).sort();
    expect(actions).toEqual(["PO_APPROVE", "PO_COMMENT", "PO_CONFIRM", "PO_CREATE", "PO_REMIND", "PO_SEND", "PO_SUBMIT"].sort());
    const events = (await db.purchaseOrderEvent.findMany({ where: { orderId: d.id } })).map((e) => e.type).sort();
    expect(events).toEqual(["APPROVED", "COMMENT", "CONFIRMED", "CREATED", "REMINDED", "SENT", "SUBMITTED"]);
  });

  it("annulation après validation : Responsable seul, motif, aucune quantité reçue", async () => {
    const da = await validatedDa([{ item: itemA, qty: 30 }]);
    const id = await validatedOrder(da);
    expect(await code(cancelOrder(achLocal, { id, expectedUpdatedAt: await ver(id), reason: "Changement de plan" }))).toBe("FORBIDDEN");
    await db.purchaseOrderLine.updateMany({ where: { orderId: id }, data: { receivedQty: 1 } });
    expect(await code(cancelOrder(resp, { id, expectedUpdatedAt: await ver(id), reason: "Changement de plan" }))).toBe("HAS_RECEIPTS");
    await db.purchaseOrderLine.updateMany({ where: { orderId: id }, data: { receivedQty: 0 } });
    expect(await code(cancelOrder(resp, { id, expectedUpdatedAt: await ver(id), reason: "Changement de plan" }))).toBe("OK");
    expect((await reload(id)).status).toBe("ANNULE");
  });

  it("envoi : date future refusée ; confirmation : date promise avant le bon refusée, première date conservée, report avec motif", async () => {
    const da = await validatedDa([{ item: itemA, qty: 30 }]);
    const id = await validatedOrder(da);
    expect(await code(markSent(achLocal, { id, expectedUpdatedAt: await ver(id), channel: "EMAIL", sentDate: FUTURE_DAY(2) }))).toBe("DATE_FUTURE");
    await markSent(achLocal, { id, expectedUpdatedAt: await ver(id), channel: "EMAIL" });
    expect(await code(confirmOrder(achLocal, { id, expectedUpdatedAt: await ver(id), promisedDate: "2020-01-01" }))).toBe("PROMISED_DATE_BEFORE_ORDER");
    const first = FUTURE_DAY(20);
    await confirmOrder(achLocal, { id, expectedUpdatedAt: await ver(id), promisedDate: first });
    expect(await code(changePromisedDate(achLocal, { id, expectedUpdatedAt: await ver(id), promisedDate: first, reason: "Retard de production" }))).toBe("PROMISED_DATE_UNCHANGED");
    const moved = await changePromisedDate(achLocal, { id, expectedUpdatedAt: await ver(id), promisedDate: FUTURE_DAY(27), reason: "Retard de production" });
    expect(moved.promisedDateChanges).toBe(1);
    const po = await reload(id);
    expect(po.firstPromisedDate?.toISOString().slice(0, 10)).toBe(first);
    expect(po.promisedDate?.toISOString().slice(0, 10)).toBe(FUTURE_DAY(27));
    expect(po.expectedDate.toISOString().slice(0, 10)).toBe(FUTURE_DAY(27));
    const ev = await db.purchaseOrderEvent.findFirstOrThrow({ where: { orderId: id, type: "PROMISED_DATE_CHANGED" } });
    expect(ev.payload).toMatchObject({ before: first, after: FUTURE_DAY(27) });
    expect(ev.comment).toBe("Retard de production");
  });

  it("clôture : Responsable seul, depuis RECU", async () => {
    const da = await validatedDa([{ item: itemA, qty: 30 }]);
    const id = await validatedOrder(da);
    expect(await code(closeOrder(resp, { id, expectedUpdatedAt: await ver(id) }))).toBe("INVALID_STATUS");
    await db.purchaseOrderLine.updateMany({ where: { orderId: id }, data: { receivedQty: 5 } });
    await db.$transaction((tx) => refreshReceivedStatus(tx, id, resp));
    expect((await reload(id)).status).toBe("RECU");
    expect(await code(closeOrder(achLocal, { id, expectedUpdatedAt: await ver(id) }))).toBe("FORBIDDEN");
    await closeOrder(resp, { id, expectedUpdatedAt: await ver(id), comment: "Soldé" });
    expect((await reload(id)).status).toBe("CLOTURE");
  });
});

describe("fournisseur bloqué (D11)", () => {
  it("refusé à la création, à la soumission et à la validation s'il est bloqué entre-temps", async () => {
    const da = await validatedDa([{ item: itemA, qty: 30 }]);
    expect(await code(draftOrder(achLocal, da, { supplier: supBlocked }))).toBe("SUPPLIER_BLOCKED");
    const a = await draftOrder(achLocal, da);
    await db.supplier.update({ where: { id: supLocal.id }, data: { status: "BLOQUE" } });
    expect(await code(toValidate(achLocal, a.id))).toBe("SUPPLIER_BLOCKED");
    await db.supplier.update({ where: { id: supLocal.id }, data: { status: "ACTIF" } });
    await toValidate(achLocal, a.id);
    await db.supplier.update({ where: { id: supLocal.id }, data: { status: "BLOQUE" } });
    expect(await code(validate(a.id))).toBe("SUPPLIER_BLOCKED");
    expect((await reload(a.id)).number).toBeNull();
    expect(await db.counter.count({ where: { key: "BC" } })).toBe(0);
  });

  it("fournisseur en évaluation : accepté avec un avertissement", async () => {
    await db.supplier.update({ where: { id: supLocal.id }, data: { status: "EN_EVALUATION" } });
    const da = await validatedDa([{ item: itemA, qty: 5 }]);
    const d = await draftOrder(achLocal, da);
    expect(d.warnings.map((w) => w.code)).toContain("SUPPLIER_IN_EVALUATION");
  });
});

describe("allocations et statut des DA (D6, D7, D9)", () => {
  it("regroupement : deux DA sur une seule ligne de BC", async () => {
    const da1 = await validatedDa([{ item: itemA, qty: 3 }]);
    const da2 = await validatedDa([{ item: itemA, qty: 4 }]);
    const d = await createDraft(achLocal, ordInput(supLocal.id, {
      lines: [{ itemId: itemA.id, quantity: 7, unitPrice: 10000, allocations: [{ requestLineId: da1.lineIds[0], qty: 3 }, { requestLineId: da2.lineIds[0], qty: 4 }] }],
    }));
    const po = await reload(d.id);
    expect(po.lines).toHaveLength(1);
    expect(po.lines[0].allocations).toHaveLength(2);
    await toValidate(achLocal, d.id);
    await validate(d.id);
    expect(await prStatus(da1.id)).toBe("COMMANDEE");
    expect(await prStatus(da2.id)).toBe("COMMANDEE");
  });

  it("commande partielle : PARTIELLEMENT_COMMANDEE, puis COMMANDEE ; l'annulation rouvre (retour bidirectionnel)", async () => {
    const da = await validatedDa([{ item: itemA, qty: 10 }]);
    const first = await validatedOrder(da, { qty: 4 });
    expect(await prStatus(da.id)).toBe("PARTIELLEMENT_COMMANDEE");
    const second = await validatedOrder(da, { qty: 6 });
    expect(await prStatus(da.id)).toBe("COMMANDEE");
    await cancelOrder(resp, { id: second, expectedUpdatedAt: await ver(second), reason: "Fournisseur en rupture" });
    expect(await prStatus(da.id)).toBe("PARTIELLEMENT_COMMANDEE");
    await cancelOrder(resp, { id: first, expectedUpdatedAt: await ver(first), reason: "Plus nécessaire" });
    expect(await prStatus(da.id)).toBe("VALIDEE");
    const sync = await db.purchaseRequestEvent.findMany({ where: { requestId: da.id, type: "STATUS_SYNC" }, orderBy: { createdAt: "asc" } });
    expect(sync.map((e) => e.toStatus)).toEqual(["PARTIELLEMENT_COMMANDEE", "COMMANDEE", "PARTIELLEMENT_COMMANDEE", "VALIDEE"]);
  });

  it("un brouillon ou un BC à valider ne change pas le statut de la DA", async () => {
    const da = await validatedDa([{ item: itemA, qty: 10 }]);
    const d = await draftOrder(achLocal, da, { qty: 10 });
    await toValidate(achLocal, d.id);
    expect(await prStatus(da.id)).toBe("VALIDEE");
  });

  it("refus d'un BC : la DA reste commandable et le besoin est libéré", async () => {
    const da = await validatedDa([{ item: itemA, qty: 10 }]);
    const d = await draftOrder(achLocal, da, { qty: 10 });
    expect(await code(draftOrder(achLocal, da, { qty: 1 }))).toBe("ALLOCATION_EXCEEDED"); // réservé par le brouillon
    await toValidate(achLocal, d.id);
    await rejectOrder(resp, { id: d.id, expectedUpdatedAt: await ver(d.id), reason: "Prix trop élevé" });
    expect(await code(draftOrder(achLocal, da, { qty: 10 }))).toBe("OK");
  });

  it("deux acheteurs allouent le reste d'une même ligne en parallèle : un seul réussit", async () => {
    const da = await validatedDa([{ item: itemA, qty: 10 }], { assigned: false });
    const [r1, r2] = await Promise.allSettled([
      draftOrder(achLocal, da, { qty: 10 }),
      draftOrder(achAll, da, { qty: 10 }),
    ]);
    const outcomes = [r1, r2].map((r) => (r.status === "fulfilled" ? "OK" : (r.reason as { code?: string }).code));
    expect(outcomes.sort()).toEqual(["ALLOCATION_EXCEEDED", "OK"]);
    expect(await db.purchaseOrder.count({ where: { createdById: { in: [achLocal.id, achAll.id] } } })).toBe(1);
  });

  it("D5 : DA assignée à un autre acheteur refusée ; DA non assignée ouverte au périmètre ; Responsable toujours", async () => {
    const da = await validatedDa([{ item: itemA, qty: 30 }]); // assignée à achLocal
    expect(await code(draftOrder(achAll, da, { qty: 1 }))).toBe("FORBIDDEN");
    expect(await code(draftOrder(resp, da, { qty: 1 }))).toBe("OK");
    await db.purchaseRequest.update({ where: { id: da.id }, data: { assignedBuyerId: null } });
    expect(await code(draftOrder(achAll, da, { qty: 1 }))).toBe("OK");
  });

  it("DA non validée ou annulée : refusée ; quantité commandée > besoin acceptée avec avertissement", async () => {
    const da = await validatedDa([{ item: itemA, qty: 10 }]);
    const d = await draftOrder(achLocal, da, { qty: 12, alloc: 10 });
    expect(d.warnings.map((w) => w.code)).toContain("QTY_OVER_REQUEST");
    await db.purchaseRequest.update({ where: { id: da.id }, data: { status: "ANNULEE" } });
    expect(await code(draftOrder(achLocal, da, { qty: 1 }))).toBe("ALLOCATION_INVALID");
  });

  it("la quantité validée de la DA (pas la demandée) plafonne le reste à commander", async () => {
    const da = await validatedDa([{ item: itemA, qty: 10, approved: 6 }]);
    expect(await code(draftOrder(achLocal, da, { qty: 7 }))).toBe("ALLOCATION_EXCEEDED");
    expect(await code(draftOrder(achLocal, da, { qty: 6 }))).toBe("OK");
  });

  it("« À commander » : lignes groupées par fournisseur principal, reste à commander tenu compte des réservations", async () => {
    await db.item.update({ where: { id: itemA.id }, data: { mainSupplierId: supLocal.id } });
    const da = await validatedDa([{ item: itemA, qty: 10 }, { item: itemB, qty: 4 }]);
    await draftOrder(achLocal, da, { qty: 3 });
    const r = await listOrderableLines(achLocal);
    const group = r.groups.find((g) => g.supplier?.id === supLocal.id)!;
    const line = group.lines.find((l) => l.requestLineId === da.lineIds[0])!;
    expect(line.remaining.toString()).toBe("7");
    expect(line.reserved.toString()).toBe("3");
    expect(r.groups.at(-1)!.supplier).toBeNull(); // « sans fournisseur principal » à part, en dernier
    expect(r.groups.at(-1)!.lines.map((l) => l.requestLineId)).toContain(da.lineIds[1]);
  });

  it("brouillon depuis des lignes de DA cochées : quantité par défaut = reste, regroupement d'un même article", async () => {
    const da1 = await validatedDa([{ item: itemA, qty: 3 }]);
    const da2 = await validatedDa([{ item: itemA, qty: 4 }]);
    const d = await createDraftFromRequestLines(achLocal, { supplierId: supLocal.id, lines: [{ requestLineId: da1.lineIds[0] }, { requestLineId: da2.lineIds[0] }] });
    const po = await reload(d.id);
    expect(po.lines).toHaveLength(1);
    expect(po.lines[0].quantity.toString()).toBe("7");
    expect(po.lines[0].allocations.map((a) => a.qty.toString()).sort()).toEqual(["3", "4"]);
    expect(po.warehouseId).toBe(wh.id);
  });
});

describe("montants, taux et prix (D12-D14)", () => {
  it("prix FCFA décimal refusé ; unité de stock refusée pour un article du catalogue", async () => {
    const da = await validatedDa([{ item: itemA, qty: 5 }]);
    expect(await code(draftOrder(achLocal, da, { price: 100.5 }))).toBe("MONTANT_INVALIDE");
    const bad = createDraft(achLocal, ordInput(supLocal.id, { lines: [{ itemId: itemA.id, unit: "U", quantity: 5, unitPrice: 100, allocations: [{ requestLineId: da.lineIds[0], qty: 5 }] }] }));
    expect(await code(bad)).toBe("UNIT_INVALID");
  });

  it("remise, TVA par ligne, frais : totaux persistés", async () => {
    const da = await validatedDa([{ item: itemA, qty: 10 }]);
    const d = await createDraft(achLocal, ordInput(supLocal.id, {
      lines: [{ itemId: itemA.id, quantity: 10, unitPrice: 10000, discountPct: 10, vatRate: 18, allocations: [{ requestLineId: da.lineIds[0], qty: 10 }] }],
      charges: [{ label: "Transport", amount: 5000, vatRate: 18 }],
    }));
    const po = await reload(d.id);
    expect(po.lines[0].netAmount.toString()).toBe("90000");
    expect(po.totalHt.toString()).toBe("95000");
    expect(po.totalVat.toString()).toBe("17100");
    expect(po.totalTtc.toString()).toBe("112100");
    expect(po.totalTtcXof).toBe(112100);
  });

  it("plafond INTEGER : message clair", async () => {
    const da = await validatedDa([{ item: itemA, qty: 10 }]);
    expect(await code(draftOrder(achLocal, da, { qty: 10, price: 300_000_000 }))).toBe("TOTAL_TOO_HIGH");
  });

  it("import : taux absent -> validation refusée ; taux figé à la validation ; incoterm et lieu exigés à la soumission", async () => {
    const da = await validatedDa([{ item: itemB, qty: 100 }], { type: "IMPORT" });
    const mk = () => draftOrder(achImport, da, { item: itemB, supplier: supImport, qty: 100, price: 2.5 });
    const d = await mk();
    // incoterm hérité de la fiche fournisseur (FOB) mais lieu manquant
    expect(await code(toValidate(achImport, d.id))).toBe("NOT_SUBMITTABLE");
    await updateDraft(achImport, { ...(await orderToInput(d.id)), incoterm: "FOB", incotermPlace: "Shanghai" });
    await toValidate(achImport, d.id);
    expect(await code(validate(d.id))).toBe("RATE_MISSING");
    await db.exchangeRate.create({ data: { currencyCode: "USD", date: new Date(`${FUTURE_DAY(0)}T00:00:00Z`), rate: "605.25", note: "IT-rate" } });
    await validate(d.id);
    const po = await reload(d.id);
    expect(po.status).toBe("VALIDE");
    expect(po.exchangeRate?.toString()).toBe("605.25");
    expect(po.rateDate?.toISOString().slice(0, 10)).toBe(FUTURE_DAY(0));
    expect(po.totalTtc.toString()).toBe("250"); // 100 x 2,5 USD, 0 % de TVA import
    expect(po.totalTtcXof).toBe(151_313); // 250 x 605,25 = 151 312,5 -> 151 313
  });

  it("taux ancien (> 30 jours) : validation permise avec avertissement", async () => {
    const da = await validatedDa([{ item: itemB, qty: 100 }], { type: "IMPORT" });
    const d = await draftOrder(achImport, da, { item: itemB, supplier: supImport, qty: 100, price: 2.5, extra: { incoterm: "FOB", incotermPlace: "Shanghai" } });
    await db.exchangeRate.create({ data: { currencyCode: "USD", date: new Date(Date.now() - 45 * 86_400_000), rate: "600", note: "IT-rate" } });
    await toValidate(achImport, d.id);
    const r = await validate(d.id);
    expect(r.warnings.map((w) => w.code)).toContain("RATE_STALE");
  });

  it("historique de prix écrit à la validation (source BC, numéro) et dernier prix fournisseur mis à jour", async () => {
    await db.itemSupplier.create({ data: { itemId: itemA.id, supplierId: supLocal.id, lastPrice: 9000, currencyCode: "XOF", priceUnit: "CARTON" } });
    const da = await validatedDa([{ item: itemA, qty: 10 }]);
    const id = await validatedOrder(da, { qty: 10, price: 9500 });
    const po = await reload(id);
    const h = await db.itemPriceHistory.findFirstOrThrow({ where: { itemId: itemA.id, source: "BC" } });
    expect(h.sourceRef).toBe(po.number);
    expect(h.price.toString()).toBe("9500");
    expect(h.priceUnit).toBe("CARTON");
    expect(h.supplierId).toBe(supLocal.id);
    const link = await db.itemSupplier.findFirstOrThrow({ where: { itemId: itemA.id, supplierId: supLocal.id } });
    expect(link.lastPrice?.toString()).toBe("9500");
  });

  it("alerte prix mémorisée à la soumission : +30 % vs dernier prix, visible sur la fiche", async () => {
    await db.itemPriceHistory.create({ data: { itemId: itemA.id, supplierId: supLocal.id, price: 10000, currencyCode: "XOF", priceUnit: "CARTON", source: "MANUEL", date: new Date(Date.now() - 30 * 86_400_000) } });
    const da = await validatedDa([{ item: itemA, qty: 5 }]);
    const d = await draftOrder(achLocal, da, { price: 13000 });
    await toValidate(achLocal, d.id);
    const line = (await reload(d.id)).lines[0];
    expect(line.priceDeltaPct?.toString()).toBe("30");
    expect(line.lastPriceXof).toBe(10000);
    const detail = await getOrder(resp, d.id);
    expect(detail.alerts.some((a) => a.kind === "PRICE" && a.message.includes("+30 % vs dernier prix"))).toBe(true);
  });

  it("seuil de validation : sous le seuil, la soumission d'un acheteur vaut validation ; au-dessus, non", async () => {
    await setSetting("purchaseOrder.approvalThreshold", 100_000);
    const da = await validatedDa([{ item: itemA, qty: 30 }]);
    const small = await draftOrder(achLocal, da, { qty: 5, price: 10000 }); // 59 000 TTC
    const r = await toValidate(achLocal, small.id);
    expect(r.autoApproved).toBe(true);
    const po = await reload(small.id);
    expect(po.status).toBe("VALIDE");
    expect(po.number).toMatch(/^BC-/);
    const ev = await db.purchaseOrderEvent.findFirstOrThrow({ where: { orderId: small.id, type: "APPROVED" } });
    expect((ev.payload as { underThreshold: boolean }).underThreshold).toBe(true);
    const big = await draftOrder(achLocal, da, { qty: 10, price: 10000 }); // 118 000 TTC
    expect((await toValidate(achLocal, big.id)).autoApproved).toBe(false);
    expect((await reload(big.id)).status).toBe("A_VALIDER");
  });
});

describe("avenant (D16)", () => {
  it("v2 : instantané v1 conservé, numéro identique, abandon -> restauration exacte du statut et du contenu", async () => {
    const da = await validatedDa([{ item: itemA, qty: 30 }]);
    const id = await validatedOrder(da, { qty: 10, price: 10000 });
    await markSent(achLocal, { id, expectedUpdatedAt: await ver(id), channel: "EMAIL" });
    const v1 = await reload(id);
    await startAmendment(achLocal, { id, expectedUpdatedAt: await ver(id), reason: "Quantité à réduire" });
    const am = await reload(id);
    expect(am.version).toBe(2);
    expect(am.status).toBe("BROUILLON");
    expect(am.resumeStatus).toBe("ENVOYE");
    expect(am.number).toBe(v1.number);
    // modification : quantité 10 -> 8
    await updateDraft(achLocal, { ...(await orderToInput(id)), lines: [{ itemId: itemA.id, quantity: 8, unitPrice: 10000, allocations: [{ requestLineId: da.lineIds[0], qty: 8 }] }] });
    expect((await reload(id)).lines[0].quantity.toString()).toBe("8");
    expect(await db.purchaseOrderVersion.count({ where: { orderId: id } })).toBe(1);
    // abandon : tout revient à l'identique
    await abandonAmendment(achLocal, { id, expectedUpdatedAt: await ver(id) });
    const back = await reload(id);
    expect(back.version).toBe(1);
    expect(back.status).toBe("ENVOYE");
    expect(back.resumeStatus).toBeNull();
    expect(back.number).toBe(v1.number);
    expect(back.lines[0].quantity.toString()).toBe("10");
    expect(back.lines[0].allocations[0].qty.toString()).toBe("10");
    expect(back.totalTtc.toString()).toBe(v1.totalTtc.toString());
    expect(back.totalTtcXof).toBe(v1.totalTtcXof);
  });

  it("v2 soumise puis validée : même numéro, « VALIDE » à renvoyer, deux versions, PDF des deux versions", async () => {
    const da = await validatedDa([{ item: itemA, qty: 30 }]);
    const id = await validatedOrder(da, { qty: 10, price: 10000 });
    const number = (await reload(id)).number;
    await startAmendment(achLocal, { id, expectedUpdatedAt: await ver(id), reason: "Prix renégocié" });
    await updateDraft(achLocal, { ...(await orderToInput(id)), lines: [{ itemId: itemA.id, quantity: 10, unitPrice: 9000, allocations: [{ requestLineId: da.lineIds[0], qty: 10 }] }] });
    await toValidate(achLocal, id);
    await validate(id);
    const po = await reload(id);
    expect(po.version).toBe(2);
    expect(po.status).toBe("VALIDE");
    expect(po.number).toBe(number);
    expect(await db.counter.findFirstOrThrow({ where: { key: "BC" } }).then((c) => c.value)).toBe(1);
    expect((await db.purchaseOrderVersion.findMany({ where: { orderId: id }, orderBy: { version: "asc" } })).map((v) => v.version)).toEqual([1, 2]);
    const { company, logo } = await loadBranding();
    const pdf2 = await getOrderPdfSource(achLocal, id);
    expect(pdf2.fileName).toBe(`${number}-v2.pdf`);
    expect(pdf2.preview).toBe(false);
    const bytes1 = await renderOrderPdf((await getOrderPdfSource(achLocal, id, 1)).snapshot, { company, logo });
    expect(bytes1.subarray(0, 4).toString()).toBe("%PDF");
    expect((await getOrderPdfSource(achLocal, id, 1)).snapshot.totals.totalTtc).toBe("118000");
    expect(pdf2.snapshot.totals.totalTtc).toBe("106200");
  });

  it("avenant refusé : version précédente restaurée, statut d'origine retrouvé, BC non refusé", async () => {
    const da = await validatedDa([{ item: itemA, qty: 30 }]);
    const id = await validatedOrder(da, { qty: 10, price: 10000 });
    await startAmendment(achLocal, { id, expectedUpdatedAt: await ver(id), reason: "Prix renégocié" });
    await updateDraft(achLocal, { ...(await orderToInput(id)), lines: [{ itemId: itemA.id, quantity: 12, unitPrice: 10000, allocations: [{ requestLineId: da.lineIds[0], qty: 12 }] }] });
    await toValidate(achLocal, id);
    await rejectOrder(resp, { id, expectedUpdatedAt: await ver(id), reason: "Quantité injustifiée" });
    const po = await reload(id);
    expect(po.status).toBe("VALIDE");
    expect(po.version).toBe(1);
    expect(po.lines[0].quantity.toString()).toBe("10");
  });

  it("avenant interdit après réception, et un avenant ne s'annule pas", async () => {
    const da = await validatedDa([{ item: itemA, qty: 30 }]);
    const id = await validatedOrder(da, { qty: 10 });
    await startAmendment(achLocal, { id, expectedUpdatedAt: await ver(id), reason: "Prix renégocié" });
    expect(await code(cancelOrder(achLocal, { id, expectedUpdatedAt: await ver(id), reason: "Je veux annuler" }))).toBe("INVALID_STATUS");
    await abandonAmendment(achLocal, { id, expectedUpdatedAt: await ver(id) });
    await db.purchaseOrderLine.updateMany({ where: { orderId: id }, data: { receivedQty: 2 } });
    expect(await code(startAmendment(achLocal, { id, expectedUpdatedAt: await ver(id), reason: "Prix renégocié" }))).toBe("HAS_RECEIPTS");
  });
});

describe("réception (LOT-06) : refreshReceivedStatus", () => {
  it("reçu partiel puis total ; retour en arrière si les réceptions sont annulées", async () => {
    const da = await validatedDa([{ item: itemA, qty: 30 }]);
    const id = await validatedOrder(da, { qty: 10 });
    await markSent(achLocal, { id, expectedUpdatedAt: await ver(id), channel: "EMAIL" });
    await confirmOrder(achLocal, { id, expectedUpdatedAt: await ver(id), promisedDate: FUTURE_DAY(20) });
    const line = (await reload(id)).lines[0];
    await db.purchaseOrderLine.update({ where: { id: line.id }, data: { receivedQty: 4 } });
    await db.$transaction((tx) => refreshReceivedStatus(tx, id, resp));
    expect((await reload(id)).status).toBe("PARTIELLEMENT_RECU");
    await db.purchaseOrderLine.update({ where: { id: line.id }, data: { receivedQty: 10 } });
    await db.$transaction((tx) => refreshReceivedStatus(tx, id, resp));
    expect((await reload(id)).status).toBe("RECU");
    await db.$transaction((tx) => refreshReceivedStatus(tx, id, resp)); // idempotent
    await db.purchaseOrderLine.update({ where: { id: line.id }, data: { receivedQty: 0 } });
    await db.$transaction((tx) => refreshReceivedStatus(tx, id, resp));
    expect((await reload(id)).status).toBe("CONFIRME");
    expect(await db.purchaseOrderEvent.count({ where: { orderId: id, type: "STATUS_SYNC" } })).toBe(3);
  });
});

describe("retards et relances (D19-D20)", () => {
  const D = (iso: string) => new Date(iso);

  async function confirmedOrder(requested: number, promised?: number) {
    const da = await validatedDa([{ item: itemA, qty: 30 }]);
    const id = await validatedOrder(da, { qty: 5, extra: { requestedDate: FUTURE_DAY(requested) } });
    await markSent(achLocal, { id, expectedUpdatedAt: await ver(id), channel: "EMAIL" });
    if (promised !== undefined) await confirmOrder(achLocal, { id, expectedUpdatedAt: await ver(id), promisedDate: FUTURE_DAY(promised) });
    return id;
  }
  const dayAt = (offset: number, time = "12:00:00") => D(`${FUTURE_DAY(offset)}T${time}Z`);

  it("onglet « En retard » : veille, jour J, lendemain", async () => {
    const id = await confirmedOrder(5, 10); // attendu dans 10 jours
    const late = async (at: Date) => (await listOrders(achLocal, { onglet: "en-retard" }, at)).rows.map((r) => r.id);
    expect(await late(dayAt(9))).not.toContain(id);
    expect(await late(dayAt(10))).not.toContain(id);
    expect(await late(dayAt(11, "00:01:00"))).toContain(id);
    const row = (await listOrders(achLocal, { onglet: "en-retard" }, dayAt(14))).rows.find((r) => r.id === id)!;
    expect(row.late).toBe(true);
    expect(row.daysLate).toBe(4);
  });

  it("confirmé avec date promise future mais date demandée passée : pas en retard", async () => {
    const id = await confirmedOrder(5, 20);
    const rows = (await listOrders(achLocal, { onglet: "en-retard" }, dayAt(8))).rows.map((r) => r.id);
    expect(rows).not.toContain(id);
  });

  it("un BC validé et non envoyé peut être en retard ; un BC reçu non", async () => {
    const da = await validatedDa([{ item: itemA, qty: 30 }]);
    const id = await validatedOrder(da, { qty: 5, extra: { requestedDate: FUTURE_DAY(3) } });
    expect((await listOrders(achLocal, { onglet: "en-retard" }, dayAt(6))).rows.map((r) => r.id)).toContain(id);
    await db.purchaseOrder.update({ where: { id }, data: { status: "RECU" } });
    expect((await listOrders(achLocal, { onglet: "en-retard" }, dayAt(6))).rows.map((r) => r.id)).not.toContain(id);
  });

  it("à relancer : envoyé non confirmé depuis 3 jours ouvrés ; la relance remet l'indicateur à zéro", async () => {
    const id = await confirmedOrder(30);
    await db.purchaseOrder.update({ where: { id }, data: { sentAt: D("2026-11-02T10:00:00Z"), expectedDate: D("2026-12-31T00:00:00Z") } }); // envoyé un lundi
    const flagged = async (at: Date) => (await listOrders(achLocal, { relance: "1" }, at)).rows.map((r) => r.id);
    expect(await flagged(D("2026-11-04T10:00:00Z"))).not.toContain(id);
    expect(await flagged(D("2026-11-05T10:00:00Z"))).toContain(id);
    const r = await remindSupplier(achLocal, { id, expectedUpdatedAt: await ver(id), channel: "WHATSAPP", contact: "M. Koffi", comment: "Merci de confirmer" }, null, D("2026-11-05T11:00:00Z"));
    expect(r.reminderCount).toBe(1);
    expect(await flagged(D("2026-11-06T10:00:00Z"))).not.toContain(id);
    const po = await reload(id);
    expect(po.lastRemindedAt?.toISOString()).toBe("2026-11-05T11:00:00.000Z");
    const ev = await db.purchaseOrderEvent.findFirstOrThrow({ where: { orderId: id, type: "REMINDED" } });
    expect(ev.payload).toMatchObject({ channel: "WHATSAPP", contact: "M. Koffi" });
  });

  it("compteurs et pastilles d'accueil : à valider (Responsable), en retard (acheteur)", async () => {
    const da = await validatedDa([{ item: itemA, qty: 30 }]);
    const a = await draftOrder(achLocal, da, { qty: 5 });
    await toValidate(achLocal, a.id);
    const id = await confirmedOrder(3, 4);
    expect((await homeOrderSummary(resp, dayAt(8))).toValidate).toBe(1);
    expect((await homeOrderSummary(achLocal, dayAt(8))).late).toBe(1);
    expect((await homeOrderSummary(achAll, dayAt(8))).late).toBe(0); // « les siens »
    expect((await homeOrderSummary(mag)).toValidate).toBe(0);
    expect((await listOrders(resp, { onglet: "a-valider" }, dayAt(8))).counts).toMatchObject({ aValider: 1, enRetard: 1 });
    void id;
  });

  it("ancienneté : « à valider » depuis la soumission", async () => {
    const da = await validatedDa([{ item: itemA, qty: 30 }]);
    const a = await draftOrder(achLocal, da, { qty: 5 });
    await toValidate(achLocal, a.id);
    const row = (await listOrders(resp, { onglet: "a-valider" }, dayAt(7))).rows[0];
    expect(row.ageDays).toBe(7); // 7 jours calendaires = au moins 5 jours ouvrés, quel que soit le jour du test
    expect(row.ageSeverity).toBe("critical");
  });
});

describe("engagements ouverts (D23) : OpenOrderSource", () => {
  it("avertissement « Déjà commandé » sur une nouvelle DA, anonymisé pour le Magasinier, sans prix ni fournisseur", async () => {
    const da = await validatedDa([{ item: itemA, qty: 30 }]);
    const d = await draftOrder(achLocal, da, { qty: 5, price: 12345 });
    // brouillon : aucun engagement
    expect((await duplicateWarnings(db, [itemA.id], null, achLocal as RequestUser)).flatMap((w) => w.messages).filter((m) => m.startsWith("Déjà commandé"))).toHaveLength(0);
    await toValidate(achLocal, d.id);
    await validate(d.id);
    const number = (await reload(d.id)).number!;
    const forBuyer = (await duplicateWarnings(db, [itemA.id], null, achLocal as RequestUser)).flatMap((w) => w.messages);
    expect(forBuyer.some((m) => m.startsWith(`Déjà commandé : ${number}, 5 CARTON attendues le`))).toBe(true);
    const forMag = await duplicateWarnings(db, [itemA.id], null, mag as RequestUser);
    const bc = forMag.flatMap((w) => w.commitments).filter((c) => c.source === "BC");
    expect(bc).toHaveLength(1);
    expect(bc[0].number).toBe("");
    expect(bc[0].documentId).toBe("");
    const json = JSON.stringify(forBuyer) + JSON.stringify(forMag);
    expect(json).not.toContain("12345");
    expect(json).not.toContain("Fournisseur local test");
    expect(json).not.toContain(supLocal.id);
    // reste à recevoir
    const line = (await reload(d.id)).lines[0];
    await db.purchaseOrderLine.update({ where: { id: line.id }, data: { receivedQty: 3 } });
    const left = (await duplicateWarnings(db, [itemA.id], null, achLocal as RequestUser)).flatMap((w) => w.messages).find((m) => m.startsWith("Déjà commandé"))!;
    expect(left).toContain("2 CARTON");
  });

  it("à la création d'un BC : avertissement sur les autres BC ouverts, jamais sur lui-même", async () => {
    const da = await validatedDa([{ item: itemA, qty: 30 }]);
    const first = await validatedOrder(da, { qty: 5 });
    const d = await draftOrder(achLocal, da, { qty: 5 });
    expect(d.warnings.some((w) => w.code === "ALREADY_ORDERED")).toBe(true);
    const dup = await checkOrderDuplicates(achLocal, { itemIds: [itemA.id], excludeId: first });
    expect(dup).toHaveLength(0);
  });
});

describe("fiche, liste, export et PDF", () => {
  it("fiche : droits d'action, DA sources, totaux et alertes ; liste filtrée par onglet", async () => {
    const da = await validatedDa([{ item: itemA, qty: 30 }]);
    const id = await validatedOrder(da, { qty: 10 });
    const f = await getOrder(resp, id);
    expect(f.sourceRequests.map((s) => s.id)).toEqual([da.id]);
    expect(f.actions).toEqual(expect.arrayContaining(["cancel", "send", "startAmendment", "pdf"]));
    expect(f.actions).not.toContain("approve");
    expect(f.lines[0].designation).toContain("IT-PO-A");
    expect(f.lines[0].allocations[0].requestNumber).toBe(da.number);
    expect((await listOrders(resp, { onglet: "en-cours" })).rows.map((r) => r.id)).toContain(id);
    expect((await listOrders(resp, { onglet: "recus" })).rows.map((r) => r.id)).not.toContain(id);
    expect((await listOrders(resp, { q: da.number })).rows.map((r) => r.id)).toContain(id);
    expect((await listOrders(resp, { q: "Fournisseur local" })).rows.map((r) => r.id)).toContain(id);
    expect((await listOrders(resp, { fournisseur: supImport.id })).rows).toHaveLength(0);
  });

  it("fiche d'une DA : commandé / reste par ligne, commandes liées, action « Créer le BC »", async () => {
    const { getRequest } = await import("@/modules/purchase-requests");
    const da = await validatedDa([{ item: itemA, qty: 10 }]);
    await validatedOrder(da, { qty: 4 });
    const f = await getRequest(achLocal as RequestUser, da.id, { showPrices: true });
    expect(f.lines[0].orderedQty).toBe("4");
    expect(f.lines[0].remainingQty).toBe("6");
    expect(f.linkedOrders).toHaveLength(1);
    expect(f.actions).toContain("createOrder");
    await validatedOrder(da, { qty: 6 });
    const g = await getRequest(achLocal as RequestUser, da.id, { showPrices: true });
    expect(g.actions).not.toContain("createOrder");
    expect(g.linkedOrders).toHaveLength(2);
    const forMag = await getRequest(mag as RequestUser, da.id, { showPrices: false }).catch(() => null);
    if (forMag) expect(forMag.linkedOrders).toHaveLength(0);
  });

  it("liste des DA : ancienneté de validation et lignes restant à commander", async () => {
    const { listRequests } = await import("@/modules/purchase-requests");
    const da = await validatedDa([{ item: itemA, qty: 10 }, { item: itemB, qty: 4 }]);
    const row = async () => (await listRequests(achLocal as RequestUser, { onglet: "assignees" }, { showPrices: true })).rows.find((r) => r.id === da.id)!;
    expect((await row()).linesToOrder).toBe(2);
    expect((await row()).approvedAt).toBeInstanceOf(Date);
    await validatedOrder(da, { qty: 10 }); // solde la ligne 1
    expect((await row()).linesToOrder).toBe(1);
  });

  it("export : une ligne par ligne de BC, filtres de la liste, reste à recevoir", async () => {
    const da = await validatedDa([{ item: itemA, qty: 30 }, { item: itemB, qty: 4 }]);
    const d = await createDraft(achLocal, ordInput(supLocal.id, {
      lines: [
        { itemId: itemA.id, quantity: 5, unitPrice: 10000, allocations: [{ requestLineId: da.lineIds[0], qty: 5 }] },
        { itemId: itemB.id, quantity: 4, unitPrice: 1500, allocations: [{ requestLineId: da.lineIds[1], qty: 4 }] },
      ],
    }));
    await toValidate(achLocal, d.id);
    await validate(d.id);
    // La base de test peut contenir des BC d'autres suites (e2e) : on ne regarde que ceux du fournisseur de ce test.
    const rows = (await exportOrders(resp, { onglet: "en-cours" })).filter((r) => r.supplierCode === "IT-PO-L");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ status: "VALIDE", quantity: 5, receivedQty: 0, remainingQty: 5, netAmount: 50000, netAmountXof: 50000, currency: "XOF" });
    expect(await code(exportOrders(mag))).toBe("FORBIDDEN");
  });

  it("PDF : aperçu filigrané sans numéro tant que le BC n'est pas validé ; le texte contient le numéro et le TTC une fois validé", async () => {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const da = await validatedDa([{ item: itemA, qty: 10 }]);
    const d = await draftOrder(achLocal, da, { qty: 10, price: 10000 });
    const preview = await getOrderPdfSource(achLocal, d.id);
    expect(preview.preview).toBe(true);
    expect(preview.snapshot.number).toBeNull();
    expect(await code(getOrderPdfSource(achAll, d.id))).toBe("FORBIDDEN"); // brouillon d'autrui
    await toValidate(achLocal, d.id);
    await validate(d.id);
    const number = (await reload(d.id)).number!;
    const src = await getOrderPdfSource(achLocal, d.id);
    const { company, logo } = await loadBranding();
    const bytes = await renderOrderPdf(src.snapshot, { company, logo });
    const raw = (await extractText(await getDocumentProxy(new Uint8Array(bytes)), { mergePages: true })).text;
    const text = raw.replace(/ /g, " "); // l'extraction restitue l'espace insécable en espace simple
    expect(text).toContain(number);
    expect(text).toContain("118 000 FCFA"); // 100 000 HT + 18 %
    expect(await code(getOrderPdfSource(mag, d.id))).toBe("FORBIDDEN");
  });
});

/** Reconstruit l'entrée de `updateDraft` depuis l'état en base (pour modifier un brouillon). */
async function orderToInput(id: string) {
  const po = await db.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { lines: { orderBy: { lineNo: "asc" }, include: { allocations: true } }, charges: true } });
  const owner = [resp, achLocal, achImport, achAll].find((u) => u.id === po.createdById)!;
  void owner;
  return {
    id,
    expectedUpdatedAt: po.updatedAt,
    supplierId: po.supplierId,
    origin: po.origin === "OFFRE" ? "DA" : po.origin,
    directReason: po.directReason,
    currencyCode: po.currencyCode,
    paymentTerm: po.paymentTerm,
    paymentTermNote: po.paymentTermNote,
    incoterm: po.incoterm,
    incotermPlace: po.incotermPlace,
    warehouseId: po.warehouseId,
    deliveryAddress: po.deliveryAddress,
    requestedDate: po.requestedDate.toISOString().slice(0, 10),
    supplierRef: po.supplierRef,
    notes: po.notes,
    internalNote: po.internalNote,
    lines: po.lines.map((l) => ({
      itemId: l.itemId,
      freeDesignation: l.freeDesignation,
      supplierRef: l.supplierRef,
      quantity: l.quantity.toString(),
      unit: l.unit,
      unitPrice: l.unitPrice.toString(),
      discountPct: l.discountPct.toString(),
      vatRate: l.vatRate.toString(),
      note: l.note,
      allocations: l.allocations.map((a) => ({ requestLineId: a.requestLineId, qty: a.qty.toString() })),
    })),
    charges: po.charges.map((c) => ({ label: c.label, amount: c.amount.toString(), vatRate: c.vatRate.toString() })),
  };
}
