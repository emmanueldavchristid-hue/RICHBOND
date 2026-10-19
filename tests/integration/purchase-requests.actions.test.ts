import ExcelJS from "exceljs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { cleanTestUsers, createTestUser } from "../helpers/db";
import { cleanReferentials } from "../helpers/referentials";
import { FUTURE_DAY, cleanPurchaseRequests, parkSeedBuyers } from "../helpers/purchase-requests";

const session: { current: { user: { id: string; sessionVersion: number } } | null } = { current: null };
vi.mock("@/lib/auth", () => ({ auth: async () => session.current }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/modules/auth/ip", () => ({ getClientIp: async () => "127.0.0.1" }));

const da = await import("@/app/(app)/achats/demandes/actions");
const nt = await import("@/app/(app)/notifications/actions");
const exportRoute = await import("@/app/api/export/[entity]/route");
const attRoute = await import("@/app/api/purchase-requests/[id]/attachments/[attId]/route");

type RoleName = "RESPONSABLE_ACHATS" | "ACHETEUR" | "MAGASINIER" | "SUPER_ADMIN";

async function login(key: string, role: RoleName) {
  const u = await createTestUser(key, { role, purchaseScope: role === "ACHETEUR" ? "ALL" : null });
  session.current = { user: { id: u.id, sessionVersion: u.sessionVersion } };
  return u;
}
const asUser = (u: { id: string; sessionVersion: number }) => {
  session.current = { user: { id: u.id, sessionVersion: u.sessionVersion } };
};

async function setLicense(status: "TRIAL" | "EXPIRED") {
  await db.license.deleteMany();
  const now = Date.now();
  await db.license.create({
    data: { status, trialStartsAt: new Date(now - 60 * 86_400_000), trialEndsAt: new Date(now + (status === "EXPIRED" ? -1 : 10) * 86_400_000) },
  });
}

let dept: { id: string };
let item: { id: string };
let restoreBuyers: () => Promise<void>;
let savedLicenses: Awaited<ReturnType<typeof db.license.findMany>> = [];

const input = () => ({
  departmentId: dept.id,
  requesterName: "Awa Koné",
  reason: "Remplacement courroie usée",
  neededBy: FUTURE_DAY(),
  type: "LOCAL",
  lines: [{ itemId: item.id, quantity: 3, estimatedUnitPrice: 2000 }],
});

function data<T>(r: { ok: boolean; data?: T }): T {
  if (!r.ok) throw new Error(`Action en échec : ${JSON.stringify(r)}`);
  return r.data as T;
}

beforeAll(async () => {
  restoreBuyers = await parkSeedBuyers();
  savedLicenses = await db.license.findMany();
});

beforeEach(async () => {
  await cleanPurchaseRequests();
  await cleanReferentials();
  await cleanTestUsers();
  session.current = null;
  await setLicense("TRIAL");
  dept = await db.department.create({ data: { code: "IT-DAA", name: "Service actions" } });
  item = await db.item.create({ data: { code: "IT-DAA-1", name: "Courroie action", category: "PDR", stockUnit: "U", purchaseUnit: "U" } });
});

afterAll(async () => {
  await cleanPurchaseRequests();
  await cleanReferentials();
  await cleanTestUsers();
  await restoreBuyers();
  await db.license.deleteMany();
  if (savedLicenses.length) await db.license.createMany({ data: savedLicenses });
  await db.$disconnect();
});

describe("droits des actions", () => {
  it("sans session : UNAUTHENTICATED", async () => {
    expect(await da.createRequestAction(input())).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
    expect(await da.listRequestsAction({})).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
  });

  it("Super-admin : lecture oui, écriture FORBIDDEN", async () => {
    await login("daa-sa", "SUPER_ADMIN");
    expect((await da.listRequestsAction({})).ok).toBe(true);
    expect(await da.createRequestAction(input())).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("Magasinier : validation, refus, assignation FORBIDDEN; création REAPPRO OK", async () => {
    await login("daa-mag", "MAGASINIER");
    const v = { id: "x", expectedUpdatedAt: new Date().toISOString() };
    expect(await da.approveRequestAction(v)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await da.approveManyAction({ items: [v] })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await da.rejectRequestAction({ ...v, reason: "Motif de refus" })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await da.assignBuyerAction({ ...v, buyerId: "y" })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await da.listCriticalPendingAction({})).toMatchObject({ ok: false, code: "FORBIDDEN" });
    const created = data(await da.createRequestAction(input()));
    expect(created.displayNumber).toMatch(/^BROUILLON-/);
    expect((await db.purchaseRequest.findUniqueOrThrow({ where: { id: created.id } })).kind).toBe("REAPPRO");
  });

  it("entrée invalide : VALIDATION avec message français", async () => {
    await login("daa-ach", "ACHETEUR");
    const r = await da.createRequestAction({ ...input(), reason: "x" });
    expect(r).toMatchObject({ ok: false, code: "VALIDATION" });
    expect((r as { message: string }).message).toMatch(/motif/i);
  });
});

describe("flux complet par les actions", () => {
  it("créer, soumettre, valider avec quantité réduite; notification puis marquer lue", async () => {
    const ach = await login("daa-flow-ach", "ACHETEUR");
    const resp = await createTestUser("daa-flow-resp", { role: "RESPONSABLE_ACHATS" });
    const created = data(await da.createRequestAction(input()));
    const sub = data(await da.submitRequestAction({ id: created.id, expectedUpdatedAt: created.updatedAt }));
    expect(sub.number).toMatch(/^DA-\d{4}-\d{5}$/);

    asUser(resp);
    const list = data(await da.listRequestsAction({ onglet: "a-valider" }));
    expect(list.rows.map((r: { id: string }) => r.id)).toContain(created.id);
    const detail = data(await da.getRequestAction({ id: created.id }));
    expect(detail.actions).toEqual(expect.arrayContaining(["approve", "reject", "return", "cancel"]));
    const unread = data(await nt.getNotificationsAction({}));
    expect(unread.unread).toBeGreaterThanOrEqual(1);
    expect(unread.items[0].link).toBe(`/achats/demandes/${created.id}`);

    const ok = data(
      await da.approveRequestAction({
        id: created.id,
        expectedUpdatedAt: sub.updatedAt,
        lines: [{ lineId: detail.lines[0].id, approvedQty: 2 }],
        buyerId: ach.id,
      }),
    );
    expect(ok.assignedBuyer?.id).toBe(ach.id);

    // la notification de l'acheteur se marque lue (même mécanique, aucune écriture métier)
    asUser(ach);
    const mine = data(await nt.getNotificationsAction({}));
    const assigned = mine.items.find((n: { type: string }) => n.type === "PR_ASSIGNED");
    expect(assigned).toBeTruthy();
    expect(data(await nt.markNotificationReadAction({ id: assigned!.id })).updated).toBe(1);
    expect(data(await nt.markAllNotificationsReadAction({})).updated).toBe(0);
    expect(data(await nt.getNotificationsAction({})).unread).toBe(0);
    // on ne marque pas la notification d'un autre
    asUser(resp);
    const other = (await db.notification.findFirstOrThrow({ where: { recipientId: ach.id } })).id;
    expect(data(await nt.markNotificationReadAction({ id: other })).updated).toBe(0);
  });

  it("conflit de version : CONFLICT", async () => {
    await login("daa-c-ach", "ACHETEUR");
    const created = data(await da.createRequestAction(input()));
    const stale = new Date(new Date(created.updatedAt).getTime() - 10_000).toISOString();
    expect(await da.submitRequestAction({ id: created.id, expectedUpdatedAt: stale })).toMatchObject({ ok: false, code: "CONFLICT" });
  });

  it("doublon : l'action de contrôle renvoie le message exact", async () => {
    await login("daa-d-ach", "ACHETEUR");
    const c1 = data(await da.createRequestAction(input()));
    const s1 = data(await da.submitRequestAction({ id: c1.id, expectedUpdatedAt: c1.updatedAt }));
    const warnings = data(await da.checkDuplicatesAction({ itemIds: [item.id] }));
    expect(warnings).toHaveLength(1);
    expect(warnings[0].messages[0]).toMatch(new RegExp(`^Déjà demandé : ${s1.number}, 3 U, besoin le \\d{2}/\\d{2}$`));
    expect(data(await da.checkDuplicatesAction({ itemIds: [item.id], excludeId: c1.id }))).toEqual([]);
  });

  it("pièce jointe par FormData; lecture par la route (session + droit)", async () => {
    const ach = await login("daa-p-ach", "ACHETEUR");
    const created = data(await da.createRequestAction(input()));
    const fd = new FormData();
    fd.set("requestId", created.id);
    fd.set("file", new File([Buffer.from("%PDF-1.4 test")], "devis.pdf", { type: "application/pdf" }));
    const att = data(await da.addAttachmentAction(fd));
    const call = (id: string, attId: string) =>
      attRoute.GET(new NextRequest(`http://localhost/api/purchase-requests/${id}/attachments/${attId}`), {
        params: Promise.resolve({ id, attId }),
      });
    const res = await call(created.id, att.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toContain("%PDF-");
    // sans droit sur la DA
    await login("daa-p-mag", "MAGASINIER");
    expect((await call(created.id, att.id)).status).toBe(403);
    session.current = null;
    expect((await call(created.id, att.id)).status).toBe(401);
    // non-PDF refusé
    asUser(ach);
    const bad = new FormData();
    bad.set("requestId", created.id);
    bad.set("file", new File([Buffer.from("MZ....")], "malware.pdf", { type: "application/pdf" }));
    expect(await da.addAttachmentAction(bad)).toMatchObject({ ok: false, code: "ATTACHMENT_INVALID" });
  });
});

describe("brouillon d'autrui et doublons (relecture LOT-04)", () => {
  it("fiche, pièce jointe et commentaire sur un brouillon d'autrui : FORBIDDEN", async () => {
    const ach = await login("daa-b-ach", "ACHETEUR");
    const created = data(await da.createRequestAction(input()));
    const fd = new FormData();
    fd.set("requestId", created.id);
    fd.set("file", new File([Buffer.from("%PDF-1.4 test")], "devis.pdf", { type: "application/pdf" }));
    const att = data(await da.addAttachmentAction(fd));
    const call = () =>
      attRoute.GET(new NextRequest(`http://localhost/api/purchase-requests/${created.id}/attachments/${att.id}`), {
        params: Promise.resolve({ id: created.id, attId: att.id }),
      });
    asUser(ach);
    expect((await call()).status).toBe(200);
    await login("daa-b-resp", "RESPONSABLE_ACHATS");
    expect(await da.getRequestAction({ id: created.id })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await da.addCommentAction({ id: created.id, comment: "Test" })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect((await call()).status).toBe(403);
  });

  it("Magasinier : doublons sans numéro ni identifiant d'une DA qu'il ne voit pas", async () => {
    await login("daa-m-ach", "ACHETEUR");
    const c1 = data(await da.createRequestAction(input()));
    const s1 = data(await da.submitRequestAction({ id: c1.id, expectedUpdatedAt: c1.updatedAt }));
    await login("daa-m-mag", "MAGASINIER");
    const warnings = data(await da.checkDuplicatesAction({ itemIds: [item.id] }));
    expect(warnings).toHaveLength(1);
    const text = JSON.stringify(warnings);
    expect(text).not.toContain(s1.number!);
    expect(text).not.toContain(c1.id);
    expect(warnings[0].messages[0]).toMatch(/^Déjà demandé : 3 U, besoin le \d{2}\/\d{2}$/);
  });
});

describe("essai expiré (LOT-02)", () => {
  async function prepare() {
    const ach = await login("daa-x-ach", "ACHETEUR");
    const resp = await createTestUser("daa-x-resp", { role: "RESPONSABLE_ACHATS" });
    const created = data(await da.createRequestAction(input()));
    const sub = data(await da.submitRequestAction({ id: created.id, expectedUpdatedAt: created.updatedAt }));
    const draft = data(await da.createRequestAction(input()));
    await setLicense("EXPIRED");
    return { ach, resp, sub, draft };
  }

  it("création, soumission, validation, refus, annulation, commentaire : LICENSE_READ_ONLY", async () => {
    const { resp, sub, draft } = await prepare();
    const v = { id: sub.id, expectedUpdatedAt: sub.updatedAt };
    expect(await da.createRequestAction(input())).toMatchObject({ ok: false, code: "LICENSE_READ_ONLY" });
    expect(await da.submitRequestAction({ id: draft.id, expectedUpdatedAt: draft.updatedAt })).toMatchObject({ ok: false, code: "LICENSE_READ_ONLY" });
    expect(await da.cancelRequestAction({ ...v, reason: "Annulation de test" })).toMatchObject({ ok: false, code: "LICENSE_READ_ONLY" });
    expect(await da.addCommentAction({ id: sub.id, comment: "Test" })).toMatchObject({ ok: false, code: "LICENSE_READ_ONLY" });
    asUser(resp);
    expect(await da.approveRequestAction(v)).toMatchObject({ ok: false, code: "LICENSE_READ_ONLY" });
    expect(await da.approveManyAction({ items: [v] })).toMatchObject({ ok: false, code: "LICENSE_READ_ONLY" });
    expect(await da.rejectRequestAction({ ...v, reason: "Refus de test" })).toMatchObject({ ok: false, code: "LICENSE_READ_ONLY" });
    expect((await db.purchaseRequest.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe("SOUMISE");
  });

  it("liste, fiche, doublons, export et pièces jointes restent accessibles; marquer lu autorisé", async () => {
    const { resp, sub, ach } = await prepare();
    asUser(resp);
    expect(data(await da.listRequestsAction({})).total).toBeGreaterThanOrEqual(1); // le brouillon d'un autre reste privé
    expect(data(await da.getRequestAction({ id: sub.id })).number).toBe(sub.number);
    expect((await da.checkDuplicatesAction({ itemIds: [item.id] })).ok).toBe(true);
    expect((await da.searchItemsForRequestAction({ q: "IT-DAA" })).ok).toBe(true);
    expect((await da.listCriticalPendingAction({})).ok).toBe(true);
    const res = await exportRoute.GET(new NextRequest("http://localhost/api/export/demandes"), { params: Promise.resolve({ entity: "demandes" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/demandes_\d{8}\.xlsx/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as never);
    expect(wb.worksheets[0].rowCount).toBeGreaterThanOrEqual(2);
    const unread = data(await nt.getNotificationsAction({}));
    expect(unread.items.length).toBeGreaterThan(0);
    expect(data(await nt.markAllNotificationsReadAction({})).updated).toBeGreaterThan(0);
    asUser(ach);
    expect((await nt.getNotificationsAction({})).ok).toBe(true);
  });
});

describe("export /api/export/demandes", () => {
  const call = (qs = "") =>
    exportRoute.GET(new NextRequest(`http://localhost/api/export/demandes${qs}`), { params: Promise.resolve({ entity: "demandes" }) });
  async function rows(res: Response) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as never);
    const out: string[][] = [];
    wb.worksheets[0].eachRow((row) => out.push((row.values as unknown[]).slice(1).map((v) => (v == null ? "" : String(v)))));
    return out;
  }

  it("401 sans session; Super-admin autorisé en lecture", async () => {
    expect((await call()).status).toBe(401);
    await login("daa-e-sa", "SUPER_ADMIN");
    expect((await call()).status).toBe(200);
  });

  it("Acheteur : colonnes de prix; Magasinier : aucune colonne de prix, DA visibles seulement", async () => {
    await login("daa-e-ach", "ACHETEUR");
    const c = data(await da.createRequestAction({ ...input(), reason: "EXPORTEXPE courroie" }));
    data(await da.submitRequestAction({ id: c.id, expectedUpdatedAt: c.updatedAt }));
    const priced = await rows(await call("?q=EXPORTEXPE"));
    expect(priced).toHaveLength(2);
    expect(priced[0].join("|")).toMatch(/Prix estimé/);
    expect(priced[1].join("|")).toContain("6000");

    await login("daa-e-mag", "MAGASINIER");
    const res = await call("?q=EXPORTEXPE");
    expect(res.status).toBe(200);
    expect(await rows(res)).toHaveLength(1); // DA standard d'un acheteur : invisible au magasinier
    const m = data(await da.createRequestAction({ ...input(), reason: "EXPORTEXPE réappro" }));
    data(await da.submitRequestAction({ id: m.id, expectedUpdatedAt: m.updatedAt }));
    const r = await rows(await call("?q=EXPORTEXPE"));
    expect(r).toHaveLength(2);
    expect(r[0].join("|")).not.toMatch(/Prix|Montant|Total estimé/);
    expect(r[1].join("|")).not.toContain("6000");
  });
});
