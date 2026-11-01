import Link from "next/link";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/native-select";
import { REPORT_CATEGORY_LABELS } from "@/modules/reporting/report-defs";
import type { ReportFilterOptions } from "@/modules/reporting/report-options";
import type { ReportKind } from "@/modules/reporting/report-types";

const CATEGORIES = ["MATIERE_PREMIERE", "INTRANT", "PDR", "FOURNITURE", "SERVICE"] as const;
const fieldCls = "flex min-w-40 flex-col gap-1 text-xs font-medium text-muted-foreground";
const inputCls = "h-11 rounded-lg border border-input bg-card px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm text-foreground";

/**
 * Barre de filtres d'un rapport : formulaire GET (l'état vit dans l'adresse). Période selon le rapport,
 * puis catégorie, acheteur, fournisseur, dépôt. Les listes viennent de `reportFilterOptions`.
 */
export function ReportFilters({
  kind,
  values,
  options,
  today,
}: {
  kind: ReportKind;
  values: { date?: string; month?: string; category?: string; buyerId?: string; supplierId?: string; warehouseId?: string };
  options: ReportFilterOptions;
  today: string;
}) {
  return (
    <form method="get" className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3" data-testid="rpt-filters" aria-label="Filtres du rapport">
      {kind === "mensuel" ? (
        <label className={fieldCls}>
          Mois
          <input type="month" name="month" defaultValue={values.month ?? today.slice(0, 7)} className={inputCls} data-testid="rpt-f-month" />
        </label>
      ) : (
        <label className={fieldCls}>
          {kind === "hebdomadaire" ? "Semaine contenant le" : "Jour"}
          <input type="date" name="date" defaultValue={values.date ?? today} className={inputCls} data-testid="rpt-f-date" />
        </label>
      )}
      <label className={fieldCls}>
        Catégorie
        <NativeSelect name="category" defaultValue={values.category ?? ""} data-testid="rpt-f-category">
          <option value="">Toutes</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {REPORT_CATEGORY_LABELS[c]}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className={fieldCls}>
        Acheteur
        <NativeSelect name="buyerId" defaultValue={values.buyerId ?? ""} data-testid="rpt-f-buyer">
          <option value="">Tous</option>
          {options.buyers.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className={fieldCls}>
        Fournisseur
        <NativeSelect name="supplierId" defaultValue={values.supplierId ?? ""} data-testid="rpt-f-supplier">
          <option value="">Tous</option>
          {options.suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className={fieldCls}>
        Dépôt
        <NativeSelect name="warehouseId" defaultValue={values.warehouseId ?? ""} data-testid="rpt-f-warehouse">
          <option value="">Tous</option>
          {options.warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </NativeSelect>
      </label>
      <div className="flex items-center gap-2">
        <Button type="submit" className="h-11 px-4" data-testid="rpt-apply">
          Appliquer
        </Button>
        <Link href={`/rapports/${kind}`} className="inline-flex h-11 items-center px-3 text-sm text-muted-foreground hover:text-foreground" data-testid="rpt-reset">
          Réinitialiser
        </Link>
      </div>
    </form>
  );
}
