import { describe, expect, it } from "vitest";
import { dayKey, isEurParity, isRateStale } from "@/modules/currencies/rate";
import { addExchangeRateSchema } from "@/modules/currencies/schemas";

const d = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

describe("isRateStale (R11)", () => {
  it("30 jours exactement : pas ancien ; 31 jours : ancien", () => {
    expect(isRateStale(d("2026-09-19"), d("2026-10-19"))).toBe(false);
    expect(isRateStale(d("2026-09-18"), d("2026-10-19"))).toBe(true);
  });
  it("taux du jour ou futur : pas ancien", () => {
    expect(isRateStale(d("2026-10-19"), d("2026-10-19"))).toBe(false);
    expect(isRateStale(d("2026-10-25"), d("2026-10-19"))).toBe(false);
  });
  it("dayKey : jour d'Abidjan sous forme de minuit UTC", () => {
    expect(dayKey(new Date("2026-10-19T23:30:00Z")).toISOString()).toBe("2026-10-19T00:00:00.000Z");
  });
});

describe("parité EUR", () => {
  it("655,957 reconnu, autre valeur non", () => {
    expect(isEurParity("655.957")).toBe(true);
    expect(isEurParity("655.957000")).toBe(true);
    expect(isEurParity("656")).toBe(false);
  });
});

describe("addExchangeRateSchema", () => {
  const ok = { currencyCode: "usd", date: "2026-10-19", rate: "605,5" };
  it("virgule décimale et code en majuscules", () => {
    const r = addExchangeRateSchema.parse(ok);
    expect(r.rate).toBe("605.5");
    expect(r.currencyCode).toBe("USD");
  });
  it("taux nul, négatif, ou 7 décimales refusés", () => {
    for (const rate of ["0", "-3", "1.1234567", "abc"]) {
      expect(addExchangeRateSchema.safeParse({ ...ok, rate }).success, rate).toBe(false);
    }
  });
  it("date au mauvais format refusée", () => {
    expect(addExchangeRateSchema.safeParse({ ...ok, date: "19/10/2026" }).success).toBe(false);
  });
});
