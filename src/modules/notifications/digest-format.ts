import { formatInTimeZone } from "date-fns-tz";
import { APP_TZ, todayAbidjan } from "@/lib/dates";

export type DigestSlot = "MATIN" | "APRES_MIDI";
export type DigestTone = "critical" | "attention" | "info";

export interface DigestLine {
  label: string;
  count: number;
  /** Chemin interne vers la liste filtrée. */
  href: string;
  tone: DigestTone;
}

export interface DigestContent {
  title: string;
  body: string;
  link: string;
  severity: "INFO" | "IMPORTANT" | "CRITIQUE";
  lines: DigestLine[];
}

export const DIGEST_TYPE = "DIGEST";
export const DIGEST_ENTITY = "digest";
export const DIGEST_LOCK = "richbond-digest";
const SLOT_LABELS: Record<DigestSlot, string> = { MATIN: "8h", APRES_MIDI: "15h" };

/** Créneau déduit de l'heure d'Abidjan (UTC+0, sans heure d'été) : avant midi = MATIN. */
export function slotFor(at: Date): DigestSlot {
  return Number(formatInTimeZone(at, APP_TZ, "H")) < 12 ? "MATIN" : "APRES_MIDI";
}

/** Clé déterministe d'un passage : `2026-10-28-MATIN`. */
export function digestKey(at: Date, slot: DigestSlot): string {
  return `${todayAbidjan(at)}-${slot}`;
}

/**
 * Compose la notification à partir des lignes non nulles.
 * Retourne null si rien à signaler : aucun digest vide n'est créé.
 */
export function composeDigest(lines: DigestLine[], slot: DigestSlot): DigestContent | null {
  const rank: Record<DigestTone, number> = { critical: 0, attention: 1, info: 2 };
  const active = lines.filter((l) => l.count > 0).sort((a, b) => rank[a.tone] - rank[b.tone]);
  if (active.length === 0) return null;
  const critical = active.some((l) => l.tone === "critical");
  const body = active.map((l) => `${l.label} : ${l.count}`).join("\n");
  return {
    title: `Point de ${SLOT_LABELS[slot]} : ${active.length} sujet${active.length > 1 ? "s" : ""} à traiter`,
    body,
    link: active[0].href,
    severity: critical ? "IMPORTANT" : "INFO",
    lines: active,
  };
}
