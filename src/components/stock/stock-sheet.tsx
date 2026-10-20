import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { QtyCell } from "@/components/qty-cell";
import { MoneyCell } from "@/components/money-cell";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/modules/auth/session";
import { itemLedger } from "@/modules/stock";
import { ItemStockActions } from "./item-stock-actions";
import { LedgerTable } from "./ledger-table";

async function StockSheetContent({
  user,
  itemId,
  code,
  name,
  stockUnit,
  warehouses,
}: {
  user: CurrentUser;
  itemId: string;
  code: string;
  name: string;
  stockUnit: string;
  warehouses: { id: string; name: string }[];
}) {
  const ledger = await itemLedger(user, { itemId });
  const showCosts = can(user, "price.viewPmp");
  return (
    <div className="space-y-4" data-testid="stk-sheet">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ul className="flex flex-wrap gap-3" data-testid="stk-sheet-levels">
          {ledger.warehouses.length === 0 ? <li className="text-sm text-muted-foreground">Aucun stock dans les dépôts pour le moment.</li> : null}
          {ledger.warehouses.map((w) => (
            <li key={w.warehouseId} className="min-w-40 rounded-xl border bg-card px-4 py-3" data-testid={`stk-level-${w.warehouseName}`}>
              <p className="text-xs text-muted-foreground">{w.warehouseName}</p>
              <p className="text-xl font-semibold tabular-nums">
                <QtyCell value={w.quantity} unit={stockUnit} />
              </p>
              {showCosts && w.pmp !== undefined ? (
                <p className="text-xs text-muted-foreground">
                  PMP : <MoneyCell value={w.pmp} />
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        <ItemStockActions
          item={{ id: itemId, code, name, stockUnit, levels: ledger.warehouses }}
          warehouses={warehouses}
          canTransfer={can(user, "stock.transfer")}
          canAdjust={can(user, "stock.adjust")}
        />
      </div>
      <LedgerTable rows={ledger.rows} unit={stockUnit} showCosts={showCosts} />
    </div>
  );
}

/** Onglet « Fiche de stock » d'un article : stock par dépôt, PMP, puis entrées et sorties avec solde progressif. */
export function StockSheet(props: React.ComponentProps<typeof StockSheetContent>) {
  return (
    <Suspense fallback={<Skeleton className="h-48 w-full" />}>
      <StockSheetContent {...props} />
    </Suspense>
  );
}
