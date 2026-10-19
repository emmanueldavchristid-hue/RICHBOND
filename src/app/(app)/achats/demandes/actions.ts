"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { BusinessError } from "@/lib/errors";
import { getNow } from "@/lib/clock";
import { db } from "@/lib/db";
import { getClientIp } from "@/modules/auth/ip";
import { withAction } from "@/modules/auth/session";
import {
  addAttachment,
  addComment,
  approveMany,
  approveManySchema,
  approveRequest,
  approveRequestSchema,
  assignBuyer,
  assignBuyerSchema,
  cancelRequest,
  cancelRequestSchema,
  checkDuplicatesSchema,
  commentRequestSchema,
  createRequest,
  duplicateWarnings,
  getRequest,
  getStockSnapshot,
  listAssignableBuyers,
  listCriticalPending,
  listRequests,
  listRequestsSchema,
  rejectRequest,
  rejectRequestSchema,
  removeAttachment,
  removeAttachmentSchema,
  requestIdSchema,
  requestVersionSchema,
  returnForCompletion,
  returnRequestSchema,
  searchItemsForRequest,
  searchItemsForRequestSchema,
  submitRequest,
  updateRequest,
  updateRequestSchema,
} from "@/modules/purchase-requests";
import { idSchema } from "@/modules/referentials";
import { serialize } from "@/modules/referentials/serialize";
import { viewerCanSeePrices } from "@/modules/settings";

const READ = { writable: false } as const;
const touch = (id?: string) => {
  revalidatePath("/achats/demandes");
  if (id) revalidatePath(`/achats/demandes/${id}`);
};

// ---------------------------------------------------------------- lectures (purchaseRequest.view, autorisées en lecture seule)

export const listRequestsAction = withAction(
  "purchaseRequest.view",
  listRequestsSchema,
  async ({ user, input }) => serialize(await listRequests(user, input, { showPrices: await viewerCanSeePrices(user) })),
  READ,
);

export const getRequestAction = withAction(
  "purchaseRequest.view",
  requestIdSchema,
  async ({ user, input }) => getRequest(user, input.id, { showPrices: await viewerCanSeePrices(user) }),
  READ,
);

/** D13 : avertissement non bloquant ; `excludeId` = la DA en cours de saisie. */
export const checkDuplicatesAction = withAction(
  "purchaseRequest.view",
  checkDuplicatesSchema,
  async ({ input }) => serialize(await duplicateWarnings(db, input.itemIds, input.excludeId)),
  READ,
);

/** Recherche clavier d'un article pour une ligne (code ou désignation). */
export const searchItemsForRequestAction = withAction(
  "purchaseRequest.view",
  searchItemsForRequestSchema,
  ({ user, input }) => searchItemsForRequest(user, input),
  READ,
);

/** D14 : `null` tant que la gestion des stocks (LOT-07) n'existe pas. */
export const getStockSnapshotAction = withAction(
  "purchaseRequest.view",
  z.object({ itemIds: z.array(idSchema).max(50) }),
  ({ input }) => getStockSnapshot(input.itemIds),
  READ,
);

export const listAssignableBuyersAction = withAction(
  "purchaseRequest.approve",
  z.object({ type: z.enum(["LOCAL", "IMPORT"]) }),
  ({ input }) => listAssignableBuyers(input.type),
  READ,
);

/** Bandeau rouge persistant : arrêts de production à valider. */
export const listCriticalPendingAction = withAction(
  "purchaseRequest.approve",
  z.object({}).optional(),
  () => listCriticalPending(),
  READ,
);

// ---------------------------------------------------------------- écritures

/**
 * `null` : le droit dépend du rôle (`create` pour Responsable/Acheteur, `createReplenishment` pour le Magasinier),
 * contrôlé dans le service (FORBIDDEN pour les autres).
 */
export const createRequestAction = withAction(null, z.unknown(), async ({ user, input }) => {
  const r = await createRequest(user, input, await getClientIp(), (await getNow()).now);
  touch(r.id);
  return r;
});

export const updateRequestAction = withAction("purchaseRequest.view", updateRequestSchema, async ({ user, input }) => {
  const r = await updateRequest(user, input, await getClientIp(), (await getNow()).now);
  touch(r.id);
  return r;
});

export const submitRequestAction = withAction("purchaseRequest.view", requestVersionSchema, async ({ user, input }) => {
  const r = await submitRequest(user, input, await getClientIp(), (await getNow()).now);
  touch(r.id);
  return serialize(r);
});

export const approveRequestAction = withAction("purchaseRequest.approve", approveRequestSchema, async ({ user, input }) => {
  const r = await approveRequest(user, input, await getClientIp(), (await getNow()).now);
  touch(r.id);
  return serialize(r);
});

/** D19 : ≤ 50 DA, quantités inchangées, chaque DA dans sa transaction. */
export const approveManyAction = withAction("purchaseRequest.approve", approveManySchema, async ({ user, input }) => {
  const r = await approveMany(user, input, await getClientIp(), (await getNow()).now);
  touch();
  return r;
});

export const rejectRequestAction = withAction("purchaseRequest.approve", rejectRequestSchema, async ({ user, input }) => {
  const r = await rejectRequest(user, input, await getClientIp(), (await getNow()).now);
  touch(r.id);
  return r;
});

export const returnRequestAction = withAction("purchaseRequest.approve", returnRequestSchema, async ({ user, input }) => {
  const r = await returnForCompletion(user, input, await getClientIp(), (await getNow()).now);
  touch(r.id);
  return r;
});

export const cancelRequestAction = withAction("purchaseRequest.cancel", cancelRequestSchema, async ({ user, input }) => {
  const r = await cancelRequest(user, input, await getClientIp(), (await getNow()).now);
  touch(r.id);
  return r;
});

export const assignBuyerAction = withAction("purchaseRequest.approve", assignBuyerSchema, async ({ user, input }) => {
  const r = await assignBuyer(user, input, await getClientIp(), (await getNow()).now);
  touch(r.id);
  return r;
});

export const addCommentAction = withAction("purchaseRequest.view", commentRequestSchema, async ({ user, input }) => {
  const r = await addComment(user, input, await getClientIp(), (await getNow()).now);
  touch(r.id);
  return r;
});

/** FormData : champs `requestId` et `file`. */
export const addAttachmentAction = withAction("purchaseRequest.view", z.instanceof(FormData), async ({ user, input }) => {
  const requestId = idSchema.safeParse(input.get("requestId"));
  const file = input.get("file");
  if (!requestId.success) throw new BusinessError("VALIDATION", "Demande manquante ou invalide.");
  if (!(file instanceof File)) throw new BusinessError("VALIDATION", "Aucun fichier sélectionné.");
  const r = await addAttachment(
    user,
    { requestId: requestId.data, fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()) },
    await getClientIp(),
    (await getNow()).now,
  );
  touch(requestId.data);
  return r;
});

export const removeAttachmentAction = withAction("purchaseRequest.view", removeAttachmentSchema, async ({ user, input }) => {
  const r = await removeAttachment(user, { requestId: input.id, attachmentId: input.attachmentId }, await getClientIp(), (await getNow()).now);
  touch(input.id);
  return r;
});
