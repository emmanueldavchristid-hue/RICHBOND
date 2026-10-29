import "server-only";
import { db } from "@/lib/db";
import { formatInTimeZone } from "date-fns-tz";
import { APP_TZ } from "@/lib/dates";
import { log } from "@/modules/audit";
import { DUMMY_HASH, verifyPassword } from "./password";
import { loginThrottle } from "./rate-limit";
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

/** Point d'entrée : limitation par e-mail + IP (message générique de verrouillage), puis authentification. */
export async function authenticate(
  rawEmail: string,
  password: string,
  now: Date = new Date(),
  ip: string | null = null,
): Promise<AuthResult> {
  const blocked = loginThrottle.blockedUntil(rawEmail, ip, now);
  if (blocked) return { ok: false, reason: "LOCKED", lockedUntil: blocked };
  const r = await authenticateInner(rawEmail, password, now, ip);
  if (r.ok) {
    loginThrottle.reset(rawEmail, ip);
  } else if (r.reason === "INVALID") {
    if (loginThrottle.recordFailure(rawEmail, ip, now)) {
      await db.$transaction((tx) =>
        log(tx, {
          userId: null,
          action: "LOGIN_THROTTLED",
          entity: "User",
          entityId: "throttle",
          after: { ip },
          ip,
        }),
      );
    }
  }
  return r;
}

async function authenticateInner(
  rawEmail: string,
  password: string,
  now: Date,
  ip: string | null,
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

  // Section critique : le verrou de ligne sérialise les tentatives concurrentes sur un même compte.
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
    const fresh = await tx.user.findUnique({ where: { id: user.id } });
    if (!fresh) return { ok: false, reason: "INVALID" } as const;
    if (!fresh.active) return { ok: false, reason: "DISABLED" } as const;
    if (fresh.lockedUntil && fresh.lockedUntil > now) {
      return { ok: false, reason: "LOCKED", lockedUntil: fresh.lockedUntil } as const;
    }

    if (!passwordOk) {
      // Un verrou expiré est remis à zéro avant de compter la nouvelle tentative.
      const previous = fresh.lockedUntil ? 0 : fresh.failedLoginCount;
      const count = previous + 1;
      if (count >= MAX_FAILED_ATTEMPTS) {
        const lockedUntil = new Date(now.getTime() + LOCK_MINUTES * 60_000);
        await tx.user.update({ where: { id: user.id }, data: { failedLoginCount: count, lockedUntil } });
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
      await tx.user.update({ where: { id: user.id }, data: { failedLoginCount: count, lockedUntil: null } });
      await log(tx, {
        userId: user.id,
        action: "LOGIN_FAILED",
        entity: "User",
        entityId: user.id,
        after: { failedLoginCount: count },
        ip,
      });
      return { ok: false, reason: "INVALID" } as const;
    }

    await tx.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
    });
    await log(tx, { userId: user.id, action: "LOGIN_SUCCESS", entity: "User", entityId: user.id, ip });
    return {
      ok: true,
      user: {
        id: fresh.id,
        name: fresh.name,
        email: fresh.email,
        role: fresh.role,
        purchaseScope: fresh.purchaseScope,
        sessionVersion: fresh.sessionVersion,
        mustChangePassword: fresh.mustChangePassword,
      },
    } as const;
  });
}
