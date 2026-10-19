import { createHash } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { db } from "@/lib/db";
import { cleanTestUsers, createTestUser } from "../helpers/db";

const session: { current: { user: { id: string; sessionVersion: number } } | null } = { current: null };
vi.mock("@/lib/auth", () => ({ auth: async () => session.current }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { withAction } = await import("@/modules/auth/session");
const { ensureLicense, getLicenseState } = await import("@/modules/licensing");
const { generateLicenseKey } = await import("@/modules/licensing/key");
const { extendTrialAction, activateLicenseAction } = await import("@/app/(app)/parametres/licence/actions");
const { changePasswordAction } = await import("@/app/(app)/mon-compte/actions");

const SECRET = process.env.LICENSE_SECRET!;
const READ_ONLY = "Période d'essai terminée : l'application est en consultation seule. Contactez Christ-Emmanuel Mouhi pour l'activer.";
const DAY = 86_400_000;

const noop = vi.fn(async () => "fait");
const writeAction = withAction("purchaseRequest.create", z.object({}), noop);
const exportAction = withAction("purchaseRequest.create", z.object({}), noop, { writable: false });

async function login(key: string, role: Parameters<typeof createTestUser>[1] = {}) {
  const u = await createTestUser(key, role);
  session.current = { user: { id: u.id, sessionVersion: u.sessionVersion } };
  return u;
}

async function setLicense(status: "TRIAL" | "ACTIVE" | "EXPIRED", endsInDays: number) {
  await db.license.deleteMany();
  const now = Date.now();
  return db.license.create({
    data: { status, trialStartsAt: new Date(now - 30 * DAY), trialEndsAt: new Date(now + endsInDays * DAY) },
  });
}

async function cleanLicenseAudit() {
  await db.auditLog.deleteMany({ where: { entity: "License" } });
}

let saved: Awaited<ReturnType<typeof db.license.findMany>> = [];
beforeEach(async () => {
  await cleanTestUsers();
  await cleanLicenseAudit();
  session.current = null;
  noop.mockClear();
  if (saved.length === 0) saved = await db.license.findMany();
  await setLicense("TRIAL", 10);
});
afterAll(async () => {
  await cleanTestUsers();
  await cleanLicenseAudit();
  await db.license.deleteMany();
  if (saved.length) await db.license.createMany({ data: saved });
  await db.$disconnect();
});

describe("ensureLicense", () => {
  it("10 appels parallèles : une seule ligne, un seul audit LICENSE_INIT", async () => {
    await db.license.deleteMany();
    await Promise.all(Array.from({ length: 10 }, () => ensureLicense()));
    expect(await db.license.count()).toBe(1);
    const l = await db.license.findFirstOrThrow();
    expect(l.status).toBe("TRIAL");
    expect(l.trialEndsAt.getTime()).toBeGreaterThan(Date.now());
    expect(await db.auditLog.count({ where: { action: "LICENSE_INIT" } })).toBe(1);
  });
});

describe("garde d'écriture à l'expiration", () => {
  it("écriture refusée avec le message exact ; lecture, mon-compte et licence autorisés", async () => {
    const resp = await login("lic-resp", { role: "RESPONSABLE_ACHATS" });
    await setLicense("EXPIRED", -1);
    const usersBefore = await db.user.count();
    const auditBefore = await db.auditLog.count();
    expect(await writeAction({})).toEqual({ ok: false, code: "LICENSE_READ_ONLY", message: READ_ONLY });
    expect(noop).not.toHaveBeenCalled();
    expect(await exportAction({})).toEqual({ ok: true, data: "fait" });
    expect((await getLicenseState()).status).toBe("EXPIRED");
    expect(resp.id).toBeTruthy();
    expect(await changePasswordAction({ current: "x" })).not.toMatchObject({ code: "LICENSE_READ_ONLY" });
    expect(await db.user.count()).toBe(usersBefore);
    expect(await db.auditLog.count()).toBe(auditBefore);
  });

  it("licence TRIAL arrivée à échéance (borne) : lecture seule", async () => {
    await login("lic-trial", { role: "RESPONSABLE_ACHATS" });
    await setLicense("TRIAL", -0.0001);
    expect(await writeAction({})).toMatchObject({ ok: false, code: "LICENSE_READ_ONLY" });
  });

  it("licence absente : créée à la volée, écriture possible", async () => {
    await login("lic-none", { role: "RESPONSABLE_ACHATS" });
    await db.license.deleteMany();
    expect(await writeAction({})).toEqual({ ok: true, data: "fait" });
    expect(await db.license.count()).toBe(1);
  });

  it("anti-recul : lastSeenAt dans le futur maintient l'expiration", async () => {
    await login("lic-seen", { role: "RESPONSABLE_ACHATS" });
    const l = await setLicense("TRIAL", 1);
    await db.license.update({ where: { id: l.id }, data: { lastSeenAt: new Date(Date.now() + 2 * DAY) } });
    expect((await getLicenseState()).status).toBe("EXPIRED");
  });
});

describe("activation", () => {
  it("clé valide : ACTIVE, empreinte sha256, audit sans clé", async () => {
    const admin = await login("lic-sa", { role: "SUPER_ADMIN" });
    await setLicense("EXPIRED", -1);
    const key = generateLicenseKey(SECRET, "RICHBOND CI");
    const r = await activateLicenseAction({ licensedTo: "RICHBOND CI", key: key.toLowerCase() });
    expect(r.ok).toBe(true);
    const l = await db.license.findFirstOrThrow();
    expect(l.status).toBe("ACTIVE");
    expect(l.licensedTo).toBe("RICHBOND CI");
    expect(l.activatedAt).not.toBeNull();
    expect(l.keyFingerprint).toBe(createHash("sha256").update(key).digest("hex"));
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "LICENSE_ACTIVATE" } });
    expect(log.userId).toBe(admin.id);
    expect(JSON.stringify(log)).not.toContain(key);
    expect((await getLicenseState()).writable).toBe(true);
  });

  it("clé invalide : erreur, statut et empreinte inchangés, audit d'échec", async () => {
    await login("lic-sa2", { role: "SUPER_ADMIN" });
    await setLicense("EXPIRED", -1);
    const r = await activateLicenseAction({ licensedTo: "RICHBOND CI", key: "RB-AAAAA-BBBBB-CCCCC-DDDDD" });
    expect(r).toEqual({ ok: false, code: "LICENSE_KEY_INVALID", message: "Clé de licence invalide." });
    const l = await db.license.findFirstOrThrow();
    expect(l.status).toBe("EXPIRED");
    expect(l.keyFingerprint).toBeNull();
    expect(await db.auditLog.count({ where: { action: "LICENSE_ACTIVATION_FAILED" } })).toBe(1);
  });

  it("6e tentative : trop de tentatives, même avec la bonne clé", async () => {
    await login("lic-sa3", { role: "SUPER_ADMIN" });
    for (let i = 0; i < 5; i++) {
      expect(await activateLicenseAction({ licensedTo: "RICHBOND CI", key: "RB-AAAAA-BBBBB-CCCCC-DDDDD" })).toMatchObject({
        code: "LICENSE_KEY_INVALID",
      });
    }
    const good = generateLicenseKey(SECRET, "RICHBOND CI");
    expect(await activateLicenseAction({ licensedTo: "RICHBOND CI", key: good })).toEqual({
      ok: false,
      code: "LICENSE_TOO_MANY_ATTEMPTS",
      message: "Trop de tentatives, réessayez dans 15 min.",
    });
    expect((await db.license.findFirstOrThrow()).status).toBe("TRIAL");
  });

  it("refusée aux autres rôles", async () => {
    const key = generateLicenseKey(SECRET, "RICHBOND CI");
    for (const role of ["RESPONSABLE_ACHATS", "ACHETEUR", "MAGASINIER"] as const) {
      await login(`lic-${role}`, { role });
      expect(await activateLicenseAction({ licensedTo: "RICHBOND CI", key })).toMatchObject({ code: "FORBIDDEN" });
    }
    expect((await db.license.findFirstOrThrow()).status).toBe("TRIAL");
  });
});

describe("prolongation", () => {
  const dateIn = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);

  it("date passée ou aujourd'hui refusée", async () => {
    await login("lic-ext1", { role: "SUPER_ADMIN" });
    expect(await extendTrialAction({ date: dateIn(-3) })).toMatchObject({ ok: false, code: "INVALID_DATE" });
    expect(await extendTrialAction({ date: dateIn(0) })).toMatchObject({ ok: false, code: "INVALID_DATE" });
  });

  it("EXPIRED -> TRIAL, audit avant/après", async () => {
    await login("lic-ext2", { role: "SUPER_ADMIN" });
    await setLicense("EXPIRED", -1);
    const target = dateIn(15);
    expect((await extendTrialAction({ date: target })).ok).toBe(true);
    const l = await db.license.findFirstOrThrow();
    expect(l.status).toBe("TRIAL");
    expect(l.trialEndsAt.toISOString()).toBe(`${target}T23:59:59.999Z`);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "LICENSE_TRIAL_EXTEND" } });
    expect(log.before).toMatchObject({ status: "EXPIRED" });
    expect(log.after).toMatchObject({ status: "TRIAL" });
    expect((await getLicenseState()).writable).toBe(true);
  });

  it("raccourcir exige une confirmation", async () => {
    await login("lic-ext3", { role: "SUPER_ADMIN" });
    const target = dateIn(3);
    expect(await extendTrialAction({ date: target })).toMatchObject({ code: "CONFIRMATION_REQUIRED" });
    expect((await extendTrialAction({ date: target, confirmShorten: true })).ok).toBe(true);
  });

  it("licence active : refusée ; autres rôles : FORBIDDEN", async () => {
    await login("lic-ext4", { role: "SUPER_ADMIN" });
    const l = await db.license.findFirstOrThrow();
    await db.license.update({ where: { id: l.id }, data: { status: "ACTIVE" } });
    expect(await extendTrialAction({ date: dateIn(20) })).toMatchObject({ code: "LICENSE_ALREADY_ACTIVE" });
    for (const role of ["RESPONSABLE_ACHATS", "ACHETEUR", "MAGASINIER"] as const) {
      await login(`lic-ext-${role}`, { role });
      expect(await extendTrialAction({ date: dateIn(20) })).toMatchObject({ code: "FORBIDDEN" });
    }
  });
});
