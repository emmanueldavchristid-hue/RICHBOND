import { Decimal, roundQty, toDecimal, type DecimalInput } from "@/modules/stock/pmp";

/**
 * Règles pures des inventaires (LOT-11, EX-32) : sélection tournante, écarts, seuils, fiabilité, transitions.
 * Aucun accès base, aucun flottant pour l'argent.
 */

// ------------------------------------------------------------------ statuts

export type InventoryStatus = "PREPARE" | "EN_COMPTAGE" | "A_VALIDER" | "VALIDE" | "ANNULE";

const TRANSITIONS: Record<InventoryStatus, InventoryStatus[]> = {
  PREPARE: ["EN_COMPTAGE", "ANNULE"],
  EN_COMPTAGE: ["A_VALIDER", "ANNULE"],
  A_VALIDER: ["VALIDE", "EN_COMPTAGE", "ANNULE"],
  VALIDE: [],
  ANNULE: [],
};

export function canTransition(from: InventoryStatus, to: InventoryStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export const OPEN_STATUSES: InventoryStatus[] = ["PREPARE", "EN_COMPTAGE", "A_VALIDER"];

// ------------------------------------------------------------------ sélection tournante

export type SelectionReason = "CLASSE_A" | "CLASSE_B" | "CLASSE_C" | "ECART_RECENT" | "AJOUT_MANUEL" | "COMPLET";

/** Périodicité (jours) : A mensuel, B trimestriel, C semestriel. Sans classe ABC : traité comme C. */
export const CADENCE_DAYS = { A: 30, B: 91, C: 182 } as const;
/** Un écart constaté dans les N derniers jours remet l'article dans la liste. */
export const RECENT_VARIANCE_DAYS = 60;
/** ... sauf s'il a déjà été recompté depuis moins de N jours (évite de recompter chaque semaine). */
export const RECENT_VARIANCE_MIN_GAP_DAYS = 7;
export const DEFAULT_WEEKLY_CAP = 60;

const DAY_MS = 86_400_000;
const daysBetween = (from: Date, to: Date) => Math.floor((to.getTime() - from.getTime()) / DAY_MS);

export interface SelectionItem {
  itemId: string;
  abcClass: string | null;
  /** Dernier comptage VALIDÉ de l'article dans ce dépôt. */
  lastCountedAt: Date | null;
  /** Date d'un écart constaté lors du dernier inventaire validé (null si aucun écart). */
  lastVarianceAt: Date | null;
}

export interface SelectionCandidate {
  itemId: string;
  reason: SelectionReason;
  /** Jours de retard sur la périodicité (grand = prioritaire). */
  overdueDays: number;
}

const REASON_RANK: Record<SelectionReason, number> = { ECART_RECENT: 0, CLASSE_A: 1, CLASSE_B: 2, CLASSE_C: 3, AJOUT_MANUEL: 4, COMPLET: 5 };

export function classCadence(abcClass: string | null): { cls: "A" | "B" | "C"; days: number } {
  const c = abcClass === "A" || abcClass === "B" ? abcClass : "C";
  return { cls: c, days: CADENCE_DAYS[c] };
}

/**
 * Liste proposée pour la semaine : articles dont la périodicité est échue + articles à écart récent.
 * Tri : écart récent, puis classe A, B, C, puis les plus en retard ; plafonnée à `cap` (charge de la semaine).
 * Les articles jamais comptés sont les plus prioritaires de leur classe.
 */
export function selectRotating(
  items: SelectionItem[],
  at: Date,
  opts: { cap?: number; excludeItemIds?: Iterable<string> } = {},
): SelectionCandidate[] {
  const exclude = new Set(opts.excludeItemIds ?? []);
  const out: SelectionCandidate[] = [];
  for (const it of items) {
    if (exclude.has(it.itemId)) continue;
    const { cls, days } = classCadence(it.abcClass);
    const since = it.lastCountedAt ? daysBetween(it.lastCountedAt, at) : Number.POSITIVE_INFINITY;
    const recentVariance = !!it.lastVarianceAt && daysBetween(it.lastVarianceAt, at) <= RECENT_VARIANCE_DAYS;
    if (recentVariance && since >= RECENT_VARIANCE_MIN_GAP_DAYS) {
      out.push({ itemId: it.itemId, reason: "ECART_RECENT", overdueDays: Number.isFinite(since) ? since : 100_000 });
    } else if (since >= days) {
      out.push({
        itemId: it.itemId,
        reason: `CLASSE_${cls}` as SelectionReason,
        overdueDays: Number.isFinite(since) ? since - days : 100_000,
      });
    }
  }
  out.sort((a, b) => REASON_RANK[a.reason] - REASON_RANK[b.reason] || b.overdueDays - a.overdueDays || a.itemId.localeCompare(b.itemId));
  return out.slice(0, opts.cap ?? DEFAULT_WEEKLY_CAP);
}

// ------------------------------------------------------------------ écarts

export interface Thresholds {
  /** % de la quantité théorique. */
  pct: DecimalInput;
  /** FCFA entiers. */
  value: number;
}

export interface VarianceResult {
  /** Quantité comptée - théorique (signée). */
  quantity: Decimal;
  /** Valeur de l'écart au PMP, FCFA entiers signés. */
  value: number;
  /** Écart en % du théorique (valeur absolue) ; null si théorique nul et écart non nul (infini). */
  pct: Decimal | null;
  exceedsThreshold: boolean;
}

export function varianceValue(variance: DecimalInput, pmp: DecimalInput): number {
  const v = toDecimal(variance).mul(toDecimal(pmp)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  return v === 0 ? 0 : v;
}

/**
 * Écart d'une ligne. Dépasse le seuil si |écart| > pct % du théorique OU |valeur| > seuil FCFA.
 * Théorique nul avec comptage non nul : dépasse (écart infini en %). Écart nul : jamais.
 */
export function computeVariance(
  theoretical: DecimalInput,
  counted: DecimalInput,
  pmp: DecimalInput,
  thresholds: Thresholds,
): VarianceResult {
  const th = roundQty(theoretical);
  const quantity = roundQty(counted).sub(th);
  const value = varianceValue(quantity, pmp);
  if (quantity.isZero()) return { quantity, value: 0, pct: new Decimal(0), exceedsThreshold: false };
  const pct = th.isZero() ? null : quantity.abs().div(th.abs()).mul(100);
  const overPct = pct === null || pct.gt(toDecimal(thresholds.pct));
  const overValue = Math.abs(value) > thresholds.value;
  return { quantity, value, pct, exceedsThreshold: overPct || overValue };
}

/** Quantité retenue pour une ligne : le recomptage remplace le premier comptage. */
export function finalQuantity(line: { countedQty: DecimalInput | null; recountQty: DecimalInput | null }): Decimal | null {
  if (line.recountQty !== null && line.recountQty !== undefined) return roundQty(line.recountQty);
  if (line.countedQty !== null && line.countedQty !== undefined) return roundQty(line.countedQty);
  return null;
}

/** Faut-il demander un recomptage ? Premier comptage au-dessus du seuil et pas encore recompté. */
export function needsRecount(
  line: { theoreticalQty: DecimalInput; pmp: DecimalInput; countedQty: DecimalInput; recountQty: DecimalInput | null },
  thresholds: Thresholds,
): boolean {
  if (line.recountQty !== null && line.recountQty !== undefined) return false;
  return computeVariance(line.theoreticalQty, line.countedQty, line.pmp, thresholds).exceedsThreshold;
}

/** Fiabilité du stock = % d'articles sans écart (arrondi à 2 décimales). 100 si rien n'a été compté. */
export function reliabilityPct(variances: DecimalInput[]): Decimal {
  if (variances.length === 0) return new Decimal(100);
  const exact = variances.filter((v) => toDecimal(v).isZero()).length;
  return new Decimal(exact).div(variances.length).mul(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export const MIN_REASON_LENGTH = 3;

/** Lignes dont le motif manque alors que l'écart final dépasse le seuil. */
export function linesMissingReason<T extends { id: string; exceedsThreshold: boolean; varianceReason: string | null }>(lines: T[]): T[] {
  return lines.filter((l) => l.exceedsThreshold && (l.varianceReason ?? "").trim().length < MIN_REASON_LENGTH);
}

/**
 * Quantité de l'ajustement à passer en stock : quantité retenue - stock actuel.
 * (= l'écart au théorique figé lorsqu'aucun mouvement n'est intervenu depuis l'ouverture.)
 */
export function adjustmentQuantity(finalQty: DecimalInput, currentStock: DecimalInput): Decimal {
  return roundQty(finalQty).sub(roundQty(currentStock));
}
