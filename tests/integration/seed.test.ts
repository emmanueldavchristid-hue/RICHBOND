import { execSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";

afterAll(async () => {
  await db.$disconnect();
});

describe("seed idempotent", () => {
  it("exécuté deux fois : pas de doublon", async () => {
    // Base de test uniquement (DATABASE_URL forcé à DATABASE_URL_TEST par vitest.config.ts).
    await db.auditLog.deleteMany();
    await db.user.deleteMany();
    await db.license.deleteMany();
    await db.itemPriceHistory.deleteMany();
    await db.itemSupplier.deleteMany();
    await db.item.deleteMany();
    await db.supplierContact.deleteMany();
    await db.supplier.deleteMany();
    await db.counter.deleteMany({ where: { key: { in: ["ART", "FRS"] } } });
    const run = () =>
      execSync("npx tsx prisma/seed.ts", {
        stdio: "pipe",
        env: {
          ...process.env,
          DATABASE_URL: process.env.DATABASE_URL!,
          SEED_DEFAULT_PASSWORD: "Test-seed-2026",
        },
      });
    run();
    run();
    expect(await db.user.count()).toBe(5);
    expect(await db.license.count()).toBe(1);
    // Référentiels fictifs (LOT-03) : mêmes effectifs après deux exécutions.
    expect(await db.item.count({ where: { code: { startsWith: "ART-" } } })).toBe(40);
    expect(await db.supplier.count({ where: { code: { startsWith: "FRS-" } } })).toBe(25);
    expect(await db.warehouse.count()).toBeGreaterThanOrEqual(2);
    expect(await db.department.count({ where: { code: { in: ["PROD", "MAINT", "QUAL", "LOG", "ADM", "DIR"] } } })).toBe(6);
    expect(await db.currency.count({ where: { code: { in: ["XOF", "EUR", "USD", "CNY"] } } })).toBe(4);
    expect(await db.supplier.count({ where: { status: "BLOQUE", code: { startsWith: "FRS-" }, blockedReason: { not: null } } })).toBe(1);
    expect(await db.supplier.count({ where: { status: "EN_EVALUATION", code: { startsWith: "FRS-" } } })).toBe(2);
    expect(await db.item.count({ where: { category: "SERVICE", stocked: true } })).toBe(0);
    expect(await db.itemSupplier.count()).toBeGreaterThanOrEqual(60);
    // I1/I2 : prix par unité d'achat, avec unité ; taux figé sur chaque ligne d'historique en devise.
    const links = await db.itemSupplier.findMany({ where: { lastPrice: { not: null } }, include: { item: true } });
    expect(links.length).toBeGreaterThanOrEqual(60);
    expect(links.every((l) => l.priceUnit === l.item.purchaseUnit)).toBe(true);
    const polyol = links.find((l) => l.item.name.startsWith("Polyol") && l.currencyCode === "EUR");
    expect(polyol?.lastPrice?.toString()).toBe("380"); // 1,9 EUR/kg x 200 kg par fût
    const roulement = await db.item.findFirstOrThrow({ where: { name: "Roulement 6205" } });
    expect(roulement.purchaseUnit).toBe("U");
    expect(await db.itemPriceHistory.count({ where: { currencyCode: { not: "XOF" }, rateToXof: null } })).toBe(0);
    expect(await db.itemPriceHistory.count({ where: { priceUnit: null } })).toBe(0);
    const supplier = await db.supplier.findFirstOrThrow({ where: { code: "FRS-00001" } });
    expect(supplier.address && supplier.phone && supplier.email && supplier.bankDetails).toBeTruthy();
    expect((await db.counter.findUniqueOrThrow({ where: { key_year: { key: "ART", year: 0 } } })).value).toBeGreaterThanOrEqual(40);
  }, 60_000);
});
