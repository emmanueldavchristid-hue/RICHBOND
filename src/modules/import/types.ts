/** Types et définitions des colonnes de l'import (fichier pur : utilisable côté client). */

export const IMPORT_TYPES = ["ARTICLES", "FOURNISSEURS", "ARTICLE_FOURNISSEUR", "STOCK_INITIAL"] as const;
export type ImportType = (typeof IMPORT_TYPES)[number];

export const IMPORT_TYPE_LABELS: Record<ImportType, string> = {
  ARTICLES: "Articles",
  FOURNISSEURS: "Fournisseurs",
  ARTICLE_FOURNISSEUR: "Article-Fournisseur",
  STOCK_INITIAL: "Stock initial",
};

/** Limites : un classeur de 5 Mo et 5 000 lignes suffisent largement pour les données de départ. */
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 5000;

/** Correspondance champ de l'application -> nom de colonne du fichier (null = non utilisé). */
export type ColumnMapping = Record<string, string | null>;

export type PreviewStatus = "OK" | "ERREUR";
export type RowAction = "CREATE" | "UPDATE" | "UNCHANGED";
export type RowData = Record<string, string | number | boolean | null>;

export interface PreviewRow {
  /** Numéro de ligne dans le fichier (l'en-tête est la ligne 1). */
  line: number;
  status: PreviewStatus;
  errors: string[];
  /** Avertissements non bloquants (ex. ligne déjà importée, ignorée). */
  warnings?: string[];
  /** Clé métier de la ligne (code article, code fournisseur, couple…). */
  key?: string;
  /** Ce que fera l'import pour cette ligne (lignes OK seulement). */
  action?: RowAction;
  /** Valeurs normalisées. */
  data: RowData;
}

export interface FieldInfo {
  key: string;
  label: string;
  required: boolean;
}

export interface PreviewResult {
  type: ImportType;
  headers: string[];
  suggestedMapping: ColumnMapping;
  /** Mapping réellement appliqué (suggestion + modifications de l'utilisateur). */
  mapping: ColumnMapping;
  fields: FieldInfo[];
  rows: PreviewRow[];
  okCount: number;
  errorCount: number;
}

export interface ImportSummary {
  batchId: string;
  type: ImportType;
  fileName: string;
  totalRows: number;
  okCount: number;
  errorCount: number;
  created: number;
  updated: number;
  /** Lignes valides sans effet (déjà à jour, ou stock initial déjà importé). */
  unchanged: number;
}

export interface FieldDef extends FieldInfo {
  /** Noms de colonnes reconnus (Sage et français courant), le premier sert d'en-tête du modèle. */
  aliases: string[];
  help: string;
}

export const IMPORT_FIELDS: Record<ImportType, FieldDef[]> = {
  ARTICLES: [
    { key: "code", label: "Référence", required: true, aliases: ["Référence", "Reference", "Code article", "Article", "Code", "AR_Ref"], help: "Code Sage de l'article, 17 caractères maximum." },
    { key: "name", label: "Désignation", required: true, aliases: ["Désignation", "Designation", "Libellé", "Libelle", "AR_Design"], help: "Nom de l'article." },
    { key: "category", label: "Catégorie", required: true, aliases: ["Catégorie", "Categorie", "Type article", "Nature"], help: "Matière première, Intrant, PDR, Fourniture ou Service." },
    { key: "family", label: "Famille", required: false, aliases: ["Famille", "FA_CodeFamille", "Code famille"], help: "Famille libre (facultatif)." },
    { key: "stockUnit", label: "Unité", required: true, aliases: ["Unité", "Unite", "Unité de stock", "Unite de stock", "Unité stock"], help: "Unité de stock (U, KG, L, M, SAC, CARTON…)." },
    { key: "purchaseUnit", label: "Unité d'achat", required: false, aliases: ["Unité d'achat", "Unite d'achat", "Unité achat"], help: "Par défaut, l'unité de stock." },
    { key: "conversionFactor", label: "Coefficient", required: false, aliases: ["Coefficient", "Conversion", "Coefficient de conversion"], help: "Unités de stock par unité d'achat (obligatoire si les deux unités diffèrent)." },
    { key: "criticality", label: "Criticité", required: false, aliases: ["Criticité", "Criticite"], help: "Critique, Important ou Standard (défaut)." },
    { key: "equipment", label: "Équipement", required: false, aliases: ["Équipement", "Equipement", "Machine"], help: "Machine concernée (PDR seulement)." },
    { key: "barcode", label: "Code-barres", required: false, aliases: ["Code-barres", "Code barres", "Code barre", "EAN", "Gencod"], help: "Code-barres unique (facultatif)." },
  ],
  FOURNISSEURS: [
    { key: "code", label: "Code fournisseur", required: true, aliases: ["Code fournisseur", "Fournisseur", "CT_Num", "N° tiers", "Numéro tiers", "Code tiers", "Code"], help: "Code Sage du fournisseur (clé d'échange)." },
    { key: "name", label: "Intitulé", required: true, aliases: ["Intitulé", "Intitule", "CT_Intitule", "Raison sociale", "Nom"], help: "Raison sociale." },
    { key: "type", label: "Type", required: false, aliases: ["Type", "Type fournisseur"], help: "Local (défaut) ou Import." },
    { key: "country", label: "Pays", required: false, aliases: ["Pays"], help: "Code ISO à 2 lettres (CI par défaut)." },
    { key: "city", label: "Ville", required: false, aliases: ["Ville"], help: "" },
    { key: "phone", label: "Téléphone", required: false, aliases: ["Téléphone", "Telephone", "Tél", "Tel"], help: "" },
    { key: "email", label: "Email", required: false, aliases: ["Email", "E-mail", "Courriel", "Mail"], help: "" },
    { key: "ncc", label: "NCC", required: false, aliases: ["NCC", "N° contribuable", "Numéro de compte contribuable"], help: "Numéro de compte contribuable (unique)." },
    { key: "currencyCode", label: "Devise", required: false, aliases: ["Devise"], help: "Code devise actif (XOF par défaut)." },
  ],
  ARTICLE_FOURNISSEUR: [
    { key: "itemCode", label: "Référence", required: true, aliases: ["Référence", "Reference", "Code article", "Article", "AR_Ref"], help: "Code de l'article (déjà importé)." },
    { key: "supplierCode", label: "Code fournisseur", required: true, aliases: ["Code fournisseur", "Fournisseur", "CT_Num", "Code tiers"], help: "Code du fournisseur (déjà importé)." },
    { key: "supplierRef", label: "Référence fournisseur", required: false, aliases: ["Référence fournisseur", "Reference fournisseur", "Réf fournisseur", "Ref fournisseur", "Réf. fournisseur"], help: "Référence chez le fournisseur." },
    { key: "price", label: "Prix", required: false, aliases: ["Prix", "Prix d'achat", "Dernier prix", "Prix unitaire", "AR_PrixAch"], help: "Prix par unité d'achat, dans la devise indiquée." },
    { key: "currencyCode", label: "Devise", required: false, aliases: ["Devise"], help: "Par défaut, la devise du fournisseur." },
    { key: "leadTimeDays", label: "Délai (jours)", required: false, aliases: ["Délai (jours)", "Délai", "Delai", "Délai de livraison"], help: "Entier de jours." },
    { key: "minOrderQty", label: "Quantité minimale", required: false, aliases: ["Quantité minimale", "Quantite minimale", "Qté min", "Minimum de commande"], help: "En unité d'achat." },
  ],
  STOCK_INITIAL: [
    { key: "itemCode", label: "Référence", required: true, aliases: ["Référence", "Reference", "Code article", "Article", "AR_Ref"], help: "Code de l'article (déjà importé, géré en stock)." },
    { key: "warehouseCode", label: "Dépôt", required: false, aliases: ["Dépôt", "Depot", "Code dépôt", "Code depot"], help: "Code du dépôt (facultatif s'il n'y en a qu'un)." },
    { key: "quantity", label: "Quantité", required: true, aliases: ["Quantité", "Quantite", "Qté", "Qte", "Stock", "Quantité en stock"], help: "Quantité en unité de stock, 3 décimales au plus." },
    { key: "unitCost", label: "PMP", required: true, aliases: ["PMP", "CUMP", "Coût unitaire", "Cout unitaire", "Prix de revient", "Coût moyen"], help: "PMP initial en FCFA par unité de stock." },
    { key: "date", label: "Date", required: false, aliases: ["Date", "Date inventaire", "Date de stock"], help: "JJ/MM/AAAA (aujourd'hui par défaut, pas dans le futur)." },
  ],
};

export function fieldInfos(type: ImportType): FieldInfo[] {
  return IMPORT_FIELDS[type].map(({ key, label, required }) => ({ key, label, required }));
}
