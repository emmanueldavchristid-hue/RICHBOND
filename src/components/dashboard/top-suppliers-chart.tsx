"use client";

import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatFcfa, formatNumber } from "@/lib/money";
import type { TopSupplierPoint } from "@/modules/reporting/types";
import { AXIS_TICK, CURSOR_FILL, ChartTooltipBox, GRID_STROKE, SingleLineTick } from "./chart-parts";
import { formatCompactFcfa } from "./format";

const COLOR = "var(--chart-1)";

/** Top 10 fournisseurs en montant sur 12 mois : barres horizontales, un clic ouvre la fiche fournisseur. */
export function TopSuppliersChart({ data }: { data: TopSupplierPoint[] }) {
  const router = useRouter();
  const height = Math.max(180, data.length * 30 + 28);
  return (
    <div className="px-4 pb-4" data-testid="dash-chart-suppliers">
      <div
        style={{ height }}
        className="w-full"
        role="img"
        aria-label={`Top ${data.length} fournisseurs par montant d'achats sur 12 mois`}
      >
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 420, height }}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
            barCategoryGap="24%"
          >
            <CartesianGrid horizontal={false} stroke={GRID_STROKE} strokeDasharray="3 4" />
            <XAxis
              type="number"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatCompactFcfa}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={178}
              tick={<SingleLineTick max={22} />}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: CURSOR_FILL, opacity: 0.6 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as TopSupplierPoint;
                return (
                  <ChartTooltipBox
                    title={p.name}
                    rows={[
                      { color: COLOR, name: "Achats 12 mois", value: formatFcfa(p.amountXof) },
                      { color: COLOR, name: "Part du total", value: `${formatNumber(p.sharePct, 1)} %` },
                    ]}
                    footer="Cliquer pour ouvrir la fiche"
                  />
                );
              }}
            />
            <Bar
              dataKey="amountXof"
              fill={COLOR}
              radius={[0, 4, 4, 0]}
              isAnimationActive={false}
              maxBarSize={18}
              cursor="pointer"
              onClick={(p) => {
                const href = (p as unknown as { payload?: TopSupplierPoint }).payload?.href;
                if (href) router.push(href);
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
