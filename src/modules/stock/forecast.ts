import { Decimal, toDecimal, type DecimalInput } from "./pmp";
import type { CoverageSeverity } from "./labels";
import type { ItemForecast } from "./types";

/**
 * Prévision de rupture, seuils suggérés (K6). Fonctions pures : aucune base, aucune horloge (le jour courant est passé
 * en argument, `yyyy-MM-dd` à Abidjan). Quantités en Decimal, jamais de flottant pour une quantité.
 */

/** Coefficient de stock de sécurité selon la criticité de l'article. */
export const SAFETY_COEFFICIENTS: Record<string, number> = { CRITIQUE: 1, IMPORTANT: 0.5, STANDARD: 0.25 };

const DAY_MS = 86_400_000;

export function addDaysIso(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Consommation moyenne journalière = sorties nettes de la fenêtre / nombre de jours (jamais négative). */
export function averageDailyConsumption(netIssuedQty: DecimalInput, windowDays: number): Decimal {
  if (!(windowDays > 0)) return new Decimal(0);
  const q = toDecimal(netIssuedQty);
  if (q.lte(0)) return new Decimal(0);
  return q.div(windowDays).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
}

/**
 * Couverture en jours (1 décimale). Sans consommation : null (inconnue). Stock nul ou négatif avec consommation : 0.
 */
export function coverageDays(onHand: DecimalInput, dailyConsumption: DecimalInput): number | null {
  const daily = toDecimal(dailyConsumption);
  if (daily.lte(0)) return null;
  const stock = toDecimal(onHand);
  if (stock.lte(0)) return 0;
  return stock.div(daily).toDecimalPlaces(1, Decimal.ROUND_DOWN).toNumber();
}

/** Date de rupture prévue = aujourd'hui + couverture (jours entiers). Null si la couverture est inconnue. */
export function stockoutDate(todayIso: string, coverage: number | null): string | null {
  return coverage === null ? null : addDaysIso(todayIso, Math.floor(coverage));
}

/** Rouge si couverture < délai, orange si < 2 x délai, vert sinon ; null si couverture inconnue. */
export function coverageSeverity(coverage: number | null, leadTimeDays: number): CoverageSeverity | null {
  if (coverage === null) return null;
  if (coverage < leadTimeDays) return "ROUGE";
  if (coverage < 2 * leadTimeDays) return "ORANGE";
  return "VERT";
}

/** Délai effectif : article, sinon fournisseur principal, sinon défaut des réglages. */
export function effectiveLeadTime(p: { item?: number | null; supplier?: number | null; fallback: number }): number {
  const ok = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
  if (ok(p.item)) return p.item;
  if (ok(p.supplier)) return p.supplier;
  return p.fallback;
}

/** Arrondi à l'entier supérieur (prudence : jamais sous-estimer un seuil) ; 0 si la valeur est nulle. */
export function ceilQty(x: DecimalInput): Decimal {
  const d = toDecimal(x);
  return d.lte(0) ? new Decimal(0) : d.toDecimalPlaces(6, Decimal.ROUND_HALF_UP).ceil();
}

function safetyRaw(daily: DecimalInput, leadTimeDays: number, criticality: string): Decimal {
  const coef = SAFETY_COEFFICIENTS[criticality] ?? SAFETY_COEFFICIENTS.STANDARD;
  return toDecimal(daily).mul(leadTimeDays).mul(coef);
}

/** Stock de sécurité suggéré = conso x délai x coefficient de criticité (Critique 1 ; Important 0,5 ; Standard 0,25), arrondi au supérieur. */
export function suggestedSafetyStock(daily: DecimalInput, leadTimeDays: number, criticality: string): Decimal {
  return ceilQty(safetyRaw(daily, leadTimeDays, criticality));
}

/** Point de commande suggéré = conso x délai + stock de sécurité, arrondi au supérieur. */
export function suggestedReorderPoint(daily: DecimalInput, leadTimeDays: number, criticality: string): Decimal {
  return ceilQty(toDecimal(daily).mul(leadTimeDays).add(safetyRaw(daily, leadTimeDays, criticality)));
}

/** Dormant : en stock (> 0) et aucun mouvement depuis `days` jours (ou aucun mouvement du tout). */
export function isDormant(onHand: DecimalInput, lastMovementAt: Date | null, now: Date, days: number): boolean {
  if (toDecimal(onHand).lte(0)) return false;
  if (!lastMovementAt) return true;
  return now.getTime() - lastMovementAt.getTime() > days * DAY_MS;
}

export interface ForecastInput {
  itemId: string;
  onHand: DecimalInput;
  onOrder: DecimalInput;
  /** Sorties nettes (contre-passations déduites) sur la fenêtre, unité de stock, positive. */
  netIssued: DecimalInput;
  windowDays: number;
  leadTimeDays: number;
  criticality: string;
  /** Valeurs saisies sur la fiche article (null = non renseigné). */
  safetyStock: DecimalInput | null;
  reorderPoint: DecimalInput | null;
  todayIso: string;
  /** Plus proche date de livraison attendue des BC ouverts. */
  nextDeliveryIso: string | null;
}

export function computeForecast(i: ForecastInput): ItemForecast {
  const onHand = toDecimal(i.onHand);
  const onOrder = toDecimal(i.onOrder);
  const position = onHand.add(onOrder);
  const daily = averageDailyConsumption(i.netIssued, i.windowDays);
  const coverage = coverageDays(onHand, daily);
  const out = stockoutDate(i.todayIso, coverage);
  const sSafety = suggestedSafetyStock(daily, i.leadTimeDays, i.criticality);
  const sRop = suggestedReorderPoint(daily, i.leadTimeDays, i.criticality);
  const safety = i.safetyStock === null ? sSafety : toDecimal(i.safetyStock);
  const rop = i.reorderPoint === null ? sRop : toDecimal(i.reorderPoint);
  const delivery = i.nextDeliveryIso === null ? null : i.nextDeliveryIso < i.todayIso ? i.todayIso : i.nextDeliveryIso;
  return {
    itemId: i.itemId,
    onHand: onHand.toString(),
    onOrder: onOrder.toString(),
    position: position.toString(),
    avgDailyConsumption: daily.toString(),
    coverageDays: coverage,
    stockoutDate: out,
    leadTimeDays: i.leadTimeDays,
    suggestedSafetyStock: sSafety.toString(),
    suggestedReorderPoint: sRop.toString(),
    safetyStock: safety.toString(),
    reorderPoint: rop.toString(),
    nextDeliveryDate: delivery,
    ruptureBeforeDelivery: ruptureBeforeDelivery(out, delivery),
    severity: coverageSeverity(coverage, i.leadTimeDays),
    belowReorderPoint: rop.gt(0) && position.lte(rop),
  };
}

/** Alerte : rupture prévue avant la prochaine livraison (ou aucune livraison attendue alors qu'une rupture est prévue). */
export function ruptureBeforeDelivery(stockout: string | null, nextDelivery: string | null): boolean {
  if (stockout === null) return false;
  if (nextDelivery === null) return true;
  return stockout < nextDelivery;
}
