import { Decimal, toDecimal, type DecimalInput } from "@/modules/stock/pmp";
import type { AllocationKeyCode } from "./labels";

/**
 * Répartition d'un frais d'approche sur les lignes de marchandises (LOT-12). Fonctions pures, sans base ni flottant :
 * la somme répartie égale exactement le total au franc (méthode du plus fort reste).
 */

/** Précision élargie : total (jusqu'à 10^11) x poids intermédiaires sans perte. */
const Big = Decimal.clone({ precision: 50 });

export interface AllocationLine {
  id: string;
  /** Valeur marchandise de la ligne, FCFA. */
  valueXof: DecimalInput;
  /** Poids total de la ligne (kg), null si inconnu. */
  weightKg?: DecimalInput | null;
  /** Volume total de la ligne (m3), null si inconnu. */
  volumeM3?: DecimalInput | null;
  /** Quantité (unité de stock). */
  qty: DecimalInput;
}

export interface AllocationResult {
  /** FCFA entiers, dans l'ordre des lignes ; leur somme = total. */
  amounts: number[];
  /** Clé réellement appliquée (VALEUR si poids/volume manquant, QUANTITE si valeurs toutes nulles). */
  keyUsed: AllocationKeyCode;
  /** Vrai si la clé demandée n'a pas pu être appliquée. */
  fallback: boolean;
}

/**
 * Plus fort reste : parts exactes total x p / Σp, partie entière attribuée, puis le reste (en francs) aux plus grandes
 * parties décimales (égalité : ordre des lignes). Des poids tous nuls donnent une répartition à parts égales.
 */
export function allocateByWeights(total: number, weights: DecimalInput[]): number[] {
  if (!Number.isInteger(total) || total < 0) throw new RangeError("Le montant à répartir doit être un entier de FCFA positif ou nul.");
  const n = weights.length;
  if (n === 0) return [];
  let w = weights.map((x) => new Big(toDecimal(x).toString()));
  if (w.some((x) => x.lt(0))) throw new RangeError("Une clé de répartition ne peut pas être négative.");
  let sum = w.reduce((a, b) => a.add(b), new Big(0));
  if (sum.isZero()) {
    w = w.map(() => new Big(1));
    sum = new Big(n);
  }
  const exact = w.map((x) => x.mul(total).div(sum));
  const floors = exact.map((x) => x.floor());
  let remainder = total - floors.reduce((a, b) => a + b.toNumber(), 0);
  const order = exact
    .map((x, i) => ({ i, frac: x.sub(floors[i]) }))
    .sort((a, b) => b.frac.comparedTo(a.frac) || a.i - b.i);
  const out = floors.map((f) => f.toNumber());
  for (const { i } of order) {
    if (remainder <= 0) break;
    out[i] += 1;
    remainder -= 1;
  }
  return out;
}

const positive = (v: DecimalInput | null | undefined): Decimal | null => {
  if (v === null || v === undefined) return null;
  const d = toDecimal(v);
  return d.gt(0) ? d : null;
};

/**
 * Répartit `total` selon `key`. Repli : POIDS ou VOLUME avec une ligne sans donnée => VALEUR pour tout le frais
 * (mélanger deux clés sur un même frais fausserait la répartition) ; valeurs toutes nulles => QUANTITE.
 */
export function allocateCost(total: number, lines: AllocationLine[], key: AllocationKeyCode): AllocationResult {
  const values = lines.map((l) => toDecimal(l.valueXof));
  const valueSum = values.reduce((a, b) => a.add(b), new Decimal(0));
  const byQty = () => lines.map((l) => toDecimal(l.qty));

  let wanted = key;
  let fallback = false;
  let basis: Decimal[];

  if (wanted === "POIDS" || wanted === "VOLUME") {
    const raw = lines.map((l) => positive(wanted === "POIDS" ? l.weightKg : l.volumeM3));
    if (raw.every((x): x is Decimal => x !== null)) {
      basis = raw;
    } else {
      wanted = "VALEUR";
      fallback = true;
      basis = values;
    }
  } else if (wanted === "QUANTITE") {
    basis = byQty();
  } else {
    basis = values;
  }

  if (wanted === "VALEUR" && valueSum.lte(0)) {
    wanted = "QUANTITE";
    fallback = true;
    basis = byQty();
  }
  return { amounts: allocateByWeights(total, basis), keyUsed: wanted, fallback };
}
