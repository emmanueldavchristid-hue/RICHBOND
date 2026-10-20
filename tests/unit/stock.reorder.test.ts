import { describe, expect, it } from "vitest";
import { classifyAbc } from "@/modules/stock/abc";
import { groupByPurchaseType, isBelowReorderPoint, reorderQuantity, suggestedStockQty, toPurchaseQty } from "@/modules/stock/reorder";

describe("réapprovisionnement (K8)", () => {
  it("sous le point de commande : position <= point, point > 0", () => {
    expect(isBelowReorderPoint(40, 40)).toBe(true);
    expect(isBelowReorderPoint(41, 40)).toBe(false);
    expect(isBelowReorderPoint(0, 0)).toBe(false);
    expect(isBelowReorderPoint(5, null)).toBe(false);
  });
  it("quantité suggérée = max(quantité économique, point + conso x délai - position)", () => {
    const p = { position: 25, reorderPoint: 40, dailyConsumption: 1.5, leadTimeDays: 20 };
    expect(suggestedStockQty({ ...p, economicOrderQty: 50 }).toString()).toBe("50"); // besoin 45
    expect(suggestedStockQty({ ...p, economicOrderQty: 10 }).toString()).toBe("45");
    expect(suggestedStockQty({ ...p, economicOrderQty: null }).toString()).toBe("45");
  });
  it("arrondi à l'unité d'achat supérieure puis au minimum de commande", () => {
    expect(toPurchaseQty({ stockQty: 45, factor: 12 }).purchaseQty.toString()).toBe("4"); // 3,75 -> 4
    expect(toPurchaseQty({ stockQty: 45, factor: 12 }).stockQty.toString()).toBe("48");
    expect(toPurchaseQty({ stockQty: 45, factor: 12, minOrderQty: 6 }).purchaseQty.toString()).toBe("6");
    expect(toPurchaseQty({ stockQty: 120, factor: 12 }).purchaseQty.toString()).toBe("10");
    expect(toPurchaseQty({ stockQty: 0, factor: 1 }).purchaseQty.toString()).toBe("1");
  });
  it("quantité complète d'un article en carton de 12", () => {
    const r = reorderQuantity({ position: 100, reorderPoint: 200, economicOrderQty: 120, dailyConsumption: 5, leadTimeDays: 7, factor: 12, minOrderQty: 2 });
    expect(r.purchaseQty.toString()).toBe("12"); // besoin 200 + 35 - 100 = 135 > 120 ; 135 / 12 = 11,25 -> 12 cartons
  });
  it("regroupe par type d'achat", () => {
    const g = groupByPurchaseType([
      { id: 1, purchaseType: "LOCAL" as const },
      { id: 2, purchaseType: "IMPORT" as const },
      { id: 3, purchaseType: "LOCAL" as const },
    ]);
    expect(g.get("LOCAL")!.map((r) => r.id)).toEqual([1, 3]);
    expect(g.get("IMPORT")).toHaveLength(1);
  });
});

describe("classification ABC (K9)", () => {
  it("A jusqu'à 80 % de la valeur, B jusqu'à 95 %, C ensuite ; sans consommation = C", () => {
    const m = classifyAbc([
      { id: "a", value: 500 },
      { id: "b", value: 300 },
      { id: "c", value: 100 },
      { id: "d", value: 60 },
      { id: "e", value: 40 },
      { id: "z", value: 0 },
    ]);
    // part cumulée avant l'article : a 0 %, b 50 %, c 80 %, d 90 %, e 96 %
    expect([...m.entries()].sort()).toEqual([["a", "A"], ["b", "A"], ["c", "B"], ["d", "B"], ["e", "C"], ["z", "C"]]);
  });
  it("un article dominant reste A ; sans valeur : tout C", () => {
    expect(classifyAbc([{ id: "x", value: 1000 }]).get("x")).toBe("A");
    expect(classifyAbc([{ id: "x", value: 0 }]).get("x")).toBe("C");
    expect(classifyAbc([]).size).toBe(0);
  });
});
