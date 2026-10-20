import type { CSSProperties } from "react";
import { TONE_COLORS } from "@/components/status-badge";
import { cn } from "@/lib/utils";

/** « En retard de 4 j » (rouge) ; « À relancer » (ambre) pour un envoi sans confirmation. */
export function LateBadge({ daysLate, className }: { daysLate: number; className?: string }) {
  return (
    <span data-testid="late-badge" style={{ "--tone": TONE_COLORS.danger } as CSSProperties} className={cn("status-badge", className)}>
      {daysLate > 0 ? `En retard de ${daysLate} j` : "En retard"}
    </span>
  );
}

export function RemindBadge({ className }: { className?: string }) {
  return (
    <span
      data-testid="remind-badge"
      title="Ce bon n'est pas confirmé (ou en retard) depuis plusieurs jours ouvrés : pensez à relancer le fournisseur."
      style={{ "--tone": TONE_COLORS.warning } as CSSProperties}
      className={cn("status-badge", className)}
    >
      À relancer
    </span>
  );
}
