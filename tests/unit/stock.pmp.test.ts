import { describe, expect, it } from "vitest";
import { BusinessError } from "@/lib/errors";
import { computeMovement, movementValue, pmpAfterEntry, pmpAfterEntryReversal, roundCost } from "@/modules/stock/pmp";

describe("PMP – entrée", () => {
  it("cas nominal : (S x P + q x c) / (S + q)", () => {
    // 100 U à 1000 + 50 U à 1300 => (100000 + 65000) / 150 = 1100
    expect(pmpAfterEntry(100, 1000, 50, 1300).toString()).toBe("1100");
  });

  it("stock nul : le PMP devient le coût de l'entrée", () => {
    expect(pmpAfterEntry(0, 999, 10, 1250.5).toString()).toBe("1250.5");
  });

  it("stock négatif (donnée corrompue) : le PMP devient le coût de l'entrée", () => {
    expect(pmpAfterEntry(-5, 800, 10, 1200).toString()).toBe("1200");
  });

  it("arrondi à 4 décimales (1/3)", () => {
    // 1 U à 0 + 2 U à 1 => 2/3 = 0.6667
    expect(pmpAfterEntry(1, 0, 2, 1).toString()).toBe("0.6667");
    // 2 U à 1 + 1 U à 1 reste 1
    expect(pmpAfterEntry(2, 1, 1, 1).toString()).toBe("1");
    expect(pmpAfterEntry(3, 1, 3, 1.3333).toString()).toBe("1.1667");
  });

  it("quantité nulle : PMP inchangé", () => {
    expect(pmpAfterEntry(10, 500, 0, 9999).toString()).toBe("500");
  });
});

describe("PMP – contre-passation d'une entrée", () => {
  it("revient au PMP d'avant", () => {
    const after = pmpAfterEntry(100, 1000, 50, 1300);
    expect(pmpAfterEntryReversal(150, after, 50, 1300).toString()).toBe("1000");
  });

  it("conserve le PMP si tout le stock est annulé", () => {
    expect(pmpAfterEntryReversal(50, 1300, 50, 1300).toString()).toBe("1300");
  });

  it("conserve le PMP si le résultat n'est pas strictement positif", () => {
    // Le PMP a baissé depuis : (S x P - q x c) serait négatif.
    expect(pmpAfterEntryReversal(100, 100, 60, 1000).toString()).toBe("100");
  });
});

describe("valeur d'un mouvement (FCFA entiers)", () => {
  it("arrondit au franc, de façon symétrique", () => {
    expect(movementValue(3, 1.3333)).toBe(4); // 3.9999
    expect(movementValue(-3, 1.3333)).toBe(-4);
    expect(movementValue(0.5, 1)).toBe(1); // 0.5 arrondi vers l'extérieur
    expect(movementValue(-0.5, 1)).toBe(-1);
    expect(movementValue(10, 0)).toBe(0);
  });

  it("n'utilise aucun flottant : 0.1 x 3 reste exact", () => {
    expect(movementValue("0.1", "3")).toBe(0);
    expect(movementValue("1.005", "1000")).toBe(1005);
  });
});

describe("computeMovement", () => {
  it("entrée : coût fourni, valeur et PMP après", () => {
    const m = computeMovement({ stock: 100, pmp: 1000, quantity: 50, unitCost: 1300 });
    expect(m.stockAfter.toString()).toBe("150");
    expect(m.pmpBefore.toString()).toBe("1000");
    expect(m.pmpAfter.toString()).toBe("1100");
    expect(m.unitCost.toString()).toBe("1300");
    expect(m.value).toBe(65000);
  });

  it("sortie : valorisée au PMP du moment, PMP inchangé", () => {
    const m = computeMovement({ stock: 150, pmp: 1100, quantity: -40, unitCost: 1 });
    expect(m.unitCost.toString()).toBe("1100");
    expect(m.value).toBe(-44000);
    expect(m.pmpAfter.toString()).toBe("1100");
    expect(m.stockAfter.toString()).toBe("110");
  });

  it("sortie du dernier stock : stock zéro, PMP conservé", () => {
    const m = computeMovement({ stock: 10, pmp: 777.7777, quantity: -10 });
    expect(m.stockAfter.toString()).toBe("0");
    expect(m.pmpAfter.toString()).toBe("777.7777");
  });

  it("le stock ne devient jamais négatif", () => {
    expect(() => computeMovement({ stock: 4, pmp: 100, quantity: -4.001 })).toThrowError(BusinessError);
    try {
      computeMovement({ stock: 4, pmp: 100, quantity: -5 });
    } catch (e) {
      expect((e as BusinessError).code).toBe("STOCK_INSUFFICIENT");
    }
    expect(() => computeMovement({ stock: 0, pmp: 0, quantity: -1 })).toThrowError(/insuffisant/);
  });

  it("refuse une quantité nulle ou à plus de 3 décimales", () => {
    expect(() => computeMovement({ stock: 5, pmp: 1, quantity: 0 })).toThrowError(BusinessError);
    expect(() => computeMovement({ stock: 5, pmp: 1, quantity: "1.0005", unitCost: 1 })).toThrowError(/3 décimales/);
  });

  it("refuse un coût négatif", () => {
    expect(() => computeMovement({ stock: 5, pmp: 1, quantity: 1, unitCost: -1 })).toThrowError(BusinessError);
  });

  it("entrée sans coût (ajustement positif) : au PMP courant, PMP inchangé", () => {
    const m = computeMovement({ stock: 10, pmp: 250, quantity: 2 });
    expect(m.unitCost.toString()).toBe("250");
    expect(m.pmpAfter.toString()).toBe("250");
    expect(m.value).toBe(500);
  });

  it("transfert : sortie source au PMP, entrée destination à ce coût", () => {
    const out = computeMovement({ stock: 100, pmp: 1100, quantity: -30 });
    const inn = computeMovement({ stock: 20, pmp: 1500, quantity: 30, unitCost: out.unitCost });
    expect(out.value).toBe(-33000);
    expect(inn.value).toBe(33000);
    // (20 x 1500 + 30 x 1100) / 50 = 1260
    expect(inn.pmpAfter.toString()).toBe("1260");
  });

  describe("contre-passation", () => {
    it("d'une entrée : stock, PMP et valeur reviennent exactement", () => {
      const entry = computeMovement({ stock: 100, pmp: 1000, quantity: 50, unitCost: 1300 });
      const rev = computeMovement({
        stock: entry.stockAfter,
        pmp: entry.pmpAfter,
        quantity: -50,
        reversal: { quantity: entry.quantity, unitCost: entry.unitCost, value: entry.value },
      });
      expect(rev.stockAfter.toString()).toBe("100");
      expect(rev.pmpAfter.toString()).toBe("1000");
      expect(rev.value).toBe(-entry.value);
      expect(rev.unitCost.toString()).toBe("1300");
    });

    it("d'une entrée : refusée si le stock a été consommé depuis", () => {
      expect(() =>
        computeMovement({
          stock: 20,
          pmp: 1100,
          quantity: -50,
          reversal: { quantity: 50, unitCost: 1300, value: 65000 },
        }),
      ).toThrowError(/insuffisant/);
    });

    it("d'une sortie : le stock est restitué au coût d'origine, valeur annulée", () => {
      const out = computeMovement({ stock: 150, pmp: 1100, quantity: -40 });
      const rev = computeMovement({
        stock: out.stockAfter,
        pmp: out.pmpAfter,
        quantity: 40,
        reversal: { quantity: out.quantity, unitCost: out.unitCost, value: out.value },
      });
      expect(rev.stockAfter.toString()).toBe("150");
      expect(rev.pmpAfter.toString()).toBe("1100");
      expect(rev.value).toBe(44000);
    });

    it("refuse une quantité qui n'annule pas l'original", () => {
      expect(() =>
        computeMovement({ stock: 100, pmp: 10, quantity: -40, reversal: { quantity: 50, unitCost: 10, value: 500 } }),
      ).toThrowError(BusinessError);
    });
  });

  it("roundCost arrondit à 4 décimales", () => {
    expect(roundCost("1.23455").toString()).toBe("1.2346");
  });
});
