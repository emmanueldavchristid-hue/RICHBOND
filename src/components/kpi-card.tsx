"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Mini-courbe SVG sans axe : la tendance seulement. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const w = 72;
  const h = 24;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className={cn("text-primary", className)} aria-hidden>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Indicateur chiffré : libellé, valeur en 28 px, variation ± % colorée et mini-courbe facultatives,
 * aide en infobulle (« i ») expliquant comment il est calculé.
 * `deltaGood` indique si une hausse est une bonne nouvelle (par défaut oui).
 */
export function KpiCard({
  label,
  value,
  help,
  testId,
  delta,
  deltaGood = true,
  trend,
  hint,
  href,
  linkTestId,
  linkLabel,
}: {
  label: string;
  value: string;
  help: string;
  testId: string;
  /** Variation en pourcentage par rapport à la période précédente. */
  delta?: number | null;
  deltaGood?: boolean;
  trend?: number[];
  /** Petite ligne sous la valeur (ex. « dont 3 arrêts de production »). */
  hint?: string;
  /** Rend toute la carte cliquable (lien étiré sous le bouton d'aide). */
  href?: string;
  linkTestId?: string;
  /** Texte lu par les lecteurs d'écran pour le lien. */
  linkLabel?: string;
}) {
  const up = (delta ?? 0) > 0;
  const good = delta === 0 || delta == null ? null : up === deltaGood;
  return (
    <div className={cn("relative rounded-xl border bg-card p-4", href && "transition-colors hover:border-input hover:bg-background")} data-testid={testId}>
      {href ? (
        <Link href={href} className="absolute inset-0 rounded-xl focus-visible:ring-2 focus-visible:ring-ring" data-testid={linkTestId}>
          <span className="sr-only">{linkLabel ?? label}</span>
        </Link>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={`Aide : ${label}`}
                className="relative z-10 -m-3 inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                data-testid={`${testId}-help`}
              />
            }
          >
            <Info className="size-4" />
          </TooltipTrigger>
          <TooltipContent>{help}</TooltipContent>
        </Tooltip>
      </div>
      <div className="mt-1 flex items-end justify-between gap-3">
        <p className="text-[28px] leading-9 font-semibold tracking-tight tabular-nums" data-testid={`${testId}-value`}>
          {value}
        </p>
        {trend ? <Sparkline values={trend} /> : null}
      </div>
      {delta != null || hint ? (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          {delta != null ? (
            <span
              className={cn(
                "inline-flex items-center font-medium tabular-nums",
                good === null ? "text-muted-foreground" : good ? "text-emerald-700" : "text-red-700",
              )}
            >
              {up ? <ArrowUpRight className="size-3.5" aria-hidden /> : delta < 0 ? <ArrowDownRight className="size-3.5" aria-hidden /> : null}
              {Math.abs(delta)} %
            </span>
          ) : null}
          {hint}
        </p>
      ) : null}
    </div>
  );
}
