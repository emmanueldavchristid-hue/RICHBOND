"use server";

import { revalidatePath } from "next/cache";
import { addExchangeRate, addExchangeRateSchema, listCurrencies, listExchangeRates, listRatesSchema, setCurrencyActive, setCurrencyActiveSchema, updateExchangeRate, updateExchangeRateSchema, upsertCurrency, upsertCurrencySchema } from "@/modules/currencies";
import { getClientIp } from "@/modules/auth/ip";
import { withAction } from "@/modules/auth/session";
import { serialize } from "@/modules/referentials/serialize";
import { z } from "zod";

const READ = { writable: false } as const;
const touch = () => revalidatePath("/parametres/devises");

/** Lecture : tout utilisateur connecté. `latestRate.stale` = taux de plus de 30 jours. */
export const listCurrenciesAction = withAction(null, z.object({ activeOnly: z.boolean().optional() }), ({ input }) => listCurrencies(input), READ);

export const listExchangeRatesAction = withAction(null, listRatesSchema, ({ input }) => listExchangeRates(input), READ);

export const upsertCurrencyAction = withAction("settings.manage", upsertCurrencySchema, async ({ user, input }) => {
  const r = await upsertCurrency(user, input, await getClientIp());
  touch();
  return serialize(r);
});

export const setCurrencyActiveAction = withAction("settings.manage", setCurrencyActiveSchema, async ({ user, input }) => {
  const r = await setCurrencyActive(user, input, await getClientIp());
  touch();
  return serialize(r);
});

/** Responsable et Acheteurs (`exchangeRate.manage`). EUR != 655,957 : `confirmEurDeviation: true` requis (code EUR_PARITY_CONFIRM). */
export const addExchangeRateAction = withAction("exchangeRate.manage", addExchangeRateSchema, async ({ user, input }) => {
  const r = await addExchangeRate(user, input, await getClientIp());
  touch();
  return r;
});

export const updateExchangeRateAction = withAction("exchangeRate.manage", updateExchangeRateSchema, async ({ user, input }) => {
  const r = await updateExchangeRate(user, input, await getClientIp());
  touch();
  return r;
});
