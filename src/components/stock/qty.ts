/** « 12,5 » ou « 12.5 » -> 12.5 ; vide -> 0 ; invalide -> NaN (3 décimales au plus). */
export function parseQty(s: string): number {
  const t = s.trim().replace(/\s/g, "").replace(",", ".");
  if (t === "") return 0;
  if (!/^\d+(\.\d{1,3})?$/.test(t)) return NaN;
  return Number(t);
}

export const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Style des champs numériques tablette : 48 px de haut, chiffres larges alignés à droite. */
export const NUM_INPUT = "h-12 text-right text-lg font-medium tabular-nums";
