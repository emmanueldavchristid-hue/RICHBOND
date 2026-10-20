import type { CSSProperties } from "react";
import { TONE_COLORS } from "@/components/status-badge";
import { cn } from "@/lib/utils";

const TONE = {
  normal: TONE_COLORS.neutral,
  warning: TONE_COLORS.warning,
  critical: TONE_COLORS.danger,
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
  if (days === null || days === undefined) return <span className="text-muted-foreground/70">—</span>;
  return (
    <span
      data-testid="age-badge"
      data-severity={severity ?? "normal"}
      style={{ "--tone": TONE[severity ?? "normal"] } as CSSProperties}
      className={cn("status-badge")}
    >
      {days === 0 ? "aujourd'hui" : `${prefix} ${days} j`}
    </span>
  );
}
