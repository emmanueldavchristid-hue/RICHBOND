import { formatDateTime } from "@/lib/dates";

/** « à l'instant », « il y a 2 h », « il y a 3 j » ; au-delà d'une semaine, la date complète JJ/MM/AAAA HH:mm. */
export function relativeTime(date: Date, now: Date = new Date()): string {
  const s = Math.round((now.getTime() - date.getTime()) / 1000);
  if (s < 45) return "à l'instant";
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d < 7) return `il y a ${d} j`;
  return formatDateTime(date);
}
