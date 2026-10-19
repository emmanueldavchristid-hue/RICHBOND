import { describe, expect, it } from "vitest";
import { DEFAULT_PRICE_ALERT_PCT, checkPrice, isPriceAlert, lastPriceInXof, priceAlertMessage, priceDeltaPct, type LastPrice } from "@/modules/purchase-orders/price-check";

const last = (over: Partial<LastPrice> = {}): LastPrice => ({ price: 10_000, currencyCode: "XOF", priceUnit: "U", date: new Date("2026-09-03T00:00:00Z"), supplierCode: "FRS-00012", ...over });
const base = { unitPrice: 12_000, currencyCode: "XOF", unit: "U" } as const;

describe("seuil d'alerte (D14)", () => {
  it("+20 % pile : pas d'alerte ; +20,01 % : alerte", () => {
    expect(checkPrice({ ...base, unitPrice: 12_000, last: last() }).alert).toBe(false);
    expect(checkPrice({ ...base, unitPrice: 12_001, last: last() }).alert).toBe(true);
    expect(checkPrice({ ...base, unitPrice: 12_000, last: last() }).deltaPct?.toString()).toBe("20");
    expect(checkPrice({ ...base, unitPrice: 12_001, last: last() }).deltaPct?.toString()).toBe("20.01");
  });

  it("seuil réglable", () => {
    expect(checkPrice({ ...base, unitPrice: 10_600, last: last(), thresholdPct: 5 }).alert).toBe(true);
    expect(checkPrice({ ...base, unitPrice: 10_600, last: last(), thresholdPct: 10 }).alert).toBe(false);
    expect(DEFAULT_PRICE_ALERT_PCT).toBe(20);
  });

  it("une baisse supérieure au seuil alerte aussi (erreur de saisie possible)", () => {
    const r = checkPrice({ ...base, unitPrice: 7_000, last: last() });
    expect(r.deltaPct?.toString()).toBe("-30");
    expect(r.alert).toBe(true);
  });

  it("isPriceAlert : écart absent = pas d'alerte", () => {
    expect(isPriceAlert(null)).toBe(false);
    expect(isPriceAlert("25")).toBe(true);
    expect(isPriceAlert("-25")).toBe(true);
    expect(isPriceAlert("20")).toBe(false);
  });
});

describe("pas d'historique ou non comparable", () => {
  it("aucun historique : aucun écart, aucune alerte", () => {
    expect(checkPrice({ ...base, last: null })).toEqual({ lastPriceXof: null, deltaPct: null, alert: false });
  });

  it("unité d'achat différente : non comparable", () => {
    expect(checkPrice({ ...base, last: last({ priceUnit: "CARTON" }) })).toEqual({ lastPriceXof: null, deltaPct: null, alert: false });
  });

  it("dernier prix nul : pas de division par zéro", () => {
    expect(priceDeltaPct(100, 0)).toBeNull();
    expect(checkPrice({ ...base, last: last({ price: 0 }) }).alert).toBe(false);
  });

  it("dernier prix en devise sans taux d'époque : non comparable", () => {
    expect(lastPriceInXof(last({ currencyCode: "USD", rateToXof: null }))).toBeNull();
    expect(checkPrice({ ...base, last: last({ currencyCode: "USD", rateToXof: null }) }).alert).toBe(false);
  });
});

describe("conversions devise et remise", () => {
  it("dernier prix en EUR converti au taux de l'époque, nouveau prix en FCFA", () => {
    // dernier : 15 EUR x 655,957 = 9839,355 FCFA ; nouveau : 12 000 FCFA -> +21,96 %
    const r = checkPrice({ ...base, last: last({ price: 15, currencyCode: "EUR", rateToXof: "655.957" }) });
    expect(r.lastPriceXof).toBe(9839);
    expect(r.deltaPct?.toString()).toBe("21.96");
    expect(r.alert).toBe(true);
  });

  it("nouveau prix en devise converti au taux du BC", () => {
    // 20 USD x 600 = 12 000 FCFA vs 10 000 = +20 % pile
    const r = checkPrice({ unitPrice: 20, currencyCode: "USD", rate: 600, unit: "U", last: last() });
    expect(r.deltaPct?.toString()).toBe("20");
    expect(r.alert).toBe(false);
  });

  it("devise sans taux sur le BC : non comparable", () => {
    expect(checkPrice({ unitPrice: 20, currencyCode: "USD", rate: null, unit: "U", last: last() }).alert).toBe(false);
  });

  it("la remise fait baisser le prix effectif comparé", () => {
    // 12 000 - 10 % = 10 800 -> +8 %
    expect(checkPrice({ ...base, discountPct: 10, last: last() }).deltaPct?.toString()).toBe("8");
  });
});

describe("message de la pastille", () => {
  it("« +32 % vs dernier prix (12 500 FCFA le 03/09/2026, FRS-00012) »", () => {
    const m = priceAlertMessage("32", { lastPriceXof: 12_500, date: new Date("2026-09-03T00:00:00Z"), supplierCode: "FRS-00012" });
    expect(m).toBe("+32 % vs dernier prix (12 500 FCFA le 03/09/2026, FRS-00012)");
  });

  it("baisse et virgule décimale", () => {
    expect(priceAlertMessage("-25.5", { lastPriceXof: 8000, date: new Date("2026-01-02T00:00:00Z") })).toBe("-25,5 % vs dernier prix (8 000 FCFA le 02/01/2026)");
  });
});
