import { describe, expect, it } from "vitest";
import {
  CODE_REGEX,
  normalizeCode,
  normalizeName,
  optionalCodeSchema,
  requiredCodeSchema,
  validateNcc,
} from "@/modules/referentials/codes";
import { formatDocumentNumber } from "@/modules/numbering/format";

describe("codes (R1)", () => {
  it("normalise : espaces de bord et majuscules", () => expect(normalizeCode("  art-0012 ")).toBe("ART-0012"));
  it("accepte 17 caractères, refuse 18", () => {
    expect(CODE_REGEX.test("A".repeat(17))).toBe(true);
    expect(CODE_REGEX.test("A".repeat(18))).toBe(false);
  });
  it("refuse espace, caractères spéciaux et début par un séparateur", () => {
    for (const bad of ["AB CD", "AB/CD", "-AB", "É12", ""]) expect(CODE_REGEX.test(bad), bad).toBe(false);
    for (const ok of ["AB-12", "A.B_C", "6205", "PO3000"]) expect(CODE_REGEX.test(ok), ok).toBe(true);
  });
  it("code facultatif : vide => undefined (génération serveur)", () => {
    expect(optionalCodeSchema.parse("")).toBeUndefined();
    expect(optionalCodeSchema.parse("   ")).toBeUndefined();
    expect(optionalCodeSchema.parse(undefined)).toBeUndefined();
    expect(optionalCodeSchema.parse(" ab-1 ")).toBe("AB-1");
    expect(optionalCodeSchema.safeParse("a b").success).toBe(false);
  });
  it("code obligatoire : vide refusé", () => {
    expect(requiredCodeSchema.safeParse("").success).toBe(false);
    expect(requiredCodeSchema.parse("mag-1")).toBe("MAG-1");
  });
  it("format généré ART-00001 / FRS-00001", () => {
    expect(formatDocumentNumber("ART", 0, 1)).toBe("ART-00001");
    expect(formatDocumentNumber("FRS", 0, 25)).toBe("FRS-00025");
  });
});

describe("NCC et doublons (R20)", () => {
  it("NCC conforme", () => expect(validateNcc("2100001A").ok).toBe(true));
  it("NCC non conforme : avertissement, jamais d'erreur", () => {
    const r = validateNcc("12345");
    expect(r.ok).toBe(false);
    expect(r.warning).toMatch(/format habituel/);
  });
  it("normalizeName ignore accents, casse, ponctuation et forme juridique", () => {
    expect(normalizeName("Établissements  Kouadio, S.A.R.L.")).toBe(normalizeName("ETABLISSEMENTS KOUADIO sarl"));
    expect(normalizeName("Alpha Chimie")).not.toBe(normalizeName("Alpha Chimie Plus"));
  });
});
