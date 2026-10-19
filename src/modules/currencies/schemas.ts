import { z } from "zod";
import { expectedUpdatedAtSchema, idSchema, nullable } from "@/modules/referentials/schemas";

const currencyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Code devise invalide (3 lettres, ex. EUR).");

export const upsertCurrencySchema = z.object({
  code: currencyCodeSchema,
  name: z.string().trim().min(2, "Le nom de la devise est obligatoire.").max(60, "Nom trop long."),
  symbol: z.string().trim().min(1, "Le symbole est obligatoire.").max(5, "Symbole trop long."),
  decimals: z.coerce.number().int().min(0).max(4).default(2),
});

export const setCurrencyActiveSchema = z.object({ code: currencyCodeSchema, active: z.boolean() });

const rateValue = z
  .union([z.number(), z.string()], { error: "Taux invalide." })
  .transform((v) => (typeof v === "string" ? v.trim().replace(",", ".") : String(v)))
  .refine((s) => /^\d{1,8}(\.\d{1,6})?$/.test(s), "Taux invalide (6 décimales maximum).")
  .refine((s) => Number(s) > 0, "Le taux doit être strictement positif.");

export const addExchangeRateSchema = z.object({
  currencyCode: currencyCodeSchema,
  /** AAAA-MM-JJ */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (AAAA-MM-JJ)."),
  rate: rateValue,
  note: nullable(z.string().trim().min(1).max(200, "Note trop longue.")),
  confirmEurDeviation: z.boolean().default(false),
});

export const updateExchangeRateSchema = z.object({
  id: idSchema,
  expectedUpdatedAt: expectedUpdatedAtSchema,
  rate: rateValue,
  note: nullable(z.string().trim().min(1).max(200, "Note trop longue.")),
  confirmEurDeviation: z.boolean().default(false),
});

export const listRatesSchema = z.object({
  currencyCode: currencyCodeSchema,
  limit: z.coerce.number().int().min(1).max(500).default(60),
});

export type UpsertCurrencyInput = z.input<typeof upsertCurrencySchema>;
export type AddExchangeRateInput = z.input<typeof addExchangeRateSchema>;
export type UpdateExchangeRateInput = z.input<typeof updateExchangeRateSchema>;
