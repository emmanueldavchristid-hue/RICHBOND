"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PackageMinus } from "lucide-react";
import { DataTable, type DataColumn, type DataTablePageInfo, type FilterDef } from "@/components/data-table";
import { DateCell } from "@/components/date-cell";
import { DocNumber } from "@/components/doc-number";
import { WriteButton } from "@/components/license/write-button";
import { MoneyCell } from "@/components/money-cell";
import { StatusBadge } from "@/components/status-badge";
import { ISSUE_STATUS_LABELS } from "./labels";
import type { IssueRowView } from "./types";

/** Liste des bons de sortie (SOR-…), avec le bouton « Nouvelle sortie » pour le Magasinier et le Responsable. */
export function IssuesTable({
  rows,
  pageInfo,
  warehouses,
  departments,
  showCosts,
  canIssue,
}: {
  rows: IssueRowView[];
  pageInfo: DataTablePageInfo;
  warehouses: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  showCosts: boolean;
  canIssue: boolean;
}) {
  const router = useRouter();
  const columns = useMemo<DataColumn<IssueRowView>[]>(() => {
    const cols: DataColumn<IssueRowView>[] = [
      {
        id: "number",
        header: "N°",
        sticky: "first",
        mobile: "title",
        cell: (r) => (
          <Link href={`/stock/sorties/${r.id}`} className="text-primary hover:underline" data-testid="sor-link">
            <DocNumber value={r.number} />
          </Link>
        ),
      },
      { id: "date", header: "Date", mobile: "subtitle", cell: (r) => <DateCell value={r.issuedAt} /> },
      { id: "department", header: "Service", cell: (r) => r.departmentName },
      { id: "requester", header: "Demandeur", cell: (r) => r.requesterName },
      { id: "reason", header: "Motif", cell: (r) => <span className="block max-w-56 truncate">{r.reason}</span> },
      { id: "equipment", header: "Machine", cell: (r) => r.equipment ?? <span className="text-muted-foreground/70">—</span> },
      { id: "warehouse", header: "Dépôt", cell: (r) => r.warehouseName },
      { id: "lines", header: "Lignes", align: "right", cell: (r) => r.lineCount },
    ];
    if (showCosts) cols.push({ id: "value", header: "Valeur", align: "right", cell: (r) => <MoneyCell value={r.totalValue} /> });
    cols.push({ id: "status", header: "Statut", cell: (r) => <StatusBadge status={r.status} label={ISSUE_STATUS_LABELS[r.status]} tone={r.status === "ANNULEE" ? "danger" : "success"} /> });
    return cols;
  }, [showCosts]);

  const filters = useMemo<FilterDef[]>(
    () => [
      { param: "depot", label: "Dépôt", options: [{ value: "", label: "Tous les dépôts" }, ...warehouses.map((w) => ({ value: w.id, label: w.name }))] },
      { param: "service", label: "Service", options: [{ value: "", label: "Tous les services" }, ...departments.map((d) => ({ value: d.id, label: d.name }))] },
      {
        param: "statut",
        label: "Statut",
        options: [
          { value: "", label: "Tous les statuts" },
          { value: "VALIDEE", label: "Validées" },
          { value: "ANNULEE", label: "Annulées" },
        ],
      },
      { param: "du", label: "Du (date de début)", type: "date" },
      { param: "au", label: "Au (date de fin)", type: "date" },
    ],
    [warehouses, departments],
  );

  return (
    <DataTable
      testId="sor"
      columns={columns}
      rows={rows}
      pageInfo={pageInfo}
      defaultSort={{ id: "date", dir: "desc" }}
      filters={filters}
      searchPlaceholder="Rechercher un numéro, un demandeur, une machine…"
      rowHref={(r) => `/stock/sorties/${r.id}`}
      rowTestId={(r) => `sor-row-${r.number}`}
      emptyTitle="Aucune sortie trouvée"
      emptyDescription="Les bons de sortie validés par le magasin apparaissent ici."
      toolbarExtra={
        canIssue ? (
          <WriteButton className="h-12 px-5 text-base" onClick={() => router.push("/stock/sorties/nouvelle")} data-testid="sor-new">
            <PackageMinus /> Nouvelle sortie
          </WriteButton>
        ) : null
      }
    />
  );
}
