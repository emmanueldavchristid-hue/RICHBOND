import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { authenticate } from "@/modules/auth/authenticate";
import { TEST_PASSWORD, cleanTestUsers, createTestUser } from "../helpers/db";

const T0 = new Date("2026-03-02T09:00:00Z");

beforeEach(cleanTestUsers);
afterAll(async () => {
  await cleanTestUsers();
  await db.$disconnect();
});

async function fail(email: string, n: number, at = T0) {
  let last;
  for (let i = 0; i < n; i++) last = await authenticate(email, "mauvais", at);
  return last!;
}

describe("verrouillage de compte", () => {
  it("4 échecs : pas verrouillé ; 5e : LOCKED + audit", async () => {
    const u = await createTestUser("lock1");
    const r4 = await fail(u.email, 4);
    expect(r4).toEqual({ ok: false, reason: "INVALID" });
    const r5 = await authenticate(u.email, "mauvais", T0);
    expect(r5.ok === false && r5.reason).toBe("LOCKED");
    if (!r5.ok && r5.reason === "LOCKED") {
      expect(r5.lockedUntil.getTime()).toBe(T0.getTime() + 15 * 60_000);
    }
    expect(await db.auditLog.count({ where: { entityId: u.id, action: "ACCOUNT_LOCKED" } })).toBe(1);
    expect(await db.auditLog.count({ where: { entityId: u.id, action: "LOGIN_FAILED" } })).toBe(4);
  });

  it("bon mot de passe pendant le verrou : refusé", async () => {
    const u = await createTestUser("lock2");
    await fail(u.email, 5);
    const r = await authenticate(u.email, TEST_PASSWORD, new Date(T0.getTime() + 60_000));
    expect(r.ok === false && r.reason).toBe("LOCKED");
  });

  it("après 15 min 1 s : succès et compteur remis à 0", async () => {
    const u = await createTestUser("lock3");
    await fail(u.email, 5);
    const later = new Date(T0.getTime() + 15 * 60_000 + 1000);
    const r = await authenticate(u.email, TEST_PASSWORD, later);
    expect(r.ok).toBe(true);
    const after = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.failedLoginCount).toBe(0);
    expect(after.lockedUntil).toBeNull();
    expect(after.lastLoginAt?.getTime()).toBe(later.getTime());
    expect(await db.auditLog.count({ where: { entityId: u.id, action: "LOGIN_SUCCESS" } })).toBe(1);
  });

  it("un succès remet le compteur à 0 avant le seuil", async () => {
    const u = await createTestUser("lock4");
    await fail(u.email, 3);
    expect((await authenticate(u.email, TEST_PASSWORD, T0)).ok).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).failedLoginCount).toBe(0);
  });

  it("compte désactivé : DISABLED ; email inconnu : INVALID ; email insensible à la casse", async () => {
    const u = await createTestUser("off", { active: false });
    expect(await authenticate(u.email, TEST_PASSWORD, T0)).toEqual({ ok: false, reason: "DISABLED" });
    expect(await authenticate("inconnu@richbond.test", "x", T0)).toEqual({
      ok: false,
      reason: "INVALID",
    });
    const v = await createTestUser("case");
    expect((await authenticate(`  ${v.email.toUpperCase()} `, TEST_PASSWORD, T0)).ok).toBe(true);
  });
});
