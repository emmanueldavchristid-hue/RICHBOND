"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, SlidersHorizontal } from "lucide-react";
import { DataTable, type DataColumn, type DataTablePageInfo, type FilterDef } from "@/components/data-table";
import { DateCell } from "@/components/date-cell";
import { DocNumber } from "@/components/doc-number";
import { WriteButton } from "@/components/license/write-button";
import { MoneyCell } from "@/components/money-cell";
import { QtyCell } from "@/components/qty-cell";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import { AdjustDialog } from "./adjust-dialog";
import { MOVEMENT_TYPE_LABELS, MOVEMENT_TYPE_OPTIONS, MOVEMENT_TYPE_TONES } from "./labels";
import { TransferDialog } from "./transfer-dialog";
import type { MovementRowView } from "./types";

/** Quantité signée : + vert, - rouge sobre, toujours accompagnée du signe. */
export function SignedQty({ value, unit }: { value: string; unit?: string }) {
  const n = Number(value);
  return (
    <span className={cn("font-medium tabular-nums", n > 0 && "text-[#15803D] dark:text-green-400", n < 0 && "text-[#B91C1C] dark:text-red-400")}>
      {n > 0 ? "+" : ""}
      <QtyCell value={value} unit={unit} />
    </span>
  );
}

export function MovementTypeBadge({ type }: { type: MovementRowView["type"] }) {
  return <StatusBadge label={MOVEMENT_TYPE_LABELS[type]} tone={MOVEMENT_TYPE_TONES[type]} />;
}

/** Journal des mouvements de stock : filtres article / dépôt / type / période / service, export Excel. */
export function MovementsTable({
  rows,
  pageInfo,
  warehouses,
  showCosts,
  canTransfer,
  canAdjust,
}: {
  rows: MovementRowView[];
  pageInfo: DataTablePageInfo;
  warehouses: { id: string; name: string }[];
  showCosts: boolean;
  canTransfer: boolean;
  canAdjust: boolean;
}) {
  const [transferOpen, setTransferOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const columns = useMemo<DataColumn<MovementRowView>[]>(() => {
    const cols: DataColumn<MovementRowView>[] = [
      { id: "date", header: "Date", sticky: "first", mobile: "subtitle", cell: (r) => <DateCell value={r.occurredAt} /> },
      {
        id: "item",
        header: "Article",
        mobile: "title",
        cell: (r) => (
          <Link href={`/stock/articles/${r.itemId}?onglet=fiche-de-stock`} className="hover:underline" data-testid="mvt-item-link">
            <span className="doc-number text-muted-foreground">{r.itemCode}</span> <span className="font-medium">{r.itemName}</span>
          </Link>
        ),
      },
      { id: "type", header: "Type", cell: (r) => <MovementTypeBadge type={r.type} /> },
      { id: "warehouse", header: "Dépôt", cell: (r) => r.warehouseName },
      { id: "quantity", header: "Quantité", align: "right", cell: (r) => <SignedQty value={r.quantity} unit={r.stockUnit} /> },
      { id: "stockAfter", header: "Stock après", align: "right", cell: (r) => <QtyCell value={r.stockAfter} unit={r.stockUnit} /> },
    ];
    if (showCosts) cols.push({ id: "value", header: "Valeur", align: "right", cell: (r) => <MoneyCell value={r.value} /> });
    cols.push(
      {
        id: "document",
        header: "Pièce",
        cell: (r) =>
          r.documentHref ? (
            <Link href={r.documentHref} className="text-primary hover:underline">
              <DocNumber value={r.documentRef} />
            </Link>
          ) : (
            <DocNumber value={r.documentRef} />
          ),
      },
      { id: "department", header: "Service", cell: (r) => r.departmentName ?? <span className="text-muted-foreground/70">—</span> },
      { id: "createdBy", header: "Saisi par", cell: (r) => r.createdByName },
    );
    return cols;
  }, [showCosts]);

  const filters = useMemo<FilterDef[]>(
    () => [
      { param: "depot", label: "Dépôt", options: [{ value: "", label: "Tous les dépôts" }, ...warehouses.map((w) => ({ value: w.id, label: w.name }))] },
      { param: "type", label: "Type de mouvement", options: [{ value: "", label: "Tous les types" }, ...MOVEMENT_TYPE_OPTIONS] },
      { param: "du", label: "Du (date de début)", type: "date" },
      { param: "au", label: "Au (date de fin)", type: "date" },
    ],
    [warehouses],
  );

  return (
    <>
      <DataTable
        testId="mvt"
        columns={columns}
        rows={rows}
        pageInfo={pageInfo}
        defaultSort={{ id: "date", dir: "desc" }}
        filters={filters}
        searchPlaceholder="Rechercher un article ou un numéro de pièce…"
        exportHref="/api/export/mouvements"
        rowTestId={(r) => `mvt-row-${r.documentRef}-${r.itemCode}`}
        emptyTitle="Aucun mouvement trouvé"
        emptyDescription="Modifiez la recherche, la période ou les filtres."
        toolbarExtra={
          <>
            {canTransfer ? (
              <WriteButton variant="outline" className="h-11 px-4" onClick={() => setTransferOpen(true)} data-testid="mvt-transfer">
                <ArrowLeftRight /> Transfert entre dépôts
              </WriteButton>
            ) : null}
            {canAdjust ? (
              <WriteButton variant="outline" className="h-11 px-4" onClick={() => setAdjustOpen(true)} data-testid="mvt-adjust">
                <SlidersHorizontal /> Ajustement
              </WriteButton>
            ) : null}
          </>
        }
      />
      {canTransfer ? <TransferDialog open={transferOpen} onOpenChange={setTransferOpen} warehouses={warehouses} /> : null}
      {canAdjust ? <AdjustDialog open={adjustOpen} onOpenChange={setAdjustOpen} warehouses={warehouses} /> : null}
    </>
  );
}
