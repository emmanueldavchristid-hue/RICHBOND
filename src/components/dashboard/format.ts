import { formatNumber, formatFcfa } from "@/lib/money";
import type { KpiCard } from "@/modules/reporting/types";

/** Valeur d'un KPI prête à afficher : « 1 250 000 FCFA », « 4,5 j », « 92,5 % », « – » sans donnée. */
export function formatKpiValue(kpi: Pick<KpiCard, "unit" | "value">): string {
  if (kpi.value === null) return "–";
  switch (kpi.unit) {
    case "FCFA":
      return formatFcfa(Math.round(kpi.value));
    case "DAYS":
      return `${formatNumber(kpi.value, 1)} j`;
    case "PERCENT":
      return `${formatNumber(kpi.value, 1)} %`;
    default:
      return formatNumber(kpi.value, 0);
  }
}

const NBSP = " ";

/** Montant court pour les axes et étiquettes de graphique : « 1,2 M », « 850 k ». */
export function formatCompactFcfa(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${formatNumber(n / 1_000_000_000, 1)}${NBSP}Md`;
  if (abs >= 1_000_000) return `${formatNumber(n / 1_000_000, 1)}${NBSP}M`;
  if (abs >= 1_000) return `${formatNumber(n / 1_000, 0)}${NBSP}k`;
  return String(Math.round(n));
}

/** « 2026-10-25 » -> « 25/10/2026 » (jour d'Abidjan déjà calculé côté serveur : aucun décalage de fuseau). */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** « 2026-10-25 » -> « 25/10 » pour les cellules étroites. */
export function formatDayShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}
