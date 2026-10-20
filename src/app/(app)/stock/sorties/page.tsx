import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { IssuesTable } from "@/components/stock/issues-table";
import { can } from "@/lib/permissions";
import { pickParams, type SearchParams } from "@/lib/search-params";
import { requirePageAction } from "@/modules/auth/session";
import { listDepartments } from "@/modules/departments";
import { listIssues, listIssuesSchema } from "@/modules/stock";
import { listWarehouses } from "@/modules/warehouses";

export const metadata: Metadata = { title: "Sorties de stock – RICHBOND" };

const KEYS = ["q", "depot", "service", "statut", "du", "au", "page", "taille"] as const;

async function IssuesContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageAction("stock.view");
  const raw = pickParams(await searchParams, KEYS);
  const parsed = listIssuesSchema.safeParse(raw);
  const [page, warehouses, departments] = await Promise.all([
    listIssues(user, parsed.success ? raw : {}),
    listWarehouses({ activeOnly: true }),
    listDepartments({ activeOnly: true }),
  ]);
  return (
    <>
      {!parsed.success ? (
        <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="sor-bad-filters">
          Certains filtres de l&apos;adresse sont invalides : ils ont été ignorés.
        </p>
      ) : null}
      <IssuesTable
        rows={page.rows}
        pageInfo={{ total: page.total, page: page.page, taille: page.taille, pageCount: page.pageCount }}
        warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))}
        departments={departments.map((d) => ({ id: d.id, name: d.name }))}
        showCosts={can(user, "price.viewPmp")}
        canIssue={can(user, "stock.issue")}
      />
    </>
  );
}

export default function IssuesPage({ searchParams }: PageProps<"/stock/sorties">) {
  return (
    <>
      <PageHeader title="Sorties de stock" description="Bons de sortie du magasin : ce qui a été remis, à quel service et pour quelle machine." />
      <Suspense fallback={<PageSkeleton />}>
        <IssuesContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}
