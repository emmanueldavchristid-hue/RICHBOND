import type { SelectionReason } from "@/modules/inventory/rules";

/** Libellés français des inventaires (LOT-11). Fichier pur : utilisable côté serveur et côté client. */

export const SELECTION_REASON_LABELS: Record<SelectionReason, string> = {
  CLASSE_A: "Classe A (contrôle mensuel)",
  CLASSE_B: "Classe B (contrôle trimestriel)",
  CLASSE_C: "Classe C (contrôle semestriel)",
  ECART_RECENT: "Écart récent",
  AJOUT_MANUEL: "Ajout manuel",
  COMPLET: "Inventaire complet",
};

export const KIND_LABELS = { TOURNANT: "Tournant (liste de la semaine)", COMPLET: "Complet (tout le dépôt)" } as const;

/** Statut d'un inventaire, du point de vue du magasin. */
export const INVENTORY_STATUS_HINTS: Record<string, string> = {
  PREPARE: "La liste est prête. Le comptage n'a pas encore commencé.",
  EN_COMPTAGE: "Le comptage est en cours au magasin.",
  A_VALIDER: "Le comptage est terminé. Le Responsable Achats doit valider les écarts.",
  VALIDE: "Inventaire validé : le stock a été ajusté.",
  ANNULE: "Inventaire annulé : le stock n'a pas été modifié.",
};
