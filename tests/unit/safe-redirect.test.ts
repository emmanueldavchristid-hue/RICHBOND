import { describe, expect, it } from "vitest";
import { safeRedirect } from "@/modules/auth/login";

describe("safeRedirect", () => {
  it.each(["/achats/da?x=1", "/accueil", "/parametres/utilisateurs"])("accepte %s", (p) => {
    expect(safeRedirect(p)).toBe(p);
  });
  it.each<string | null | undefined>([
    null,
    undefined,
    "",
    "evil.com",
    "//evil.com",
    "/\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "/%09/evil.com",
    "/%0a/evil.com",
    "https://evil.com",
    "/%E0%A4%A",
  ])("refuse un chemin dangereux (cas %#)", (p) => {
    expect(safeRedirect(p as string | null | undefined)).toBe("/accueil");
  });
});
