"use client";

import { useState } from "react";
import { BellRing } from "lucide-react";
import { WriteButton } from "@/components/license/write-button";
import { ReminderDialog } from "@/components/purchase-orders/reminder-dialog";
import type { BuyerOrderRow } from "@/modules/reporting/types";

/** Bouton « Relancer » direct depuis l'accueil : ouvre le ReminderDialog existant (texte prêt à copier, trace de la relance). */
export function ReminderButton({
  order,
}: {
  order: Pick<BuyerOrderRow, "id" | "updatedAt" | "displayNumber">;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <WriteButton
        type="button"
        variant="outline"
        size="sm"
        className="h-9 gap-1.5 px-3"
        onClick={() => setOpen(true)}
        data-testid={`dash-remind-${order.id}`}
      >
        <BellRing aria-hidden /> Relancer
      </WriteButton>
      {open ? (
        <ReminderDialog
          open={open}
          onOpenChange={setOpen}
          orderId={order.id}
          updatedAt={order.updatedAt}
          displayNumber={order.displayNumber}
        />
      ) : null}
    </>
  );
}
