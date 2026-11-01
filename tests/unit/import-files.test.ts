import { describe, expect, it } from "vitest";
import { allocateByWeights, allocateCost, type AllocationLine } from "@/modules/import-files/allocation";
import { averageCoefficient, defaultCoefficient, suggestCoefficient } from "@/modules/import-files/coefficient";
import { estimateCosts } from "@/modules/import-files/estimates";
import { approachCoefficient, computeLandedCost, planReappraisal, toXof } from "@/modules/import-files/landed-cost";
import { currentMilestone, milestoneState } from "@/modules/import-files/milestones";
import { assertImportAccess } from "@/modules/import-files/scope";
import { computeRevaluation, Decimal } from "@/modules/stock/pmp";
import { can } from "@/lib/permissions";

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const line = (id: string, value: number, extra: Partial<AllocationLine> = {}): AllocationLine => ({ id, valueXof: value, qty: 10, weightKg: null, volumeM3: null, ...extra });

describe("répartition des frais d'approche : somme exacte au franc", () => {
  it("100 000 FCFA sur 3 lignes égales : plus fort reste, somme exacte", () => {
    const r = allocateByWeights(100_000, [1, 1, 1]);
    expect(r).toEqual([33_334, 33_333, 33_333]);
    expect(sum(r)).toBe(100_000);
  });

  it("clé VALEUR : proportionnelle, somme exacte", () => {
    const r = allocateCost(100_000, [line("a", 1000), line("b", 2000), line("c", 3000)], "VALEUR");
    expect(r.amounts).toEqual([16_667, 33_333, 50_000]);
    expect(sum(r.amounts)).toBe(100_000);
    expect(r.keyUsed).toBe("VALEUR");
    expect(r.fallback).toBe(false);
  });

  it("clé POIDS avec poids renseignés", () => {
    const r = allocateCost(100_000, [line("a", 1, { weightKg: 10 }), line("b", 1, { weightKg: 30 }), line("c", 1, { weightKg: 60 })], "POIDS");
    expect(r.amounts).toEqual([10_000, 30_000, 60_000]);
    expect(r.keyUsed).toBe("POIDS");
  });

  it("clé POIDS avec un poids nul ou absent : repli sur la valeur, signalé, somme exacte", () => {
    const r = allocateCost(100_000, [line("a", 1000, { weightKg: 5 }), line("b", 1000, { weightKg: 0 }), line("c", 1000, { weightKg: null })], "POIDS");
    expect(r.fallback).toBe(true);
    expect(r.keyUsed).toBe("VALEUR");
    expect(r.amounts).toEqual([33_334, 33_333, 33_333]);
    expect(sum(r.amounts)).toBe(100_000);
  });

  it("clé VOLUME et clé QUANTITE", () => {
    const vol = allocateCost(90_000, [line("a", 1, { volumeM3: 1 }), line("b", 1, { volumeM3: 2 })], "VOLUME");
    expect(vol.amounts).toEqual([30_000, 60_000]);
    const qty = allocateCost(10_001, [line("a", 1, { qty: 1 }), line("b", 1, { qty: 3 })], "QUANTITE");
    expect(qty.amounts).toEqual([2_500, 7_501]);
    expect(sum(qty.amounts)).toBe(10_001);
  });

  it("valeurs toutes nulles : repli sur la quantité", () => {
    const r = allocateCost(1000, [line("a", 0, { qty: 1 }), line("b", 0, { qty: 1 })], "VALEUR");
    expect(r.keyUsed).toBe("QUANTITE");
    expect(r.amounts).toEqual([500, 500]);
  });

  it("la somme répartie est toujours le total, quels que soient les poids", () => {
    for (const total of [0, 1, 7, 999_999, 123_456_789]) {
      for (const w of [[1, 2, 3], [0.333, 0.333, 0.334], [1e-3, 1e6, 7], [5], [0, 0, 0]]) {
        const r = allocateByWeights(total, w);
        expect(sum(r)).toBe(total);
        expect(r.every((x) => Number.isInteger(x) && x >= 0)).toBe(true);
      }
    }
  });
});

describe("conversion devise et coût dédouané", () => {
  it("USD -> FCFA au taux figé, arrondi au franc (demi vers l'extérieur)", () => {
    expect(toXof(650, "605")).toBe(393_250);
    expect(toXof("123.45", "598.5")).toBe(73_885); // 73 884,825
    expect(toXof(1000, 1)).toBe(1000);
    // Le taux est figé sur le frais : un taux ultérieur différent ne modifie pas le montant déjà converti.
    const frozen = toXof(650, "605");
    expect(toXof(650, "620")).not.toBe(frozen);
    expect(frozen).toBe(393_250);
  });

  const lines = [line("a", 3_000_000, { qty: 100 }), line("b", 1_000_000, { qty: 50 })];

  it("coût dédouané = valeur + frais répartis non récupérables ; coefficient = coût / valeur", () => {
    const r = computeLandedCost(lines, [
      { id: "fret", amountXof: 280_000, vatRecoverable: false, key: "VALEUR" },
      { id: "droits", amountXof: 400_000, vatRecoverable: false, key: "VALEUR" },
    ]);
    expect(r.totals).toMatchObject({ goodsValueXof: 4_000_000, costsXof: 680_000, excludedXof: 0, landedXof: 4_680_000 });
    expect(r.totals.coefficient!.toString()).toBe("1.17");
    expect(r.lines[0].landedValueXof).toBe(3_510_000);
    expect(r.lines[0].unitLandedCost.toString()).toBe("35100");
    expect(r.lines[1].unitLandedCost.toString()).toBe("23400");
    expect(sum(r.lines.map((l) => l.allocatedXof))).toBe(680_000);
  });

  it("un frais récupérable (TVA import) est exclu du coût et du coefficient", () => {
    const r = computeLandedCost(lines, [
      { id: "fret", amountXof: 400_000, vatRecoverable: false, key: "VALEUR" },
      { id: "tva", amountXof: 720_000, vatRecoverable: true, key: "VALEUR" },
    ]);
    expect(r.totals.costsXof).toBe(400_000);
    expect(r.totals.excludedXof).toBe(720_000);
    expect(r.totals.landedXof).toBe(4_400_000);
    expect(r.totals.coefficient!.toString()).toBe("1.1");
    expect(r.costs[1].excluded).toBe(true);
    expect(r.costs[1].amounts).toEqual([0, 0]);
  });

  it("coefficient absent sans valeur marchandise", () => {
    expect(approachCoefficient(100, 0)).toBeNull();
  });
});

describe("réajustement du PMP à la clôture", () => {
  // Lot de 100 unités reçu à 1 000 FCFA, coût dédouané 1 050 => surcoût 5 000 FCFA.
  const lot = [{ qty: 100, unitCostXof: 1000, landedUnitCostXof: 1050 }];

  it("stock intact : PMP + surcoût / stock", () => {
    const p = planReappraisal(lot, { quantity: 100, pmp: 1000 });
    expect(p).toMatchObject({ totalXof: 5000, appliedXof: 5000, exposedXof: 0 });
    expect(p.pmpAfter.toString()).toBe("1050");
  });

  it("stock partiellement consommé : seule la part restante est réévaluée, l'écart sorti est exposé", () => {
    const p = planReappraisal(lot, { quantity: 40, pmp: 1000 });
    expect(p.appliedXof).toBe(2000);
    expect(p.exposedXof).toBe(3000);
    expect(p.remainingQty.toString()).toBe("40");
    expect(p.pmpAfter.toString()).toBe("1050");
  });

  it("stock nul : PMP inchangé, tout le surcoût est exposé", () => {
    const p = planReappraisal(lot, { quantity: 0, pmp: 1000 });
    expect(p).toMatchObject({ appliedXof: 0, exposedXof: 5000 });
    expect(p.pmpAfter.toString()).toBe("1000");
  });

  it("stock plus grand que le lot (autres entrées) : surcoût réparti sur tout le stock", () => {
    const p = planReappraisal(lot, { quantity: 250, pmp: 1200 });
    expect(p.appliedXof).toBe(5000);
    expect(p.pmpAfter.toString()).toBe("1220");
  });

  it("le mouvement REEVALUATION_COUT applique la même formule", () => {
    const m = computeRevaluation({ stock: 40, pmp: 1000, valueDelta: 2000 });
    expect(m.pmpAfter.toString()).toBe("1050");
    expect(m.quantity.isZero()).toBe(true);
    expect(m.stockAfter.toString()).toBe("40");
    expect(m.value).toBe(2000);
    expect(() => computeRevaluation({ stock: 0, pmp: 1000, valueDelta: 10 })).toThrow();
    expect(() => computeRevaluation({ stock: 10, pmp: 1000, valueDelta: 0 })).toThrow();
    expect(new Decimal(m.pmpBefore).toString()).toBe("1000");
  });
});

describe("estimations, coefficients et jalons", () => {
  it("frais estimés = valeur x % par défaut du mode", () => {
    const e = estimateCosts(4_000_000, [
      { typeId: "fret", pctOfValue: 5 },
      { typeId: "transit", pctOfValue: 1.5 },
      { typeId: "vide", pctOfValue: 0 },
    ]);
    expect(e).toEqual([
      { typeId: "fret", amountXof: 200_000 },
      { typeId: "transit", amountXof: 60_000 },
    ]);
    expect(estimateCosts(0, [{ typeId: "x", pctOfValue: 10 }])).toEqual([]);
  });

  it("coefficient par défaut d'un mode et moyennes historiques", () => {
    expect(defaultCoefficient([5, 1, 6, 2, 1.5, 1, 0.5, 1]).toString()).toBe("1.18");
    expect(averageCoefficient(["1.2", "1.3"])!.toString()).toBe("1.25");
    expect(averageCoefficient([])).toBeNull();
    const history = [
      { supplierId: "s1", origin: "SG", mode: "MARITIME" as const, coefficient: "1.20" },
      { supplierId: "s2", origin: "SG", mode: "MARITIME" as const, coefficient: "1.30" },
    ];
    const d = new Decimal("1.18");
    expect(suggestCoefficient(history, { supplierId: "s1", origin: "SG", mode: "MARITIME" }, d)).toMatchObject({ basis: "FOURNISSEUR", samples: 1 });
    expect(suggestCoefficient(history, { supplierId: "s9", origin: "SG", mode: "MARITIME" }, d).coefficient.toString()).toBe("1.25");
    expect(suggestCoefficient(history, { supplierId: "s9", origin: "CN", mode: "AERIEN" }, d)).toMatchObject({ basis: "DEFAUT", samples: 0 });
  });

  it("jalon en retard, jalon courant", () => {
    expect(milestoneState({ code: "EMBARQUEMENT_ETD", plannedDate: "2026-10-01", actualDate: null }, "2026-10-04")).toMatchObject({ late: true, daysLate: 3 });
    expect(milestoneState({ code: "EMBARQUEMENT_ETD", plannedDate: "2026-10-01", actualDate: "2026-10-03" }, "2026-10-04")).toMatchObject({ late: false, slipDays: 2 });
    expect(milestoneState({ code: "EMBARQUEMENT_ETD", plannedDate: null, actualDate: null }, "2026-10-04").late).toBe(false);
    const cur = currentMilestone([
      { code: "ARRIVEE_PREVUE_ETA", plannedDate: null, actualDate: null },
      { code: "PROFORMA_RECUE", plannedDate: null, actualDate: "2026-09-01" },
      { code: "PAIEMENT_OU_CREDOC", plannedDate: null, actualDate: null },
    ]);
    expect(cur?.code).toBe("PAIEMENT_OU_CREDOC");
  });
});

describe("périmètre du module Import", () => {
  const user = (role: "RESPONSABLE_ACHATS" | "ACHETEUR" | "MAGASINIER" | "SUPER_ADMIN", purchaseScope: "LOCAL" | "IMPORT" | "ALL" | null = null) => ({ id: "u", role, purchaseScope });

  it("un acheteur au périmètre LOCAL est refusé (lecture, gestion, clôture)", () => {
    for (const a of ["importFile.view", "importFile.manage", "importFile.close"] as const) {
      expect(() => assertImportAccess(user("ACHETEUR", "LOCAL"), a)).toThrowError(/périmètre/);
    }
    expect(() => assertImportAccess(user("ACHETEUR", null), "importFile.view")).toThrow();
  });

  it("acheteur IMPORT ou ALL, Responsable : accès ; Magasinier : refusé", () => {
    for (const s of ["IMPORT", "ALL"] as const) {
      expect(() => assertImportAccess(user("ACHETEUR", s), "importFile.close")).not.toThrow();
    }
    expect(() => assertImportAccess(user("RESPONSABLE_ACHATS"), "importFile.close")).not.toThrow();
    expect(() => assertImportAccess(user("MAGASINIER"), "importFile.view")).toThrow();
  });

  it("paramétrage des frais : Responsable seul", () => {
    expect(can(user("RESPONSABLE_ACHATS"), "importCost.configure")).toBe(true);
    expect(can(user("ACHETEUR", "IMPORT"), "importCost.configure")).toBe(false);
    expect(() => assertImportAccess(user("ACHETEUR", "ALL"), "importCost.configure")).toThrow();
    expect(can(user("SUPER_ADMIN"), "importFile.manage")).toBe(false);
  });
});
