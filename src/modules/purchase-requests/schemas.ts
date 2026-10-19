import { z } from "zod";
import { listQuerySchema, optionalText } from "@/modules/referentials/list-query";
import { expectedUpdatedAtSchema, idSchema, nullable, optionalString, qtySchema } from "@/modules/referentials/schemas";
import { unitSchema } from "@/modules/referentials/units";
import { PR_KINDS, PR_STATUSES, PR_TYPES, PR_URGENCIES } from "./labels";
import { STOP_REASON_MIN } from "./priority";

export const MAX_LINES = 50;

export const prStatusSchema = z.enum(PR_STATUSES, { error: "Statut invalide." });
export const prUrgencySchema = z.enum(PR_URGENCIES, { error: "Urgence invalide." });
export const prTypeSchema = z.enum(PR_TYPES, { error: "Type invalide." });
export const prKindSchema = z.enum(PR_KINDS, { error: "Nature de DA invalide." });
export const prTabSchema = z.enum(["a-valider", "mes-demandes", "assignees", "toutes"], { error: "Onglet invalide." });

/** Date « calendaire » : `2026-11-12` (ou ISO complet, tronqué au jour). Sortie : `yyyy-MM-dd`. */
export const dayInputSchema = z
  .union([z.string(), z.date()], { error: "Date invalide." })
  .transform((v) => (v instanceof Date ? (Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10)) : v.trim().slice(0, 10)))
  .refine((s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Date invalide.");

const designationSchema = z
  .string()
  .trim()
  .min(5, "La désignation d'un article nouveau doit comporter au moins 5 caractères.")
  .max(200, "Désignation trop longue (200 caractères maximum).");

/** D8 : article OU désignation libre (exclusif) ; quantité > 0 ; prix estimé facultatif en FCFA entiers. */
export const requestLineSchema = z
  .object({
    itemId: nullable(idSchema),
    freeDesignation: nullable(designationSchema),
    quantity: qtySchema("La quantité", { positive: true }),
    unit: nullable(unitSchema),
    estimatedUnitPrice: nullable(
      z.coerce
        .number({ error: "Prix estimé invalide." })
        .int("Le prix estimé doit être un montant entier en FCFA.")
        .min(0, "Le prix estimé ne peut pas être négatif.")
        .max(2_147_483_647, "Prix estimé trop élevé (maximum 2 147 483 647 FCFA)."),
    ),
    note: optionalString(200, "Note"),
  })
  .superRefine((l, ctx) => {
    if (!l.itemId && !l.freeDesignation) {
      ctx.addIssue({ code: "custom", path: ["itemId"], message: "Choisissez un article ou saisissez une désignation." });
    }
    if (l.itemId && l.freeDesignation) {
      ctx.addIssue({
        code: "custom",
        path: ["freeDesignation"],
        message: "Une ligne porte soit un article du catalogue, soit une désignation libre, pas les deux.",
      });
    }
    if (l.freeDesignation && !l.unit) {
      ctx.addIssue({ code: "custom", path: ["unit"], message: "L'unité est obligatoire pour un article nouveau." });
    }
  });

export type RequestLineInput = z.input<typeof requestLineSchema>;
export type RequestLine = z.output<typeof requestLineSchema>;

const headerShape = {
  departmentId: idSchema,
  requesterName: z.string().trim().min(2, "Le nom du demandeur est obligatoire.").max(100, "Nom du demandeur trop long."),
  reason: z.string().trim().min(5, "Le motif est obligatoire (5 caractères minimum).").max(1000, "Motif trop long (1000 caractères maximum)."),
  urgency: prUrgencySchema.default("NORMALE"),
  neededBy: nullable(dayInputSchema),
  type: prTypeSchema.default("A_DEFINIR"),
  lines: z.array(requestLineSchema).max(MAX_LINES, `Une DA ne peut pas dépasser ${MAX_LINES} lignes.`).default([]),
};

interface HeaderOut {
  urgency: string;
  reason: string;
  neededBy: string | null;
  lines: RequestLine[];
}

function headerRules(v: HeaderOut, ctx: z.RefinementCtx) {
  if (v.urgency === "ARRET_PRODUCTION" && v.reason.length < STOP_REASON_MIN) {
    ctx.addIssue({
      code: "custom",
      path: ["reason"],
      message: `Arrêt de production : précisez la machine ou la ligne arrêtée (${STOP_REASON_MIN} caractères minimum).`,
    });
  }
  if (v.urgency !== "ARRET_PRODUCTION" && !v.neededBy) {
    ctx.addIssue({ code: "custom", path: ["neededBy"], message: "La date de besoin est obligatoire." });
  }
  const seen = new Set<string>();
  v.lines.forEach((l, i) => {
    if (!l.itemId) return;
    if (seen.has(l.itemId)) {
      ctx.addIssue({ code: "custom", path: ["lines", i, "itemId"], message: "Cet article figure déjà dans la demande." });
    }
    seen.add(l.itemId);
  });
}

/** Magasinier (H41) : articles du catalogue uniquement, jamais de désignation libre. */
export function replenishmentRules(v: { lines: RequestLine[] }, ctx: z.RefinementCtx) {
  v.lines.forEach((l, i) => {
    if (l.freeDesignation || !l.itemId) {
      ctx.addIssue({
        code: "custom",
        path: ["lines", i, "freeDesignation"],
        message: "Une DA de réapprovisionnement ne porte que sur des articles du catalogue : passez par un acheteur pour un article nouveau.",
      });
    }
  });
}

export const createRequestSchema = z.object(headerShape).superRefine(headerRules);

/** Variante du Magasinier. */
export const createReplenishmentSchema = z.object(headerShape).superRefine((v, ctx) => {
  headerRules(v, ctx);
  replenishmentRules(v, ctx);
});

export const updateRequestSchema = z
  .object({ ...headerShape, id: idSchema, expectedUpdatedAt: expectedUpdatedAtSchema })
  .superRefine(headerRules);

export type CreateRequestInput = z.input<typeof createRequestSchema>;
export type UpdateRequestInput = z.input<typeof updateRequestSchema>;

/** Identifiant + version lue par l'utilisateur (D18). */
export const requestVersionSchema = z.object({ id: idSchema, expectedUpdatedAt: expectedUpdatedAtSchema });

const reason = (label: string, max: number) =>
  z.string({ error: `${label} obligatoire.` }).trim().min(5, `${label} obligatoire (5 caractères minimum).`).max(max, `${label} trop long (${max} caractères maximum).`);

export const rejectRequestSchema = requestVersionSchema.extend({ reason: reason("Le motif du refus", 500) });
export const returnRequestSchema = requestVersionSchema.extend({ comment: reason("Le commentaire", 1000) });
export const cancelRequestSchema = requestVersionSchema.extend({ reason: reason("Le motif d'annulation", 500) });

export const approveRequestSchema = requestVersionSchema.extend({
  /** Obligatoire quand la DA est « À définir » (D6). */
  type: nullable(z.enum(["LOCAL", "IMPORT"], { error: "Choisissez Local ou Import." })),
  /** Acheteur imposé ; sinon proposition automatique (D7). */
  buyerId: nullable(idSchema),
  /** Quantités validées par ligne (D9) ; lignes absentes = quantité demandée. */
  lines: z
    .array(z.object({ lineId: idSchema, approvedQty: qtySchema("La quantité validée") }))
    .max(MAX_LINES)
    .optional(),
});

export const approveManySchema = z.object({
  items: z
    .array(requestVersionSchema.extend({ type: nullable(z.enum(["LOCAL", "IMPORT"], { error: "Choisissez Local ou Import." })) }))
    .min(1, "Sélectionnez au moins une demande.")
    .max(50, "La validation groupée est limitée à 50 demandes."),
});

export const assignBuyerSchema = requestVersionSchema.extend({ buyerId: idSchema });

export const commentRequestSchema = z.object({
  id: idSchema,
  comment: z.string({ error: "Commentaire obligatoire." }).trim().min(1, "Commentaire obligatoire.").max(1000, "Commentaire trop long (1000 caractères maximum)."),
});

export const requestIdSchema = z.object({ id: idSchema });

export const checkDuplicatesSchema = z.object({
  itemIds: z.array(idSchema).max(MAX_LINES),
  excludeId: nullable(idSchema),
});

export const searchItemsForRequestSchema = z.object({
  q: z.string().trim().max(60).default(""),
  limit: z.number().int().min(1).max(50).default(15),
});

export const removeAttachmentSchema = z.object({ id: idSchema, attachmentId: idSchema });

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const opt = <T extends z.ZodType>(s: T) => z.preprocess(emptyToUndefined, s.optional());

export const REQUEST_SORT_KEYS = ["number", "neededBy", "status", "createdAt", "estimatedTotal"] as const;

/** État de la liste (dans l'URL) : onglet, filtres, pagination. La priorité reste toujours le premier critère de tri. */
export const listRequestsSchema = listQuerySchema.extend({
  onglet: z.preprocess(emptyToUndefined, prTabSchema.default("toutes")),
  statut: opt(prStatusSchema),
  urgence: opt(prUrgencySchema),
  service: opt(idSchema),
  acheteur: opt(idSchema),
  type: opt(prTypeSchema),
  tri: z.preprocess(emptyToUndefined, z.enum(REQUEST_SORT_KEYS).optional()),
  q: optionalText(100),
});

export type ListRequestsInput = z.input<typeof listRequestsSchema>;
export type ListRequestsFilters = z.output<typeof listRequestsSchema>;
