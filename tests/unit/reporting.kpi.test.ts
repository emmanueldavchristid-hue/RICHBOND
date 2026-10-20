import { describe, expect, it } from "vitest";
import {
  average,
  cardTone,
  formatVariation,
  onTimeRate,
  previousStockValue,
  ratePct,
  sharePct,
  variationPct,
  variationTone,
} from "@/modules/reporting/kpi";

describe("reporting.kpi : calculs sur agrégats", () => {
  it("variation en % à 1 décimale", () => {
    expect(variationPct(125, 100)).toBe(25);
    expect(variationPct(80, 100)).toBe(-20);
    expect(variationPct(1_234_567, 1_000_000)).toBe(23.5);
    expect(variationPct(100, 100)).toBe(0);
  });

  it("mois précédent vide ou donnée absente : « – » (null), jamais de division par zéro", () => {
    expect(variationPct(500, 0)).toBeNull();
    expect(variationPct(500, null)).toBeNull();
    expect(variationPct(null, 100)).toBeNull();
    expect(variationPct(0, 0)).toBeNull();
    expect(formatVariation(null)).toBe("–");
  });

  it("moyenne des délais : null sans effectif", () => {
    expect(average(25, 4)).toBe(6.3); // 6,25 -> 6,3
    expect(average(0, 3)).toBe(0);
    expect(average(0, 0)).toBeNull();
    expect(average(null, 2)).toBeNull();
  });

  it("taux de livraison à temps", () => {
    expect(onTimeRate(7, 9)).toBe(77.8);
    expect(onTimeRate(0, 4)).toBe(0);
    expect(onTimeRate(0, 0)).toBeNull();
    expect(ratePct(1, 3)).toBe(33.3);
  });

  it("part dans un total", () => {
    expect(sharePct(250, 1000)).toBe(25);
    expect(sharePct(5, 0)).toBe(0);
  });

  it("couleur de la variation selon le sens métier", () => {
    expect(variationTone(12, "UP")).toBe("good"); // plus de livraisons à temps
    expect(variationTone(-5, "UP")).toBe("bad");
    expect(variationTone(20, "DOWN")).toBe("bad"); // plus de ruptures
    expect(variationTone(-20, "DOWN")).toBe("good"); // délais en baisse
    expect(variationTone(40, "NONE")).toBe("neutral"); // montant commandé : ni bon ni mauvais
    expect(variationTone(0, "UP")).toBe("neutral");
    expect(variationTone(null, "UP")).toBe("neutral");
  });

  it("T6 : une carte à 0 reste neutre (jamais rouge)", () => {
    expect(cardTone(0, "critical")).toBe("neutral");
    expect(cardTone(3, "critical")).toBe("critical");
    expect(cardTone(2, "attention")).toBe("attention");
  });

  it("T3 : valeur du stock en fin de mois précédent = valeur actuelle - mouvements depuis le 1er", () => {
    // Stock actuel 10 M ; ce mois : +3 M d'entrées et -1 M de sorties = +2 M net -> fin de mois précédent 8 M.
    expect(previousStockValue(10_000_000, 3_000_000 - 1_000_000)).toBe(8_000_000);
    expect(previousStockValue(500_000, 0)).toBe(500_000);
    expect(previousStockValue(0, 0)).toBe(0);
  });

  it("formats de variation", () => {
    expect(formatVariation(12.5)).toBe("+12,5 %");
    expect(formatVariation(-3)).toBe("-3 %");
    expect(formatVariation(0)).toBe("0 %");
  });
});
