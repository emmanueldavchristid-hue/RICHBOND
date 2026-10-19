import { describe, expect, it } from "vitest";
import { redactSecrets } from "@/modules/audit/redact";

describe("redactSecrets", () => {
  it("retire passwordHash et password*, y compris imbriqués", () => {
    const out = redactSecrets({
      name: "A",
      passwordHash: "x",
      password: "y",
      passwordConfirm: "z",
      nested: { passwordHash: "x", keep: 1, list: [{ newPassword: "p", ok: true }] },
      at: new Date("2026-01-01T00:00:00Z"),
    });
    expect(JSON.stringify(out)).not.toMatch(/passw/i);
    expect(out.nested.keep).toBe(1);
    expect(out.nested.list[0]).toEqual({ ok: true });
    expect(out.at).toBeInstanceOf(Date);
  });

  it("retire key et licenseKey mais conserve keyFingerprint", () => {
    const out = redactSecrets({ key: "RB-X", licenseKey: "RB-Y", keyFingerprint: "abc" });
    expect(out).toEqual({ keyFingerprint: "abc" });
  });
});
