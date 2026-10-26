import ExcelJS from "exceljs";
import { BusinessError } from "@/lib/errors";
import { IMPORT_MAX_BYTES, IMPORT_MAX_ROWS } from "./types";

export interface RawLine {
  /** Numéro de ligne dans le fichier (l'en-tête est la ligne 1). */
  line: number;
  cells: Record<string, string>;
}

export interface ParsedFile {
  headers: string[];
  lines: RawLine[];
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Texte d'une cellule Excel (nombres sans mise en forme, dates en AAAA-MM-JJ, formules par leur résultat). */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return isoDate(v);
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return "";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) return o.richText.map((p) => String((p as { text?: unknown }).text ?? "")).join("").trim();
    if ("result" in o) return cellText(o.result);
    if (typeof o.text === "string") return o.text.trim();
    if ("error" in o) return "";
  }
  return "";
}

export function detectFormat(fileName: string): "xlsx" | "csv" {
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "xlsx") return "xlsx";
  if (ext === "csv" || ext === "txt") return "csv";
  throw new BusinessError("IMPORT_FORMAT", "Format non pris en charge : utilisez un fichier Excel (.xlsx) ou CSV (.csv).");
}

/** UTF-8 si valide, sinon Latin1 (exports Sage / Excel français). Le BOM est retiré. */
export function decodeCsv(buffer: Buffer): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder("latin1").decode(buffer);
  }
  return text.replace(/^﻿/, "");
}

/** Analyse CSV (guillemets, séparateur `;` ou `,` détecté sur la première ligne). */
export function parseCsvText(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const count = (c: string) => firstLine.split(c).length - 1;
  const sep = count(";") >= count(",") && count(";") > 0 ? ";" : count(",") > 0 ? "," : count("\t") > 0 ? "\t" : ";";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((v) => v.trim()));
}

function toParsed(matrix: string[][]): ParsedFile {
  const headerIdx = matrix.findIndex((r) => r.some((c) => c !== ""));
  if (headerIdx < 0) throw new BusinessError("IMPORT_VIDE", "Le fichier est vide.");
  const rawHeaders = matrix[headerIdx];
  // En-têtes vides ou répétés : suffixe pour garder une clé unique par colonne.
  const seen = new Map<string, number>();
  const headers = rawHeaders.map((h, i) => {
    const base = h || `Colonne ${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
  const lines: RawLine[] = [];
  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const m = matrix[r];
    if (!m.some((c) => c !== "")) continue;
    const cells: Record<string, string> = {};
    headers.forEach((h, i) => {
      cells[h] = m[i] ?? "";
    });
    lines.push({ line: r + 1, cells });
  }
  if (lines.length === 0) throw new BusinessError("IMPORT_VIDE", "Le fichier ne contient aucune ligne de données sous l'en-tête.");
  if (lines.length > IMPORT_MAX_ROWS) {
    throw new BusinessError("IMPORT_TROP_LONG", `Fichier trop long (${lines.length} lignes) : ${IMPORT_MAX_ROWS} lignes au maximum par import.`);
  }
  return { headers, lines };
}

export async function parseImportFile(fileName: string, buffer: Buffer): Promise<ParsedFile> {
  if (buffer.length === 0) throw new BusinessError("IMPORT_VIDE", "Le fichier est vide.");
  if (buffer.length > IMPORT_MAX_BYTES) throw new BusinessError("IMPORT_TROP_GROS", "Fichier trop volumineux (5 Mo maximum).");
  if (detectFormat(fileName) === "csv") return toParsed(parseCsvText(decodeCsv(buffer)));
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new BusinessError("IMPORT_ILLISIBLE", "Fichier Excel illisible : enregistrez-le au format .xlsx puis réessayez.");
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new BusinessError("IMPORT_VIDE", "Le classeur ne contient aucune feuille.");
  const width = ws.columnCount;
  const matrix: string[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const cells: string[] = [];
    for (let c = 1; c <= width; c++) cells.push(cellText(row.getCell(c).value));
    while (matrix.length < rowNumber - 1) matrix.push([]);
    matrix[rowNumber - 1] = cells;
  });
  return toParsed(matrix);
}
