import { Decimal, toDecimal, type DecimalInput } from "./pmp";
import type { ReorderPurchaseType } from "./labels";

/** Règles pures du réapprovisionnement (K8). */

/** Sous le point de commande : point de commande > 0 et position (stock + en commande) <= point. */
export function isBelowReorderPoint(position: DecimalInput, reorderPoint: DecimalInput | null): boolean {
  if (reorderPoint === null) return false;
  const rop = toDecimal(reorderPoint);
  return rop.gt(0) && toDecimal(position).lte(rop);
}

/**
 * Quantité suggérée (unité de stock) = max(quantité économique, point de commande + consommation pendant le délai - position, 0).
 */
export function suggestedStockQty(p: {
  position: DecimalInput;
  reorderPoint: DecimalInput;
  economicOrderQty?: DecimalInput | null;
  dailyConsumption: DecimalInput;
  leadTimeDays: number;
}): Decimal {
  const need = toDecimal(p.reorderPoint).add(toDecimal(p.dailyConsumption).mul(p.leadTimeDays)).sub(toDecimal(p.position));
  const eoq = p.economicOrderQty === null || p.economicOrderQty === undefined ? new Decimal(0) : toDecimal(p.economicOrderQty);
  return Decimal.max(need, eoq, new Decimal(0));
}

/**
 * Conversion en unité d'achat, arrondie à l'unité d'achat supérieure, au moins le minimum de commande du fournisseur
 * principal et au moins une unité. Renvoie aussi l'équivalent en unité de stock.
 */
export function toPurchaseQty(p: { stockQty: DecimalInput; factor: DecimalInput; minOrderQty?: DecimalInput | null }): {
  purchaseQty: Decimal;
  stockQty: Decimal;
} {
  const factor = toDecimal(p.factor).gt(0) ? toDecimal(p.factor) : new Decimal(1);
  let q = toDecimal(p.stockQty).div(factor);
  if (p.minOrderQty !== null && p.minOrderQty !== undefined) q = Decimal.max(q, toDecimal(p.minOrderQty));
  const purchaseQty = Decimal.max(q.toDecimalPlaces(6, Decimal.ROUND_HALF_UP).ceil(), new Decimal(1));
  return { purchaseQty, stockQty: purchaseQty.mul(factor) };
}

/** Quantité à commander (unité d'achat) pour un article sous son point de commande. */
export function reorderQuantity(p: {
  position: DecimalInput;
  reorderPoint: DecimalInput;
  economicOrderQty?: DecimalInput | null;
  dailyConsumption: DecimalInput;
  leadTimeDays: number;
  factor: DecimalInput;
  minOrderQty?: DecimalInput | null;
}) {
  return toPurchaseQty({ stockQty: suggestedStockQty(p), factor: p.factor, minOrderQty: p.minOrderQty });
}

/** Regroupe par type d'achat (une DA par type). */
export function groupByPurchaseType<T extends { purchaseType: ReorderPurchaseType }>(rows: T[]): Map<ReorderPurchaseType, T[]> {
  const m = new Map<ReorderPurchaseType, T[]>();
  for (const r of rows) m.set(r.purchaseType, [...(m.get(r.purchaseType) ?? []), r]);
  return m;
}
