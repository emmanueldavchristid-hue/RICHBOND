import "server-only";

export interface StockSnapshot {
  /** Quantité disponible en unité de stock (chaîne décimale). */
  onHand: string;
  /** Couverture en jours ; null si la consommation est inconnue. */
  coverageDays: number | null;
}

/**
 * D14 : stock actuel et couverture par article. Renvoie `null` tant que la gestion des stocks (LOT-07,
 * `StockLevel`) n'existe pas : l'interface affiche « – » plutôt qu'une fausse donnée.
 * Signature figée pour LOT-07.
 */
export async function getStockSnapshot(itemIds: string[]): Promise<Record<string, StockSnapshot> | null> {
  void itemIds;
  return null;
}
