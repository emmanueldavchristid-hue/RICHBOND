import { z } from "zod";
import { emailSchema } from "@/modules/auth/schemas";
import { itemCategorySchema } from "@/modules/items/schemas";
import { optionalCodeSchema } from "@/modules/referentials/codes";
import { listQuerySchema, optionalText } from "@/modules/referentials/list-query";
import { expectedUpdatedAtSchema, idSchema, nullable, optionalString } from "@/modules/referentials/schemas";

export const supplierTypeSchema = z.enum(["LOCAL", "IMPORT"], { error: "Type de fournisseur invalide." });
/** Statuts saisissables directement ; BLOQUE passe par l'action « Bloquer » (motif obligatoire). */
export const supplierEditableStatusSchema = z.enum(["ACTIF", "EN_EVALUATION"], { error: "Statut invalide." });
export const supplierStatusSchema = z.enum(["ACTIF", "EN_EVALUATION", "BLOQUE"], { error: "Statut invalide." });
export const paymentTermSchema = z.enum(["COMPTANT", "J30", "J45", "J60", "J90", "FIN_DE_MOIS_30", "AUTRE"], {
  error: "Condition de paiement invalide.",
});
export const incotermSchema = z.enum(["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"], {
  error: "Incoterm invalide.",
});

const phoneSchema = nullable(
  z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9 .()-]{5,24}$/, "Numéro de téléphone invalide."),
);

export const contactFields = {
  name: z.string().trim().min(2, "Le nom du contact est obligatoire.").max(100, "Nom trop long."),
  role: optionalString(80, "Fonction"),
  phone: phoneSchema,
  email: nullable(emailSchema),
  isPrimary: z.boolean().default(false),
};
export const contactSchema = z.object(contactFields);

const supplierFields = {
  name: z.string().trim().min(2, "La raison sociale est obligatoire (2 caractères minimum).").max(150, "Raison sociale trop longue."),
  type: supplierTypeSchema,
  country: z.string().trim().toUpperCase().length(2, "Pays : code ISO à 2 lettres (ex. CI).").default("CI"),
  city: optionalString(80, "Ville"),
  address: optionalString(250, "Adresse"),
  phone: phoneSchema,
  email: nullable(emailSchema),
  bankDetails: optionalString(500, "Coordonnées bancaires"),
  currencyCode: z.string().trim().toUpperCase().length(3, "Code devise invalide (3 lettres)."),
  ncc: nullable(z.string().trim().toUpperCase().min(1).max(30, "NCC trop long.")),
  rccm: optionalString(40, "RCCM"),
  paymentTerm: paymentTermSchema.default("J30"),
  paymentTermNote: optionalString(200, "Précision"),
  incoterm: nullable(incotermSchema),
  leadTimeDays: nullable(z.coerce.number().int("Le délai doit être un nombre entier de jours.").min(0, "Le délai ne peut pas être négatif.").max(730, "Délai trop long.")),
  categories: z.array(itemCategorySchema).default([]),
  status: supplierEditableStatusSchema.default("ACTIF"),
  notes: optionalString(2000, "Notes"),
};

type SupplierRuleInput = { type: "LOCAL" | "IMPORT"; incoterm: string | null; paymentTerm: string; paymentTermNote: string | null };

function supplierRules(v: SupplierRuleInput, ctx: z.RefinementCtx) {
  if (v.type === "LOCAL" && v.incoterm) {
    ctx.addIssue({ code: "custom", path: ["incoterm"], message: "L'incoterm n'est utilisable que pour un fournisseur import." });
  }
  if (v.paymentTerm === "AUTRE" && !v.paymentTermNote) {
    ctx.addIssue({ code: "custom", path: ["paymentTermNote"], message: "Précisez la condition de paiement." });
  }
}

export const createSupplierSchema = z
  .object({ code: optionalCodeSchema, ...supplierFields, contacts: z.array(contactSchema).max(10, "10 contacts maximum.").default([]) })
  .superRefine(supplierRules);

export const updateSupplierSchema = z
  .object({ id: idSchema, expectedUpdatedAt: expectedUpdatedAtSchema, ...supplierFields })
  .superRefine(supplierRules);

export const blockSupplierSchema = z.object({
  id: idSchema,
  reason: z
    .string()
    .trim()
    .min(5, "Le motif de blocage est obligatoire (5 caractères minimum).")
    .max(500, "Motif trop long (500 caractères maximum)."),
  expectedUpdatedAt: expectedUpdatedAtSchema,
});

export const unblockSupplierSchema = z.object({
  id: idSchema,
  status: supplierEditableStatusSchema.default("ACTIF"),
  expectedUpdatedAt: expectedUpdatedAtSchema,
});

export const supplierIdSchema = z.object({ id: idSchema });

export const addContactSchema = z.object({ supplierId: idSchema, ...contactFields });
export const updateContactSchema = z.object({ id: idSchema, expectedUpdatedAt: expectedUpdatedAtSchema, ...contactFields });

export const listSuppliersSchema = listQuerySchema.extend({
  type: z.preprocess((v) => (v === "" ? undefined : v), supplierTypeSchema.optional()),
  /** Absent = actifs + en évaluation ; "TOUS" = tous. */
  statut: z.preprocess((v) => (v === "" ? undefined : v), z.union([supplierStatusSchema, z.literal("TOUS")]).optional()),
  pays: optionalText(2),
  categorie: z.preprocess((v) => (v === "" ? undefined : v), itemCategorySchema.optional()),
});

export type CreateSupplierInput = z.input<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.input<typeof updateSupplierSchema>;
export type ListSuppliersInput = z.input<typeof listSuppliersSchema>;
export type ListSuppliersQuery = z.output<typeof listSuppliersSchema>;
