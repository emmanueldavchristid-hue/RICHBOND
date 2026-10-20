import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { NonConformitiesTable } from "@/components/receiving/non-conformities-table";
import { TabLink, TabsNav } from "@/components/tabs-nav";
import { pickParams, type SearchParams } from "@/lib/search-params";
import { requirePageAction } from "@/modules/auth/session";
import { listNonConformities } from "@/modules/receiving";

export const metadata: Metadata = { title: "Non-conformités – RICHBOND" };

async function NcContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageAction("receipt.view");
  const { statut } = pickParams(await searchParams, ["statut"]);
  const status = statut === "cloturees" ? "CLOTUREE" : statut === "toutes" ? undefined : "OUVERTE";
  const tab = statut === "cloturees" ? "cloturees" : statut === "toutes" ? "toutes" : "ouvertes";
  const [rows, open] = await Promise.all([
    listNonConformities(user, { status, limit: 200 }),
    listNonConformities(user, { status: "OUVERTE", limit: 200 }),
  ]);

  return (
    <>
      <TabsNav label="Filtrer les non-conformités" testId="nc-tabs">
        <TabLink href="/stock/receptions/non-conformites" active={tab === "ouvertes"} label="À décider" count={open.length} alert testId="nc-tab-ouvertes" />
        <TabLink href="/stock/receptions/non-conformites?statut=cloturees" active={tab === "cloturees"} label="Clôturées" testId="nc-tab-cloturees" />
        <TabLink href="/stock/receptions/non-conformites?statut=toutes" active={tab === "toutes"} label="Toutes" testId="nc-tab-toutes" />
      </TabsNav>
      <NonConformitiesTable rows={rows} />
    </>
  );
}

export default function NonConformitiesPage({ searchParams }: PageProps<"/stock/receptions/non-conformites">) {
  return (
    <>
      <PageHeader
        title="Non-conformités"
        description="Marchandises refusées à la réception. Pour chacune, décidez : retour au fournisseur, avoir ou remplacement."
      />
      <Suspense fallback={<PageSkeleton rows={5} />}>
        <NcContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}
