import "server-only";
import { db } from "@/lib/db";
import { formatInTimeZone } from "date-fns-tz";
import { APP_TZ } from "@/lib/dates";
import { log } from "@/modules/audit";
import { DUMMY_HASH, verifyPassword } from "./password";
import type { PurchaseScope, Role } from "@/generated/prisma/client";

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  purchaseScope: PurchaseScope | null;
  sessionVersion: number;
  mustChangePassword: boolean;
}

export type AuthResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; reason: "INVALID" | "DISABLED" }
  | { ok: false; reason: "LOCKED"; lockedUntil: Date };

export const AUTH_MESSAGES = {
  INVALID: "Email ou mot de passe incorrect.",
  DISABLED: "Compte désactivé, contactez le Responsable Achats.",
  lockedUntil: (d: Date) => `Compte verrouillé, réessayez après ${formatInTimeZone(d, APP_TZ, "HH:mm")}.`,
} as const;

export function authMessage(r: Extract<AuthResult, { ok: false }>): string {
  if (r.reason === "LOCKED") return AUTH_MESSAGES.lockedUntil(r.lockedUntil);
  return AUTH_MESSAGES[r.reason];
}

export async function authenticate(
  rawEmail: string,
  password: string,
  now: Date = new Date(),
  ip: string | null = null,
): Promise<AuthResult> {
  const email = rawEmail.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email } });

  // Comparaison toujours exécutée (temps constant, pas d'énumération d'emails).
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user) return { ok: false, reason: "INVALID" };
  if (!user.active) return { ok: false, reason: "DISABLED" };
  if (user.lockedUntil && user.lockedUntil > now) {
    return { ok: false, reason: "LOCKED", lockedUntil: user.lockedUntil };
  }

  if (!passwordOk) {
    return db.$transaction(async (tx) => {
      // Incrément atomique ; si un verrou expiré traîne, on repart de zéro.
      const base = user.lockedUntil ? { failedLoginCount: 0, lockedUntil: null } : {};
      if (user.lockedUntil) await tx.user.update({ where: { id: user.id }, data: base });
      const updated = await tx.user.update({
        where: { id: user.id },
        data: { failedLoginCount: { increment: 1 } },
        select: { failedLoginCount: true },
      });
      if (updated.failedLoginCount >= MAX_FAILED_ATTEMPTS) {
        const lockedUntil = new Date(now.getTime() + LOCK_MINUTES * 60_000);
        await tx.user.update({ where: { id: user.id }, data: { lockedUntil } });
        await log(tx, {
          userId: user.id,
          action: "ACCOUNT_LOCKED",
          entity: "User",
          entityId: user.id,
          after: { lockedUntil: lockedUntil.toISOString() },
          ip,
        });
        return { ok: false, reason: "LOCKED", lockedUntil } as const;
      }
      await log(tx, {
        userId: user.id,
        action: "LOGIN_FAILED",
        entity: "User",
        entityId: user.id,
        after: { failedLoginCount: updated.failedLoginCount },
        ip,
      });
      return { ok: false, reason: "INVALID" } as const;
    });
  }

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
    });
    await log(tx, { userId: user.id, action: "LOGIN_SUCCESS", entity: "User", entityId: user.id, ip });
  });

  return {
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      purchaseScope: user.purchaseScope,
      sessionVersion: user.sessionVersion,
      mustChangePassword: user.mustChangePassword,
    },
  };
}
