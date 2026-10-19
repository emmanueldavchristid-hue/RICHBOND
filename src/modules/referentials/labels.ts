/** Libellés français des énumérations du LOT-03 (fichier pur, utilisable côté client). */
export const ITEM_CATEGORY_LABELS = {
  MATIERE_PREMIERE: "Matière première",
  INTRANT: "Intrant",
  PDR: "Pièce de rechange (PDR)",
  FOURNITURE: "Fourniture",
  SERVICE: "Service",
} as const;

export const CRITICALITY_LABELS = {
  CRITIQUE: "Critique",
  IMPORTANT: "Important",
  STANDARD: "Standard",
} as const;

export const ITEM_STATUS_LABELS = { ACTIF: "Actif", BLOQUE: "Bloqué", OBSOLETE: "Obsolète" } as const;

export const SUPPLIER_TYPE_LABELS = { LOCAL: "Local", IMPORT: "Import" } as const;

export const SUPPLIER_STATUS_LABELS = {
  ACTIF: "Actif",
  EN_EVALUATION: "En évaluation",
  BLOQUE: "Bloqué",
} as const;

export const PAYMENT_TERM_LABELS = {
  COMPTANT: "Comptant",
  J30: "30 jours",
  J45: "45 jours",
  J60: "60 jours",
  J90: "90 jours",
  FIN_DE_MOIS_30: "30 jours fin de mois",
  AUTRE: "Autre (voir précision)",
} as const;

export const INCOTERM_LABELS = {
  EXW: "EXW – Départ usine",
  FCA: "FCA – Franco transporteur",
  FAS: "FAS – Franco le long du navire",
  FOB: "FOB – Franco à bord",
  CFR: "CFR – Coût et fret",
  CIF: "CIF – Coût, assurance et fret",
  CPT: "CPT – Port payé jusqu'à",
  CIP: "CIP – Port payé, assurance incluse",
  DAP: "DAP – Rendu au lieu de destination",
  DPU: "DPU – Rendu lieu de destination déchargé",
  DDP: "DDP – Rendu droits acquittés",
} as const;

export const PRICE_SOURCE_LABELS = { MANUEL: "Saisie manuelle", BC: "Bon de commande", FACTURE: "Facture" } as const;
