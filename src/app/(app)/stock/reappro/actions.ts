"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getNow } from "@/lib/clock";
import { getClientIp } from "@/modules/auth/ip";
import { withAction } from "@/modules/auth/session";
import {
  applySuggestedThresholds,
  applyThresholdsSchema,
  createReorderRequests,
  createReorderRequestsSchema,
  listReorder,
  recomputeAbc,
  recomputeAbcSchema,
} from "@/modules/stock";

/** Server actions du réapprovisionnement, des seuils suggérés et de la classe ABC (LOT-07). */
const READ = { writable: false } as const;
const at = async () => (await getNow()).now;

export const listReorderAction = withAction("stock.reorder", z.object({}).default({}), async ({ user }) => listReorder(user, await at()), READ);

/** « Créer les DA » : une DA SOUMISE par type d'achat. */
export const createReorderRequestsAction = withAction("stock.reorder", createReorderRequestsSchema, async ({ user, input }) => {
  const r = await createReorderRequests(user, input, await getClientIp(), await at());
  revalidatePath("/stock/reappro");
  revalidatePath("/achats/demandes");
  return r;
});

/** « Appliquer les valeurs suggérées » (Responsable) : jamais automatique. */
export const applySuggestedThresholdsAction = withAction("stock.thresholds", applyThresholdsSchema, async ({ user, input }) => {
  const r = await applySuggestedThresholds(user, input, await getClientIp(), await at());
  revalidatePath("/stock/reappro");
  revalidatePath("/stock/articles");
  return r;
});

/** « Recalculer » la classe ABC (Responsable). */
export const recomputeAbcAction = withAction("stock.thresholds", recomputeAbcSchema, async ({ user, input }) => {
  const r = await recomputeAbc(user, input, await getClientIp(), await at());
  revalidatePath("/stock/articles");
  return r;
});
