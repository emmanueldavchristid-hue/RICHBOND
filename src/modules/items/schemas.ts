import { z } from "zod";
import { optionalCodeSchema, requiredCodeSchema } from "@/modules/referentials/codes";
import { listQuerySchema, optionalText } from "@/modules/referentials/list-query";
import {
  expectedUpdatedAtSchema,
  idSchema,
  nullable,
  optionalString,
  qtySchema,
} from "@/modules/referentials/schemas";
import { unitSchema } from "@/modules/referentials/units";

export const itemCategorySchema = z.enum(["MATIERE_PREMIERE", "INTRANT", "PDR", "FOURNITURE", "SERVICE"], {
  error: "Catégorie invalide.",
});
export const criticalitySchema = z.enum(["CRITIQUE", "IMPORTANT", "STANDARD"], { error: "Criticité invalide." });
export const itemStatusSchema = z.enum(["ACTIF", "BLOQUE", "OBSOLETE"], { error: "Statut invalide." });

/** Champs métier communs à la création et à la modification d'un article. */
const itemFields = {
  name: z.string().trim().min(2, "La désignation est obligatoire (2 caractères minimum).").max(150, "Désignation trop longue (150 caractères maximum)."),
  category: itemCategorySchema,
  family: optionalString(60, "Famille"),
  stockUnit: unitSchema,
  purchaseUnit: unitSchema,
  conversionFactor: qtySchema("Le coefficient de conversion", { positive: true }).default(1),
  stocked: z.boolean().optional(),
  criticality: criticalitySchema.default("STANDARD"),
  defaultWarehouseId: nullable(idSchema),
  safetyStock: nullable(qtySchema("Le stock de sécurité")),
  reorderPoint: nullable(qtySchema("Le point de commande")),
  economicOrderQty: nullable(qtySchema("La quantité économique")),
  leadTimeDays: nullable(z.coerce.number().int("Le délai doit être un nombre entier de jours.").min(0, "Le délai ne peut pas être négatif.").max(730, "Délai trop long.")),
  mainSupplierId: nullable(idSchema),
  barcode: optionalString(50, "Code-barres"),
  equipment: optionalString(120, "Équipement"),
  notes: optionalString(2000, "Notes"),
};

type ItemFieldsOut = {
  stockUnit: string;
  purchaseUnit: string;
  conversionFactor: number;
  category: string;
  safetyStock: number | null;
  reorderPoint: number | null;
};

function thresholdRule(v: ItemFieldsOut, ctx: z.RefinementCtx) {
  // I3 : même unité d'achat et de stock => 1 pour 1, sinon la conversion n'a pas de sens.
  if (v.stockUnit === v.purchaseUnit && v.conversionFactor !== 1) {
    ctx.addIssue({
      code: "custom",
      path: ["conversionFactor"],
      message: "L'unité d'achat est identique à l'unité de stock : le coefficient de conversion doit être 1.",
    });
  }
  if (v.category !== "SERVICE" && v.safetyStock != null && v.reorderPoint != null && v.reorderPoint < v.safetyStock) {
    ctx.addIssue({
      code: "custom",
      path: ["reorderPoint"],
      message: "Le point de commande doit être supérieur ou égal au stock de sécurité.",
    });
  }
}

/** R6 : un SERVICE n'est jamais stocké, sans seuils ni dépôt ; l'équipement n'existe que pour les PDR. */
export function applyCategoryRules<
  T extends {
    category: string;
    stocked?: boolean;
    safetyStock: number | null;
    reorderPoint: number | null;
    economicOrderQty: number | null;
    defaultWarehouseId: string | null;
    equipment: string | null;
  },
>(v: T): T & { stocked: boolean } {
  const equipment = v.category === "PDR" ? v.equipment : null;
  if (v.category === "SERVICE") {
    return {
      ...v,
      stocked: false,
      safetyStock: null,
      reorderPoint: null,
      economicOrderQty: null,
      defaultWarehouseId: null,
      equipment,
    };
  }
  return { ...v, stocked: v.stocked ?? true, equipment };
}

export const createItemSchema = z
  .object({ code: optionalCodeSchema, ...itemFields })
  .superRefine(thresholdRule)
  .transform(applyCategoryRules);

export const updateItemSchema = z
  .object({ id: idSchema, expectedUpdatedAt: expectedUpdatedAtSchema, ...itemFields })
  .superRefine(thresholdRule)
  .transform(applyCategoryRules);

export const setItemStatusSchema = z.object({
  id: idSchema,
  status: itemStatusSchema,
  expectedUpdatedAt: expectedUpdatedAtSchema,
});

/** R2 : changement de code réservé au Responsable (`settings.manage`). */
export const changeItemCodeSchema = z.object({
  id: idSchema,
  code: requiredCodeSchema,
  expectedUpdatedAt: expectedUpdatedAtSchema,
});

export const itemIdSchema = z.object({ id: idSchema });

const priceFields = {
  supplierRef: optionalString(60, "Référence fournisseur"),
  lastPrice: nullable(qtySchema("Le prix").refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "Le prix : 2 décimales maximum.")),
  currencyCode: nullable(z.string().trim().toUpperCase().length(3, "Code devise invalide (3 lettres).")),
  leadTimeDays: nullable(z.coerce.number().int("Le délai doit être un nombre entier de jours.").min(0).max(730)),
  minOrderQty: nullable(qtySchema("Le minimum de commande")),
};

/** XOF : montant entier exigé ; un prix exige une devise. */
function priceRule(v: { lastPrice: number | null; currencyCode: string | null }, ctx: z.RefinementCtx) {
  if (v.lastPrice != null && !v.currencyCode) {
    ctx.addIssue({ code: "custom", path: ["currencyCode"], message: "La devise du prix est obligatoire." });
  }
  if (v.lastPrice != null && v.currencyCode === "XOF" && !Number.isInteger(v.lastPrice)) {
    ctx.addIssue({ code: "custom", path: ["lastPrice"], message: "Un prix en FCFA doit être un nombre entier." });
  }
}

export const linkSupplierSchema = z
  .object({ itemId: idSchema, supplierId: idSchema, ...priceFields })
  .superRefine(priceRule);

export const updateItemSupplierSchema = z
  .object({ id: idSchema, expectedUpdatedAt: expectedUpdatedAtSchema, ...priceFields })
  .superRefine(priceRule);

export const listItemsSchema = listQuerySchema.extend({
  categorie: z.preprocess((v) => (v === "" ? undefined : v), itemCategorySchema.optional()),
  criticite: z.preprocess((v) => (v === "" ? undefined : v), criticalitySchema.optional()),
  /** Absent = ACTIF ; "TOUS" = tous les statuts. */
  statut: z.preprocess((v) => (v === "" ? undefined : v), z.union([itemStatusSchema, z.literal("TOUS")]).optional()),
  famille: optionalText(60),
  equipement: optionalText(120),
});

export type CreateItemInput = z.input<typeof createItemSchema>;
export type UpdateItemInput = z.input<typeof updateItemSchema>;
export type ListItemsInput = z.input<typeof listItemsSchema>;
export type ListItemsQuery = z.output<typeof listItemsSchema>;
