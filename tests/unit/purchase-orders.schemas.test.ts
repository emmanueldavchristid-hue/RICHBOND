import { describe, expect, it } from "vitest";
import { BusinessError } from "@/lib/errors";
import {
  MAX_LINES,
  changePromisedDateSchema,
  confirmOrderSchema,
  createFromRequestLinesSchema,
  createOrderSchema,
  listOrdersSchema,
  markSentSchema,
  orderLineSchema,
  rejectOrderSchema,
  remindOrderSchema,
  startAmendmentSchema,
  unitPriceSchema,
  updateOrderSchema,
} from "@/modules/purchase-orders/schemas";
import { assertNotFuture, assertPromisedDate, assertRequestedDateNotPast, assertSubmittable, importTermsProblem, submissionProblems } from "@/modules/purchase-orders/rules";

const line = (over: Record<string, unknown> = {}) => ({ itemId: "it1", quantity: 10, unitPrice: 1250, allocations: [{ requestLineId: "rl1", qty: 10 }], ...over });
const header = (over: Record<string, unknown> = {}) => ({ supplierId: "s1", warehouseId: "w1", requestedDate: "2026-12-01", lines: [line()], ...over });
const issue = (r: { success: boolean; error?: { issues: { message: string }[] } }) => (r.success ? null : r.error!.issues[0].message);

describe("en-tête", () => {
  it("BC depuis une DA : valeurs par défaut (origine DA, listes vides)", () => {
    const r = createOrderSchema.parse(header());
    expect(r.origin).toBe("DA");
    expect(r.charges).toEqual([]);
    expect(r.currencyCode).toBeNull();
    expect(r.lines[0].discountPct).toBe("0");
    expect(r.lines[0].vatRate).toBeNull();
  });

  it("commande directe : motif obligatoire (10 caractères), aucune allocation", () => {
    const direct = (over: Record<string, unknown>) => createOrderSchema.safeParse(header({ origin: "DIRECT", lines: [line({ allocations: [] })], ...over }));
    expect(issue(direct({}))).toMatch(/motif d'une commande directe/);
    expect(issue(direct({ directReason: "court" }))).toMatch(/10 caractères/);
    expect(direct({ directReason: "Urgence fournisseur unique, sans DA" }).success).toBe(true);
    expect(issue(createOrderSchema.safeParse(header({ origin: "DIRECT", directReason: "Urgence fournisseur unique", lines: [line()] })))).toMatch(/aucune demande d'achat/);
  });

  it("BC depuis une DA : chaque ligne doit être rattachée à une DA", () => {
    expect(issue(createOrderSchema.safeParse(header({ lines: [line({ allocations: [] })] })))).toMatch(/Ligne 1 : rattachez-la/);
  });

  it("incoterm : le lieu est obligatoire (2 à 100 caractères)", () => {
    expect(issue(createOrderSchema.safeParse(header({ incoterm: "FOB" })))).toMatch(/lieu de l'incoterm/);
    expect(issue(createOrderSchema.safeParse(header({ incoterm: "FOB", incotermPlace: "S" })))).toMatch(/2 caractères/);
    expect(issue(createOrderSchema.safeParse(header({ incoterm: "FOB", incotermPlace: "x".repeat(101) })))).toMatch(/trop long/);
    expect(createOrderSchema.safeParse(header({ incoterm: "FOB", incotermPlace: "Shanghai" })).success).toBe(true);
    expect(issue(createOrderSchema.safeParse(header({ incoterm: "XYZ", incotermPlace: "Shanghai" })))).toMatch(/Incoterm invalide/);
  });

  it("50 lignes au maximum, 10 lignes de frais", () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => line({ itemId: `it${i}`, allocations: [{ requestLineId: `rl${i}`, qty: 1 }] }));
    expect(createOrderSchema.safeParse(header({ lines: many(MAX_LINES) })).success).toBe(true);
    expect(issue(createOrderSchema.safeParse(header({ lines: many(MAX_LINES + 1) })))).toMatch(/50 lignes/);
    const charges = (n: number) => Array.from({ length: n }, () => ({ label: "Transport", amount: 1000, vatRate: 18 }));
    expect(createOrderSchema.safeParse(header({ charges: charges(10) })).success).toBe(true);
    expect(issue(createOrderSchema.safeParse(header({ charges: charges(11) })))).toMatch(/lignes de frais/);
  });

  it("un article ne figure qu'une fois", () => {
    expect(issue(createOrderSchema.safeParse(header({ lines: [line(), line({ allocations: [{ requestLineId: "rl2", qty: 1 }] })] })))).toMatch(/déjà dans le bon/);
  });

  it("date demandée au format ISO, notes limitées", () => {
    expect(issue(createOrderSchema.safeParse(header({ requestedDate: "demain" })))).toMatch(/Date invalide/);
    expect(issue(createOrderSchema.safeParse(header({ notes: "x".repeat(1001) })))).toMatch(/1000/);
  });

  it("modification : identifiant et version obligatoires", () => {
    expect(updateOrderSchema.safeParse(header()).success).toBe(false);
    expect(updateOrderSchema.safeParse({ ...header(), id: "po1", expectedUpdatedAt: "2026-11-01T10:00:00.000Z" }).success).toBe(true);
  });
});

describe("lignes", () => {
  it("article OU désignation libre, exclusifs ; unité obligatoire pour une ligne libre", () => {
    expect(issue(orderLineSchema.safeParse({ quantity: 1 }))).toMatch(/article ou saisissez/);
    expect(issue(orderLineSchema.safeParse({ itemId: "i", freeDesignation: "Prestation de calibration", quantity: 1 }))).toMatch(/pas les deux/);
    expect(issue(orderLineSchema.safeParse({ freeDesignation: "Prestation de calibration", quantity: 1 }))).toMatch(/unité est obligatoire/);
    expect(orderLineSchema.safeParse({ freeDesignation: "Prestation de calibration", unit: "FORFAIT", quantity: 1 }).success).toBe(true);
  });

  it("quantité strictement positive, 3 décimales", () => {
    expect(orderLineSchema.safeParse({ itemId: "i", quantity: 0 }).success).toBe(false);
    expect(orderLineSchema.safeParse({ itemId: "i", quantity: "1,5" }).success).toBe(true);
    expect(orderLineSchema.safeParse({ itemId: "i", quantity: 1.2345 }).success).toBe(false);
  });

  it("TVA : 0, 9 ou 18 % seulement", () => {
    for (const v of [0, 9, 18, "18"]) expect(orderLineSchema.safeParse({ itemId: "i", quantity: 1, vatRate: v }).success, String(v)).toBe(true);
    for (const v of [5, 19, -1]) expect(orderLineSchema.safeParse({ itemId: "i", quantity: 1, vatRate: v }).success, String(v)).toBe(false);
  });

  it("remise de 0 à 100 %", () => {
    expect(orderLineSchema.safeParse({ itemId: "i", quantity: 1, discountPct: 100 }).success).toBe(true);
    expect(orderLineSchema.safeParse({ itemId: "i", quantity: 1, discountPct: 100.5 }).success).toBe(false);
    expect(orderLineSchema.safeParse({ itemId: "i", quantity: 1, discountPct: -5 }).success).toBe(false);
  });

  it("prix unitaire : texte décimal (virgule acceptée), jamais de flottant, 2 décimales", () => {
    expect(unitPriceSchema.parse("249,90")).toBe("249.90");
    expect(unitPriceSchema.parse(1250)).toBe("1250");
    expect(unitPriceSchema.safeParse("12.345").success).toBe(false);
    expect(unitPriceSchema.safeParse("-1").success).toBe(false);
    expect(unitPriceSchema.safeParse("abc").success).toBe(false);
    expect(unitPriceSchema.safeParse("1e3").success).toBe(false);
  });
});

describe("actions : champs obligatoires", () => {
  const v = { id: "po1", expectedUpdatedAt: "2026-11-01T10:00:00.000Z" };

  it("refus, avenant : motif d'au moins 5 caractères", () => {
    expect(issue(rejectOrderSchema.safeParse({ ...v, reason: "non" }))).toMatch(/5 caractères/);
    expect(rejectOrderSchema.safeParse({ ...v, reason: "Prix trop élevé" }).success).toBe(true);
    expect(issue(startAmendmentSchema.safeParse({ ...v, reason: "" }))).toMatch(/obligatoire/);
  });

  it("envoi : moyen obligatoire ; relance : moyen obligatoire", () => {
    expect(issue(markSentSchema.safeParse(v))).toMatch(/moyen/);
    expect(markSentSchema.safeParse({ ...v, channel: "WHATSAPP" }).success).toBe(true);
    expect(markSentSchema.safeParse({ ...v, channel: "PIGEON" }).success).toBe(false);
    expect(remindOrderSchema.safeParse({ ...v, channel: "TELEPHONE", contact: "M. Koffi", comment: "A promis jeudi" }).success).toBe(true);
    expect(remindOrderSchema.safeParse(v).success).toBe(false);
  });

  it("confirmation : date promise obligatoire ; report : date et motif", () => {
    expect(confirmOrderSchema.safeParse(v).success).toBe(false);
    expect(confirmOrderSchema.safeParse({ ...v, promisedDate: "2026-11-20" }).success).toBe(true);
    expect(changePromisedDateSchema.safeParse({ ...v, promisedDate: "2026-11-25" }).success).toBe(false);
    expect(changePromisedDateSchema.safeParse({ ...v, promisedDate: "2026-11-25", reason: "Retard de production" }).success).toBe(true);
  });

  it("brouillon depuis « À commander » : au moins une ligne cochée", () => {
    expect(createFromRequestLinesSchema.safeParse({ supplierId: "s1", lines: [] }).success).toBe(false);
    expect(createFromRequestLinesSchema.safeParse({ supplierId: "s1", lines: [{ requestLineId: "a" }] }).success).toBe(true);
  });

  it("filtres de liste : onglet, relance, pagination par défaut", () => {
    const f = listOrdersSchema.parse({});
    expect(f.onglet).toBe("tous");
    expect(f.page).toBe(1);
    expect(listOrdersSchema.parse({ relance: "1", onglet: "en-retard", devise: "usd" })).toMatchObject({ relance: true, onglet: "en-retard", devise: "USD" });
    expect(listOrdersSchema.safeParse({ onglet: "inconnu" }).success).toBe(false);
  });
});

describe("règles de date et de soumission", () => {
  it("date de livraison demandée : pas dans le passé (aujourd'hui accepté)", () => {
    expect(() => assertRequestedDateNotPast("2026-11-10", "2026-11-10")).not.toThrow();
    expect(() => assertRequestedDateNotPast("2026-11-09", "2026-11-10")).toThrowError(BusinessError);
  });

  it("date d'envoi : pas dans le futur ; date promise : pas avant le bon", () => {
    expect(() => assertNotFuture("2026-11-10", "2026-11-10")).not.toThrow();
    expect(() => assertNotFuture("2026-11-11", "2026-11-10")).toThrowError(/futur/);
    expect(() => assertPromisedDate("2026-11-05", "2026-11-05")).not.toThrow();
    expect(() => assertPromisedDate("2026-11-04", "2026-11-05")).toThrowError(/antérieure/);
  });

  it("import : incoterm et lieu exigés", () => {
    expect(importTermsProblem("LOCAL", null, null)).toBeNull();
    expect(importTermsProblem("IMPORT", null, null)).toMatch(/incoterm/);
    expect(importTermsProblem("IMPORT", "FOB", " ")).toMatch(/lieu/);
    expect(importTermsProblem("IMPORT", "FOB", "Shanghai")).toBeNull();
  });

  it("soumission : prix saisis, au moins une ligne, adresse de livraison", () => {
    const ok = { type: "LOCAL" as const, incoterm: null, incotermPlace: null, deliveryAddress: "Zone industrielle de Yopougon, Abidjan", lines: [{ quantity: "10", unitPrice: "1250" }] };
    expect(submissionProblems(ok)).toEqual([]);
    expect(submissionProblems({ ...ok, lines: [] })[0]).toMatch(/au moins une ligne/);
    expect(submissionProblems({ ...ok, lines: [{ quantity: "10", unitPrice: "0" }] })[0]).toMatch(/prix unitaire/);
    expect(submissionProblems({ ...ok, deliveryAddress: "" })[0]).toMatch(/adresse de livraison/);
    expect(submissionProblems({ ...ok, type: "IMPORT" })[0]).toMatch(/incoterm/);
    expect(() => assertSubmittable({ ...ok, lines: [] })).toThrowError(/au moins une ligne/);
    expect(() => assertSubmittable(ok)).not.toThrow();
  });
});
