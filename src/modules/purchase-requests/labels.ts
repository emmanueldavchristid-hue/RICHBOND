/** Libellés français des DA (fichier pur, utilisable côté client). */
export const PR_STATUSES = [
  "BROUILLON",
  "SOUMISE",
  "A_COMPLETER",
  "VALIDEE",
  "REFUSEE",
  "EN_CONSULTATION",
  "PARTIELLEMENT_COMMANDEE",
  "COMMANDEE",
  "ANNULEE",
] as const;
export type PrStatus = (typeof PR_STATUSES)[number];

export const PR_URGENCIES = ["NORMALE", "URGENTE", "ARRET_PRODUCTION"] as const;
export type PrUrgency = (typeof PR_URGENCIES)[number];

export const PR_TYPES = ["LOCAL", "IMPORT", "A_DEFINIR"] as const;
export type PrType = (typeof PR_TYPES)[number];

export const PR_KINDS = ["STANDARD", "REAPPRO"] as const;
export type PrKind = (typeof PR_KINDS)[number];

export const PR_STATUS_LABELS: Record<PrStatus, string> = {
  BROUILLON: "Brouillon",
  SOUMISE: "À valider",
  A_COMPLETER: "À compléter",
  VALIDEE: "Validée",
  REFUSEE: "Refusée",
  EN_CONSULTATION: "En consultation",
  PARTIELLEMENT_COMMANDEE: "Partiellement commandée",
  COMMANDEE: "Commandée",
  ANNULEE: "Annulée",
};

export const PR_URGENCY_LABELS: Record<PrUrgency, string> = {
  NORMALE: "Normale",
  URGENTE: "Urgente",
  ARRET_PRODUCTION: "Arrêt de production",
};

export const PR_TYPE_LABELS: Record<PrType, string> = {
  LOCAL: "Local",
  IMPORT: "Import",
  A_DEFINIR: "À définir",
};

export const PR_KIND_LABELS: Record<PrKind, string> = {
  STANDARD: "Standard",
  REAPPRO: "Réapprovisionnement",
};

export const PR_EVENT_LABELS: Record<string, string> = {
  CREATED: "Création",
  UPDATED: "Modification",
  SUBMITTED: "Soumission",
  RESUBMITTED: "Nouvelle soumission",
  APPROVED: "Validation",
  REJECTED: "Refus",
  RETURNED: "Renvoi pour complément",
  CANCELLED: "Annulation",
  ASSIGNED: "Assignation",
  QTY_CHANGED: "Quantité modifiée",
  COMMENT: "Commentaire",
  ATTACHMENT_ADDED: "Pièce jointe ajoutée",
  ATTACHMENT_REMOVED: "Pièce jointe retirée",
  STATUS_SYNC: "Statut mis à jour",
};

/** Statuts dans lesquels la DA est « ouverte » (engage une quantité, voir doublons). */
export const PR_OPEN_COMMITMENT_STATUSES: readonly PrStatus[] = [
  "SOUMISE",
  "A_COMPLETER",
  "VALIDEE",
  "EN_CONSULTATION",
  "PARTIELLEMENT_COMMANDEE",
];

/** Numéro affiché : « DA-2026-00012 » ou « BROUILLON-AB12CD » tant que la DA n'a pas de numéro. */
export function displayNumber(pr: { id: string; number: string | null }): string {
  return pr.number ?? `BROUILLON-${pr.id.slice(-6).toUpperCase()}`;
}
