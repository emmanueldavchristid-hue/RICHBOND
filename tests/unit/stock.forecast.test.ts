import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  averageDailyConsumption,
  computeForecast,
  coverageDays,
  coverageSeverity,
  effectiveLeadTime,
  isDormant,
  ruptureBeforeDelivery,
  stockoutDate,
  suggestedReorderPoint,
  suggestedSafetyStock,
} from "@/modules/stock/forecast";

describe("consommation et couverture", () => {
  it("consommation = sorties nettes / fenêtre ; jamais négative", () => {
    expect(averageDailyConsumption(180, 90).toString()).toBe("2");
    expect(averageDailyConsumption(-5, 90).toString()).toBe("0");
    expect(averageDailyConsumption(10, 0).toString()).toBe("0");
  });
  it("couverture : stock / conso ; inconnue sans conso ; 0 si stock nul", () => {
    expect(coverageDays(50, 2)).toBe(25);
    expect(coverageDays(25, 1.4285)).toBe(17.5);
    expect(coverageDays(50, 0)).toBeNull();
    expect(coverageDays(0, 2)).toBe(0);
    expect(coverageDays(-3, 2)).toBe(0);
  });
  it("date de rupture = aujourd'hui + couverture (jours entiers)", () => {
    expect(stockoutDate("2026-10-20", 17.5)).toBe("2026-11-06");
    expect(stockoutDate("2026-12-30", 3)).toBe("2027-01-02");
    expect(stockoutDate("2026-10-20", null)).toBeNull();
    expect(addDaysIso("2026-02-27", 2)).toBe("2026-03-01");
  });
  it("couleur : rouge < délai, orange < 2 x délai, vert au-delà", () => {
    expect(coverageSeverity(19.9, 20)).toBe("ROUGE");
    expect(coverageSeverity(20, 20)).toBe("ORANGE");
    expect(coverageSeverity(39.9, 20)).toBe("ORANGE");
    expect(coverageSeverity(40, 20)).toBe("VERT");
    expect(coverageSeverity(null, 20)).toBeNull();
  });
});

describe("seuils suggérés", () => {
  it("stock de sécurité selon la criticité (1 ; 0,5 ; 0,25), point de commande = conso x délai + sécurité", () => {
    expect(suggestedSafetyStock(2, 10, "CRITIQUE").toString()).toBe("20");
    expect(suggestedSafetyStock(2, 10, "IMPORTANT").toString()).toBe("10");
    expect(suggestedSafetyStock(2, 10, "STANDARD").toString()).toBe("5");
    expect(suggestedReorderPoint(2, 10, "CRITIQUE").toString()).toBe("40");
    expect(suggestedReorderPoint(2, 10, "STANDARD").toString()).toBe("25");
  });
  it("arrondi à l'entier supérieur, 0 sans consommation", () => {
    expect(suggestedReorderPoint(0.33, 10, "STANDARD").toString()).toBe("5"); // 3,3 + 0,825 = 4,125
    expect(suggestedReorderPoint(0, 10, "CRITIQUE").toString()).toBe("0");
  });
  it("délai effectif : article, sinon fournisseur, sinon défaut", () => {
    expect(effectiveLeadTime({ item: 12, supplier: 30, fallback: 45 })).toBe(12);
    expect(effectiveLeadTime({ item: null, supplier: 30, fallback: 45 })).toBe(30);
    expect(effectiveLeadTime({ item: 0, supplier: null, fallback: 45 })).toBe(45);
  });
});

describe("dormants et alerte avant livraison", () => {
  const now = new Date("2026-10-20T10:00:00Z");
  it("dormant : en stock et aucun mouvement depuis plus de 180 jours", () => {
    expect(isDormant(1, new Date("2026-04-01T00:00:00Z"), now, 180)).toBe(true);
    expect(isDormant(1, new Date("2026-09-01T00:00:00Z"), now, 180)).toBe(false);
    expect(isDormant(0, new Date("2025-01-01T00:00:00Z"), now, 180)).toBe(false);
    expect(isDormant(2, null, now, 180)).toBe(true);
  });
  it("rupture avant la livraison attendue", () => {
    expect(ruptureBeforeDelivery("2026-11-01", "2026-11-10")).toBe(true);
    expect(ruptureBeforeDelivery("2026-11-12", "2026-11-10")).toBe(false);
    expect(ruptureBeforeDelivery("2026-11-01", null)).toBe(true);
    expect(ruptureBeforeDelivery(null, "2026-11-10")).toBe(false);
  });
});

describe("prévision complète sur un jeu connu", () => {
  const base = {
    itemId: "a",
    onHand: 25,
    onOrder: 0,
    netIssued: 130,
    windowDays: 90,
    leadTimeDays: 20,
    criticality: "CRITIQUE",
    safetyStock: null,
    reorderPoint: 40,
    todayIso: "2026-10-20",
    nextDeliveryIso: null,
  };
  it("sous le point de commande saisi, couverture rouge, rupture prévue", () => {
    const f = computeForecast(base);
    expect(f.avgDailyConsumption).toBe("1.444444");
    expect(f.coverageDays).toBe(17.3);
    expect(f.stockoutDate).toBe("2026-11-06");
    expect(f.severity).toBe("ROUGE");
    expect(f.reorderPoint).toBe("40"); // valeur saisie conservée
    expect(f.suggestedReorderPoint).toBe("58"); // 28,9 + 28,9
    expect(f.safetyStock).toBe("29"); // pas de valeur saisie : la suggérée
    expect(f.belowReorderPoint).toBe(true);
    expect(f.ruptureBeforeDelivery).toBe(true);
  });
  it("une commande en cours relève la position ; livraison en retard ramenée à aujourd'hui", () => {
    const f = computeForecast({ ...base, onOrder: 200, nextDeliveryIso: "2026-10-01" });
    expect(f.position).toBe("225");
    expect(f.belowReorderPoint).toBe(false);
    expect(f.nextDeliveryDate).toBe("2026-10-20");
    expect(f.ruptureBeforeDelivery).toBe(false);
  });
});
