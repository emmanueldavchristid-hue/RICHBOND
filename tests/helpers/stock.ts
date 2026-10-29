import { db } from "@/lib/db";

/**
 * Supprime réceptions, non-conformités, retours, sorties, mouvements et niveaux de stock de la base de test.
 * À appeler AVANT cleanPurchaseOrders et cleanReferentials (clés étrangères). Base de test uniquement.
 */
export async function cleanStock() {
  // LOT-13 : les factures référencent BC et fournisseurs (lignes et pièces jointes en cascade).
  await db.supplierInvoice.deleteMany({});
  await db.auditLog.deleteMany({ where: { entity: "SupplierInvoice" } });
  await db.notification.deleteMany({ where: { entity: "SupplierInvoice" } });
  // LOT-11 : les inventaires référencent articles, dépôts et utilisateurs.
  await db.inventoryCountLine.deleteMany({});
  await db.inventoryCount.deleteMany({});
  await db.auditLog.deleteMany({ where: { entity: "InventoryCount" } });
  await db.stockMovement.deleteMany({ where: { reversalOfId: { not: null } } });
  await db.stockMovement.deleteMany({});
  await db.stockLevel.deleteMany({});
  await db.nonConformity.deleteMany({});
  await db.supplierReturn.deleteMany({});
  await db.stockIssue.deleteMany({});
  await db.receipt.deleteMany({});
  await db.counter.deleteMany({ where: { key: { in: ["REC", "SOR", "NC", "RET", "TRF", "AJU", "INV", "FAC"] } } });
}
