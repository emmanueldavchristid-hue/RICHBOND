import { db } from "@/lib/db";

export const IT_PREFIX = "IT-";

/** Devises nécessaires aux tests (idempotent, jamais supprimées). */
export async function ensureCurrencies() {
  await db.currency.upsert({
    where: { code: "XOF" },
    update: { isBase: true, active: true },
    create: { code: "XOF", name: "Franc CFA", symbol: "FCFA", decimals: 0, isBase: true },
  });
  await db.currency.upsert({
    where: { code: "EUR" },
    update: { active: true },
    create: { code: "EUR", name: "Euro", symbol: "€", decimals: 2 },
  });
}

/** Supprime tout ce que les tests ont créé (codes IT-*, devises ZZ*, taux notés IT-). */
export async function cleanReferentials() {
  const testUsers = (await db.user.findMany({ where: { email: { startsWith: "it-" } }, select: { id: true } })).map((u) => u.id);
  const mine = (c: string) => ({ OR: [{ code: { startsWith: c } }, { createdById: { in: testUsers } }] });
  const items = await db.item.findMany({ where: mine(IT_PREFIX), select: { id: true } });
  const suppliers = await db.supplier.findMany({ where: mine(IT_PREFIX), select: { id: true } });
  const warehouses = await db.warehouse.findMany({ where: { code: { startsWith: IT_PREFIX } }, select: { id: true } });
  const departments = await db.department.findMany({ where: { code: { startsWith: IT_PREFIX } }, select: { id: true } });
  const itemIds = items.map((i) => i.id);
  const supplierIds = suppliers.map((s) => s.id);
  // Articles et fournisseurs générés automatiquement (ART-/FRS-) pendant les tests : repérés par createdById de test.
  await db.itemPriceHistory.deleteMany({ where: { OR: [{ itemId: { in: itemIds } }, { supplierId: { in: supplierIds } }] } });
  await db.itemSupplier.deleteMany({ where: { OR: [{ itemId: { in: itemIds } }, { supplierId: { in: supplierIds } }] } });
  await db.item.updateMany({ where: { id: { in: itemIds } }, data: { mainSupplierId: null } });
  await db.item.deleteMany({ where: { id: { in: itemIds } } });
  await db.supplierContact.deleteMany({ where: { supplierId: { in: supplierIds } } });
  await db.supplier.deleteMany({ where: { id: { in: supplierIds } } });
  await db.warehouse.deleteMany({ where: { id: { in: warehouses.map((w) => w.id) } } });
  await db.department.deleteMany({ where: { id: { in: departments.map((d) => d.id) } } });
  await db.exchangeRate.deleteMany({ where: { note: { startsWith: IT_PREFIX } } });
  await db.exchangeRate.deleteMany({ where: { currencyCode: { startsWith: "ZZ" } } });
  await db.currency.deleteMany({ where: { code: { startsWith: "ZZ" } } });
  await db.setting.deleteMany({ where: { key: "warehouse.showPurchasePrice" } });
  const ids = [...itemIds, ...supplierIds];
  await db.auditLog.deleteMany({
    where: {
      OR: [
        { entityId: { in: ids } },
        { entity: { in: ["Currency", "ExchangeRate", "Setting", "Warehouse", "Department", "ItemSupplier", "SupplierContact"] } },
      ],
    },
  });
}
