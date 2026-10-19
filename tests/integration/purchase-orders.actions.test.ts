import ExcelJS from "exceljs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { cleanTestUsers, createTestUser } from "../helpers/db";
import { cleanReferentials, ensureCurrencies } from "../helpers/referentials";
import { FUTURE_DAY, cleanPurchaseRequests, parkSeedBuyers } from "../helpers/purchase-requests";

const session: { current: { user: { id: string; sessionVersion: number } } | null } = { current: null };
vi.mock("@/lib/auth", () => ({ auth: async () => session.current }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/modules/auth/ip", () => ({ getClientIp: async () => "127.0.0.1" }));

const po = await import("@/app/(app)/achats/commandes/actions");
const da = await import("@/app/(app)/achats/demandes/actions");
const settingsActions = await import("@/app/(app)/parametres/reglages/actions");
const exportRoute = await import("@/app/api/export/[entity]/route");
const pdfRoute = await import("@/app/api/purchase-orders/[id]/pdf/route");
const logoRoute = await import("@/app/api/branding/logo/route");

type RoleName = "RESPONSABLE_ACHATS" | "ACHETEUR" | "MAGASINIER" | "SUPER_ADMIN";

async function login(key: string, role: RoleName, scope: "LOCAL" | "IMPORT" | "ALL" | null = role === "ACHETEUR" ? "ALL" : null) {
  const u = await createTestUser(key, { role, purchaseScope: scope });
  session.current = { user: { id: u.id, sessionVersion: u.sessionVersion } };
  return u;
}
const asUser = (u: { id: string; sessionVersion: number }) => {
  session.current = { user: { id: u.id, sessionVersion: u.sessionVersion } };
};

async function setLicense(status: "TRIAL" | "EXPIRED") {
  await db.license.deleteMany();
  const now = Date.now();
  await db.license.create({ data: { status, trialStartsAt: new Date(now - 60 * 86_400_000), trialEndsAt: new Date(now + (status === "EXPIRED" ? -1 : 10) * 86_400_000) } });
}

function data<T>(r: { ok: boolean; data?: T }): T {
  if (!r.ok) throw new Error(`Action en échec : ${JSON.stringify(r)}`);
  return r.data as T;
}

let dept: { id: string };
let wh: { id: string };
let item: { id: string };
let sup: { id: string };
let restoreBuyers: () => Promise<void>;
let savedLicenses: Awaited<ReturnType<typeof db.license.findMany>> = [];

async function wipe() {
  const { cleanPurchaseOrders } = await import("../helpers/purchase-orders");
  await cleanPurchaseOrders();
  await cleanPurchaseRequests();
  await cleanReferentials();
  await cleanTestUsers();
}

beforeAll(async () => {
  restoreBuyers = await parkSeedBuyers();
  savedLicenses = await db.license.findMany();
});

beforeEach(async () => {
  await wipe();
  session.current = null;
  await setLicense("TRIAL");
  await ensureCurrencies();
  dept = await db.department.create({ data: { code: "IT-POA", name: "Service BC actions" } });
  wh = await db.warehouse.create({ data: { code: "IT-POA-WH", name: "Dépôt actions", address: "Zone industrielle, Abidjan" } });
  item = await db.item.create({ data: { code: "IT-POA-1", name: "Courroie BC actions", category: "PDR", stockUnit: "U", purchaseUnit: "U" } });
  sup = await db.supplier.create({ data: { code: "IT-POA-S", name: "Fournisseur actions", type: "LOCAL", currencyCode: "XOF" } });
});

afterAll(async () => {
  await wipe();
  await restoreBuyers();
  await db.license.deleteMany();
  if (savedLicenses.length) await db.license.createMany({ data: savedLicenses });
  await db.$disconnect();
});

/** DA validée assignée à l'acheteur, via les actions des DA. Retourne l'identifiant de la ligne. */
async function validatedDa(ach: { id: string; sessionVersion: number }, resp: { id: string; sessionVersion: number }) {
  asUser(ach);
  const c = data(
    await da.createRequestAction({
      departmentId: dept.id,
      requesterName: "Awa Koné",
      reason: "Besoin de test BC actions",
      neededBy: FUTURE_DAY(10),
      type: "LOCAL",
      lines: [{ itemId: item.id, quantity: 20, estimatedUnitPrice: 2000 }],
    }),
  );
  const s = data(await da.submitRequestAction({ id: c.id, expectedUpdatedAt: c.updatedAt }));
  asUser(resp);
  data(await da.approveRequestAction({ id: c.id, expectedUpdatedAt: s.updatedAt, buyerId: ach.id }));
  const line = await db.purchaseRequestLine.findFirstOrThrow({ where: { requestId: c.id } });
  return { id: c.id, lineId: line.id };
}

const orderInput = (lineId: string, over: Record<string, unknown> = {}) => ({
  supplierId: sup.id,
  warehouseId: wh.id,
  requestedDate: FUTURE_DAY(15),
  lines: [{ itemId: item.id, quantity: 10, unitPrice: 5000, allocations: [{ requestLineId: lineId, qty: 10 }] }],
  ...over,
});

async function setup() {
  const resp = await createTestUser("poa-resp", { role: "RESPONSABLE_ACHATS" });
  const ach = await createTestUser("poa-ach", { role: "ACHETEUR", purchaseScope: "ALL" });
  const d = await validatedDa(ach, resp);
  return { resp, ach, ...d };
}

describe("droits des actions", () => {
  it("sans session : UNAUTHENTICATED", async () => {
    expect(await po.listOrdersAction({})).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
    expect(await po.createOrderAction({})).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
  });

  it("Magasinier : lecture et écriture FORBIDDEN sur tous les BC", async () => {
    await login("poa-mag", "MAGASINIER");
    const v = { id: "x", expectedUpdatedAt: new Date().toISOString() };
    expect(await po.listOrdersAction({})).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await po.getOrderAction({ id: "x" })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await po.listOrderableLinesAction({})).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await po.checkOrderDuplicatesAction({ itemIds: [] })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await po.reminderTextAction({ id: "x" })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await po.createOrderAction({})).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await po.submitOrderAction(v)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await po.approveOrderAction(v)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await po.markSentAction({ ...v, channel: "EMAIL" })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await po.remindSupplierAction({ ...v, channel: "EMAIL" })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await po.cancelOrderAction({ ...v, reason: "Annulation de test" })).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("Super-admin : lecture oui, écriture FORBIDDEN ; Acheteur : validation FORBIDDEN", async () => {
    await login("poa-sa", "SUPER_ADMIN");
    expect((await po.listOrdersAction({})).ok).toBe(true);
    expect(await po.createOrderAction({})).toMatchObject({ ok: false, code: "FORBIDDEN" });
    await login("poa-ach2", "ACHETEUR");
    const v = { id: "x", expectedUpdatedAt: new Date().toISOString() };
    expect(await po.approveOrderAction(v)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await po.rejectOrderAction({ ...v, reason: "Motif de refus" })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await po.closeOrderAction(v)).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("entrée invalide : VALIDATION avec message français", async () => {
    await login("poa-ach3", "ACHETEUR");
    const r = await po.createOrderAction({ supplierId: sup.id, warehouseId: wh.id, requestedDate: "demain" });
    expect(r).toMatchObject({ ok: false, code: "VALIDATION" });
    expect((r as { message: string }).message).toMatch(/Date invalide/);
  });
});

describe("flux complet par les actions", () => {
  it("créer, soumettre, valider, envoyer, confirmer ; notifications ; DA « Commandée » ; texte de relance", async () => {
    const { resp, ach, id: daId, lineId } = await setup();
    asUser(ach);
    const lines = data(await po.listOrderableLinesAction({}));
    expect(lines.groups.flatMap((g: { lines: { requestLineId: string }[] }) => g.lines).map((l: { requestLineId: string }) => l.requestLineId)).toContain(lineId);

    const created = data(await po.createOrderAction(orderInput(lineId, { lines: [{ itemId: item.id, quantity: 20, unitPrice: 5000, allocations: [{ requestLineId: lineId, qty: 20 }] }] })));
    expect(created.displayNumber).toMatch(/^BC-BROUILLON-/);
    const sub = data(await po.submitOrderAction({ id: created.id, expectedUpdatedAt: created.updatedAt }));
    expect(sub.status).toBe("A_VALIDER");

    asUser(resp);
    expect(data(await po.listOrdersAction({ onglet: "a-valider" })).rows.map((r: { id: string }) => r.id)).toContain(created.id);
    const detail = data(await po.getOrderAction({ id: created.id }));
    expect(detail.actions).toEqual(expect.arrayContaining(["approve", "reject", "return", "cancel", "pdf"]));
    const approved = data(await po.approveOrderAction({ id: created.id, expectedUpdatedAt: sub.updatedAt }));
    expect(approved.number).toMatch(/^BC-\d{4}-\d{5}$/);
    expect((await db.purchaseRequest.findUniqueOrThrow({ where: { id: daId } })).status).toBe("COMMANDEE");

    asUser(ach);
    const notes = await db.notification.findMany({ where: { recipientId: ach.id, type: "PO_APPROVED" } });
    expect(notes).toHaveLength(1);
    expect(notes[0].link).toBe(`/achats/commandes/${created.id}`);
    const sent = data(await po.markSentAction({ id: created.id, expectedUpdatedAt: approved.updatedAt, channel: "WHATSAPP", contact: "M. Koffi" }));
    const conf = data(await po.confirmOrderAction({ id: created.id, expectedUpdatedAt: sent.updatedAt, promisedDate: FUTURE_DAY(20) }));
    expect(conf.status).toBe("CONFIRME");

    const text = data(await po.reminderTextAction({ id: created.id }));
    expect(text.text).toContain(approved.number);
    expect(text.text).toContain("Courroie BC actions");
    expect(text.subject).toContain(approved.number);
  });

  it("conflit de version : CONFLICT ; fournisseur bloqué : SUPPLIER_BLOCKED", async () => {
    const { ach, lineId } = await setup();
    asUser(ach);
    const created = data(await po.createOrderAction(orderInput(lineId)));
    const stale = new Date(new Date(created.updatedAt).getTime() - 10_000).toISOString();
    expect(await po.submitOrderAction({ id: created.id, expectedUpdatedAt: stale })).toMatchObject({ ok: false, code: "CONFLICT" });
    await db.supplier.update({ where: { id: sup.id }, data: { status: "BLOQUE" } });
    expect(await po.createOrderAction(orderInput(lineId))).toMatchObject({ ok: false, code: "SUPPLIER_BLOCKED" });
  });

  it("contrôles d'aide à la saisie : doublons et contrôle de prix", async () => {
    const { ach, resp, lineId } = await setup();
    asUser(ach);
    const created = data(await po.createOrderAction(orderInput(lineId)));
    const sub = data(await po.submitOrderAction({ id: created.id, expectedUpdatedAt: created.updatedAt }));
    asUser(resp);
    data(await po.approveOrderAction({ id: created.id, expectedUpdatedAt: sub.updatedAt }));
    await db.itemPriceHistory.deleteMany({ where: { itemId: item.id } });
    await db.itemPriceHistory.create({ data: { itemId: item.id, supplierId: sup.id, price: 4000, currencyCode: "XOF", priceUnit: "U", source: "MANUEL", date: new Date(Date.now() - 86_400_000) } });
    const dup = data(await po.checkOrderDuplicatesAction({ itemIds: [item.id] }));
    expect(dup).toHaveLength(1);
    expect(dup[0].message).toMatch(/^Déjà commandé : BC-\d{4}-\d{5}, 10 U attendues le \d{2}\/\d{2}$/);
    expect(JSON.stringify(dup)).not.toContain("5000");
    const pc = data(await po.priceCheckAction({ currencyCode: "XOF", lines: [{ itemId: item.id, unitPrice: 5200 }] }));
    expect(pc[0]).toMatchObject({ alert: true, lastPriceXof: 4000, deltaPct: "30" });
    expect(pc[0].message).toContain("+30 % vs dernier prix");
  });
});

describe("essai expiré (LOT-02)", () => {
  async function prepare() {
    const { ach, resp, lineId, id: daId } = await setup();
    asUser(ach);
    const sentOrder = data(await po.createOrderAction(orderInput(lineId, { lines: [{ itemId: item.id, quantity: 10, unitPrice: 5000, allocations: [{ requestLineId: lineId, qty: 10 }] }] })));
    const sub = data(await po.submitOrderAction({ id: sentOrder.id, expectedUpdatedAt: sentOrder.updatedAt }));
    asUser(resp);
    const ok = data(await po.approveOrderAction({ id: sentOrder.id, expectedUpdatedAt: sub.updatedAt }));
    asUser(ach);
    const sent = data(await po.markSentAction({ id: sentOrder.id, expectedUpdatedAt: ok.updatedAt, channel: "EMAIL" }));
    const draft = data(await po.createOrderAction(orderInput(lineId, { lines: [{ itemId: item.id, quantity: 5, unitPrice: 5000, allocations: [{ requestLineId: lineId, qty: 5 }] }] })));
    await setLicense("EXPIRED");
    return { ach, resp, sent, draft, daId, lineId };
  }

  it("création, soumission, validation, envoi, relance : LICENSE_READ_ONLY", async () => {
    const { resp, sent, draft, lineId } = await prepare();
    expect(await po.createOrderAction(orderInput(lineId))).toMatchObject({ ok: false, code: "LICENSE_READ_ONLY" });
    expect(await po.submitOrderAction({ id: draft.id, expectedUpdatedAt: draft.updatedAt })).toMatchObject({ ok: false, code: "LICENSE_READ_ONLY" });
    expect(await po.markSentAction({ id: sent.id, expectedUpdatedAt: sent.updatedAt, channel: "EMAIL" })).toMatchObject({ ok: false, code: "LICENSE_READ_ONLY" });
    expect(await po.remindSupplierAction({ id: sent.id, expectedUpdatedAt: sent.updatedAt, channel: "EMAIL" })).toMatchObject({ ok: false, code: "LICENSE_READ_ONLY" });
    expect(await po.addOrderCommentAction({ id: sent.id, comment: "Test" })).toMatchObject({ ok: false, code: "LICENSE_READ_ONLY" });
    asUser(resp);
    expect(await po.approveOrderAction({ id: draft.id, expectedUpdatedAt: draft.updatedAt })).toMatchObject({ ok: false, code: "LICENSE_READ_ONLY" });
    expect(await po.cancelOrderAction({ id: sent.id, expectedUpdatedAt: sent.updatedAt, reason: "Annulation de test" })).toMatchObject({ ok: false, code: "LICENSE_READ_ONLY" });
    expect((await db.purchaseOrder.findUniqueOrThrow({ where: { id: sent.id } })).status).toBe("ENVOYE");
  });

  it("liste, fiche, PDF, export et texte de relance restent accessibles", async () => {
    const { resp, sent } = await prepare();
    asUser(resp);
    expect(data(await po.listOrdersAction({})).total).toBeGreaterThanOrEqual(1);
    expect(data(await po.getOrderAction({ id: sent.id })).id).toBe(sent.id);
    expect((await po.reminderTextAction({ id: sent.id })).ok).toBe(true);
    const res = await pdfRoute.GET(new NextRequest(`http://localhost/api/purchase-orders/${sent.id}/pdf`), { params: Promise.resolve({ id: sent.id }) });
    expect(res.status).toBe(200);
    const exp = await exportRoute.GET(new NextRequest("http://localhost/api/export/commandes"), { params: Promise.resolve({ entity: "commandes" }) });
    expect(exp.status).toBe(200);
    expect((await settingsActions.getSettingsAction({})).ok).toBe(true);
  });
});

describe("route PDF et export", () => {
  const pdf = (id: string, qs = "") => pdfRoute.GET(new NextRequest(`http://localhost/api/purchase-orders/${id}/pdf${qs}`), { params: Promise.resolve({ id }) });

  it("401 sans session, 403 pour le Magasinier, 404 inconnu ; PDF avec en-têtes sûrs et nom de fichier versionné", async () => {
    const { resp, ach, lineId } = await setup();
    asUser(ach);
    const c = data(await po.createOrderAction(orderInput(lineId)));
    const s = data(await po.submitOrderAction({ id: c.id, expectedUpdatedAt: c.updatedAt }));
    asUser(resp);
    const ok = data(await po.approveOrderAction({ id: c.id, expectedUpdatedAt: s.updatedAt }));

    session.current = null;
    expect((await pdf(c.id)).status).toBe(401);
    await login("poa-pdf-mag", "MAGASINIER");
    expect((await pdf(c.id)).status).toBe(403);
    asUser(resp);
    expect((await pdf("inconnu")).status).toBe(404);
    expect((await pdf(c.id, "?v=9")).status).toBe(404);
    expect((await pdf(c.id, "?v=abc")).status).toBe(400);
    const res = await pdf(c.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-disposition")).toBe(`inline; filename="${ok.number}-v1.pdf"`);
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
    expect((await pdf(c.id, "?v=1")).status).toBe(200);
  });

  it("brouillon d'autrui : PDF 403 ; aperçu du créateur filigrané", async () => {
    const { resp, ach, lineId } = await setup();
    asUser(ach);
    const c = data(await po.createOrderAction(orderInput(lineId)));
    const res = await pdf(c.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/apercu\.pdf/);
    asUser(resp);
    expect((await pdf(c.id)).status).toBe(403);
  });

  it("export /api/export/commandes : 401, 403 Magasinier, classeur avec lignes de BC", async () => {
    const { resp, ach, lineId } = await setup();
    const call = (qs = "") => exportRoute.GET(new NextRequest(`http://localhost/api/export/commandes${qs}`), { params: Promise.resolve({ entity: "commandes" }) });
    session.current = null;
    expect((await call()).status).toBe(401);
    asUser(ach);
    const c = data(await po.createOrderAction(orderInput(lineId)));
    const s = data(await po.submitOrderAction({ id: c.id, expectedUpdatedAt: c.updatedAt }));
    asUser(resp);
    data(await po.approveOrderAction({ id: c.id, expectedUpdatedAt: s.updatedAt }));
    const res = await call("?onglet=en-cours");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/commandes_\d{8}\.xlsx/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as never);
    const rows: string[][] = [];
    wb.worksheets[0].eachRow((row) => rows.push((row.values as unknown[]).slice(1).map((v) => (v == null ? "" : String(v)))));
    expect(rows[0].join("|")).toMatch(/N° BC.*Fournisseur.*Quantité commandée/);
    expect(rows).toHaveLength(2);
    expect(rows[1].join("|")).toContain("IT-POA-1");
    await login("poa-exp-mag", "MAGASINIER");
    expect((await call()).status).toBe(403);
    expect((await call("?onglet=inconnu")).status).toBe(403); // le droit est contrôlé avant les filtres
    asUser(resp);
    expect((await call("?onglet=inconnu")).status).toBe(400);
  });
});

describe("logo de la société (D29)", () => {
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

  it("Responsable : envoi PNG puis lecture par la route (session) ; format et taille contrôlés ; journal", async () => {
    await login("poa-logo-resp", "RESPONSABLE_ACHATS");
    const bad = new FormData();
    bad.set("file", new File([Buffer.from("GIF89a....")], "logo.png", { type: "image/png" }));
    expect(await settingsActions.uploadLogoAction(bad)).toMatchObject({ ok: false, code: "LOGO_INVALID" });
    const big = new FormData();
    big.set("file", new File([Buffer.concat([png, Buffer.alloc(1024 * 1024 + 1)])], "logo.png", { type: "image/png" }));
    expect(await settingsActions.uploadLogoAction(big)).toMatchObject({ ok: false, code: "LOGO_TOO_LARGE" });
    const good = new FormData();
    good.set("file", new File([png], "../../evil.png", { type: "image/png" }));
    expect(data(await settingsActions.uploadLogoAction(good)).ext).toBe("png");
    const res = await logoRoute.GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(await db.auditLog.count({ where: { action: "SETTINGS_LOGO" } })).toBeGreaterThanOrEqual(1);
    await db.auditLog.deleteMany({ where: { action: "SETTINGS_LOGO" } });
    session.current = null;
    expect((await logoRoute.GET()).status).toBe(401);
    await login("poa-logo-ach", "ACHETEUR");
    expect(await settingsActions.uploadLogoAction(good)).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });
});
