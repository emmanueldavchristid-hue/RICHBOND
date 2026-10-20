import type { CSSProperties } from "react";
import { AlertTriangle } from "lucide-react";
import { TONE_COLORS } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import { PR_URGENCY_LABELS, type PrUrgency } from "@/modules/purchase-requests/labels";

/**
 * Urgences (DESIGN.md §3) : Normale = texte simple atténué ; Urgente = badge ambre ;
 * Arrêt de production = badge rouge plein avec icône.
 */
export function UrgencyBadge({ urgency, className }: { urgency: PrUrgency; className?: string }) {
  if (urgency === "NORMALE") {
    return (
      <span data-testid={`urgency-${urgency}`} className={cn("text-[13px] text-muted-foreground", className)}>
        {PR_URGENCY_LABELS[urgency]}
      </span>
    );
  }
  if (urgency === "ARRET_PRODUCTION") {
    return (
      <span
        data-testid={`urgency-${urgency}`}
        className={cn("inline-flex h-[22px] items-center gap-1 rounded-md bg-red-600 px-2 text-xs font-semibold whitespace-nowrap text-white", className)}
      >
        <AlertTriangle className="size-3.5" aria-hidden />
        {PR_URGENCY_LABELS[urgency]}
      </span>
    );
  }
  return (
    <span
      data-testid={`urgency-${urgency}`}
      style={{ "--tone": TONE_COLORS.warning } as CSSProperties}
      className={cn("status-badge", className)}
    >
      {PR_URGENCY_LABELS[urgency]}
    </span>
  );
}
