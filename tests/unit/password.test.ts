import { describe, expect, it } from "vitest";
import { generateTemporaryPassword, hashPassword, verifyPassword } from "@/modules/auth/password";
import { changePasswordSchema, passwordSchema } from "@/modules/auth/schemas";

describe("passwordSchema", () => {
  it("refuse 7 caractères, accepte 8", () => {
    expect(passwordSchema.safeParse("1234567").success).toBe(false);
    expect(passwordSchema.safeParse("12345678").success).toBe(true);
  });
  it("refuse plus de 72 octets", () => {
    expect(passwordSchema.safeParse("a".repeat(72)).success).toBe(true);
    expect(passwordSchema.safeParse("a".repeat(73)).success).toBe(false);
    expect(passwordSchema.safeParse("é".repeat(37)).success).toBe(false);
  });
});

describe("changePasswordSchema", () => {
  it("exige une confirmation identique", () => {
    const r = changePasswordSchema.safeParse({ currentPassword: "x", newPassword: "Abcdefg1", confirmPassword: "Abcdefg2" });
    expect(r.success).toBe(false);
  });
});

describe("mot de passe temporaire", () => {
  it("12 caractères, conforme au schéma, différent à chaque appel", () => {
    const a = generateTemporaryPassword();
    const b = generateTemporaryPassword();
    expect(a).toHaveLength(12);
    expect(passwordSchema.safeParse(a).success).toBe(true);
    expect(/[a-z]/.test(a) && /[A-Z]/.test(a) && /\d/.test(a)).toBe(true);
    expect(a).not.toBe(b);
  });
  it("hash et vérification bcrypt", async () => {
    const h = await hashPassword("Secret-2026");
    expect(h).not.toContain("Secret-2026");
    expect(await verifyPassword("Secret-2026", h)).toBe(true);
    expect(await verifyPassword("autre", h)).toBe(false);
  });
});
