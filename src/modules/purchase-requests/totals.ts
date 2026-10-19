import { BusinessError } from "@/lib/errors";

/** Plafond des colonnes INTEGER PostgreSQL. */
export const MAX_AMOUNT = 2_147_483_647;

type Qty = number | string | { toString(): string };

/** Quantité décimale (≤ 3 décimales) -> millièmes entiers (exact, sans flottant). */
export function toMilli(q: Qty): bigint {
  const s = q.toString().trim().replace(",", ".");
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new BusinessError("QTY_INVALID", "Quantité invalide.");
  const frac = (m[3] ?? "").padEnd(3, "0").slice(0, 3);
  const v = BigInt(m[2] + frac);
  return m[1] === "-" ? -v : v;
}

/** Montant d'une ligne : quantité x prix unitaire (FCFA entiers), arrondi au franc (demi supérieur). Null si pas de prix. */
export function lineTotal(qty: Qty, unitPrice: number | null | undefined): number | null {
  if (unitPrice == null) return null;
  if (!Number.isSafeInteger(unitPrice) || unitPrice < 0) {
    throw new BusinessError("MONTANT_INVALIDE", "Le prix estimé doit être un montant entier en FCFA.");
  }
  const milli = toMilli(qty);
  const total = (milli * BigInt(unitPrice) * 2n + 1000n) / 2000n;
  const n = Number(total);
  if (!Number.isSafeInteger(n) || n > MAX_AMOUNT) {
    throw new BusinessError("MONTANT_INVALIDE", "Montant trop élevé (maximum 2 147 483 647 FCFA).");
  }
  return n;
}

export interface TotalLine {
  quantity: Qty;
  approvedQty?: Qty | null;
  estimatedUnitPrice: number | null | undefined;
}

/**
 * Total estimé de la DA (FCFA, entier) : somme des lignes chiffrées, sur la quantité validée si elle existe
 * (0 = ligne retirée). Null si aucune ligne n'est chiffrée.
 */
export function estimatedTotal(lines: TotalLine[]): number | null {
  let sum = 0;
  let any = false;
  for (const l of lines) {
    const t = lineTotal(l.approvedQty ?? l.quantity, l.estimatedUnitPrice);
    if (t === null) continue;
    any = true;
    sum += t;
    if (sum > MAX_AMOUNT) throw new BusinessError("MONTANT_INVALIDE", "Total estimé trop élevé (maximum 2 147 483 647 FCFA).");
  }
  return any ? sum : null;
}
