import type { StatusTone } from "@/components/status-badge";
import { MOVEMENT_TYPE_LABELS, STOCK_SITUATION_LABELS, STOCK_SITUATIONS, type MovementTypeCode } from "@/modules/stock/labels";

export { ISSUE_STATUS_LABELS, MOVEMENT_TYPE_LABELS, type MovementTypeCode } from "@/modules/stock/labels";

/** Couleur du badge de chaque type de mouvement (DESIGN.md §3 : la couleur porte le sens). */
export const MOVEMENT_TYPE_TONES: Record<MovementTypeCode, StatusTone> = {
  ENTREE_RECEPTION: "success",
  SORTIE: "indigo",
  RETOUR_FOURNISSEUR: "warning",
  TRANSFERT: "info",
  AJUSTEMENT: "violet",
  AJUSTEMENT_INVENTAIRE: "violet",
};

export const MOVEMENT_TYPE_OPTIONS = (Object.keys(MOVEMENT_TYPE_LABELS) as MovementTypeCode[]).map((value) => ({
  value,
  label: MOVEMENT_TYPE_LABELS[value],
}));

export const STOCK_SITUATION_OPTIONS = [
  { value: "", label: "Toutes les situations" },
  ...STOCK_SITUATIONS.map((value) => ({ value, label: STOCK_SITUATION_LABELS[value] })),
];
