import "server-only";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/errors";
import { now } from "@/lib/clock";
import { Prisma } from "@/generated/prisma/client";
import { log } from "@/modules/audit";
import type { Actor } from "@/modules/referentials/actor";
import { lockFresh } from "@/modules/referentials/concurrency";
import { rethrowUnique } from "@/modules/referentials/db-errors";
import { dayKey, isEurParity, isRateDeviationAbove, isRateStale, RATE_DEVIATION_MAX } from "./rate";
import {
  addExchangeRateSchema,
  listRatesSchema,
  setCurrencyActiveSchema,
  updateExchangeRateSchema,
  upsertCurrencySchema,
  type AddExchangeRateInput,
  type UpdateExchangeRateInput,
  type UpsertCurrencyInput,
} from "./schemas";

type RateDb = Pick<Prisma.TransactionClient, "exchangeRate">;

export interface RateDto {
  id: string;
  currencyCode: string;
  date: Date;
  rate: string;
  note: string | null;
  updatedAt: Date;
}

const toRateDto = (r: {
  id: string;
  currencyCode: string;
  date: Date;
  rate: Prisma.Decimal;
  note: string | null;
  updatedAt: Date;
}): RateDto => ({
  id: r.id,
  currencyCode: r.currencyCode,
  date: r.date,
  rate: r.rate.toString(),
  note: r.note,
  updatedAt: r.updatedAt,
});

export interface CurrencyDto {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  isBase: boolean;
  active: boolean;
  updatedAt: Date;
  latestRate: (RateDto & { stale: boolean }) | null;
}

export async function listCurrencies(opts: { activeOnly?: boolean; at?: Date } = {}): Promise<CurrencyDto[]> {
  const rows = await db.currency.findMany({
    where: opts.activeOnly ? { active: true } : undefined,
    orderBy: [{ isBase: "desc" }, { code: "asc" }],
    include: { rates: { orderBy: { date: "desc" }, take: 1 } },
  });
  const t = opts.at ?? now();
  return rows.map((c) => {
    const r = c.rates[0];
    return {
      code: c.code,
      name: c.name,
      symbol: c.symbol,
      decimals: c.decimals,
      isBase: c.isBase,
      active: c.active,
      updatedAt: c.updatedAt,
      latestRate: r ? { ...toRateDto(r), stale: isRateStale(r.date, t) } : null,
    };
  });
}

export async function listExchangeRates(raw: { currencyCode: string; limit?: number }): Promise<RateDto[]> {
  const input = listRatesSchema.parse(raw);
  const rows = await db.exchangeRate.findMany({
    where: { currencyCode: input.currencyCode },
    orderBy: { date: "desc" },
    take: input.limit,
  });
  return rows.map(toRateDto);
}

/** Les devises n'ont pas de version côté écran (réglage idempotent) : on sérialise les écritures concurrentes. */
async function lockCurrency(tx: Prisma.TransactionClient, code: string) {
  await tx.$queryRaw`SELECT code FROM currencies WHERE code = ${code} FOR UPDATE`;
}

export async function upsertCurrency(actor: Actor, raw: UpsertCurrencyInput, ip?: string | null) {
  const input = upsertCurrencySchema.parse(raw);
  return db.$transaction(async (tx) => {
    await lockCurrency(tx, input.code);
    const before = await tx.currency.findUnique({ where: { code: input.code } });
    if (before?.isBase) {
      throw new BusinessError("BASE_CURRENCY", "Le FCFA (XOF) est la devise de base : elle ne se modifie pas.");
    }
    const after = before
      ? await tx.currency.update({
          where: { code: input.code },
          data: { name: input.name, symbol: input.symbol, decimals: input.decimals },
        })
      : await tx.currency.create({
          data: {
            code: input.code,
            name: input.name,
            symbol: input.symbol,
            decimals: input.decimals,
            createdById: actor.id,
          },
        });
    await log(tx, {
      userId: actor.id, ip,
      action: before ? "CURRENCY_UPDATE" : "CURRENCY_CREATE",
      entity: "Currency",
      entityId: after.code,
      before: before ?? undefined,
      after,
    });
    return after;
  });
}

/** R12 : XOF non désactivable ; devise utilisée par un fournisseur non bloqué non désactivable. */
export async function setCurrencyActive(actor: Actor, raw: { code: string; active: boolean }, ip?: string | null) {
  const input = setCurrencyActiveSchema.parse(raw);
  return db.$transaction(async (tx) => {
    await lockCurrency(tx, input.code);
    const before = await tx.currency.findUnique({ where: { code: input.code } });
    if (!before) throw new BusinessError("NOT_FOUND", "Devise introuvable.");
    if (before.active === input.active) return before;
    if (!input.active) {
      if (before.isBase) {
        throw new BusinessError("BASE_CURRENCY", "Le FCFA (XOF) est la devise de base : il ne peut pas être désactivé.");
      }
      const n = await tx.supplier.count({ where: { currencyCode: input.code, status: { not: "BLOQUE" } } });
      if (n > 0) {
        throw new BusinessError(
          "CURRENCY_IN_USE",
          `Impossible de désactiver ${input.code} : ${n} fournisseur(s) actif(s) l'utilisent par défaut.`,
        );
      }
    }
    const after = await tx.currency.update({ where: { code: input.code }, data: { active: input.active } });
    await log(tx, {
      userId: actor.id, ip,
      action: "CURRENCY_ACTIVE",
      entity: "Currency",
      entityId: after.code,
      before: { active: before.active },
      after: { active: after.active },
    });
    return after;
  });
}

const DEVIATION_PCT = Math.round(RATE_DEVIATION_MAX * 100);

/**
 * R11 : EUR hors parité fixe, ou toute devise à plus de 20 % du dernier taux connu : confirmation explicite.
 * `previous` = dernier taux de la devise à la date saisie (hors le taux modifié).
 */
function assertRateRules(currencyCode: string, rate: string, previous: Prisma.Decimal | null, confirm: boolean) {
  if (confirm) return;
  if (currencyCode === "EUR" && !isEurParity(rate)) {
    throw new BusinessError(
      "EUR_PARITY_CONFIRM",
      "Le taux EUR/FCFA est fixe (655,957). Confirmez pour enregistrer une valeur différente.",
    );
  }
  if (previous && isRateDeviationAbove(previous, rate)) {
    throw new BusinessError(
      "RATE_DEVIATION_CONFIRM",
      `Ce taux s'écarte de plus de ${DEVIATION_PCT} % du dernier taux connu (${previous.toString()}). Confirmez pour l'enregistrer.`,
    );
  }
}

async function previousRate(tx: Prisma.TransactionClient, currencyCode: string, date: Date, excludeId?: string) {
  const r = await tx.exchangeRate.findFirst({
    where: { currencyCode, date: { lte: date }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    orderBy: { date: "desc" },
  });
  return r?.rate ?? null;
}

export async function addExchangeRate(actor: Actor, raw: AddExchangeRateInput, ip?: string | null, at: Date = now()) {
  const input = addExchangeRateSchema.parse(raw);
  const date = new Date(`${input.date}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new BusinessError("VALIDATION", "Date invalide.");
  if (date.getTime() > dayKey(at).getTime()) {
    throw new BusinessError("RATE_FUTURE", "La date du taux ne peut pas être dans le futur.");
  }
  const confirm = input.confirmDeviation || input.confirmEurDeviation;
  try {
    return await db.$transaction(async (tx) => {
      const cur = await tx.currency.findUnique({ where: { code: input.currencyCode } });
      if (!cur) throw new BusinessError("NOT_FOUND", "Devise introuvable.");
      if (cur.isBase) throw new BusinessError("BASE_CURRENCY", "Le FCFA (XOF) est la devise de base : aucun taux à saisir.");
      if (!cur.active) throw new BusinessError("CURRENCY_INACTIVE", "Cette devise est désactivée.");
      assertRateRules(cur.code, input.rate, await previousRate(tx, cur.code, date), confirm);
      const created = await tx.exchangeRate.create({
        data: { currencyCode: cur.code, date, rate: input.rate, note: input.note, createdById: actor.id },
      });
      await log(tx, {
        userId: actor.id, ip,
        action: "EXCHANGE_RATE_CREATE",
        entity: "ExchangeRate",
        entityId: created.id,
        after: created,
      });
      return toRateDto(created);
    });
  } catch (e) {
    return rethrowUnique(e, {
      currency_code: new BusinessError("RATE_EXISTS", "Un taux existe déjà pour cette devise à cette date. Modifiez-le."),
    });
  }
}

export async function updateExchangeRate(actor: Actor, raw: UpdateExchangeRateInput, ip?: string | null) {
  const input = updateExchangeRateSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const before = await tx.exchangeRate.findUnique({ where: { id: input.id } });
    if (!before) throw new BusinessError("NOT_FOUND", "Taux introuvable.");
    await lockFresh(tx, "exchange_rates", before.id, input.expectedUpdatedAt);
    assertRateRules(
      before.currencyCode,
      input.rate,
      await previousRate(tx, before.currencyCode, before.date, before.id),
      input.confirmDeviation || input.confirmEurDeviation,
    );
    const after = await tx.exchangeRate.update({
      where: { id: before.id },
      data: { rate: input.rate, note: input.note },
    });
    await log(tx, {
      userId: actor.id, ip,
      action: "EXCHANGE_RATE_UPDATE",
      entity: "ExchangeRate",
      entityId: after.id,
      before,
      after,
    });
    return toRateDto(after);
  });
}

/**
 * R11 : dernier taux <= date (jour d'Abidjan). XOF = 1. Aucun taux => RATE_MISSING.
 * À appeler dans la transaction qui fige le taux (BC, facture, dossier import).
 */
export async function getRateAt(tx: RateDb, currencyCode: string, date: Date = now()) {
  const code = currencyCode.toUpperCase();
  const day = dayKey(date);
  if (code === "XOF") return { rate: new Prisma.Decimal(1), rateDate: day, stale: false };
  const r = await tx.exchangeRate.findFirst({
    where: { currencyCode: code, date: { lte: day } },
    orderBy: { date: "desc" },
  });
  if (!r) {
    throw new BusinessError(
      "RATE_MISSING",
      `Aucun taux de change ${code} disponible à cette date : saisissez-le dans Paramètres > Devises.`,
    );
  }
  return { rate: r.rate, rateDate: r.date, stale: isRateStale(r.date, date) };
}
