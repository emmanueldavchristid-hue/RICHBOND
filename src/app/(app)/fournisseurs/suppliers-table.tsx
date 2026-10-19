"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { DataTable, type DataColumn, type DataTablePageInfo, type FilterDef } from "@/components/data-table";
import { WriteButton } from "@/components/license/write-button";
import { COUNTRIES, countryName } from "@/components/referentials/countries";
import { StatusBadge } from "@/components/status-badge";
import {
  ITEM_CATEGORY_LABELS,
  PAYMENT_TERM_LABELS,
  SUPPLIER_STATUS_LABELS,
  SUPPLIER_TYPE_LABELS,
} from "@/modules/referentials/labels";
import type { SupplierRow } from "@/modules/suppliers/service";

const optionsOf = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));

export function SuppliersTable({
  rows,
  pageInfo,
  canCreate,
}: {
  rows: SupplierRow[];
  pageInfo: DataTablePageInfo;
  canCreate: boolean;
}) {
  const router = useRouter();

  const columns = useMemo<DataColumn<SupplierRow>[]>(
    () => [
      {
        id: "code",
        header: "Code",
        sortable: true,
        sticky: "first",
        mobile: "subtitle",
        cell: (r) => (
          <Link href={`/fournisseurs/${r.id}`} className="font-mono text-sm font-medium text-primary underline-offset-4 hover:underline" data-testid="supplier-link">
            {r.code}
          </Link>
        ),
      },
      { id: "name", header: "Raison sociale", sortable: true, sticky: "second", mobile: "title", cell: (r) => r.name },
      {
        id: "type",
        header: "Type",
        sortable: true,
        cell: (r) => <StatusBadge status={r.type} label={SUPPLIER_TYPE_LABELS[r.type]} />,
      },
      {
        id: "country",
        header: "Pays / ville",
        sortable: true,
        cell: (r) => (r.city ? `${countryName(r.country)} – ${r.city}` : countryName(r.country)),
      },
      { id: "currencyCode", header: "Devise", sortable: true, cell: (r) => r.currencyCode },
      {
        id: "paymentTerm",
        header: "Paiement",
        cell: (r) => PAYMENT_TERM_LABELS[r.paymentTerm as keyof typeof PAYMENT_TERM_LABELS] ?? r.paymentTerm,
      },
      { id: "status", header: "Statut", sortable: true, cell: (r) => <StatusBadge status={r.status} label={SUPPLIER_STATUS_LABELS[r.status]} /> },
    ],
    [],
  );

  const filters = useMemo<FilterDef[]>(
    () => [
      { param: "type", label: "Type", options: [{ value: "", label: "Local et import" }, ...optionsOf(SUPPLIER_TYPE_LABELS)] },
      {
        param: "statut",
        label: "Statut",
        options: [
          { value: "", label: "Actifs et en évaluation" },
          { value: "ACTIF", label: "Actifs" },
          { value: "EN_EVALUATION", label: "En évaluation" },
          { value: "BLOQUE", label: "Bloqués" },
          { value: "TOUS", label: "Tous les statuts" },
        ],
      },
      { param: "pays", label: "Pays", options: [{ value: "", label: "Tous les pays" }, ...COUNTRIES.map((c) => ({ value: c.code, label: c.name }))] },
      {
        param: "categorie",
        label: "Catégorie fournie",
        options: [{ value: "", label: "Toutes les catégories" }, ...optionsOf(ITEM_CATEGORY_LABELS)],
      },
    ],
    [],
  );

  return (
    <DataTable
      testId="suppliers"
      columns={columns}
      rows={rows}
      pageInfo={pageInfo}
      defaultSort={{ id: "name", dir: "asc" }}
      filters={filters}
      searchPlaceholder="Rechercher une raison sociale, un code, un NCC, une ville…"
      exportHref="/api/export/fournisseurs"
      rowHref={(r) => `/fournisseurs/${r.id}`}
      rowTestId={(r) => `supplier-row-${r.code}`}
      emptyTitle="Aucun fournisseur trouvé"
      emptyDescription="Modifiez la recherche ou les filtres, ou créez un nouveau fournisseur."
      toolbarExtra={
        canCreate ? (
          <WriteButton className="h-11 px-4" onClick={() => router.push("/fournisseurs/nouveau")} data-testid="supplier-create">
            <Plus /> Nouveau fournisseur
          </WriteButton>
        ) : null
      }
    />
  );
}
