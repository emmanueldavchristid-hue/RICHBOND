"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { CriticalityBadge } from "@/components/criticality-badge";
import { DataTable, type DataColumn, type DataTablePageInfo, type FilterDef } from "@/components/data-table";
import { WriteButton } from "@/components/license/write-button";
import { StatusBadge } from "@/components/status-badge";
import { unitShort } from "@/components/unit-select";
import type { ItemRow } from "@/modules/items/service";
import { CRITICALITY_LABELS, ITEM_CATEGORY_LABELS, ITEM_STATUS_LABELS } from "@/modules/referentials/labels";

const optionsOf = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));

export function ArticlesTable({
  rows,
  pageInfo,
  families,
  canCreate,
}: {
  rows: ItemRow[];
  pageInfo: DataTablePageInfo;
  families: string[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const categorie = useSearchParams().get("categorie");

  const columns = useMemo<DataColumn<ItemRow>[]>(
    () => [
      {
        id: "code",
        header: "Code",
        sortable: true,
        sticky: "first",
        mobile: "subtitle",
        cell: (r) => (
          <Link href={`/stock/articles/${r.id}`} className="font-mono text-sm font-medium text-primary underline-offset-4 hover:underline" data-testid="item-link">
            {r.code}
          </Link>
        ),
      },
      { id: "name", header: "Désignation", sortable: true, sticky: "second", mobile: "title", cell: (r) => r.name },
      { id: "category", header: "Catégorie", sortable: true, cell: (r) => ITEM_CATEGORY_LABELS[r.category as keyof typeof ITEM_CATEGORY_LABELS] ?? r.category },
      { id: "family", header: "Famille", sortable: true, cell: (r) => r.family ?? "–" },
      { id: "criticality", header: "Criticité", sortable: true, cell: (r) => <CriticalityBadge value={r.criticality} /> },
      {
        id: "stockUnit",
        header: "Unité",
        sortable: true,
        cell: (r) =>
          r.purchaseUnit !== r.stockUnit ? `${unitShort(r.stockUnit)} (achat : ${unitShort(r.purchaseUnit)})` : unitShort(r.stockUnit),
      },
      { id: "equipment", header: "Équipement", sortable: true, cell: (r) => r.equipment ?? "–" },
      { id: "mainSupplier", header: "Fournisseur principal", cell: (r) => r.mainSupplier?.name ?? "–" },
      { id: "status", header: "Statut", sortable: true, cell: (r) => <StatusBadge status={r.status} label={ITEM_STATUS_LABELS[r.status]} /> },
    ],
    [],
  );

  const filters = useMemo<FilterDef[]>(() => {
    const list: FilterDef[] = [
      {
        param: "categorie",
        label: "Catégorie",
        options: [{ value: "", label: "Toutes les catégories" }, ...optionsOf(ITEM_CATEGORY_LABELS)],
      },
      {
        param: "criticite",
        label: "Criticité",
        options: [{ value: "", label: "Toutes les criticités" }, ...optionsOf(CRITICALITY_LABELS)],
      },
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
      {
        param: "famille",
        label: "Famille",
        options: [{ value: "", label: "Toutes les familles" }, ...families.map((f) => ({ value: f, label: f }))],
      },
    ];
    if (categorie === "PDR") {
      list.push({ param: "equipement", label: "Équipement", type: "text", placeholder: "Équipement / machine", maxLength: 120 });
    }
    return list;
  }, [families, categorie]);

  return (
    <DataTable
      testId="articles"
      columns={columns}
      rows={rows}
      pageInfo={pageInfo}
      defaultSort={{ id: "code", dir: "asc" }}
      filters={filters}
      searchPlaceholder="Rechercher un code, une désignation, une référence fournisseur…"
      exportHref="/api/export/articles"
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
  );
}
