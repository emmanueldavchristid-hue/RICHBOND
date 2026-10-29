import type { BlindSheetLine } from "./types";

/**
 * COMPTAGE AVEUGLE : la feuille destinée au Magasinier est construite uniquement à partir de ce `select`, qui ne lit
 * ni `theoreticalQty`, ni `pmp`, ni `adjustmentMovementId`, ni les motifs d'écart. Un test vérifie cette liste.
 */
export const SHEET_LINE_SELECT = {
  id: true,
  itemId: true,
  countedQty: true,
  recountQty: true,
  recountRequired: true,
  item: { select: { code: true, name: true, stockUnit: true, barcode: true } },
} as const;

export interface SheetLineRow {
  id: string;
  itemId: string;
  countedQty: { toString(): string } | null;
  recountQty: { toString(): string } | null;
  recountRequired: boolean;
  item: { code: string; name: string; stockUnit: string; barcode: string | null };
}

/** Construction explicite champ par champ : un champ ajouté plus tard à la ligne source ne fuit jamais. */
export function toBlindLine(row: SheetLineRow): BlindSheetLine {
  return {
    id: row.id,
    itemId: row.itemId,
    code: row.item.code,
    name: row.item.name,
    unit: row.item.stockUnit,
    barcode: row.item.barcode,
    countedQty: row.countedQty === null ? null : row.countedQty.toString(),
    recountQty: row.recountQty === null ? null : row.recountQty.toString(),
    recountRequired: row.recountRequired,
  };
}
