import { describe, expect, it } from "vitest";
import { estimatedTotal, lineTotal, toMilli } from "@/modules/purchase-requests/totals";

describe("lineTotal (FCFA entiers)", () => {
  it("quantité entière x prix", () => {
    expect(lineTotal(50, 1200)).toBe(60_000);
  });
  it("quantité décimale : arrondi au franc, demi supérieur", () => {
    expect(lineTotal("2.5", 1001)).toBe(2503); // 2502,5 -> 2503
    expect(lineTotal("0.001", 1499)).toBe(1); // 1,499 -> 1
    expect(lineTotal("0.001", 1500)).toBe(2); // 1,5 -> 2
  });
  it("virgule décimale acceptée, pas d'erreur de flottant", () => {
    expect(lineTotal("0,3", 10)).toBe(3);
    expect(lineTotal("0.1", 3)).toBe(0); // 0,3 -> 0
    expect(lineTotal("1.1", 100)).toBe(110);
  });
  it("prix absent : null", () => {
    expect(lineTotal(10, null)).toBeNull();
    expect(lineTotal(10, undefined)).toBeNull();
  });
  it("prix non entier ou négatif refusé", () => {
    expect(() => lineTotal(1, 10.5)).toThrow();
    expect(() => lineTotal(1, -1)).toThrow();
  });
  it("toMilli", () => {
    expect(toMilli("12.5")).toBe(12_500n);
    expect(toMilli(3)).toBe(3000n);
    expect(() => toMilli("abc")).toThrow();
  });
});

describe("estimatedTotal", () => {
  it("somme des lignes chiffrées, entier", () => {
    expect(
      estimatedTotal([
        { quantity: 2, estimatedUnitPrice: 1000 },
        { quantity: "1.5", estimatedUnitPrice: 333 },
        { quantity: 4, estimatedUnitPrice: null },
      ]),
    ).toBe(2000 + 500);
  });
  it("aucune ligne chiffrée : null", () => {
    expect(estimatedTotal([{ quantity: 2, estimatedUnitPrice: null }])).toBeNull();
    expect(estimatedTotal([])).toBeNull();
  });
  it("utilise la quantité validée ; 0 retire la ligne", () => {
    expect(
      estimatedTotal([
        { quantity: 10, approvedQty: 4, estimatedUnitPrice: 100 },
        { quantity: 5, approvedQty: 0, estimatedUnitPrice: 1000 },
        { quantity: 2, approvedQty: null, estimatedUnitPrice: 50 },
      ]),
    ).toBe(400 + 0 + 100);
  });
  it("le résultat est toujours un entier", () => {
    const t = estimatedTotal([{ quantity: "0.333", estimatedUnitPrice: 1000 }]);
    expect(Number.isInteger(t)).toBe(true);
    expect(t).toBe(333);
  });
});
