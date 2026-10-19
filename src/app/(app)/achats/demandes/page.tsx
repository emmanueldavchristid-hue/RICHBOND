import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
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

function TabLink({ tab, active, label, count }: { tab: Tab; active: boolean; label: string; count?: number }) {
  return (
    <Link
      href={`/achats/demandes?onglet=${tab}`}
      role="tab"
      aria-selected={active}
      data-testid={`pr-tab-${tab}`}
      className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-4 text-sm font-medium whitespace-nowrap ${
        active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      {count !== undefined && count > 0 ? (
        <span
          data-testid={`pr-tab-${tab}-count`}
          className="inline-flex min-w-6 items-center justify-center rounded-full bg-red-700 px-1.5 text-xs font-semibold text-white"
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}

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
      <div role="tablist" aria-label="Vues des demandes d'achat" className="mb-4 flex overflow-x-auto border-b" data-testid="pr-tabs">
        {canApprove ? <TabLink tab="a-valider" active={tab === "a-valider"} label="À valider" count={page.toValidate} /> : null}
        <TabLink tab="mes-demandes" active={tab === "mes-demandes"} label="Mes demandes" />
        {user.role === "ACHETEUR" ? <TabLink tab="assignees" active={tab === "assignees"} label="Assignées à moi" /> : null}
        <TabLink tab="toutes" active={tab === "toutes"} label="Toutes" />
      </div>
      <RequestsTable
        rows={page.rows}
        pageInfo={{ total: page.total, page: page.page, taille: page.taille, pageCount: page.pageCount }}
        tab={tab}
        canCreate={can(user, "purchaseRequest.create") || can(user, "purchaseRequest.createReplenishment")}
        canApprove={canApprove}
        showPrices={showPrices}
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
