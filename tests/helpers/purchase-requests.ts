import { rm } from "node:fs/promises";
import path from "node:path";
import { formatInTimeZone } from "date-fns-tz";
import { db } from "@/lib/db";
import { cleanPurchaseOrders } from "./purchase-orders";

export const FUTURE_DAY = (days = 14) =>
  formatInTimeZone(new Date(Date.now() + days * 86_400_000), "Africa/Abidjan", "yyyy-MM-dd");

/** Supprime les DA, notifications, pièces jointes et compteurs créés par les tests (comptes `it-*`). Base de test uniquement. */
export async function cleanPurchaseRequests() {
  await cleanPurchaseOrders(); // les BC référencent les lignes de DA : à supprimer d'abord
  const users = (
    await db.user.findMany({ where: { email: { startsWith: "it-" } }, select: { id: true } })
  ).map((u) => u.id);
  // DA du seed (« [démo] ») : retirées de la base de test pour que les listes soient prévisibles.
  // Les DA laissées par les scénarios e2e (comptes du seed) sont retirées aussi : base de test uniquement.
  const prs = await db.purchaseRequest.findMany({ select: { id: true } });
  const ids = prs.map((p) => p.id);
  await db.notification.deleteMany({
    where: { OR: [{ recipientId: { in: users } }, { entityId: { in: ids } }] },
  });
  await db.auditLog.deleteMany({ where: { entity: "PurchaseRequest", entityId: { in: ids } } });
  await db.purchaseRequest.deleteMany({ where: { id: { in: ids } } });
  await db.counter.deleteMany({ where: { key: "DA" } });
  await db.setting.deleteMany({ where: { key: "purchaseRequest.approvalThreshold" } });
  for (const id of ids)
    await rm(path.resolve(process.cwd(), "storage", "purchase-requests", id), {
      recursive: true,
      force: true,
    });
}

/** Les comptes du seed (base de test partagée) ne doivent pas être candidats à l'assignation automatique. */
export async function parkSeedBuyers(): Promise<() => Promise<void>> {
  const seeded = await db.user.findMany({
    where: { role: "ACHETEUR", active: true, NOT: { email: { startsWith: "it-" } } },
    select: { id: true },
  });
  const ids = seeded.map((u) => u.id);
  await db.user.updateMany({ where: { id: { in: ids } }, data: { active: false } });
  return async () => {
    await db.user.updateMany({ where: { id: { in: ids } }, data: { active: true } });
  };
}
