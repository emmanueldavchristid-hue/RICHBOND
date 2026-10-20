import { Prisma } from "@/generated/prisma/client";
import { BusinessError } from "@/lib/errors";

/**
 * Calculs purs du stock : quantités (3 décimales), coûts unitaires et PMP (4 décimales, FCFA),
 * valeurs en FCFA entiers. Aucun accès base, aucun flottant : tout passe par Decimal.
 */
export type Decimal = Prisma.Decimal;
export const Decimal = Prisma.Decimal;
export type DecimalInput = string | number | Decimal;

export const QTY_DECIMALS = 3;
export const COST_DECIMALS = 4;

export const ZERO = new Decimal(0);

export function toDecimal(v: DecimalInput): Decimal {
  const d = new Decimal(v);
  if (!d.isFinite()) throw new BusinessError("QUANTITE_INVALIDE", "La valeur saisie n'est pas un nombre valide.");
  return d;
}

/** Arrondi d'un coût unitaire ou d'un PMP à 4 décimales (demi vers l'extérieur). */
export function roundCost(x: DecimalInput): Decimal {
  return toDecimal(x).toDecimalPlaces(COST_DECIMALS, Decimal.ROUND_HALF_UP);
}

/** Arrondi d'une quantité à 3 décimales. */
export function roundQty(x: DecimalInput): Decimal {
  return toDecimal(x).toDecimalPlaces(QTY_DECIMALS, Decimal.ROUND_HALF_UP);
}

/**
 * Valeur d'un mouvement en FCFA entiers : quantité signée x coût unitaire, arrondie au franc.
 * L'arrondi est symétrique (demi vers l'extérieur) : valeur(-q) = -valeur(q), donc une contre-passation s'annule exactement.
 */
export function movementValue(qty: DecimalInput, unitCost: DecimalInput): number {
  const v = toDecimal(qty).mul(toDecimal(unitCost)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  return v === 0 ? 0 : v;
}

/**
 * PMP après une entrée : (S x P + q x c) / (S + q). Si S <= 0, le PMP devient le coût de l'entrée.
 * Entrée de quantité nulle : PMP inchangé.
 */
export function pmpAfterEntry(stock: DecimalInput, pmp: DecimalInput, qty: DecimalInput, cost: DecimalInput): Decimal {
  const s = toDecimal(stock);
  const p = toDecimal(pmp);
  const q = toDecimal(qty);
  const c = toDecimal(cost);
  if (q.lte(0)) return roundCost(p);
  if (s.lte(0)) return roundCost(c);
  return roundCost(s.mul(p).add(q.mul(c)).div(s.add(q)));
}

/**
 * PMP après la contre-passation d'une entrée de quantité q au coût c : (S x P - q x c) / (S - q).
 * Si S - q <= 0 ou si le résultat n'est pas strictement positif, le PMP est conservé.
 */
export function pmpAfterEntryReversal(
  stock: DecimalInput,
  pmp: DecimalInput,
  qty: DecimalInput,
  cost: DecimalInput,
): Decimal {
  const s = toDecimal(stock);
  const p = toDecimal(pmp);
  const q = toDecimal(qty);
  const c = toDecimal(cost);
  const remaining = s.sub(q);
  if (remaining.lte(0)) return roundCost(p);
  const result = s.mul(p).sub(q.mul(c)).div(remaining);
  if (result.lte(0)) return roundCost(p);
  return roundCost(result);
}

export interface MovementComputationInput {
  /** Stock et PMP du couple article x dépôt avant le mouvement. */
  stock: DecimalInput;
  pmp: DecimalInput;
  /** Quantité signée (unité de stock), non nulle. */
  quantity: DecimalInput;
  /** Coût de l'entrée (FCFA / unité de stock). Ignoré pour une sortie (valorisée au PMP). Absent : PMP courant. */
  unitCost?: DecimalInput;
  /** Contre-passation d'un mouvement : coût et valeur d'origine repris, PMP recalculé par la formule inverse si c'était une entrée. */
  reversal?: { quantity: DecimalInput; unitCost: DecimalInput; value: number };
}

export interface MovementComputation {
  quantity: Decimal;
  unitCost: Decimal;
  /** FCFA entiers signés. */
  value: number;
  pmpBefore: Decimal;
  pmpAfter: Decimal;
  stockAfter: Decimal;
}

/**
 * Règle unique de calcul d'un mouvement. Lève STOCK_INSUFFICIENT si le stock deviendrait négatif
 * (le message est complété par l'appelant avec l'unité et le dépôt).
 */
export function computeMovement(input: MovementComputationInput): MovementComputation {
  const stock = toDecimal(input.stock);
  const pmp = roundCost(input.pmp);
  const qty = roundQty(input.quantity);
  if (!toDecimal(input.quantity).eq(qty)) {
    throw new BusinessError("QUANTITE_INVALIDE", "Les quantités sont limitées à 3 décimales.");
  }
  if (qty.isZero()) throw new BusinessError("QUANTITE_INVALIDE", "La quantité du mouvement ne peut pas être nulle.");

  const stockAfter = stock.add(qty);
  if (stockAfter.lt(0)) {
    throw new BusinessError(
      "STOCK_INSUFFICIENT",
      `Stock insuffisant : ${formatDecimal(Decimal.max(stock, ZERO))} disponible(s).`,
    );
  }

  if (input.reversal) {
    const origQty = toDecimal(input.reversal.quantity);
    if (!origQty.neg().eq(qty)) {
      throw new BusinessError("CONTREPASSATION_INVALIDE", "La contre-passation doit annuler exactement la quantité d'origine.");
    }
    const cost = roundCost(input.reversal.unitCost);
    const pmpAfter = origQty.gt(0)
      ? pmpAfterEntryReversal(stock, pmp, origQty, cost)
      : qty.gt(0)
        ? pmpAfterEntry(stock, pmp, qty, cost)
        : pmp;
    return { quantity: qty, unitCost: cost, value: -input.reversal.value || 0, pmpBefore: pmp, pmpAfter, stockAfter };
  }

  if (qty.lt(0)) {
    // Sortie, retour fournisseur, transfert sortant : au PMP courant, PMP inchangé.
    return { quantity: qty, unitCost: pmp, value: movementValue(qty, pmp), pmpBefore: pmp, pmpAfter: pmp, stockAfter };
  }
  const cost = input.unitCost === undefined ? pmp : roundCost(input.unitCost);
  if (cost.lt(0)) throw new BusinessError("COUT_INVALIDE", "Le coût unitaire ne peut pas être négatif.");
  return {
    quantity: qty,
    unitCost: cost,
    value: movementValue(qty, cost),
    pmpBefore: pmp,
    pmpAfter: pmpAfterEntry(stock, pmp, qty, cost),
    stockAfter,
  };
}

/** Quantité sans zéros inutiles ("12.500" -> "12.5") pour les messages. */
export function formatDecimal(d: Decimal): string {
  return d.toDecimalPlaces(QTY_DECIMALS).toString().replace(".", ",");
}
