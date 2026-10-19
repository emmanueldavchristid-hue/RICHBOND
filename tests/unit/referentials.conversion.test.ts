import { describe, expect, it } from "vitest";
import { toPurchaseQty, toStockQty } from "@/modules/referentials/conversion";

describe("conversion unité d'achat -> unité de stock (R3)", () => {
  it("1 FÛT x 200 = 200 KG", () => expect(toStockQty(1, 200).toString()).toBe("200"));
  it("2,5 ROULEAU x 50 = 125 M", () => expect(toStockQty("2,5", 50).toString()).toBe("125"));
  it("coefficient 0,001", () => expect(toStockQty(1500, "0.001").toString()).toBe("1.5"));
  it("arrondi à 3 décimales, demi-supérieur", () => {
    expect(toStockQty("1.0005", 1).toString()).toBe("1.001");
    expect(toStockQty("1.0004", 1).toString()).toBe("1");
    expect(toPurchaseQty(1, 3).toString()).toBe("0.333");
  });
  it("coefficient 0 ou négatif refusé", () => {
    expect(() => toStockQty(1, 0)).toThrow(/strictement positif/);
    expect(() => toStockQty(1, -2)).toThrow(/strictement positif/);
    expect(() => toPurchaseQty(1, 0)).toThrow(/strictement positif/);
  });
  it("aller-retour exact quand la division tombe juste", () => {
    expect(toPurchaseQty(toStockQty(7, 200), 200).toString()).toBe("7");
    expect(toPurchaseQty(toStockQty("2.5", 50), 50).toString()).toBe("2.5");
  });
  it("quantité invalide refusée", () => {
    expect(() => toStockQty(Number.NaN, 2)).toThrow();
  });
});
