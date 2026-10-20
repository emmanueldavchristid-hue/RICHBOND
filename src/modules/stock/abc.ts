import type { AbcClass } from "./labels";

/**
 * Classification ABC (K9) sur la valeur consommée (FCFA entiers) : A = premiers 80 %, B = 15 % suivants, C = le reste.
 * Un article est classé selon la part cumulée AVANT lui : l'article qui franchit 80 % reste A. Sans consommation : C.
 * Calcul en entiers (aucune division flottante).
 */
export const ABC_THRESHOLDS = { a: 80, b: 95 } as const;

export function classifyAbc(entries: { id: string; value: number }[]): Map<string, AbcClass> {
  const out = new Map<string, AbcClass>();
  const positive = entries.filter((e) => e.value > 0).sort((x, y) => y.value - x.value || x.id.localeCompare(y.id));
  const total = positive.reduce((s, e) => s + e.value, 0);
  let before = 0;
  for (const e of positive) {
    out.set(e.id, before * 100 < total * ABC_THRESHOLDS.a ? "A" : before * 100 < total * ABC_THRESHOLDS.b ? "B" : "C");
    before += e.value;
  }
  for (const e of entries) if (!out.has(e.id)) out.set(e.id, "C");
  return out;
}
