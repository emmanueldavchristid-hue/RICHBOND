import { rm } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";

/**
 * Supprime tous les BC de la base de test (comptes `it-*`, seed, scénarios e2e),
 * avec leurs notifications, journaux, compteurs BC et réglages `purchaseOrder.*`. Base de test uniquement.
 * À appeler AVANT de nettoyer DA, référentiels et comptes (clés étrangères).
 */
export async function cleanPurchaseOrders() {
  const users = (await db.user.findMany({ where: { email: { startsWith: "it-" } }, select: { id: true } })).map((u) => u.id);
  // Tous les BC de la base de test : ceux des scénarios e2e (comptes du seed) fausseraient sinon les compteurs et les listes.
  const orders = await db.purchaseOrder.findMany({ select: { id: true } });
  const ids = orders.map((o) => o.id);
  await db.notification.deleteMany({ where: { OR: [{ recipientId: { in: users } }, { entityId: { in: ids } }] } });
  await db.auditLog.deleteMany({ where: { entity: "PurchaseOrder", entityId: { in: ids } } });
  // Journal de l'avenant/validation écrit sur des DA : conservé (nettoyé avec les DA).
  await db.purchaseOrder.deleteMany({ where: { id: { in: ids } } });
  await db.counter.deleteMany({ where: { key: "BC" } });
  await db.setting.deleteMany({ where: { key: { startsWith: "purchaseOrder." } } });
  await db.setting.deleteMany({ where: { key: { startsWith: "company." } } });
  // Logo de test (BRANDING_DIR défini par vitest.config.ts) : jamais le dossier réel.
  if (process.env.BRANDING_DIR) await rm(path.resolve(process.env.BRANDING_DIR), { recursive: true, force: true });
}
