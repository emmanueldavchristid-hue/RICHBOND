import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { MovementsTable } from "@/components/stock/movements-table";
import { can } from "@/lib/permissions";
import { pickParams, type SearchParams } from "@/lib/search-params";
import { requirePageAction } from "@/modules/auth/session";
import { listMovements, listMovementsSchema } from "@/modules/stock";
import { listWarehouses } from "@/modules/warehouses";

export const metadata: Metadata = { title: "Mouvements de stock – RICHBOND" };

const KEYS = ["q", "article", "depot", "type", "du", "au", "page", "taille"] as const;

async function MovementsContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageAction("stock.view");
  const raw = pickParams(await searchParams, KEYS);
  const parsed = listMovementsSchema.safeParse(raw);
  const [page, warehouses] = await Promise.all([listMovements(user, parsed.success ? raw : {}), listWarehouses({ activeOnly: true })]);
  return (
    <>
      {!parsed.success ? (
        <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="mvt-bad-filters">
          Certains filtres de l&apos;adresse sont invalides : ils ont été ignorés.
        </p>
      ) : null}
      <MovementsTable
        rows={page.rows}
        pageInfo={{ total: page.total, page: page.page, taille: page.taille, pageCount: page.pageCount }}
        warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))}
        showCosts={can(user, "price.viewPmp")}
        canTransfer={can(user, "stock.transfer")}
        canAdjust={can(user, "stock.adjust")}
      />
    </>
  );
}

export default function MovementsPage({ searchParams }: PageProps<"/stock/mouvements">) {
  return (
    <>
      <PageHeader title="Mouvements de stock" description="Journal de toutes les entrées, sorties, transferts et ajustements, du plus récent au plus ancien." />
      <Suspense fallback={<PageSkeleton />}>
        <MovementsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}
