import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
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

function TabLink({ tab, active, label, count, tone = "red" }: { tab: Tab; active: boolean; label: string; count?: number; tone?: "red" | "amber" }) {
  return (
    <Link
      href={`/achats/commandes?onglet=${tab}`}
      role="tab"
      aria-selected={active}
      data-testid={`po-tab-${tab}`}
      className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-4 text-sm font-medium whitespace-nowrap ${
        active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      {count !== undefined && count > 0 ? (
        <span
          data-testid={`po-tab-${tab}-count`}
          className={`inline-flex min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold text-white ${tone === "red" ? "bg-red-700" : "bg-amber-600"}`}
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}

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
      <div role="tablist" aria-label="Vues des bons de commande" className="mb-4 flex overflow-x-auto border-b" data-testid="po-tabs">
        <TabLink tab="a-valider" active={tab === "a-valider"} label="À valider" count={page.counts.aValider} />
        <TabLink tab="en-cours" active={tab === "en-cours"} label="En cours" />
        <TabLink tab="en-retard" active={tab === "en-retard"} label="En retard" count={page.counts.enRetard} />
        <TabLink tab="recus" active={tab === "recus"} label="Reçus" />
        <TabLink tab="tous" active={tab === "tous"} label="Tous" />
      </div>
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
