import { fromZonedTime } from "date-fns-tz";
import { APP_TZ, dayKeyOf } from "@/lib/dates";

/**
 * Périodes des tableaux de bord (T1). Fonctions pures : l'heure est toujours passée en argument (`TEST_NOW`).
 * Mois = mois calendaire dans le fuseau Africa/Abidjan. Les bornes sont des instants UTC : début inclus, fin exclue.
 */

export interface Period {
  start: Date;
  /** Exclue. */
  endExclusive: Date;
}

export interface MonthComparison {
  /** `yyyy-MM`. */
  month: string;
  previousMonth: string;
  /** Jour d'Abidjan (yyyy-MM-dd) jusqu'auquel le mois courant est observé (inclus). */
  comparedUntil: string;
  current: Period;
  /** Du 1er du mois précédent au même quantième (borné à la longueur de ce mois), inclus. */
  previous: Period;
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** Mois (`yyyy-MM`) d'un instant, à Abidjan. */
export function monthOf(now: Date): string {
  return dayKeyOf(now).slice(0, 7);
}

function parseMonth(month: string): { y: number; m: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error(`Mois invalide : ${month}`);
  return { y: Number(match[1]), m: Number(match[2]) };
}

/** Décale un mois `yyyy-MM` de `delta` mois (négatif = passé). */
export function addMonths(month: string, delta: number): string {
  const { y, m } = parseMonth(month);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

export function previousMonthOf(month: string): string {
  return addMonths(month, -1);
}

export function daysInMonth(month: string): number {
  const { y, m } = parseMonth(month);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Instant correspondant à 00:00 du jour `yyyy-MM-dd` à Abidjan. */
export function startOfDayIso(day: string): Date {
  return fromZonedTime(`${day}T00:00:00`, APP_TZ);
}

/** Lendemain d'un jour `yyyy-MM-dd`. */
export function nextDayIso(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10);
}

/** Mois entier (début inclus, fin = 1er du mois suivant exclu). */
export function monthPeriod(month: string): Period {
  return { start: startOfDayIso(`${month}-01`), endExclusive: startOfDayIso(`${addMonths(month, 1)}-01`) };
}

/**
 * Mois courant jusqu'à aujourd'hui inclus, comparé au mois précédent jusqu'au même quantième (T1) : le 5 du mois,
 * on compare 1-5 contre 1-5, pas contre le mois entier, pour ne pas afficher une fausse baisse en début de mois.
 * Le 31 d'un mois suivant un mois de 30 jours (ou février) : le mois précédent est pris en entier.
 */
export function monthComparison(now: Date): MonthComparison {
  const today = dayKeyOf(now);
  const month = today.slice(0, 7);
  const dayOfMonth = Number(today.slice(8, 10));
  const previousMonth = previousMonthOf(month);
  const prevDay = Math.min(dayOfMonth, daysInMonth(previousMonth));
  return {
    month,
    previousMonth,
    comparedUntil: today,
    current: { start: startOfDayIso(`${month}-01`), endExclusive: startOfDayIso(nextDayIso(today)) },
    previous: {
      start: startOfDayIso(`${previousMonth}-01`),
      endExclusive: startOfDayIso(nextDayIso(`${previousMonth}-${pad(prevDay)}`)),
    },
  };
}

/** Les 12 mois se terminant au mois courant, du plus ancien au plus récent. */
export function lastTwelveMonths(now: Date): string[] {
  const current = monthOf(now);
  return Array.from({ length: 12 }, (_, i) => addMonths(current, i - 11));
}

/** Fenêtre des 12 derniers mois (du 1er du plus ancien mois à la fin du mois courant). */
export function twelveMonthsPeriod(now: Date): Period {
  const months = lastTwelveMonths(now);
  return { start: monthPeriod(months[0]).start, endExclusive: monthPeriod(months[11]).endExclusive };
}

const SHORT_MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** « oct. 25 » : libellé court d'un mois `yyyy-MM`. */
export function monthLabel(month: string): string {
  const { y, m } = parseMonth(month);
  return `${SHORT_MONTHS[m - 1]} ${String(y).slice(2)}`;
}

/** Lundi de la semaine (yyyy-MM-dd) et dimanche, pour « cette semaine » du Magasinier. */
export function weekBounds(now: Date): { monday: string; sunday: string } {
  const today = dayKeyOf(now);
  const dow = new Date(`${today}T00:00:00.000Z`).getUTCDay(); // 0 = dimanche
  const back = dow === 0 ? 6 : dow - 1;
  const monday = new Date(Date.parse(`${today}T00:00:00.000Z`) - back * 86_400_000).toISOString().slice(0, 10);
  const sunday = new Date(Date.parse(`${monday}T00:00:00.000Z`) + 6 * 86_400_000).toISOString().slice(0, 10);
  return { monday, sunday };
}
