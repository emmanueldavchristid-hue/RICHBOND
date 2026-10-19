/**
 * D12 : tant que le niveau « Direction » n'existe pas, seul le Responsable valide.
 * Seuil 0 (défaut) = désactivé.
 */
export type ApprovalLevel = "RESPONSABLE" | "DIRECTION";

export function exceedsThreshold(total: number | null | undefined, threshold: number): boolean {
  return threshold > 0 && total != null && total > threshold;
}

/** Toujours `["RESPONSABLE"]` pour l'instant ; le dépassement du seuil n'ajoute qu'un bandeau (non bloquant). */
export function requiredApprovalLevels(total: number | null | undefined, threshold: number): ApprovalLevel[] {
  void total;
  void threshold;
  return ["RESPONSABLE"];
}
