import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/** Pastille orange d'écart de prix : « +32 % vs dernier prix (12 500 FCFA le 03/09/2026, FRS-00012) ». */
export function PriceAlertBadge({ message, className }: { message: string; className?: string }) {
  return (
    <span
      role="note"
      data-testid="price-alert"
      className={cn("inline-flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-300 ring-inset", className)}
    >
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{message}</span>
    </span>
  );
}
