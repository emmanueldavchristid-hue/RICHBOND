import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { cleanTestUsers, createTestUser } from "../helpers/db";
import { cleanReferentials } from "../helpers/referentials";
import { FUTURE_DAY, cleanPurchaseRequests, parkSeedBuyers } from "../helpers/purchase-requests";
import {
  addAttachment,
  addComment,
  approveMany,
  approveRequest,
  assignBuyer,
  cancelRequest,
  createRequest,
  exportRequests,
  findOpenCommitments,
  getRequest,
  listRequests,
  markInConsultation,
  readAttachment,
  refreshOrderedStatus,
  removeAttachment,
  rejectRequest,
  returnForCompletion,
  submitRequest,
  updateRequest,
  type RequestUser,
} from "@/modules/purchase-requests";
import { currentYear } from "@/lib/dates";

let restoreBuyers: () => Promise<void>;
let dept: { id: string };
let itemA: { id: string }; // CARTON x10 -> U
let itemB: { id: string }; // KG / KG
let itemBlocked: { id: string };
let itemService: { id: string }; // non stocké
let resp: RequestUser;
let achLocal: RequestUser;
let achImport: RequestUser;
let achAll: RequestUser;
let mag: RequestUser;

const toActor = (u: { id: string; role: RequestUser["role"]; purchaseScope: RequestUser["purchaseScope"] }): RequestUser => ({
  id: u.id,
  role: u.role,
  purchaseScope: u.purchaseScope,
});

async function mkUsers() {
  resp = toActor(await createTestUser("da-resp", { role: "RESPONSABLE_ACHATS" }));
  achLocal = toActor(await createTestUser("da-loc", { role: "ACHETEUR", purchaseScope: "LOCAL" }));
  achImport = toActor(await createTestUser("da-imp", { role: "ACHETEUR", purchaseScope: "IMPORT" }));
  achAll = toActor(await createTestUser("da-all", { role: "ACHETEUR", purchaseScope: "ALL" }));
  mag = toActor(await createTestUser("da-mag", { role: "MAGASINIER" }));
}

async function mkRefs() {
  dept = await db.department.create({ data: { code: "IT-DA", name: "Service test DA" } });
  itemA = await db.item.create({
    data: { code: "IT-DA-A", name: "Roulement test", category: "PDR", stockUnit: "U", purchaseUnit: "CARTON", conversionFactor: 10 },
  });
  itemB = await db.item.create({ data: { code: "IT-DA-B", name: "Graisse test", category: "INTRANT", stockUnit: "KG", purchaseUnit: "KG" } });
  itemBlocked = await db.item.create({
    data: { code: "IT-DA-X", name: "Article bloqué", category: "PDR", stockUnit: "U", purchaseUnit: "U", status: "BLOQUE" },
  });
  itemService = await db.item.create({
    data: { code: "IT-DA-S", name: "Prestation test", category: "SERVICE", stockUnit: "FORFAIT", purchaseUnit: "FORFAIT", stocked: false },
  });
}

const base = () => ({
  departmentId: dept.id,
  requesterName: "Awa Koné",
  reason: "Remplacement courroie usée",
  urgency: "NORMALE",
  neededBy: FUTURE_DAY(),
  type: "LOCAL",
});

async function draft(user: RequestUser, over: Record<string, unknown> = {}) {
  return createRequest(user, { ...base(), lines: [{ itemId: itemA.id, quantity: 5, estimatedUnitPrice: 1000 }], ...over });
}

/** Brouillon -> soumise. */
async function submitted(user: RequestUser, over: Record<string, unknown> = {}) {
  const d = await draft(user, over);
  return submitRequest(user, { id: d.id, expectedUpdatedAt: d.updatedAt });
}

async function reload(id: string) {
  return db.purchaseRequest.findUniqueOrThrow({ where: { id }, include: { lines: { orderBy: { lineNo: "asc" } } } });
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "OK";
  } catch (e) {
    return (e as { code?: string }).code ?? `ERR:${(e as Error).message}`;
  }
}

beforeAll(async () => {
  restoreBuyers = await parkSeedBuyers();
});

beforeEach(async () => {
  await cleanPurchaseRequests();
  await cleanReferentials();
  await cleanTestUsers();
  await mkUsers();
  await mkRefs();
});

afterAll(async () => {
  await cleanPurchaseRequests();
  await cleanReferentials();
  await cleanTestUsers();
  await restoreBuyers();
  await db.$disconnect();
});

describe("brouillon et numérotation (D4)", () => {
  it("un brouillon n'a pas de numéro et ne consomme pas de compteur", async () => {
    const d = await draft(achLocal);
    const pr = await reload(d.id);
    expect(pr.status).toBe("BROUILLON");
    expect(pr.number).toBeNull();
    expect(d.displayNumber).toMatch(/^BROUILLON-/);
    expect(await db.counter.count({ where: { key: "DA" } })).toBe(0);
  });

  it("priorité et total calculés ; conversion unité d'achat -> unité de stock", async () => {
    const d = await draft(achLocal, {
      urgency: "URGENTE",
      lines: [
        { itemId: itemA.id, quantity: 3, estimatedUnitPrice: 2500 },
        { itemId: itemB.id, quantity: "2,5", unit: "KG", estimatedUnitPrice: 1001 },
      ],
    });
    const pr = await reload(d.id);
    expect(pr.priority).toBe(1);
    expect(pr.estimatedTotal).toBe(7500 + 2503);
    expect(pr.lines[0].unit).toBe("CARTON");
    expect(pr.lines[0].stockQty?.toString()).toBe("30");
    expect(pr.lines[1].stockQty?.toString()).toBe("2.5");
  });

  it("la soumission attribue DA-AAAA-00001 puis la garde après renvoi à compléter", async () => {
    const s = await submitted(achLocal);
    const year = currentYear();
    expect(s.number).toBe(`DA-${year}-00001`);
    expect(s.status).toBe("SOUMISE");
    const ret = await returnForCompletion(resp, { id: s.id, expectedUpdatedAt: s.updatedAt, comment: "Précisez la référence" });
    expect(ret.status).toBe("A_COMPLETER");
    const again = await submitRequest(achLocal, { id: s.id, expectedUpdatedAt: ret.updatedAt });
    expect(again.number).toBe(s.number);
    expect(again.status).toBe("SOUMISE");
    expect((await db.counter.findUniqueOrThrow({ where: { key_year: { key: "DA", year } } })).value).toBe(1);
    const types = (await db.purchaseRequestEvent.findMany({ where: { requestId: s.id }, orderBy: { createdAt: "asc" } })).map((e) => e.type);
    expect(types).toEqual(["CREATED", "SUBMITTED", "RETURNED", "RESUBMITTED"]);
  });

  it("20 soumissions simultanées : DA-AAAA-00001 à 00020 sans trou ni doublon", async () => {
    const drafts = [];
    for (let i = 0; i < 20; i++) drafts.push(await draft(i % 2 ? achLocal : achAll));
    const results = await Promise.all(
      drafts.map((d, i) => submitRequest(i % 2 ? achLocal : achAll, { id: d.id, expectedUpdatedAt: d.updatedAt })),
    );
    const year = currentYear();
    const numbers = results.map((r) => r.number!).sort();
    expect(numbers).toEqual(Array.from({ length: 20 }, (_, i) => `DA-${year}-${String(i + 1).padStart(5, "0")}`));
  });

  it("une soumission refusée ne consomme aucun numéro", async () => {
    const d = await createRequest(achLocal, { ...base(), lines: [] });
    expect(await code(submitRequest(achLocal, { id: d.id, expectedUpdatedAt: d.updatedAt }))).toBe("NO_LINES");
    expect(await db.counter.count({ where: { key: "DA" } })).toBe(0);
    const s = await submitted(achLocal);
    expect(s.number).toMatch(/-00001$/);
  });

  it("date de besoin passée refusée à la création et à la soumission; article bloqué refusé", async () => {
    expect(await code(draft(achLocal, { neededBy: "2020-01-01" }))).toBe("NEEDED_BY_PAST");
    expect(await code(draft(achLocal, { lines: [{ itemId: itemBlocked.id, quantity: 1 }] }))).toBe("ITEM_NOT_ACTIVE");
    const d = await draft(achLocal);
    await db.item.update({ where: { id: itemA.id }, data: { status: "BLOQUE" } });
    expect(await code(submitRequest(achLocal, { id: d.id, expectedUpdatedAt: d.updatedAt }))).toBe("ITEM_NOT_ACTIVE");
  });

  it("unité non autorisée pour l'article refusée", async () => {
    expect(await code(draft(achLocal, { lines: [{ itemId: itemA.id, quantity: 1, unit: "KG" }] }))).toBe("UNIT_INVALID");
  });

  it("seul le créateur soumet; seul le créateur ou le Responsable modifie", async () => {
    const d = await draft(achLocal);
    expect(await code(submitRequest(achImport, { id: d.id, expectedUpdatedAt: d.updatedAt }))).toBe("FORBIDDEN");
    const upd = { ...base(), id: d.id, expectedUpdatedAt: d.updatedAt, lines: [{ itemId: itemB.id, quantity: 4 }] };
    expect(await code(updateRequest(achImport, upd))).toBe("FORBIDDEN");
    const ok = await updateRequest(resp, upd);
    expect((await reload(ok.id)).lines).toHaveLength(1);
  });

  it("modification avec une version périmée : CONFLICT", async () => {
    const d = await draft(achLocal);
    await updateRequest(achLocal, { ...base(), id: d.id, expectedUpdatedAt: d.updatedAt, lines: [{ itemId: itemB.id, quantity: 1 }] });
    expect(
      await code(updateRequest(achLocal, { ...base(), id: d.id, expectedUpdatedAt: d.updatedAt, lines: [{ itemId: itemB.id, quantity: 2 }] })),
    ).toBe("CONFLICT");
  });

  it("une DA soumise ne se modifie plus", async () => {
    const s = await submitted(achLocal);
    expect(await code(updateRequest(achLocal, { ...base(), id: s.id, expectedUpdatedAt: s.updatedAt, lines: [] }))).toBe("INVALID_STATUS");
  });
});

describe("validation, refus, retour, annulation", () => {
  it("validation concurrente : un succès, un CONFLICT", async () => {
    const s = await submitted(achLocal);
    const args = { id: s.id, expectedUpdatedAt: s.updatedAt };
    const r = await Promise.all([code(approveRequest(resp, args)), code(approveRequest(resp, args))]);
    expect(r.sort()).toEqual(["CONFLICT", "OK"]);
    expect((await reload(s.id)).status).toBe("VALIDEE");
    expect(await db.auditLog.count({ where: { entityId: s.id, action: "PR_APPROVE" } })).toBe(1);
  });

  it("un acheteur ne valide jamais, même sa DA; le Magasinier non plus", async () => {
    const s = await submitted(achAll);
    expect(await code(approveRequest(achAll, { id: s.id, expectedUpdatedAt: s.updatedAt }))).toBe("FORBIDDEN");
    expect(await code(approveRequest(mag, { id: s.id, expectedUpdatedAt: s.updatedAt }))).toBe("FORBIDDEN");
    expect((await reload(s.id)).status).toBe("SOUMISE");
  });

  it("le Responsable peut valider sa propre DA : événement marqué auto-validée", async () => {
    const s = await submitted(resp);
    const r = await approveRequest(resp, { id: s.id, expectedUpdatedAt: s.updatedAt });
    expect(r.autoApproved).toBe(true);
    const ev = await db.purchaseRequestEvent.findFirstOrThrow({ where: { requestId: s.id, type: "APPROVED" } });
    expect(ev.payload).toMatchObject({ autoApproved: true });
  });

  it("quantité réduite : approvedQty, événement QTY_CHANGED et audit avant/après, total recalculé", async () => {
    const s = await submitted(achLocal, {
      lines: [
        { itemId: itemA.id, quantity: 10, estimatedUnitPrice: 1000 },
        { itemId: itemB.id, quantity: 4, estimatedUnitPrice: 500 },
      ],
    });
    const pr = await reload(s.id);
    const r = await approveRequest(resp, {
      id: s.id,
      expectedUpdatedAt: s.updatedAt,
      lines: [{ lineId: pr.lines[0].id, approvedQty: 6 }],
    });
    expect(r.changedLines).toBe(1);
    const after = await reload(s.id);
    expect(after.lines[0].quantity.toString()).toBe("10");
    expect(after.lines[0].approvedQty?.toString()).toBe("6");
    expect(after.lines[1].approvedQty?.toString()).toBe("4");
    expect(after.estimatedTotal).toBe(6000 + 2000);
    const ev = await db.purchaseRequestEvent.findFirstOrThrow({ where: { requestId: s.id, type: "QTY_CHANGED" } });
    expect(ev.payload).toMatchObject({ lineNo: 1, before: "10", after: "6" });
    const audit = await db.auditLog.findFirstOrThrow({ where: { entityId: s.id, action: "PR_QTY_CHANGE" } });
    expect(audit.before).toMatchObject({ quantity: "10" });
    expect(audit.after).toMatchObject({ approvedQty: "6" });
  });

  it("quantité validée supérieure à la demande, ou toutes lignes à 0 : refusé", async () => {
    const s = await submitted(achLocal);
    const pr = await reload(s.id);
    const args = { id: s.id, expectedUpdatedAt: s.updatedAt };
    expect(await code(approveRequest(resp, { ...args, lines: [{ lineId: pr.lines[0].id, approvedQty: 6 }] }))).toBe("QTY_ABOVE_REQUEST");
    expect(await code(approveRequest(resp, { ...args, lines: [{ lineId: pr.lines[0].id, approvedQty: 0 }] }))).toBe("ALL_LINES_REMOVED");
    expect((await reload(s.id)).status).toBe("SOUMISE");
  });

  it("refus et annulation sans motif : VALIDATION", async () => {
    const s = await submitted(achLocal);
    const v = { id: s.id, expectedUpdatedAt: s.updatedAt };
    expect(await code(rejectRequest(resp, v))).toBe("VALIDATION");
    expect(await code(rejectRequest(resp, { ...v, reason: "non" }))).toBe("VALIDATION");
    expect(await code(cancelRequest(achLocal, v))).toBe("VALIDATION");
    expect(await code(returnForCompletion(resp, v))).toBe("VALIDATION");
    expect((await reload(s.id)).status).toBe("SOUMISE");
  });

  it("DA « À définir » : non validable sans type, validable avec", async () => {
    const s = await submitted(achAll, { type: "A_DEFINIR" });
    const args = { id: s.id, expectedUpdatedAt: s.updatedAt };
    expect(await code(approveRequest(resp, args))).toBe("TYPE_REQUIRED");
    const r = await approveRequest(resp, { ...args, type: "IMPORT" });
    expect([achImport.id, achAll.id]).toContain(r.assignedBuyer?.id);
    expect(r.assignedBuyer?.id).not.toBe(achLocal.id);
    expect((await reload(s.id)).type).toBe("IMPORT");
  });

  it("refus : statut final, motif conservé; une DA refusée ne se rouvre plus", async () => {
    const s = await submitted(achLocal);
    const r = await rejectRequest(resp, { id: s.id, expectedUpdatedAt: s.updatedAt, reason: "Budget épuisé ce mois" });
    expect(r.status).toBe("REFUSEE");
    expect((await reload(s.id)).rejectedReason).toBe("Budget épuisé ce mois");
    for (const fn of [
      () => approveRequest(resp, { id: s.id, expectedUpdatedAt: r.updatedAt }),
      () => cancelRequest(resp, { id: s.id, expectedUpdatedAt: r.updatedAt, reason: "Test annulation" }),
      () => submitRequest(achLocal, { id: s.id, expectedUpdatedAt: r.updatedAt }),
    ]) {
      expect(await code(fn())).toBe("INVALID_STATUS");
    }
  });

  it("annulation : créateur avant validation; après validation, Responsable seul avec motif", async () => {
    const s = await submitted(achLocal);
    const ok = await approveRequest(resp, { id: s.id, expectedUpdatedAt: s.updatedAt });
    expect(await code(cancelRequest(achLocal, { id: s.id, expectedUpdatedAt: ok.updatedAt, reason: "Plus nécessaire" }))).toBe("FORBIDDEN");
    const c = await cancelRequest(resp, { id: s.id, expectedUpdatedAt: ok.updatedAt, reason: "Plus nécessaire" });
    expect(c.status).toBe("ANNULEE");
    const pr = await reload(s.id);
    expect(pr.cancelledReason).toBe("Plus nécessaire");
    expect(pr.cancelledById).toBe(resp.id);

    const s2 = await submitted(achLocal);
    expect((await cancelRequest(achLocal, { id: s2.id, expectedUpdatedAt: s2.updatedAt, reason: "Erreur de saisie" })).status).toBe("ANNULEE");
  });

  it("chaque décision laisse exactement 1 journal d'audit et 1 événement", async () => {
    const check = async (id: string, audit: string, event: string) => {
      expect(await db.auditLog.count({ where: { entity: "PurchaseRequest", entityId: id, action: audit } }), audit).toBe(1);
      expect(await db.purchaseRequestEvent.count({ where: { requestId: id, type: event as never } }), event).toBe(1);
    };
    const a = await submitted(achLocal);
    await check(a.id, "PR_CREATE", "CREATED");
    await check(a.id, "PR_SUBMIT", "SUBMITTED");
    await approveRequest(resp, { id: a.id, expectedUpdatedAt: a.updatedAt });
    await check(a.id, "PR_APPROVE", "APPROVED");
    const b = await submitted(achLocal);
    await rejectRequest(resp, { id: b.id, expectedUpdatedAt: b.updatedAt, reason: "Refus de test" });
    await check(b.id, "PR_REJECT", "REJECTED");
    const c = await submitted(achLocal);
    await returnForCompletion(resp, { id: c.id, expectedUpdatedAt: c.updatedAt, comment: "À préciser svp" });
    await check(c.id, "PR_RETURN", "RETURNED");
    const d = await submitted(achLocal);
    await cancelRequest(achLocal, { id: d.id, expectedUpdatedAt: d.updatedAt, reason: "Annulation de test" });
    await check(d.id, "PR_CANCEL", "CANCELLED");
    await addComment(resp, { id: d.id, comment: "Merci" });
    await check(d.id, "PR_COMMENT", "COMMENT");
  });

  it("validation groupée : une DA en conflit n'empêche pas les autres", async () => {
    const a = await submitted(achLocal);
    const b = await submitted(achLocal);
    const c = await submitted(achAll, { type: "A_DEFINIR" });
    const res = await approveMany(resp, {
      items: [
        { id: a.id, expectedUpdatedAt: a.updatedAt },
        { id: b.id, expectedUpdatedAt: new Date(a.updatedAt.getTime() - 5000) },
        { id: c.id, expectedUpdatedAt: c.updatedAt },
      ],
    });
    expect(res.approved).toBe(1);
    expect(res.failed).toBe(2);
    expect(res.results.map((r) => r.code)).toEqual([undefined, "CONFLICT", "TYPE_REQUIRED"]);
    expect(res.results[2].message).toMatch(/Local ou Import/);
    expect((await reload(a.id)).status).toBe("VALIDEE");
    expect((await reload(b.id)).status).toBe("SOUMISE");
    expect(await code(approveMany(achLocal, { items: [{ id: a.id, expectedUpdatedAt: a.updatedAt }] }))).toBe("FORBIDDEN");
  });
});

describe("validation groupée : erreur technique", () => {
  it("une erreur inattendue sur une DA renvoie INTERNAL pour elle seule, sans fuite du détail", async () => {
    const a = await submitted(achLocal);
    const b = await submitted(achLocal);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const spy = vi.spyOn(db, "$transaction").mockRejectedValueOnce(new Error("connexion perdue SECRET"));
    const res = await approveMany(resp, {
      items: [
        { id: a.id, expectedUpdatedAt: a.updatedAt },
        { id: b.id, expectedUpdatedAt: b.updatedAt },
      ],
    });
    spy.mockRestore();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
    expect(res.results[0]).toMatchObject({ ok: false, code: "INTERNAL", message: "Erreur technique, réessayez" });
    expect(res.results[1].ok).toBe(true);
    expect(res.approved).toBe(1);
  });
});

describe("assignation (D7)", () => {
  it("DA locale -> acheteur local (jamais l'acheteur import); DA import -> acheteur import", async () => {
    const l = await submitted(achAll, { type: "LOCAL" });
    const i = await submitted(achAll, { type: "IMPORT" });
    const rl = await approveRequest(resp, { id: l.id, expectedUpdatedAt: l.updatedAt });
    const ri = await approveRequest(resp, { id: i.id, expectedUpdatedAt: i.updatedAt });
    expect([achLocal.id, achAll.id]).toContain(rl.assignedBuyer?.id);
    expect([achImport.id, achAll.id]).toContain(ri.assignedBuyer?.id);
    expect(rl.assignedBuyer?.id).not.toBe(achImport.id);
    expect(ri.assignedBuyer?.id).not.toBe(achLocal.id);
  });

  it("charge équilibrée : le 2e acheteur local reçoit la DA suivante", async () => {
    await db.user.update({ where: { id: achAll.id }, data: { active: false } });
    const extra = toActor(await createTestUser("da-loc2", { role: "ACHETEUR", purchaseScope: "LOCAL" }));
    const got: string[] = [];
    for (let i = 0; i < 4; i++) {
      const s = await submitted(resp);
      got.push((await approveRequest(resp, { id: s.id, expectedUpdatedAt: s.updatedAt })).assignedBuyer!.id);
    }
    expect(got.filter((g) => g === achLocal.id)).toHaveLength(2);
    expect(got.filter((g) => g === extra.id)).toHaveLength(2);
  });

  it("réassignation hors périmètre refusée, dans le périmètre acceptée et notifiée", async () => {
    const s = await submitted(achLocal);
    const ok = await approveRequest(resp, { id: s.id, expectedUpdatedAt: s.updatedAt, buyerId: achLocal.id });
    expect(await code(assignBuyer(resp, { id: s.id, expectedUpdatedAt: ok.updatedAt, buyerId: achImport.id }))).toBe("BUYER_OUT_OF_SCOPE");
    const r = await assignBuyer(resp, { id: s.id, expectedUpdatedAt: ok.updatedAt, buyerId: achAll.id });
    expect((await reload(s.id)).assignedBuyerId).toBe(achAll.id);
    expect(await db.notification.count({ where: { recipientId: achAll.id, entityId: s.id, type: "PR_ASSIGNED" } })).toBe(1);
    expect(await code(assignBuyer(achAll, { id: s.id, expectedUpdatedAt: r.updatedAt, buyerId: achAll.id }))).toBe("FORBIDDEN");
  });

  it("aucun acheteur compatible : DA validée non assignée et Responsable alerté", async () => {
    await db.user.updateMany({ where: { id: { in: [achLocal.id, achAll.id] } }, data: { active: false } });
    const s = await submitted(resp, { type: "LOCAL" });
    const r = await approveRequest(resp, { id: s.id, expectedUpdatedAt: s.updatedAt });
    expect(r.unassigned).toBe(true);
    expect((await reload(s.id)).assignedBuyerId).toBeNull();
    expect(await db.notification.count({ where: { recipientId: resp.id, type: "PR_UNASSIGNED", entityId: s.id } })).toBe(1);
  });
});

describe("doublons (D13)", () => {
  it("détecte une DA ouverte, ignore brouillons, refusées et annulées", async () => {
    const open = await submitted(achLocal);
    const refused = await submitted(achLocal);
    await rejectRequest(resp, { id: refused.id, expectedUpdatedAt: refused.updatedAt, reason: "Refus de test" });
    const cancelled = await submitted(achLocal);
    await cancelRequest(achLocal, { id: cancelled.id, expectedUpdatedAt: cancelled.updatedAt, reason: "Annulation de test" });
    await draft(achLocal);
    const list = await findOpenCommitments(db, [itemA.id]);
    expect(list.map((c) => c.number)).toEqual([open.number]);
    expect(list[0]).toMatchObject({ source: "DA", qty: "5", unit: "CARTON" });
    expect(await findOpenCommitments(db, [itemA.id], open.id)).toEqual([]);
    expect(await findOpenCommitments(db, [itemB.id])).toEqual([]);
  });

  it("la soumission et la validation renvoient l'avertissement (non bloquant)", async () => {
    const first = await submitted(achLocal);
    const second = await draft(achImport);
    const r = await submitRequest(achImport, { id: second.id, expectedUpdatedAt: second.updatedAt });
    expect(r.status).toBe("SOUMISE");
    expect(r.duplicates).toHaveLength(1);
    expect(r.duplicates[0].itemCode).toBe("IT-DA-A");
    expect(r.duplicates[0].messages[0]).toMatch(new RegExp(`^Déjà demandé : ${first.number}, 5 CARTON, besoin le \\d{2}/\\d{2}$`));
    const a = await approveRequest(resp, { id: r.id, expectedUpdatedAt: r.updatedAt, type: null });
    expect(a.duplicates).toHaveLength(1);
  });

  it("l'engagement suit la quantité validée; une ligne retirée (0) n'est plus un engagement", async () => {
    const s = await submitted(achLocal, {
      lines: [
        { itemId: itemA.id, quantity: 10 },
        { itemId: itemB.id, quantity: 4 },
      ],
    });
    const pr = await reload(s.id);
    await approveRequest(resp, {
      id: s.id,
      expectedUpdatedAt: s.updatedAt,
      lines: [
        { lineId: pr.lines[0].id, approvedQty: 3 },
        { lineId: pr.lines[1].id, approvedQty: 0 },
      ],
    });
    expect((await findOpenCommitments(db, [itemA.id]))[0].qty).toBe("3");
    expect(await findOpenCommitments(db, [itemB.id])).toEqual([]);
  });
});

describe("notifications (D17)", () => {
  const notifs = (userId: string, type?: string) => db.notification.findMany({ where: { recipientId: userId, ...(type ? { type } : {}) } });

  it("soumission : le Responsable est notifié, pas l'auteur", async () => {
    const s = await submitted(achLocal);
    const n = await notifs(resp.id, "PR_SUBMITTED");
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ severity: "INFO", link: `/achats/demandes/${s.id}`, readAt: null });
    expect(await notifs(achLocal.id)).toHaveLength(0);
  });

  it("arrêt de production : gravité CRITIQUE et date de besoin du jour par défaut", async () => {
    const d = await createRequest(achLocal, {
      departmentId: dept.id,
      requesterName: "Chef de ligne",
      reason: "Ligne mousse continue arrêtée – roulement 6308",
      urgency: "ARRET_PRODUCTION",
      type: "LOCAL",
      lines: [{ freeDesignation: "Roulement 6308 2RS", quantity: 2, unit: "U" }],
    });
    const pr = await reload(d.id);
    expect(pr.priority).toBe(0);
    expect(pr.neededBy.toISOString().slice(0, 10)).toBe(FUTURE_DAY(0));
    await submitRequest(achLocal, { id: d.id, expectedUpdatedAt: d.updatedAt });
    const n = await notifs(resp.id, "PR_SUBMITTED");
    expect(n[0]).toMatchObject({ severity: "CRITIQUE" });
    expect(n[0].title).toMatch(/^Arrêt de production : DA-/);
  });

  it("validation : acheteur assigné et créateur; refus et retour : créateur", async () => {
    const s = await submitted(achImport, { type: "LOCAL" });
    const a = await approveRequest(resp, { id: s.id, expectedUpdatedAt: s.updatedAt, buyerId: achLocal.id });
    expect(await notifs(achLocal.id, "PR_ASSIGNED")).toHaveLength(1);
    expect(await notifs(achImport.id, "PR_APPROVED")).toHaveLength(1);
    expect(a.assignedBuyer?.id).toBe(achLocal.id);

    const r = await submitted(achLocal);
    await rejectRequest(resp, { id: r.id, expectedUpdatedAt: r.updatedAt, reason: "Hors budget" });
    expect(await notifs(achLocal.id, "PR_REJECTED")).toHaveLength(1);

    const q = await submitted(achLocal);
    await returnForCompletion(resp, { id: q.id, expectedUpdatedAt: q.updatedAt, comment: "Ajoutez la référence" });
    const back = await notifs(achLocal.id, "PR_RETURNED");
    expect(back).toHaveLength(1);
    expect(back[0].body).toBe("Ajoutez la référence");
  });

  it("le Responsable qui valide sa propre DA ne s'auto-notifie pas du résultat", async () => {
    const s = await submitted(resp);
    await approveRequest(resp, { id: s.id, expectedUpdatedAt: s.updatedAt });
    expect(await notifs(resp.id, "PR_APPROVED")).toHaveLength(0);
  });
});

describe("Magasinier (DA de réapprovisionnement, H41)", () => {
  it("crée une DA REAPPRO sans prix; désignation libre et article non stocké refusés", async () => {
    const d = await createRequest(mag, { ...base(), type: "A_DEFINIR", lines: [{ itemId: itemA.id, quantity: 20, estimatedUnitPrice: 999 }] });
    const pr = await reload(d.id);
    expect(pr.kind).toBe("REAPPRO");
    expect(pr.estimatedTotal).toBeNull();
    expect(pr.lines[0].estimatedUnitPrice).toBeNull();
    expect(await code(createRequest(mag, { ...base(), lines: [{ freeDesignation: "Article nouveau", quantity: 1, unit: "U" }] }))).toBe("VALIDATION");
    expect(await code(createRequest(mag, { ...base(), lines: [{ itemId: itemService.id, quantity: 1 }] }))).toBe("ITEM_NOT_STOCKED");
  });

  it("ne valide pas; voit ses DA et les réappro, pas les DA des acheteurs; ne voit aucun prix", async () => {
    const m = await submitted(mag, { lines: [{ itemId: itemA.id, quantity: 2 }] });
    const std = await submitted(achLocal);
    expect(await code(approveRequest(mag, { id: m.id, expectedUpdatedAt: m.updatedAt }))).toBe("FORBIDDEN");
    expect(await code(getRequest(mag, std.id, { showPrices: false }))).toBe("FORBIDDEN");
    const mine = await getRequest(mag, m.id, { showPrices: false });
    expect(mine.estimatedTotal).toBeNull();
    expect(mine.lines.every((l) => l.estimatedUnitPrice === null && l.lineTotal === null)).toBe(true);
    const list = await listRequests(mag, { onglet: "toutes", taille: 100 }, { showPrices: false });
    const ids = list.rows.map((r) => r.id);
    expect(ids).toContain(m.id);
    expect(ids).not.toContain(std.id);
    // même un autre magasinier voit la DA de réappro (H48)
    const mag2 = toActor(await createTestUser("da-mag2", { role: "MAGASINIER" }));
    expect((await listRequests(mag2, { taille: 100 }, { showPrices: false })).rows.map((r) => r.id)).toContain(m.id);
  });

  it("prix absents de la fiche et de l'export quand showPrices est faux; présents pour un acheteur", async () => {
    const s = await submitted(achLocal);
    const hidden = await getRequest(resp, s.id, { showPrices: false });
    expect(hidden.lines[0].estimatedUnitPrice).toBeNull();
    expect(hidden.estimatedTotal).toBeNull();
    const shown = await getRequest(resp, s.id, { showPrices: true });
    expect(shown.lines[0].estimatedUnitPrice).toBe(1000);
    expect(shown.estimatedTotal).toBe(5000);
    const rows = await exportRequests(resp, {}, { showPrices: false });
    const mine = rows.filter((r) => r.number === s.number);
    expect(mine).toHaveLength(1);
    expect(mine[0].unitPrice).toBeNull();
    expect(mine[0].lineTotal).toBeNull();
    expect(mine[0].estimatedTotal).toBeNull();
    expect((await exportRequests(resp, {}, { showPrices: true })).find((r) => r.number === s.number)?.lineTotal).toBe(5000);
  });

  it("le Magasinier annule sa DA non validée", async () => {
    const m = await submitted(mag);
    const c = await cancelRequest(mag, { id: m.id, expectedUpdatedAt: m.updatedAt, reason: "Commande déjà passée" });
    expect(c.status).toBe("ANNULEE");
  });
});

describe("liste (D5, H48)", () => {
  it("arrêt de production en tête, puis urgente, puis normale par date de besoin; brouillons d'autrui masqués", async () => {
    const normal = await submitted(achLocal, { neededBy: FUTURE_DAY(5) });
    const normalTot = await submitted(achLocal, { neededBy: FUTURE_DAY(3) });
    const urgent = await submitted(achLocal, { urgency: "URGENTE", neededBy: FUTURE_DAY(30) });
    const stop = await submitted(achLocal, { urgency: "ARRET_PRODUCTION", reason: "Presse hydraulique arrêtée", neededBy: FUTURE_DAY(20) });
    const othersDraft = await draft(achImport);
    const myDraft = await draft(achLocal);

    const all = await listRequests(resp, { onglet: "toutes", taille: 100 }, { showPrices: true });
    const ids = all.rows.map((r) => r.id).filter((id) => [normal, normalTot, urgent, stop].some((x) => x.id === id));
    expect(ids).toEqual([stop.id, urgent.id, normalTot.id, normal.id]);
    expect(all.rows.map((r) => r.id)).not.toContain(othersDraft.id);

    // tri choisi : l'arrêt de production reste en tête
    const byNumber = await listRequests(resp, { tri: "number", ordre: "desc", taille: 100 }, { showPrices: true });
    expect(byNumber.rows[0].id).toBe(stop.id);

    const mine = await listRequests(achLocal, { onglet: "mes-demandes", taille: 100 }, { showPrices: true });
    expect(mine.rows.map((r) => r.id)).toContain(myDraft.id);
    const toValidate = await listRequests(resp, { onglet: "a-valider", taille: 100 }, { showPrices: true });
    expect(toValidate.rows.every((r) => r.status === "SOUMISE")).toBe(true);
    expect(toValidate.toValidate).toBe(toValidate.total);
  });

  it("onglet « assignées » et filtres statut / urgence / q", async () => {
    const s = await submitted(achImport, { type: "LOCAL", reason: "Courroie MOTIFUNIQUE" });
    await approveRequest(resp, { id: s.id, expectedUpdatedAt: s.updatedAt, buyerId: achLocal.id });
    const assigned = await listRequests(achLocal, { onglet: "assignees" }, { showPrices: true });
    expect(assigned.rows.map((r) => r.id)).toEqual([s.id]);
    expect((await listRequests(resp, { q: "motifunique" }, { showPrices: true })).total).toBe(1);
    expect((await listRequests(resp, { q: "IT-DA-A", statut: "VALIDEE" }, { showPrices: true })).total).toBe(1);
    expect((await listRequests(resp, { q: "motifunique", urgence: "URGENTE" }, { showPrices: true })).total).toBe(0);
  });
});

describe("statuts posés par les lots suivants (D1)", () => {
  it("consultation puis commande partielle puis totale; jamais de retour en arrière", async () => {
    const s = await submitted(achLocal, {
      lines: [
        { itemId: itemA.id, quantity: 10 },
        { itemId: itemB.id, quantity: 4 },
      ],
    });
    await approveRequest(resp, { id: s.id, expectedUpdatedAt: s.updatedAt });
    const pr = await reload(s.id);
    const [l1, l2] = pr.lines;
    await db.$transaction(async (tx) => {
      expect((await markInConsultation(tx, s.id, resp)).status).toBe("EN_CONSULTATION");
      expect((await markInConsultation(tx, s.id, resp)).status).toBe("EN_CONSULTATION"); // idempotent
    });
    await db.$transaction(async (tx) => {
      expect((await refreshOrderedStatus(tx, s.id, { [l1.id]: 10 }, resp)).status).toBe("PARTIELLEMENT_COMMANDEE");
    });
    await db.$transaction(async (tx) => {
      expect((await refreshOrderedStatus(tx, s.id, {}, resp)).status).toBe("PARTIELLEMENT_COMMANDEE"); // pas de régression
      expect((await refreshOrderedStatus(tx, s.id, { [l1.id]: 10, [l2.id]: "4" }, resp)).status).toBe("COMMANDEE");
    });
    expect(await db.auditLog.count({ where: { entityId: s.id, action: "PR_STATUS_SYNC" } })).toBe(3);
    expect(await db.purchaseRequestEvent.count({ where: { requestId: s.id, type: "STATUS_SYNC" } })).toBe(3);
    expect(await code(cancelRequest(resp, { id: s.id, expectedUpdatedAt: (await reload(s.id)).updatedAt, reason: "Trop tard" }))).toBe("INVALID_STATUS");
  });

  it("les lignes retirées (0) ne comptent pas pour « totalement commandée »", async () => {
    const s = await submitted(achLocal, {
      lines: [
        { itemId: itemA.id, quantity: 10 },
        { itemId: itemB.id, quantity: 4 },
      ],
    });
    const pr = await reload(s.id);
    await approveRequest(resp, {
      id: s.id,
      expectedUpdatedAt: s.updatedAt,
      lines: [{ lineId: pr.lines[1].id, approvedQty: 0 }],
    });
    await db.$transaction(async (tx) => {
      expect((await refreshOrderedStatus(tx, s.id, { [pr.lines[0].id]: 10 }, resp)).status).toBe("COMMANDEE");
    });
  });
});

describe("pièces jointes (D15)", () => {
  const pdf = (n = 100) => Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(n, 0x20)]);

  it("ajout, lecture, retrait : fichier hors public/, événements et audit", async () => {
    const s = await submitted(achLocal);
    const att = await addAttachment(achLocal, { requestId: s.id, fileName: "devis fournisseur.pdf", bytes: pdf() });
    expect(att.mimeType).toBe("application/pdf");
    const row = await db.purchaseRequestAttachment.findUniqueOrThrow({ where: { id: att.id } });
    expect(row.path).toMatch(/^[a-f0-9]{24}\.pdf$/);
    const read = await readAttachment(resp, s.id, att.id);
    expect(read.mime).toBe("application/pdf");
    expect(read.fileName).toBe("devis fournisseur.pdf");
    expect(read.bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(await db.purchaseRequestEvent.count({ where: { requestId: s.id, type: "ATTACHMENT_ADDED" } })).toBe(1);
    expect(await db.auditLog.count({ where: { entityId: s.id, action: "PR_ATTACHMENT_ADD" } })).toBe(1);
    expect((await getRequest(resp, s.id, { showPrices: true })).attachments).toHaveLength(1);

    await removeAttachment(achLocal, { requestId: s.id, attachmentId: att.id });
    expect(await code(readAttachment(resp, s.id, att.id))).toBe("NOT_FOUND");
    expect(await db.auditLog.count({ where: { entityId: s.id, action: "PR_ATTACHMENT_REMOVE" } })).toBe(1);
    expect((await getRequest(resp, s.id, { showPrices: true })).attachments).toHaveLength(0);
  });

  it(".exe renommé .pdf, fichier vide et fichier de plus de 5 Mo refusés", async () => {
    const s = await submitted(achLocal);
    const exe = Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00]), Buffer.alloc(200)]);
    expect(await code(addAttachment(achLocal, { requestId: s.id, fileName: "facture.pdf", bytes: exe }))).toBe("ATTACHMENT_INVALID");
    expect(await code(addAttachment(achLocal, { requestId: s.id, fileName: "vide.pdf", bytes: Buffer.alloc(0) }))).toBe("ATTACHMENT_INVALID");
    expect(await code(addAttachment(achLocal, { requestId: s.id, fileName: "gros.pdf", bytes: pdf(5 * 1024 * 1024) }))).toBe("ATTACHMENT_TOO_LARGE");
    expect(await db.purchaseRequestAttachment.count({ where: { requestId: s.id } })).toBe(0);
  });

  it("5 pièces maximum, y compris en parallèle", async () => {
    const s = await submitted(achLocal);
    const results = await Promise.all(
      Array.from({ length: 7 }, (_, i) => code(addAttachment(achLocal, { requestId: s.id, fileName: `p${i}.pdf`, bytes: pdf(10 + i) }))),
    );
    expect(results.filter((r) => r === "OK")).toHaveLength(5);
    expect(results.filter((r) => r === "ATTACHMENT_LIMIT")).toHaveLength(2);
  });

  it("lecture refusée sans droit sur la DA; ajout réservé au créateur ou au Responsable et avant décision", async () => {
    const s = await submitted(achLocal);
    const att = await addAttachment(achLocal, { requestId: s.id, fileName: "a.pdf", bytes: pdf() });
    expect(await code(readAttachment(mag, s.id, att.id))).toBe("FORBIDDEN");
    expect(await code(readAttachment(achImport, s.id, att.id))).toBe("OK");
    expect(await code(addAttachment(achImport, { requestId: s.id, fileName: "b.pdf", bytes: pdf() }))).toBe("FORBIDDEN");
    expect(await code(readAttachment(resp, s.id, "inconnu"))).toBe("NOT_FOUND");
    await approveRequest(resp, { id: s.id, expectedUpdatedAt: s.updatedAt });
    expect(await code(addAttachment(achLocal, { requestId: s.id, fileName: "c.pdf", bytes: pdf() }))).toBe("INVALID_STATUS");
  });
});

describe("seuil de validation (D12)", () => {
  it("le seuil est stocké sans bloquer la validation; la fiche signale le dépassement", async () => {
    const { updateSetting } = await import("@/modules/settings");
    await updateSetting(resp, { key: "purchaseRequest.approvalThreshold", value: 1000 });
    const s = await submitted(achLocal); // total 5 000
    const detail = await getRequest(resp, s.id, { showPrices: true });
    expect(detail.approvalThreshold).toBe(1000);
    expect(detail.exceedsThreshold).toBe(true);
    expect((await getRequest(resp, s.id, { showPrices: false })).exceedsThreshold).toBe(false);
    expect((await approveRequest(resp, { id: s.id, expectedUpdatedAt: s.updatedAt })).status).toBe("VALIDEE");
    expect(await code(updateSetting(resp, { key: "purchaseRequest.approvalThreshold", value: -5 }))).not.toBe("OK");
  });
});
