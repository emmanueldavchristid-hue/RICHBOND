import { describe, expect, it } from "vitest";
import { formatCommitment, formatCommitments } from "@/modules/purchase-requests/duplicates";
import { buyerCoversType, pickLeastLoaded } from "@/modules/purchase-requests/assignment";
import { exceedsThreshold, requiredApprovalLevels } from "@/modules/purchase-requests/approval-level";

describe("message de doublon (D13)", () => {
  it("DA en cours", () => {
    expect(
      formatCommitment({ source: "DA", number: "DA-2026-00012", qty: "50.000", unit: "U", date: new Date("2026-11-12T00:00:00Z") }),
    ).toBe("Déjà demandé : DA-2026-00012, 50 U, besoin le 12/11");
  });
  it("BC en cours (LOT-05)", () => {
    expect(
      formatCommitment({ source: "BC", number: "BC-2026-00042", qty: 50, unit: "U", date: new Date("2026-11-12T00:00:00Z") }),
    ).toBe("Déjà commandé : BC-2026-00042, 50 U attendues le 12/11");
  });
  it("plusieurs engagements : un message chacun, aucun : liste vide", () => {
    const list = formatCommitments([
      { source: "DA", number: "DA-2026-00001", qty: 2, unit: "KG", date: null },
      { source: "DA", number: "DA-2026-00002", qty: "1.5", unit: "KG", date: "2026-12-01T00:00:00Z" },
    ]);
    expect(list).toEqual(["Déjà demandé : DA-2026-00001, 2 KG", "Déjà demandé : DA-2026-00002, 1,5 KG, besoin le 01/12"]);
    expect(formatCommitments([])).toEqual([]);
  });
});

describe("seuil de validation (D12)", () => {
  it("seuil 0 = désactivé", () => {
    expect(exceedsThreshold(999_999_999, 0)).toBe(false);
  });
  it("au-delà du seuil seulement (strict) ; total inconnu : jamais", () => {
    expect(exceedsThreshold(1_000_001, 1_000_000)).toBe(true);
    expect(exceedsThreshold(1_000_000, 1_000_000)).toBe(false);
    expect(exceedsThreshold(null, 1_000_000)).toBe(false);
  });
  it("seul le Responsable valide tant que la direction n'existe pas", () => {
    expect(requiredApprovalLevels(5_000_000, 1_000_000)).toEqual(["RESPONSABLE"]);
    expect(requiredApprovalLevels(null, 0)).toEqual(["RESPONSABLE"]);
  });
});

describe("assignation (D7)", () => {
  it("périmètre : ALL couvre tout, LOCAL/IMPORT seulement le leur, null rien", () => {
    expect(buyerCoversType("ALL", "IMPORT")).toBe(true);
    expect(buyerCoversType("LOCAL", "LOCAL")).toBe(true);
    expect(buyerCoversType("LOCAL", "IMPORT")).toBe(false);
    expect(buyerCoversType("IMPORT", "LOCAL")).toBe(false);
    expect(buyerCoversType(null, "LOCAL")).toBe(false);
  });
  it("acheteur le moins chargé, départage alphabétique puis identifiant", () => {
    expect(pickLeastLoaded([])).toBeNull();
    expect(
      pickLeastLoaded([
        { id: "1", name: "Yao", openCount: 3 },
        { id: "2", name: "Koné", openCount: 1 },
        { id: "3", name: "Aka", openCount: 1 },
      ])?.id,
    ).toBe("3");
  });
});
