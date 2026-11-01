"use client";

import { useMemo } from "react";
import Link from "next/link";
import { DataTable, type DataColumn, type DataTablePageInfo, type FilterDef } from "@/components/data-table";
import { DateCell } from "@/components/date-cell";
import { StatusBadge } from "@/components/status-badge";
import { IMPORT_MODE_LABELS, IMPORT_STATUS_LABELS, MILESTONE_LABELS } from "@/modules/import-files/labels";
import type { ImportFileRow } from "@/modules/import-files";
import type { Serialized } from "@/modules/referentials/serialize";

type Row = Serialized<ImportFileRow>;

const optionsOf = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));

export function ImportFilesTable({ rows, pageInfo, suppliers }: { rows: Row[]; pageInfo: DataTablePageInfo; suppliers: { id: string; label: string }[] }) {
  const columns = useMemo<DataColumn<Row>[]>(
    () => [
      {
        id: "numero",
        header: "N° du dossier",
        mobile: "title",
        cell: (r) => (
          <Link href={`/import/${r.id}`} className="doc-number text-primary hover:underline" data-testid="imp-link">
            {r.number}
          </Link>
        ),
      },
      { id: "status", header: "Statut", cell: (r) => <StatusBadge status={r.status} /> },
      {
        id: "fournisseur",
        header: "Fournisseur",
        mobile: "subtitle",
        cell: (r) => (
          <span className="block max-w-48 truncate" title={r.supplier.name}>
            {r.supplier.name}
          </span>
        ),
      },
      { id: "mode", header: "Mode", cell: (r) => <span>{IMPORT_MODE_LABELS[r.mode]}</span> },
      {
        id: "orders",
        header: "Bons de commande",
        cell: (r) => (r.orderNumbers.length ? <span className="doc-number">{r.orderNumbers.join(", ")}</span> : <span className="text-muted-foreground/70">—</span>),
      },
      {
        id: "jalon",
        header: "Jalon en cours",
        cell: (r) =>
          r.current ? (
            <span className="inline-flex flex-col">
              <span className="whitespace-nowrap">{MILESTONE_LABELS[r.current.code]}</span>
              <span className="text-xs text-muted-foreground">
                prévu le <DateCell value={r.current.plannedDate} />
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground/70">{r.status === "OUVERT" ? "Tous les jalons réalisés" : "—"}</span>
          ),
      },
      {
        id: "retard",
        header: "Retard",
        cell: (r) =>
          r.late ? (
            <span
              className="inline-flex items-center rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-red-800"
              data-testid="imp-late-badge"
              title="Au moins un jalon prévu est dépassé sans date réelle."
            >
              {r.current && r.current.late ? `${r.current.daysLate} j de retard` : "En retard"}
            </span>
          ) : (
            <span className="text-muted-foreground/70">—</span>
          ),
      },
      { id: "eta", header: "Arrivée prévue", cell: (r) => <DateCell value={r.eta} /> },
      {
        id: "coefficient",
        header: "Coefficient",
        align: "right",
        cell: (r) => (r.coefficient ? <span className="tabular-nums">{r.coefficient}</span> : <span className="text-muted-foreground/70">—</span>),
      },
    ],
    [],
  );

  const filters = useMemo<FilterDef[]>(
    () => [
      { param: "statut", label: "Statut", options: [{ value: "", label: "Tous les statuts" }, ...optionsOf(IMPORT_STATUS_LABELS)] },
      { param: "jalon", label: "Jalon en cours", options: [{ value: "", label: "Tous les jalons" }, ...optionsOf(MILESTONE_LABELS)] },
      { param: "fournisseur", label: "Fournisseur", options: [{ value: "", label: "Tous les fournisseurs" }, ...suppliers.map((s) => ({ value: s.id, label: s.label }))] },
      { param: "retard", label: "Retard", options: [{ value: "", label: "Avec ou sans retard" }, { value: "1", label: "En retard seulement" }] },
    ],
    [suppliers],
  );

  return (
    <DataTable
      testId="imp-list"
      columns={columns}
      rows={rows}
      pageInfo={pageInfo}
      defaultSort={{ id: "numero", dir: "desc" }}
      filters={filters}
      searchPlaceholder="Rechercher un dossier, un fournisseur, un BL, un conteneur, un BC…"
      rowHref={(r) => `/import/${r.id}`}
      rowTestId={(r) => `imp-row-${r.number}`}
      rowClassName={(r) => (r.late ? "bg-red-50/50 hover:bg-red-50" : undefined)}
      emptyTitle="Aucun dossier import"
      emptyDescription="Créez un dossier pour suivre un achat à l'étranger, ou modifiez les filtres."
    />
  );
}
