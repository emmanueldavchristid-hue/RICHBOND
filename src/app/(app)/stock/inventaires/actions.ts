"use server";

import { revalidatePath } from "next/cache";
import { getClientIp } from "@/modules/auth/ip";
import { withAction } from "@/modules/auth/session";
import {
  addInventoryLines,
  addLinesSchema,
  cancelCountSchema,
  cancelInventoryCount,
  countIdSchema,
  createInventoryCount,
  createInventorySchema,
  getBlindSheet,
  getInventoryReliability,
  getInventoryReview,
  listCountsSchema,
  listInventoryCounts,
  openInventoryCount,
  proposeInventorySelection,
  proposeSelectionSchema,
  removeInventoryLine,
  removeLineSchema,
  requestInventoryRecount,
  requestRecountSchema,
  saveCountSchema,
  saveInventoryCount,
  saveInventoryRecount,
  searchInventoryItems,
  searchItemsSchema,
  submitCountSchema,
  submitInventoryCount,
  validateCountSchema,
  validateInventoryCount,
} from "@/modules/inventory";
import { serialize } from "@/modules/referentials/serialize";
import { z } from "zod";

/** Voir src/modules/inventory/index.ts pour les signatures et les droits. */
const READ = { writable: false } as const;
const touch = () => revalidatePath("/stock/inventaires");

// ------------------------------------------------------------------ lectures

// Droit contrôlé dans le service : inventory.view OU inventory.count (le Magasinier ne reçoit aucune valeur).
export const listInventoryCountsAction = withAction(null, listCountsSchema, async ({ user, input }) => serialize(await listInventoryCounts(user, input)), READ);
export const getBlindSheetAction = withAction("inventory.count", countIdSchema, async ({ user, input }) => serialize(await getBlindSheet(user, input)), READ);
export const getInventoryReviewAction = withAction("inventory.view", countIdSchema, async ({ user, input }) => serialize(await getInventoryReview(user, input)), READ);
export const proposeInventorySelectionAction = withAction("inventory.prepare", proposeSelectionSchema, async ({ user, input }) => serialize(await proposeInventorySelection(user, input)), READ);
export const searchInventoryItemsAction = withAction("inventory.prepare", searchItemsSchema, async ({ user, input }) => serialize(await searchInventoryItems(user, input)), READ);
export const getInventoryReliabilityAction = withAction(
  "inventory.view",
  z.object({ warehouseId: z.string().optional() }),
  async ({ user, input }) => serialize(await getInventoryReliability(user, input.warehouseId)),
  READ,
);

// ------------------------------------------------------------------ écritures

export const createInventoryCountAction = withAction("inventory.prepare", createInventorySchema, async ({ user, input }) => {
  const r = await createInventoryCount(user, input, await getClientIp());
  touch();
  return r;
});

export const addInventoryLinesAction = withAction("inventory.prepare", addLinesSchema, async ({ user, input }) => {
  const r = await addInventoryLines(user, input, await getClientIp());
  touch();
  return r;
});

export const removeInventoryLineAction = withAction("inventory.prepare", removeLineSchema, async ({ user, input }) => {
  const r = await removeInventoryLine(user, input, await getClientIp());
  touch();
  return r;
});

export const openInventoryCountAction = withAction("inventory.count", countIdSchema, async ({ user, input }) => {
  const r = await openInventoryCount(user, input, await getClientIp());
  touch();
  return r;
});

// Sauvegarde automatique : pas de revalidatePath à chaque frappe.
export const saveInventoryCountAction = withAction("inventory.count", saveCountSchema, async ({ user, input }) =>
  saveInventoryCount(user, input, await getClientIp()),
);

export const saveInventoryRecountAction = withAction("inventory.count", saveCountSchema, async ({ user, input }) =>
  saveInventoryRecount(user, input, await getClientIp()),
);

export const submitInventoryCountAction = withAction("inventory.count", submitCountSchema, async ({ user, input }) => {
  const r = await submitInventoryCount(user, input, await getClientIp());
  touch();
  return r;
});

export const requestInventoryRecountAction = withAction("inventory.validate", requestRecountSchema, async ({ user, input }) => {
  const r = await requestInventoryRecount(user, input, await getClientIp());
  touch();
  return r;
});

export const validateInventoryCountAction = withAction("inventory.validate", validateCountSchema, async ({ user, input }) => {
  const r = await validateInventoryCount(user, input, await getClientIp());
  touch();
  revalidatePath("/stock");
  return r;
});

export const cancelInventoryCountAction = withAction("inventory.cancel", cancelCountSchema, async ({ user, input }) => {
  const r = await cancelInventoryCount(user, input, await getClientIp());
  touch();
  return r;
});
