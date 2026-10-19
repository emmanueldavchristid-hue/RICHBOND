import { differenceInCalendarDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/** Fonctions pures de l'état de licence (aucun accès base ni horloge). */
const TZ = "Africa/Abidjan";
const DAY_MS = 86_400_000;
const REMINDER_DAYS = [7, 3, 1, 0];

export type StoredLicenseStatus = "TRIAL" | "ACTIVE" | "EXPIRED";
export type LicenseTone = "neutral" | "warning" | "danger";

export interface LicenseLike {
  status: StoredLicenseStatus;
  trialStartsAt: Date;
  trialEndsAt: Date;
  licensedTo?: string | null;
  activatedAt?: Date | null;
}

export interface LicenseState {
  status: StoredLicenseStatus;
  trialStartsAt: Date;
  trialEndsAt: Date;
  msLeft: number;
  daysLeft: number;
  tone: LicenseTone | null;
  isReminderDay: boolean;
  writable: boolean;
  licensedTo: string | null;
  activatedAt: Date | null;
}

export const READ_ONLY_MESSAGE =
  "Période d'essai terminée : l'application est en consultation seule. Contactez Christ-Emmanuel Mouhi pour l'activer.";

const dayKey = (d: Date) => formatInTimeZone(d, TZ, "yyyy-MM-dd");

/** Fin de journée (23:59:59.999) à Abidjan pour une date AAAA-MM-JJ. */
export function endOfDayAbidjan(date: string): Date {
  return fromZonedTime(`${date}T23:59:59.999`, TZ);
}

export function isValidDateString(s: string | undefined | null): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Anti-recul d'horloge : on ne remonte jamais avant la dernière heure observée. */
export function effectiveNow(now: Date, lastSeenAt: Date | null | undefined): Date {
  return lastSeenAt && lastSeenAt > now ? lastSeenAt : now;
}

export function computeLicenseState(license: LicenseLike, now: Date): LicenseState {
  const base = {
    trialStartsAt: license.trialStartsAt,
    trialEndsAt: license.trialEndsAt,
    licensedTo: license.licensedTo ?? null,
    activatedAt: license.activatedAt ?? null,
  };
  if (license.status === "ACTIVE") {
    return { ...base, status: "ACTIVE", msLeft: 0, daysLeft: 0, tone: null, isReminderDay: false, writable: true };
  }
  // TRIAL tant que now < trialEndsAt (strict). Un EXPIRED stocké dont la fin est future redevient TRIAL.
  const msLeft = license.trialEndsAt.getTime() - now.getTime();
  if (msLeft <= 0) {
    return { ...base, status: "EXPIRED", msLeft: 0, daysLeft: 0, tone: "danger", isReminderDay: false, writable: false };
  }
  const daysLeft = Math.max(
    0,
    differenceInCalendarDays(new Date(`${dayKey(license.trialEndsAt)}T00:00:00Z`), new Date(`${dayKey(now)}T00:00:00Z`)),
  );
  const tone: LicenseTone = daysLeft <= 2 ? "danger" : daysLeft <= 7 ? "warning" : "neutral";
  return {
    ...base,
    status: "TRIAL",
    msLeft,
    daysLeft,
    tone,
    isReminderDay: REMINDER_DAYS.includes(daysLeft),
    writable: true,
  };
}

/** Fin d'essai à la création : TRIAL_END_DATE, sinon aujourd'hui + TRIAL_DAYS (1-365, défaut 30). */
export function computeTrialEnd(
  env: Record<string, string | undefined>,
  now: Date,
): { trialEndsAt: Date; warnings: string[] } {
  const warnings: string[] = [];
  const endDate = env.TRIAL_END_DATE?.trim();
  if (endDate) {
    if (isValidDateString(endDate)) return { trialEndsAt: endOfDayAbidjan(endDate), warnings };
    warnings.push("TRIAL_END_DATE invalide (format AAAA-MM-JJ attendu) : valeur ignorée.");
  }
  let days = 30;
  const raw = env.TRIAL_DAYS?.trim();
  if (raw) {
    const n = Number(raw);
    if (/^\d+$/.test(raw) && n >= 1 && n <= 365) days = n;
    else warnings.push("TRIAL_DAYS invalide (entier de 1 à 365) : 30 jours utilisés.");
  }
  const target = new Date(new Date(`${dayKey(now)}T00:00:00Z`).getTime() + days * DAY_MS);
  return { trialEndsAt: endOfDayAbidjan(target.toISOString().slice(0, 10)), warnings };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** `12 j 05 h 32 min`, `5 h 32 min`, `59 min` ; négatif => `0 min`. */
export function formatCountdown(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 60_000);
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  if (d > 0) return `${d} j ${pad(h)} h ${pad(m)} min`;
  if (h > 0) return `${h} h ${pad(m)} min`;
  return `${m} min`;
}

export function formatBadge(state: Pick<LicenseState, "status" | "daysLeft" | "msLeft">): string {
  if (state.status === "ACTIVE") return "";
  if (state.status === "EXPIRED") return "Consultation seule";
  if (state.daysLeft === 0) return `Essai : se termine dans ${formatCountdown(state.msLeft)}`;
  return `Essai : ${state.daysLeft} j restant${state.daysLeft > 1 ? "s" : ""}`;
}

/** Progression de l'essai en pourcentage (0-100). */
export function trialProgress(start: Date, end: Date, now: Date): number {
  const total = end.getTime() - start.getTime();
  if (total <= 0) return 100;
  const p = ((now.getTime() - start.getTime()) / total) * 100;
  return Math.min(100, Math.max(0, Math.round(p)));
}
