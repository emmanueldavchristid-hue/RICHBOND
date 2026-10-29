import type { InventoryStatus, SelectionReason } from "./rules";

/** DTO sérialisables (Decimal -> string) pour les écrans. */

export interface InventoryCountSummary {
  id: string;
  number: string;
  status: InventoryStatus;
  kind: "TOURNANT" | "COMPLET";
  warehouse: { id: string; code: string; name: string };
  plannedFor: Date | null;
  createdAt: Date;
  openedAt: Date | null;
  lineCount: number;
  countedCount: number;
  /** Visible seulement avec `inventory.view` (jamais pour le Magasinier). */
  reliabilityPct: string | null;
}

/**
 * COMPTAGE AVEUGLE. Ce DTO n'a PAS de champ théorique, PMP ni valeur : il est construit côté serveur à partir d'un
 * `select` Prisma qui ne lit même pas ces colonnes (voir `SHEET_LINE_SELECT`).
 */
export interface BlindSheetLine {
  id: string;
  itemId: string;
  code: string;
  name: string;
  unit: string;
  barcode: string | null;
  countedQty: string | null;
  recountQty: string | null;
  /** Le premier comptage est à refaire (sans révéler la quantité attendue). */
  recountRequired: boolean;
}

export interface BlindSheet {
  blind: true;
  id: string;
  number: string;
  status: InventoryStatus;
  warehouse: { id: string; code: string; name: string };
  plannedFor: Date | null;
  total: number;
  counted: number;
  lines: BlindSheetLine[];
}

export interface ReviewLine {
  id: string;
  itemId: string;
  code: string;
  name: string;
  unit: string;
  selectionReason: SelectionReason;
  theoreticalQty: string | null;
  pmp: string | null;
  countedQty: string | null;
  recountQty: string | null;
  finalQty: string | null;
  varianceQty: string | null;
  /** FCFA entiers signés (au PMP). */
  varianceValue: number | null;
  variancePct: string | null;
  exceedsThreshold: boolean;
  recountRequired: boolean;
  varianceReason: string | null;
  movedDuringCount: boolean;
}

export interface InventoryReview {
  id: string;
  number: string;
  status: InventoryStatus;
  kind: "TOURNANT" | "COMPLET";
  warehouse: { id: string; code: string; name: string };
  thresholdPct: string;
  thresholdValue: number;
  openedAt: Date | null;
  submittedAt: Date | null;
  validatedAt: Date | null;
  comment: string | null;
  lines: ReviewLine[];
  totals: { lines: number; counted: number; withVariance: number; exceeding: number; movedDuringCount: number; varianceValue: number; absVarianceValue: number };
  /** % d'articles sans écart (figé à la validation, sinon calculé en direct). */
  reliabilityPct: string;
}

export interface SelectionRow {
  itemId: string;
  code: string;
  name: string;
  abcClass: string | null;
  reason: SelectionReason;
  lastCountedAt: Date | null;
}
