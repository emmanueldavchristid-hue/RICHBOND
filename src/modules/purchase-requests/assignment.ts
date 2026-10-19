/** D7 : règles pures d'assignation d'un acheteur (périmètre local / import, charge). */
export type BuyerScope = "LOCAL" | "IMPORT" | "ALL";

/** Un acheteur « ALL » couvre local et import ; sinon le périmètre doit correspondre au type de la DA. */
export function buyerCoversType(scope: BuyerScope | null | undefined, type: "LOCAL" | "IMPORT"): boolean {
  if (!scope) return false;
  return scope === "ALL" || scope === type;
}

export interface BuyerLoad {
  id: string;
  name: string;
  openCount: number;
}

/** Acheteur proposé : le moins de DA ouvertes, puis ordre alphabétique, puis identifiant (déterministe). */
export function pickLeastLoaded<T extends BuyerLoad>(buyers: T[]): T | null {
  if (buyers.length === 0) return null;
  return [...buyers].sort((a, b) => a.openCount - b.openCount || a.name.localeCompare(b.name, "fr") || a.id.localeCompare(b.id))[0];
}
