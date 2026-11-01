import { z } from "zod";
import { todayAbidjan } from "@/lib/dates";
import { addMonths, daysInMonth, monthPeriod, nextDayIso, startOfDayIso, weekBounds, type Period } from "./period";
import type { ReportKind } from "./report-types";

/**
 * Périodes et filtres des rapports (LOT-15). Fonctions pures : l'heure est passée en argument.
 * Quotidien = un jour ; hebdomadaire = semaine du lundi au dimanche contenant le jour choisi ; mensuel = mois calendaire.
 * Tout est en jours d'Abidjan (UTC+0, sans changement d'heure).
 */
export interface ReportPeriod {
  kind: ReportKind;
  /** Premier et dernier jour inclus (`yyyy-MM-dd`). */
  from: string;
  to: string;
  /** Nombre de jours de la période. */
  days: number;
  period: Period;
  /** Période précédente de même nature (jour / semaine / mois précédent). */
  previous: { from: string; to: string; period: Period };
  label: string;
}

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

const frDate = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00.000Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

const dayPeriod = (from: string, to: string): Period => ({ start: startOfDayIso(from), endExclusive: startOfDayIso(nextDayIso(to)) });

/** « Novembre 2026 ». */
export function monthTitle(month: string): string {
  const name = MONTHS[Number(month.slice(5, 7)) - 1];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${month.slice(0, 4)}`;
}

export function resolveReportPeriod(kind: ReportKind, input: { date?: string; month?: string }, now: Date): ReportPeriod {
  const today = todayAbidjan(now);
  if (kind === "quotidien") {
    const d = input.date ?? today;
    const prev = addDays(d, -1);
    return {
      kind,
      from: d,
      to: d,
      days: 1,
      period: dayPeriod(d, d),
      previous: { from: prev, to: prev, period: dayPeriod(prev, prev) },
      label: frDate(d),
    };
  }
  if (kind === "hebdomadaire") {
    const { monday, sunday } = weekBounds(new Date(`${input.date ?? today}T12:00:00.000Z`));
    const pm = addDays(monday, -7);
    const ps = addDays(sunday, -7);
    return {
      kind,
      from: monday,
      to: sunday,
      days: 7,
      period: dayPeriod(monday, sunday),
      previous: { from: pm, to: ps, period: dayPeriod(pm, ps) },
      label: `Semaine du ${frDate(monday)} au ${frDate(sunday)}`,
    };
  }
  const month = input.month ?? today.slice(0, 7);
  const prevMonth = addMonths(month, -1);
  const last = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const prevLast = `${prevMonth}-${String(daysInMonth(prevMonth)).padStart(2, "0")}`;
  return {
    kind,
    from: `${month}-01`,
    to: last,
    days: daysInMonth(month),
    period: monthPeriod(month),
    previous: { from: `${prevMonth}-01`, to: prevLast, period: monthPeriod(prevMonth) },
    label: monthTitle(month),
  };
}

// ------------------------------------------------------------------ filtres (Zod)

const isRealDay = (s: string): boolean => {
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/** Chaîne vide ou absente => undefined (un formulaire GET envoie des champs vides). */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema.optional());

export const REPORT_CATEGORIES = ["MATIERE_PREMIERE", "INTRANT", "PDR", "FOURNITURE", "SERVICE"] as const;

export const reportQuerySchema = z.object({
  date: optional(z.string().refine(isRealDay, "Date invalide (JJ/MM/AAAA).")),
  month: optional(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mois invalide.")),
  category: optional(z.enum(REPORT_CATEGORIES, { error: "Catégorie inconnue." })),
  buyerId: optional(z.string().min(1).max(64)),
  supplierId: optional(z.string().min(1).max(64)),
  warehouseId: optional(z.string().min(1).max(64)),
});
export type ReportQuery = z.output<typeof reportQuerySchema>;

/** Jours écoulés de la période à la date `today` (bornes incluses, au moins 1, au plus la durée) : base des taux annualisés. */
export function elapsedDays(period: Pick<ReportPeriod, "from" | "to" | "days">, today: string): number {
  if (today >= period.to) return period.days;
  if (today < period.from) return 1;
  const diff = Math.round((Date.parse(`${today}T00:00:00.000Z`) - Date.parse(`${period.from}T00:00:00.000Z`)) / 86_400_000) + 1;
  return Math.max(1, Math.min(period.days, diff));
}
