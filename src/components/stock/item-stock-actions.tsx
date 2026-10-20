"use client";

import { useState } from "react";
import { ArrowLeftRight, SlidersHorizontal } from "lucide-react";
import { WriteButton } from "@/components/license/write-button";
import { AdjustDialog } from "./adjust-dialog";
import { TransferDialog, type PrefilledItem } from "./transfer-dialog";

/** Boutons Transfert / Ajustement de la fiche de stock d'un article (article déjà choisi). */
export function ItemStockActions({
  item,
  warehouses,
  canTransfer,
  canAdjust,
}: {
  item: PrefilledItem;
  warehouses: { id: string; name: string }[];
  canTransfer: boolean;
  canAdjust: boolean;
}) {
  const [transferOpen, setTransferOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  if (!canTransfer && !canAdjust) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {canTransfer ? (
        <WriteButton variant="outline" className="h-11 px-4" onClick={() => setTransferOpen(true)} data-testid="stk-item-transfer">
          <ArrowLeftRight /> Transférer
        </WriteButton>
      ) : null}
      {canAdjust ? (
        <WriteButton variant="outline" className="h-11 px-4" onClick={() => setAdjustOpen(true)} data-testid="stk-item-adjust">
          <SlidersHorizontal /> Ajuster le stock
        </WriteButton>
      ) : null}
      {canTransfer ? <TransferDialog open={transferOpen} onOpenChange={setTransferOpen} warehouses={warehouses} item={item} /> : null}
      {canAdjust ? <AdjustDialog open={adjustOpen} onOpenChange={setAdjustOpen} warehouses={warehouses} item={item} /> : null}
    </div>
  );
}
