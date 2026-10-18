import "server-only";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/errors";
import { log } from "@/modules/audit";
import { generateTemporaryPassword, hashPassword, verifyPassword } from "@/modules/auth/password";
import { changePasswordSchema } from "@/modules/auth/schemas";
import { createUserSchema, updateUserSchema, type CreateUserInput, type UpdateUserInput } from "./schemas";
import { Prisma, type Role, type User } from "@/generated/prisma/client";

export interface Actor {
  id: string;
  role: Role;
}

/** Vue publique d'un utilisateur : jamais de hash. */
export function toPublicUser(u: User) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    purchaseScope: u.purchaseScope,
    active: u.active,
    lastLoginAt: u.lastLoginAt,
    lockedUntil: u.lockedUntil,
    mustChangePassword: u.mustChangePassword,
  };
}

const notFound = () => new BusinessError("USER_NOT_FOUND", "Utilisateur introuvable.");

async function loadManaged(tx: Prisma.TransactionClient, actor: Actor, id: string): Promise<User> {
  const u = await tx.user.findUnique({ where: { id } });
  // A10 : un compte super-admin n'existe pas pour le Responsable.
  if (!u || (u.role === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN")) throw notFound();
  return u;
}

function assertRoleAssignable(actor: Actor, role: Role) {
  if (role === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN") {
    throw new BusinessError("FORBIDDEN", "Vous n'avez pas les droits pour cette action.");
  }
}

async function assertNotLastResponsable(tx: Prisma.TransactionClient, target: User) {
  if (target.role !== "RESPONSABLE_ACHATS" || !target.active) return;
  const others = await tx.user.count({
    where: { role: "RESPONSABLE_ACHATS", active: true, id: { not: target.id } },
  });
  if (others === 0) {
    throw new BusinessError(
      "LAST_RESPONSABLE",
      "Impossible : il doit rester au moins un Responsable Achats actif.",
    );
  }
}

const emailTaken = () => new BusinessError("EMAIL_TAKEN", "Cette adresse email est déjà utilisée.");

function mapUnique(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw emailTaken();
  throw e;
}

export async function createUser(actor: Actor, raw: CreateUserInput, ip?: string | null) {
  const input = createUserSchema.parse(raw);
  assertRoleAssignable(actor, input.role);
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  try {
    const user = await db.$transaction(async (tx) => {
      if (await tx.user.findUnique({ where: { email: input.email } })) throw emailTaken();
      const created = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          role: input.role,
          purchaseScope: input.role === "ACHETEUR" ? input.purchaseScope : null,
          passwordHash,
          mustChangePassword: true,
          createdById: actor.id,
        },
      });
      await log(tx, {
        userId: actor.id,
        action: "USER_CREATE",
        entity: "User",
        entityId: created.id,
        after: toPublicUser(created),
        ip,
      });
      return created;
    });
    return { user: toPublicUser(user), temporaryPassword };
  } catch (e) {
    return mapUnique(e);
  }
}

export async function updateUser(actor: Actor, raw: UpdateUserInput, ip?: string | null) {
  const input = updateUserSchema.parse(raw);
  assertRoleAssignable(actor, input.role);
  try {
    const user = await db.$transaction(async (tx) => {
      const before = await loadManaged(tx, actor, input.id);
      const other = await tx.user.findUnique({ where: { email: input.email } });
      if (other && other.id !== before.id) throw emailTaken();
      const roleChanged = before.role !== input.role;
      if (roleChanged && before.id === actor.id) {
        throw new BusinessError("SELF_ROLE", "Vous ne pouvez pas modifier votre propre rôle.");
      }
      if (roleChanged) await assertNotLastResponsable(tx, before);
      const scope = input.role === "ACHETEUR" ? (input.purchaseScope ?? null) : null;
      const scopeChanged = (before.purchaseScope ?? null) !== scope;
      const after = await tx.user.update({
        where: { id: before.id },
        data: {
          name: input.name,
          email: input.email,
          role: input.role,
          purchaseScope: scope,
          ...(roleChanged || scopeChanged ? { sessionVersion: { increment: 1 } } : {}),
        },
      });
      await log(tx, {
        userId: actor.id,
        action: "USER_UPDATE",
        entity: "User",
        entityId: before.id,
        before: toPublicUser(before),
        after: toPublicUser(after),
        ip,
      });
      return after;
    });
    return toPublicUser(user);
  } catch (e) {
    return mapUnique(e);
  }
}

export async function resetPassword(actor: Actor, id: string, ip?: string | null) {
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  await db.$transaction(async (tx) => {
    const target = await loadManaged(tx, actor, id);
    await tx.user.update({
      where: { id: target.id },
      data: {
        passwordHash,
        mustChangePassword: true,
        passwordChangedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
        sessionVersion: { increment: 1 },
      },
    });
    await log(tx, { userId: actor.id, action: "USER_PASSWORD_RESET", entity: "User", entityId: target.id, ip });
  });
  return { temporaryPassword };
}

export async function deactivateUser(actor: Actor, id: string, ip?: string | null) {
  await db.$transaction(async (tx) => {
    const target = await loadManaged(tx, actor, id);
    if (target.id === actor.id) {
      throw new BusinessError("SELF_DEACTIVATE", "Vous ne pouvez pas désactiver votre propre compte.");
    }
    if (!target.active) return;
    await assertNotLastResponsable(tx, target);
    await tx.user.update({
      where: { id: target.id },
      data: { active: false, deactivatedAt: new Date(), sessionVersion: { increment: 1 } },
    });
    await log(tx, {
      userId: actor.id,
      action: "USER_DEACTIVATE",
      entity: "User",
      entityId: target.id,
      before: { active: true },
      after: { active: false },
      ip,
    });
  });
}

export async function reactivateUser(actor: Actor, id: string, ip?: string | null) {
  await db.$transaction(async (tx) => {
    const target = await loadManaged(tx, actor, id);
    if (target.active) return;
    await tx.user.update({
      where: { id: target.id },
      data: { active: true, deactivatedAt: null, failedLoginCount: 0, lockedUntil: null },
    });
    await log(tx, {
      userId: actor.id,
      action: "USER_REACTIVATE",
      entity: "User",
      entityId: target.id,
      before: { active: false },
      after: { active: true },
      ip,
    });
  });
}

/** Déverrouillage anticipé par le Responsable (H12). */
export async function unlockUser(actor: Actor, id: string, ip?: string | null) {
  await db.$transaction(async (tx) => {
    const target = await loadManaged(tx, actor, id);
    await tx.user.update({ where: { id: target.id }, data: { failedLoginCount: 0, lockedUntil: null } });
    await log(tx, { userId: actor.id, action: "USER_UNLOCK", entity: "User", entityId: target.id, ip });
  });
}

export async function changeOwnPassword(userId: string, raw: unknown, ip?: string | null) {
  const input = changePasswordSchema.parse(raw);
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound();
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new BusinessError("WRONG_PASSWORD", "Le mot de passe actuel est incorrect.");
  }
  if (input.currentPassword === input.newPassword) {
    throw new BusinessError("SAME_PASSWORD", "Le nouveau mot de passe doit être différent de l'ancien.");
  }
  if (input.newPassword.toLowerCase() === user.email) {
    throw new BusinessError("WEAK_PASSWORD", "Le mot de passe ne peut pas être votre adresse email.");
  }
  const passwordHash = await hashPassword(input.newPassword);
  await db.$transaction(async (tx) => {
    // sessionVersion inchangé : la session courante reste valide.
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date() },
    });
    await log(tx, { userId, action: "PASSWORD_CHANGE", entity: "User", entityId: userId, ip });
  });
}
