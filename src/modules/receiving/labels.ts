/** Libellés français des réceptions, non-conformités et retours (fichier pur, utilisable côté client). */

export const REFUSAL_REASONS = ["ABIME", "NON_CONFORME", "ERREUR_REFERENCE", "HORS_DELAI", "AUTRE"] as const;
export type RefusalReasonCode = (typeof REFUSAL_REASONS)[number];

export const REFUSAL_REASON_LABELS: Record<RefusalReasonCode, string> = {
  ABIME: "Abîmé",
  NON_CONFORME: "Non conforme",
  ERREUR_REFERENCE: "Erreur de référence",
  HORS_DELAI: "Hors délai",
  AUTRE: "Autre",
};

export const RECEIPT_STATUSES = ["VALIDEE", "ANNULEE"] as const;
export type ReceiptStatusCode = (typeof RECEIPT_STATUSES)[number];

export const RECEIPT_STATUS_LABELS: Record<ReceiptStatusCode, string> = {
  VALIDEE: "Validée",
  ANNULEE: "Annulée",
};

export const NC_DECISIONS = ["RETOUR", "AVOIR", "REMPLACEMENT"] as const;
export type NonConformityDecisionCode = (typeof NC_DECISIONS)[number];

export const NC_DECISION_LABELS: Record<NonConformityDecisionCode, string> = {
  RETOUR: "Retour au fournisseur",
  AVOIR: "Avoir",
  REMPLACEMENT: "Remplacement",
};

export const NC_STATUSES = ["OUVERTE", "CLOTUREE"] as const;
export type NonConformityStatusCode = (typeof NC_STATUSES)[number];

export const NC_STATUS_LABELS: Record<NonConformityStatusCode, string> = {
  OUVERTE: "Ouverte",
  CLOTUREE: "Clôturée",
};

export const SUPPLIER_RETURN_STATUS_LABELS = { VALIDE: "Validé", ANNULE: "Annulé" } as const;

/** Minimum de caractères d'un motif libre (contre-passation, solde de reliquat, accord de sur-livraison, retour). */
export const REASON_MIN = 5;
