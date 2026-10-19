"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getNow } from "@/lib/clock";
import { getClientIp } from "@/modules/auth/ip";
import { withAction } from "@/modules/auth/session";
import {
  abandonAmendment,
  abandonAmendmentSchema,
  addComment,
  approveOrder,
  approveOrderSchema,
  cancelOrder,
  cancelOrderSchema,
  changePromisedDate,
  changePromisedDateSchema,
  checkOrderDuplicates,
  checkOrderDuplicatesSchema,
  closeOrder,
  closeOrderSchema,
  commentOrderSchema,
  confirmOrder,
  confirmOrderSchema,
  createDraft,
  createDraftFromRequestLines,
  createFromRequestLinesSchema,
  createOrderSchema,
  getOrder,
  getReminderText,
  getSendText,
  homeOrderSummary,
  listOrderableLines,
  listOrders,
  listOrdersSchema,
  markSent,
  markSentSchema,
  orderIdSchema,
  orderVersionSchema,
  priceCheckLines,
  priceCheckSchema,
  rejectOrder,
  rejectOrderSchema,
  remindOrderSchema,
  remindSupplier,
  returnOrderSchema,
  returnToDraft,
  searchOrderableLines,
  searchOrderableLinesSchema,
  startAmendment,
  startAmendmentSchema,
  submitOrder,
  updateDraft,
  updateOrderSchema,
} from "@/modules/purchase-orders";
import { serialize } from "@/modules/referentials/serialize";

/**
 * Server actions des bons de commande (LOT-05). Toutes passent par `withAction` : session, droit, licence
 * (écriture refusée si l'essai est expiré), validation Zod. Les lectures restent autorisées en lecture seule.
 * Le périmètre (local / import) et les règles de statut sont contrôlés par le service.
 */
const READ = { writable: false } as const;
const touch = (id?: string) => {
  revalidatePath("/achats/commandes");
  revalidatePath("/achats/demandes", "layout");
  if (id) revalidatePath(`/achats/commandes/${id}`);
};
const at = async () => (await getNow()).now;

// ---------------------------------------------------------------- lectures (purchaseOrder.view, autorisées en lecture seule)

export const listOrdersAction = withAction(
  "purchaseOrder.view",
  listOrdersSchema,
  async ({ user, input }) => serialize(await listOrders(user, input, await at())),
  READ,
);

export const getOrderAction = withAction("purchaseOrder.view", orderIdSchema, async ({ user, input }) => getOrder(user, input.id, await at()), READ);

/** Écran « À commander » : lignes de DA restant à commander, groupées par fournisseur principal. */
export const listOrderableLinesAction = withAction("purchaseOrder.create", z.object({}).optional(), ({ user }) => listOrderableLines(user), READ);

export const searchOrderableLinesAction = withAction(
  "purchaseOrder.create",
  searchOrderableLinesSchema,
  ({ user, input }) => searchOrderableLines(user, input),
  READ,
);

/** « Déjà commandé : BC-…, 40 U attendues le 12/11 » (jamais de prix ni de fournisseur). */
export const checkOrderDuplicatesAction = withAction(
  "purchaseOrder.view",
  checkOrderDuplicatesSchema,
  async ({ user, input }) => serialize(await checkOrderDuplicates(user, input)),
  READ,
);

/** Contrôle de prix en direct pour le formulaire (dernier prix, écart, alerte). */
export const priceCheckAction = withAction("purchaseOrder.view", priceCheckSchema, async ({ user, input }) => priceCheckLines(user, input, await at()), READ);

/** Texte de relance prêt à copier, liens WhatsApp et e-mail. */
export const reminderTextAction = withAction("purchaseOrder.view", orderIdSchema, async ({ user, input }) => getReminderText(user, input, await at()), READ);

/** Texte d'accompagnement de l'envoi du PDF au fournisseur, liens e-mail et WhatsApp. */
export const sendTextAction = withAction("purchaseOrder.view", orderIdSchema, async ({ user, input }) => getSendText(user, input), READ);

/** Pastilles de l'accueil : BC à valider (Responsable), en retard / à relancer (acheteur). */
export const homeOrderSummaryAction = withAction("purchaseOrder.view", z.object({}).optional(), async ({ user }) => homeOrderSummary(user, await at()), READ);

// ---------------------------------------------------------------- écritures

export const createOrderAction = withAction("purchaseOrder.create", createOrderSchema, async ({ user, input }) => {
  const r = await createDraft(user, input, await getClientIp(), await at());
  touch(r.id);
  return serialize(r);
});

/** Brouillon depuis des lignes de DA cochées (« À commander », fiche DA). */
export const createOrderFromRequestLinesAction = withAction("purchaseOrder.create", createFromRequestLinesSchema, async ({ user, input }) => {
  const r = await createDraftFromRequestLines(user, input, await getClientIp(), await at());
  touch(r.id);
  return serialize(r);
});

export const updateOrderAction = withAction("purchaseOrder.create", updateOrderSchema, async ({ user, input }) => {
  const r = await updateDraft(user, input, await getClientIp(), await at());
  touch(r.id);
  return serialize(r);
});

export const submitOrderAction = withAction("purchaseOrder.create", orderVersionSchema, async ({ user, input }) => {
  const r = await submitOrder(user, input, await getClientIp(), await at());
  touch(r.id);
  return serialize(r);
});

export const approveOrderAction = withAction("purchaseOrder.approve", approveOrderSchema, async ({ user, input }) => {
  const r = await approveOrder(user, input, await getClientIp(), await at());
  touch(r.id);
  return serialize(r);
});

export const rejectOrderAction = withAction("purchaseOrder.approve", rejectOrderSchema, async ({ user, input }) => {
  const r = await rejectOrder(user, input, await getClientIp(), await at());
  touch(r.id);
  return serialize(r);
});

export const returnOrderAction = withAction("purchaseOrder.approve", returnOrderSchema, async ({ user, input }) => {
  const r = await returnToDraft(user, input, await getClientIp(), await at());
  touch(r.id);
  return serialize(r);
});

export const cancelOrderAction = withAction("purchaseOrder.cancel", cancelOrderSchema, async ({ user, input }) => {
  const r = await cancelOrder(user, input, await getClientIp(), await at());
  touch(r.id);
  return serialize(r);
});

export const markSentAction = withAction("purchaseOrder.send", markSentSchema, async ({ user, input }) => {
  const r = await markSent(user, input, await getClientIp(), await at());
  touch(r.id);
  return serialize(r);
});

export const confirmOrderAction = withAction("purchaseOrder.send", confirmOrderSchema, async ({ user, input }) => {
  const r = await confirmOrder(user, input, await getClientIp(), await at());
  touch(r.id);
  return serialize(r);
});

export const changePromisedDateAction = withAction("purchaseOrder.send", changePromisedDateSchema, async ({ user, input }) => {
  const r = await changePromisedDate(user, input, await getClientIp(), await at());
  touch(r.id);
  return serialize(r);
});

export const remindSupplierAction = withAction("purchaseOrder.remind", remindOrderSchema, async ({ user, input }) => {
  const r = await remindSupplier(user, input, await getClientIp(), await at());
  touch(r.id);
  return serialize(r);
});

export const startAmendmentAction = withAction("purchaseOrder.create", startAmendmentSchema, async ({ user, input }) => {
  const r = await startAmendment(user, input, await getClientIp(), await at());
  touch(r.id);
  return serialize(r);
});

export const abandonAmendmentAction = withAction("purchaseOrder.create", abandonAmendmentSchema, async ({ user, input }) => {
  const r = await abandonAmendment(user, input, await getClientIp(), await at());
  touch(r.id);
  return serialize(r);
});

export const closeOrderAction = withAction("purchaseOrder.approve", closeOrderSchema, async ({ user, input }) => {
  const r = await closeOrder(user, input, await getClientIp(), await at());
  touch(r.id);
  return serialize(r);
});

export const addOrderCommentAction = withAction("purchaseOrder.view", commentOrderSchema, async ({ user, input }) => {
  const r = await addComment(user, input, await getClientIp(), await at());
  touch(r.id);
  return r;
});
