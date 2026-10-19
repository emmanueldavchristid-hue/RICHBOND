import { describe, expect, it } from "vitest";
import {
  assertNeededByNotPast,
  compareRequests,
  dateOnly,
  priorityOf,
  resolveNeededBy,
} from "@/modules/purchase-requests/priority";

describe("priorité (D5)", () => {
  it("arrêt de production 0, urgente 1, normale 2", () => {
    expect(priorityOf("ARRET_PRODUCTION")).toBe(0);
    expect(priorityOf("URGENTE")).toBe(1);
    expect(priorityOf("NORMALE")).toBe(2);
  });

  it("tri : arrêt > urgente > normale, puis date de besoin, puis date de soumission", () => {
    const list = [
      { id: "normale-tot", priority: 2, neededBy: "2026-11-01", submittedAt: "2026-10-01T08:00:00Z" },
      { id: "urgente", priority: 1, neededBy: "2026-12-01", submittedAt: "2026-10-02T08:00:00Z" },
      { id: "arret-tard", priority: 0, neededBy: "2026-11-20", submittedAt: "2026-10-03T08:00:00Z" },
      { id: "normale-meme-jour-2", priority: 2, neededBy: "2026-11-01", submittedAt: "2026-10-05T08:00:00Z" },
      { id: "arret-tot", priority: 0, neededBy: "2026-10-25", submittedAt: "2026-10-04T08:00:00Z" },
      { id: "brouillon", priority: 2, neededBy: "2026-11-01", submittedAt: null },
    ];
    const sorted = [...list].sort(compareRequests).map((r) => r.id);
    expect(sorted).toEqual(["arret-tot", "arret-tard", "urgente", "normale-tot", "normale-meme-jour-2", "brouillon"]);
  });

  it("une arrêt de production passe devant même avec une date de besoin plus lointaine", () => {
    expect(
      compareRequests({ priority: 0, neededBy: "2027-01-01" }, { priority: 1, neededBy: "2026-01-01" }),
    ).toBeLessThan(0);
  });
});

describe("date de besoin", () => {
  it("refuse une date passée, accepte aujourd'hui et le futur", () => {
    expect(() => assertNeededByNotPast("2026-10-18", "2026-10-19")).toThrowError(/passé/);
    expect(() => assertNeededByNotPast("2026-10-19", "2026-10-19")).not.toThrow();
    expect(() => assertNeededByNotPast("2026-12-01", "2026-10-19")).not.toThrow();
  });
  it("arrêt de production : aujourd'hui par défaut ; autres urgences : pas de défaut", () => {
    expect(resolveNeededBy("ARRET_PRODUCTION", null, "2026-10-19")).toBe("2026-10-19");
    expect(resolveNeededBy("ARRET_PRODUCTION", "2026-10-25", "2026-10-19")).toBe("2026-10-25");
    expect(resolveNeededBy("NORMALE", null, "2026-10-19")).toBeNull();
  });
  it("dateOnly produit minuit UTC", () => {
    expect(dateOnly("2026-11-12").toISOString()).toBe("2026-11-12T00:00:00.000Z");
  });
});
