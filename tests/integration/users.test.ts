import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { authenticate } from "@/modules/auth/authenticate";
import {
  changeOwnPassword,
  createUser,
  deactivateUser,
  listUsers,
  resetPassword,
  unlockUser,
  updateUser,
} from "@/modules/users";
import { TEST_PASSWORD, cleanTestUsers, createTestUser } from "../helpers/db";

beforeEach(cleanTestUsers);
afterAll(async () => {
  await cleanTestUsers();
  await db.$disconnect();
});

const code = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e) => (e as { code?: string }).code ?? "ERR",
  );

describe("module utilisateurs", () => {
  it("création : audit USER_CREATE sans hash, mustChangePassword, mot de passe temporaire valide", async () => {
    const admin = await createTestUser("resp1", { role: "RESPONSABLE_ACHATS" });
    const { user, temporaryPassword } = await createUser(admin, {
      name: "Nouvel Acheteur",
      email: "  IT-new1@Richbond.test ",
      role: "ACHETEUR",
      purchaseScope: "LOCAL",
    });
    expect(user.email).toBe("it-new1@richbond.test");
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.mustChangePassword).toBe(true);
    expect(row.createdById).toBe(admin.id);
    const log = await db.auditLog.findFirstOrThrow({
      where: { action: "USER_CREATE", entityId: user.id },
    });
    expect(log.userId).toBe(admin.id);
    expect(JSON.stringify(log)).not.toMatch(/passw|\$2[aby]\$/i);
    expect((await authenticate(user.email, temporaryPassword)).ok).toBe(true);
  });

  it("email en double (casse différente) refusé", async () => {
    const admin = await createTestUser("resp2", { role: "RESPONSABLE_ACHATS" });
    await createTestUser("dup");
    expect(
      await code(createUser(admin, { name: "Doublon", email: "IT-DUP@richbond.test", role: "MAGASINIER" })),
    ).toBe("EMAIL_TAKEN");
  });

  it("acheteur sans périmètre refusé ; périmètre ignoré pour les autres rôles", async () => {
    const admin = await createTestUser("resp3", { role: "RESPONSABLE_ACHATS" });
    await expect(
      createUser(admin, { name: "Sans périmètre", email: "it-np@richbond.test", role: "ACHETEUR" }),
    ).rejects.toThrow();
    const { user } = await createUser(admin, {
      name: "Magasinier X",
      email: "it-mx@richbond.test",
      role: "MAGASINIER",
      purchaseScope: "LOCAL",
    });
    expect(user.purchaseScope).toBeNull();
  });

  it("le Responsable ne peut pas créer ni voir un SUPER_ADMIN", async () => {
    const admin = await createTestUser("resp4", { role: "RESPONSABLE_ACHATS" });
    const sa = await createTestUser("sa1", { role: "SUPER_ADMIN" });
    expect(
      await code(createUser(admin, { name: "Pirate", email: "it-p@richbond.test", role: "SUPER_ADMIN" })),
    ).toBe("FORBIDDEN");
    expect(await code(deactivateUser(admin, sa.id))).toBe("USER_NOT_FOUND");
    expect((await listUsers(admin, {})).some((u) => u.id === sa.id)).toBe(false);
    expect((await listUsers(sa, {})).some((u) => u.id === sa.id)).toBe(true);
  });

  it("désactivation : soi-même refusé ; sessionVersion incrémentée ; connexion refusée", async () => {
    const r1 = await createTestUser("resp5", { role: "RESPONSABLE_ACHATS" });
    expect(await code(deactivateUser(r1, r1.id))).toBe("SELF_DEACTIVATE");

    const mag = await createTestUser("mag1");
    await deactivateUser(r1, mag.id);
    const after = await db.user.findUniqueOrThrow({ where: { id: mag.id } });
    expect(after.active).toBe(false);
    expect(after.sessionVersion).toBe(mag.sessionVersion + 1);
    expect(await db.auditLog.count({ where: { action: "USER_DEACTIVATE", entityId: mag.id } })).toBe(1);
    expect(await authenticate(mag.email, TEST_PASSWORD)).toEqual({ ok: false, reason: "DISABLED" });
  });

  it("le dernier Responsable actif ne peut être ni désactivé ni rétrogradé", async () => {
    // Les autres Responsables (seed) sont écartés le temps du test.
    const others = await db.user.findMany({
      where: {
        role: "RESPONSABLE_ACHATS",
        active: true,
        NOT: { email: { startsWith: "it-" } },
      },
      select: { id: true },
    });
    const ids = others.map((o) => o.id);
    await db.user.updateMany({ where: { id: { in: ids } }, data: { active: false } });
    try {
      const sa = await createTestUser("sa2", { role: "SUPER_ADMIN" });
      const only = await createTestUser("resp6", { role: "RESPONSABLE_ACHATS" });
      expect(await code(deactivateUser(sa, only.id))).toBe("LAST_RESPONSABLE");
      expect(
        await code(updateUser(sa, { id: only.id, name: only.name, email: only.email, role: "MAGASINIER" })),
      ).toBe("LAST_RESPONSABLE");
    } finally {
      await db.user.updateMany({ where: { id: { in: ids } }, data: { active: true } });
    }
  });

  it("modification de rôle : audit avant/après et sessionVersion incrémentée", async () => {
    const r = await createTestUser("resp7", { role: "RESPONSABLE_ACHATS" });
    const t = await createTestUser("mag2");
    const res = await updateUser(r, {
      id: t.id,
      name: "Nom modifié",
      email: t.email,
      role: "ACHETEUR",
      purchaseScope: "IMPORT",
    });
    expect(res.role).toBe("ACHETEUR");
    const row = await db.user.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.sessionVersion).toBe(t.sessionVersion + 1);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "USER_UPDATE", entityId: t.id } });
    expect((log.before as { role: string }).role).toBe("MAGASINIER");
    expect((log.after as { role: string }).role).toBe("ACHETEUR");
  });

  it("réinitialisation : mustChangePassword, verrou levé, ancien mot de passe invalide, audit sans secret", async () => {
    const r = await createTestUser("resp8", { role: "RESPONSABLE_ACHATS" });
    const t = await createTestUser("mag3");
    await db.user.update({
      where: { id: t.id },
      data: { failedLoginCount: 5, lockedUntil: new Date(Date.now() + 600_000) },
    });
    const { temporaryPassword } = await resetPassword(r, t.id);
    const row = await db.user.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.mustChangePassword).toBe(true);
    expect(row.lockedUntil).toBeNull();
    expect(row.sessionVersion).toBe(t.sessionVersion + 1);
    expect((await authenticate(t.email, TEST_PASSWORD)).ok).toBe(false);
    expect((await authenticate(t.email, temporaryPassword)).ok).toBe(true);
    const log = await db.auditLog.findFirstOrThrow({
      where: { action: "USER_PASSWORD_RESET", entityId: t.id },
    });
    expect(JSON.stringify(log)).not.toContain(temporaryPassword);
  });

  it("déverrouillage anticipé", async () => {
    const r = await createTestUser("resp9", { role: "RESPONSABLE_ACHATS" });
    const t = await createTestUser("mag4");
    await db.user.update({
      where: { id: t.id },
      data: { failedLoginCount: 5, lockedUntil: new Date(Date.now() + 600_000) },
    });
    await unlockUser(r, t.id);
    expect((await authenticate(t.email, TEST_PASSWORD)).ok).toBe(true);
  });

  it("changement de son mot de passe : ancien vérifié, identique refusé, flag levé, session conservée", async () => {
    const t = await createTestUser("mag5", { mustChangePassword: true });
    const pw = (cur: string, next: string) => ({
      currentPassword: cur,
      newPassword: next,
      confirmPassword: next,
    });
    expect(await code(changeOwnPassword(t.id, pw("faux", "Nouveau-2026")))).toBe("WRONG_PASSWORD");
    expect(await code(changeOwnPassword(t.id, pw(TEST_PASSWORD, TEST_PASSWORD)))).toBe("SAME_PASSWORD");
    await changeOwnPassword(t.id, pw(TEST_PASSWORD, "Nouveau-2026"));
    const row = await db.user.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.mustChangePassword).toBe(false);
    expect(row.sessionVersion).toBe(t.sessionVersion);
    expect((await authenticate(t.email, "Nouveau-2026")).ok).toBe(true);
    expect(await db.auditLog.count({ where: { action: "PASSWORD_CHANGE", entityId: t.id } })).toBe(1);
  });

  it("aucune fonction de suppression n'est exposée", async () => {
    const mod = await import("@/modules/users");
    expect(Object.keys(mod).filter((k) => /delete|remove/i.test(k))).toEqual([]);
  });
});
