import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { authenticate } from "@/modules/auth/authenticate";
import { TEST_PASSWORD, cleanTestUsers, createTestUser } from "../helpers/db";

const T0 = new Date("2026-03-02T09:00:00Z");
const MIN = 60_000;

beforeEach(cleanTestUsers);
afterAll(async () => {
  await cleanTestUsers();
  await db.$disconnect();
});

async function fail(email: string, n: number, at = T0) {
  for (let i = 0; i < n; i++) await authenticate(email, "mauvais", at);
}

describe("verrouillage : cas limites", () => {
  it("à l'instant exact de fin de verrou, le compte est encore verrouillé ; une seconde après, non", async () => {
    const u = await createTestUser("edge1");
    await fail(u.email, 5);
    const fin = new Date(T0.getTime() + 15 * MIN);
    const r = await authenticate(u.email, TEST_PASSWORD, fin);
    // lockedUntil > now est faux à l'égalité : le compte est libéré à l'instant exact.
    expect(r.ok).toBe(true);
  });

  it("14 min 59 s après : encore verrouillé", async () => {
    const u = await createTestUser("edge2");
    await fail(u.email, 5);
    const r = await authenticate(u.email, TEST_PASSWORD, new Date(T0.getTime() + 15 * MIN - 1000));
    expect(r.ok === false && r.reason).toBe("LOCKED");
  });

  it("pendant le verrou, de nouveaux échecs ne prolongent pas le verrou ni ne créent d'audit", async () => {
    const u = await createTestUser("edge3");
    await fail(u.email, 5);
    const avant = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    await fail(u.email, 3, new Date(T0.getTime() + 5 * MIN));
    const apres = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(apres.lockedUntil?.getTime()).toBe(avant.lockedUntil?.getTime());
    expect(await db.auditLog.count({ where: { entityId: u.id, action: "ACCOUNT_LOCKED" } })).toBe(1);
  });

  it("après expiration, un échec repart de zéro (pas de re-verrouillage immédiat)", async () => {
    const u = await createTestUser("edge4");
    await fail(u.email, 5);
    const later = new Date(T0.getTime() + 16 * MIN);
    const r = await authenticate(u.email, "mauvais", later);
    expect(r).toEqual({ ok: false, reason: "INVALID" });
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).failedLoginCount).toBe(1);
  });

  it("les échecs sont comptés par compte (un autre compte n'est pas verrouillé)", async () => {
    const a = await createTestUser("edge5a");
    const b = await createTestUser("edge5b");
    await fail(a.email, 5);
    expect((await authenticate(b.email, TEST_PASSWORD, T0)).ok).toBe(true);
  });

  it("l'audit d'échec ne contient pas le mot de passe saisi", async () => {
    const u = await createTestUser("edge6");
    await authenticate(u.email, "Secret-Tente-99", T0);
    const logs = await db.auditLog.findMany({ where: { entityId: u.id } });
    expect(JSON.stringify(logs)).not.toContain("Secret-Tente-99");
  });

  it("15 tentatives parallèles : au plus 5 échecs comptés, un seul verrouillage", async () => {
    const u = await createTestUser("conc1");
    const results = await Promise.all(
      Array.from({ length: 15 }, () => authenticate(u.email, "mauvais", T0, "10.0.0.9")),
    );
    const fresh = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(fresh.failedLoginCount).toBe(5);
    expect(fresh.lockedUntil).not.toBeNull();
    expect(results.filter((r) => !r.ok && r.reason === "INVALID")).toHaveLength(4);
    expect(results.filter((r) => !r.ok && r.reason === "LOCKED")).toHaveLength(11);
    const logs = await db.auditLog.groupBy({
      by: ["action"],
      where: { entityId: u.id },
      _count: true,
    });
    const n = (a: string) => logs.find((l) => l.action === a)?._count ?? 0;
    expect(n("LOGIN_FAILED")).toBe(4);
    expect(n("ACCOUNT_LOCKED")).toBe(1);
  });
});
