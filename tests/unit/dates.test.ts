import { describe, expect, it } from "vitest";
import { addBusinessDays, currentYear, formatDate, formatDateTime, startOfDayAbidjan } from "@/lib/dates";

describe("dates (Africa/Abidjan = UTC+0)", () => {
  it("formate JJ/MM/AAAA", () => expect(formatDate(new Date("2026-03-05T10:00:00Z"))).toBe("05/03/2026"));
  it("formate JJ/MM/AAAA HH:mm", () =>
    expect(formatDateTime(new Date("2026-03-05T09:07:00Z"))).toBe("05/03/2026 09:07"));
  it("passage de minuit UTC", () => {
    expect(formatDate(new Date("2026-03-05T23:59:59Z"))).toBe("05/03/2026");
    expect(formatDate(new Date("2026-03-06T00:00:00Z"))).toBe("06/03/2026");
  });
  it("currentYear au changement d'année", () => {
    expect(currentYear(new Date("2026-12-31T23:59:00Z"))).toBe(2026);
    expect(currentYear(new Date("2027-01-01T00:00:00Z"))).toBe(2027);
  });
  it("startOfDayAbidjan", () =>
    expect(startOfDayAbidjan(new Date("2026-03-05T15:30:00Z")).toISOString()).toBe(
      "2026-03-05T00:00:00.000Z",
    ));
  it("jours ouvrés : saute le week-end", () => {
    // vendredi 06/03/2026 + 1 jour ouvré = lundi 09/03/2026
    expect(formatDate(addBusinessDays(new Date("2026-03-06T08:00:00Z"), 1))).toBe("09/03/2026");
    // samedi + 1 = lundi
    expect(formatDate(addBusinessDays(new Date("2026-03-07T08:00:00Z"), 1))).toBe("09/03/2026");
    expect(formatDate(addBusinessDays(new Date("2026-03-09T08:00:00Z"), -1))).toBe("06/03/2026");
  });
});
