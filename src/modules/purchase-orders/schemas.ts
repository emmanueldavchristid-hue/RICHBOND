import { z } from "zod";
import { listQuerySchema, optionalText } from "@/modules/referentials/list-query";
import { expectedUpdatedAtSchema, idSchema, nullable, optionalString, qtySchema } from "@/modules/referentials/schemas";
import { unitSchema } from "@/modules/referentials/units";
import { dayInputSchema } from "@/modules/purchase-requests/schemas";
import { CONTACT_CHANNELS, PO_STATUSES, PO_TYPES, VAT_RATES } from "./labels";
import { MAX_UNIT_PRICE } from "./totals";

export const MAX_LINES = 50;
export const MAX_CHARGES = 10;
export const DIRECT_REASON_MIN = 10;

export const PAYMENT_TERMS = ["COMPTANT", "J30", "J45", "J60", "J90", "FIN_DE_MOIS_30", "AUTRE"] as const;
export const INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"] as const;

export const poStatusSchema = z.enum(PO_STATUSES, { error: "Statut invalide." });
export const poTypeSchema = z.enum(PO_TYPES, { error: "Type invalide." });
export const contactChannelSchema = z.enum(CONTACT_CHANNELS, { error: "Choisissez le moyen utilisé (e-mail, WhatsApp, téléphone…)." });
export const paymentTermSchema = z.enum(PAYMENT_TERMS, { error: "Condition de paiement invalide." });
export const incotermSchema = z.enum(INCOTERMS, { error: "Incoterm invalide." });
export const poTabSchema = z.enum(["a-valider", "en-cours", "en-retard", "recus", "tous"], { error: "Onglet invalide." });

/** TVA par ligne : 0, 9 ou 18 %. */
export const vatRateSchema = z.coerce
  .number({ error: "Taux de TVA invalide." })
  .refine((n) => (VAT_RATES as readonly number[]).includes(n), "Taux de TVA invalide (0, 9 ou 18 %).");

/** Nombre décimal saisi (virgule acceptée), conservé sous forme de chaîne pour un calcul exact. */
function decimalSchema(label: string, opts: { max: number; decimals: number }) {
  return z
    .union([z.number(), z.string()], { error: `${label} : valeur invalide.` })
    .transform((v) => (typeof v === "string" ? v.trim().replace(",", ".") : String(v)))
    .refine((s) => /^\d+(\.\d+)?$/.test(s), `${label} : nombre positif attendu.`)
    .refine((s) => Number(s) <= opts.max, `${label} : valeur trop grande.`)
    .refine((s) => (s.split(".")[1] ?? "").replace(/0+$/, "").length <= opts.decimals, `${label} : ${opts.decimals} décimale${opts.decimals > 1 ? "s" : ""} au maximum.`);
}

/** Prix unitaire dans la devise du BC ; l'entier obligatoire en FCFA est contrôlé avec la devise (service). */
export const unitPriceSchema = decimalSchema("Le prix unitaire", { max: MAX_UNIT_PRICE, decimals: 2 });
export const amountSchema = decimalSchema("Le montant", { max: MAX_UNIT_PRICE, decimals: 2 });
export const discountSchema = decimalSchema("La remise", { max: 100, decimals: 2 });

const designationSchema = z
  .string()
  .trim()
  .min(5, "La désignation d'une ligne libre doit comporter au moins 5 caractères.")
  .max(200, "Désignation trop longue (200 caractères maximum).");

export const allocationSchema = z.object({
  requestLineId: idSchema,
  /** Dans l'unité de la ligne de DA. */
  qty: qtySchema("La quantité rattachée", { positive: true }),
});

/** Article OU désignation libre (exclusif), quantité en unité d'achat, allocations vers les lignes de DA. */
export const orderLineSchema = z
  .object({
    itemId: nullable(idSchema),
    freeDesignation: nullable(designationSchema),
    supplierRef: optionalString(60, "Référence fournisseur"),
    quantity: qtySchema("La quantité", { positive: true }),
    unit: nullable(unitSchema),
    unitPrice: unitPriceSchema.default("0"),
    discountPct: discountSchema.default("0"),
    /** Absent : taux par défaut (réglage), 0 % pour l'import. */
    vatRate: nullable(vatRateSchema),
    note: optionalString(200, "Note"),
    allocations: z.array(allocationSchema).max(20, "Trop de besoins rattachés à une ligne.").default([]),
  })
  .superRefine((l, ctx) => {
    if (!l.itemId && !l.freeDesignation) {
      ctx.addIssue({ code: "custom", path: ["itemId"], message: "Choisissez un article ou saisissez une désignation." });
    }
    if (l.itemId && l.freeDesignation) {
      ctx.addIssue({ code: "custom", path: ["freeDesignation"], message: "Une ligne porte soit un article du catalogue, soit une désignation libre, pas les deux." });
    }
    if (l.freeDesignation && !l.unit) {
      ctx.addIssue({ code: "custom", path: ["unit"], message: "L'unité est obligatoire pour une ligne libre." });
    }
  });

export type OrderLineInput = z.input<typeof orderLineSchema>;
export type OrderLine = z.output<typeof orderLineSchema>;

export const chargeSchema = z.object({
  label: z.string().trim().min(2, "Le libellé du frais est obligatoire (2 caractères minimum).").max(100, "Libellé trop long (100 caractères maximum)."),
  amount: amountSchema,
  vatRate: vatRateSchema.default(18),
});

const headerShape = {
  supplierId: idSchema,
  origin: z.enum(["DA", "DIRECT"], { error: "Origine invalide." }).default("DA"),
  /** Commande directe sans DA (Responsable seul) : motif obligatoire. */
  directReason: nullable(z.string().trim().min(DIRECT_REASON_MIN, `Le motif d'une commande directe est obligatoire (${DIRECT_REASON_MIN} caractères minimum).`).max(500, "Motif trop long (500 caractères maximum).")),
  /** Absent : devise du fournisseur. */
  currencyCode: nullable(z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Devise invalide.")),
  /** Absents : repris de la fiche fournisseur. */
  paymentTerm: nullable(paymentTermSchema),
  paymentTermNote: optionalString(100, "Précision sur le paiement"),
  incoterm: nullable(incotermSchema),
  incotermPlace: nullable(z.string().trim().min(2, "Le lieu de l'incoterm est obligatoire (2 caractères minimum).").max(100, "Lieu trop long (100 caractères maximum).")),
  warehouseId: idSchema,
  /** Absente : adresse du dépôt. */
  deliveryAddress: optionalString(300, "Adresse de livraison"),
  requestedDate: dayInputSchema,
  supplierRef: optionalString(60, "Référence fournisseur"),
  /** Imprimées sur le bon. */
  notes: optionalString(1000, "Observations"),
  /** Jamais imprimée. */
  internalNote: optionalString(1000, "Note interne"),
  lines: z.array(orderLineSchema).max(MAX_LINES, `Un bon de commande ne peut pas dépasser ${MAX_LINES} lignes.`).default([]),
  charges: z.array(chargeSchema).max(MAX_CHARGES, `Un bon de commande ne peut pas dépasser ${MAX_CHARGES} lignes de frais.`).default([]),
};

interface HeaderOut {
  origin: "DA" | "DIRECT";
  directReason: string | null;
  incoterm: string | null;
  incotermPlace: string | null;
  lines: OrderLine[];
}

function headerRules(v: HeaderOut, ctx: z.RefinementCtx) {
  if (v.origin === "DIRECT" && !v.directReason) {
    ctx.addIssue({ code: "custom", path: ["directReason"], message: `Le motif d'une commande directe est obligatoire (${DIRECT_REASON_MIN} caractères minimum).` });
  }
  if (v.incoterm && !v.incotermPlace) {
    ctx.addIssue({ code: "custom", path: ["incotermPlace"], message: "Précisez le lieu de l'incoterm (ex. FOB Shanghai)." });
  }
  const seen = new Set<string>();
  v.lines.forEach((l, i) => {
    if (v.origin === "DA" && l.allocations.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["lines", i, "allocations"],
        message: `Ligne ${i + 1} : rattachez-la à une demande d'achat (ou passez par une commande directe).`,
      });
    }
    if (v.origin === "DIRECT" && l.allocations.length > 0) {
      ctx.addIssue({ code: "custom", path: ["lines", i, "allocations"], message: "Une commande directe n'est rattachée à aucune demande d'achat." });
    }
    if (!l.itemId) return;
    if (seen.has(l.itemId)) ctx.addIssue({ code: "custom", path: ["lines", i, "itemId"], message: "Cet article figure déjà dans le bon de commande." });
    seen.add(l.itemId);
  });
}

export const createOrderSchema = z.object(headerShape).superRefine(headerRules);
export const updateOrderSchema = z
  .object({ ...headerShape, id: idSchema, expectedUpdatedAt: expectedUpdatedAtSchema })
  .superRefine(headerRules);

export type CreateOrderInput = z.input<typeof createOrderSchema>;
export type UpdateOrderInput = z.input<typeof updateOrderSchema>;

/** Brouillon pré-rempli depuis « À commander » : lignes de DA cochées (quantité facultative = tout le reste à commander). */
export const createFromRequestLinesSchema = z.object({
  supplierId: idSchema,
  lines: z
    .array(z.object({ requestLineId: idSchema, qty: nullable(qtySchema("La quantité", { positive: true })) }))
    .min(1, "Cochez au moins une ligne.")
    .max(MAX_LINES, `Un bon de commande ne peut pas dépasser ${MAX_LINES} lignes.`),
  warehouseId: nullable(idSchema),
  requestedDate: nullable(dayInputSchema),
});
export type CreateFromRequestLinesInput = z.input<typeof createFromRequestLinesSchema>;

/** Identifiant + version lue par l'utilisateur (D25). */
export const orderVersionSchema = z.object({ id: idSchema, expectedUpdatedAt: expectedUpdatedAtSchema });
export const orderIdSchema = z.object({ id: idSchema });

const text = (label: string, min: number, max: number) =>
  z.string({ error: `${label} obligatoire.` }).trim().min(min, `${label} obligatoire (${min} caractères minimum).`).max(max, `${label} trop long (${max} caractères maximum).`);

export const rejectOrderSchema = orderVersionSchema.extend({ reason: text("Le motif du refus", 5, 500) });
export const returnOrderSchema = orderVersionSchema.extend({ comment: text("Le commentaire", 5, 1000) });
export const cancelOrderSchema = orderVersionSchema.extend({ reason: text("Le motif d'annulation", 5, 500) });
export const startAmendmentSchema = orderVersionSchema.extend({ reason: text("Le motif de l'avenant", 5, 500) });
export const abandonAmendmentSchema = orderVersionSchema.extend({ reason: nullable(z.string().trim().min(1).max(500, "Motif trop long (500 caractères maximum).")) });
export const closeOrderSchema = orderVersionSchema.extend({ comment: nullable(z.string().trim().min(1).max(500, "Commentaire trop long (500 caractères maximum).")) });
export const approveOrderSchema = orderVersionSchema.extend({ comment: nullable(z.string().trim().min(1).max(500, "Commentaire trop long (500 caractères maximum).")) });

export const markSentSchema = orderVersionSchema.extend({
  channel: contactChannelSchema,
  /** Date d'envoi (aujourd'hui ou avant) ; absente : aujourd'hui. */
  sentDate: nullable(dayInputSchema),
  contact: optionalString(100, "Contact"),
});

export const confirmOrderSchema = orderVersionSchema.extend({
  promisedDate: dayInputSchema,
  supplierRef: optionalString(60, "Référence fournisseur"),
});

export const changePromisedDateSchema = orderVersionSchema.extend({
  promisedDate: dayInputSchema,
  reason: text("Le motif du report", 5, 500),
});

export const remindOrderSchema = orderVersionSchema.extend({
  channel: contactChannelSchema,
  contact: optionalString(100, "Contact"),
  comment: optionalString(500, "Commentaire"),
});

export const commentOrderSchema = z.object({
  id: idSchema,
  comment: z.string({ error: "Commentaire obligatoire." }).trim().min(1, "Commentaire obligatoire.").max(1000, "Commentaire trop long (1000 caractères maximum)."),
});

export const checkOrderDuplicatesSchema = z.object({
  itemIds: z.array(idSchema).max(MAX_LINES),
  excludeId: nullable(idSchema),
});

export const priceCheckSchema = z.object({
  currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Devise invalide."),
  lines: z
    .array(z.object({ itemId: idSchema, unitPrice: unitPriceSchema, discountPct: discountSchema.default("0") }))
    .max(MAX_LINES),
});

export const searchOrderableLinesSchema = z.object({
  q: z.string().trim().max(60).default(""),
  supplierId: nullable(idSchema),
  limit: z.number().int().min(1).max(200).default(100),
});

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const opt = <T extends z.ZodType>(s: T) => z.preprocess(emptyToUndefined, s.optional());

export const ORDER_SORT_KEYS = ["number", "supplier", "expectedDate", "status", "createdAt", "totalTtcXof"] as const;

/** État de la liste (dans l'URL) : onglet, filtres, pagination. */
export const listOrdersSchema = listQuerySchema.extend({
  onglet: z.preprocess(emptyToUndefined, poTabSchema.default("tous")),
  statut: opt(poStatusSchema),
  fournisseur: opt(idSchema),
  acheteur: opt(idSchema),
  type: opt(poTypeSchema),
  devise: opt(z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Devise invalide.")),
  relance: z.preprocess((v) => (v === "1" || v === "true" || v === true ? true : undefined), z.boolean().optional()),
  tri: z.preprocess(emptyToUndefined, z.enum(ORDER_SORT_KEYS).optional()),
  q: optionalText(100),
});

export type ListOrdersInput = z.input<typeof listOrdersSchema>;
export type ListOrdersFilters = z.output<typeof listOrdersSchema>;

export const pdfQuerySchema = z.object({ v: z.coerce.number().int().min(1).max(99).optional() });
