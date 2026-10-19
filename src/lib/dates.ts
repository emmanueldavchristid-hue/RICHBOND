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

/** Jour courant à Abidjan au format ISO court (yyyy-MM-dd). */
export function todayAbidjan(now: Date = new Date()): string {
  return formatInTimeZone(now, APP_TZ, "yyyy-MM-dd");
}

/** JJ/MM/AAAA d'une date « jour seul » (stockée à minuit UTC, ex. date de besoin) : aucun décalage de fuseau. */
export function formatDateOnly(d: Date): string {
  return formatInTimeZone(d, "UTC", "dd/MM/yyyy");
}

// ------------------------------------------------------------------ LOT-05 : ancienneté et jours ouvrés

const DAY_MS = 86_400_000;

/** Jour calendaire (yyyy-MM-dd, fuseau Abidjan) d'un instant ; une chaîne ISO déjà « jour seul » est renvoyée telle quelle. */
export function dayKeyOf(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return formatInTimeZone(d, APP_TZ, "yyyy-MM-dd");
}

function utcMs(iso: string): number {
  return Date.parse(`${iso}T00:00:00.000Z`);
}

/** Différence en jours calendaires entre deux jours (`to` - `from`), négative si `to` précède `from`. */
export function diffDays(from: Date | string, to: Date | string): number {
  return Math.round((utcMs(dayKeyOf(to)) - utcMs(dayKeyOf(from))) / DAY_MS);
}

/** Ancienneté en jours calendaires (jours d'Abidjan), jamais négative : « depuis 3 j ». */
export function ageInDays(from: Date | string, now: Date = new Date()): number {
  return Math.max(0, diffDays(from, now));
}

/**
 * Jours ouvrés (lundi-vendredi) écoulés après `from` jusqu'à `to` inclus : du lundi au mardi = 1.
 * Jours fériés non gérés (H8). Négatif ou nul si `to` n'est pas après `from`.
 */
export function businessDaysBetween(from: Date | string, to: Date | string): number {
  const start = utcMs(dayKeyOf(from));
  const end = utcMs(dayKeyOf(to));
  let count = 0;
  for (let t = start + DAY_MS; t <= end; t += DAY_MS) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) count += 1;
  }
  return count;
}

export type AgeSeverity = "normal" | "warning" | "critical";

/** D21 : orange à partir de 2 jours ouvrés, rouge à partir de 5. */
export function ageSeverity(from: Date | string, now: Date = new Date()): AgeSeverity {
  const days = businessDaysBetween(from, now);
  return days >= 5 ? "critical" : days >= 2 ? "warning" : "normal";
}

/** Instant (UTC) correspondant à midi ce jour-là à Abidjan (jour saisi sans heure : envoi, relance). */
export function noonAbidjan(iso: string): Date {
  return fromZonedTime(`${iso.slice(0, 10)}T12:00:00`, APP_TZ);
}
