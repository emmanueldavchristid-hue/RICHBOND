import { describe, expect, it } from "vitest";
import { fingerprint, generateLicenseKey, getLicenseSecret, normalizeKey, verifyLicenseKey } from "@/modules/licensing/key";

const SECRET = "unit-test-secret-0123456789-abcdefghij";

describe("clé de licence", () => {
  it("format RB-XXXXX-XXXXX-XXXXX-XXXXX, déterministe", () => {
    const k = generateLicenseKey(SECRET, "RICHBOND CI");
    expect(k).toMatch(/^RB(-[A-Z2-7]{5}){4}$/);
    expect(generateLicenseKey(SECRET, "RICHBOND CI")).toBe(k);
    expect(generateLicenseKey(SECRET, "  RICHBOND CI ")).toBe(k);
  });
  it("normalisation de la saisie", () => {
    const k = generateLicenseKey(SECRET, "RICHBOND CI");
    expect(verifyLicenseKey(SECRET, "RICHBOND CI", k.toLowerCase())).toBe(true);
    expect(verifyLicenseKey(SECRET, "RICHBOND CI", ` ${k.replaceAll("-", " ")} `)).toBe(true);
    expect(verifyLicenseKey(SECRET, "RICHBOND CI", k.replaceAll("-", ""))).toBe(true);
    expect(normalizeKey(k.slice(3).replaceAll("-", ""))).toBe(k);
  });
  it("mauvais secret, bénéficiaire ou clé => invalide", () => {
    const k = generateLicenseKey(SECRET, "RICHBOND CI");
    expect(verifyLicenseKey("autre-secret-0123456789-abcdefghijklmn", "RICHBOND CI", k)).toBe(false);
    expect(verifyLicenseKey(SECRET, "AUTRE", k)).toBe(false);
    expect(verifyLicenseKey(SECRET, "RICHBOND CI", "RB-AAAAA")).toBe(false);
    expect(verifyLicenseKey(SECRET, "RICHBOND CI", "")).toBe(false);
  });
  it("empreinte sha256 de la clé normalisée", () => {
    const k = generateLicenseKey(SECRET, "RICHBOND CI");
    expect(fingerprint(k)).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprint(k.toLowerCase())).toBe(fingerprint(k));
  });
});

describe("getLicenseSecret", () => {
  it("production sans secret ou trop court => null", () => {
    expect(getLicenseSecret({ NODE_ENV: "production" })).toBeNull();
    expect(getLicenseSecret({ NODE_ENV: "production", LICENSE_SECRET: "court" })).toBeNull();
  });
  it("secret valide utilisé ; hors production => repli", () => {
    expect(getLicenseSecret({ NODE_ENV: "production", LICENSE_SECRET: SECRET })).toBe(SECRET);
    expect(getLicenseSecret({ NODE_ENV: "test" })).toMatch(/^dev-only/);
  });
});
