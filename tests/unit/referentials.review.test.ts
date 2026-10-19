import { describe, expect, it } from "vitest";
import { isRateDeviationAbove, rateDeviation } from "@/modules/currencies/rate";
import { targetMatches, toSnake } from "@/modules/referentials/db-errors";
import { UNITS } from "@/modules/referentials/units";
import { createItemSchema } from "@/modules/items/schemas";

describe("db-errors : cibles P2002 en camelCase ou snake_case", () => {
  it("toSnake", () => {
    expect(toSnake("itemId")).toBe("item_id");
    expect(toSnake("item_id")).toBe("item_id");
    expect(toSnake("currencyCode")).toBe("currency_code");
  });
  it("targetMatches", () => {
    expect(targetMatches("itemId", "item_id")).toBe(true);
    expect(targetMatches("item_id", "itemId")).toBe(true);
    expect(targetMatches("item_suppliers_item_id_supplier_id_key", "item_id")).toBe(true);
    expect(targetMatches("items_code_key", "code")).toBe(true);
    expect(targetMatches("code", "code")).toBe(true);
    expect(targetMatches("currency_code", "code")).toBe(false);
    expect(targetMatches("barcode", "code")).toBe(false);
  });
});

describe("écart de taux", () => {
  it("rateDeviation", () => {
    expect(rateDeviation("100", "120")).toBeCloseTo(0.2);
    expect(rateDeviation("100", "80")).toBeCloseTo(0.2);
    expect(rateDeviation("0", "5")).toBe(Number.POSITIVE_INFINITY);
  });
  it("seuil strict de 20 %", () => {
    expect(isRateDeviationAbove("100", "120")).toBe(false);
    expect(isRateDeviationAbove("100", "120.01")).toBe(true);
    expect(isRateDeviationAbove("100", "79")).toBe(true);
    expect(isRateDeviationAbove("605", "610")).toBe(false);
  });
});

describe("unités", () => {
  it("BOBINE, BIDON et PCE existent", () => {
    for (const u of ["BOBINE", "BIDON", "PCE"]) expect(UNITS).toContain(u);
  });
});

describe("article : même unité d'achat et de stock", () => {
  const base = { name: "Article", category: "FOURNITURE", stockUnit: "KG", purchaseUnit: "KG" };
  it("coefficient ≠ 1 refusé sur conversionFactor", () => {
    const r = createItemSchema.safeParse({ ...base, conversionFactor: 12 });
    expect(r.success).toBe(false);
    if (!r.success) {
      const i = r.error.issues.find((x) => x.path[0] === "conversionFactor");
      expect(i?.message).toMatch(/doit être 1/);
    }
  });
  it("coefficient 1 (par défaut) accepté ; unités différentes avec coefficient accepté", () => {
    expect(createItemSchema.safeParse(base).success).toBe(true);
    expect(createItemSchema.safeParse({ ...base, purchaseUnit: "SAC", conversionFactor: 25 }).success).toBe(true);
  });
});
