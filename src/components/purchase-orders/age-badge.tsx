import { cn } from "@/lib/utils";

const TONE = {
  normal: "bg-slate-100 text-slate-700 ring-slate-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  critical: "bg-red-50 text-red-800 ring-red-200",
} as const;

/** Ancienneté (D21) : « depuis 3 j », orange à partir de 2 jours ouvrés, rouge à partir de 5. */
export function AgeBadge({
  days,
  severity = "normal",
  prefix = "depuis",
}: {
  days: number | null | undefined;
  severity?: keyof typeof TONE | null;
  prefix?: string;
}) {
  if (days === null || days === undefined) return <span className="text-muted-foreground">–</span>;
  return (
    <span
      data-testid="age-badge"
      data-severity={severity ?? "normal"}
      className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset", TONE[severity ?? "normal"])}
    >
      {days === 0 ? "aujourd'hui" : `${prefix} ${days} j`}
    </span>
  );
}
