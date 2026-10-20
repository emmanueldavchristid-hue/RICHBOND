import Link from "next/link";
import { DateCell } from "@/components/date-cell";
import { DocNumber } from "@/components/doc-number";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import type { RecentReceipt } from "@/modules/receiving/types";

/** Réceptions récentes (page d'accueil des réceptions). */
export function ReceiptsTable({ rows }: { rows: RecentReceipt[] }) {
  if (rows.length === 0) {
    return <EmptyState title="Aucune réception enregistrée" description="Les réceptions validées apparaissent ici, les plus récentes d'abord." />;
  }
  return (
    <div className="overflow-x-auto rounded-xl border bg-card" data-testid="rec-recent">
      <table className="w-full min-w-[48rem] text-sm">
        <thead className="text-left text-xs font-medium text-muted-foreground">
          <tr className="border-b">
            <th className="h-10 px-3">N°</th>
            <th className="px-3">Date</th>
            <th className="px-3">Bon de commande</th>
            <th className="px-3">Fournisseur</th>
            <th className="px-3">N° BL</th>
            <th className="px-3">Ponctualité</th>
            <th className="px-3">Statut</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.id} className="h-11 transition-colors hover:bg-background" data-testid={`rec-row-${r.number}`}>
              <td className="px-3">
                <Link href={`/stock/receptions/${r.id}`} className="text-primary underline-offset-4 hover:underline">
                  <DocNumber value={r.number} />
                </Link>
              </td>
              <td className="px-3 whitespace-nowrap tabular-nums">
                <DateCell value={r.receivedAt} />
              </td>
              <td className="px-3">
                <Link href={`/achats/commandes/${r.orderId}`} className="text-primary underline-offset-4 hover:underline">
                  <DocNumber value={r.orderNumber} />
                </Link>
              </td>
              <td className="max-w-56 truncate px-3">{r.supplierName}</td>
              <td className="px-3">{r.deliveryNoteRef || <span className="text-muted-foreground/70">—</span>}</td>
              <td className="px-3 whitespace-nowrap">
                {r.daysLate > 0 ? <span className="text-red-700 dark:text-red-400">{r.daysLate} j de retard</span> : <span className="text-muted-foreground">À l&apos;heure</span>}
                {r.nonConformityCount > 0 ? <span className="ml-2 text-amber-700 dark:text-amber-400">· avec refus</span> : null}
              </td>
              <td className="px-3">
                <StatusBadge status={r.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
