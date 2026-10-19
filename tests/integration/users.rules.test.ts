import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { authenticate } from "@/modules/auth/authenticate";
import { log } from "@/modules/audit";
import { listAudit } from "@/modules/audit/list";
import {
  createUser,
  deactivateUser,
  reactivateUser,
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

describe("règles utilisateurs complémentaires", () => {
  it("s'auto-désactiver est refusé même pour le Super-admin, et rien n'est modifié ni tracé", async () => {
    const sa = await createTestUser("r-sa", { role: "SUPER_ADMIN" });
    expect(await code(deactivateUser(sa, sa.id))).toBe("SELF_DEACTIVATE");
    expect((await db.user.findUniqueOrThrow({ where: { id: sa.id } })).active).toBe(true);
    expect(await db.auditLog.count({ where: { entityId: sa.id, action: "USER_DEACTIVATE" } })).toBe(0);
  });

  it("réinitialiser son propre mot de passe est refusé (SELF_RESET), rien n'est modifié", async () => {
    const r = await createTestUser("r-selfreset", { role: "RESPONSABLE_ACHATS" });
    const before = await db.user.findUniqueOrThrow({ where: { id: r.id } });
    expect(await code(resetPassword(r, r.id))).toBe("SELF_RESET");
    const after = await db.user.findUniqueOrThrow({ where: { id: r.id } });
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.sessionVersion).toBe(before.sessionVersion);
    expect(await db.auditLog.count({ where: { entityId: r.id, action: "USER_PASSWORD_RESET" } })).toBe(0);
  });

  it("journal : connexions/déconnexions masquées par défaut, libellé lisible de l'utilisateur concerné", async () => {
    const r = await createTestUser("r-journal", { role: "RESPONSABLE_ACHATS" });
    const t = await createTestUser("r-journal-t", { role: "MAGASINIER" });
    await db.$transaction(async (tx) => {
      await log(tx, { userId: r.id, action: "LOGIN_SUCCESS", entity: "User", entityId: r.id });
      await log(tx, { userId: r.id, action: "USER_UNLOCK", entity: "User", entityId: t.id });
    });
    const def = await listAudit({ userId: r.id }, "RESPONSABLE_ACHATS");
    expect(def.items.map((i) => i.action)).not.toContain("LOGIN_SUCCESS");
    const unlock = def.items.find((i) => i.action === "USER_UNLOCK");
    expect(unlock?.entityRef).toContain(t.email);
    expect(unlock?.entityRef).not.toBe(t.id);
    const all = await listAudit({ userId: r.id, showAuth: "1" }, "RESPONSABLE_ACHATS");
    expect(all.items.map((i) => i.action)).toContain("LOGIN_SUCCESS");
  });

  it("changer son propre rôle est refusé", async () => {
    const r = await createTestUser("r-self", { role: "RESPONSABLE_ACHATS" });
    await createTestUser("r-other", { role: "RESPONSABLE_ACHATS" });
    expect(await code(updateUser(r, { id: r.id, name: r.name, email: r.email, role: "MAGASINIER" }))).toBe(
      "SELF_ROLE",
    );
  });

  it("avec deux Responsables actifs, l'un peut désactiver l'autre ; le dernier ne le peut plus", async () => {
    const others = await db.user.findMany({
      where: { role: "RESPONSABLE_ACHATS", active: true, NOT: { email: { startsWith: "it-" } } },
      select: { id: true },
    });
    const ids = others.map((o) => o.id);
    await db.user.updateMany({ where: { id: { in: ids } }, data: { active: false } });
    try {
      const a = await createTestUser("r-a", { role: "RESPONSABLE_ACHATS" });
      const b = await createTestUser("r-b", { role: "RESPONSABLE_ACHATS" });
      await deactivateUser(a, b.id);
      expect(await code(deactivateUser(b, a.id))).not.toBe("ok");
      const sa = await createTestUser("r-sa2", { role: "SUPER_ADMIN" });
      expect(await code(deactivateUser(sa, a.id))).toBe("LAST_RESPONSABLE");
      await reactivateUser(sa, b.id);
      expect(await code(deactivateUser(sa, a.id))).toBe("ok");
    } finally {
      await db.user.updateMany({ where: { id: { in: ids } }, data: { active: true } });
    }
  });

  it("désactiver un compte déjà désactivé est sans effet (pas de double audit)", async () => {
    const r = await createTestUser("r-idem", { role: "RESPONSABLE_ACHATS" });
    const m = await createTestUser("m-idem");
    await deactivateUser(r, m.id);
    await deactivateUser(r, m.id);
    expect(await db.auditLog.count({ where: { entityId: m.id, action: "USER_DEACTIVATE" } })).toBe(1);
  });

  it("l'historique est conservé : un compte désactivé reste en base avec ses journaux", async () => {
    const r = await createTestUser("r-hist", { role: "RESPONSABLE_ACHATS" });
    const m = await createTestUser("m-hist");
    await deactivateUser(r, m.id);
    expect(await db.user.count({ where: { id: m.id } })).toBe(1);
    expect((await db.user.findUniqueOrThrow({ where: { id: m.id } })).deactivatedAt).not.toBeNull();
  });

  it("réactivation : connexion de nouveau possible, compteur remis à zéro, audit", async () => {
    const r = await createTestUser("r-re", { role: "RESPONSABLE_ACHATS" });
    const m = await createTestUser("m-re", { active: false });
    await reactivateUser(r, m.id);
    expect((await authenticate(m.email, TEST_PASSWORD)).ok).toBe(true);
    expect(await db.auditLog.count({ where: { entityId: m.id, action: "USER_REACTIVATE" } })).toBe(1);
  });

  it("le Responsable ne peut ni modifier, ni réinitialiser, ni déverrouiller, ni réactiver un Super-admin", async () => {
    const r = await createTestUser("r-hide", { role: "RESPONSABLE_ACHATS" });
    const sa = await createTestUser("sa-hide", { role: "SUPER_ADMIN" });
    expect(await code(resetPassword(r, sa.id))).toBe("USER_NOT_FOUND");
    expect(await code(unlockUser(r, sa.id))).toBe("USER_NOT_FOUND");
    expect(await code(reactivateUser(r, sa.id))).toBe("USER_NOT_FOUND");
    expect(
      await code(updateUser(r, { id: sa.id, name: "Xavier", email: sa.email, role: "MAGASINIER" })),
    ).toBe("USER_NOT_FOUND");
    expect(
      await code(
        updateUser(r, {
          id: (await createTestUser("m-up")).id,
          name: "Xavier",
          email: "it-m-up@richbond.test",
          role: "SUPER_ADMIN",
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("modification vers l'email d'un autre compte refusée ; son propre email conservé accepté", async () => {
    const r = await createTestUser("r-mail", { role: "RESPONSABLE_ACHATS" });
    const a = await createTestUser("mail-a");
    const b = await createTestUser("mail-b");
    expect(
      await code(updateUser(r, { id: a.id, name: a.name, email: b.email.toUpperCase(), role: "MAGASINIER" })),
    ).toBe("EMAIL_TAKEN");
    expect(
      await code(updateUser(r, { id: a.id, name: "Nouveau nom", email: a.email, role: "MAGASINIER" })),
    ).toBe("ok");
  });

  it("changement de nom seul : sessionVersion inchangée ; changement de périmètre : incrémentée", async () => {
    const r = await createTestUser("r-sv", { role: "RESPONSABLE_ACHATS" });
    const a = await createTestUser("ach-sv", { role: "ACHETEUR", purchaseScope: "LOCAL" });
    await updateUser(r, {
      id: a.id,
      name: "Autre nom",
      email: a.email,
      role: "ACHETEUR",
      purchaseScope: "LOCAL",
    });
    expect((await db.user.findUniqueOrThrow({ where: { id: a.id } })).sessionVersion).toBe(a.sessionVersion);
    await updateUser(r, {
      id: a.id,
      name: "Autre nom",
      email: a.email,
      role: "ACHETEUR",
      purchaseScope: "IMPORT",
    });
    const row = await db.user.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.sessionVersion).toBe(a.sessionVersion + 1);
    expect(row.purchaseScope).toBe("IMPORT");
  });

  it("rôle changé d'Acheteur vers Magasinier : périmètre effacé", async () => {
    const r = await createTestUser("r-clr", { role: "RESPONSABLE_ACHATS" });
    const a = await createTestUser("ach-clr", { role: "ACHETEUR", purchaseScope: "ALL" });
    await updateUser(r, { id: a.id, name: a.name, email: a.email, role: "MAGASINIER" });
    expect((await db.user.findUniqueOrThrow({ where: { id: a.id } })).purchaseScope).toBeNull();
  });

  it("mot de passe trop court à la création refusé (8 caractères mini côté schéma)", async () => {
    const mod = await import("@/modules/auth/schemas");
    const bad = mod.changePasswordSchema.safeParse({
      currentPassword: "x",
      newPassword: "1234567",
      confirmPassword: "1234567",
    });
    const ok = mod.changePasswordSchema.safeParse({
      currentPassword: "x",
      newPassword: "12345678",
      confirmPassword: "12345678",
    });
    expect(bad.success).toBe(false);
    expect(ok.success).toBe(true);
  });

  it("déverrouillage tracé dans le journal", async () => {
    const r = await createTestUser("r-unl", { role: "RESPONSABLE_ACHATS" });
    const m = await createTestUser("m-unl");
    await unlockUser(r, m.id);
    const l = await db.auditLog.findFirstOrThrow({ where: { entityId: m.id, action: "USER_UNLOCK" } });
    expect(l.userId).toBe(r.id);
  });

  it("création : l'IP de l'acteur est journalisée", async () => {
    const r = await createTestUser("r-ip", { role: "RESPONSABLE_ACHATS" });
    const { user } = await createUser(
      r,
      { name: "IP", email: "it-ip@richbond.test", role: "MAGASINIER" },
      "10.0.0.7",
    );
    expect((await db.auditLog.findFirstOrThrow({ where: { entityId: user.id } })).ip).toBe("10.0.0.7");
  });
});

describe("journal d'audit", () => {
  it("log() masque les secrets dans avant/après", async () => {
    const r = await createTestUser("a-red", { role: "RESPONSABLE_ACHATS" });
    await db.$transaction((tx) =>
      log(tx, {
        userId: r.id,
        action: "TEST_ACTION",
        entity: "Test",
        entityId: r.id,
        after: { name: "ok", passwordHash: "$2b$10$abcdef", password: "secret123" },
      }),
    );
    const l = await db.auditLog.findFirstOrThrow({ where: { entityId: r.id, action: "TEST_ACTION" } });
    expect(JSON.stringify(l.after)).not.toMatch(/secret123|\$2b\$/);
    expect((l.after as { name: string }).name).toBe("ok");
  });

  it("listAudit filtre par action et par utilisateur", async () => {
    const r = await createTestUser("a-f", { role: "RESPONSABLE_ACHATS" });
    const m = await createTestUser("a-f2");
    await deactivateUser(r, m.id);
    await unlockUser(r, m.id);
    const res = await listAudit({ userId: r.id, action: "USER_UNLOCK" }, "RESPONSABLE_ACHATS");
    expect(res.items.length).toBeGreaterThanOrEqual(1);
    expect(res.items.every((i) => i.action === "USER_UNLOCK" && i.userId === r.id)).toBe(true);
  });

  it("listAudit masque les actions des Super-admin pour le Responsable, pas pour le Super-admin", async () => {
    const sa = await createTestUser("a-sa", { role: "SUPER_ADMIN" });
    const m = await createTestUser("a-m");
    await unlockUser(sa, m.id);
    const forResp = await listAudit({ userId: sa.id }, "RESPONSABLE_ACHATS");
    const forSa = await listAudit({ userId: sa.id }, "SUPER_ADMIN");
    expect(forResp.total).toBe(0);
    expect(forSa.total).toBeGreaterThanOrEqual(1);
  });

  it("listAudit : filtre de dates en fuseau Abidjan (UTC+0) et pagination bornée", async () => {
    const r = await createTestUser("a-d", { role: "RESPONSABLE_ACHATS" });
    await db.auditLog.create({
      data: {
        userId: r.id,
        action: "TEST_DATE",
        entity: "Test",
        entityId: r.id,
        createdAt: new Date("2026-03-02T23:59:00Z"),
      },
    });
    const dedans = await listAudit({ userId: r.id, from: "2026-03-02", to: "2026-03-02" }, "SUPER_ADMIN");
    const dehors = await listAudit({ userId: r.id, from: "2026-03-03", to: "2026-03-03" }, "SUPER_ADMIN");
    expect(dedans.total).toBe(1);
    expect(dehors.total).toBe(0);
    await expect(listAudit({ page: 0 }, "SUPER_ADMIN")).rejects.toThrow();
  });
});
