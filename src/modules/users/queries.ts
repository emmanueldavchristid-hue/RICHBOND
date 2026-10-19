import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { listUsersSchema, type ListUsersInput } from "./schemas";
import { toPublicUser, type Actor } from "./service";

/** Liste des comptes ; les SUPER_ADMIN sont masqués au Responsable (A10). */
export async function listUsers(actor: Actor, raw: ListUsersInput = {}) {
  const f = listUsersSchema.parse(raw);
  const hideAdmin = actor.role !== "SUPER_ADMIN";
  const where: Prisma.UserWhereInput = {};
  if (f.role) where.role = f.role;
  if (hideAdmin) where.AND = [{ role: { not: "SUPER_ADMIN" } }];
  if (f.active !== undefined) where.active = f.active;
  if (f.search) {
    where.OR = [
      { name: { contains: f.search, mode: "insensitive" } },
      { email: { contains: f.search, mode: "insensitive" } },
    ];
  }
  const users = await db.user.findMany({ where, orderBy: [{ active: "desc" }, { name: "asc" }] });
  return users.map(toPublicUser);
}

/** Compte actuellement verrouillé (H12) ? */
export function isUserLocked(lockedUntil: Date | null, now: Date = new Date()): boolean {
  return !!lockedUntil && lockedUntil.getTime() > now.getTime();
}
