import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type CoverageTone = "red" | "orange" | "green" | "none";

/**
 * Code couleur de la couverture (LOT-07) : rouge si la couverture est inférieure au délai de réappro,
 * orange si elle est inférieure à 2 fois ce délai, vert au-delà. Sans consommation : aucune couleur.
 */
export function coverageTone(days: number | null | undefined, leadTimeDays: number): CoverageTone {
  if (days === null || days === undefined || !Number.isFinite(days)) return "none";
  if (days < leadTimeDays) return "red";
  if (days < 2 * leadTimeDays) return "orange";
  return "green";
}

const DOT: Record<CoverageTone, string> = {
  red: "bg-[#DC2626]",
  orange: "bg-[#D97706]",
  green: "bg-[#15803D]",
  none: "bg-muted-foreground/40",
};
const TEXT: Record<CoverageTone, string> = {
  red: "text-[#B91C1C] dark:text-red-400",
  orange: "text-[#B45309] dark:text-amber-400",
  green: "text-[#15803D] dark:text-green-400",
  none: "text-muted-foreground",
};
const TONE_LABEL: Record<CoverageTone, string> = {
  red: "critique",
  orange: "à surveiller",
  green: "suffisante",
  none: "inconnue",
};

/** Couverture en jours avec pastille de couleur et texte explicite (la couleur n'est jamais seule). */
export function CoverageBadge({ days, leadTimeDays, testId }: { days: number | null; leadTimeDays: number; testId?: string }) {
  const tone = coverageTone(days, leadTimeDays);
  if (tone === "none") {
    return (
      <Tooltip>
        <TooltipTrigger render={<span className="cursor-help text-muted-foreground/70" tabIndex={0} data-testid={testId} data-tone="none" />}>
          —
        </TooltipTrigger>
        <TooltipContent>Aucune consommation sur la période : la couverture ne peut pas être calculée.</TooltipContent>
      </Tooltip>
    );
  }
  const rounded = Math.round(days as number);
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 font-medium tabular-nums", TEXT[tone])}
      title={`Couverture ${TONE_LABEL[tone]} (délai de réappro : ${leadTimeDays} j)`}
      data-testid={testId}
      data-tone={tone}
    >
      <span className={cn("size-1.5 rounded-full", DOT[tone])} aria-hidden />
      {rounded} j<span className="sr-only"> : couverture {TONE_LABEL[tone]}</span>
    </span>
  );
}

/** Aide en infobulle expliquant les KPI de la liste de stock. */
export function CoverageLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" data-testid="stk-legend">
      <Tooltip>
        <TooltipTrigger
          render={<span className="inline-flex cursor-help items-center gap-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring" tabIndex={0} data-testid="stk-legend-help" />}
        >
          <Info className="size-3.5" aria-hidden /> Comment lire la couverture
        </TooltipTrigger>
        <TooltipContent className="max-w-80">
          Couverture = stock disponible divisé par la consommation moyenne par jour (sorties des 90 derniers jours). Elle indique pendant combien de jours le
          stock suffit. La date de rupture prévue est aujourd&apos;hui plus la couverture. Le délai de réappro est le temps entre la commande et la livraison.
        </TooltipContent>
      </Tooltip>
      <span className="inline-flex items-center gap-1.5">
        <span className={cn("size-1.5 rounded-full", DOT.red)} aria-hidden /> Moins que le délai de réappro
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className={cn("size-1.5 rounded-full", DOT.orange)} aria-hidden /> Moins de 2 fois le délai
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className={cn("size-1.5 rounded-full", DOT.green)} aria-hidden /> Au-delà
      </span>
    </div>
  );
}
