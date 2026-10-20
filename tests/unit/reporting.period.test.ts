import { describe, expect, it } from "vitest";
import {
  addMonths,
  daysInMonth,
  lastTwelveMonths,
  monthComparison,
  monthLabel,
  monthOf,
  monthPeriod,
  twelveMonthsPeriod,
  weekBounds,
} from "@/modules/reporting/period";

const iso = (d: Date) => d.toISOString();

describe("reporting.period : mois calendaire à Abidjan (T1)", () => {
  it("TEST_NOW 31/10 23:59 Abidjan : encore octobre, comparé au 31 septembre (donc 30)", () => {
    const now = new Date("2026-10-31T23:59:00.000Z");
    expect(monthOf(now)).toBe("2026-10");
    const c = monthComparison(now);
    expect(c.month).toBe("2026-10");
    expect(c.comparedUntil).toBe("2026-10-31");
    expect(iso(c.current.start)).toBe("2026-10-01T00:00:00.000Z");
    expect(iso(c.current.endExclusive)).toBe("2026-11-01T00:00:00.000Z");
    // Septembre n'a que 30 jours : le mois précédent est pris en entier.
    expect(iso(c.previous.start)).toBe("2026-09-01T00:00:00.000Z");
    expect(iso(c.previous.endExclusive)).toBe("2026-10-01T00:00:00.000Z");
  });

  it("1er novembre 00:00 : le mois bascule, comparaison 1er contre 1er", () => {
    const now = new Date("2026-11-01T00:00:00.000Z");
    expect(monthOf(now)).toBe("2026-11");
    const c = monthComparison(now);
    expect(c.comparedUntil).toBe("2026-11-01");
    expect(iso(c.current.endExclusive)).toBe("2026-11-02T00:00:00.000Z");
    expect(iso(c.previous.start)).toBe("2026-10-01T00:00:00.000Z");
    expect(iso(c.previous.endExclusive)).toBe("2026-10-02T00:00:00.000Z");
  });

  it("à date équivalente : le 5 du mois, 1-5 contre 1-5 (pas le mois précédent entier)", () => {
    const c = monthComparison(new Date("2026-03-05T14:00:00.000Z"));
    expect(iso(c.current.endExclusive)).toBe("2026-03-06T00:00:00.000Z");
    expect(iso(c.previous.start)).toBe("2026-02-01T00:00:00.000Z");
    expect(iso(c.previous.endExclusive)).toBe("2026-02-06T00:00:00.000Z");
  });

  it("le 31 mars : février (28 jours) pris en entier", () => {
    const c = monthComparison(new Date("2026-03-31T10:00:00.000Z"));
    expect(iso(c.previous.endExclusive)).toBe("2026-03-01T00:00:00.000Z");
  });

  it("janvier : le mois précédent est décembre de l'année précédente", () => {
    const c = monthComparison(new Date("2026-01-15T10:00:00.000Z"));
    expect(c.previousMonth).toBe("2025-12");
    expect(iso(c.previous.start)).toBe("2025-12-01T00:00:00.000Z");
    expect(iso(c.previous.endExclusive)).toBe("2025-12-16T00:00:00.000Z");
  });

  it("addMonths, daysInMonth (bissextile) et libellés français", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-11", 3)).toBe("2027-02");
    expect(daysInMonth("2024-02")).toBe(29);
    expect(daysInMonth("2026-02")).toBe(28);
    expect(monthLabel("2026-10")).toBe("oct. 26");
    expect(monthLabel("2026-08")).toBe("août 26");
  });

  it("12 mois glissants, du plus ancien au courant, fenêtre contiguë", () => {
    const now = new Date("2026-10-20T08:00:00.000Z");
    const months = lastTwelveMonths(now);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2025-11");
    expect(months[11]).toBe("2026-10");
    const w = twelveMonthsPeriod(now);
    expect(iso(w.start)).toBe("2025-11-01T00:00:00.000Z");
    expect(iso(w.endExclusive)).toBe("2026-11-01T00:00:00.000Z");
    expect(iso(monthPeriod("2026-02").endExclusive)).toBe("2026-03-01T00:00:00.000Z");
  });

  it("semaine du lundi au dimanche", () => {
    expect(weekBounds(new Date("2026-10-20T10:00:00.000Z"))).toEqual({ monday: "2026-10-19", sunday: "2026-10-25" }); // mardi
    expect(weekBounds(new Date("2026-10-25T10:00:00.000Z"))).toEqual({ monday: "2026-10-19", sunday: "2026-10-25" }); // dimanche
    expect(weekBounds(new Date("2026-10-19T00:00:00.000Z"))).toEqual({ monday: "2026-10-19", sunday: "2026-10-25" }); // lundi
  });
});
