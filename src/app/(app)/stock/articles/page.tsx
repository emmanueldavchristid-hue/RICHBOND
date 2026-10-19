import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { can } from "@/lib/permissions";
import { pickParams, type SearchParams } from "@/lib/search-params";
import { requirePageAction } from "@/modules/auth/session";
import { listFamilies, listItems, listItemsSchema } from "@/modules/items";
import { ArticlesTable } from "./articles-table";

export const metadata: Metadata = { title: "Articles – RICHBOND" };

const KEYS = ["q", "categorie", "criticite", "statut", "famille", "equipement", "tri", "ordre", "page", "taille"] as const;

async function ArticlesContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageAction("item.view");
  const raw = pickParams(await searchParams, KEYS);
  const parsed = listItemsSchema.safeParse(raw);
  const [page, families] = await Promise.all([listItems(parsed.success ? raw : {}), listFamilies()]);
  return (
    <>
      {!parsed.success ? (
        <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="articles-bad-filters">
          Certains filtres de l&apos;adresse sont invalides : ils ont été ignorés.
        </p>
      ) : null}
      <ArticlesTable
        rows={page.rows}
        pageInfo={{ total: page.total, page: page.page, taille: page.taille, pageCount: page.pageCount }}
        families={families}
        canCreate={can(user, "item.manage")}
      />
    </>
  );
}

export default function ArticlesPage({ searchParams }: PageProps<"/stock/articles">) {
  return (
    <>
      <PageHeader title="Articles" description="Matières premières, intrants, pièces de rechange, fournitures et services." />
      <Suspense fallback={<PageSkeleton />}>
        <ArticlesContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}
