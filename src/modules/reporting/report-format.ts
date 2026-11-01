import { formatFcfa, formatNumber } from "@/lib/money";
import type { ReportCell, ReportCellType, ReportKpiUnit } from "./report-types";

/** Mise en forme commune écran / PDF (fichier pur). Montants « 1 250 000 FCFA », dates JJ/MM/AAAA, « – » si vide. */
export const EMPTY = "–";

export function frDay(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export function formatKpiValue(unit: ReportKpiUnit, value: number | null): string {
  if (value === null) return EMPTY;
  switch (unit) {
    case "FCFA":
      return formatFcfa(Math.round(value));
    case "COUNT":
      return formatNumber(value, 0);
    case "DAYS":
      return `${formatNumber(value, 1)} j`;
    case "PERCENT":
      return `${formatNumber(value, 1)} %`;
    case "TURNS":
      return `${formatNumber(value, 1)} tours/an`;
    case "COEF":
      return formatNumber(value, 3);
  }
}

export function formatCell(type: ReportCellType, v: ReportCell): string {
  if (v === null || v === undefined || v === "") return EMPTY;
  switch (type) {
    case "date":
      return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? frDay(v.slice(0, 10)) : String(v);
    case "money":
      return formatFcfa(Math.round(Number(v)));
    case "int":
      return formatNumber(Number(v), 0);
    case "qty":
      return formatNumber(Number(v), 3);
    case "pct":
      return `${formatNumber(Number(v), 1)} %`;
    case "days":
      return `${formatNumber(Number(v), 1)} j`;
    default:
      return String(v);
  }
}

export const isNumericType = (t: ReportCellType): boolean => t === "money" || t === "int" || t === "qty" || t === "pct" || t === "days";
