import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { cleanTestUsers, createTestUser } from "../helpers/db";
import { IT_PREFIX, cleanReferentials, ensureCurrencies } from "../helpers/referentials";
import { cleanPurchaseRequests } from "../helpers/purchase-requests";
import { buildDigestFor, runAlertDigest } from "@/modules/notifications/digest";

const d = (iso: string) => new Date(iso);
const NOW = d("2026-10-28T08:00:00.000Z");

type U = { id: string; role: "RESPONSABLE_ACHATS" | "ACHETEUR" | "MAGASINIER" };
let resp: U;
let buyer: U;
let idleBuyer: U;
let mag: U;

async function wipe() {
  await db.notification.deleteMany({ where: { type: "DIGEST" } });
  await db.auditLog.deleteMany({ where: { action: "DIGEST_RUN" } });
  await cleanPurchaseRequests();
  await cleanReferentials();
  await cleanTestUsers();
}

beforeEach(async () => {
  await wipe();
  await ensureCurrencies();
  resp = (await createTestUser("dg-resp", { role: "RESPONSABLE_ACHATS" })) as U;
  buyer = (await createTestUser("dg-ach", { role: "ACHETEUR", purchaseScope: "ALL" })) as U;
  idleBuyer = (await createTestUser("dg-ach-idle", { role: "ACHETEUR", purchaseScope: "ALL" })) as U;
  mag = (await createTestUser("dg-mag", { role: "MAGASINIER" })) as U;
  const wh = await db.warehouse.create({ data: { code: `${IT_PREFIX}DG-W`, name: "Dépôt digest" } });
  const dept = await db.department.create({ data: { code: `${IT_PREFIX}DG-D`, name: "Service digest" } });
  const sup = await db.supplier.create({ data: { code: `${IT_PREFIX}DG-1`, name: "Fournisseur digest", type: "LOCAL", currencyCode: "XOF", createdById: resp.id } });
  const item = await db.item.create({ data: { code: `${IT_PREFIX}DG-S`, name: "Article digest", category: "FOURNITURE", stockUnit: "U", purchaseUnit: "U", createdById: resp.id } });
  // DA à valider dont un arrêt de production.
  await db.purchaseRequest.create({
    data: {
      status: "SOUMISE", priority: 0, urgency: "ARRET_PRODUCTION", departmentId: dept.id, requesterName: "Demandeur",
      reason: "Digest test", neededBy: d("2026-12-31T00:00:00.000Z"), createdById: resp.id,
      lines: { create: [{ lineNo: 1, itemId: item.id, quantity: 5, unit: "U" }] },
    },
  });
  // BC envoyé il y a 5 jours, attendu hier : en retard, sans confirmation, réception attendue.
  await db.purchaseOrder.create({
    data: {
      number: "BC-IT-DG-1", status: "ENVOYE", type: "LOCAL", supplierId: sup.id, createdById: buyer.id, currencyCode: "XOF",
      paymentTerm: "J30", warehouseId: wh.id, requestedDate: d("2026-10-27T00:00:00.000Z"), expectedDate: d("2026-10-27T00:00:00.000Z"),
      sentAt: d("2026-10-23T09:00:00.000Z"), approvedAt: d("2026-10-22T09:00:00.000Z"),
      lines: { create: [{ lineNo: 1, itemId: item.id, quantity: 10, unit: "U", unitPrice: 100, vatRate: 18, netAmount: 1000 }] },
    },
  });
});

afterAll(async () => {
  await wipe();
  await db.$disconnect();
});

describe("digest : contenu par rôle", () => {
  it("Responsable : DA à valider, arrêts, BC en retard, BC sans confirmation", async () => {
    const c = await buildDigestFor(resp, NOW);
    expect(c?.body).toContain("DA à valider : ");
    expect(c?.body).toContain("dont arrêts de production : ");
    expect(c?.body).toContain("BC en retard : ");
    expect(c?.body).toContain("BC sans confirmation depuis 3 jours : ");
    expect(c?.title).toMatch(/^Point de 8h/);
    expect(c?.link).toMatch(/^\//);
  });

  it("Acheteur : voit ses BC, pas ceux des autres ; sans rien => pas de digest", async () => {
    const c = await buildDigestFor(buyer, NOW);
    expect(c?.body).toContain("BC en retard : 1");
    expect(c?.body).toContain("BC sans confirmation depuis 3 jours : 1");
    expect(await buildDigestFor(idleBuyer, NOW)).toBeNull();
  });

  it("Magasinier : réceptions en retard, sans montant", async () => {
    const c = await buildDigestFor(mag, NOW, "APRES_MIDI");
    expect(c?.title).toMatch(/^Point de 15h/);
    expect(c?.body).toContain("Livraisons en retard : ");
    expect(c?.body).not.toMatch(/FCFA/);
  });
});

describe("digest : idempotence", () => {
  const mine = (ids: string[]) =>
    db.notification.findMany({ where: { type: "DIGEST", recipientId: { in: ids } } });

  it("deux appels (dont simultanés) au même créneau = aucun doublon", async () => {
    const ids = [resp.id, buyer.id, idleBuyer.id, mag.id];
    const first = await runAlertDigest("MATIN", NOW);
    expect(first.key).toBe("2026-10-28-MATIN");
    const [a, b] = await Promise.all([runAlertDigest("MATIN", NOW), runAlertDigest("MATIN", NOW)]);
    expect(a.created + b.created).toBe(0);
    const rows = await mine(ids);
    expect(rows.map((r) => r.recipientId).sort()).toEqual([resp.id, buyer.id, mag.id].sort());
    expect(rows.every((r) => r.entity === "digest" && r.entityId === "2026-10-28-MATIN")).toBe(true);
  });

  it("un autre créneau crée un nouveau digest", async () => {
    await runAlertDigest("MATIN", NOW);
    await runAlertDigest("APRES_MIDI", d("2026-10-28T15:00:00.000Z"));
    expect(await mine([resp.id])).toHaveLength(2);
  });
});

describe("route /api/cron/alertes", () => {
  const url = "http://localhost/api/cron/alertes?slot=MATIN";
  const call = async (method: "GET" | "POST", auth?: string) => {
    const { GET, POST } = await import("@/app/api/cron/alertes/route");
    const req = new NextRequest(url, { method, headers: auth ? { authorization: auth } : {} });
    return (method === "GET" ? GET : POST)(req);
  };

  it("503 si CRON_SECRET n'est pas défini (jamais ouvert)", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("GET")).status).toBe(503);
    expect((await call("POST", "Bearer ")).status).toBe(503);
    vi.unstubAllEnvs();
  });

  it("401 sans en-tête ou avec un mauvais secret", async () => {
    vi.stubEnv("CRON_SECRET", "secret-de-test-0123456789");
    expect((await call("GET")).status).toBe(401);
    expect((await call("POST", "Bearer mauvais")).status).toBe(401);
    expect((await call("GET", "Bearer secret-de-test-012345678")).status).toBe(401);
    expect((await call("GET", "secret-de-test-0123456789")).status).toBe(401);
    vi.unstubAllEnvs();
  });

  it("200 avec le bon secret, et un second appel ne crée rien", async () => {
    vi.stubEnv("CRON_SECRET", "secret-de-test-0123456789");
    const r1 = await call("POST", "Bearer secret-de-test-0123456789");
    expect(r1.status).toBe(200);
    expect((await r1.json()).created).toBeGreaterThan(0);
    const r2 = await call("GET", "Bearer secret-de-test-0123456789");
    expect((await r2.json()).created).toBe(0);
    vi.unstubAllEnvs();
  });
});
