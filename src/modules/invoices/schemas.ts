import { z } from "zod";
import { idSchema, nullable, optionalString, qtySchema } from "@/modules/referentials/schemas";
import { listQuerySchema, optionalText } from "@/modules/referentials/list-query";
import { dayInputSchema } from "@/modules/purchase-requests/schemas";
import { INVOICE_STATUSES, INVOICE_TABS, REASON_MIN } from "./labels";

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const opt = <T extends z.ZodType>(s: T) => z.preprocess(emptyToUndefined, s.optional());

const reasonText = (label: string) =>
  z
    .string({ error: `${label} : saisissez un motif.` })
    .trim()
    .min(REASON_MIN, `${label} : le motif doit comporter au moins ${REASON_MIN} caractères.`)
    .max(300, `${label} : 300 caractères maximum.`);

const priceSchema = z
  .union([z.number(), z.string()], { error: "Le prix unitaire : valeur invalide." })
  .transform((v) => (typeof v === "string" ? Number(v.trim().replace(",", ".")) : v))
  .refine((n) => Number.isFinite(n), "Le prix unitaire : nombre invalide.")
  .refine((n) => n >= 0, "Le prix unitaire ne peut pas être négatif.")
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "Le prix unitaire : 2 décimales maximum.")
  .refine((n) => n < 1e11, "Le prix unitaire est trop élevé.");

const pctSchema = (label: string) =>
  z
    .union([z.number(), z.string()], { error: `${label} : valeur invalide.` })
    .transform((v) => (typeof v === "string" ? Number(v.trim().replace(",", ".")) : v))
    .refine((n) => Number.isFinite(n) && n >= 0 && n <= 100, `${label} doit être comprise entre 0 et 100.`);

export const MAX_INVOICE_LINES = 50;

export const invoiceLineInputSchema = z.object({
  orderLineId: idSchema,
  quantity: qtySchema("La quantité facturée", { positive: true }),
  unitPrice: priceSchema,
  discountPct: pctSchema("La remise").default(0),
  /** Absent : taux de la ligne du BC. */
  vatRate: nullable(pctSchema("Le taux de TVA")),
});

const body = {
  supplierInvoiceNo: z
    .string({ error: "Saisissez le numéro de la facture du fournisseur." })
    .trim()
    .min(1, "Saisissez le numéro de la facture du fournisseur.")
    .max(60, "N° de facture : 60 caractères maximum."),
  invoiceDate: dayInputSchema,
  /** Absent : calculée depuis les conditions de paiement du fournisseur. */
  dueDate: nullable(dayInputSchema),
  /** Absent : devise des BC (elle doit être celle des BC). */
  currencyCode: nullable(z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Devise invalide.")),
  notes: optionalString(500, "Notes"),
  lines: z
    .array(invoiceLineInputSchema)
    .min(1, "Ajoutez au moins une ligne à la facture.")
    .max(MAX_INVOICE_LINES, `Une facture ne peut pas dépasser ${MAX_INVOICE_LINES} lignes.`),
};

function checkLines(r: { lines: { orderLineId: string }[]; invoiceDate: string; dueDate?: string | null }, ctx: z.RefinementCtx) {
  const ids = r.lines.map((l) => l.orderLineId);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: "custom", path: ["lines"], message: "Une ligne de bon de commande ne peut figurer qu'une fois dans la facture." });
  }
  if (r.dueDate && r.dueDate < r.invoiceDate) {
    ctx.addIssue({ code: "custom", path: ["dueDate"], message: "L'échéance ne peut pas précéder la date de la facture." });
  }
}

export const createInvoiceSchema = z.object({ supplierId: idSchema, ...body }).superRefine(checkLines);
export const updateInvoiceSchema = z.object({ id: idSchema, ...body }).superRefine(checkLines);
export type CreateInvoiceInput = z.output<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.output<typeof updateInvoiceSchema>;

export const invoiceIdSchema = z.object({ id: idSchema });
export const approvePaymentSchema = z.object({ id: idSchema, derogationReason: nullable(reasonText("Dérogation")) });
export const litigeSchema = z.object({ id: idSchema, reason: reasonText("Litige") });
export const cancelInvoiceSchema = z.object({ id: idSchema, reason: reasonText("Annulation") });
export const removeInvoiceAttachmentSchema = z.object({ id: idSchema, attachmentId: idSchema });

export const INVOICE_SORT_KEYS = ["date", "echeance", "montant", "numero", "fournisseur"] as const;
export const INVOICE_DUE_FILTERS = ["en-retard", "semaine", "mois"] as const;

export const listInvoicesSchema = listQuerySchema.extend({
  onglet: z.preprocess(emptyToUndefined, z.enum(INVOICE_TABS).default("tous")),
  statut: opt(z.enum(INVOICE_STATUSES)),
  fournisseur: opt(idSchema),
  echeance: opt(z.enum(INVOICE_DUE_FILTERS)),
  tri: z.preprocess(emptyToUndefined, z.enum(INVOICE_SORT_KEYS).optional()),
  q: optionalText(100),
});
export type ListInvoicesInput = z.input<typeof listInvoicesSchema>;
export type ListInvoicesFilters = z.output<typeof listInvoicesSchema>;

export const invoiceableReceiptsSchema = z.object({ supplierId: idSchema });
