"use server";

import { revalidatePath } from "next/cache";
import { withAction } from "@/modules/auth/session";
import { activateLicense, activateLicenseSchema, extendTrial, extendTrialSchema } from "@/modules/licensing";

/** Super-admin uniquement (license.manage). Exemptées de la garde d'écriture : l'activation doit rester possible. */
export const extendTrialAction = withAction(
  "license.manage",
  extendTrialSchema,
  async ({ user, input }) => {
    const l = await extendTrial(user, input);
    revalidatePath("/", "layout");
    return { trialEndsAt: l.trialEndsAt.toISOString() };
  },
  { writable: false },
);

export const activateLicenseAction = withAction(
  "license.manage",
  activateLicenseSchema,
  async ({ user, input }) => {
    const l = await activateLicense(user, input);
    revalidatePath("/", "layout");
    return { licensedTo: l.licensedTo, activatedAt: l.activatedAt?.toISOString() ?? null };
  },
  { writable: false },
);
