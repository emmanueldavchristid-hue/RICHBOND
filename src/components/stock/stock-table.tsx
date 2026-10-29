"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { CriticalityBadge } from "@/components/criticality-badge";
import { DataTable, type DataColumn, type DataTablePageInfo, type FilterDef } from "@/components/data-table";
import { DateCell } from "@/components/date-cell";
import { WriteButton } from "@/components/license/write-button";
import { StatusBadge } from "@/components/status-badge";
import { MoneyCell } from "@/components/money-cell";
import { QtyCell } from "@/components/qty-cell";
import { CRITICALITY_LABELS, ITEM_CATEGORY_LABELS, ITEM_STATUS_LABELS } from "@/modules/referentials/labels";
import { CoverageBadge, CoverageLegend } from "./coverage";
import { STOCK_SITUATION_OPTIONS } from "./labels";
import type { StockListRow } from "./types";

const optionsOf = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));

/**
 * Liste des articles avec leur stock (LOT-07) : quantité, PMP, valeur, couverture colorée et date de rupture prévue.
 * Le PMP et la valeur ne sont affichés que si `showCosts` (droit `price.viewPmp`).
 */
export function StockTable({
  rows,
  pageInfo,
  warehouses,
  families,
  showCosts,
  canCreate,
}: {
  rows: StockListRow[];
  pageInfo: DataTablePageInfo;
  warehouses: { id: string; name: string }[];
  families: string[];
  showCosts: boolean;
  canCreate: boolean;
}) {
  const router = useRouter();
  const categorie = useSearchParams().get("categorie");

  const columns = useMemo<DataColumn<StockListRow>[]>(() => {
    const cols: DataColumn<StockListRow>[] = [
      {
        id: "code",
        header: "Code",
        sortable: true,
        sticky: "first",
        mobile: "subtitle",
        cell: (r) => (
          <Link href={`/stock/articles/${r.id}`} className="doc-number text-primary hover:underline" data-testid="item-link">
            {r.code}
          </Link>
        ),
      },
      {
        id: "name",
        header: "Désignation",
        sortable: true,
        sticky: "second",
        mobile: "title",
        cell: (r) => (
          <div className="max-w-64 min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate" title={r.name}>{r.name}</span>
              {r.status !== "ACTIF" ? <StatusBadge status={r.status} label={ITEM_STATUS_LABELS[r.status as keyof typeof ITEM_STATUS_LABELS]} /> : null}
            </div>
            <div className="truncate text-xs text-muted-foreground" data-testid={`article-meta-${r.code}`}>
              {[ITEM_CATEGORY_LABELS[r.category as keyof typeof ITEM_CATEGORY_LABELS] ?? r.category, r.family, r.equipment].filter(Boolean).join(" · ")}
            </div>
          </div>
        ),
      },
      { id: "criticality", header: "Criticité", cell: (r) => <CriticalityBadge value={r.criticality} /> },
      {
        id: "stock",
        header: "Stock",
        sortable: true,
        align: "right",
        cell: (r) => (
          <span className={Number(r.onHand) <= 0 ? "font-medium text-[#B91C1C] dark:text-red-400" : undefined} data-testid={`stk-onhand-${r.code}`}>
            <QtyCell value={r.onHand} unit={r.stockUnit} />
          </span>
        ),
      },
    ];
    if (showCosts) {
      cols.push(
        { id: "pmp", header: "PMP", align: "right", cell: (r) => <MoneyCell value={r.pmp} /> },
        { id: "valeur", header: "Valeur", sortable: true, align: "right", cell: (r) => <MoneyCell value={r.value} /> },
      );
    }
    cols.push(
      {
        id: "couverture",
        header: "Couverture",
        sortable: true,
        align: "right",
        cell: (r) => <CoverageBadge days={r.coverageDays} leadTimeDays={r.leadTimeDays} testId={`stk-coverage-${r.code}`} />,
      },
      {
        id: "rupture",
        header: "Rupture prévue",
        sortable: true,
        cell: (r) => <DateCell value={r.stockoutDate} />,
      },
    );
    return cols;
  }, [showCosts]);

  const filters = useMemo<FilterDef[]>(() => {
    const list: FilterDef[] = [
      { param: "categorie", label: "Catégorie", options: [{ value: "", label: "Toutes les catégories" }, ...optionsOf(ITEM_CATEGORY_LABELS)] },
      { param: "criticite", label: "Criticité", options: [{ value: "", label: "Toutes les criticités" }, ...optionsOf(CRITICALITY_LABELS)] },
      { param: "depot", label: "Dépôt", options: [{ value: "", label: "Tous les dépôts" }, ...warehouses.map((w) => ({ value: w.id, label: w.name }))] },
      { param: "classe", label: "Classe ABC", options: [{ value: "", label: "Toutes les classes" }, { value: "A", label: "Classe A" }, { value: "B", label: "Classe B" }, { value: "C", label: "Classe C" }] },
      { param: "situation", label: "Situation de stock", options: STOCK_SITUATION_OPTIONS.map((o) => ({ ...o })) },
      {
        param: "statut",
        label: "Statut",
        options: [
          { value: "", label: "Articles actifs" },
          { value: "BLOQUE", label: "Bloqués" },
          { value: "OBSOLETE", label: "Obsolètes" },
          { value: "TOUS", label: "Tous les statuts" },
        ],
      },
      { param: "famille", label: "Famille", options: [{ value: "", label: "Toutes les familles" }, ...families.map((f) => ({ value: f, label: f }))] },
    ];
    if (categorie === "PDR") {
      list.push({ param: "equipement", label: "Équipement", type: "text", placeholder: "Équipement / machine", maxLength: 120 });
    }
    return list;
  }, [warehouses, families, categorie]);

  return (
    <div className="space-y-3">
      <DataTable
        testId="articles"
        columns={columns}
        rows={rows}
        pageInfo={pageInfo}
        defaultSort={{ id: "code", dir: "asc" }}
        filters={filters}
        searchPlaceholder="Rechercher un code, une désignation, une référence fournisseur…"
        exportHref="/api/export/stock"
        rowHref={(r) => `/stock/articles/${r.id}`}
        rowTestId={(r) => `article-row-${r.code}`}
        emptyTitle="Aucun article trouvé"
        emptyDescription="Modifiez la recherche ou les filtres, ou créez un nouvel article."
        toolbarExtra={
          canCreate ? (
            <WriteButton className="h-11 px-4" onClick={() => router.push("/stock/articles/nouveau")} data-testid="item-create">
              <Plus /> Nouvel article
            </WriteButton>
          ) : null
        }
      />
      <CoverageLegend />
    </div>
  );
}
