export type SearchParams = Record<string, string | string[] | undefined>;

/** Garde la première valeur des clés demandées (les listes lisent leur état dans l'URL). */
export function pickParams(sp: SearchParams, keys: readonly string[]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const k of keys) {
    const v = Array.isArray(sp[k]) ? sp[k][0] : sp[k];
    out[k] = v ? v : undefined;
  }
  return out;
}
