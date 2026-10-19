import { expectedDateOf } from "./lateness";

/** Colonne `expectedDate` : date promise, sinon date demandée. */
export function expectedDateColumn(po: { promisedDate?: Date | null; requestedDate: Date }): Date {
  return new Date(`${expectedDateOf(po)}T00:00:00.000Z`);
}

/** Date jour seul (colonne DATE) depuis `yyyy-MM-dd`. */
export const dateOnly = (iso: string): Date => new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
export const isoDay = (d: Date): string => d.toISOString().slice(0, 10);
