import { NC_DECISION_LABELS, REFUSAL_REASON_LABELS, REFUSAL_REASONS, NC_DECISIONS } from "@/modules/receiving/labels";

/** Listes prêtes pour les menus déroulants (libellés issus du module, une seule source). */
export const REFUSAL_OPTIONS = REFUSAL_REASONS.map((value) => ({ value, label: REFUSAL_REASON_LABELS[value] }));

const NC_HELP: Record<(typeof NC_DECISIONS)[number], string> = {
  RETOUR: "La marchandise est renvoyée au fournisseur.",
  AVOIR: "Le fournisseur émet un avoir sur la facture.",
  REMPLACEMENT: "Le fournisseur livre une marchandise conforme à la place.",
};

export const NC_OPTIONS = NC_DECISIONS.map((value) => ({ value, label: NC_DECISION_LABELS[value], help: NC_HELP[value] }));

export { NC_DECISION_LABELS, REFUSAL_REASON_LABELS };
