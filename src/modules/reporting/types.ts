/**
 * Formes renvoyées par les tableaux de bord d'accueil (LOT-08, EX-60). Fichier de types purs : importable côté client.
 *
 * Contrat :
 * - montants en FCFA entiers (`number`, jamais de flottant monétaire) ;
 * - quantités en chaînes décimales (unité de stock) ;
 * - dates sérialisables : chaînes ISO (`yyyy-MM-dd` pour un jour d'Abidjan, `yyyy-MM` pour un mois, ISO complet pour un instant) ;
 * - le tableau du Magasinier ne contient AUCUN champ monétaire (ni valeur, ni PMP, ni prix) ;
 * - une carte dont la donnée n'existe pas encore (dossiers import, inventaire) est ABSENTE de `cards`, jamais à 0 factice ;
 * - chaque carte et chaque ligne porte un `href` vers la liste filtrée existante.
 */

export const DASHBOARD_KINDS = ["RESPONSABLE", "ACHETEUR", "MAGASINIER"] as const;
export type DashboardKind = (typeof DASHBOARD_KINDS)[number];

/** Ton d'une carte : 0 reste « neutral » (jamais rouge). */
export type CardTone = "neutral" | "attention" | "critical";

/** Carte « à traiter » cliquable. */
export interface ActionCard {
  /** Identifiant stable (testId, clé React), ex. `da-a-valider`. */
  key: string;
  label: string;
  count: number;
  /** Liste filtrée correspondante (query string existante). */
  href: string;
  tone: CardTone;
  /** Précision courte, ex. « dont 2 arrêts de production ». */
  hint?: string;
}

export type KpiUnit = "FCFA" | "COUNT" | "DAYS" | "PERCENT";

/** Sens métier d'une hausse : détermine la couleur de la variation (UP = bien, DOWN = mal ; NONE = neutre). */
export type GoodDirection = "UP" | "DOWN" | "NONE";

/** KPI du mois comparé au mois précédent à date équivalente (T1). */
export interface KpiCard {
  key: string;
  label: string;
  unit: KpiUnit;
  /** FCFA entier, nombre, jours (1 décimale) ou % (0-100, 1 décimale). Null : pas de donnée (affichage « – »). */
  value: number | null;
  /** Même indicateur sur le mois précédent à date équivalente. */
  previous: number | null;
  /** Variation en % arrondie à 1 décimale ; null si `previous` est nul/absent (jamais de division par zéro). */
  variationPct: number | null;
  goodDirection: GoodDirection;
  href?: string;
  /** Aide courte (infobulle) : définition du KPI. */
  help?: string;
}

// ------------------------------------------------------------------ séries de graphiques

/** Achats d'un mois (12 mois glissants, mois vides inclus à 0), BC validés, hors annulés. */
export interface MonthlyPurchasePoint {
  /** `yyyy-MM`. */
  month: string;
  /** « oct. 25 » : libellé court français. */
  label: string;
  localXof: number;
  importXof: number;
  totalXof: number;
}

export interface TopSupplierPoint {
  supplierId: string;
  name: string;
  amountXof: number;
  /** Part du total des achats des 12 mois, en % (1 décimale). */
  sharePct: number;
  href: string;
}

export interface StockByCategoryPoint {
  /** Code `ItemCategory`. */
  category: string;
  label: string;
  valueXof: number;
  sharePct: number;
}

/** Article critique ou classe A dont la rupture prévue précède la prochaine livraison (T4). */
export interface RuptureRiskRow {
  itemId: string;
  code: string;
  name: string;
  abcClass: "A" | "B" | "C" | null;
  criticality: string;
  stockUnit: string;
  onHand: string;
  coverageDays: number | null;
  /** `yyyy-MM-dd`. */
  stockoutDate: string | null;
  /** `yyyy-MM-dd` ; null = aucune livraison attendue. */
  nextDeliveryDate: string | null;
  severity: "ROUGE" | "ORANGE" | "VERT" | null;
  href: string;
}

// ------------------------------------------------------------------ Responsable Achats

export interface ResponsibleDashboard {
  kind: "RESPONSABLE";
  /** Instant de calcul (ISO) : l'horloge est passée en argument (TEST_NOW). */
  generatedAt: string;
  /** Mois courant `yyyy-MM` (Abidjan) et mois comparé. */
  month: string;
  previousMonth: string;
  /** Jour d'Abidjan jusqu'auquel les deux mois sont comparés (T1), `yyyy-MM-dd`. */
  comparedUntil: string;
  /** DA à valider, BC à valider, BC en retard, risques de rupture, non-conformités ouvertes. */
  cards: ActionCard[];
  /** Montant commandé, nombre de BC, délai DA → BC, délai BC → réception, taux à temps, valeur du stock, ruptures. */
  kpis: KpiCard[];
  purchasesByMonth: MonthlyPurchasePoint[];
  topSuppliers: TopSupplierPoint[];
  stockByCategory: StockByCategoryPoint[];
  ruptureRisks: { total: number; rows: RuptureRiskRow[] };
}

// ------------------------------------------------------------------ Acheteur

export interface BuyerRequestRow {
  id: string;
  number: string;
  /** NORMALE, URGENTE, ARRET_PRODUCTION. */
  urgency: string;
  departmentName: string;
  requesterName: string;
  /** `yyyy-MM-dd`. */
  neededBy: string;
  /** Ancienneté depuis la validation, en jours calendaires. */
  ageDays: number;
  /** Montant estimé FCFA (null si non chiffré) ; autorisé : l'Acheteur voit les prix d'achat. */
  estimatedTotal: number | null;
  href: string;
}

/** Ligne de BC. `updatedAt` et `displayNumber` alimentent directement `ReminderDialog`. */
export interface BuyerOrderRow {
  id: string;
  /** Numéro attribué à la validation. */
  number: string;
  displayNumber: string;
  /** ISO complet : verrou optimiste du `ReminderDialog`. */
  updatedAt: string;
  status: string;
  type: "LOCAL" | "IMPORT";
  supplierName: string;
  /** `yyyy-MM-dd`. */
  expectedDate: string;
  /** Jours calendaires de retard (0 si pas en retard). */
  daysLate: number;
  totalXof: number | null;
  /** Relance possible : statut relançable et `needsReminder` vrai. */
  needsReminder: boolean;
  /** Dernière relance (ISO), null si jamais relancé. */
  lastRemindedAt: string | null;
  href: string;
}

export interface BuyerDashboard {
  kind: "ACHETEUR";
  generatedAt: string;
  /** DA assignées à traiter, BC à envoyer, BC en retard, BC à relancer ; dossiers import absents tant que LOT-12 n'existe pas. */
  cards: ActionCard[];
  myRequests: { total: number; rows: BuyerRequestRow[] };
  ordersToSend: { total: number; rows: BuyerOrderRow[] };
  lateOrders: { total: number; rows: BuyerOrderRow[] };
  /** BC à relancer (envoyés non confirmés ou en retard sans relance récente). */
  ordersToRemind: { total: number; rows: BuyerOrderRow[] };
}

// ------------------------------------------------------------------ Magasinier (AUCUN montant)

export interface ExpectedDeliveryRow {
  orderId: string;
  number: string;
  supplierName: string;
  /** `yyyy-MM-dd`. */
  expectedDate: string;
  daysLate: number;
  lineCount: number;
  href: string;
}

export interface BelowReorderRow {
  itemId: string;
  code: string;
  name: string;
  stockUnit: string;
  onHand: string;
  onOrder: string;
  reorderPoint: string | null;
  coverageDays: number | null;
  severity: "ROUGE" | "ORANGE" | "VERT" | null;
  href: string;
}

export interface RecentIssueRow {
  id: string;
  number: string;
  /** `yyyy-MM-dd`. */
  issuedAt: string;
  departmentName: string;
  requesterName: string;
  lineCount: number;
  href: string;
}

export interface StorekeeperDashboard {
  kind: "MAGASINIER";
  generatedAt: string;
  /** Réceptions attendues aujourd'hui, cette semaine, articles sous le point de commande ; inventaire absent tant que LOT-11 n'existe pas. */
  cards: ActionCard[];
  expectedToday: { total: number; rows: ExpectedDeliveryRow[] };
  expectedThisWeek: { total: number; rows: ExpectedDeliveryRow[] };
  belowReorder: { total: number; rows: BelowReorderRow[] };
  recentIssues: RecentIssueRow[];
}

export type DashboardData = ResponsibleDashboard | BuyerDashboard | StorekeeperDashboard;

/** Nombre maximum de lignes renvoyées par liste d'un tableau de bord (jamais de liste complète). */
export const DASHBOARD_LIST_LIMIT = 8;
/** Limite de la liste des risques de rupture. */
export const DASHBOARD_RISK_LIMIT = 10;
