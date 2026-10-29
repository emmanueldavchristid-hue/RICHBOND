import { describe, expect, it } from "vitest";
import { composeDigest, digestKey, slotFor } from "@/modules/notifications/digest-format";

describe("digest : créneau et clé (Africa/Abidjan = UTC+0)", () => {
  it("8h => MATIN, 15h => APRES_MIDI", () => {
    expect(slotFor(new Date("2026-10-28T08:00:00Z"))).toBe("MATIN");
    expect(slotFor(new Date("2026-10-28T15:00:00Z"))).toBe("APRES_MIDI");
  });
  it("bascule à midi, pas de décalage d'heure d'été", () => {
    expect(slotFor(new Date("2026-10-28T11:59:00Z"))).toBe("MATIN");
    expect(slotFor(new Date("2026-10-28T12:00:00Z"))).toBe("APRES_MIDI");
    expect(slotFor(new Date("2026-07-14T08:00:00Z"))).toBe("MATIN");
  });
  it("clé = jour d'Abidjan + créneau", () => {
    expect(digestKey(new Date("2026-10-28T08:00:00Z"), "MATIN")).toBe("2026-10-28-MATIN");
    expect(digestKey(new Date("2026-10-28T23:59:00Z"), "APRES_MIDI")).toBe("2026-10-28-APRES_MIDI");
  });
});

describe("digest : composition", () => {
  it("rien à signaler => null (pas de digest vide)", () => {
    expect(composeDigest([{ label: "BC en retard", count: 0, href: "/x", tone: "critical" }], "MATIN")).toBeNull();
  });
  it("garde les lignes non nulles, critique en premier, lien direct", () => {
    const d = composeDigest(
      [
        { label: "BC à valider", count: 2, href: "/achats/commandes?onglet=a-valider", tone: "attention" },
        { label: "Vide", count: 0, href: "/v", tone: "info" },
        { label: "BC en retard", count: 1, href: "/achats/commandes?onglet=en-retard", tone: "critical" },
      ],
      "APRES_MIDI",
    );
    expect(d?.title).toBe("Point de 15h : 2 sujets à traiter");
    expect(d?.body).toBe("BC en retard : 1\nBC à valider : 2");
    expect(d?.link).toBe("/achats/commandes?onglet=en-retard");
    expect(d?.severity).toBe("IMPORTANT");
  });
});
