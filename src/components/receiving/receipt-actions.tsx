"use client";

import { useState } from "react";
import { Undo2 } from "lucide-react";
import { WriteButton } from "@/components/license/write-button";
import { ReasonDialog } from "@/components/purchase-requests/reason-dialog";
import { useActionRunner } from "@/components/use-action-runner";
import { cancelReceiptAction } from "@/app/(app)/stock/receptions/actions";

/** Contre-passation d'une réception validée (Responsable Achats, motif obligatoire). */
export function ReceiptActions({ id, number, canCancel }: { id: string; number: string; canCancel: boolean }) {
  const { run, pending } = useActionRunner();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canCancel) return null;

  return (
    <>
      <WriteButton variant="outline" className="h-11 px-4 text-red-700" onClick={() => setOpen(true)} data-testid="rec-cancel">
        <Undo2 /> Contre-passer la réception
      </WriteButton>
      <ReasonDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setError(null);
        }}
        title={`Contre-passer ${number} ?`}
        description="Le stock reçu est retiré et les quantités reviennent au restant dû du bon de commande. Cette opération est tracée et irréversible. Elle est refusée si une partie du stock a déjà été sortie."
        label="Motif de la contre-passation"
        confirmLabel="Contre-passer"
        destructive
        pending={pending}
        error={error}
        testId="rec-cancel-dialog"
        onConfirm={async (reason) => {
          setError(null);
          await run(() => cancelReceiptAction({ id, reason }), {
            success: "Réception contre-passée. Le stock a été corrigé.",
            onSuccess: () => setOpen(false),
            onError: (f) => setError(f.message),
            silentCodes: ["STOCK_INSUFFICIENT"],
          });
        }}
      />
    </>
  );
}
