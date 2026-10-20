"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/money";
import type { KpiCard } from "@/modules/reporting/types";
import { formatKpiValue } from "./format";

/** Mini-courbe SVG avec aire légère : la tendance seulement, sans axe. */
export function MiniTrend({ values, className, id }: { values: number[]; className?: string; id: string }) {
  if (values.length < 2) return null;
  const w = 84;
  const h = 32;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const xy = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - ((v - min) / span) * (h - 8)] as const);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `0,${h} ${line} ${w},${h}`;
  const [lx, ly] = xy[xy.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className={cn("shrink-0 overflow-visible text-primary", className)} aria-hidden data-testid={`${id}-trend`}>
      <defs>
        <linearGradient id={`${id}-grad`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${id}-grad)`} />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="2.5" fill="currentColor" />
    </svg>
  );
}

/**
 * Carte KPI du mois : libellé + infobulle d'aide, valeur 28 px tabulaire, variation ▲▼ colorée selon le sens métier
 * (une hausse du délai est mauvaise, une hausse du taux à temps est bonne), mini-courbe facultative.
 */
export function KpiTile({ kpi, trend, compareLabel }: { kpi: KpiCard; trend?: number[]; compareLabel: string }) {
  const testId = `dash-kpi-${kpi.key}`;
  const v = kpi.variationPct;
  const flat = v === 0;
  const good: boolean | null = v === null || flat || kpi.goodDirection === "NONE" ? null : (v > 0) === (kpi.goodDirection === "UP");
  const tone = good === null ? "text-muted-foreground" : good ? "text-[#15803D] dark:text-green-400" : "text-[#B91C1C] dark:text-red-400";
  return (
    <div
      className={cn("relative flex flex-col rounded-xl border bg-card p-4", kpi.href && "transition-colors hover:border-input hover:bg-background")}
      data-testid={testId}
    >
      {kpi.href ? (
        <Link href={kpi.href} className="absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid={`${testId}-link`}>
          <span className="sr-only">{kpi.label}</span>
        </Link>
      ) : null}
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] leading-5 font-medium text-muted-foreground">{kpi.label}</p>
        {kpi.help ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={`Aide : ${kpi.label}`}
                  className="relative z-10 -m-3 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                  data-testid={`${testId}-help`}
                />
              }
            >
              <Info className="size-4" />
            </TooltipTrigger>
            <TooltipContent className="max-w-72">{kpi.help}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className="min-w-0 truncate text-[28px] leading-9 font-semibold tracking-tight tabular-nums" data-testid={`${testId}-value`} title={formatKpiValue(kpi)}>
          {formatKpiValue(kpi)}
        </p>
        {trend ? <MiniTrend values={trend} id={testId} /> : null}
      </div>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground" data-testid={`${testId}-delta`}>
        {v === null ? (
          <span>{kpi.previous === null ? "Pas de comparaison possible" : "Variation non calculable"}</span>
        ) : (
          <>
            <span className={cn("inline-flex items-center gap-1 font-medium tabular-nums", tone)} data-tone={good === null ? "neutral" : good ? "good" : "bad"}>
              <span aria-hidden className="text-[9px] leading-none">
                {flat ? "■" : v > 0 ? "▲" : "▼"}
              </span>
              {flat ? "Stable" : `${v > 0 ? "+" : "−"}${formatNumber(Math.abs(v), 1)} %`}
              <span className="sr-only">{good === null ? "" : good ? " (favorable)" : " (défavorable)"}</span>
            </span>
            <span>{compareLabel}</span>
          </>
        )}
      </p>
    </div>
  );
}
