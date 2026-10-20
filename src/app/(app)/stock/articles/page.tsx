import { Suspense } from "react";
import type { Metadata } from "next";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { AbcRecomputeButton } from "@/components/stock/abc-recompute-button";
import { StockTable } from "@/components/stock/stock-table";
import { formatFcfa } from "@/lib/money";
import { can } from "@/lib/permissions";
import { pickParams, type SearchParams } from "@/lib/search-params";
import { requirePageAction } from "@/modules/auth/session";
import { listStock, listStockSchema } from "@/modules/stock";
import { listWarehouses } from "@/modules/warehouses";

export const metadata: Metadata = { title: "Articles et stock – RICHBOND" };

const KEYS = ["q", "categorie", "criticite", "depot", "classe", "situation", "tri", "ordre", "page", "taille"] as const;

async function ArticlesContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageAction("item.view");
  const raw = pickParams(await searchParams, KEYS);
  const parsed = listStockSchema.safeParse(raw);
  const [result, warehouses] = await Promise.all([listStock(user, parsed.success ? raw : {}), listWarehouses({ activeOnly: true })]);
  const showCosts = can(user, "price.viewPmp");
  const t = result.totals;
  return (
    <>
      {!parsed.success ? (
        <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="articles-bad-filters">
          Certains filtres de l&apos;adresse sont invalides : ils ont été ignorés.
        </p>
      ) : null}
      {can(user, "stock.thresholds") ? (
        <div className="mb-3 flex justify-end">
          <AbcRecomputeButton />
        </div>
      ) : null}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="stk-kpis">
        {showCosts && t.value !== undefined ? (
          <KpiCard label="Valeur du stock" value={formatFcfa(t.value)} help="Somme du stock de chaque article multiplié par son coût moyen pondéré (PMP), pour les articles du filtre en cours." testId="stk-kpi-value" />
        ) : (
          <KpiCard label="Articles suivis" value={String(t.count)} help="Nombre d'articles correspondant au filtre en cours." testId="stk-kpi-count" />
        )}
        <KpiCard label="Couverture critique" value={String(t.criticalCount)} help="Articles dont le stock ne dure pas jusqu'à la prochaine livraison possible (couverture inférieure au délai de réapprovisionnement)." testId="stk-kpi-critical" href="/stock/articles?situation=ROUGE" linkTestId="stk-kpi-critical-link" />
        <KpiCard label="Sous le point de commande" value={String(t.belowReorderCount)} help="Articles dont le stock, commandes en cours comprises, est passé sous le point de commande : à réapprovisionner." testId="stk-kpi-below" href="/stock/articles?situation=SOUS_POINT" linkTestId="stk-kpi-below-link" />
        <KpiCard label="Articles dormants" value={String(t.dormantCount)} help="Articles en stock sans aucun mouvement depuis 180 jours : de l'argent immobilisé." testId="stk-kpi-dormant" href="/stock/articles?situation=DORMANT" linkTestId="stk-kpi-dormant-link" />
      </div>
      <StockTable
        rows={result.rows}
        pageInfo={{ total: result.total, page: result.page, taille: result.taille, pageCount: result.pageCount }}
        warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))}
        showCosts={showCosts}
        canCreate={can(user, "item.manage")}
      />
    </>
  );
}

export default function ArticlesPage({ searchParams }: PageProps<"/stock/articles">) {
  return (
    <>
      <PageHeader title="Articles et stock" description="Quantités en stock, coût moyen, couverture en jours et date de rupture prévue de chaque article." />
      <Suspense fallback={<PageSkeleton />}>
        <ArticlesContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}
