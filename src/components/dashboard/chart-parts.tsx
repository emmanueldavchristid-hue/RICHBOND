"use client";

import type { ReactNode } from "react";

/** Info-bulle de graphique : fond popover, ombre douce, libellé puis lignes « pastille – nom – valeur ». */
export function ChartTooltipBox({ title, rows, footer }: { title: string; rows: { color: string; name: string; value: string }[]; footer?: ReactNode }) {
  return (
    <div className="min-w-40 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-float" data-testid="dash-chart-tooltip">
      <p className="mb-1 font-semibold">{title}</p>
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-[2px]" style={{ background: r.color }} aria-hidden />
              {r.name}
            </span>
            <span className="font-medium tabular-nums">{r.value}</span>
          </li>
        ))}
      </ul>
      {footer ? <div className="mt-1 border-t pt-1 text-muted-foreground">{footer}</div> : null}
    </div>
  );
}

/** Légende fixe sous le titre d'un graphique (uniquement quand il y a plusieurs séries). */
export function ChartLegend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <ul className="flex items-center gap-3 text-xs text-muted-foreground" data-testid="dash-chart-legend">
      {items.map((i) => (
        <li key={i.label} className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-[2px]" style={{ background: i.color }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 12 } as const;
export const GRID_STROKE = "var(--border)";
export const CURSOR_FILL = "var(--muted)";
