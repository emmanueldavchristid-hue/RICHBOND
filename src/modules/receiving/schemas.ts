import { z } from "zod";
import { idSchema, nullable, optionalString, qtySchema } from "@/modules/referentials/schemas";
import { optionalText } from "@/modules/referentials/list-query";
import { dayInputSchema } from "@/modules/purchase-requests/schemas";
import { NC_DECISIONS, REASON_MIN, REFUSAL_REASONS } from "./labels";

const reasonText = (label: string) =>
  z
    .string({ error: `${label} : saisissez un motif.` })
    .trim()
    .min(REASON_MIN, `${label} : le motif doit comporter au moins ${REASON_MIN} caractères.`)
    .max(300, `${label} : 300 caractères maximum.`);

const milli = (n: number) => Math.round(n * 1000);

export const refusalReasonSchema = z.enum(REFUSAL_REASONS, { error: "Motif de refus invalide." });
export const ncDecisionSchema = z.enum(NC_DECISIONS, { error: "Choisissez la décision : retour, avoir ou remplacement." });

export const receiptLineInputSchema = z
  .object({
    orderLineId: idSchema,
    deliveredQty: qtySchema("La quantité livrée"),
    acceptedQty: qtySchema("La quantité acceptée"),
    refusedQty: qtySchema("La quantité refusée").default(0),
    refusalReason: nullable(refusalReasonSchema),
    lotNumber: optionalString(60, "N° de lot"),
  })
  .superRefine((l, ctx) => {
    if (milli(l.deliveredQty) !== milli(l.acceptedQty) + milli(l.refusedQty)) {
      ctx.addIssue({ code: "custom", path: ["deliveredQty"], message: "La quantité livrée doit être égale à la quantité acceptée plus la quantité refusée." });
    }
    if (l.refusedQty > 0 && !l.refusalReason) {
      ctx.addIssue({ code: "custom", path: ["refusalReason"], message: "Indiquez le motif du refus." });
    }
  });

export const MAX_RECEIPT_LINES = 50;

export const createReceiptSchema = z
  .object({
    orderId: idSchema,
    /** Absent : dépôt du BC. */
    warehouseId: nullable(idSchema),
    deliveryNoteRef: z
      .string({ error: "Saisissez le numéro du bon de livraison du fournisseur." })
      .trim()
      .min(1, "Saisissez le numéro du bon de livraison du fournisseur.")
      .max(60, "N° de bon de livraison : 60 caractères maximum."),
    receivedAt: dayInputSchema,
    carrier: optionalString(100, "Transporteur"),
    comment: optionalString(500, "Commentaire"),
    lines: z.array(receiptLineInputSchema).min(1, "Ajoutez au moins une ligne reçue.").max(MAX_RECEIPT_LINES, `Une réception ne peut pas dépasser ${MAX_RECEIPT_LINES} lignes.`),
    /** Accord du Responsable pour une livraison supérieure à la quantité commandée (tolérance comprise). */
    overDeliveryApproved: z.boolean().default(false),
    overDeliveryReason: nullable(reasonText("Accord de sur-livraison")),
  })
  .superRefine((r, ctx) => {
    const ids = r.lines.map((l) => l.orderLineId);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["lines"], message: "Une ligne de bon de commande ne peut figurer qu'une fois dans la réception." });
    if (!r.lines.some((l) => l.deliveredQty > 0)) ctx.addIssue({ code: "custom", path: ["lines"], message: "Saisissez au moins une quantité livrée." });
    if (r.overDeliveryApproved && !r.overDeliveryReason) {
      ctx.addIssue({ code: "custom", path: ["overDeliveryReason"], message: "Saisissez le motif de l'accord de sur-livraison." });
    }
  });
export type CreateReceiptInput = z.output<typeof createReceiptSchema>;

export const cancelReceiptSchema = z.object({ id: idSchema, reason: reasonText("Annulation") });
export const receiptIdSchema = z.object({ id: idSchema });

export const closeRemainderSchema = z.object({
  orderId: idSchema,
  reason: reasonText("Solde du reliquat"),
  /** Absent : toutes les lignes ayant un restant dû. */
  lineIds: z.array(idSchema).max(50).optional(),
});

export const decideNonConformitySchema = z.object({
  id: idSchema,
  decision: ncDecisionSchema,
  comment: optionalString(300, "Commentaire"),
});

export const createSupplierReturnSchema = z.object({
  orderId: idSchema,
  warehouseId: nullable(idSchema),
  reason: reasonText("Retour fournisseur"),
  returnedAt: dayInputSchema,
  lines: z
    .array(z.object({ orderLineId: idSchema, quantity: qtySchema("La quantité retournée", { positive: true }) }))
    .min(1, "Ajoutez au moins une ligne à retourner.")
    .max(MAX_RECEIPT_LINES),
});

export const orderForReceiptSchema = z.object({ orderId: idSchema });

export const listExpectedSchema = z.object({ q: optionalText(100) }).default({});
export const listRecentSchema = z
  .object({
    q: optionalText(100),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .default({ limit: 20 });
export const listNonConformitiesSchema = z
  .object({
    status: z.enum(["OUVERTE", "CLOTUREE"]).optional(),
    q: optionalText(100),
    limit: z.coerce.number().int().min(1).max(200).default(100),
  })
  .default({ limit: 100 });
export type ListExpectedInput = z.input<typeof listExpectedSchema>;
export type ListRecentInput = z.input<typeof listRecentSchema>;
export type ListNonConformitiesInput = z.input<typeof listNonConformitiesSchema>;
