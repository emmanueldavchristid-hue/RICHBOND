import "server-only";
import { db } from "@/lib/db";
import { now } from "@/lib/clock";
import type { NotificationSeverity, Prisma } from "@/generated/prisma/client";

export interface NotifyInput {
  type: string;
  severity?: NotificationSeverity;
  title: string;
  body?: string | null;
  /** Chemin interne de l'application (ex. `/achats/demandes/<id>`). */
  link: string;
  entity?: string;
  entityId?: string;
}

/** Crée une notification par destinataire (dédoublonnés), dans la transaction de l'opération métier. */
export async function notify(
  tx: Pick<Prisma.TransactionClient, "notification">,
  recipientIds: Iterable<string>,
  n: NotifyInput,
): Promise<number> {
  const ids = [...new Set(recipientIds)];
  if (ids.length === 0) return 0;
  const r = await tx.notification.createMany({
    data: ids.map((recipientId) => ({
      recipientId,
      type: n.type,
      severity: n.severity ?? "INFO",
      title: n.title,
      body: n.body ?? null,
      link: n.link,
      entity: n.entity ?? null,
      entityId: n.entityId ?? null,
    })),
  });
  return r.count;
}

export interface NotificationRow {
  id: string;
  type: string;
  severity: NotificationSeverity;
  title: string;
  body: string | null;
  link: string;
  readAt: Date | null;
  createdAt: Date;
}

export async function unreadCount(userId: string): Promise<number> {
  return db.notification.count({ where: { recipientId: userId, readAt: null } });
}

/** Les plus récentes d'abord (lues ou non), avec le compteur de non lues. */
export async function listMine(userId: string, opts: { limit?: number } = {}): Promise<{ unread: number; items: NotificationRow[] }> {
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50);
  const [unread, items] = await Promise.all([
    unreadCount(userId),
    db.notification.findMany({
      where: { recipientId: userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      select: { id: true, type: true, severity: true, title: true, body: true, link: true, readAt: true, createdAt: true },
    }),
  ]);
  return { unread, items };
}

/** Marque lue une notification du destinataire (les autres ne sont jamais touchées). */
export async function markRead(userId: string, id: string, at: Date = now()): Promise<number> {
  const r = await db.notification.updateMany({ where: { id, recipientId: userId, readAt: null }, data: { readAt: at } });
  return r.count;
}

export async function markAllRead(userId: string, at: Date = now()): Promise<number> {
  const r = await db.notification.updateMany({ where: { recipientId: userId, readAt: null }, data: { readAt: at } });
  return r.count;
}
