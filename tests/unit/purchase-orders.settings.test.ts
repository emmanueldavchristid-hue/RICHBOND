import { describe, expect, it } from "vitest";
import { SETTING_DEFS, updateSettingSchema } from "@/modules/settings/keys";

const ok = (key: string, value: unknown) => updateSettingSchema.safeParse({ key, value }).success;

describe("réglages des bons de commande (D3, D12, D14, D20, D29)", () => {
  it("valeurs par défaut", () => {
    expect(SETTING_DEFS["purchaseOrder.approvalThreshold"].default).toBe(0);
    expect(SETTING_DEFS["purchaseOrder.defaultVatRate"].default).toBe(18);
    expect(SETTING_DEFS["purchaseOrder.priceAlertPct"].default).toBe(20);
    expect(SETTING_DEFS["purchaseOrder.reminderAfterDays"].default).toBe(3);
    expect(SETTING_DEFS["company.name"].default).toBe("RICHBOND CI");
  });

  it("seuil de validation : entier de FCFA positif ou nul, plafonné au maximum INTEGER", () => {
    expect(ok("purchaseOrder.approvalThreshold", 0)).toBe(true);
    expect(ok("purchaseOrder.approvalThreshold", 500_000)).toBe(true);
    expect(ok("purchaseOrder.approvalThreshold", 2_147_483_647)).toBe(true);
    expect(ok("purchaseOrder.approvalThreshold", 2_147_483_648)).toBe(false);
    expect(ok("purchaseOrder.approvalThreshold", -1)).toBe(false);
    expect(ok("purchaseOrder.approvalThreshold", 1000.5)).toBe(false);
  });

  it("TVA par défaut : 0, 9 ou 18 seulement", () => {
    for (const v of [0, 9, 18]) expect(ok("purchaseOrder.defaultVatRate", v)).toBe(true);
    for (const v of [5, 19, "18"]) expect(ok("purchaseOrder.defaultVatRate", v)).toBe(false);
  });

  it("seuil d'alerte de prix et délai de relance", () => {
    expect(ok("purchaseOrder.priceAlertPct", 0)).toBe(true);
    expect(ok("purchaseOrder.priceAlertPct", 25.5)).toBe(true);
    expect(ok("purchaseOrder.priceAlertPct", -1)).toBe(false);
    expect(ok("purchaseOrder.reminderAfterDays", 1)).toBe(true);
    expect(ok("purchaseOrder.reminderAfterDays", 0)).toBe(false);
    expect(ok("purchaseOrder.reminderAfterDays", 31)).toBe(false);
    expect(ok("purchaseOrder.reminderAfterDays", 2.5)).toBe(false);
  });

  it("coordonnées société : raison sociale obligatoire, e-mail valide ou vide, longueurs limitées", () => {
    expect(ok("company.name", "RICHBOND CI")).toBe(true);
    expect(ok("company.name", "R")).toBe(false);
    expect(ok("company.email", "")).toBe(true);
    expect(ok("company.email", "achats@richbond.test")).toBe(true);
    expect(ok("company.email", "pas-un-mail")).toBe(false);
    expect(ok("company.address", "x".repeat(301))).toBe(false);
    expect(ok("purchaseOrder.pdfConditions", "x".repeat(1001))).toBe(false);
    expect(ok("purchaseOrder.pdfFooter", "Pied de page")).toBe(true);
  });
});
