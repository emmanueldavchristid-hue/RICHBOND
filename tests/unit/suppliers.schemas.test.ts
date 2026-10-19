import { describe, expect, it } from "vitest";
import {
  blockSupplierSchema,
  contactSchema,
  createSupplierSchema,
  listSuppliersSchema,
} from "@/modules/suppliers/schemas";

const base = { name: "ABIDJAN CHIMIE", type: "LOCAL", currencyCode: "xof" };

describe("createSupplierSchema", () => {
  it("défauts : pays CI, paiement 30 j, statut ACTIF, devise en majuscules", () => {
    const r = createSupplierSchema.parse(base);
    expect(r).toMatchObject({
      country: "CI",
      paymentTerm: "J30",
      status: "ACTIF",
      currencyCode: "XOF",
      contacts: [],
      categories: [],
    });
  });
  it("incoterm seulement pour un fournisseur IMPORT", () => {
    expect(createSupplierSchema.safeParse({ ...base, incoterm: "FOB" }).success).toBe(false);
    expect(createSupplierSchema.safeParse({ ...base, type: "IMPORT", incoterm: "FOB" }).success).toBe(true);
  });
  it("paiement « Autre » exige une précision", () => {
    expect(createSupplierSchema.safeParse({ ...base, paymentTerm: "AUTRE" }).success).toBe(false);
    expect(
      createSupplierSchema.safeParse({ ...base, paymentTerm: "AUTRE", paymentTermNote: "45 j fin de décade" }).success,
    ).toBe(true);
  });
  it("le blocage ne se fait pas par la création", () => {
    expect(createSupplierSchema.safeParse({ ...base, status: "BLOQUE" }).success).toBe(false);
  });
  it("NCC non conforme n'est pas une erreur de schéma (avertissement serveur)", () => {
    expect(createSupplierSchema.safeParse({ ...base, ncc: "ABC" }).success).toBe(true);
  });
  it("pays ISO 2 lettres", () => {
    expect(createSupplierSchema.safeParse({ ...base, country: "CIV" }).success).toBe(false);
  });
});

describe("contacts", () => {
  it("email et téléphone validés", () => {
    expect(contactSchema.safeParse({ name: "Awa", email: "pas-un-email" }).success).toBe(false);
    expect(contactSchema.safeParse({ name: "Awa", phone: "abc" }).success).toBe(false);
    expect(contactSchema.safeParse({ name: "Awa", phone: "+225 27 00 00 00 00", email: "Awa@Exemple.CI" }).success).toBe(true);
    expect(contactSchema.parse({ name: "Awa", email: "Awa@Exemple.CI" }).email).toBe("awa@exemple.ci");
  });
});

describe("blockSupplierSchema (R8)", () => {
  const v = { id: "s1", expectedUpdatedAt: new Date() };
  it("motif obligatoire (5 à 500 caractères)", () => {
    expect(blockSupplierSchema.safeParse({ ...v, reason: "" }).success).toBe(false);
    expect(blockSupplierSchema.safeParse({ ...v, reason: "abc" }).success).toBe(false);
    expect(blockSupplierSchema.safeParse({ ...v, reason: "Lots non conformes" }).success).toBe(true);
    expect(blockSupplierSchema.safeParse({ ...v, reason: "x".repeat(501) }).success).toBe(false);
  });
});

describe("listSuppliersSchema", () => {
  it("statut TOUS accepté, type inconnu refusé", () => {
    expect(listSuppliersSchema.parse({ statut: "TOUS" }).statut).toBe("TOUS");
    expect(listSuppliersSchema.safeParse({ type: "X" }).success).toBe(false);
  });
});
