import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { can } from "@/lib/permissions";
import { pickParams, type SearchParams } from "@/lib/search-params";
import { requirePageAction } from "@/modules/auth/session";
import { listSuppliers, listSuppliersSchema } from "@/modules/suppliers";
import { SuppliersTable } from "./suppliers-table";

export const metadata: Metadata = { title: "Fournisseurs – RICHBOND" };

const KEYS = ["q", "type", "statut", "pays", "categorie", "tri", "ordre", "page", "taille"] as const;

async function SuppliersContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageAction("supplier.view");
  const raw = pickParams(await searchParams, KEYS);
  const parsed = listSuppliersSchema.safeParse(raw);
  const page = await listSuppliers(parsed.success ? raw : {});
  return (
    <>
      {!parsed.success ? (
        <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="suppliers-bad-filters">
          Certains filtres de l&apos;adresse sont invalides : ils ont été ignorés.
        </p>
      ) : null}
      <SuppliersTable
        rows={page.rows}
        pageInfo={{ total: page.total, page: page.page, taille: page.taille, pageCount: page.pageCount }}
        canCreate={can(user, "supplier.manage")}
      />
    </>
  );
}

export default function FournisseursPage({ searchParams }: PageProps<"/fournisseurs">) {
  return (
    <>
      <PageHeader title="Fournisseurs" description="Fournisseurs locaux et import : coordonnées, conditions et statut." />
      <Suspense fallback={<PageSkeleton />}>
        <SuppliersContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}
