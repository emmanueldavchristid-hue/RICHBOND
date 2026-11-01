import type { GoodDirection } from "./types";
import type { ReportKpiUnit } from "./report-types";

/**
 * Définitions des KPI (LOT-15) : source unique des infobulles et de `docs/kpi.md`. Fichier pur (client).
 * Toute modification de définition se reporte dans docs/kpi.md.
 */
export interface KpiDef {
  label: string;
  unit: ReportKpiUnit;
  good: GoodDirection;
  help: string;
}

export const KPI_DEFS = {
  "da-creees": {
    label: "DA créées",
    unit: "COUNT",
    good: "NONE",
    help: "Demandes d'achat créées sur la période (brouillons compris).",
  },
  "da-validees": {
    label: "DA validées",
    unit: "COUNT",
    good: "NONE",
    help: "Demandes d'achat validées par le Responsable sur la période.",
  },
  "bc-emis": {
    label: "BC émis",
    unit: "COUNT",
    good: "NONE",
    help: "Bons de commande validés sur la période, hors refusés et annulés.",
  },
  "montant-achete": {
    label: "Montant acheté",
    unit: "FCFA",
    good: "NONE",
    help: "Total hors taxes des BC validés sur la période (équivalent FCFA au taux figé du BC).",
  },
  receptions: {
    label: "Réceptions",
    unit: "COUNT",
    good: "NONE",
    help: "Réceptions validées sur la période (hors annulées).",
  },
  "valeur-entrees": {
    label: "Entrées en stock",
    unit: "FCFA",
    good: "NONE",
    help: "Valeur des mouvements qui augmentent le stock (réceptions, ajustements positifs), transferts exclus.",
  },
  "valeur-sorties": {
    label: "Sorties de stock",
    unit: "FCFA",
    good: "NONE",
    help: "Valeur au PMP des mouvements qui diminuent le stock (sorties, retours fournisseur, ajustements négatifs), transferts exclus.",
  },
  "bc-en-retard": {
    label: "BC en retard",
    unit: "COUNT",
    good: "DOWN",
    help: "BC validés, envoyés, confirmés ou partiellement reçus dont la date attendue est dépassée à la fin de la période.",
  },
  ruptures: {
    label: "Ruptures",
    unit: "COUNT",
    good: "DOWN",
    help: "Nombre d'articles stockés dont une sortie de la période a laissé le stock à zéro.",
  },
  "taux-a-temps": {
    label: "Livraisons à temps",
    unit: "PERCENT",
    good: "UP",
    help: "Part des réceptions de la période livrées à la date prévue (date promise initiale) ou avant.",
  },
  "part-locale": {
    label: "Part des achats locaux",
    unit: "PERCENT",
    good: "NONE",
    help: "Montant des BC locaux / montant total des BC de la période.",
  },
  "delai-validation-da": {
    label: "Délai de traitement des DA",
    unit: "DAYS",
    good: "DOWN",
    help: "Jours calendaires entre la soumission et la validation d'une DA (moyenne des DA validées sur la période).",
  },
  "delai-da-bc": {
    label: "Délai DA → BC",
    unit: "DAYS",
    good: "DOWN",
    help: "Jours entre la validation de la DA et la validation du BC qui la couvre (moyenne, BC validés sur la période).",
  },
  "delai-bc-reception": {
    label: "Délai BC → réception",
    unit: "DAYS",
    good: "DOWN",
    help: "Jours entre la validation du BC et sa première réception (moyenne, 1res réceptions de la période).",
  },
  otif: {
    label: "OTIF",
    unit: "PERCENT",
    good: "UP",
    help: "On Time In Full : part des BC échus sur la période (date promise initiale) reçus en totalité et à temps. Un BC échu non soldé compte comme non conforme.",
  },
  "taux-service": {
    label: "Taux de service magasin",
    unit: "PERCENT",
    good: "UP",
    help: "Part des lignes de sortie de la période servies sans que l'article tombe en rupture (stock restant > 0). Approximation : l'application n'enregistre pas les demandes non servies.",
  },
  "valeur-stock": {
    label: "Valeur du stock",
    unit: "FCFA",
    good: "NONE",
    help: "Quantité × PMP de tous les articles, à la fin de la période (reconstituée à partir des mouvements).",
  },
  rotation: {
    label: "Rotation du stock",
    unit: "TURNS",
    good: "UP",
    help: "Consommation (sorties au PMP) de la période / stock moyen (début et fin), ramenée à 365 jours : tours par an.",
  },
  couverture: {
    label: "Couverture moyenne",
    unit: "DAYS",
    good: "NONE",
    help: "Stock moyen / consommation journalière de la période : nombre de jours de consommation que le stock couvre.",
  },
  "valeur-dormants": {
    label: "Valeur des dormants",
    unit: "FCFA",
    good: "DOWN",
    help: "Valeur au PMP des articles en stock sans aucun mouvement depuis le délai réglé (Paramètres, 180 jours par défaut). Situation à la date de génération.",
  },
  "gains-achats": {
    label: "Gains achats",
    unit: "FCFA",
    good: "UP",
    help: "Économies obtenues par la mise en concurrence (écart entre l'offre retenue et la référence). Disponible avec le module Consultations.",
  },
  "conformite-factures": {
    label: "Conformité des factures",
    unit: "PERCENT",
    good: "UP",
    help: "Part des factures rapprochées (date de facture sur la période) dont toutes les lignes sont conformes au BC et à la réception.",
  },
  "fiabilite-inventaire": {
    label: "Fiabilité d'inventaire",
    unit: "PERCENT",
    good: "UP",
    help: "Part des articles comptés sans écart, moyenne des inventaires validés sur la période.",
  },
  "cout-approche": {
    label: "Coût d'approche import",
    unit: "COEF",
    good: "DOWN",
    help: "Coefficient moyen des dossiers import clôturés sur la période : coût d'arrivée dédouané / valeur de la marchandise (1,25 = +25 %).",
  },
  "evaluation-fournisseurs": {
    label: "Évaluation fournisseurs",
    unit: "COUNT",
    good: "NONE",
    help: "Note des fournisseurs (qualité, délai, prix). Disponible avec le module Évaluation des fournisseurs.",
  },
} as const satisfies Record<string, KpiDef>;

export type KpiKey = keyof typeof KPI_DEFS;

export const GAINS_UNAVAILABLE = "Non disponible : le module Consultations et comparatif des offres n'est pas encore en service.";
export const SUPPLIER_EVAL_UNAVAILABLE = "Non disponible : le module Évaluation des fournisseurs n'est pas encore en service.";

/** Libellés des catégories d'articles (tableaux de bord et rapports). */
export const REPORT_CATEGORY_LABELS: Record<string, string> = {
  MATIERE_PREMIERE: "Matières premières",
  INTRANT: "Intrants",
  PDR: "Pièces de rechange",
  FOURNITURE: "Fournitures",
  SERVICE: "Services",
  HORS_CATALOGUE: "Hors catalogue",
};
