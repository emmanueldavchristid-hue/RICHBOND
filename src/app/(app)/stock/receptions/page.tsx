import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { ExpectedBoard } from "@/components/receiving/expected-board";
import { ReceiptsTable } from "@/components/receiving/receipts-table";
import { TabLink, TabsNav } from "@/components/tabs-nav";
import { getNow } from "@/lib/clock";
import { can } from "@/lib/permissions";
import { pickParams, type SearchParams } from "@/lib/search-params";
import { requirePageAction } from "@/modules/auth/session";
import { listExpected, listNonConformities, listRecent } from "@/modules/receiving";

export const metadata: Metadata = { title: "Réceptions – RICHBOND" };

async function ReceptionsContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageAction("receipt.view");
  const { onglet } = pickParams(await searchParams, ["onglet"]);
  const tab = onglet === "recentes" ? "recentes" : "attendues";
  const { now } = await getNow();
  const [expected, recent, openNc] = await Promise.all([
    listExpected(user, {}, now),
    tab === "recentes" ? listRecent(user, { limit: 30 }) : Promise.resolve([]),
    listNonConformities(user, { status: "OUVERTE", limit: 200 }),
  ]);

  return (
    <>
      <TabsNav label="Vues des réceptions" testId="rec-tabs">
        <TabLink href="/stock/receptions" active={tab === "attendues"} label="Livraisons attendues" count={expected.late.length} alert testId="rec-tab-attendues" />
        <TabLink href="/stock/receptions?onglet=recentes" active={tab === "recentes"} label="Réceptions récentes" testId="rec-tab-recentes" />
        <TabLink href="/stock/receptions/non-conformites" active={false} label="Non-conformités" count={openNc.length} alert testId="rec-tab-nc" />
      </TabsNav>
      {tab === "attendues" ? (
        <ExpectedBoard late={expected.late} today={expected.today} week={expected.thisWeek} canReceive={can(user, "receipt.create")} />
      ) : (
        <ReceiptsTable rows={recent} />
      )}
    </>
  );
}

export default function ReceptionsPage({ searchParams }: PageProps<"/stock/receptions">) {
  return (
    <>
      <PageHeader title="Réceptions" description="Livraisons attendues des fournisseurs : choisissez un bon de commande pour enregistrer ce qui est arrivé." />
      <Suspense fallback={<PageSkeleton rows={6} />}>
        <ReceptionsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}
