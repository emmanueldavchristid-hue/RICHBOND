import { formatQty } from "@/lib/money";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { unitShort } from "@/components/unit-select";

export interface StockSnapshotView {
  onHand: string;
  coverageDays: number | null;
}

/** Stock actuel et couverture en jours ; « – » tant que la gestion des stocks n'est pas disponible (D14). */
export function StockCoverageCell({ snapshot, unit }: { snapshot: StockSnapshotView | null | undefined; unit?: string | null }) {
  if (!snapshot) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={<span className="inline-flex min-h-6 cursor-help items-center text-muted-foreground" tabIndex={0} data-testid="stock-coverage-empty" />}
        >
          –
        </TooltipTrigger>
        <TooltipContent>Disponible avec la gestion des stocks</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <span data-testid="stock-coverage">
      {formatQty(snapshot.onHand)}
      {unit ? ` ${unitShort(unit)}` : ""}
      <span className="text-muted-foreground">
        {snapshot.coverageDays != null ? ` · ${snapshot.coverageDays} j de couverture` : " · couverture –"}
      </span>
    </span>
  );
}
