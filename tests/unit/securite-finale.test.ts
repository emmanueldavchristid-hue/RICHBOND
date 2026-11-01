import { describe, expect, it } from "vitest";
import { clientIpFromHeader } from "@/modules/auth/client-ip";
import { getLicenseSecret } from "@/modules/licensing/key";
import { toXof } from "@/modules/import-files/landed-cost";
import { readFileSync } from "node:fs";

describe("proxy : matcher", () => {
  // next-auth ne se charge pas sous Vitest : on évalue le littéral du matcher dans le source.
  const src = readFileSync("src/proxy.ts", "utf8");
  const literal = /matcher:\s*\[(".*")\]/.exec(src)![1];
  const re = new RegExp(`^${JSON.parse(literal)}$`);
  it("exclut api/cron et api/auth", () => {
    expect(re.test("/api/cron/alertes")).toBe(false);
    expect(re.test("/api/auth/session")).toBe(false);
  });
  it("garde les autres routes API et les pages sous session", () => {
    expect(re.test("/api/export-complet")).toBe(true);
    expect(re.test("/api/rapports/mensuel")).toBe(true);
    expect(re.test("/accueil")).toBe(true);
    expect(re.test("/faviconXico")).toBe(true);
  });
});

describe("IP cliente", () => {
  it("ignore X-Forwarded-For sans TRUST_PROXY=1", () => {
    expect(clientIpFromHeader("1.2.3.4", {})).toBeNull();
  });
  it("le prend en compte avec TRUST_PROXY=1", () => {
    expect(clientIpFromHeader("1.2.3.4, 10.0.0.1", { TRUST_PROXY: "1" })).toBe("1.2.3.4");
    expect(clientIpFromHeader(null, { TRUST_PROXY: "1" })).toBeNull();
  });
});

describe("secret de licence", () => {
  it("pas de secret de repli en production, même avec ALLOW_TEST_NOW", () => {
    expect(getLicenseSecret({ NODE_ENV: "production", ALLOW_TEST_NOW: "1" })).toBeNull();
  });
});

describe("toXof", () => {
  it("convertit et arrondit", () => {
    expect(toXof(100.5, 655.957)).toBe(65924);
  });
  it("refuse un montant converti au-delà de 2 147 483 647", () => {
    expect(() => toXof(4_000_000, 700)).toThrow(/2 147 483 647/);
  });
});
