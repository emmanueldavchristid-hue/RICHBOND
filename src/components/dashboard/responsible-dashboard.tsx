import { BarChart3, Boxes, Building2 } from "lucide-react";
import type { ResponsibleDashboard } from "@/modules/reporting/types";
import { ActionTiles } from "./action-tile";
import { formatDay } from "./format";
import { KpiTile } from "./kpi-tile";
import { Panel, PanelEmpty } from "./panel";
import { PurchasesByMonthChart } from "./purchases-by-month-chart";
import { RuptureRiskTable } from "./rupture-risk-table";
import { StockByCategoryChart } from "./stock-by-category-chart";
import { TopSuppliersChart } from "./top-suppliers-chart";

/** 6 KPI au maximum (DESIGN.md §5) : ordre de priorité des indicateurs affichés. */
const KPI_ORDER = ["purchased-amount", "po-count", "lead-da-po", "on-time-rate", "stock-value", "stockouts", "lead-po-receipt"];

/** Cockpit du Responsable Achats : à traiter, KPI du mois, graphiques, risques de rupture. */
export function ResponsibleBoard({ data }: { data: ResponsibleDashboard }) {
  const ordered = [...data.kpis].sort((a, b) => rank(a.key) - rank(b.key)).slice(0, 6);
  const trendAmount = data.purchasesByMonth.slice(-7).map((p) => p.totalXof);
  const hasPurchases = data.purchasesByMonth.some((p) => p.totalXof > 0);
  const compareLabel = `au ${formatDay(data.comparedUntil).slice(0, 5)}, vs mois précédent`;

  return (
    <div className="space-y-5" data-testid="dash-responsable">
      <ActionTiles cards={data.cards} />

      <section aria-label="Indicateurs du mois" data-testid="dash-kpis">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold">Ce mois-ci</h2>
          <p className="text-xs text-muted-foreground">Du 1er au {formatDay(data.comparedUntil).slice(0, 5)}, comparé au mois précédent à la même date</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {ordered.map((k) => (
            <KpiTile key={k.key} kpi={k} compareLabel={compareLabel} trend={isAmountKpi(k.key) && hasPurchases ? trendAmount : undefined} />
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel
          title="Achats par mois"
          description="Bons de commande validés sur 12 mois, local et import."
          testId="dash-purchases"
          className="lg:col-span-3"
          href="/achats/commandes"
        >
          {hasPurchases ? (
            <PurchasesByMonthChart data={data.purchasesByMonth} />
          ) : (
            <PanelEmpty icon={<BarChart3 aria-hidden />} title="Pas encore d'achats sur la période" hint="Les montants apparaîtront dès les premiers bons de commande validés." />
          )}
        </Panel>
        <Panel title="Top 10 fournisseurs" description="Montant commandé sur 12 mois." testId="dash-suppliers" className="lg:col-span-2" href="/fournisseurs">
          {data.topSuppliers.length > 0 ? (
            <TopSuppliersChart data={data.topSuppliers} />
          ) : (
            <PanelEmpty icon={<Building2 aria-hidden />} title="Aucun achat fournisseur" hint="Le classement se remplit avec les bons de commande validés." />
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel title="Valeur du stock par catégorie" description="Quantité en stock x PMP." testId="dash-stock-value" className="lg:col-span-2" href="/stock">
          {data.stockByCategory.length > 0 ? (
            <StockByCategoryChart data={data.stockByCategory} />
          ) : (
            <PanelEmpty icon={<Boxes aria-hidden />} title="Aucun stock valorisé" hint="La valeur apparaît après les premières réceptions." />
          )}
        </Panel>
        <div className="lg:col-span-3">
          <RuptureRiskTable total={data.ruptureRisks.total} rows={data.ruptureRisks.rows} />
        </div>
      </div>
    </div>
  );
}

function rank(key: string): number {
  const i = KPI_ORDER.indexOf(key);
  return i === -1 ? 99 : i;
}

function isAmountKpi(key: string): boolean {
  return key === "purchased-amount";
}
