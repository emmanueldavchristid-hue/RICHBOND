"use server";

import { revalidatePath } from "next/cache";
import { getNow } from "@/lib/clock";
import { getClientIp } from "@/modules/auth/ip";
import { withAction } from "@/modules/auth/session";
import {
  cancelReceipt,
  cancelReceiptSchema,
  closeRemainder,
  closeRemainderSchema,
  createReceipt,
  createReceiptSchema,
  createSupplierReturn,
  createSupplierReturnSchema,
  decideNonConformity,
  decideNonConformitySchema,
  getOrderForReceipt,
  getReceipt,
  listExpected,
  listExpectedSchema,
  listNonConformities,
  listNonConformitiesSchema,
  listRecent,
  listRecentSchema,
  orderForReceiptSchema,
  receiptIdSchema,
} from "@/modules/receiving";

/**
 * Server actions des réceptions (LOT-06). Toutes passent par `withAction` : session, droit, licence (écriture refusée
 * si l'essai est expiré), validation Zod. Les lectures restent autorisées en lecture seule. Les règles de statut, de
 * périmètre et de sur-livraison sont contrôlées par le service. Le Magasinier ne reçoit jamais de prix (voir les types).
 */
const READ = { writable: false } as const;
const at = async () => (await getNow()).now;
const touch = (orderId?: string, receiptId?: string) => {
  revalidatePath("/stock/receptions");
  revalidatePath("/stock/receptions/non-conformites");
  revalidatePath("/stock");
  revalidatePath("/achats/commandes");
  if (orderId) revalidatePath(`/achats/commandes/${orderId}`);
  if (receiptId) revalidatePath(`/stock/receptions/${receiptId}`);
};

// ---------------------------------------------------------------- lectures (receipt.view, autorisées en lecture seule)

export const listExpectedAction = withAction("receipt.view", listExpectedSchema, async ({ user, input }) => listExpected(user, input, await at()), READ);

export const listRecentAction = withAction("receipt.view", listRecentSchema, ({ user, input }) => listRecent(user, input), READ);

export const getOrderForReceiptAction = withAction("receipt.view", orderForReceiptSchema, ({ user, input }) => getOrderForReceipt(user, input), READ);

export const getReceiptAction = withAction("receipt.view", receiptIdSchema, ({ user, input }) => getReceipt(user, input), READ);

export const listNonConformitiesAction = withAction("receipt.view", listNonConformitiesSchema, ({ user, input }) => listNonConformities(user, input), READ);

// ---------------------------------------------------------------- écritures

/** Valide une réception (une étape) : numéro REC, mouvements de stock, statut du BC, non-conformités. */
export const createReceiptAction = withAction("receipt.create", createReceiptSchema, async ({ user, input }) => {
  const r = await createReceipt(user, input, await getClientIp(), await at());
  touch(r.orderId, r.id);
  return r;
});

/** Contre-passation (Responsable) : mouvements inverses, quantités reçues et statut du BC rétablis. */
export const cancelReceiptAction = withAction("receipt.cancel", cancelReceiptSchema, async ({ user, input }) => {
  const r = await cancelReceipt(user, input, await getClientIp(), await at());
  touch(undefined, r.id);
  return r;
});

/** Solde le reliquat d'un BC partiellement reçu (acheteur du périmètre ou Responsable). */
export const closeRemainderAction = withAction("purchaseOrder.closeRemainder", closeRemainderSchema, async ({ user, input }) => {
  const r = await closeRemainder(user, input, await getClientIp(), await at());
  touch(r.orderId);
  return r;
});

/** Décision sur une non-conformité : retour, avoir ou remplacement. */
export const decideNonConformityAction = withAction("nonConformity.decide", decideNonConformitySchema, async ({ user, input }) => {
  const r = await decideNonConformity(user, input, await getClientIp(), await at());
  touch();
  return r;
});

/** Bon de retour fournisseur (marchandise déjà entrée en stock). */
export const createSupplierReturnAction = withAction("supplierReturn.create", createSupplierReturnSchema, async ({ user, input }) => {
  const r = await createSupplierReturn(user, input, await getClientIp(), await at());
  touch(r.orderId);
  return r;
});
