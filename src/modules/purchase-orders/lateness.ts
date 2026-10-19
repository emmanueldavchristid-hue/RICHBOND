import { businessDaysBetween, dayKeyOf, diffDays } from "@/lib/dates";
import { PO_LATE_STATUSES, type PoStatus } from "./labels";

/**
 * D19-D20 : retards et relances (fichier pur, l'heure est toujours passée en argument : `TEST_NOW` simulable).
 * Jours calendaires pour le retard, jours ouvrés pour les relances.
 */
export const DEFAULT_REMINDER_AFTER_DAYS = 3;
/** Un BC en retard sans relance depuis ce nombre de jours ouvrés est « à relancer ». */
export const LATE_REMINDER_AFTER_DAYS = 2;

type DateLike = Date | string;

/** Date attendue : date promise par le fournisseur, sinon date de livraison demandée (yyyy-MM-dd). */
export function expectedDateOf(po: { promisedDate?: DateLike | null; requestedDate: DateLike }): string {
  return dayKeyOf(po.promisedDate ?? po.requestedDate);
}

/** En retard : statut validé/envoyé/confirmé/partiellement reçu et date attendue strictement avant aujourd'hui (Abidjan). */
export function isLate(po: { status: PoStatus; expectedDate: DateLike }, now: Date): boolean {
  return PO_LATE_STATUSES.includes(po.status) && diffDays(po.expectedDate, now) > 0;
}

/** Jours calendaires de retard (0 si le BC n'est pas en retard). */
export function daysLate(po: { status: PoStatus; expectedDate: DateLike }, now: Date): number {
  return isLate(po, now) ? diffDays(po.expectedDate, now) : 0;
}

/** Statuts sur lesquels une relance fournisseur a un sens. */
export const REMINDABLE_STATUSES: readonly PoStatus[] = ["ENVOYE", "CONFIRME", "PARTIELLEMENT_RECU"];

export interface ReminderCheckInput {
  status: PoStatus;
  sentAt?: DateLike | null;
  lastRemindedAt?: DateLike | null;
  expectedDate: DateLike;
}

const latest = (...ds: (DateLike | null | undefined)[]): string | null => {
  const keys = ds.filter((d): d is DateLike => d !== null && d !== undefined).map(dayKeyOf);
  return keys.length ? keys.reduce((a, b) => (a >= b ? a : b)) : null;
};

/**
 * « À relancer » :
 * - envoyé mais non confirmé depuis `afterDays` jours ouvrés (depuis l'envoi ou la dernière relance) ;
 * - ou en retard sans relance depuis 2 jours ouvrés (depuis la date attendue ou la dernière relance).
 */
export function needsReminder(po: ReminderCheckInput, now: Date, afterDays: number = DEFAULT_REMINDER_AFTER_DAYS): boolean {
  if (!REMINDABLE_STATUSES.includes(po.status)) return false;
  if (po.status === "ENVOYE") {
    const ref = latest(po.sentAt, po.lastRemindedAt);
    if (ref && businessDaysBetween(ref, now) >= afterDays) return true;
  }
  if (isLate({ status: po.status, expectedDate: po.expectedDate }, now)) {
    const ref = latest(po.lastRemindedAt, po.expectedDate);
    if (ref && businessDaysBetween(ref, now) >= LATE_REMINDER_AFTER_DAYS) return true;
  }
  return false;
}
