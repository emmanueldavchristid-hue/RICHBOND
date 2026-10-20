"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { WriteButton } from "@/components/license/write-button";
import { ReasonDialog } from "@/components/purchase-requests/reason-dialog";
import { unitShort } from "@/components/unit-select";
import { useActionRunner } from "@/components/use-action-runner";
import { formatQty } from "@/lib/money";
import { closeRemainderAction } from "@/app/(app)/stock/receptions/actions";
import type { ReceiptOrderLine } from "@/modules/receiving/types";

/** « Solder le reliquat » : le fournisseur ne livrera plus le restant, le bon passe à « Reçu ». */
export function CloseRemainderButton({ orderId, number, lines }: { orderId: string; number: string; lines: ReceiptOrderLine[] }) {
  const { run, pending } = useActionRunner();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <WriteButton variant="outline" className="h-11 px-4" onClick={() => setOpen(true)} data-testid="rec-close-remainder">
        <Lock /> Solder le reliquat
      </WriteButton>
      <ReasonDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setError(null);
        }}
        title={`Solder le reliquat de ${number} ?`}
        description={
          <>
            Les quantités ci-dessous ne seront plus attendues et le bon sera considéré comme entièrement reçu. Cette opération est irréversible.
            <span className="mt-2 block rounded-lg bg-muted p-2 text-foreground" data-testid="rec-close-lines">
              {lines.map((l) => (
                <span key={l.id} className="block text-sm tabular-nums">
                  Ligne {l.lineNo} · {l.itemCode ? `${l.itemCode} – ` : ""}{l.designation} : {formatQty(l.remainingQty)} {unitShort(l.unit)}
                </span>
              ))}
            </span>
          </>
        }
        label="Motif du solde"
        confirmLabel="Solder le reliquat"
        pending={pending}
        error={error}
        testId="rec-close-dialog"
        onConfirm={async (reason) => {
          setError(null);
          await run(() => closeRemainderAction({ orderId, reason }), {
            success: "Reliquat soldé. Le bon de commande est clôturé côté réception.",
            onSuccess: () => setOpen(false),
            onError: (f) => setError(f.message),
          });
        }}
      />
    </>
  );
}
