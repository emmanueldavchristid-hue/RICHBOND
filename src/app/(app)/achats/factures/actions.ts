"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getNow } from "@/lib/clock";
import { BusinessError } from "@/lib/errors";
import { getClientIp } from "@/modules/auth/ip";
import { withAction } from "@/modules/auth/session";
import { idSchema } from "@/modules/referentials/schemas";
import {
  addInvoiceAttachment,
  approvePayment,
  approvePaymentSchema,
  cancelInvoice,
  cancelInvoiceSchema,
  createInvoice,
  createInvoiceSchema,
  dueSchedule,
  getInvoice,
  invoiceIdSchema,
  invoiceableReceiptsSchema,
  listInvoiceableReceipts,
  listInvoices,
  listInvoicesSchema,
  litigeSchema,
  markLitige,
  markTransmitted,
  removeInvoiceAttachment,
  removeInvoiceAttachmentSchema,
  rematchInvoice,
  resolveLitige,
  updateInvoice,
  updateInvoiceSchema,
} from "@/modules/invoices";

/**
 * Server actions des factures fournisseurs (LOT-13). Toutes passent par `withAction` : session, droit, licence
 * (écriture refusée si l'essai est expiré), validation Zod. Lectures autorisées en lecture seule.
 * Le bon à payer exige `invoice.approvePayment` (Responsable Achats seul).
 */
const READ = { writable: false } as const;
const at = async () => (await getNow()).now;
const touch = (id?: string) => {
  revalidatePath("/achats/factures");
  revalidatePath("/achats/commandes");
  if (id) revalidatePath(`/achats/factures/${id}`);
};

// ---------------------------------------------------------------- lectures (invoice.view)
export const listInvoicesAction = withAction("invoice.view", listInvoicesSchema, async ({ user, input }) => listInvoices(user, input, await at()), READ);
export const getInvoiceAction = withAction("invoice.view", invoiceIdSchema, ({ user, input }) => getInvoice(user, input), READ);
export const listInvoiceableReceiptsAction = withAction("invoice.view", invoiceableReceiptsSchema, ({ user, input }) => listInvoiceableReceipts(user, input), READ);
export const dueScheduleAction = withAction("invoice.view", z.object({}).default({}), async ({ user }) => dueSchedule(user, await at()), READ);

// ---------------------------------------------------------------- écritures
export const createInvoiceAction = withAction("invoice.manage", createInvoiceSchema, async ({ user, input }) => {
  const r = await createInvoice(user, input, await getClientIp(), await at());
  touch(r.id);
  return r;
});

export const updateInvoiceAction = withAction("invoice.manage", updateInvoiceSchema, async ({ user, input }) => {
  const r = await updateInvoice(user, input, await getClientIp(), await at());
  touch(r.id);
  return r;
});

export const rematchInvoiceAction = withAction("invoice.manage", invoiceIdSchema, async ({ user, input }) => {
  const r = await rematchInvoice(user, input, await getClientIp(), await at());
  touch(r.id);
  return r;
});

/** Bon à payer : Responsable Achats seul ; motif de dérogation obligatoire sur une facture en écart. */
export const approvePaymentAction = withAction("invoice.approvePayment", approvePaymentSchema, async ({ user, input }) => {
  const r = await approvePayment(user, input, await getClientIp(), await at());
  touch(r.id);
  return r;
});

export const transmitInvoiceAction = withAction("invoice.manage", invoiceIdSchema, async ({ user, input }) => {
  const r = await markTransmitted(user, input, await getClientIp(), await at());
  touch(r.id);
  return r;
});

export const markLitigeAction = withAction("invoice.manage", litigeSchema, async ({ user, input }) => {
  const r = await markLitige(user, input, await getClientIp());
  touch(r.id);
  return r;
});

export const resolveLitigeAction = withAction("invoice.manage", invoiceIdSchema, async ({ user, input }) => {
  const r = await resolveLitige(user, input, await getClientIp(), await at());
  touch(r.id);
  return r;
});

export const cancelInvoiceAction = withAction("invoice.manage", cancelInvoiceSchema, async ({ user, input }) => {
  const r = await cancelInvoice(user, input, await getClientIp(), await at());
  touch(r.id);
  return r;
});

/** FormData : champs `invoiceId` et `file`. */
export const addInvoiceAttachmentAction = withAction("invoice.manage", z.instanceof(FormData), async ({ user, input }) => {
  const invoiceId = idSchema.safeParse(input.get("invoiceId"));
  const file = input.get("file");
  if (!invoiceId.success) throw new BusinessError("VALIDATION", "Facture manquante ou invalide.");
  if (!(file instanceof File)) throw new BusinessError("VALIDATION", "Aucun fichier sélectionné.");
  const r = await addInvoiceAttachment(user, { invoiceId: invoiceId.data, fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }, await getClientIp(), await at());
  touch(invoiceId.data);
  return r;
});

export const removeInvoiceAttachmentAction = withAction("invoice.manage", removeInvoiceAttachmentSchema, async ({ user, input }) => {
  const r = await removeInvoiceAttachment(user, { invoiceId: input.id, attachmentId: input.attachmentId }, await getClientIp(), await at());
  touch(input.id);
  return r;
});
