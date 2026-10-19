import { z } from "zod";

/** Réglages connus (clé -> schéma de valeur + défaut). */
export const SETTING_DEFS = {
  "warehouse.showPurchasePrice": { schema: z.boolean({ error: "Valeur invalide." }), default: false },
} as const;

export type SettingKey = keyof typeof SETTING_DEFS;
export const settingKeySchema = z.enum(Object.keys(SETTING_DEFS) as [SettingKey, ...SettingKey[]], {
  error: "Réglage inconnu.",
});

export const updateSettingSchema = z
  .object({ key: settingKeySchema, value: z.unknown() })
  .superRefine((v, ctx) => {
    const r = SETTING_DEFS[v.key].schema.safeParse(v.value);
    if (!r.success) ctx.addIssue({ code: "custom", path: ["value"], message: r.error.issues[0]?.message ?? "Valeur invalide." });
  });

export interface AppSettings {
  showPurchasePriceToWarehouse: boolean;
}
