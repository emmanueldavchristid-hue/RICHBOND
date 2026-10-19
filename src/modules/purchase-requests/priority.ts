import { BusinessError } from "@/lib/errors";
import type { PrUrgency } from "./labels";

/** D5 : 0 arrêt de production, 1 urgente, 2 normale (tri croissant). */
export function priorityOf(urgency: PrUrgency): 0 | 1 | 2 {
  return urgency === "ARRET_PRODUCTION" ? 0 : urgency === "URGENTE" ? 1 : 2;
}

export interface SortableRequest {
  priority: number;
  neededBy: Date | string;
  submittedAt?: Date | string | null;
}

const ms = (d: Date | string | null | undefined, fallback: number) => (d ? new Date(d).getTime() : fallback);

/** Tri par défaut de toutes les listes : priorité, puis date de besoin, puis date de soumission (les non soumises en dernier). */
export function compareRequests(a: SortableRequest, b: SortableRequest): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  const na = ms(a.neededBy, 0);
  const nb = ms(b.neededBy, 0);
  if (na !== nb) return na - nb;
  return ms(a.submittedAt, Number.POSITIVE_INFINITY) - ms(b.submittedAt, Number.POSITIVE_INFINITY);
}

/** « 2026-11-12 » -> Date UTC minuit (colonne DATE). */
export function dateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Date de besoin au format ISO court. */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Refuse une date de besoin antérieure à aujourd'hui (jour Abidjan, ISO `yyyy-MM-dd`). */
export function assertNeededByNotPast(neededBy: string, today: string): void {
  if (neededBy < today) {
    throw new BusinessError("NEEDED_BY_PAST", "La date de besoin ne peut pas être dans le passé.");
  }
}

/** Arrêt de production : date de besoin = aujourd'hui par défaut. */
export function resolveNeededBy(urgency: PrUrgency, neededBy: string | null | undefined, today: string): string | null {
  if (neededBy) return neededBy;
  return urgency === "ARRET_PRODUCTION" ? today : null;
}

export const STOP_REASON_MIN = 10;
