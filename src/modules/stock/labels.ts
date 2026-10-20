/** Libellés et codes du stock (LOT-07). Fichier pur : importable côté client. */

export const MOVEMENT_TYPES = ["ENTREE_RECEPTION", "SORTIE", "RETOUR_FOURNISSEUR", "TRANSFERT", "AJUSTEMENT", "AJUSTEMENT_INVENTAIRE"] as const;
export type MovementTypeCode = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_TYPE_LABELS: Record<MovementTypeCode, string> = {
  ENTREE_RECEPTION: "Réception",
  SORTIE: "Sortie",
  RETOUR_FOURNISSEUR: "Retour fournisseur",
  TRANSFERT: "Transfert",
  AJUSTEMENT: "Ajustement",
  AJUSTEMENT_INVENTAIRE: "Ajustement d'inventaire",
};

export const ISSUE_STATUSES = ["VALIDEE", "ANNULEE"] as const;
export type IssueStatusCode = (typeof ISSUE_STATUSES)[number];
export const ISSUE_STATUS_LABELS: Record<IssueStatusCode, string> = { VALIDEE: "Validée", ANNULEE: "Annulée" };

export const ABC_CLASSES = ["A", "B", "C"] as const;
export type AbcClass = (typeof ABC_CLASSES)[number];
export const ABC_LABELS: Record<AbcClass, string> = {
  A: "A – 80 % de la valeur consommée",
  B: "B – 15 % de la valeur consommée",
  C: "C – 5 % de la valeur consommée",
};

/** Situations de stock proposées en filtre sur /stock/articles (code couleur de la couverture, seuils, dormants). */
export const STOCK_SITUATIONS = ["ROUGE", "ORANGE", "VERT", "SOUS_POINT", "RUPTURE", "DORMANT"] as const;
export type StockSituation = (typeof STOCK_SITUATIONS)[number];

export const STOCK_SITUATION_LABELS: Record<StockSituation, string> = {
  ROUGE: "Couverture critique (rouge)",
  ORANGE: "Couverture à surveiller (orange)",
  VERT: "Couverture suffisante (vert)",
  SOUS_POINT: "Sous le point de commande",
  RUPTURE: "En rupture (stock à zéro)",
  DORMANT: "Dormants",
};

export type CoverageSeverity = "ROUGE" | "ORANGE" | "VERT";

export const PURCHASE_TYPE_LABELS = { LOCAL: "Local", IMPORT: "Import", A_DEFINIR: "À définir" } as const;
export type ReorderPurchaseType = keyof typeof PURCHASE_TYPE_LABELS;

/** Types de mouvement qui entrent au coût d'achat : leur coût et leur valeur sont masqués au Magasinier sans le réglage prix. */
export const PURCHASE_COST_MOVEMENTS: readonly MovementTypeCode[] = ["ENTREE_RECEPTION", "RETOUR_FOURNISSEUR"];

export const MIN_REASON_LENGTH = 5;
