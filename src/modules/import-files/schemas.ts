import { z } from "zod";
import { idSchema } from "@/modules/referentials/schemas";
import { ALLOCATION_KEYS, COST_STATUSES, DOCUMENT_TYPES, IMPORT_MODES, IMPORT_STATUSES, MILESTONE_CODES } from "./labels";

/** Schémas Zod des entrées du module dossiers import (LOT-12). Dates au format `yyyy-MM-dd`. */

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (format AAAA-MM-JJ).");
const text = (max: number) => z.string().trim().max(max, `Texte trop long (${max} caractères au plus).`);
const optText = (max: number) =>
  text(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"] as const;
/** Montants saisis : positifs ou nuls, 2 décimales au plus. */
const amount = z.number({ error: "Montant invalide." }).finite().min(0, "Le montant ne peut pas être négatif.").max(2_147_483_647, "Montant trop élevé.");
const rate = z.number({ error: "Taux invalide." }).positive("Le taux doit être positif.").max(1_000_000, "Taux trop élevé.");

export const fileIdSchema = z.object({ id: idSchema });

const header = {
  incoterm: z.enum(INCOTERMS).optional().nullable(),
  incotermPlace: optText(80),
  loadingPort: optText(120),
  transitaire: optText(120),
  blNumber: optText(60),
  containerNumber: optText(60),
  customsDeclaration: optText(60),
  customsRegime: optText(80),
  notes: optText(1000),
};

export const createImportFileSchema = z.object({
  supplierId: idSchema,
  mode: z.enum(IMPORT_MODES, { error: "Choisissez le mode de transport." }),
  orderIds: z.array(idSchema).max(50).default([]),
  ...header,
});
export type CreateImportFileInput = z.infer<typeof createImportFileSchema>;

export const updateImportFileSchema = z.object({
  id: idSchema,
  mode: z.enum(IMPORT_MODES).optional(),
  ...header,
});

export const orderLinkSchema = z.object({ fileId: idSchema, orderId: idSchema });

export const milestoneSchema = z.object({
  fileId: idSchema,
  code: z.enum(MILESTONE_CODES),
  plannedDate: day.optional().nullable(),
  actualDate: day.optional().nullable(),
  note: optText(300),
});

export const lineLogisticsSchema = z.object({
  fileId: idSchema,
  lines: z
    .array(
      z.object({
        orderLineId: idSchema,
        /** kg par unité d'achat ; null = inconnu (repli sur la valeur). */
        unitWeightKg: z.number().positive("Le poids doit être positif.").max(1_000_000).nullable(),
        unitVolumeM3: z.number().positive("Le volume doit être positif.").max(100_000).nullable(),
      }),
    )
    .min(1)
    .max(200),
});

const costFields = {
  amount,
  currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Devise invalide."),
  /** FCFA pour 1 unité de devise ; absent : dernier taux connu (FCFA = 1). */
  rate: rate.optional(),
  vatRecoverable: z.boolean().optional(),
  allocationKey: z.enum(ALLOCATION_KEYS).optional(),
  payee: optText(120),
  note: optText(300),
};

export const addCostSchema = z.object({
  fileId: idSchema,
  typeId: idSchema,
  status: z.enum(COST_STATUSES).default("REEL"),
  ...costFields,
});

/** Modification d'un frais : passer `status: "REEL"` convertit un estimé en réel (montant réel à fournir). */
export const updateCostSchema = z.object({
  costId: idSchema,
  status: z.enum(COST_STATUSES).optional(),
  amount: costFields.amount.optional(),
  currencyCode: costFields.currencyCode.optional(),
  rate: costFields.rate,
  vatRecoverable: costFields.vatRecoverable,
  allocationKey: costFields.allocationKey,
  payee: costFields.payee,
  note: costFields.note,
  reason: optText(300),
});

export const removeCostSchema = z.object({ costId: idSchema, reason: optText(300) });

export const closeImportFileSchema = z.object({
  id: idSchema,
  /** Accord explicite pour clôturer alors que des frais sont encore estimés. */
  confirmEstimated: z.boolean().default(false),
});

export const cancelImportFileSchema = z.object({
  id: idSchema,
  reason: text(300).min(5, "Indiquez le motif de l'annulation (5 caractères au moins)."),
});

export const listImportFilesSchema = z
  .object({
    status: z.enum(IMPORT_STATUSES).optional(),
    /** Jalon courant du dossier. */
    milestone: z.enum(MILESTONE_CODES).optional(),
    supplierId: idSchema.optional(),
    lateOnly: z.boolean().optional(),
    search: text(80).optional(),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(25),
  })
  .default({ page: 1, pageSize: 25 });
export type ListImportFilesInput = z.infer<typeof listImportFilesSchema>;

export const eligibleOrdersSchema = z.object({ supplierId: idSchema });

export const suggestionSchema = z.object({ supplierId: idSchema, mode: z.enum(IMPORT_MODES) });

export const costTypeSchema = z.object({
  id: idSchema.optional(),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_]{2,30}$/, "Code : 2 à 30 caractères (lettres, chiffres, _)."),
  label: text(80).min(2, "Libellé obligatoire."),
  defaultKey: z.enum(ALLOCATION_KEYS).default("VALEUR"),
  vatRecoverableDefault: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(999).default(0),
  active: z.boolean().default(true),
});

export const coefficientDefaultSchema = z.object({
  mode: z.enum(IMPORT_MODES),
  typeId: idSchema,
  /** % de la valeur marchandise, 0 à 100. */
  pctOfValue: z.number().min(0, "Pourcentage invalide.").max(100, "Pourcentage invalide."),
});

export const documentTypeSchema = z.enum(DOCUMENT_TYPES);
export const removeDocumentSchema = z.object({ fileId: idSchema, documentId: idSchema });
