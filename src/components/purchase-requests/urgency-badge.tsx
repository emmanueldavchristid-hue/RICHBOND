import { cn } from "@/lib/utils";
import { PR_URGENCY_LABELS, type PrUrgency } from "@/modules/purchase-requests/labels";

const TONES: Record<PrUrgency, string> = {
  NORMALE: "bg-slate-100 text-slate-700 ring-slate-200",
  URGENTE: "bg-amber-100 text-amber-900 ring-amber-300",
  // Rouge plein : l'arrêt de production doit se voir au premier coup d'oeil.
  ARRET_PRODUCTION: "bg-red-700 text-white ring-red-800",
};

export function UrgencyBadge({ urgency, className }: { urgency: PrUrgency; className?: string }) {
  return (
    <span
      data-testid={`urgency-${urgency}`}
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        urgency === "ARRET_PRODUCTION" && "font-semibold",
        TONES[urgency],
        className,
      )}
    >
      {PR_URGENCY_LABELS[urgency]}
    </span>
  );
}
