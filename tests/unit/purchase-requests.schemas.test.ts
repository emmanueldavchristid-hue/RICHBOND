import { describe, expect, it } from "vitest";
import {
  approveManySchema,
  approveRequestSchema,
  cancelRequestSchema,
  createReplenishmentSchema,
  createRequestSchema,
  listRequestsSchema,
  rejectRequestSchema,
  requestLineSchema,
  returnRequestSchema,
} from "@/modules/purchase-requests/schemas";
import { detectAttachmentType, sanitizeFileName } from "@/modules/purchase-requests/attachment-type";
import { displayNumber } from "@/modules/purchase-requests/labels";

const line = { itemId: "it1", quantity: 5 };
const header = {
  departmentId: "d1",
  requesterName: "Awa Koné",
  reason: "Remplacement courroie usée",
  urgency: "NORMALE",
  neededBy: "2026-12-01",
  type: "LOCAL",
  lines: [line],
};
const ok = (s: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) => s.safeParse(v).success;
const msg = (s: { safeParse: (v: unknown) => { success: boolean; error?: { issues: { message: string }[] } } }, v: unknown) =>
  s.safeParse(v).error?.issues[0]?.message;

describe("ligne de DA (D8)", () => {
  it("article XOR désignation libre", () => {
    expect(ok(requestLineSchema, line)).toBe(true);
    expect(ok(requestLineSchema, { freeDesignation: "Courroie crantée 8M-1200", quantity: 2, unit: "U" })).toBe(true);
    expect(ok(requestLineSchema, { quantity: 2, unit: "U" })).toBe(false);
    expect(ok(requestLineSchema, { ...line, freeDesignation: "Courroie crantée 8M", unit: "U" })).toBe(false);
  });
  it("désignation libre : 5 caractères minimum et unité obligatoire", () => {
    expect(ok(requestLineSchema, { freeDesignation: "abc", quantity: 1, unit: "U" })).toBe(false);
    expect(msg(requestLineSchema, { freeDesignation: "Courroie crantée", quantity: 1 })).toMatch(/unité/i);
  });
  it("quantité strictement positive, 3 décimales, virgule acceptée", () => {
    expect(ok(requestLineSchema, { ...line, quantity: 0 })).toBe(false);
    expect(ok(requestLineSchema, { ...line, quantity: -1 })).toBe(false);
    expect(ok(requestLineSchema, { ...line, quantity: "2,5" })).toBe(true);
    expect(ok(requestLineSchema, { ...line, quantity: 1.2345 })).toBe(false);
  });
  it("prix estimé facultatif, entier FCFA", () => {
    expect(requestLineSchema.parse(line).estimatedUnitPrice).toBeNull();
    expect(ok(requestLineSchema, { ...line, estimatedUnitPrice: 1250 })).toBe(true);
    expect(ok(requestLineSchema, { ...line, estimatedUnitPrice: 12.5 })).toBe(false);
    expect(ok(requestLineSchema, { ...line, estimatedUnitPrice: -5 })).toBe(false);
  });
  it("unité hors liste refusée", () => {
    expect(ok(requestLineSchema, { ...line, unit: "PARSEC" })).toBe(false);
  });
});

describe("création de DA", () => {
  it("cas nominal avec valeurs par défaut", () => {
    const r = createRequestSchema.parse({ departmentId: "d1", requesterName: "Awa", reason: "Besoin atelier", neededBy: "2026-12-01" });
    expect(r.urgency).toBe("NORMALE");
    expect(r.type).toBe("A_DEFINIR");
    expect(r.lines).toEqual([]);
  });
  it("50 lignes maximum", () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ itemId: `it${i}`, quantity: 1 }));
    expect(ok(createRequestSchema, { ...header, lines: many(50) })).toBe(true);
    expect(ok(createRequestSchema, { ...header, lines: many(51) })).toBe(false);
  });
  it("même article deux fois refusé", () => {
    expect(msg(createRequestSchema, { ...header, lines: [line, line] })).toMatch(/déjà/);
  });
  it("motif et demandeur obligatoires", () => {
    expect(ok(createRequestSchema, { ...header, reason: "ok" })).toBe(false);
    expect(ok(createRequestSchema, { ...header, requesterName: "" })).toBe(false);
  });
  it("date de besoin obligatoire sauf arrêt de production", () => {
    expect(ok(createRequestSchema, { ...header, neededBy: undefined })).toBe(false);
    expect(ok(createRequestSchema, { ...header, neededBy: undefined, urgency: "ARRET_PRODUCTION", reason: "Ligne mousse arrêtée" })).toBe(true);
    expect(ok(createRequestSchema, { ...header, neededBy: "pas-une-date" })).toBe(false);
  });
  it("arrêt de production : motif d'au moins 10 caractères (machine / ligne arrêtée)", () => {
    expect(ok(createRequestSchema, { ...header, urgency: "ARRET_PRODUCTION", reason: "Panne ok" })).toBe(false);
    expect(ok(createRequestSchema, { ...header, urgency: "ARRET_PRODUCTION", reason: "Ligne mousse arrêtée" })).toBe(true);
  });
  it("la date de besoin accepte un Date ou un ISO complet", () => {
    expect(createRequestSchema.parse({ ...header, neededBy: new Date("2026-12-01T00:00:00Z") }).neededBy).toBe("2026-12-01");
    expect(createRequestSchema.parse({ ...header, neededBy: "2026-12-01T00:00:00.000Z" }).neededBy).toBe("2026-12-01");
  });
  it("Magasinier : jamais de désignation libre", () => {
    expect(ok(createReplenishmentSchema, header)).toBe(true);
    const free = { ...header, lines: [{ freeDesignation: "Article nouveau", quantity: 1, unit: "U" }] };
    expect(ok(createRequestSchema, free)).toBe(true);
    expect(msg(createReplenishmentSchema, free)).toMatch(/catalogue/);
  });
});

describe("motifs et validation", () => {
  const v = { id: "x", expectedUpdatedAt: "2026-10-19T10:00:00.000Z" };
  it("refus, annulation : motif obligatoire (5 à 500 caractères)", () => {
    expect(ok(rejectRequestSchema, v)).toBe(false);
    expect(ok(rejectRequestSchema, { ...v, reason: "non" })).toBe(false);
    expect(ok(rejectRequestSchema, { ...v, reason: "Budget épuisé" })).toBe(true);
    expect(ok(rejectRequestSchema, { ...v, reason: "x".repeat(501) })).toBe(false);
    expect(ok(cancelRequestSchema, { ...v, reason: "" })).toBe(false);
    expect(ok(cancelRequestSchema, { ...v, reason: "Doublon avec une autre DA" })).toBe(true);
  });
  it("retour à compléter : commentaire obligatoire", () => {
    expect(ok(returnRequestSchema, v)).toBe(false);
    expect(ok(returnRequestSchema, { ...v, comment: "Précisez la référence" })).toBe(true);
  });
  it("version de la fiche obligatoire (D18)", () => {
    expect(ok(rejectRequestSchema, { id: "x", reason: "Budget épuisé" })).toBe(false);
  });
  it("validation : quantités validées >= 0, type Local/Import seulement", () => {
    expect(ok(approveRequestSchema, { ...v, lines: [{ lineId: "l1", approvedQty: 0 }] })).toBe(true);
    expect(ok(approveRequestSchema, { ...v, lines: [{ lineId: "l1", approvedQty: -1 }] })).toBe(false);
    expect(ok(approveRequestSchema, { ...v, type: "IMPORT" })).toBe(true);
    expect(ok(approveRequestSchema, { ...v, type: "A_DEFINIR" })).toBe(false);
  });
  it("validation groupée : de 1 à 50 DA", () => {
    expect(ok(approveManySchema, { items: [] })).toBe(false);
    expect(ok(approveManySchema, { items: [v] })).toBe(true);
    expect(ok(approveManySchema, { items: Array.from({ length: 51 }, () => v) })).toBe(false);
  });
});

describe("liste", () => {
  it("valeurs par défaut et filtres vides ignorés", () => {
    const r = listRequestsSchema.parse({ statut: "", urgence: "", q: "" });
    expect(r.onglet).toBe("toutes");
    expect(r.statut).toBeUndefined();
    expect(r.page).toBe(1);
    expect(r.taille).toBe(25);
  });
  it("onglet et statut inconnus refusés", () => {
    expect(ok(listRequestsSchema, { onglet: "autre" })).toBe(false);
    expect(ok(listRequestsSchema, { statut: "INCONNU" })).toBe(false);
    expect(ok(listRequestsSchema, { onglet: "a-valider", statut: "SOUMISE" })).toBe(true);
  });
});

describe("pièces jointes : signature (D15)", () => {
  const pdf = new TextEncoder().encode("%PDF-1.7\n...");
  it("PDF, JPEG, PNG reconnus", () => {
    expect(detectAttachmentType(pdf)?.ext).toBe("pdf");
    expect(detectAttachmentType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe("jpg");
    expect(detectAttachmentType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.ext).toBe("png");
  });
  it("Office Open XML distingué par le contenu de l'archive", () => {
    const zip = (name: string) => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(`....${name}....`)]);
    expect(detectAttachmentType(zip("word/document.xml"))?.ext).toBe("docx");
    expect(detectAttachmentType(zip("xl/workbook.xml"))?.ext).toBe("xlsx");
    expect(detectAttachmentType(zip("autre.txt"))).toBeNull();
  });
  it("exécutable renommé en .pdf refusé", () => {
    expect(detectAttachmentType(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))).toBeNull();
    expect(detectAttachmentType(new Uint8Array([]))).toBeNull();
  });
  it("nom de fichier nettoyé (chemin, caractères de contrôle)", () => {
    expect(sanitizeFileName("..\\..\\evil/devis<1>.pdf")).toBe("devis1.pdf");
    expect(sanitizeFileName("")).toBe("piece-jointe");
  });
});

describe("numéro affiché", () => {
  it("provisoire tant que non soumise", () => {
    expect(displayNumber({ id: "cmabcdef123456", number: null })).toBe("BROUILLON-123456");
    expect(displayNumber({ id: "x", number: "DA-2026-00001" })).toBe("DA-2026-00001");
  });
});
