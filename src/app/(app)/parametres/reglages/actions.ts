"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getClientIp } from "@/modules/auth/ip";
import { withAction } from "@/modules/auth/session";
import { getSettings, updateSetting, updateSettingSchema } from "@/modules/settings";

export const getSettingsAction = withAction("settings.manage", z.object({}).optional(), () => getSettings(), { writable: false });

/** H13 : `{ key: "warehouse.showPurchasePrice", value: boolean }`. */
export const updateSettingAction = withAction("settings.manage", updateSettingSchema, async ({ user, input }) => {
  const r = await updateSetting(user, input, await getClientIp());
  revalidatePath("/parametres/reglages");
  revalidatePath("/stock/articles", "layout");
  revalidatePath("/fournisseurs", "layout");
  return r;
});
