import { describe, expect, it } from "vitest";
import { BusinessError } from "@/lib/errors";
import { MAX_ORDER_XOF, assertWithinCeiling, computeTotals, effectiveUnitPrice, lineNetAmount, parseUnitPrice, unitPriceToXof } from "@/modules/purchase-orders/totals";

const xof = { currencyCode: "XOF" } as const;

describe("montant net d'une ligne", () => {
  it("quantité x prix, sans remise", () => {
    expect(lineNetAmount({ quantity: 10, unitPrice: 1250 }, 0).toString()).toBe("12500");
  });

  it("remise en % appliquée avant l'arrondi", () => {
    expect(lineNetAmount({ quantity: 3, unitPrice: 1000, discountPct: 10 }, 0).toString()).toBe("2700");
    // 7 x 333 x 0,85 = 1981,35 -> 1981 FCFA
    expect(lineNetAmount({ quantity: 7, unitPrice: 333, discountPct: 15 }, 0).toString()).toBe("1981");
  });

  it("arrondi demi-supérieur à l'unité (FCFA)", () => {
    expect(lineNetAmount({ quantity: 0.5, unitPrice: 5 }, 0).toString()).toBe("3"); // 2,5 -> 3
    expect(lineNetAmount({ quantity: 1.5, unitPrice: 5 }, 0).toString()).toBe("8"); // 7,5 -> 8
    expect(lineNetAmount({ quantity: 1, unitPrice: 2 }, 0).toString()).toBe("2");
  });

  it("devise : arrondi au centime", () => {
    expect(lineNetAmount({ quantity: 3, unitPrice: "1.005" }, 2).toString()).toBe("3.02"); // 3,015 -> 3,02
    expect(lineNetAmount({ quantity: 0.333, unitPrice: 10 }, 2).toString()).toBe("3.33");
  });

  it("remise hors de 0 à 100 % refusée", () => {
    expect(() => lineNetAmount({ quantity: 1, unitPrice: 1, discountPct: 101 }, 0)).toThrowError(/remise/i);
    expect(() => lineNetAmount({ quantity: 1, unitPrice: 1, discountPct: -1 }, 0)).toThrowError(/remise/i);
  });
});

describe("totaux d'un bon de commande", () => {
  it("TVA par taux (0, 9, 18), frais ajoutés au HT, TTC = HT + TVA", () => {
    const t = computeTotals(
      [
        { quantity: 10, unitPrice: 1000, vatRate: 18 }, // 10 000
        { quantity: 5, unitPrice: 2000, vatRate: 9 }, // 10 000
        { quantity: 1, unitPrice: 7000, vatRate: 0 }, // 7 000
      ],
      [{ amount: 3000, vatRate: 18 }],
      xof,
    );
    expect(t.totalHt.toString()).toBe("30000");
    expect(t.chargesTotal.toString()).toBe("3000");
    expect(t.vat.map((v) => [v.rate, v.base.toString(), v.vat.toString()])).toEqual([
      [0, "7000", "0"],
      [9, "10000", "900"],
      [18, "13000", "2340"],
    ]);
    expect(t.totalVat.toString()).toBe("3240");
    expect(t.totalTtc.toString()).toBe("33240");
    expect(t.totalTtcXof).toBe(33240);
    expect(t.totalHtXof).toBe(30000);
  });

  it("la TVA est arrondie par taux, pas par ligne (demi-supérieur)", () => {
    // deux lignes à 25 FCFA à 18 % : base 50 -> 9 ; (par ligne : 4,5 + 4,5 arrondis = 10)
    const t = computeTotals([{ quantity: 1, unitPrice: 25, vatRate: 18 }, { quantity: 1, unitPrice: 25, vatRate: 18 }], [], xof);
    expect(t.totalVat.toString()).toBe("9");
    // 1 x 3 FCFA à 18 % = 0,54 -> 1
    expect(computeTotals([{ quantity: 1, unitPrice: 3, vatRate: 18 }], [], xof).totalVat.toString()).toBe("1");
    // 0,5 FCFA -> arrondi demi-supérieur à l'unité
    expect(computeTotals([{ quantity: 1, unitPrice: 25, vatRate: 18 }], [], xof).totalVat.toString()).toBe("5"); // 4,5 -> 5
  });

  it("bon vide : tous les totaux à zéro", () => {
    const t = computeTotals([], [], xof);
    expect(t.totalTtc.toString()).toBe("0");
    expect(t.totalTtcXof).toBe(0);
  });

  it("import en devise : total au centime, équivalent FCFA arrondi demi-supérieur au taux", () => {
    const t = computeTotals(
      [{ quantity: 20, unitPrice: "249.90", discountPct: 5, vatRate: 0 }],
      [{ amount: "150.50", vatRate: 0 }],
      { currencyCode: "USD", decimals: 2, rate: "605.250000" },
    );
    // 20 x 249,90 x 0,95 = 4748,10 ; + 150,50 = 4898,60
    expect(t.totalHt.toString()).toBe("4898.6");
    expect(t.totalTtc.toString()).toBe("4898.6");
    // 4898,60 x 605,25 = 2 964 877,65 -> 2 964 878
    expect(t.totalTtcXof).toBe(2_964_878);
  });

  it("devise sans taux connu : équivalent FCFA absent", () => {
    const t = computeTotals([{ quantity: 1, unitPrice: 10, vatRate: 0 }], [], { currencyCode: "USD", decimals: 2, rate: null });
    expect(t.totalTtcXof).toBeNull();
    expect(t.totalHtXof).toBeNull();
  });

  it("plafond INTEGER : 2 147 483 647 FCFA accepté, +1 refusé avec un message clair", () => {
    expect(computeTotals([{ quantity: 1, unitPrice: MAX_ORDER_XOF, vatRate: 0 }], [], xof).totalTtcXof).toBe(MAX_ORDER_XOF);
    expect(() => computeTotals([{ quantity: 1, unitPrice: MAX_ORDER_XOF + 1, vatRate: 0 }], [], xof)).toThrowError(/2 147 483 647/);
    // la TVA compte dans le plafond
    expect(() => computeTotals([{ quantity: 1, unitPrice: 2_000_000_000, vatRate: 18 }], [], xof)).toThrowError(BusinessError);
    expect(() => assertWithinCeiling(null)).not.toThrow();
  });
});

describe("prix unitaire", () => {
  it("FCFA : entier obligatoire", () => {
    expect(parseUnitPrice("12500", "XOF").toString()).toBe("12500");
    expect(parseUnitPrice("12500.00", "XOF").toString()).toBe("12500");
    expect(() => parseUnitPrice("12500.5", "XOF")).toThrowError(/entier/);
  });

  it("devise : 2 décimales au plus, virgule acceptée", () => {
    expect(parseUnitPrice("249,90", "USD", 2).toString()).toBe("249.9");
    expect(() => parseUnitPrice("249.905", "USD", 2)).toThrowError(/décimale/);
  });

  it("négatif ou démesuré refusé", () => {
    expect(() => parseUnitPrice("-1", "XOF")).toThrowError(/négatif/);
    expect(() => parseUnitPrice("1000000000000", "XOF")).toThrowError(/trop élevé/);
    expect(() => parseUnitPrice("abc", "XOF")).toThrowError(BusinessError);
  });

  it("prix effectif après remise et conversion FCFA", () => {
    expect(effectiveUnitPrice(1000, 15).toString()).toBe("850");
    expect(unitPriceToXof(10, "XOF")?.toString()).toBe("10");
    expect(unitPriceToXof("2.5", "EUR", "655.957")?.toString()).toBe("1639.8925");
    expect(unitPriceToXof(2.5, "EUR", null)).toBeNull();
  });
});
