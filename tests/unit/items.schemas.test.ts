import { describe, expect, it } from "vitest";
import { applyCategoryRules, createItemSchema, linkSupplierSchema, listItemsSchema } from "@/modules/items/schemas";

const base = { name: "Polyol", category: "MATIERE_PREMIERE", stockUnit: "KG", purchaseUnit: "FUT", conversionFactor: 200 };

describe("createItemSchema", () => {
  it("valeurs par défaut : stocké, criticité STANDARD, code vide", () => {
    const r = createItemSchema.parse(base);
    expect(r.stocked).toBe(true);
    expect(r.criticality).toBe("STANDARD");
    expect(r.code).toBeUndefined();
    expect(r.conversionFactor).toBe(200);
  });
  it("SERVICE => non stocké, seuils, dépôt et équipement ignorés (R6)", () => {
    const r = createItemSchema.parse({
      ...base,
      category: "SERVICE",
      stocked: true,
      safetyStock: 5,
      reorderPoint: 10,
      economicOrderQty: 3,
      defaultWarehouseId: "w1",
      equipment: "Machine",
    });
    expect(r).toMatchObject({
      stocked: false,
      safetyStock: null,
      reorderPoint: null,
      economicOrderQty: null,
      defaultWarehouseId: null,
      equipment: null,
    });
  });
  it("l'équipement n'est conservé que pour une PDR", () => {
    expect(createItemSchema.parse({ ...base, category: "PDR", equipment: "Matelasseuse" }).equipment).toBe("Matelasseuse");
    expect(createItemSchema.parse({ ...base, equipment: "Matelasseuse" }).equipment).toBeNull();
  });
  it("seuils négatifs refusés", () => {
    expect(createItemSchema.safeParse({ ...base, safetyStock: -1 }).success).toBe(false);
  });
  it("point de commande < stock de sécurité : message clair", () => {
    const r = createItemSchema.safeParse({ ...base, safetyStock: 10, reorderPoint: 5 });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toMatch(/point de commande/i);
  });
  it("coefficient 0 ou négatif refusé ; virgule décimale acceptée", () => {
    expect(createItemSchema.safeParse({ ...base, conversionFactor: 0 }).success).toBe(false);
    expect(createItemSchema.safeParse({ ...base, conversionFactor: -1 }).success).toBe(false);
    expect(createItemSchema.parse({ ...base, conversionFactor: "0,5" }).conversionFactor).toBe(0.5);
  });
  it("plus de 3 décimales refusé", () => {
    expect(createItemSchema.safeParse({ ...base, safetyStock: 1.2345 }).success).toBe(false);
  });
  it("unité hors liste fermée refusée (R4)", () => {
    expect(createItemSchema.safeParse({ ...base, stockUnit: "Kilo" }).success).toBe(false);
  });
  it("champs vides => null", () => {
    const r = createItemSchema.parse({ ...base, family: "", barcode: "", leadTimeDays: "" });
    expect(r.family).toBeNull();
    expect(r.barcode).toBeNull();
    expect(r.leadTimeDays).toBeNull();
  });
  it("applyCategoryRules est idempotent", () => {
    const once = createItemSchema.parse({ ...base, category: "SERVICE" });
    expect(applyCategoryRules(once)).toEqual(once);
  });
});

describe("linkSupplierSchema (prix, R10)", () => {
  const link = { itemId: "i", supplierId: "s" };
  it("prix en XOF : entier exigé", () => {
    expect(linkSupplierSchema.safeParse({ ...link, lastPrice: 1250.5, currencyCode: "XOF" }).success).toBe(false);
    expect(linkSupplierSchema.safeParse({ ...link, lastPrice: 1250, currencyCode: "XOF" }).success).toBe(true);
  });
  it("prix en devise : 2 décimales", () => {
    expect(linkSupplierSchema.safeParse({ ...link, lastPrice: 12.34, currencyCode: "EUR" }).success).toBe(true);
    expect(linkSupplierSchema.safeParse({ ...link, lastPrice: 12.345, currencyCode: "EUR" }).success).toBe(false);
  });
  it("un prix exige une devise", () => {
    expect(linkSupplierSchema.safeParse({ ...link, lastPrice: 10 }).success).toBe(false);
  });
  it("sans prix, ni devise requise", () => {
    expect(linkSupplierSchema.safeParse(link).success).toBe(true);
  });
});

describe("listItemsSchema (R17)", () => {
  it("défauts : page 1, taille 25, ordre asc ; chaînes d'URL coercées", () => {
    expect(listItemsSchema.parse({})).toMatchObject({ page: 1, taille: 25, ordre: "asc" });
    expect(listItemsSchema.parse({ page: "3", taille: "50", ordre: "desc", categorie: "", q: "" })).toMatchObject({
      page: 3,
      taille: 50,
      ordre: "desc",
    });
  });
  it("taille hors 25/50/100 refusée", () => {
    expect(listItemsSchema.safeParse({ taille: "30" }).success).toBe(false);
  });
  it("catégorie inconnue refusée", () => {
    expect(listItemsSchema.safeParse({ categorie: "AUTRE" }).success).toBe(false);
  });
});
