import type { GoodDirection, KpiUnit } from "./types";

/**
 * Formes des rapports (LOT-15, EX-61 à EX-63). Fichier de types purs, importable côté client.
 * Un rapport = des indicateurs (cartes) + des tableaux génériques, rendus à l'identique à l'écran, en PDF et en Excel.
 * Une donnée dont le lot n'existe pas encore est marquée `unavailable` (message), jamais inventée ni mise à 0.
 */
export const REPORT_KINDS = ["quotidien", "hebdomadaire", "mensuel"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const REPORT_LABELS: Record<ReportKind, string> = {
  quotidien: "Rapport quotidien",
  hebdomadaire: "Rapport hebdomadaire",
  mensuel: "Rapport mensuel",
};

export type ReportKpiUnit = KpiUnit | "TURNS" | "COEF";

export interface ReportKpi {
  key: string;
  label: string;
  unit: ReportKpiUnit;
  /** Null : pas de donnée sur la période (affiché « – »). */
  value: number | null;
  /** Même indicateur sur la période précédente (null si non comparé). */
  previous: number | null;
  variationPct: number | null;
  goodDirection: GoodDirection;
  /** Définition affichée en infobulle (docs/kpi.md). */
  help: string;
  /** Précision courte sous la valeur. */
  hint?: string;
  /** Raison de l'indisponibilité (lot non livré, périmètre) : la valeur reste null. */
  unavailable?: string;
}

export type ReportCellType = "text" | "doc" | "date" | "money" | "int" | "qty" | "pct" | "days";

export interface ReportColumn {
  key: string;
  label: string;
  type: ReportCellType;
}

export type ReportCell = string | number | null;

export interface ReportTable {
  key: string;
  title: string;
  /** Ligne d'explication sous le titre (ex. « 10 premiers sur 23 »). */
  note?: string;
  columns: ReportColumn[];
  rows: Record<string, ReportCell>[];
  emptyText: string;
  /** Section non disponible (lot non livré) : message affiché à la place du tableau. */
  unavailable?: string;
}

export interface ReportFilterValue {
  label: string;
  value: string;
}

export interface Report {
  kind: ReportKind;
  title: string;
  /** « 01/11/2026 », « Semaine du … au … », « Novembre 2026 ». */
  periodLabel: string;
  /** Jours d'Abidjan, `yyyy-MM-dd`, bornes incluses. */
  from: string;
  to: string;
  generatedAt: string;
  company: string;
  /** Filtres appliqués (y compris le périmètre imposé à l'Acheteur). */
  filters: ReportFilterValue[];
  notes: string[];
  kpis: ReportKpi[];
  tables: ReportTable[];
}
