import { buildMultiWorkbook, sheet as sheetSpec, type ExcelColumn, type SheetSpec } from "@/lib/excel";
import { formatDateTime } from "@/lib/dates";
import { formatKpiValue } from "./report-format";
import type { Report, ReportCell, ReportColumn, ReportKpi, ReportKpiUnit, ReportTable } from "./report-types";

/**
 * Export Excel d'un rapport (LOT-15) : données brutes, une feuille « Informations », une feuille « Indicateurs » et une feuille par tableau.
 * Les montants et quantités restent des nombres (formats Excel), les dates de vraies dates ; `buildMultiWorkbook`
 * neutralise les formules dans les textes (`sanitizeCell`).
 */
const UNIT_LABELS: Record<ReportKpiUnit, string> = {
  FCFA: "FCFA",
  COUNT: "nombre",
  DAYS: "jours",
  PERCENT: "%",
  TURNS: "tours/an",
  COEF: "coefficient",
};

const FORMATS: Partial<Record<ReportColumn["type"], string>> = {
  money: "#,##0",
  int: "#,##0",
  qty: "#,##0.###",
  pct: "0.0",
  days: "0.0",
};

function cellValue(type: ReportColumn["type"], v: ReportCell): string | number | Date | null {
  if (v === null || v === undefined || v === "") return null;
  if (type === "date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return new Date(`${v.slice(0, 10)}T00:00:00.000Z`);
  if (FORMATS[type] !== undefined) return Number(v);
  return v;
}

function tableSheet(t: ReportTable): SheetSpec {
  if (t.unavailable) {
    return sheetSpec(t.title, [{ header: "Information", width: 100, value: (r: { m: string }) => r.m }], [{ m: t.unavailable }]);
  }
  const columns: ExcelColumn<Record<string, ReportCell>>[] = t.columns.map((c) => ({
    header: c.label,
    width: c.type === "text" ? 32 : c.type === "doc" ? 18 : 16,
    format: FORMATS[c.type],
    value: (r) => cellValue(c.type, r[c.key] ?? null),
  }));
  return sheetSpec(t.title, columns, t.rows);
}

/** Les noms de feuille Excel : 31 caractères, sans `: \ / ? * [ ]`, uniques. */
function uniqueSheetNames(specs: SheetSpec[]): SheetSpec[] {
  const used = new Set<string>();
  return specs.map((s) => {
    const base = s.name.replace(/[:\\/?*[\]]/g, " ").slice(0, 31).trim() || "Feuille";
    let name = base;
    let i = 2;
    while (used.has(name.toLowerCase())) name = `${base.slice(0, 28)} ${i++}`;
    used.add(name.toLowerCase());
    return { ...s, name };
  });
}

export async function buildReportWorkbook(report: Report): Promise<Buffer> {
  const info: { k: string; v: string }[] = [
    { k: "Société", v: report.company },
    { k: "Rapport", v: report.title },
    { k: "Période", v: report.periodLabel },
    { k: "Généré le", v: formatDateTime(new Date(report.generatedAt)) },
    ...report.filters.map((f) => ({ k: f.label, v: f.value })),
    ...report.notes.map((n) => ({ k: "Note", v: n })),
  ];
  const kpiCols: ExcelColumn<ReportKpi>[] = [
    { header: "Indicateur", width: 34, value: (k) => k.label },
    { header: "Valeur", width: 18, value: (k) => (k.unavailable ? "Non disponible" : k.value), format: "#,##0.##" },
    { header: "Unité", width: 12, value: (k) => UNIT_LABELS[k.unit] },
    { header: "Valeur affichée", width: 20, value: (k) => (k.unavailable ? "Non disponible" : formatKpiValue(k.unit, k.value)) },
    { header: "Période précédente", width: 20, value: (k) => k.previous, format: "#,##0.##" },
    { header: "Variation (%)", width: 14, value: (k) => k.variationPct, format: "0.0" },
    { header: "Précision", width: 40, value: (k) => k.unavailable ?? k.hint ?? null },
    { header: "Définition", width: 90, value: (k) => k.help },
  ];
  return buildMultiWorkbook(
    uniqueSheetNames([
      sheetSpec("Informations", [{ header: "Champ", width: 22, value: (r: { k: string }) => r.k }, { header: "Valeur", width: 90, value: (r: { v: string }) => r.v }] as ExcelColumn<{ k: string; v: string }>[], info),
      sheetSpec("Indicateurs", kpiCols, report.kpis),
      ...report.tables.map(tableSheet),
    ]),
  );
}
