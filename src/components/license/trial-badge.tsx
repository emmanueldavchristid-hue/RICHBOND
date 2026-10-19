"use client";

import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBadge } from "@/modules/licensing/state";
import { useLicense } from "./license-provider";

const TONES = {
  neutral: "border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200",
  warning: "border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200",
  danger: "border-red-300 bg-red-100 text-red-800 hover:bg-red-200",
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
          "inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors",
          TONES[state.tone],
        )}
      >
        <Clock className="size-4 shrink-0" aria-hidden />
        {formatBadge(state)}
      </button>
    </div>
  );
}
