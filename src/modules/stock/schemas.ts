import { z } from "zod";
import { dayInputSchema } from "@/modules/purchase-requests/schemas";
import { listQuerySchema, optionalText } from "@/modules/referentials/list-query";
import { idSchema, nullable, optionalString, qtySchema } from "@/modules/referentials/schemas";
import { MIN_REASON_LENGTH, MOVEMENT_TYPES, STOCK_SITUATIONS, ABC_CLASSES } from "./labels";

export const MAX_STOCK_LINES = 50;

const reasonText = (label: string) =>
  z
    .string({ error: `${label} : saisissez un motif.` })
    .trim()
    .min(MIN_REASON_LENGTH, `${label} : le motif doit comporter au moins ${MIN_REASON_LENGTH} caractères.`)
    .max(300, `${label} : 300 caractères maximum.`);

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const opt = <T extends z.ZodType>(s: T) => z.preprocess(emptyToUndefined, s.optional());

// ------------------------------------------------------------------ sorties

export const issueLineSchema = z.object({ itemId: idSchema, quantity: qtySchema("La quantité", { positive: true }) });

export const createIssueSchema = z
  .object({
    warehouseId: idSchema,
    departmentId: idSchema,
    requesterName: z.string({ error: "Le nom du demandeur est obligatoire." }).trim().min(2, "Le nom du demandeur est obligatoire.").max(100, "Nom du demandeur trop long."),
    reason: z.string({ error: "Le motif est obligatoire." }).trim().min(MIN_REASON_LENGTH, `Le motif est obligatoire (${MIN_REASON_LENGTH} caractères minimum).`).max(300, "Motif trop long (300 caractères maximum)."),
    /** Machine ou équipement : obligatoire si une ligne est une PDR (contrôlé par le service). */
    equipment: optionalString(100, "Machine"),
    /** Absent : aujourd'hui. */
    issuedAt: nullable(dayInputSchema),
    lines: z.array(issueLineSchema).min(1, "Ajoutez au moins une ligne à la sortie.").max(MAX_STOCK_LINES, `Une sortie ne peut pas dépasser ${MAX_STOCK_LINES} lignes.`),
  })
  .superRefine((v, ctx) => {
    const ids = v.lines.map((l) => l.itemId);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["lines"], message: "Un article ne peut figurer qu'une fois dans la sortie." });
  });
export type CreateIssueInput = z.input<typeof createIssueSchema>;

export const cancelIssueSchema = z.object({ id: idSchema, reason: reasonText("Annulation") });
export const issueIdSchema = z.object({ id: idSchema });

export const listIssuesSchema = listQuerySchema.extend({
  statut: opt(z.enum(["VALIDEE", "ANNULEE"], { error: "Statut invalide." })),
  service: opt(idSchema),
  depot: opt(idSchema),
  du: opt(dayInputSchema),
  au: opt(dayInputSchema),
});
export type ListIssuesInput = z.input<typeof listIssuesSchema>;

export const searchIssueItemsSchema = z.object({
  q: z.string().trim().max(60).default(""),
  warehouseId: idSchema,
  limit: z.number().int().min(1).max(50).default(15),
});

// ------------------------------------------------------------------ transferts et ajustements

/** Un article (écran de transfert) ou plusieurs lignes ; normalisé en `lines`. */
export const transferSchema = z
  .object({
    fromWarehouseId: idSchema,
    toWarehouseId: idSchema,
    itemId: opt(idSchema),
    quantity: opt(qtySchema("La quantité", { positive: true })),
    lines: z.array(issueLineSchema).max(MAX_STOCK_LINES).optional(),
    comment: optionalString(300, "Commentaire"),
  })
  .superRefine((v, ctx) => {
    if (v.fromWarehouseId === v.toWarehouseId) ctx.addIssue({ code: "custom", path: ["toWarehouseId"], message: "Le dépôt d'arrivée doit être différent du dépôt de départ." });
    if (!v.lines?.length && !(v.itemId && v.quantity)) ctx.addIssue({ code: "custom", path: ["quantity"], message: "Choisissez un article et une quantité." });
    const ids = (v.lines ?? []).map((l) => l.itemId);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["lines"], message: "Un article ne peut figurer qu'une fois dans le transfert." });
  })
  .transform((v) => ({
    fromWarehouseId: v.fromWarehouseId,
    toWarehouseId: v.toWarehouseId,
    comment: v.comment,
    lines: v.lines?.length ? v.lines : [{ itemId: v.itemId!, quantity: v.quantity! }],
  }));
export type TransferInput = z.input<typeof transferSchema>;

/** Quantité signée non nulle, 3 décimales : positive = ajout, négative = retrait. */
const signedQty = z
  .union([z.number(), z.string()], { error: "La quantité : valeur invalide." })
  .transform((v) => (typeof v === "string" ? Number(v.trim().replace(",", ".")) : v))
  .refine((n) => Number.isFinite(n), "La quantité : nombre invalide.")
  .refine((n) => n !== 0, "La quantité ne peut pas être nulle.")
  .refine((n) => Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-6, "La quantité : 3 décimales maximum.")
  .refine((n) => Math.abs(n) < 1e11, "La quantité : valeur trop grande.");

export const adjustSchema = z.object({
  itemId: idSchema,
  warehouseId: idSchema,
  quantity: signedQty,
  /** FCFA par unité de stock, pour un ajout seulement ; absent : PMP courant. */
  unitCost: nullable(
    z.coerce.number({ error: "Coût unitaire invalide." }).min(0, "Le coût unitaire ne peut pas être négatif.").max(2_147_483_647, "Coût unitaire trop élevé."),
  ),
  reason: reasonText("Ajustement"),
});
export type AdjustInput = z.input<typeof adjustSchema>;

// ------------------------------------------------------------------ consultations

export const listMovementsSchema = listQuerySchema.extend({
  article: opt(idSchema),
  depot: opt(idSchema),
  type: opt(z.enum(MOVEMENT_TYPES, { error: "Type de mouvement invalide." })),
  du: opt(dayInputSchema),
  au: opt(dayInputSchema),
});
export type ListMovementsInput = z.input<typeof listMovementsSchema>;

export const itemLedgerSchema = z.object({
  itemId: idSchema,
  warehouseId: nullable(idSchema),
  limit: z.number().int().min(1).max(500).default(200),
});

export const STOCK_SORT_KEYS = ["code", "name", "stock", "valeur", "couverture", "rupture"] as const;

export const listStockSchema = listQuerySchema.extend({
  tri: z.preprocess(emptyToUndefined, z.enum(STOCK_SORT_KEYS).optional()),
  categorie: opt(z.enum(["MATIERE_PREMIERE", "INTRANT", "PDR", "FOURNITURE", "SERVICE"], { error: "Catégorie invalide." })),
  criticite: opt(z.enum(["CRITIQUE", "IMPORTANT", "STANDARD"], { error: "Criticité invalide." })),
  depot: opt(idSchema),
  classe: opt(z.enum(ABC_CLASSES, { error: "Classe ABC invalide." })),
  situation: opt(z.enum(STOCK_SITUATIONS, { error: "Situation invalide." })),
  q: optionalText(100),
});
export type ListStockInput = z.input<typeof listStockSchema>;

// ------------------------------------------------------------------ réapprovisionnement, seuils, ABC

export const createReorderRequestsSchema = z
  .object({
    items: z
      .array(
        z.object({
          itemId: idSchema,
          /** Unité d'achat ; absent : quantité suggérée. */
          quantity: nullable(qtySchema("La quantité", { positive: true })),
        }),
      )
      .min(1, "Cochez au moins un article.")
      .max(MAX_STOCK_LINES, `Une demande de réapprovisionnement est limitée à ${MAX_STOCK_LINES} articles.`),
  })
  .superRefine((v, ctx) => {
    const ids = v.items.map((i) => i.itemId);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["items"], message: "Un article ne peut figurer qu'une fois." });
  });

/** Absent : tous les articles ayant une consommation. */
export const applyThresholdsSchema = z.object({ itemIds: z.array(idSchema).max(1000).optional() }).default({});
export const recomputeAbcSchema = z.object({}).default({});
export const itemIdSchema = z.object({ itemId: idSchema });
