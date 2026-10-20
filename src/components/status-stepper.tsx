import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StepDef {
  key: string;
  label: string;
}

/**
 * Frise de statut horizontale (Brouillon, Soumise, Validée, Commandée, Reçue).
 * `current` : étape en cours ; les précédentes sont cochées. `stopped` : la pièce est sortie du circuit
 * (refusée, annulée) ; l'étape où elle s'est arrêtée est alors marquée en rouge sous ce libellé.
 */
export function StatusStepper({
  steps,
  current,
  stopped,
  testId = "status-stepper",
  label = "Avancement",
}: {
  steps: StepDef[];
  current: string;
  stopped?: { label: string } | null;
  testId?: string;
  label?: string;
}) {
  const idx = Math.max(
    0,
    steps.findIndex((s) => s.key === current),
  );
  return (
    <nav aria-label={label} data-testid={testId} className="rounded-xl border bg-card px-4 py-3">
      <ol className="flex items-center overflow-x-auto">
        {steps.map((s, i) => {
          const done = i < idx;
          const active = i === idx;
          const isStop = active && !!stopped;
          return (
            <li
              key={s.key}
              className="flex min-w-0 flex-1 items-center last:flex-none"
              aria-current={active ? "step" : undefined}
              data-state={isStop ? "stopped" : done ? "done" : active ? "current" : "todo"}
            >
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    isStop
                      ? "bg-red-600 text-white"
                      : done
                        ? "bg-primary text-primary-foreground"
                        : active
                          ? "border-2 border-primary text-primary"
                          : "border border-input text-muted-foreground",
                  )}
                >
                  {isStop ? <X className="size-3.5" aria-hidden /> : done ? <Check className="size-3.5" aria-hidden /> : i + 1}
                </span>
                <span className={cn("text-[13px] whitespace-nowrap", active ? "font-semibold text-foreground" : done ? "text-foreground" : "text-muted-foreground")}>
                  {isStop && stopped ? stopped.label : s.label}
                </span>
              </span>
              {i < steps.length - 1 ? <span className={cn("mx-3 h-px min-w-6 flex-1", done ? "bg-primary" : "bg-border")} aria-hidden /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
