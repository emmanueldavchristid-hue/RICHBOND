/** Libellés français des bons de commande (fichier pur, utilisable côté client). */
export const PO_STATUSES = [
  "BROUILLON",
  "A_VALIDER",
  "VALIDE",
  "ENVOYE",
  "CONFIRME",
  "PARTIELLEMENT_RECU",
  "RECU",
  "CLOTURE",
  "REFUSE",
  "ANNULE",
] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export const PO_TYPES = ["LOCAL", "IMPORT"] as const;
export type PoType = (typeof PO_TYPES)[number];

export const PO_ORIGINS = ["DA", "DIRECT", "OFFRE"] as const;
export type PoOrigin = (typeof PO_ORIGINS)[number];

export const CONTACT_CHANNELS = ["EMAIL", "WHATSAPP", "TELEPHONE", "REMIS_EN_MAIN", "AUTRE"] as const;
export type ContactChannelCode = (typeof CONTACT_CHANNELS)[number];

export const VAT_RATES = [0, 9, 18] as const;
export type VatRate = (typeof VAT_RATES)[number];

export const PO_STATUS_LABELS: Record<PoStatus, string> = {
  BROUILLON: "Brouillon",
  A_VALIDER: "À valider",
  VALIDE: "Validé",
  ENVOYE: "Envoyé",
  CONFIRME: "Confirmé",
  PARTIELLEMENT_RECU: "Partiellement reçu",
  RECU: "Reçu",
  CLOTURE: "Clôturé",
  REFUSE: "Refusé",
  ANNULE: "Annulé",
};

export const PO_TYPE_LABELS: Record<PoType, string> = { LOCAL: "Local", IMPORT: "Import" };

export const PO_ORIGIN_LABELS: Record<PoOrigin, string> = {
  DA: "Demande d'achat",
  DIRECT: "Commande directe",
  OFFRE: "Offre retenue",
};

export const CONTACT_CHANNEL_LABELS: Record<ContactChannelCode, string> = {
  EMAIL: "E-mail",
  WHATSAPP: "WhatsApp",
  TELEPHONE: "Téléphone",
  REMIS_EN_MAIN: "Remis en main propre",
  AUTRE: "Autre",
};

export const PO_EVENT_LABELS: Record<string, string> = {
  CREATED: "Création",
  UPDATED: "Modification",
  SUBMITTED: "Soumission",
  APPROVED: "Validation",
  REJECTED: "Refus",
  RETURNED: "Renvoi pour correction",
  CANCELLED: "Annulation",
  SENT: "Envoi au fournisseur",
  CONFIRMED: "Confirmation du fournisseur",
  PROMISED_DATE_CHANGED: "Date promise modifiée",
  REMINDED: "Relance",
  AMENDMENT_STARTED: "Avenant ouvert",
  AMENDMENT_ABANDONED: "Avenant abandonné",
  CLOSED: "Clôture",
  COMMENT: "Commentaire",
  STATUS_SYNC: "Statut mis à jour",
};

/** Statuts dont la date attendue peut être dépassée (D19). */
export const PO_LATE_STATUSES: readonly PoStatus[] = ["VALIDE", "ENVOYE", "CONFIRME", "PARTIELLEMENT_RECU"];

/** « En cours » : validé et pas encore reçu en totalité. */
export const PO_ONGOING_STATUSES: readonly PoStatus[] = ["VALIDE", "ENVOYE", "CONFIRME", "PARTIELLEMENT_RECU"];

/** Statuts qui engagent une quantité de DA (D9) : validé et au-delà, hors refusé/annulé. */
export const PO_COUNTED_STATUSES: readonly PoStatus[] = ["VALIDE", "ENVOYE", "CONFIRME", "PARTIELLEMENT_RECU", "RECU", "CLOTURE"];

/** Statuts qui libèrent la quantité réservée sur la DA (D7). */
export const PO_RELEASED_STATUSES: readonly PoStatus[] = ["REFUSE", "ANNULE"];

/** Statuts « finaux » : plus aucune transition. */
export const PO_FINAL_STATUSES: readonly PoStatus[] = ["CLOTURE", "REFUSE", "ANNULE"];

/** Numéro affiché : « BC-2026-00042 », « BC-2026-00042 v2 » (avenant) ou « BC-BROUILLON-AB12CD » avant validation. */
export function displayOrderNumber(po: { id: string; number: string | null; version?: number }): string {
  if (!po.number) return `BC-BROUILLON-${po.id.slice(-6).toUpperCase()}`;
  return (po.version ?? 1) > 1 ? `${po.number} v${po.version}` : po.number;
}

/** Nom de fichier du PDF : `BC-2026-00042-v2.pdf`, `BC-brouillon-AB12CD.pdf` avant validation. */
export function orderPdfFileName(po: { id: string; number: string | null; version?: number }): string {
  if (!po.number) return `BC-brouillon-${po.id.slice(-6).toUpperCase()}.pdf`;
  return `${po.number}-v${po.version ?? 1}.pdf`;
}
