import { describe, expect, it } from "vitest";
import {
  CADENCE_DAYS,
  adjustmentQuantity,
  canTransition,
  computeVariance,
  finalQuantity,
  linesMissingReason,
  needsRecount,
  reliabilityPct,
  selectRotating,
  type SelectionItem,
} from "@/modules/inventory/rules";
import { SHEET_LINE_SELECT, toBlindLine } from "@/modules/inventory/dto";
import { saveCountSchema, validateCountSchema } from "@/modules/inventory/schemas";
import { can } from "@/lib/permissions";
import { formatDocumentNumber } from "@/modules/numbering";

const AT = new Date("2026-06-30T10:00:00Z");
const ago = (d: number) => new Date(AT.getTime() - d * 86_400_000);
const item = (itemId: string, abcClass: string | null, lastCountedDays: number | null, varianceDays: number | null = null): SelectionItem => ({
  itemId,
  abcClass,
  lastCountedAt: lastCountedDays === null ? null : ago(lastCountedDays),
  lastVarianceAt: varianceDays === null ? null : ago(varianceDays),
});

describe("sélection tournante", () => {
  it("A mensuel, B trimestriel, C semestriel", () => {
    expect(CADENCE_DAYS).toEqual({ A: 30, B: 91, C: 182 });
    const r = selectRotating([item("a-ok", "A", 20), item("a-due", "A", 31), item("b-ok", "B", 90), item("b-due", "B", 92), item("c-ok", "C", 100), item("c-due", "C", 200)], AT);
    expect(r.map((x) => x.itemId).sort()).toEqual(["a-due", "b-due", "c-due"]);
  });
  it("sans classe = traité comme C ; jamais compté = dû et prioritaire", () => {
    const r = selectRotating([item("n1", null, 100), item("n2", null, null), item("c1", "C", null)], AT);
    expect(r.map((x) => x.itemId)).toEqual(["c1", "n2"]);
    expect(r[0].reason).toBe("CLASSE_C");
  });
  it("article à écart récent remonté en tête, sauf recompté depuis moins de 7 jours", () => {
    const r = selectRotating([item("a", "A", 40), item("c", "C", 10, 15), item("c2", "C", 3, 3)], AT);
    expect(r[0]).toMatchObject({ itemId: "c", reason: "ECART_RECENT" });
    expect(r.find((x) => x.itemId === "c2")).toBeUndefined();
  });
  it("écart ancien (> 60 jours) ne compte plus", () => {
    expect(selectRotating([item("c", "C", 100, 90)], AT)).toEqual([]);
  });
  it("exclut les articles déjà en inventaire et plafonne la liste", () => {
    const items = Array.from({ length: 10 }, (_, i) => item(`i${i}`, "A", 60 + i));
    expect(selectRotating(items, AT, { cap: 3 })).toHaveLength(3);
    expect(selectRotating(items, AT, { cap: 3 })[0].itemId).toBe("i9");
    expect(selectRotating(items, AT, { excludeItemIds: ["i9"] }).some((x) => x.itemId === "i9")).toBe(false);
  });
});

describe("écarts et seuil", () => {
  const th = { pct: 5, value: 100_000 };
  it("écart nul : jamais au-dessus du seuil", () => {
    const v = computeVariance(10, 10, 5000, th);
    expect(v.quantity.toString()).toBe("0");
    expect(v.value).toBe(0);
    expect(v.exceedsThreshold).toBe(false);
  });
  it("valeur au PMP, FCFA entiers signés", () => {
    expect(computeVariance(100, 98, 1234.5, th).value).toBe(-2469);
    expect(computeVariance(100, 101, 1000, th).value).toBe(1000);
  });
  it("dépasse en % (> 5 %) même si la valeur est faible", () => {
    expect(computeVariance(100, 94, 10, th).exceedsThreshold).toBe(true);
    expect(computeVariance(100, 95, 10, th).exceedsThreshold).toBe(false);
  });
  it("dépasse en valeur (> 100 000 FCFA) même si le % est faible", () => {
    expect(computeVariance(10_000, 9_990, 10_001, th).exceedsThreshold).toBe(true);
    expect(computeVariance(10_000, 9_990, 10_000, th).exceedsThreshold).toBe(false);
  });
  it("théorique nul avec stock trouvé : écart important", () => {
    const v = computeVariance(0, 2, 10, th);
    expect(v.pct).toBeNull();
    expect(v.exceedsThreshold).toBe(true);
  });
  it("recomptage requis seulement au premier comptage hors seuil", () => {
    const line = { theoreticalQty: 100, pmp: 1000, countedQty: 50, recountQty: null };
    expect(needsRecount(line, th)).toBe(true);
    expect(needsRecount({ ...line, recountQty: 52 }, th)).toBe(false);
    expect(needsRecount({ ...line, countedQty: 99 }, th)).toBe(false);
  });
  it("le recomptage remplace le premier comptage", () => {
    expect(finalQuantity({ countedQty: 50, recountQty: 98 })?.toString()).toBe("98");
    expect(finalQuantity({ countedQty: 50, recountQty: null })?.toString()).toBe("50");
    expect(finalQuantity({ countedQty: null, recountQty: null })).toBeNull();
  });
  it("motif obligatoire pour chaque écart important", () => {
    const missing = linesMissingReason([
      { id: "1", exceedsThreshold: true, varianceReason: null },
      { id: "2", exceedsThreshold: true, varianceReason: "Casse constatée" },
      { id: "3", exceedsThreshold: false, varianceReason: null },
      { id: "4", exceedsThreshold: true, varianceReason: "  " },
    ]);
    expect(missing.map((m) => m.id)).toEqual(["1", "4"]);
  });
  it("fiabilité = % d'articles sans écart", () => {
    expect(reliabilityPct([0, 0, 0, 2]).toString()).toBe("75");
    expect(reliabilityPct([]).toString()).toBe("100");
    expect(reliabilityPct([0, 0, 1]).toString()).toBe("66.67");
  });
  it("ajustement = quantité retenue - stock actuel", () => {
    expect(adjustmentQuantity(8, 10).toString()).toBe("-2");
    expect(adjustmentQuantity(10, 10).isZero()).toBe(true);
  });
});

describe("workflow et numérotation", () => {
  it("transitions autorisées", () => {
    expect(canTransition("PREPARE", "EN_COMPTAGE")).toBe(true);
    expect(canTransition("PREPARE", "VALIDE")).toBe(false);
    expect(canTransition("EN_COMPTAGE", "A_VALIDER")).toBe(true);
    expect(canTransition("A_VALIDER", "VALIDE")).toBe(true);
    expect(canTransition("A_VALIDER", "EN_COMPTAGE")).toBe(true);
    expect(canTransition("VALIDE", "ANNULE")).toBe(false);
    expect(canTransition("ANNULE", "EN_COMPTAGE")).toBe(false);
  });
  it("numéro INV-AAAA-0001", () => {
    expect(formatDocumentNumber("INV", 2026, 1)).toBe("INV-2026-0001");
  });
});

describe("comptage aveugle : DTO sans théorique", () => {
  it("le select Prisma de la feuille ne lit ni théorique, ni PMP, ni valeur", () => {
    const keys = Object.keys(SHEET_LINE_SELECT);
    expect(keys).not.toContain("theoreticalQty");
    expect(keys).not.toContain("pmp");
    expect(keys).not.toContain("adjustmentMovementId");
    expect(keys).not.toContain("varianceReason");
  });
  it("toBlindLine ne recopie que les champs autorisés, même si la source en contient d'autres", () => {
    const leaky = {
      id: "l1",
      itemId: "i1",
      countedQty: { toString: () => "12" },
      recountQty: null,
      recountRequired: true,
      item: { code: "IT-1", name: "Courroie", stockUnit: "U", barcode: null },
      theoreticalQty: 4321,
      pmp: 1500,
      varianceReason: "secret",
    };
    const dto = toBlindLine(leaky);
    expect(JSON.stringify(dto)).not.toMatch(/theoretical|pmp|1500|secret|4321/);
    expect(dto).toEqual({ id: "l1", itemId: "i1", code: "IT-1", name: "Courroie", unit: "U", barcode: null, countedQty: "12", recountQty: null, recountRequired: true });
  });
});

describe("droits et validation des entrées", () => {
  const user = (role: "RESPONSABLE_ACHATS" | "MAGASINIER" | "ACHETEUR" | "SUPER_ADMIN") => ({ role, purchaseScope: "ALL" as const });
  it("Magasinier : compter seulement", () => {
    const m = user("MAGASINIER");
    expect(can(m, "inventory.count")).toBe(true);
    for (const a of ["inventory.view", "inventory.prepare", "inventory.validate", "inventory.cancel"] as const) expect(can(m, a)).toBe(false);
  });
  it("Responsable : préparer, valider, annuler, consulter", () => {
    const r = user("RESPONSABLE_ACHATS");
    for (const a of ["inventory.view", "inventory.prepare", "inventory.count", "inventory.validate", "inventory.cancel"] as const) expect(can(r, a)).toBe(true);
  });
  it("Acheteur et Super-admin : lecture seule", () => {
    for (const role of ["ACHETEUR", "SUPER_ADMIN"] as const) {
      const u = user(role);
      expect(can(u, "inventory.view")).toBe(true);
      for (const a of ["inventory.prepare", "inventory.count", "inventory.validate", "inventory.cancel"] as const) expect(can(u, a)).toBe(false);
    }
  });
  it("schémas : quantité négative ou à 4 décimales refusée, motif trop court refusé", () => {
    expect(saveCountSchema.safeParse({ countId: "c", lines: [{ lineId: "l", quantity: -1 }] }).success).toBe(false);
    expect(saveCountSchema.safeParse({ countId: "c", lines: [{ lineId: "l", quantity: 1.2345 }] }).success).toBe(false);
    expect(saveCountSchema.safeParse({ countId: "c", lines: [{ lineId: "l", quantity: 12.345 }] }).success).toBe(true);
    expect(saveCountSchema.safeParse({ countId: "c", lines: [] }).success).toBe(false);
    expect(validateCountSchema.safeParse({ countId: "c", reasons: [{ lineId: "l", reason: "a" }] }).success).toBe(false);
  });
});
