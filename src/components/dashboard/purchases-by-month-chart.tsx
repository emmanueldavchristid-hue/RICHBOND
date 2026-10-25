"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatFcfa } from "@/lib/money";
import type { MonthlyPurchasePoint } from "@/modules/reporting/types";
import { AXIS_TICK, CURSOR_FILL, ChartLegend, ChartTooltipBox, GRID_STROKE } from "./chart-parts";
import { formatCompactFcfa } from "./format";

const LOCAL = "var(--chart-1)";
const IMPORT = "var(--chart-3)";

/** Achats des 12 derniers mois, local et import empilés (BC validés, FCFA). */
export function PurchasesByMonthChart({ data }: { data: MonthlyPurchasePoint[] }) {
  const total = data.reduce((s, d) => s + d.totalXof, 0);
  return (
    <div className="px-4 pb-4" data-testid="dash-chart-purchases">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Total sur 12 mois :{" "}
          <span className="font-medium text-foreground tabular-nums">{formatFcfa(total)}</span>
        </p>
        <ChartLegend
          items={[
            { color: LOCAL, label: "Local" },
            { color: IMPORT, label: "Import" },
          ]}
        />
      </div>
      <div
        className="h-[260px] w-full"
        role="img"
        aria-label={`Achats par mois sur 12 mois, local et import, total ${formatFcfa(total)}`}
      >
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height: 260 }}>
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeDasharray="3 4" />
            <XAxis
              dataKey="label"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: GRID_STROKE }}
              interval={0}
              tickMargin={8}
              tickFormatter={(v: string) => v.split(" ")[0]}
            />
            <YAxis
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={48}
              tickFormatter={formatCompactFcfa}
            />
            <Tooltip
              cursor={{ fill: CURSOR_FILL, opacity: 0.6 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as MonthlyPurchasePoint;
                return (
                  <ChartTooltipBox
                    title={p.label}
                    rows={[
                      { color: LOCAL, name: "Local", value: formatFcfa(p.localXof) },
                      { color: IMPORT, name: "Import", value: formatFcfa(p.importXof) },
                    ]}
                    footer={
                      <span className="flex justify-between gap-4">
                        Total <b className="text-foreground tabular-nums">{formatFcfa(p.totalXof)}</b>
                      </span>
                    }
                  />
                );
              }}
            />
            <Bar
              dataKey="localXof"
              stackId="a"
              fill={LOCAL}
              radius={[0, 0, 4, 4]}
              isAnimationActive={false}
              maxBarSize={36}
            />
            <Bar
              dataKey="importXof"
              stackId="a"
              fill={IMPORT}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
              maxBarSize={36}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
