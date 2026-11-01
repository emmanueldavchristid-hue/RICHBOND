import { diffDays } from "@/lib/dates";
import { MILESTONE_CODES, type MilestoneCode } from "./labels";

/** Jalons du dossier import (LOT-12) : jalon courant et retards. Fonctions pures, dates en `yyyy-MM-dd` (jour d'Abidjan). */

export interface MilestoneDates {
  code: MilestoneCode;
  plannedDate: string | null;
  actualDate: string | null;
}

export interface MilestoneState extends MilestoneDates {
  /** Prévu dépassé et pas encore réalisé : alerte. */
  late: boolean;
  /** Jours de retard en cours (jalon non réalisé) ; 0 sinon. */
  daysLate: number;
  /** Écart constaté entre réel et prévu (positif = réalisé en retard) ; null si l'une des dates manque. */
  slipDays: number | null;
}

export function milestoneState(m: MilestoneDates, today: string): MilestoneState {
  const overdue = !m.actualDate && !!m.plannedDate && m.plannedDate < today;
  return {
    ...m,
    late: overdue,
    daysLate: overdue ? diffDays(m.plannedDate!, today) : 0,
    slipDays: m.plannedDate && m.actualDate ? diffDays(m.plannedDate, m.actualDate) : null,
  };
}

/** Tri chronologique des jalons selon l'ordre officiel. */
export function sortMilestones<T extends { code: MilestoneCode }>(list: T[]): T[] {
  return [...list].sort((a, b) => MILESTONE_CODES.indexOf(a.code) - MILESTONE_CODES.indexOf(b.code));
}

/** Jalon courant = premier jalon (dans l'ordre) sans date réelle ; null quand tout est réalisé. */
export function currentMilestone(list: MilestoneDates[]): MilestoneDates | null {
  return sortMilestones(list).find((m) => !m.actualDate) ?? null;
}
