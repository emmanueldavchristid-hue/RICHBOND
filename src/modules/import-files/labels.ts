/** Libellés et codes du dossier import (LOT-12). Fichier pur : importable côté client. */

export const IMPORT_MODES = ["MARITIME", "AERIEN", "ROUTIER"] as const;
export type ImportModeCode = (typeof IMPORT_MODES)[number];
export const IMPORT_MODE_LABELS: Record<ImportModeCode, string> = {
  MARITIME: "Maritime",
  AERIEN: "Aérien",
  ROUTIER: "Routier",
};

export const IMPORT_STATUSES = ["OUVERT", "CLOTURE", "ANNULE"] as const;
export type ImportStatusCode = (typeof IMPORT_STATUSES)[number];
export const IMPORT_STATUS_LABELS: Record<ImportStatusCode, string> = {
  OUVERT: "Ouvert",
  CLOTURE: "Clôturé",
  ANNULE: "Annulé",
};

/** Les 10 jalons, dans l'ordre chronologique du dossier. */
export const MILESTONE_CODES = [
  "PROFORMA_RECUE",
  "PAIEMENT_OU_CREDOC",
  "MARCHANDISE_PRETE",
  "EMBARQUEMENT_ETD",
  "ARRIVEE_PREVUE_ETA",
  "ARRIVEE_PORT",
  "DOCUMENTS_RECUS",
  "DEDOUANEMENT",
  "ENLEVEMENT",
  "RECEPTION_MAGASIN",
] as const;
export type MilestoneCode = (typeof MILESTONE_CODES)[number];
export const MILESTONE_LABELS: Record<MilestoneCode, string> = {
  PROFORMA_RECUE: "Proforma reçue",
  PAIEMENT_OU_CREDOC: "Paiement / ouverture du crédit documentaire",
  MARCHANDISE_PRETE: "Marchandise prête",
  EMBARQUEMENT_ETD: "Embarquement (ETD)",
  ARRIVEE_PREVUE_ETA: "Arrivée prévue (ETA)",
  ARRIVEE_PORT: "Arrivée au port / aéroport",
  DOCUMENTS_RECUS: "Documents reçus",
  DEDOUANEMENT: "Dédouanement",
  ENLEVEMENT: "Enlèvement",
  RECEPTION_MAGASIN: "Réception magasin",
};

export const ALLOCATION_KEYS = ["VALEUR", "POIDS", "VOLUME", "QUANTITE"] as const;
export type AllocationKeyCode = (typeof ALLOCATION_KEYS)[number];
export const ALLOCATION_KEY_LABELS: Record<AllocationKeyCode, string> = {
  VALEUR: "Valeur",
  POIDS: "Poids",
  VOLUME: "Volume",
  QUANTITE: "Quantité",
};

export const COST_STATUSES = ["ESTIME", "REEL"] as const;
export type CostStatusCode = (typeof COST_STATUSES)[number];
export const COST_STATUS_LABELS: Record<CostStatusCode, string> = { ESTIME: "Estimé", REEL: "Réel" };

export const DOCUMENT_TYPES = [
  "FACTURE_COMMERCIALE",
  "PACKING_LIST",
  "CONNAISSEMENT_LTA",
  "CERTIFICAT_ORIGINE",
  "DECLARATION_DOUANE",
  "AUTRE",
] as const;
export type DocumentTypeCode = (typeof DOCUMENT_TYPES)[number];
export const DOCUMENT_TYPE_LABELS: Record<DocumentTypeCode, string> = {
  FACTURE_COMMERCIALE: "Facture commerciale",
  PACKING_LIST: "Packing list",
  CONNAISSEMENT_LTA: "Connaissement (BL) / LTA",
  CERTIFICAT_ORIGINE: "Certificat d'origine",
  DECLARATION_DOUANE: "Déclaration en douane",
  AUTRE: "Autre",
};

export const importFileLink = (id: string) => `/import/${id}`;
