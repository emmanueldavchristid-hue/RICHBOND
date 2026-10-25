import type { CardTone, GoodDirection } from "./types";

/**
 * Calculs de KPI sur des agrégats déjà calculés par la base (fonctions pures, aucun accès base).
 * Règle : jamais de division par zéro ; une donnée absente donne `null` (affiché « – »), pas 0.
 */

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Variation en % de `current` par rapport à `previous`, 1 décimale ; null si `previous` est nul/absent ou `current` absent. */
export function variationPct(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return round1(((current - previous) / Math.abs(previous)) * 100);
}

/** Moyenne = somme / effectif, 1 décimale ; null si aucun élément. */
export function average(sum: number | null, count: number): number | null {
  if (sum === null || count <= 0) return null;
  return round1(sum / count);
}

/** Taux en % (0-100), 1 décimale ; null si le dénominateur est nul. */
export function ratePct(part: number, total: number): number | null {
  if (total <= 0) return null;
  return round1((part / total) * 100);
}

/** Part en % d'une valeur dans un total (1 décimale) ; 0 si le total est nul. */
export function sharePct(part: number, total: number): number {
  return total > 0 ? round1((part / total) * 100) : 0;
}

export type VariationTone = "good" | "bad" | "neutral";

/** Couleur d'une variation selon le sens métier : une hausse des retards est mauvaise, une hausse des achats est neutre. */
export function variationTone(variation: number | null, good: GoodDirection): VariationTone {
  if (variation === null || variation === 0 || good === "NONE") return "neutral";
  return (variation > 0) === (good === "UP") ? "good" : "bad";
}

/** T6 : 0 reste neutre (jamais rouge) ; sinon le ton demandé. */
export function cardTone(count: number, tone: Exclude<CardTone, "neutral">): CardTone {
  return count > 0 ? tone : "neutral";
}

/** « +12,5 % », « -3 % », « – » (sans comparaison). */
export function formatVariation(v: number | null): string {
  if (v === null) return "–";
  const text = String(Math.abs(v)).replace(".", ",");
  return `${v > 0 ? "+" : v < 0 ? "-" : ""}${text} %`;
}

/** Valeur d'un mois précédent reconstituée à partir de la valeur actuelle et des mouvements du mois (T3). */
export function previousStockValue(currentValue: number, movementsValueSinceMonthStart: number): number {
  return currentValue - movementsValueSinceMonthStart;
}

/** Décompte « à temps » : réceptions avec `daysLate <= 0` sur le total (hors annulées, déjà filtrées en amont). */
export function onTimeRate(onTime: number, total: number): number | null {
  return ratePct(onTime, total);
}
