import { cn } from "@/lib/utils";

type Severity = "ROUGE" | "ORANGE" | "VERT" | null;

const BAR: Record<NonNullable<Severity> | "NONE", string> = {
  ROUGE: "bg-[#DC2626]",
  ORANGE: "bg-[#D97706]",
  VERT: "bg-[#15803D]",
  NONE: "bg-muted-foreground/40",
};
const TEXT: Record<NonNullable<Severity> | "NONE", string> = {
  ROUGE: "text-[#B91C1C] dark:text-red-400",
  ORANGE: "text-[#B45309] dark:text-amber-400",
  VERT: "text-[#15803D] dark:text-green-400",
  NONE: "text-muted-foreground",
};
const LABEL: Record<NonNullable<Severity> | "NONE", string> = {
  ROUGE: "critique",
  ORANGE: "à surveiller",
  VERT: "suffisante",
  NONE: "inconnue",
};

/** Jauge de couverture en jours (échelle 0 à 30 j) : barre colorée + nombre + mot, la couleur n'est jamais seule. */
export function CoverageGauge({ days, severity, testId, scale = 30 }: { days: number | null; severity: Severity; testId?: string; scale?: number }) {
  const key = severity ?? "NONE";
  if (days === null) return <span className="text-muted-foreground/70" data-testid={testId}>—</span>;
  const pct = Math.max(4, Math.min(100, (days / scale) * 100));
  return (
    <span className="inline-flex items-center gap-2" data-testid={testId} data-severity={key}>
      <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className={cn("absolute inset-y-0 left-0 rounded-full", BAR[key])} style={{ width: `${pct}%` }} />
      </span>
      <span className={cn("w-9 text-right text-[13px] font-medium tabular-nums", TEXT[key])}>{Math.round(days)} j</span>
      <span className="sr-only">Couverture {LABEL[key]}</span>
    </span>
  );
}
