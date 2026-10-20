"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListChecks, Plus } from "lucide-react";
import { DataTable, type DataColumn, type DataTablePageInfo, type FilterDef } from "@/components/data-table";
import { WriteButton } from "@/components/license/write-button";
import { MoneyCell } from "@/components/money-cell";
import { AgeBadge } from "@/components/purchase-orders/age-badge";
import { LateBadge, RemindBadge } from "@/components/purchase-orders/late-badge";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { PO_STATUS_LABELS, PO_TYPE_LABELS } from "@/modules/purchase-orders/labels";
import type { OrderRow } from "@/modules/purchase-orders/queries";
import type { Serialized } from "@/modules/referentials/serialize";

type Row = Serialized<OrderRow>;
type Tab = "a-valider" | "en-cours" | "en-retard" | "recus" | "tous";

const optionsOf = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));

/** Date « jour » (stockée à minuit UTC) : affichée sans décalage de fuseau. */
function DayCell({ value }: { value: Date | string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const iso = (typeof value === "string" ? value : value.toISOString()).slice(0, 10);
  const [y, m, d] = iso.split("-");
  return <span>{`${d}/${m}/${y}`}</span>;
}

export function OrdersTable({
  rows,
  pageInfo,
  tab,
  canCreate,
  toRemindCount,
  suppliers,
  buyers,
  currencies,
}: {
  rows: Row[];
  pageInfo: DataTablePageInfo;
  tab: Tab;
  canCreate: boolean;
  toRemindCount: number;
  suppliers: { id: string; label: string }[];
  buyers: { id: string; name: string }[];
  currencies: string[];
}) {
  const router = useRouter();

  const columns = useMemo<DataColumn<Row>[]>(
    () => [
      {
        id: "number",
        header: "N°",
        sortable: true,
        mobile: "title",
        cell: (r) => (
          <Link href={`/achats/commandes/${r.id}`} className="doc-number text-primary hover:underline" data-testid="po-link">
            {r.displayNumber}
          </Link>
        ),
      },
      { id: "status", header: "Statut", sortable: true, cell: (r) => <StatusBadge status={r.status} /> },
      {
        id: "supplier",
        header: "Fournisseur",
        sortable: true,
        mobile: "subtitle",
        cell: (r) => (
          <span className="block max-w-56 truncate" title={`${r.supplier.code} – ${r.supplier.name}`}>
            {r.supplier.name}
            <span className="doc-number ml-1.5 text-[11px] font-normal text-muted-foreground">{r.supplier.code}</span>
          </span>
        ),
      },
      { id: "type", header: "Type", cell: (r) => <span className="whitespace-nowrap">{PO_TYPE_LABELS[r.type]}</span> },
      {
        id: "totalTtcXof",
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
      { id: "expectedDate", header: "Date attendue", sortable: true, cell: (r) => <DayCell value={r.expectedDate} /> },
      {
        id: "delay",
        header: "Suivi",
        cell: (r) => (
          <span className="flex flex-wrap gap-1.5">
            {r.late ? <LateBadge daysLate={r.daysLate} /> : null}
            {r.needsReminder ? <RemindBadge /> : null}
            {!r.late && !r.needsReminder ? <span className="text-muted-foreground">—</span> : null}
          </span>
        ),
      },
      {
        id: "age",
        header: "Ancienneté",
        cell: (r) => (r.status === "A_VALIDER" || r.status === "ENVOYE" ? <AgeBadge days={r.ageDays} severity={r.ageSeverity} /> : <span className="text-muted-foreground">—</span>),
      },
      { id: "buyer", header: "Acheteur", cell: (r) => <span className="whitespace-nowrap">{r.createdBy.name}</span> },
    ],
    [],
  );

  const filters = useMemo<FilterDef[]>(() => {
    const f: FilterDef[] = [];
    if (tab === "tous") f.push({ param: "statut", label: "Statut", options: [{ value: "", label: "Tous les statuts" }, ...optionsOf(PO_STATUS_LABELS)] });
    f.push(
      { param: "fournisseur", label: "Fournisseur", options: [{ value: "", label: "Tous les fournisseurs" }, ...suppliers.map((s) => ({ value: s.id, label: s.label }))] },
      { param: "type", label: "Type", options: [{ value: "", label: "Local et import" }, ...optionsOf(PO_TYPE_LABELS)] },
    );
    if (currencies.length > 1) f.push({ param: "devise", label: "Devise", options: [{ value: "", label: "Toutes les devises" }, ...currencies.map((c) => ({ value: c, label: c === "XOF" ? "FCFA (XOF)" : c }))] });
    f.push({ param: "acheteur", label: "Acheteur", options: [{ value: "", label: "Tous les acheteurs" }, ...buyers.map((b) => ({ value: b.id, label: b.name }))] });
    f.push({ param: "relance", label: "Relances", options: [{ value: "", label: "Tous les bons" }, { value: "1", label: `À relancer (${toRemindCount})` }] });
    return f;
  }, [tab, suppliers, buyers, currencies, toRemindCount]);

  const emptyByTab: Record<Tab, { title: string; description: string }> = {
    "a-valider": { title: "Aucun bon de commande à valider", description: "Tous les bons soumis ont été traités." },
    "en-cours": { title: "Aucun bon de commande en cours", description: "Les bons validés et pas encore reçus apparaîtront ici." },
    "en-retard": { title: "Aucun retard de livraison", description: "Aucune livraison n'a dépassé la date promise (ou demandée)." },
    recus: { title: "Aucun bon reçu", description: "Les bons entièrement reçus ou clôturés apparaîtront ici." },
    tous: { title: "Aucun bon de commande trouvé", description: "Modifiez la recherche ou les filtres, ou créez un nouveau bon." },
  };

  return (
    <DataTable
      testId="po-list"
      columns={columns}
      rows={rows}
      pageInfo={pageInfo}
      defaultSort={tab === "en-retard" ? { id: "expectedDate", dir: "asc" } : { id: "createdAt", dir: "desc" }}
      filters={filters}
      searchPlaceholder="Rechercher un numéro, un fournisseur, un article, une DA…"
      exportHref="/api/export/commandes"
      rowHref={(r) => `/achats/commandes/${r.id}`}
      rowTestId={(r) => `po-row-${r.displayNumber.replace(/\s+/g, "-")}`}
      rowClassName={(r) => (r.late ? "bg-red-50 hover:bg-red-100/70" : undefined)}
      emptyTitle={emptyByTab[tab].title}
      emptyDescription={emptyByTab[tab].description}
      toolbarExtra={
        canCreate ? (
          <>
            <Button variant="outline" className="h-11 px-4" onClick={() => router.push("/achats/commandes/a-commander")} data-testid="po-to-order">
              <ListChecks /> À commander
            </Button>
            <WriteButton className="h-11 px-4" onClick={() => router.push("/achats/commandes/nouvelle")} data-testid="po-create">
              <Plus /> Nouveau BC
            </WriteButton>
          </>
        ) : null
      }
    />
  );
}
