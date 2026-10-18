import { addDays, getDay } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

export const APP_TZ = "Africa/Abidjan";

/** JJ/MM/AAAA dans le fuseau Africa/Abidjan. */
export function formatDate(d: Date): string {
  return formatInTimeZone(d, APP_TZ, "dd/MM/yyyy");
}

/** JJ/MM/AAAA HH:mm dans le fuseau Africa/Abidjan. */
export function formatDateTime(d: Date): string {
  return formatInTimeZone(d, APP_TZ, "dd/MM/yyyy HH:mm");
}

/** Année civile dans le fuseau de l'application (sert à la numérotation). */
export function currentYear(now: Date = new Date()): number {
  return Number(formatInTimeZone(now, APP_TZ, "yyyy"));
}

/** Instant (UTC) correspondant à 00:00 du jour de `d` à Abidjan. */
export function startOfDayAbidjan(d: Date = new Date()): Date {
  return fromZonedTime(`${formatInTimeZone(d, APP_TZ, "yyyy-MM-dd")}T00:00:00`, APP_TZ);
}

/** Ajoute des jours ouvrés (lundi-vendredi). Jours fériés non gérés (H8). */
export function addBusinessDays(d: Date, days: number): Date {
  let cursor = toZonedTime(d, APP_TZ);
  let left = Math.abs(days);
  const step = days < 0 ? -1 : 1;
  while (left > 0) {
    cursor = addDays(cursor, step);
    const dow = getDay(cursor);
    if (dow !== 0 && dow !== 6) left -= 1;
  }
  return fromZonedTime(cursor, APP_TZ);
}
