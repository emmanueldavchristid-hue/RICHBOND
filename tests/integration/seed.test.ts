import { execSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cleanStock } from "../helpers/stock";

afterAll(async () => {
  await db.$disconnect();
});

describe("seed idempotent", () => {
  it("exécuté deux fois : pas de doublon", async () => {
    // Base de test uniquement (DATABASE_URL forcé à DATABASE_URL_TEST par vitest.config.ts).
    await cleanStock(); // réceptions (LOT-06), mouvements et niveaux référencent les BC et les articles
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
    expect([byStatus("BROUILLON"), byStatus("SOUMISE"), byStatus("A_COMPLETER"), byStatus("VALIDEE"), byStatus("REFUSEE"), byStatus("ANNULEE")]).toEqual([2, 4, 1, 0, 1, 1]); // les 2 DA validées sont commandées par les BC fictifs (LOT-05)
    expect([byStatus("PARTIELLEMENT_COMMANDEE"), byStatus("COMMANDEE")]).toEqual([1, 1]);
    expect(demo.filter((d) => d.urgency === "ARRET_PRODUCTION")).toHaveLength(1);
    expect(demo.filter((d) => d.kind === "REAPPRO")).toHaveLength(1);
    expect(demo.filter((d) => d.number === null).map((d) => d.status)).toEqual(["BROUILLON", "BROUILLON"]);
    const numbers = demo.filter((d) => d.number).map((d) => Number(d.number!.slice(-5)));
    expect(numbers.sort((a, b) => a - b)).toEqual(Array.from({ length: 9 }, (_, i) => i + 1));
    expect((await db.counter.findFirstOrThrow({ where: { key: "DA" } })).value).toBe(9 + 42 + 4); // 9 DA du LOT-04 + 46 DA de l'historique LOT-08
    expect(await db.purchaseRequestEvent.count()).toBeGreaterThanOrEqual(20);
    expect(await db.purchaseRequestLine.count({ where: { freeDesignation: { not: null } } })).toBe(1);
    expect(await db.purchaseRequestLine.count({ where: { request: { kind: "REAPPRO" }, estimatedUnitPrice: { not: null } } })).toBe(0);
    // BC fictifs (LOT-05) : mêmes effectifs après deux exécutions, numéros consécutifs sans trou, statuts cohérents.
    const bc = await db.purchaseOrder.findMany({ where: { events: { some: { payload: { path: ["seedKey"], string_starts_with: "lot05:" } } } }, orderBy: { createdAt: "asc" }, include: { lines: { include: { allocations: true } }, versions: true } });
    expect(bc).toHaveLength(11);
    const bcStatus = (st: string) => bc.filter((o) => o.status === st).length;
    expect([bcStatus("BROUILLON"), bcStatus("A_VALIDER"), bcStatus("VALIDE"), bcStatus("ENVOYE"), bcStatus("CONFIRME"), bcStatus("RECU") + bcStatus("CLOTURE"), bcStatus("ANNULE")]).toEqual([1, 1, 4, 1, 1, 1, 1]); // RECU ou CLOTURE (facturé en totalité par le seed LOT-13) // le BC des EPI est livré en partie par la réception fictive (LOT-06)
    expect(bcStatus("PARTIELLEMENT_RECU")).toBe(1);
    const bcNumbers = bc.filter((o) => o.number).map((o) => Number(o.number!.slice(-5))).sort((a, b) => a - b);
    expect(bcNumbers).toEqual(Array.from({ length: 9 }, (_, i) => i + 1));
    expect(bc.filter((o) => !o.number).map((o) => o.status).sort()).toEqual(["A_VALIDER", "BROUILLON"]);
    expect((await db.counter.findFirstOrThrow({ where: { key: "BC" } })).value).toBe(9 + 41); // 9 BC du LOT-05 + 41 BC validés de l'historique LOT-08 (le 42e reste à valider)
    // Réceptions fictives (LOT-06) : créées par le service, une seule fois malgré deux exécutions.
    const receipts = await db.receipt.findMany({ orderBy: { number: "asc" }, include: { lines: true } });
    expect(receipts.slice(0, 2).map((r) => r.number.slice(-5))).toEqual(["00001", "00002"]);
    expect(await db.nonConformity.count({ where: { status: "OUVERTE" } })).toBe(1 + 2); // 1 du LOT-06 + 2 de l'historique LOT-08
    expect(await db.stockMovement.count({ where: { type: "ENTREE_RECEPTION", receiptLineId: { not: null } } })).toBeGreaterThanOrEqual(2);
    // Stock fictif (LOT-07) : 6 mois de sorties via applyMovement, un critique sous son point de commande, 2 dormants, ABC.
    const r6205 = await db.item.findFirstOrThrow({ where: { name: "Roulement 6205" } });
    expect(Number((await db.stockLevel.findFirstOrThrow({ where: { itemId: r6205.id } })).quantity)).toBe(25);
    expect(await db.stockMovement.count({ where: { itemId: r6205.id, type: "SORTIE" } })).toBe(26);
    expect(r6205.abcClass).not.toBeNull();
    expect(await db.stockMovement.count({ where: { comment: { contains: "seed LOT-07" } } })).toBe(await db.stockMovement.count({ where: { comment: { contains: "seed LOT-07" }, documentRef: { contains: "-DEMO-" } } }));
    expect(await db.item.count({ where: { stocked: true, abcClass: "A" } })).toBeGreaterThanOrEqual(1);
    const dormantNames = ["Variateur de fréquence 7,5 kW", "Buse de mélange"];
    expect(await db.stockMovement.count({ where: { item: { name: { in: dormantNames } }, type: "SORTIE" } })).toBe(0);
    expect(await db.stockLevel.count({ where: { quantity: { gt: 0 } } })).toBeGreaterThanOrEqual(9);
    // Historique fictif sur 6 mois (LOT-08) : BC validés répartis sur 6 mois, reçus pour la plupart, quelques retards, tout via les services.
    const history = await db.purchaseOrder.findMany({ where: { internalNote: { startsWith: "seed:lot08:" } }, include: { receipts: true } });
    expect(history).toHaveLength(42);
    expect(history.filter((o) => o.approvedAt).length).toBe(41);
    const monthsCovered = new Set(history.filter((o) => o.approvedAt).map((o) => o.approvedAt!.toISOString().slice(0, 7)));
    expect(monthsCovered.size).toBeGreaterThanOrEqual(6);
    expect(history.filter((o) => o.type === "IMPORT").length).toBeGreaterThanOrEqual(8);
    expect(history.filter((o) => o.receipts.some((r) => r.daysLate > 0)).length).toBeGreaterThanOrEqual(5);
    expect(history.filter((o) => o.receipts.length > 0).length).toBeGreaterThanOrEqual(25);
    expect(await db.receipt.count({ where: { daysLate: { gt: 0 } } })).toBeGreaterThanOrEqual(5);
    expect(await db.purchaseRequest.count({ where: { status: "SOUMISE", reason: { startsWith: "[démo historique DA" } } })).toBe(2);
    expect(await db.purchaseRequest.count({ where: { status: "VALIDEE", assignedBuyerId: { not: null }, reason: { startsWith: "[démo historique DA" } } })).toBe(2);
    expect(await db.stockMovement.count({ where: { comment: { contains: "seed LOT-08" }, type: "SORTIE", stockAfter: 0 } })).toBeGreaterThanOrEqual(3);
    const amended = bc.filter((o) => o.version === 2);
    expect(amended).toHaveLength(1);
    expect(amended[0].versions.map((v) => v.version).sort()).toEqual([1, 2]);
    expect(bc.filter((o) => o.type === "IMPORT" && o.currencyCode !== "XOF" && o.exchangeRate !== null)).toHaveLength(2);
    expect(bc.filter((o) => o.incoterm === "FOB" && o.incotermPlace === "Shanghai")).toHaveLength(2);
    expect(bc.find((o) => o.status === "A_VALIDER")!.lines[0].priceDeltaPct?.toString()).toBe("30");
    expect(bc.filter((o) => o.lines.some((l) => l.allocations.length > 0))).toHaveLength(4);
    expect(await db.purchaseOrderEvent.count()).toBeGreaterThanOrEqual(30);
    expect(await db.auditLog.count({ where: { entity: "PurchaseOrder" } })).toBeGreaterThanOrEqual(30);
    expect(await db.setting.count({ where: { key: { in: ["company.name", "company.address", "purchaseOrder.pdfFooter"] } } })).toBe(3);
    expect(await db.warehouse.count({ where: { address: { not: null } } })).toBeGreaterThanOrEqual(2);
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
