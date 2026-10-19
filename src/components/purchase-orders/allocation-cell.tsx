import { QtyCell } from "@/components/qty-cell";

/** « Commandé / Reste » d'une ligne de DA (unité de la ligne). Reste = 0 : soldé. */
export function AllocationCell({
  ordered,
  remaining,
  unit,
}: {
  ordered: string | number | null | undefined;
  remaining: string | number | null | undefined;
  unit: string;
}) {
  const rest = Number(remaining ?? 0);
  return (
    <span className="inline-flex flex-col items-end text-xs leading-tight tabular-nums" data-testid="allocation-cell">
      <span>
        Commandé : <QtyCell value={ordered ?? 0} unit={unit} />
      </span>
      <span className={rest > 0 ? "font-semibold text-amber-800" : "text-emerald-700"}>
        {rest > 0 ? (
          <>
            Reste : <QtyCell value={rest} unit={unit} />
          </>
        ) : (
          "Soldé"
        )}
      </span>
    </span>
  );
}
