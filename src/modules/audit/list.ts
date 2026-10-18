import "server-only";
import { fromZonedTime } from "date-fns-tz";
import { z } from "zod";
import { db } from "@/lib/db";
import { APP_TZ } from "@/lib/dates";
import type { Prisma } from "@/generated/prisma/client";

export const PAGE_SIZE = 50;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const auditFiltersSchema = z.object({
  userId: z.string().optional(),
  action: z.string().optional(),
  entity: z.string().optional(),
  from: day.optional(),
  to: day.optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export type AuditFilters = z.input<typeof auditFiltersSchema>;

/** Journal filtré ; les comptes SUPER_ADMIN sont masqués sauf pour un SUPER_ADMIN. */
export async function listAudit(raw: AuditFilters, viewerRole: string) {
  const f = auditFiltersSchema.parse(raw);
  const where: Prisma.AuditLogWhereInput = {};
  if (f.userId) where.userId = f.userId;
  if (f.action) where.action = f.action;
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
  return { total, page: f.page, pageSize: PAGE_SIZE, items };
}
