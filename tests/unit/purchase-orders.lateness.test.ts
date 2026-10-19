import { describe, expect, it } from "vitest";
import { ageInDays, ageSeverity, businessDaysBetween, diffDays, noonAbidjan } from "@/lib/dates";
import { daysLate, expectedDateOf, isLate, needsReminder } from "@/modules/purchase-orders/lateness";
import type { PoStatus } from "@/modules/purchase-orders/labels";

// Abidjan = UTC+0 toute l'année : les heures UTC et locales coïncident.
const at = (iso: string) => new Date(iso);
const po = (status: PoStatus, expectedDate: string) => ({ status, expectedDate: new Date(`${expectedDate}T00:00:00Z`) });

describe("date attendue (D19)", () => {
  it("la date promise prime sur la date demandée", () => {
    expect(expectedDateOf({ promisedDate: new Date("2026-11-20T00:00:00Z"), requestedDate: new Date("2026-11-10T00:00:00Z") })).toBe("2026-11-20");
    expect(expectedDateOf({ promisedDate: null, requestedDate: "2026-11-10" })).toBe("2026-11-10");
  });
});

describe("en retard (isLate / daysLate)", () => {
  it("veille, jour J, lendemain", () => {
    const o = po("CONFIRME", "2026-11-10");
    expect(isLate(o, at("2026-11-09T12:00:00Z"))).toBe(false);
    expect(isLate(o, at("2026-11-10T12:00:00Z"))).toBe(false); // le jour dit n'est pas un retard
    expect(isLate(o, at("2026-11-11T00:00:01Z"))).toBe(true);
    expect(daysLate(o, at("2026-11-14T08:00:00Z"))).toBe(4);
    expect(daysLate(o, at("2026-11-10T23:59:59Z"))).toBe(0);
  });

  it("seuls VALIDE, ENVOYE, CONFIRME et PARTIELLEMENT_RECU peuvent être en retard", () => {
    const now = at("2026-12-01T10:00:00Z");
    for (const s of ["VALIDE", "ENVOYE", "CONFIRME", "PARTIELLEMENT_RECU"] as const) expect(isLate(po(s, "2026-11-10"), now), s).toBe(true);
    for (const s of ["BROUILLON", "A_VALIDER", "RECU", "CLOTURE", "REFUSE", "ANNULE"] as const) {
      expect(isLate(po(s, "2026-11-10"), now), s).toBe(false);
      expect(daysLate(po(s, "2026-11-10"), now), s).toBe(0);
    }
  });

  it("bascule de jour à minuit, heure d'Abidjan (23:59 / 00:01)", () => {
    const o = po("ENVOYE", "2026-11-10");
    expect(isLate(o, at("2026-11-10T23:59:00Z"))).toBe(false);
    expect(isLate(o, at("2026-11-11T00:01:00Z"))).toBe(true);
  });
});

describe("à relancer (D20)", () => {
  const sent = (sentAt: string, over: Record<string, unknown> = {}) => ({ status: "ENVOYE" as PoStatus, sentAt: at(sentAt), lastRemindedAt: null, expectedDate: new Date("2027-01-01T00:00:00Z"), ...over });

  it("envoyé non confirmé depuis 3 jours ouvrés", () => {
    // lundi 2 novembre 2026
    expect(needsReminder(sent("2026-11-02T10:00:00Z"), at("2026-11-04T10:00:00Z"))).toBe(false); // 2 jours ouvrés
    expect(needsReminder(sent("2026-11-02T10:00:00Z"), at("2026-11-05T10:00:00Z"))).toBe(true); // 3 jours ouvrés
  });

  it("les week-ends ne comptent pas", () => {
    // vendredi 6 novembre -> lundi 9 : 1 jour ouvré ; jeudi 12 : 4
    expect(needsReminder(sent("2026-11-06T10:00:00Z"), at("2026-11-09T10:00:00Z"))).toBe(false);
    expect(needsReminder(sent("2026-11-06T10:00:00Z"), at("2026-11-11T10:00:00Z"))).toBe(true); // mer. 11 = 3 jours ouvrés
    expect(needsReminder(sent("2026-11-06T10:00:00Z"), at("2026-11-10T10:00:00Z"))).toBe(false); // mar. 10 = 2
  });

  it("une relance repousse l'indicateur", () => {
    const o = sent("2026-11-02T10:00:00Z", { lastRemindedAt: at("2026-11-05T09:00:00Z") });
    expect(needsReminder(o, at("2026-11-06T10:00:00Z"))).toBe(false);
    expect(needsReminder(o, at("2026-11-10T10:00:00Z"))).toBe(true); // 3 jours ouvrés après la relance
  });

  it("le délai est réglable", () => {
    expect(needsReminder(sent("2026-11-02T10:00:00Z"), at("2026-11-03T10:00:00Z"), 1)).toBe(true);
    expect(needsReminder(sent("2026-11-02T10:00:00Z"), at("2026-11-05T10:00:00Z"), 5)).toBe(false);
  });

  it("en retard sans relance depuis 2 jours ouvrés", () => {
    const late = { status: "CONFIRME" as PoStatus, sentAt: at("2026-10-01T10:00:00Z"), lastRemindedAt: null, expectedDate: new Date("2026-11-10T00:00:00Z") };
    expect(needsReminder(late, at("2026-11-11T10:00:00Z"))).toBe(false); // retard d'1 jour
    expect(needsReminder(late, at("2026-11-12T10:00:00Z"))).toBe(true); // 2 jours ouvrés
    expect(needsReminder({ ...late, lastRemindedAt: at("2026-11-12T08:00:00Z") }, at("2026-11-13T10:00:00Z"))).toBe(false);
    expect(needsReminder({ ...late, lastRemindedAt: at("2026-11-12T08:00:00Z") }, at("2026-11-16T10:00:00Z"))).toBe(true);
  });

  it("confirmé avec date promise future : jamais à relancer, même si la date demandée est passée", () => {
    const o = { status: "CONFIRME" as PoStatus, sentAt: at("2026-10-01T10:00:00Z"), lastRemindedAt: null, expectedDate: new Date("2026-12-15T00:00:00Z") };
    expect(needsReminder(o, at("2026-11-20T10:00:00Z"))).toBe(false);
  });

  it("statuts sans relance possible", () => {
    for (const s of ["BROUILLON", "A_VALIDER", "VALIDE", "RECU", "CLOTURE", "REFUSE", "ANNULE"] as const) {
      expect(needsReminder({ status: s, sentAt: at("2026-01-01T00:00:00Z"), expectedDate: "2026-01-02" }, at("2026-12-01T10:00:00Z")), s).toBe(false);
    }
  });
});

describe("ancienneté et jours ouvrés (lib/dates)", () => {
  it("jours calendaires, jamais négatifs", () => {
    expect(ageInDays(at("2026-11-02T10:00:00Z"), at("2026-11-05T01:00:00Z"))).toBe(3);
    expect(ageInDays(at("2026-11-05T10:00:00Z"), at("2026-11-02T10:00:00Z"))).toBe(0);
    expect(diffDays("2026-11-02", "2026-11-12")).toBe(10);
  });

  it("jours ouvrés entre deux dates", () => {
    expect(businessDaysBetween("2026-11-02", "2026-11-03")).toBe(1);
    expect(businessDaysBetween("2026-11-06", "2026-11-09")).toBe(1); // vendredi -> lundi
    expect(businessDaysBetween("2026-11-07", "2026-11-08")).toBe(0); // samedi -> dimanche
    expect(businessDaysBetween("2026-11-02", "2026-11-09")).toBe(5);
    expect(businessDaysBetween("2026-11-09", "2026-11-02")).toBe(0);
  });

  it("gravité : orange dès 2 jours ouvrés, rouge dès 5", () => {
    const from = at("2026-11-02T10:00:00Z");
    expect(ageSeverity(from, at("2026-11-03T10:00:00Z"))).toBe("normal");
    expect(ageSeverity(from, at("2026-11-04T10:00:00Z"))).toBe("warning");
    expect(ageSeverity(from, at("2026-11-06T10:00:00Z"))).toBe("warning");
    expect(ageSeverity(from, at("2026-11-09T10:00:00Z"))).toBe("critical");
  });

  it("midi à Abidjan pour un jour saisi sans heure", () => {
    expect(noonAbidjan("2026-11-05").toISOString()).toBe("2026-11-05T12:00:00.000Z");
  });
});
