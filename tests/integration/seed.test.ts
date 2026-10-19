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
    await db.notification.deleteMany();
    await db.purchaseOrder.deleteMany(); // cascade : lignes, allocations, frais, événements, versions
    await db.counter.deleteMany({ where: { key: "BC" } });
    await db.purchaseRequest.deleteMany(); // cascade : lignes, événements, pièces jointes
    await db.counter.deleteMany({ where: { key: "DA" } });
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
    // DA fictives (LOT-04) : mêmes effectifs après deux exécutions, numéros consécutifs sans trou.
    const demo = await db.purchaseRequest.findMany({ where: { reason: { startsWith: "[démo]" } }, orderBy: { number: "asc" } });
    expect(demo).toHaveLength(11);
    const byStatus = (st: string) => demo.filter((d) => d.status === st).length;
    expect([byStatus("BROUILLON"), byStatus("SOUMISE"), byStatus("A_COMPLETER"), byStatus("VALIDEE"), byStatus("REFUSEE"), byStatus("ANNULEE")]).toEqual([2, 4, 1, 2, 1, 1]);
    expect(demo.filter((d) => d.urgency === "ARRET_PRODUCTION")).toHaveLength(1);
    expect(demo.filter((d) => d.kind === "REAPPRO")).toHaveLength(1);
    expect(demo.filter((d) => d.number === null).map((d) => d.status)).toEqual(["BROUILLON", "BROUILLON"]);
    const numbers = demo.filter((d) => d.number).map((d) => Number(d.number!.slice(-5)));
    expect(numbers.sort((a, b) => a - b)).toEqual(Array.from({ length: 9 }, (_, i) => i + 1));
    expect((await db.counter.findFirstOrThrow({ where: { key: "DA" } })).value).toBe(9);
    expect(await db.purchaseRequestEvent.count()).toBeGreaterThanOrEqual(20);
    expect(await db.purchaseRequestLine.count({ where: { freeDesignation: { not: null } } })).toBe(1);
    expect(await db.purchaseRequestLine.count({ where: { request: { kind: "REAPPRO" }, estimatedUnitPrice: { not: null } } })).toBe(0);
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
