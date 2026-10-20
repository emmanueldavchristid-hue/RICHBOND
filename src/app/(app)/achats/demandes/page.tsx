import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getNow } from "@/lib/clock";
import { can } from "@/lib/permissions";
import { TabLink, TabsNav } from "@/components/tabs-nav";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { pickParams, type SearchParams } from "@/lib/search-params";
import { requirePageAction } from "@/modules/auth/session";
import { listDepartments } from "@/modules/departments";
import { listAssignableBuyers, listRequests, listRequestsSchema } from "@/modules/purchase-requests";
import { viewerCanSeePrices } from "@/modules/settings";
import { RequestsTable } from "./requests-table";

export const metadata: Metadata = { title: "Demandes d'achat – RICHBOND" };

const KEYS = ["onglet", "statut", "urgence", "service", "acheteur", "type", "q", "tri", "ordre", "page", "taille"] as const;

type Tab = "a-valider" | "mes-demandes" | "assignees" | "toutes";

const TabItem = ({ tab, active, label, count, alert }: { tab: Tab; active: boolean; label: string; count?: number; alert?: boolean }) => (
  <TabLink href={`/achats/demandes?onglet=${tab}`} active={active} label={label} count={count} alert={alert} testId={`pr-tab-${tab}`} />
);

async function RequestsContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageAction("purchaseRequest.view");
  const canApprove = can(user, "purchaseRequest.approve");
  const raw = pickParams(await searchParams, KEYS);

  // Onglet par défaut selon le rôle ; l'URL le porte toujours (export Excel et liens partageables cohérents).
  const defaultTab: Tab = canApprove ? "a-valider" : user.role === "ACHETEUR" ? "assignees" : "mes-demandes";
  if (!raw.onglet) {
    const qs = new URLSearchParams({ onglet: defaultTab });
    for (const k of KEYS) if (k !== "onglet" && raw[k]) qs.set(k, raw[k]!);
    redirect(`/achats/demandes?${qs.toString()}`);
  }

  const showPrices = await viewerCanSeePrices(user);
  const parsed = listRequestsSchema.safeParse(raw);
  const { now } = await getNow();
  const [page, departments, local, imp] = await Promise.all([
    listRequests(user, parsed.success ? raw : { onglet: raw.onglet }, { showPrices }),
    listDepartments({ activeOnly: true }),
    listAssignableBuyers("LOCAL"),
    listAssignableBuyers("IMPORT"),
  ]);
  const tab: Tab = parsed.success ? parsed.data.onglet : "toutes";
  const buyers = [...new Map([...local.buyers, ...imp.buyers].map((b) => [b.id, { id: b.id, name: b.name }])).values()].sort((a, b) =>
    a.name.localeCompare(b.name, "fr"),
  );

  return (
    <>
      {!parsed.success ? (
        <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="pr-bad-filters">
          Certains filtres de l&apos;adresse sont invalides : ils ont été ignorés.
        </p>
      ) : null}
      <TabsNav label="Vues des demandes d&apos;achat" testId="pr-tabs">
        {canApprove ? <TabItem tab="a-valider" active={tab === "a-valider"} label="À valider" count={page.toValidate} alert /> : null}
        <TabItem tab="mes-demandes" active={tab === "mes-demandes"} label="Mes demandes" />
        {user.role === "ACHETEUR" ? <TabItem tab="assignees" active={tab === "assignees"} label="Assignées à moi" /> : null}
        <TabItem tab="toutes" active={tab === "toutes"} label="Toutes" />
      </TabsNav>
      <RequestsTable
        rows={page.rows}
        pageInfo={{ total: page.total, page: page.page, taille: page.taille, pageCount: page.pageCount }}
        tab={tab}
        canCreate={can(user, "purchaseRequest.create") || can(user, "purchaseRequest.createReplenishment")}
        canApprove={canApprove}
        showPrices={showPrices}
        nowIso={now.toISOString()}
        departments={departments.map((d) => ({ id: d.id, name: d.name }))}
        buyers={buyers}
      />
    </>
  );
}

export default function DemandesPage({ searchParams }: PageProps<"/achats/demandes">) {
  return (
    <>
      <PageHeader
        title="Demandes d'achat"
        description="Chaque achat commence par une demande validée. Les arrêts de production passent toujours en tête."
      />
      <Suspense fallback={<PageSkeleton />}>
        <RequestsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}
