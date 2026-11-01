import { Decimal, toDecimal, type DecimalInput } from "@/modules/stock/pmp";
import type { ImportModeCode } from "./labels";

/**
 * Coefficients d'approche historisés par fournisseur et origine (LOT-12) : estimation des prochains achats.
 * Fonctions pures. Les coefficients restent indicatifs (hypothèse à confirmer par le Responsable Achats).
 */

export interface CoefficientRecord {
  supplierId: string;
  origin: string;
  mode: ImportModeCode;
  coefficient: DecimalInput;
}

export type SuggestionBasis = "FOURNISSEUR" | "ORIGINE" | "DEFAUT";

export interface CoefficientSuggestion {
  coefficient: Decimal;
  basis: SuggestionBasis;
  /** Nombre de dossiers clôturés servant à la moyenne (0 pour le défaut). */
  samples: number;
}

/** Moyenne simple arrondie à 4 décimales ; null sans donnée. */
export function averageCoefficient(values: DecimalInput[]): Decimal | null {
  if (values.length === 0) return null;
  const sum = values.reduce<Decimal>((a, v) => a.add(toDecimal(v)), new Decimal(0));
  return sum.div(values.length).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

/**
 * Coefficient par défaut d'un mode : 1 + Σ des % de valeur des types de frais, hors types récupérables.
 * `pcts` : % de la valeur marchandise (ex. 6 pour 6 %).
 */
export function defaultCoefficient(pcts: DecimalInput[]): Decimal {
  const sum = pcts.reduce<Decimal>((a, p) => a.add(toDecimal(p)), new Decimal(0));
  return sum.div(100).add(1).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

/**
 * Suggestion pour un prochain achat : moyenne des `limit` derniers dossiers du fournisseur dans le même mode, sinon de
 * la même origine et du même mode, sinon coefficient par défaut du mode. `history` doit être trié du plus récent au plus ancien.
 */
export function suggestCoefficient(
  history: CoefficientRecord[],
  target: { supplierId: string; origin: string; mode: ImportModeCode },
  fallback: Decimal,
  limit = 5,
): CoefficientSuggestion {
  const bySupplier = history.filter((h) => h.supplierId === target.supplierId && h.mode === target.mode).slice(0, limit);
  if (bySupplier.length > 0) {
    return { coefficient: averageCoefficient(bySupplier.map((h) => h.coefficient))!, basis: "FOURNISSEUR", samples: bySupplier.length };
  }
  const byOrigin = history.filter((h) => h.origin === target.origin && h.mode === target.mode).slice(0, limit);
  if (byOrigin.length > 0) {
    return { coefficient: averageCoefficient(byOrigin.map((h) => h.coefficient))!, basis: "ORIGINE", samples: byOrigin.length };
  }
  return { coefficient: fallback, basis: "DEFAUT", samples: 0 };
}
