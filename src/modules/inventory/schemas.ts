import { z } from "zod";

const id = (label: string) => z.string({ error: `${label} obligatoire.` }).min(1, `${label} obligatoire.`);

const countedQuantity = z
  .number({ error: "La quantité doit être un nombre." })
  .min(0, "La quantité comptée ne peut pas être négative.")
  .max(99_999_999, "Quantité trop élevée.")
  .refine((q) => Math.abs(Math.round(q * 1000) - q * 1000) < 1e-6, "3 décimales au maximum.");

const reason = z.string({ error: "Motif obligatoire." }).trim().min(3, "Motif trop court (3 caractères minimum).").max(300, "Motif trop long (300 caractères maximum).");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (AAAA-MM-JJ).");

export const countIdSchema = z.object({ countId: id("Inventaire") });

export const proposeSelectionSchema = z.object({
  warehouseId: id("Dépôt"),
  cap: z.number().int().min(1).max(500).optional(),
});

export const createInventorySchema = z.object({
  warehouseId: id("Dépôt"),
  kind: z.enum(["TOURNANT", "COMPLET"], { error: "Type d'inventaire invalide." }),
  /** TOURNANT : si absent, la sélection tournante du dépôt est appliquée ; si fourni, remplace la sélection. */
  itemIds: z.array(id("Article")).max(2000).optional(),
  plannedFor: day.optional(),
  comment: z.string().trim().max(500, "Commentaire trop long.").optional(),
  /** Seuils spécifiques à cet inventaire (sinon réglages). */
  thresholdPct: z.number().min(0).max(100).optional(),
  thresholdValue: z.number().int().min(0).max(2_147_483_647).optional(),
});

export const addLinesSchema = z.object({
  countId: id("Inventaire"),
  itemIds: z.array(id("Article")).min(1, "Choisissez au moins un article.").max(500),
});

export const removeLineSchema = z.object({ countId: id("Inventaire"), lineId: id("Ligne") });

export const saveCountSchema = z.object({
  countId: id("Inventaire"),
  /** Idempotent : renvoyer la même saisie ne change rien ; la dernière valeur envoyée fait foi. */
  lines: z
    .array(z.object({ lineId: id("Ligne"), quantity: countedQuantity }))
    .min(1, "Aucune saisie à enregistrer.")
    .max(500),
});

export const submitCountSchema = z.object({ countId: id("Inventaire") });

export const requestRecountSchema = z.object({
  countId: id("Inventaire"),
  lineIds: z.array(id("Ligne")).min(1, "Choisissez au moins une ligne.").max(500),
  comment: z.string().trim().max(300).optional(),
});

export const validateCountSchema = z.object({
  countId: id("Inventaire"),
  /** Motifs des écarts importants (obligatoires pour chaque ligne au-dessus du seuil). */
  reasons: z.array(z.object({ lineId: id("Ligne"), reason })).max(2000).default([]),
});

export const cancelCountSchema = z.object({ countId: id("Inventaire"), reason });

export const listCountsSchema = z
  .object({
    status: z.enum(["PREPARE", "EN_COMPTAGE", "A_VALIDER", "VALIDE", "ANNULE"]).optional(),
    warehouseId: z.string().optional(),
  })
  .default({});

export type CreateInventoryInput = z.output<typeof createInventorySchema>;
export type SaveCountInput = z.output<typeof saveCountSchema>;

export const searchItemsSchema = z.object({
  warehouseId: id("Dépôt"),
  q: z.string().trim().max(80).default(""),
});
