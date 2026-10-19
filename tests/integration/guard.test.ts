import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { db } from "@/lib/db";
import { cleanTestUsers, createTestUser } from "../helpers/db";

const session: { current: { user: { id: string; sessionVersion: number } } | null } = {
  current: null,
};
vi.mock("@/lib/auth", () => ({ auth: async () => session.current }));

const { withAction } = await import("@/modules/auth/session");
const { isWritable } = await import("@/modules/licensing/guard");

const schema = z.object({ n: z.number().int() });
const run = vi.fn(async ({ input }: { input: { n: number } }) => input.n * 2);
const sensitive = withAction("users.manage", schema, run);
const exempt = withAction(null, schema, run, { writable: false, allowMustChangePassword: true });

async function login(key: string, opts: Parameters<typeof createTestUser>[1] = {}) {
  const u = await createTestUser(key, opts);
  session.current = { user: { id: u.id, sessionVersion: u.sessionVersion } };
  return u;
}

let savedLicenses: Awaited<ReturnType<typeof db.license.findMany>> = [];
async function setLicense(status: "TRIAL" | "ACTIVE" | "EXPIRED", endsInDays: number) {
  await db.license.deleteMany();
  const now = Date.now();
  await db.license.create({
    data: {
      status,
      trialStartsAt: new Date(now - 30 * 86_400_000),
      trialEndsAt: new Date(now + endsInDays * 86_400_000),
    },
  });
}

beforeEach(async () => {
  await cleanTestUsers();
  session.current = null;
  run.mockClear();
  if (savedLicenses.length === 0) savedLicenses = await db.license.findMany();
  await setLicense("TRIAL", 10);
});
afterAll(async () => {
  await cleanTestUsers();
  await db.license.deleteMany();
  if (savedLicenses.length) await db.license.createMany({ data: savedLicenses });
  await db.$disconnect();
});

describe("withAction", () => {
  it("refuse sans session", async () => {
    expect(await sensitive({ n: 1 })).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
    expect(run).not.toHaveBeenCalled();
  });

  it("refuse un rôle insuffisant (FORBIDDEN)", async () => {
    await login("g-mag");
    expect(await sensitive({ n: 1 })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(run).not.toHaveBeenCalled();
  });

  it("accepte le Responsable et valide l'entrée avec Zod", async () => {
    await login("g-resp", { role: "RESPONSABLE_ACHATS" });
    expect(await sensitive({ n: 2 })).toEqual({ ok: true, data: 4 });
    expect(await sensitive({ n: "x" })).toMatchObject({ ok: false, code: "VALIDATION" });
  });

  it("refuse si mot de passe à changer, sauf action exemptée", async () => {
    await login("g-must", { role: "RESPONSABLE_ACHATS", mustChangePassword: true });
    expect(await sensitive({ n: 1 })).toMatchObject({ ok: false, code: "PASSWORD_CHANGE_REQUIRED" });
    expect(await exempt({ n: 1 })).toEqual({ ok: true, data: 2 });
  });

  it("licence expirée : écriture refusée, action exemptée et lecture autorisées", async () => {
    await login("g-lic", { role: "RESPONSABLE_ACHATS" });
    await setLicense("EXPIRED", -1);
    expect(await sensitive({ n: 1 })).toMatchObject({ ok: false, code: "LICENSE_READ_ONLY" });
    expect(await exempt({ n: 1 })).toEqual({ ok: true, data: 2 });
    const read = withAction("users.manage", schema, run, { writable: false });
    expect(await read({ n: 3 })).toEqual({ ok: true, data: 6 });
    await setLicense("TRIAL", -1);
    expect(await sensitive({ n: 1 })).toMatchObject({ ok: false, code: "LICENSE_READ_ONLY" });
  });

  it("licence expirée : le Super-admin et les actions de sécurité restent possibles (A9, I1)", async () => {
    await setLicense("EXPIRED", -1);
    const gestion = withAction("users.manage", schema, run, {
      writable: (u) => u.role !== "SUPER_ADMIN",
    });
    const securite = withAction("users.manage", schema, run, { writable: false });
    await login("g-lic-resp", { role: "RESPONSABLE_ACHATS" });
    expect(await gestion({ n: 1 })).toMatchObject({ ok: false, code: "LICENSE_READ_ONLY" });
    expect(await securite({ n: 1 })).toEqual({ ok: true, data: 2 });
    await login("g-lic-sa", { role: "SUPER_ADMIN" });
    expect(await gestion({ n: 1 })).toEqual({ ok: true, data: 2 });
  });

  it("session invalidée : compte désactivé ou sessionVersion périmée", async () => {
    const u = await login("g-cur", { role: "RESPONSABLE_ACHATS" });
    expect(await sensitive({ n: 1 })).toMatchObject({ ok: true });
    await db.user.update({ where: { id: u.id }, data: { sessionVersion: { increment: 1 } } });
    expect(await sensitive({ n: 1 })).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
    await db.user.update({
      where: { id: u.id },
      data: { sessionVersion: u.sessionVersion, active: false },
    });
    expect(await sensitive({ n: 1 })).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
  });
});

describe("isWritable (pure)", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  it("couvre les états", () => {
    expect(isWritable(null, now)).toBe(false);
    expect(isWritable({ status: "ACTIVE", trialEndsAt: new Date("2020-01-01") }, now)).toBe(true);
    expect(isWritable({ status: "EXPIRED", trialEndsAt: new Date("2030-01-01") }, now)).toBe(false);
    expect(isWritable({ status: "TRIAL", trialEndsAt: new Date("2026-06-02") }, now)).toBe(true);
    expect(isWritable({ status: "TRIAL", trialEndsAt: new Date("2026-05-31") }, now)).toBe(false);
  });
});
