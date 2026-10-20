import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TabLink, TabsNav } from "@/components/tabs-nav";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { getNow } from "@/lib/clock";
import { can } from "@/lib/permissions";
import { pickParams, type SearchParams } from "@/lib/search-params";
import { requirePageAction } from "@/modules/auth/session";
import { serialize } from "@/modules/referentials/serialize";
import { listOrders, listOrdersSchema, orderListOptions } from "@/modules/purchase-orders";
import { OrdersTable } from "./orders-table";

export const metadata: Metadata = { title: "Bons de commande – RICHBOND" };

const KEYS = ["onglet", "statut", "fournisseur", "acheteur", "type", "devise", "relance", "q", "tri", "ordre", "page", "taille"] as const;

type Tab = "a-valider" | "en-cours" | "en-retard" | "recus" | "tous";

const TabItem = ({ tab, active, label, count, alert }: { tab: Tab; active: boolean; label: string; count?: number; alert?: boolean }) => (
  <TabLink href={`/achats/commandes?onglet=${tab}`} active={active} label={label} count={count} alert={alert} testId={`po-tab-${tab}`} />
);

async function OrdersContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageAction("purchaseOrder.view");
  const raw = pickParams(await searchParams, KEYS);

  // Onglet par défaut selon le rôle ; l'URL le porte toujours (export Excel et liens partageables cohérents).
  const isApprover = can(user, "purchaseOrder.approve");
  if (!raw.onglet) {
    const qs = new URLSearchParams({ onglet: isApprover ? "a-valider" : "en-cours" });
    for (const k of KEYS) if (k !== "onglet" && raw[k]) qs.set(k, raw[k]!);
    redirect(`/achats/commandes?${qs.toString()}`);
  }

  const { now } = await getNow();
  const parsed = listOrdersSchema.safeParse(raw);
  const [page, options] = await Promise.all([listOrders(user, parsed.success ? raw : { onglet: raw.onglet }, now), orderListOptions(user)]);
  const tab: Tab = parsed.success ? parsed.data.onglet : "tous";

  return (
    <>
      {!parsed.success ? (
        <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="po-bad-filters">
          Certains filtres de l&apos;adresse sont invalides : ils ont été ignorés.
        </p>
      ) : null}
      <TabsNav label="Vues des bons de commande" testId="po-tabs">
        <TabItem tab="a-valider" active={tab === "a-valider"} label="À valider" count={page.counts.aValider} alert />
        <TabItem tab="en-cours" active={tab === "en-cours"} label="En cours" />
        <TabItem tab="en-retard" active={tab === "en-retard"} label="En retard" count={page.counts.enRetard} alert />
        <TabItem tab="recus" active={tab === "recus"} label="Reçus" />
        <TabItem tab="tous" active={tab === "tous"} label="Tous" />
      </TabsNav>
      <OrdersTable
        rows={serialize(page.rows)}
        pageInfo={{ total: page.total, page: page.page, taille: page.taille, pageCount: page.pageCount }}
        tab={tab}
        canCreate={can(user, "purchaseOrder.create")}
        toRemindCount={page.counts.aRelancer}
        suppliers={options.suppliers.map((s) => ({ id: s.id, label: `${s.code} – ${s.name}` }))}
        buyers={options.buyers}
        currencies={options.currencies}
      />
    </>
  );
}

export default function CommandesPage({ searchParams }: PageProps<"/achats/commandes">) {
  return (
    <>
      <PageHeader
        title="Bons de commande"
        description="Suivi des commandes aux fournisseurs : à valider, en cours, en retard. Les retards et les relances à faire se voient en un coup d'œil."
      />
      <Suspense fallback={<PageSkeleton />}>
        <OrdersContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}
