import { describe, expect, it } from "vitest";
import { BusinessError } from "@/lib/errors";
import {
  QTY_OVER_WARN_PCT,
  autoAllocate,
  convertQty,
  isQtyOverWarning,
  qtyOverPct,
  remainingToOrder,
  requestLineNeed,
  validateAllocations,
  type ItemUnits,
  type OrderLineForAllocation,
  type RequestLineForAllocation,
} from "@/modules/purchase-orders/allocation";

// 1 FUT = 200 KG
const polyol: ItemUnits = { purchaseUnit: "FUT", stockUnit: "KG", conversionFactor: 200 };
const items = new Map<string, ItemUnits>([["it1", polyol], ["it2", { purchaseUnit: "U", stockUnit: "U", conversionFactor: 1 }]]);

const rl = (id: string, over: Partial<RequestLineForAllocation> = {}): RequestLineForAllocation => ({
  id,
  itemId: "it1",
  unit: "FUT",
  need: 10,
  allocatedElsewhere: 0,
  label: `DA-2026-00001 ligne ${id}`,
  ...over,
});
const lineOf = (over: Partial<OrderLineForAllocation> = {}): OrderLineForAllocation => ({ lineNo: 1, itemId: "it1", quantity: 10, unit: "FUT", allocations: [{ requestLineId: "a", qty: 10 }], ...over });
const code = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    return (e as BusinessError).code;
  }
  return null;
};

describe("reste à commander (D7)", () => {
  it("besoin = quantité validée, sinon demandée", () => {
    expect(requestLineNeed({ quantity: 10, approvedQty: 6 }).toString()).toBe("6");
    expect(requestLineNeed({ quantity: 10, approvedQty: null }).toString()).toBe("10");
    expect(requestLineNeed({ quantity: 10, approvedQty: 0 }).toString()).toBe("0");
  });

  it("reste = besoin - alloué, jamais négatif", () => {
    expect(remainingToOrder(10, 4).toString()).toBe("6");
    expect(remainingToOrder(10, 10).toString()).toBe("0");
    expect(remainingToOrder(10, 12).toString()).toBe("0");
  });
});

describe("conversion d'unités (D8)", () => {
  it("achat <-> stock selon le coefficient, 3 décimales demi-supérieur", () => {
    expect(convertQty(2, "FUT", "KG", polyol).toString()).toBe("400");
    expect(convertQty(500, "KG", "FUT", polyol).toString()).toBe("2.5");
    expect(convertQty(1, "KG", "FUT", { ...polyol, conversionFactor: 3 }).toString()).toBe("0.333");
    expect(convertQty(7, "FUT", "FUT", polyol).toString()).toBe("7");
  });

  it("unité étrangère à l'article : refusée", () => {
    expect(code(() => convertQty(1, "CARTON", "FUT", polyol))).toBe("UNIT_INVALID");
  });
});

describe("dépassement de la quantité commandée sur le besoin", () => {
  it("pourcentage au centième ; absent sans allocation", () => {
    expect(qtyOverPct(12, 10)?.toString()).toBe("20");
    expect(qtyOverPct(10, 10)?.toString()).toBe("0");
    expect(qtyOverPct(8, 10)?.toString()).toBe("-20");
    expect(qtyOverPct(5, 0)).toBeNull();
  });

  it("avertissement au-delà du seuil seulement", () => {
    expect(isQtyOverWarning(qtyOverPct(11, 10))).toBe(false); // +10 % pile
    expect(isQtyOverWarning(qtyOverPct(11.01, 10))).toBe(true);
    expect(isQtyOverWarning(null)).toBe(false);
    expect(QTY_OVER_WARN_PCT).toBe(10);
  });
});

describe("validation des allocations d'un BC", () => {
  it("allocation valide : une ligne de DA, tout le besoin", () => {
    expect(() => validateAllocations([lineOf()], new Map([["a", rl("a")]]), items)).not.toThrow();
  });

  it("regroupement : 2 DA sur une ligne de BC", () => {
    const l = lineOf({ quantity: 12, allocations: [{ requestLineId: "a", qty: 5 }, { requestLineId: "b", qty: 7 }] });
    expect(() => validateAllocations([l], new Map([["a", rl("a", { need: 5 })], ["b", rl("b", { need: 8 })]]), items)).not.toThrow();
  });

  it("dépassement du reste à commander : ALLOCATION_EXCEEDED avec le reste dans le message", () => {
    const map = new Map([["a", rl("a", { need: 10, allocatedElsewhere: 7 })]]);
    expect(code(() => validateAllocations([lineOf()], map, items))).toBe("ALLOCATION_EXCEEDED");
    try {
      validateAllocations([lineOf()], map, items);
    } catch (e) {
      expect((e as BusinessError).messageFr).toMatch(/il ne reste que 3 FUT/);
    }
  });

  it("le même besoin réparti sur plusieurs lignes de BC compte une seule fois sous le plafond", () => {
    const lines = [lineOf({ lineNo: 1, quantity: 6, allocations: [{ requestLineId: "a", qty: 6 }] }), lineOf({ lineNo: 2, itemId: "it1", quantity: 6, allocations: [{ requestLineId: "a", qty: 6 }] })];
    expect(code(() => validateAllocations(lines, new Map([["a", rl("a", { need: 10 })]]), items))).toBe("ALLOCATION_EXCEEDED");
  });

  it("l'allocation ne dépasse pas la quantité commandée sur la ligne (conversion d'unités comprise)", () => {
    // DA en KG (1000 KG) ; ligne de BC en FUT : 4 FUT = 800 KG maximum rattachables
    const dak = rl("a", { unit: "KG", need: 1000 });
    const ok = lineOf({ quantity: 5, allocations: [{ requestLineId: "a", qty: 1000 }] });
    expect(() => validateAllocations([ok], new Map([["a", dak]]), items)).not.toThrow();
    const ko = lineOf({ quantity: 4, allocations: [{ requestLineId: "a", qty: 1000 }] });
    expect(code(() => validateAllocations([ko], new Map([["a", dak]]), items))).toBe("ALLOCATION_ABOVE_LINE");
  });

  it("la quantité commandée peut dépasser le besoin (arrondi au conditionnement)", () => {
    const l = lineOf({ quantity: 12, allocations: [{ requestLineId: "a", qty: 10 }] });
    expect(() => validateAllocations([l], new Map([["a", rl("a")]]), items)).not.toThrow();
  });

  it("ligne de DA inconnue, autre article, doublon, quantité nulle", () => {
    expect(code(() => validateAllocations([lineOf()], new Map(), items))).toBe("ALLOCATION_INVALID");
    expect(code(() => validateAllocations([lineOf()], new Map([["a", rl("a", { itemId: "it2" })]]), items))).toBe("ALLOCATION_INVALID");
    const dup = lineOf({ quantity: 10, allocations: [{ requestLineId: "a", qty: 3 }, { requestLineId: "a", qty: 3 }] });
    expect(code(() => validateAllocations([dup], new Map([["a", rl("a")]]), items))).toBe("ALLOCATION_INVALID");
    expect(code(() => validateAllocations([lineOf({ allocations: [{ requestLineId: "a", qty: 0 }] })], new Map([["a", rl("a")]]), items))).toBe("ALLOCATION_INVALID");
  });

  it("ligne libre : même unité que la DA exigée", () => {
    const free = lineOf({ itemId: null, unit: "FORFAIT", quantity: 1, allocations: [{ requestLineId: "f", qty: 1 }] });
    const dl = rl("f", { itemId: null, unit: "FORFAIT", need: 1 });
    expect(() => validateAllocations([free], new Map([["f", dl]]), items)).not.toThrow();
    expect(code(() => validateAllocations([{ ...free, unit: "U" }], new Map([["f", dl]]), items))).toBe("UNIT_INVALID");
  });

  it("besoin retiré (quantité validée 0) : plus rien à commander", () => {
    expect(code(() => validateAllocations([lineOf({ quantity: 1, allocations: [{ requestLineId: "a", qty: 1 }] })], new Map([["a", rl("a", { need: 0 })]]), items))).toBe("ALLOCATION_EXCEEDED");
  });
});

describe("répartition automatique", () => {
  it("remplit les lignes dans l'ordre, chacune plafonnée à son reste", () => {
    const r = autoAllocate(12, "FUT", [{ requestLineId: "a", unit: "FUT", remaining: 5 }, { requestLineId: "b", unit: "FUT", remaining: 10 }], polyol);
    expect(r).toEqual([{ requestLineId: "a", qty: "5" }, { requestLineId: "b", qty: "7" }]);
  });

  it("convertit vers l'unité de la ligne de DA", () => {
    // 2 FUT à répartir ; DA a : 300 KG restants (1,5 FUT) ; DA b : 1 FUT restant
    const r = autoAllocate(2, "FUT", [{ requestLineId: "a", unit: "KG", remaining: 300 }, { requestLineId: "b", unit: "FUT", remaining: 1 }], polyol);
    expect(r).toEqual([{ requestLineId: "a", qty: "300" }, { requestLineId: "b", qty: "0.5" }]);
  });

  it("quantité insuffisante : la dernière ligne n'est pas entièrement couverte ; reste nul ignoré", () => {
    expect(autoAllocate(3, "U", [{ requestLineId: "a", unit: "U", remaining: 0 }, { requestLineId: "b", unit: "U", remaining: 10 }], null)).toEqual([{ requestLineId: "b", qty: "3" }]);
    expect(autoAllocate(0, "U", [{ requestLineId: "a", unit: "U", remaining: 5 }], null)).toEqual([]);
  });
});
