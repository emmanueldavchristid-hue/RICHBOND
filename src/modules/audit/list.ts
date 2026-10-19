import "server-only";
import { fromZonedTime } from "date-fns-tz";
import { z } from "zod";
import { db } from "@/lib/db";
import { APP_TZ } from "@/lib/dates";
import type { Prisma } from "@/generated/prisma/client";

export const PAGE_SIZE = 50;

/** Événements de session, masqués par défaut pour laisser voir les opérations métier. */
export const SESSION_NOISE_ACTIONS = ["LOGIN_SUCCESS", "LOGOUT"] as const;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const auditFiltersSchema = z.object({
  userId: z.string().optional(),
  action: z.string().optional(),
  entity: z.string().optional(),
  from: day.optional(),
  to: day.optional(),
  /** "1" = afficher aussi connexions réussies et déconnexions (masquées par défaut). */
  showAuth: z.enum(["1"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export type AuditFilters = z.input<typeof auditFiltersSchema>;

/** Journal filtré ; les comptes SUPER_ADMIN sont masqués sauf pour un SUPER_ADMIN. */
export async function listAudit(raw: AuditFilters, viewerRole: string) {
  const f = auditFiltersSchema.parse(raw);
  const where: Prisma.AuditLogWhereInput = {};
  if (f.userId) where.userId = f.userId;
  if (f.action) where.action = f.action;
  else if (f.showAuth !== "1") where.action = { notIn: [...SESSION_NOISE_ACTIONS] };
  if (f.entity) where.entity = f.entity;
  if (f.from || f.to) {
    where.createdAt = {
      ...(f.from ? { gte: fromZonedTime(`${f.from}T00:00:00`, APP_TZ) } : {}),
      ...(f.to ? { lt: new Date(fromZonedTime(`${f.to}T00:00:00`, APP_TZ).getTime() + 24 * 3600 * 1000) } : {}),
    };
  }
  if (viewerRole !== "SUPER_ADMIN") {
    where.NOT = { user: { role: "SUPER_ADMIN" } };
  }
  const [total, items] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (f.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { name: true, email: true } } },
    }),
  ]);
  // Libellé lisible de l'élément concerné (nom pour un utilisateur) à la place de l'id technique.
  const userIds = [...new Set(items.filter((i) => i.entity === "User").map((i) => i.entityId))];
  const targets = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
    : [];
  const names = new Map(targets.map((t) => [t.id, `${t.name} (${t.email})`]));
  const withRef = items.map((i) => ({
    ...i,
    entityRef: i.entity === "User" ? (names.get(i.entityId) ?? "Compte supprimé ou inconnu") : i.entityId,
  }));
  return { total, page: f.page, pageSize: PAGE_SIZE, items: withRef };
}

/** Dernières entrées du journal pour une fiche (onglet « Journal » d'un article ou d'un fournisseur). */
export async function listEntityAudit(
  entity: string,
  entityId: string,
  limit = 50,
  /** Entités liées dont les opérations remontent aussi dans la fiche (ex. liens article-fournisseur, contacts). */
  related: { entity: string; ids: string[] }[] = [],
) {
  const scopes: Prisma.AuditLogWhereInput[] = [
    { entity, entityId },
    ...related.filter((r) => r.ids.length > 0).map((r) => ({ entity: r.entity, entityId: { in: r.ids } })),
  ];
  return db.auditLog.findMany({
    where: { OR: scopes, NOT: { user: { role: "SUPER_ADMIN" } } },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 200),
    include: { user: { select: { name: true } } },
  });
}
