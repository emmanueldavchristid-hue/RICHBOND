import { Prisma } from "@/generated/prisma/client";
import { formatInTimeZone } from "date-fns-tz";
import { APP_TZ } from "@/lib/dates";

/** R11 : parité fixe XOF/EUR. */
export const EUR_FIXED_RATE = "655.957";
export const RATE_STALE_DAYS = 30;

/** Jour (Africa/Abidjan) de `d`, sous forme 00:00 UTC (valeur d'une colonne DATE). */
export function dayKey(d: Date): Date {
  return new Date(`${formatInTimeZone(d, APP_TZ, "yyyy-MM-dd")}T00:00:00.000Z`);
}

/** Taux « ancien » : plus de 30 jours avant `now` (jour d'Abidjan). */
export function isRateStale(rateDate: Date, now: Date, maxDays = RATE_STALE_DAYS): boolean {
  const days = Math.round((dayKey(now).getTime() - dayKey(rateDate).getTime()) / 86_400_000);
  return days > maxDays;
}

export function isEurParity(rate: string | number | Prisma.Decimal): boolean {
  return new Prisma.Decimal(rate).eq(EUR_FIXED_RATE);
}

/** Écart relatif toléré entre deux taux successifs d'une même devise avant confirmation (20 %). */
export const RATE_DEVIATION_MAX = 0.2;

/** Écart relatif |nouveau - précédent| / précédent. Précédent nul => Infinity. */
export function rateDeviation(previous: string | number | Prisma.Decimal, next: string | number | Prisma.Decimal): number {
  const prev = new Prisma.Decimal(previous);
  if (prev.lte(0)) return Number.POSITIVE_INFINITY;
  return new Prisma.Decimal(next).minus(prev).abs().div(prev).toNumber();
}

export function isRateDeviationAbove(
  previous: string | number | Prisma.Decimal,
  next: string | number | Prisma.Decimal,
  max = RATE_DEVIATION_MAX,
): boolean {
  return rateDeviation(previous, next) > max;
}
