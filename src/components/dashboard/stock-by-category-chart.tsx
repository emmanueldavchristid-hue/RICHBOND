"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatFcfa, formatNumber } from "@/lib/money";
import type { StockByCategoryPoint } from "@/modules/reporting/types";
import { AXIS_TICK, CURSOR_FILL, ChartTooltipBox, GRID_STROKE } from "./chart-parts";
import { formatCompactFcfa } from "./format";

const COLOR = "var(--chart-2)";

/** Valeur du stock (quantité x PMP) par catégorie d'article : barres horizontales avec part en %. */
export function StockByCategoryChart({ data }: { data: StockByCategoryPoint[] }) {
  const total = data.reduce((s, d) => s + d.valueXof, 0);
  const height = Math.max(180, data.length * 34 + 28);
  return (
    <div className="px-4 pb-4" data-testid="dash-chart-stock">
      <p className="mb-2 text-xs text-muted-foreground">
        Valeur totale : <span className="font-medium text-foreground tabular-nums">{formatFcfa(total)}</span>
      </p>
      <div style={{ height }} className="w-full" role="img" aria-label={`Valeur du stock par catégorie, total ${formatFcfa(total)}`}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 420, height }}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 52, bottom: 0, left: 0 }} barCategoryGap="26%">
            <CartesianGrid horizontal={false} stroke={GRID_STROKE} strokeDasharray="3 4" />
            <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={formatCompactFcfa} />
            <YAxis type="category" dataKey="label" width={112} tick={AXIS_TICK} tickLine={false} axisLine={false} />
            <Tooltip
              cursor={{ fill: CURSOR_FILL, opacity: 0.6 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as StockByCategoryPoint;
                return (
                  <ChartTooltipBox
                    title={p.label}
                    rows={[
                      { color: COLOR, name: "Valeur", value: formatFcfa(p.valueXof) },
                      { color: COLOR, name: "Part du stock", value: `${formatNumber(p.sharePct, 1)} %` },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="valueXof" fill={COLOR} radius={[0, 4, 4, 0]} isAnimationActive={false} maxBarSize={20}>
              <LabelList dataKey="sharePct" position="right" formatter={(v) => `${formatNumber(Number(v), 0)} %`} style={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
