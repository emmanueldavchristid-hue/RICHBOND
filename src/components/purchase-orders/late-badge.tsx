import { cn } from "@/lib/utils";

/** « En retard de 4 j » (rouge) ; « À relancer » (orange) pour un envoi sans confirmation. */
export function LateBadge({ daysLate, className }: { daysLate: number; className?: string }) {
  return (
    <span
      data-testid="late-badge"
      className={cn("inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-red-800 ring-1 ring-red-200 ring-inset", className)}
    >
      {daysLate > 0 ? `En retard de ${daysLate} j` : "En retard"}
    </span>
  );
}

export function RemindBadge({ className }: { className?: string }) {
  return (
    <span
      data-testid="remind-badge"
      title="Ce bon n'est pas confirmé (ou en retard) depuis plusieurs jours ouvrés : pensez à relancer le fournisseur."
      className={cn("inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-amber-800 ring-1 ring-amber-200 ring-inset", className)}
    >
      À relancer
    </span>
  );
}
