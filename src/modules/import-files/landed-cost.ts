import { Decimal, roundCost, toDecimal, type DecimalInput } from "@/modules/stock/pmp";
import { allocateCost, type AllocationLine } from "./allocation";
import type { AllocationKeyCode } from "./labels";

/**
 * Coût d'arrivée dédouané (LOT-12). Fonctions pures.
 * Coût unitaire = (valeur marchandise FCFA + frais répartis non récupérables) / quantité.
 */

/** Montant en devise -> FCFA entier au taux figé (demi vers l'extérieur). */
export function toXof(amount: DecimalInput, rate: DecimalInput): number {
  const v = toDecimal(amount).mul(toDecimal(rate)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  return v === 0 ? 0 : v;
}

export interface LandedCostInput {
  id: string;
  amountXof: number;
  /** Frais récupérable (ex. TVA import) : exclu du coût de revient. */
  vatRecoverable: boolean;
  key: AllocationKeyCode;
}

export interface LandedLineResult {
  id: string;
  goodsValueXof: number;
  allocatedXof: number;
  landedValueXof: number;
  /** FCFA par unité de stock, 4 décimales. */
  unitGoodsCost: Decimal;
  unitLandedCost: Decimal;
}

export interface LandedCostBreakdown {
  costId: string;
  amountXof: number;
  /** Exclu du coût (récupérable). */
  excluded: boolean;
  keyUsed: AllocationKeyCode;
  fallback: boolean;
  /** Part de chaque ligne, dans l'ordre des lignes (0 si exclu). */
  amounts: number[];
}

export interface LandedCostResult {
  lines: LandedLineResult[];
  costs: LandedCostBreakdown[];
  totals: {
    goodsValueXof: number;
    /** Frais intégrés au coût (non récupérables). */
    costsXof: number;
    /** Frais récupérables, hors coût. */
    excludedXof: number;
    landedXof: number;
    /** coût dédouané / valeur marchandise, 4 décimales ; null si la valeur marchandise est nulle. */
    coefficient: Decimal | null;
  };
}

export function approachCoefficient(landedXof: number, goodsValueXof: number): Decimal | null {
  if (goodsValueXof <= 0) return null;
  return new Decimal(landedXof).div(goodsValueXof).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

export function computeLandedCost(lines: AllocationLine[], costs: LandedCostInput[]): LandedCostResult {
  const allocated = lines.map(() => 0);
  const breakdown: LandedCostBreakdown[] = [];
  let costsXof = 0;
  let excludedXof = 0;
  for (const c of costs) {
    if (c.vatRecoverable) {
      excludedXof += c.amountXof;
      breakdown.push({ costId: c.id, amountXof: c.amountXof, excluded: true, keyUsed: c.key, fallback: false, amounts: lines.map(() => 0) });
      continue;
    }
    const r = allocateCost(c.amountXof, lines, c.key);
    r.amounts.forEach((a, i) => (allocated[i] += a));
    costsXof += c.amountXof;
    breakdown.push({ costId: c.id, amountXof: c.amountXof, excluded: false, keyUsed: r.keyUsed, fallback: r.fallback, amounts: r.amounts });
  }
  let goodsValueXof = 0;
  const results = lines.map((l, i): LandedLineResult => {
    const goods = toDecimal(l.valueXof).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
    goodsValueXof += goods;
    const landed = goods + allocated[i];
    const qty = toDecimal(l.qty);
    return {
      id: l.id,
      goodsValueXof: goods,
      allocatedXof: allocated[i],
      landedValueXof: landed,
      unitGoodsCost: qty.gt(0) ? roundCost(new Decimal(goods).div(qty)) : new Decimal(0),
      unitLandedCost: qty.gt(0) ? roundCost(new Decimal(landed).div(qty)) : new Decimal(0),
    };
  });
  const landedXof = goodsValueXof + costsXof;
  return {
    lines: results,
    costs: breakdown,
    totals: { goodsValueXof, costsXof, excludedXof, landedXof, coefficient: approachCoefficient(landedXof, goodsValueXof) },
  };
}

// ------------------------------------------------------------------ réajustement du PMP

export interface ReappraisalLot {
  /** Quantité reçue de ce lot (unité de stock). */
  qty: DecimalInput;
  /** Coût d'entrée enregistré à la réception, FCFA par unité de stock. */
  unitCostXof: DecimalInput;
  /** Coût d'arrivée dédouané, FCFA par unité de stock. */
  landedUnitCostXof: DecimalInput;
}

export interface ReappraisalPlan {
  /** Surcoût total des lots reçus. */
  totalXof: number;
  /** Part encore en stock, ajoutée à la valeur du stock (mouvement REEVALUATION_COUT). */
  appliedXof: number;
  /** Part déjà sortie : exposée dans la fiche, jamais réécrite dans les sorties passées. */
  exposedXof: number;
  /** Quantité de lots restant en stock (min(reçu, stock actuel)). */
  remainingQty: Decimal;
  receivedQty: Decimal;
  pmpBefore: Decimal;
  pmpAfter: Decimal;
}

/**
 * Pour un couple article x dépôt : seule la part restante du lot est réévaluée.
 * Nouveau PMP = PMP + surcoût restant / stock actuel. Stock nul : rien n'est réévalué, tout le surcoût est « exposé ».
 */
export function planReappraisal(lots: ReappraisalLot[], stock: { quantity: DecimalInput; pmp: DecimalInput }): ReappraisalPlan {
  const stockQty = toDecimal(stock.quantity);
  const pmp = roundCost(stock.pmp);
  const receivedQty = lots.reduce((a, l) => a.add(toDecimal(l.qty)), new Decimal(0));
  const total = lots
    .reduce((a, l) => a.add(toDecimal(l.landedUnitCostXof).sub(toDecimal(l.unitCostXof)).mul(toDecimal(l.qty))), new Decimal(0))
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
  const totalXof = Math.max(0, total);
  const remainingQty = Decimal.min(receivedQty, Decimal.max(stockQty, new Decimal(0)));
  if (totalXof === 0 || receivedQty.lte(0) || stockQty.lte(0)) {
    return { totalXof, appliedXof: 0, exposedXof: totalXof, remainingQty: new Decimal(0), receivedQty, pmpBefore: pmp, pmpAfter: pmp };
  }
  const appliedXof = new Decimal(totalXof).mul(remainingQty).div(receivedQty).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  const pmpAfter = appliedXof > 0 ? roundCost(pmp.add(new Decimal(appliedXof).div(stockQty))) : pmp;
  return { totalXof, appliedXof, exposedXof: totalXof - appliedXof, remainingQty, receivedQty, pmpBefore: pmp, pmpAfter };
}
