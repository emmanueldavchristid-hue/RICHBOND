import Link from "next/link";
import { DateCell } from "@/components/date-cell";
import { DocNumber } from "@/components/doc-number";
import { EmptyState } from "@/components/empty-state";
import { MoneyCell } from "@/components/money-cell";
import { QtyCell } from "@/components/qty-cell";
import { MovementTypeBadge, SignedQty } from "./movements-table";
import type { LedgerRowView } from "./types";

/** Fiche de stock d'un article : entrées, sorties, solde progressif et PMP après chaque mouvement. */
export function LedgerTable({ rows, unit, showCosts }: { rows: LedgerRowView[]; unit: string; showCosts: boolean }) {
  if (rows.length === 0) {
    return <EmptyState title="Aucun mouvement pour cet article" description="Les réceptions, sorties, transferts et ajustements apparaîtront ici avec le solde après chaque opération." />;
  }
  return (
    <div className="overflow-x-auto rounded-xl border bg-card" data-testid="stk-ledger">
      <table className="w-full min-w-[44rem] text-sm">
        <thead className="text-left text-xs font-medium text-muted-foreground">
          <tr className="border-b">
            <th className="h-10 px-3">Date</th>
            <th className="px-3">Mouvement</th>
            <th className="px-3">Pièce</th>
            <th className="px-3">Dépôt</th>
            <th className="px-3 text-right">Entrée / sortie</th>
            <th className="px-3 text-right">Solde</th>
            {showCosts ? <th className="px-3 text-right">PMP après</th> : null}
            {showCosts ? <th className="px-3 text-right">Valeur</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.id} className="h-11 transition-colors hover:bg-background" data-testid="stk-ledger-row">
              <td className="px-3 whitespace-nowrap tabular-nums">
                <DateCell value={r.occurredAt} />
              </td>
              <td className="px-3">
                <MovementTypeBadge type={r.type} />
              </td>
              <td className="px-3">
                {r.documentHref ? (
                  <Link href={r.documentHref} className="text-primary hover:underline">
                    <DocNumber value={r.documentRef} />
                  </Link>
                ) : (
                  <DocNumber value={r.documentRef} />
                )}
              </td>
              <td className="px-3">{r.warehouseName}</td>
              <td className="px-3 text-right">
                <SignedQty value={r.quantity} unit={unit} />
              </td>
              <td className="px-3 text-right font-medium tabular-nums">
                <QtyCell value={r.balance} unit={unit} />
              </td>
              {showCosts ? (
                <td className="px-3 text-right tabular-nums">
                  <MoneyCell value={r.pmpAfter} decimals={2} />
                </td>
              ) : null}
              {showCosts ? (
                <td className="px-3 text-right tabular-nums">
                  <MoneyCell value={r.value} />
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
