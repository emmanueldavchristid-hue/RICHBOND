import { Decimal, toDecimal, type DecimalInput } from "@/modules/stock/pmp";

/**
 * Frais estimés dès la création du dossier (LOT-12) : valeur marchandise x % par défaut du mode de transport,
 * par type de frais. Fonction pure ; les % sont paramétrables (ApproachCoefficientDefault).
 */
export interface EstimateDefault {
  typeId: string;
  /** % de la valeur marchandise (6 = 6 %). */
  pctOfValue: DecimalInput;
}

export interface EstimatedCost {
  typeId: string;
  amountXof: number;
}

export function estimateCosts(goodsValueXof: number, defaults: EstimateDefault[]): EstimatedCost[] {
  if (goodsValueXof <= 0) return [];
  return defaults
    .map((d) => ({
      typeId: d.typeId,
      amountXof: toDecimal(goodsValueXof).mul(toDecimal(d.pctOfValue)).div(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
    }))
    .filter((e) => e.amountXof > 0);
}
