import ExcelJS from "exceljs";

export interface ExcelColumn<T> {
  header: string;
  width?: number;
  /** Valeur de la cellule : nombre, date, texte ou null. Les montants restent des nombres. */
  value: (row: T) => string | number | Date | null | undefined;
  /** Format Excel (ex. `#,##0` pour un montant, `dd/mm/yyyy` pour une date). */
  format?: string;
}

export const DATE_FORMAT = "dd/mm/yyyy";

/**
 * Neutralise l'injection de formules : un texte commençant par = + - @ (ou tabulation / retour chariot)
 * serait interprété comme une formule à l'ouverture dans Excel. On le préfixe d'une apostrophe.
 * Les nombres et les dates ne sont pas concernés (ils ne sont pas du texte).
 */
export function sanitizeCell<V>(v: V): V | string {
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(v)) return `'${v}`;
  return v;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface SheetSpec {
  name: string;
  columns: ExcelColumn<any>[];
  rows: any[];
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Feuille typée, au type de ligne effacé pour une liste hétérogène (export complet). */
export function sheet<T>(name: string, columns: ExcelColumn<T>[], rows: T[]): SheetSpec {
  return { name, columns, rows };
}

function fillSheet<T>(wb: ExcelJS.Workbook, sheetName: string, columns: ExcelColumn<T>[], rows: T[]) {
  const ws = wb.addWorksheet(sheetName.slice(0, 31));
  ws.columns = columns.map((c) => ({ header: c.header, width: c.width ?? 18 }));
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle" };
  columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.format) col.numFmt = c.format;
  });
  for (const r of rows) {
    const values = columns.map((c) => {
      const v = c.value(r);
      return v === undefined ? null : sanitizeCell(v);
    });
    const added = ws.addRow(values);
    values.forEach((v, i) => {
      if (v instanceof Date) added.getCell(i + 1).numFmt = DATE_FORMAT;
    });
  }
  ws.views = [{ state: "frozen", ySplit: 1 }];
  if (columns.length > 0) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  }
}

/** Classeur de plusieurs feuilles (export complet, LOT-18) : mêmes règles que la feuille unique. */
export async function buildMultiWorkbook(sheets: SheetSpec[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "RICHBOND Achats & Stocks";
  for (const s of sheets) fillSheet(wb, s.name, s.columns, s.rows);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Classeur d'une feuille : en-tête en gras figé, filtres automatiques, dates JJ/MM/AAAA. */
export async function buildWorkbook<T>(sheetName: string, columns: ExcelColumn<T>[], rows: T[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "RICHBOND Achats & Stocks";
  fillSheet(wb, sheetName, columns, rows);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
