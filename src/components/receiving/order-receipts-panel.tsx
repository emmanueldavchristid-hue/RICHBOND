import type { ReactNode } from "react";
import Link from "next/link";
import { PackageCheck } from "lucide-react";
import { DateCell } from "@/components/date-cell";
import { DocNumber } from "@/components/doc-number";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RECEIPT_STATUS_LABELS } from "@/modules/receiving/labels";
import type { ReceiptOrderView } from "@/modules/receiving/types";

/** Bloc « Réceptions » de la fiche BC : liste des réceptions et accès à la saisie. `closeButton` : bouton « Solder le reliquat ». */
export function OrderReceiptsPanel({
  orderId,
  receipts,
  canReceive,
  closeButton,
}: {
  orderId: string;
  receipts: ReceiptOrderView["receipts"];
  canReceive: boolean;
  closeButton?: ReactNode;
}) {
  return (
    <section aria-labelledby="po-receipts-title" data-testid="po-receipts">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 id="po-receipts-title" className="text-[15px] font-semibold">
          Réceptions
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {closeButton}
          {canReceive ? (
            <Link href={`/stock/receptions/nouvelle?bc=${orderId}`} className={cn(buttonVariants({ variant: "default" }), "h-11 px-4")} data-testid="po-receive">
              <PackageCheck aria-hidden /> Réceptionner
            </Link>
          ) : null}
        </div>
      </div>
      {receipts.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-card px-4 py-4 text-sm text-muted-foreground" data-testid="po-receipts-empty">
          Aucune réception enregistrée pour ce bon.
        </p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card text-sm">
          {receipts.map((r) => (
            <li key={r.id} className="flex min-h-12 flex-wrap items-center justify-between gap-3 px-3 py-2" data-testid={`po-receipt-${r.number}`}>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Link href={`/stock/receptions/${r.id}`} className="text-primary underline-offset-4 hover:underline">
                  <DocNumber value={r.number} />
                </Link>
                <span className="text-muted-foreground">
                  le <DateCell value={r.receivedAt} /> · BL {r.deliveryNoteRef || "—"}
                </span>
              </span>
              <StatusBadge status={r.status} label={RECEIPT_STATUS_LABELS[r.status]} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
