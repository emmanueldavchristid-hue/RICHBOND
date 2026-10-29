"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { DataTable, type DataColumn, type DataTablePageInfo, type FilterDef } from "@/components/data-table";
import { ExportButton } from "@/components/data-table/toolbar";
import { WriteButton } from "@/components/license/write-button";
import { MoneyCell } from "@/components/money-cell";
import { StatusBadge } from "@/components/status-badge";
import { INVOICE_STATUS_LABELS, type InvoiceTab } from "@/modules/invoices/labels";
import type { InvoiceRow } from "@/modules/invoices/types";
import type { Serialized } from "@/modules/referentials/serialize";

type Row = Serialized<InvoiceRow>;

const optionsOf = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));

/** Date « jour » (minuit UTC) : affichée sans décalage de fuseau. */
function DayCell({ value }: { value: Date | string }) {
  const [y, m, d] = (typeof value === "string" ? value : value.toISOString()).slice(0, 10).split("-");
  return <span>{`${d}/${m}/${y}`}</span>;
}

const EMPTY: Record<InvoiceTab, { title: string; description: string }> = {
  "a-traiter": { title: "Aucune facture à traiter", description: "Les factures saisies ou conformes en attente de bon à payer apparaîtront ici." },
  ecarts: { title: "Aucun écart ni litige", description: "Les factures dont le prix ou la quantité diffère du bon de commande apparaîtront ici." },
  "bon-a-payer": { title: "Aucune facture en bon à payer", description: "Les factures validées pour paiement, pas encore transmises à la comptabilité." },
  transmises: { title: "Aucune facture transmise", description: "Les factures envoyées à la comptabilité apparaîtront ici." },
  tous: { title: "Aucune facture trouvée", description: "Modifiez la recherche ou les filtres, ou saisissez une nouvelle facture." },
};

export function InvoicesTable({
  rows,
  pageInfo,
  tab,
  canCreate,
  suppliers,
}: {
  rows: Row[];
  pageInfo: DataTablePageInfo;
  tab: InvoiceTab;
  canCreate: boolean;
  suppliers: { id: string; label: string }[];
}) {
  const router = useRouter();

  const columns = useMemo<DataColumn<Row>[]>(
    () => [
      {
        id: "numero",
        header: "N°",
        sortable: true,
        mobile: "title",
        cell: (r) => (
          <Link href={`/achats/factures/${r.id}`} className="doc-number text-primary hover:underline" data-testid="inv-link">
            {r.number}
          </Link>
        ),
      },
      { id: "status", header: "Statut", cell: (r) => <StatusBadge status={r.status} /> },
      {
        id: "fournisseur",
        header: "Fournisseur",
        sortable: true,
        mobile: "subtitle",
        cell: (r) => (
          <span className="block max-w-48 truncate" title={r.supplierName}>
            {r.supplierName}
          </span>
        ),
      },
      { id: "supplierInvoiceNo", header: "N° du fournisseur", cell: (r) => <span className="whitespace-nowrap">{r.supplierInvoiceNo}</span> },
      {
        id: "orders",
        header: "Bons de commande",
        cell: (r) => (r.orderNumbers.length ? <span className="doc-number">{r.orderNumbers.join(", ")}</span> : <span className="text-muted-foreground">—</span>),
      },
      { id: "date", header: "Date", sortable: true, cell: (r) => <DayCell value={r.invoiceDate} /> },
      {
        id: "echeance",
        header: "Échéance",
        sortable: true,
        cell: (r) => (
          <span className="inline-flex flex-col">
            <DayCell value={r.dueDate} />
            {r.daysOverdue > 0 ? <span className="text-xs font-medium text-red-700">{r.daysOverdue} j de retard</span> : null}
          </span>
        ),
      },
      {
        id: "montant",
        header: "Montant TTC",
        sortable: true,
        align: "right",
        cell: (r) => (
          <span className="inline-flex flex-col items-end">
            <MoneyCell value={r.totalTtc} currency={r.currencyCode} decimals={r.currencyCode === "XOF" ? 0 : 2} />
            {r.currencyCode !== "XOF" && r.totalTtcXof !== null ? (
              <span className="text-xs text-muted-foreground">
                <MoneyCell value={r.totalTtcXof} currency="XOF" />
              </span>
            ) : null}
          </span>
        ),
      },
      {
        id: "gaps",
        header: "Lignes en écart",
        align: "right",
        cell: (r) => (r.gapLineCount > 0 ? <span className="font-medium text-amber-700">{r.gapLineCount}</span> : <span className="text-muted-foreground">—</span>),
      },
    ],
    [],
  );

  const filters = useMemo<FilterDef[]>(() => {
    const f: FilterDef[] = [];
    if (tab === "tous") f.push({ param: "statut", label: "Statut", options: [{ value: "", label: "Tous les statuts" }, ...optionsOf(INVOICE_STATUS_LABELS)] });
    f.push(
      { param: "fournisseur", label: "Fournisseur", options: [{ value: "", label: "Tous les fournisseurs" }, ...suppliers.map((s) => ({ value: s.id, label: s.label }))] },
      {
        param: "echeance",
        label: "Échéance",
        options: [
          { value: "", label: "Toutes les échéances" },
          { value: "en-retard", label: "En retard" },
          { value: "semaine", label: "Cette semaine" },
          { value: "mois", label: "Ce mois-ci" },
        ],
      },
    );
    return f;
  }, [tab, suppliers]);

  return (
    <DataTable
      testId="inv-list"
      columns={columns}
      rows={rows}
      pageInfo={pageInfo}
      defaultSort={{ id: "date", dir: "desc" }}
      filters={filters}
      searchPlaceholder="Rechercher un n° de facture, un fournisseur, un bon de commande…"
      exportHref="/api/export/factures"
      rowHref={(r) => `/achats/factures/${r.id}`}
      rowTestId={(r) => `inv-row-${r.number.replace(/\s+/g, "-")}`}
      rowClassName={(r) => (r.daysOverdue > 0 ? "bg-red-50 hover:bg-red-100/70" : undefined)}
      emptyTitle={EMPTY[tab].title}
      emptyDescription={EMPTY[tab].description}
      toolbarExtra={
        <>
          <ExportButton href="/api/export/factures-ecarts" query="" testId="inv-export-gaps" label="Exporter les écarts" />
          {canCreate ? (
            <WriteButton className="h-11 px-4" onClick={() => router.push("/achats/factures/nouvelle")} data-testid="inv-create">
              <Plus /> Nouvelle facture
            </WriteButton>
          ) : null}
        </>
      }
    />
  );
}
