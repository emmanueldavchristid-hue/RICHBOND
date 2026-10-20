import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { CriticalityBadge } from "@/components/criticality-badge";
import { formatQty } from "@/lib/money";
import type { RuptureRiskRow } from "@/modules/reporting/types";
import { CoverageGauge } from "./coverage-gauge";
import { formatDay } from "./format";
import { Panel, PanelEmpty } from "./panel";

/** Articles A ou critiques dont la rupture prévue arrive avant la prochaine livraison. */
export function RuptureRiskTable({ total, rows }: { total: number; rows: RuptureRiskRow[] }) {
  return (
    <Panel
      title="Risques de rupture"
      description="Articles de classe A ou critiques qui seront en rupture avant la prochaine livraison."
      testId="dash-rupture"
      href="/stock/reappro"
      hrefLabel="Réapprovisionnement"
      badge={
        total > 0 ? (
          <span className="rounded-full bg-[#FEF2F2] px-2 py-0.5 text-xs font-semibold text-[#991B1B] tabular-nums dark:bg-red-950/50 dark:text-red-300" data-testid="dash-rupture-total">
            {total}
          </span>
        ) : null
      }
    >
      {rows.length === 0 ? (
        <PanelEmpty
          testId="dash-rupture-empty"
          icon={<ShieldCheck aria-hidden />}
          title="Aucun risque de rupture"
          hint="Tous les articles critiques ou de classe A sont couverts jusqu'à la prochaine livraison."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="dash-rupture-table">
            <thead>
              <tr className="border-y bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                <th className="h-9 px-4 font-medium">Article</th>
                <th className="h-9 px-2 text-right font-medium">En stock</th>
                <th className="h-9 px-3 font-medium">Couverture</th>
                <th className="h-9 px-2 font-medium">Rupture prévue</th>
                <th className="h-9 px-4 font-medium">Prochaine livraison</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.itemId} className="relative border-b last:border-b-0 hover:bg-background" data-testid={`dash-rupture-row-${r.code}`}>
                  <td className="h-12 max-w-[260px] px-4">
                    <Link href={r.href} className="block rounded outline-none after:absolute after:inset-0 focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="doc-number mr-2">{r.code}</span>
                      <span className="inline-block max-w-[150px] truncate align-bottom font-medium" title={r.name}>
                        {r.name}
                      </span>
                    </Link>
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      {r.abcClass ? <span>Classe {r.abcClass}</span> : null}
                      {r.abcClass && r.criticality !== "STANDARD" ? <span aria-hidden>·</span> : null}
                      {r.criticality !== "STANDARD" ? <CriticalityBadge value={r.criticality} /> : null}
                    </span>
                  </td>
                  <td className="px-2 text-right whitespace-nowrap tabular-nums">
                    {formatQty(r.onHand)} <span className="text-xs text-muted-foreground">{r.stockUnit}</span>
                  </td>
                  <td className="px-3">
                    <CoverageGauge days={r.coverageDays} severity={r.severity} testId={`dash-rupture-gauge-${r.code}`} />
                  </td>
                  <td className="px-2 whitespace-nowrap tabular-nums">{formatDay(r.stockoutDate)}</td>
                  <td className="px-4 whitespace-nowrap tabular-nums">
                    {r.nextDeliveryDate ? (
                      formatDay(r.nextDeliveryDate)
                    ) : (
                      <span className="text-[13px] font-medium text-[#B91C1C] dark:text-red-400">Aucune prévue</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > rows.length ? (
            <p className="border-t px-4 py-2.5 text-xs text-muted-foreground" data-testid="dash-rupture-more">
              {total - rows.length} autre{total - rows.length > 1 ? "s" : ""} article{total - rows.length > 1 ? "s" : ""} à risque : voir la page Réapprovisionnement.
            </p>
          ) : null}
        </div>
      )}
    </Panel>
  );
}
