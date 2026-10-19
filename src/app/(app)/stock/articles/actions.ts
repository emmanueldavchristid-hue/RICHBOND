"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { BusinessError } from "@/lib/errors";
import { getNow } from "@/lib/clock";
import { getClientIp } from "@/modules/auth/ip";
import { withAction } from "@/modules/auth/session";
import {
  changeItemCode,
  changeItemCodeSchema,
  createItem,
  createItemSchema,
  deactivateItemSupplier,
  getItem,
  itemIdSchema,
  linkSupplier,
  linkSupplierSchema,
  listFamilies,
  listItemOptions,
  listItems,
  listItemsSchema,
  listPriceHistory,
  removeItemPhoto,
  setItemPhoto,
  setItemStatus,
  setItemStatusSchema,
  updateItem,
  updateItemSchema,
  updateItemSupplier,
  updateItemSupplierSchema,
} from "@/modules/items";
import { expectedUpdatedAtSchema, idSchema } from "@/modules/referentials";
import { serialize } from "@/modules/referentials/serialize";
import { viewerCanSeePrices } from "@/modules/settings";

const READ = { writable: false } as const;
const touch = (id?: string) => {
  revalidatePath("/stock/articles");
  if (id) revalidatePath(`/stock/articles/${id}`);
};

// ---------------------------------------------------------------- lectures (item.view)

export const listItemsAction = withAction("item.view", listItemsSchema, ({ input }) => listItems(input), READ);

export const getItemAction = withAction(
  "item.view",
  itemIdSchema,
  async ({ user, input }) => getItem(input.id, { showPrices: await viewerCanSeePrices(user) }),
  READ,
);

/** R15 : renvoie une liste vide si le prix est masqué pour l'utilisateur. */
export const listPriceHistoryAction = withAction(
  "item.view",
  itemIdSchema,
  async ({ user, input }) => listPriceHistory(input.id, { showPrices: await viewerCanSeePrices(user) }),
  READ,
);

export const listFamiliesAction = withAction("item.view", z.object({}).optional(), () => listFamilies(), READ);

export const listItemOptionsAction = withAction(
  "item.view",
  z.object({ q: z.string().trim().max(60).optional(), limit: z.number().int().min(1).max(200).optional() }),
  ({ input }) => listItemOptions(input),
  READ,
);

// ---------------------------------------------------------------- écritures (item.manage)

export const createItemAction = withAction("item.manage", createItemSchema, async ({ user, input }) => {
  const r = await createItem(user, input, await getClientIp());
  touch(r.id);
  return serialize(r);
});

export const updateItemAction = withAction("item.manage", updateItemSchema, async ({ user, input }) => {
  const r = await updateItem(user, input, await getClientIp());
  touch(r.id);
  return serialize(r);
});

export const setItemStatusAction = withAction("item.manage", setItemStatusSchema, async ({ user, input }) => {
  const r = await setItemStatus(user, input, await getClientIp());
  touch(r.id);
  return serialize(r);
});

/** R2 : changement de code réservé au Responsable. */
export const changeItemCodeAction = withAction("settings.manage", changeItemCodeSchema, async ({ user, input }) => {
  const r = await changeItemCode(user, input, await getClientIp());
  touch(r.id);
  return serialize(r);
});

export const linkSupplierAction = withAction("item.manage", linkSupplierSchema, async ({ user, input }) => {
  const r = await linkSupplier(user, input, await getClientIp(), (await getNow()).now);
  touch(input.itemId);
  return serialize(r);
});

export const updateItemSupplierAction = withAction("item.manage", updateItemSupplierSchema, async ({ user, input }) => {
  const r = await updateItemSupplier(user, input, await getClientIp(), (await getNow()).now);
  touch(r.itemId);
  return serialize(r);
});

export const deactivateItemSupplierAction = withAction(
  "item.manage",
  z.object({ id: idSchema, expectedUpdatedAt: expectedUpdatedAtSchema }),
  async ({ user, input }) => {
    const r = await deactivateItemSupplier(user, input, await getClientIp());
    touch(r.itemId);
    return serialize(r);
  },
);

/** FormData : champs `id`, `expectedUpdatedAt` (ISO), `file`. */
export const setItemPhotoAction = withAction("item.manage", z.instanceof(FormData), async ({ user, input }) => {
  const parsedId = idSchema.safeParse(input.get("id"));
  const expectedUpdatedAt = expectedUpdatedAtSchema.safeParse(input.get("expectedUpdatedAt"));
  const file = input.get("file");
  if (!parsedId.success) throw new BusinessError("VALIDATION", "Article manquant ou invalide.");
  if (!expectedUpdatedAt.success) throw new BusinessError("VALIDATION", "Version de la fiche manquante.");
  const id = parsedId.data;
  if (!(file instanceof File)) throw new BusinessError("VALIDATION", "Aucune photo sélectionnée.");
  const r = await setItemPhoto(
    user,
    { id, expectedUpdatedAt: expectedUpdatedAt.data, bytes: new Uint8Array(await file.arrayBuffer()) },
    await getClientIp(),
  );
  touch(id);
  return r;
});

export const removeItemPhotoAction = withAction(
  "item.manage",
  z.object({ id: idSchema, expectedUpdatedAt: expectedUpdatedAtSchema }),
  async ({ user, input }) => {
    await removeItemPhoto(user, input, await getClientIp());
    touch(input.id);
    return { removed: true };
  },
);
