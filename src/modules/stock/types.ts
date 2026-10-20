import type { AbcClass, CoverageSeverity, IssueStatusCode, MovementTypeCode, ReorderPurchaseType } from "./labels";

/**
 * Formes renvoyées par les requêtes et server actions du stock (LOT-07). Fichier de types purs, importable côté client.
 * Quantités : chaînes décimales (3 décimales, unité de stock sauf mention). Montants : FCFA entiers. Dates : `Date`
 * (jours seuls à minuit UTC : les afficher avec `formatDateOnly`). Les champs de prix sont ABSENTS (jamais à 0)
 * quand l'utilisateur n'a pas le droit de les voir.
 */

/** Prévision d'un article (exportée pour LOT-08 : rapports et alertes). Jours au format ISO `yyyy-MM-dd`. */
export interface ItemForecast {
  itemId: string;
  /** Σ des dépôts, unité de stock. */
  onHand: string;
  /** Reste à recevoir des BC ouverts (envoyés, confirmés, partiellement reçus), unité de stock. */
  onOrder: string;
  /** onHand + onOrder. */
  position: string;
  /** Sorties nettes de la fenêtre / nombre de jours. */
  avgDailyConsumption: string;
  /** Null si aucune consommation. */
  coverageDays: number | null;
  /** Aujourd'hui + couverture ; null si aucune consommation. */
  stockoutDate: string | null;
  leadTimeDays: number;
  suggestedSafetyStock: string;
  suggestedReorderPoint: string;
  /** Valeur saisie sur la fiche, sinon suggérée. */
  safetyStock: string;
  reorderPoint: string;
  nextDeliveryDate: string | null;
  /** Rupture prévue avant la prochaine livraison attendue (ou sans livraison attendue). */
  ruptureBeforeDelivery: boolean;
  severity: CoverageSeverity | null;
  belowReorderPoint: boolean;
}

export interface StockListRow {
  id: string;
  code: string;
  name: string;
  category: string;
  criticality: string;
  status: string;
  stockUnit: string;
  /** Σ des dépôts. */
  onHand: string;
  onOrder: string;
  pmp?: number | null;
  value?: number | null;
  /** Délai de réappro effectif en jours (article, fournisseur principal ou défaut). */
  leadTimeDays: number;
  /** Couverture en jours ; null si aucune consommation (affichée « — »). */
  coverageDays: number | null;
  stockoutDate: Date | null;
  /** Point de commande effectif (saisi, sinon suggéré). */
  reorderPoint: string | null;
  abcClass: AbcClass | null;
  belowReorderPoint: boolean;
  dormant: boolean;
  severity: CoverageSeverity | null;
}

export interface StockListTotals {
  /** Valeur du stock (FCFA) de tous les articles du filtre ; absente sans droit de voir le PMP. */
  value?: number;
  count: number;
  belowReorderCount: number;
  dormantCount: number;
  criticalCount: number;
}

export interface StockListResult {
  rows: StockListRow[];
  total: number;
  page: number;
  taille: number;
  pageCount: number;
  totals: StockListTotals;
}

export interface MovementRowView {
  id: string;
  occurredAt: Date;
  itemId: string;
  itemCode: string;
  itemName: string;
  stockUnit: string;
  warehouseName: string;
  type: MovementTypeCode;
  /** Signée. */
  quantity: string;
  stockAfter: string;
  documentRef: string;
  documentHref: string | null;
  departmentName: string | null;
  comment: string | null;
  createdByName: string;
  /** Contre-passation d'un autre mouvement. */
  isReversal: boolean;
  unitCost?: string;
  value?: number;
}

export interface LedgerRowView {
  id: string;
  occurredAt: Date;
  type: MovementTypeCode;
  documentRef: string;
  documentHref: string | null;
  warehouseName: string;
  quantity: string;
  /** Stock du dépôt après le mouvement. */
  stockAfter: string;
  /** Solde progressif : tous dépôts, ou le dépôt filtré. */
  balance: string;
  comment: string | null;
  pmpAfter?: string;
  value?: number;
}

export interface WarehouseStockView {
  warehouseId: string;
  warehouseName: string;
  quantity: string;
  pmp?: string;
}

export interface ItemLedger {
  itemId: string;
  stockUnit: string;
  rows: LedgerRowView[];
  warehouses: WarehouseStockView[];
}

export interface IssueRowView {
  id: string;
  number: string;
  status: IssueStatusCode;
  issuedAt: Date;
  warehouseName: string;
  departmentName: string;
  requesterName: string;
  reason: string;
  equipment: string | null;
  lineCount: number;
  createdByName: string;
  totalValue?: number;
}

export interface IssueLineView {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  stockUnit: string;
  quantity: string;
  unitCost?: string;
  value?: number;
}

export interface IssueDetailView extends IssueRowView {
  lines: IssueLineView[];
  cancelledAt: Date | null;
  cancelledReason: string | null;
  cancelledByName: string | null;
}

/** Article proposé dans la saisie d'une sortie, avec le stock disponible au dépôt choisi. */
export interface IssueItemHit {
  id: string;
  code: string;
  name: string;
  category: string;
  stockUnit: string;
  available: string;
}

export interface ReorderRowView {
  itemId: string;
  code: string;
  name: string;
  criticality: string;
  stockUnit: string;
  purchaseUnit: string;
  onHand: string;
  /** Reste à recevoir des BC ouverts (unité de stock). */
  onOrder: string;
  /** onHand + onOrder. */
  position: string;
  reorderPoint: string | null;
  suggestedReorderPoint: string | null;
  suggestedSafetyStock: string | null;
  coverageDays: number | null;
  stockoutDate: Date | null;
  severity: CoverageSeverity | null;
  leadTimeDays: number;
  /** Quantité suggérée, en unité d'achat (arrondie à l'unité d'achat supérieure, au moins le minimum de commande). */
  suggestedQty: string;
  minOrderQty: string | null;
  supplierName: string | null;
  /** LOCAL / IMPORT d'après le fournisseur principal ; A_DEFINIR sans fournisseur principal. */
  purchaseType: ReorderPurchaseType;
  /** DA ouverte non encore commandée couvrant déjà l'article (case décochée par défaut). */
  existingRequest: { id: string; number: string } | null;
}

export interface ReorderRequestResult {
  requests: { id: string; number: string; type: ReorderPurchaseType; lineCount: number }[];
}

export interface IssueResult {
  id: string;
  number: string;
  /** Valeur totale de la sortie (FCFA) ; absente sans droit de voir les prix. */
  totalValue?: number;
}

export interface TransferResult {
  number: string;
}

export interface AdjustResult {
  number: string;
  stockAfter: string;
  pmpAfter?: string;
}

export interface ThresholdsResult {
  updated: number;
  skipped: number;
}

export interface AbcResult {
  A: number;
  B: number;
  C: number;
  computedAt: Date;
}
