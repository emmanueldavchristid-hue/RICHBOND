import { Prisma } from "@/generated/prisma/client";
import { formatFcfa, roundFcfa } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { effectiveUnitPrice, unitPriceToXof, type DecimalInput } from "./totals";

/** D14 : contrôle du prix d'une ligne face au dernier prix d'achat de l'article (tous fournisseurs, en FCFA par unité d'achat). */
export const DEFAULT_PRICE_ALERT_PCT = 20;

export interface LastPrice {
  price: DecimalInput;
  currencyCode: string;
  /** FCFA pour 1 unité de devise à la date du prix ; absent pour le FCFA. */
  rateToXof?: DecimalInput | null;
  /** Unité d'achat dans laquelle le prix est exprimé. */
  priceUnit?: string | null;
  date: Date | string;
  supplierCode?: string | null;
  supplierName?: string | null;
}

/** Dernier prix converti en FCFA par unité ; null si la devise n'est pas le FCFA et que le taux de l'époque manque. */
export function lastPriceInXof(last: LastPrice): Prisma.Decimal | null {
  return unitPriceToXof(last.price, last.currencyCode, last.rateToXof ?? null);
}

/** Écart relatif en % (2 décimales, demi-supérieur) ; null si le dernier prix est nul ou inconnu. */
export function priceDeltaPct(newXof: DecimalInput, lastXof: DecimalInput | null): Prisma.Decimal | null {
  if (lastXof === null) return null;
  const last = new Prisma.Decimal(lastXof);
  if (last.lte(0)) return null;
  return new Prisma.Decimal(newXof).minus(last).div(last).mul(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Alerte si l'écart absolu dépasse strictement le seuil (+20,00 % = pas d'alerte, +20,01 % = alerte). */
export function isPriceAlert(deltaPct: DecimalInput | null, thresholdPct: number = DEFAULT_PRICE_ALERT_PCT): boolean {
  if (deltaPct === null) return false;
  return new Prisma.Decimal(deltaPct).abs().gt(thresholdPct);
}

export interface PriceCheckInput {
  unitPrice: DecimalInput;
  discountPct?: DecimalInput;
  currencyCode: string;
  /** Taux du BC (FCFA pour 1 unité de devise) ; null si inconnu. */
  rate?: DecimalInput | null;
  /** Unité d'achat de la ligne. */
  unit: string;
  last: LastPrice | null;
  thresholdPct?: number;
}

export interface PriceCheckResult {
  /** Dernier prix en FCFA entiers par unité d'achat (mémorisé sur la ligne). */
  lastPriceXof: number | null;
  deltaPct: Prisma.Decimal | null;
  alert: boolean;
}

const NONE: PriceCheckResult = { lastPriceXof: null, deltaPct: null, alert: false };

export function checkPrice(i: PriceCheckInput): PriceCheckResult {
  if (!i.last) return NONE;
  if (i.last.priceUnit && i.last.priceUnit !== i.unit) return NONE; // unités différentes : non comparable
  const lastXof = lastPriceInXof(i.last);
  const newXof = unitPriceToXof(effectiveUnitPrice(i.unitPrice, i.discountPct ?? 0), i.currencyCode, i.rate ?? null);
  if (lastXof === null || newXof === null) return NONE;
  const deltaPct = priceDeltaPct(newXof, lastXof);
  return {
    lastPriceXof: roundFcfa(lastXof.toNumber()),
    deltaPct,
    alert: isPriceAlert(deltaPct, i.thresholdPct ?? DEFAULT_PRICE_ALERT_PCT),
  };
}

/** « +32 % vs dernier prix (12 500 FCFA le 03/09/2026, FRS-00012) » */
export function priceAlertMessage(
  deltaPct: DecimalInput,
  last: { lastPriceXof: number; date: Date; supplierCode?: string | null },
): string {
  const d = new Prisma.Decimal(deltaPct);
  const sign = d.isNegative() ? "-" : "+";
  const pct = d.abs().toDecimalPlaces(2).toString().replace(".", ",");
  const where = last.supplierCode ? `, ${last.supplierCode}` : "";
  return `${sign}${pct} % vs dernier prix (${formatFcfa(last.lastPriceXof)} le ${formatDate(last.date)}${where})`;
}
