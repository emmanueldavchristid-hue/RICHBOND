"use client";

import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBadge } from "@/modules/licensing/state";
import { useLicense } from "./license-provider";

// Accent ambre (DESIGN.md §3) : l'essai n'est pas une erreur ; rouge seulement en fin d'essai.
const TONES = {
  neutral: "border-warn/40 bg-warn/10 text-amber-900 hover:bg-warn/20",
  warning: "border-warn/60 bg-warn/20 text-amber-900 hover:bg-warn/30",
  danger: "border-red-300 bg-red-50 text-red-800 hover:bg-red-100",
} as const;

/** Compte à rebours d'essai dans l'en-tête. Cliquable : rouvre la fenêtre « Version d'essai ». */
export function TrialBadge() {
  const { state, openDialog } = useLicense();
  if (state.status === "ACTIVE" || !state.tone) return <div data-testid="trial-badge-slot" className="contents" />;
  return (
    <div data-testid="trial-badge-slot" className="contents">
      <button
        type="button"
        onClick={openDialog}
        data-testid="trial-badge"
        data-tone={state.tone}
        data-status={state.status}
        title="Cliquez pour voir le détail de la période d'essai"
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium whitespace-nowrap transition-colors",
          TONES[state.tone],
        )}
      >
        <Clock className="size-3.5 shrink-0" aria-hidden />
        {formatBadge(state)}
      </button>
    </div>
  );
}
