import { formatQty } from "@/lib/money";
import { unitShort } from "@/components/unit-select";

/** Quantité avec son unité : « 200 KG », « 12,5 m ». */
export function QtyCell({
  value,
  unit,
  empty = "–",
}: {
  value: number | string | null | undefined;
  unit?: string | null;
  empty?: string;
}) {
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">{empty}</span>;
  return (
    <span>
      {formatQty(value)}
      {unit ? ` ${unitShort(unit)}` : ""}
    </span>
  );
}
