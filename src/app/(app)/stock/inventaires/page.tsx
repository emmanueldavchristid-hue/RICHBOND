import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck, Plus } from "lucide-react";
import { DateCell } from "@/components/date-cell";
import { DocNumber } from "@/components/doc-number";
import { EmptyState } from "@/components/empty-state";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { formatQty } from "@/lib/money";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { requirePageAction } from "@/modules/auth/session";
import { getInventoryReliability, listInventoryCounts, type InventoryStatus } from "@/modules/inventory";
import { pickParams, type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Inventaires – RICHBOND" };

const STATUS_TABS: { key: InventoryStatus | "TOUS"; label: string }[] = [
  { key: "TOUS", label: "Tous" },
  { key: "PREPARE", label: "Préparés" },
  { key: "EN_COMPTAGE", label: "En comptage" },
  { key: "A_VALIDER", label: "À valider" },
  { key: "VALIDE", label: "Validés" },
  { key: "ANNULE", label: "Annulés" },
];

async function InventoriesContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageAction(null);
  const canView = can(user, "inventory.view");
  const canCount = can(user, "inventory.count");
  if (!canView && !canCount) redirect("/acces-refuse");
  const raw = pickParams(await searchParams, ["statut"] as const);
  const statut = STATUS_TABS.find((s) => s.key === raw.statut)?.key ?? "TOUS";
  const [rows, reliability] = await Promise.all([
    listInventoryCounts(user, statut === "TOUS" ? {} : { status: statut }),
    canView ? getInventoryReliability(user) : Promise.resolve(null),
  ]);

  const header = (
    <PageHeader
      title="Inventaires"
      description="Comptage du stock au magasin : à l'aveugle, avec recomptage des gros écarts et validation par le Responsable Achats."
      actions={
        can(user, "inventory.prepare") ? (
          <Link href="/stock/inventaires/nouveau" className={cn(buttonVariants(), "h-11 px-4")} data-testid="inv-new">
            <Plus /> Préparer un inventaire
          </Link>
        ) : null
      }
    />
  );

  return (
    <>
      {header}
      {reliability ? (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            testId="inv-kpi-last-reliability"
            label="Fiabilité du stock"
            value={reliability.last === null ? "—" : `${formatQty(reliability.last)} %`}
            hint={reliability.history.length > 0 ? `Dernier inventaire validé : ${reliability.history[0].number}` : "Aucun inventaire validé pour l'instant"}
            help="Part des articles comptés sans aucun écart lors du dernier inventaire validé. Plus elle est haute, plus le stock de l'application est fiable."
          />
        </div>
      ) : null}

      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Filtrer par statut">
        {STATUS_TABS.map((s) => (
          <Link
            key={s.key}
            href={s.key === "TOUS" ? "/stock/inventaires" : `/stock/inventaires?statut=${s.key}`}
            aria-current={statut === s.key ? "page" : undefined}
            className={cn(
              "inline-flex h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors duration-150",
              statut === s.key ? "border-primary bg-primary/10 text-primary" : "bg-card text-muted-foreground hover:bg-muted",
            )}
            data-testid={`inv-tab-${s.key}`}
          >
            {s.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck aria-hidden />}
          title="Aucun inventaire"
          description={canView ? "Préparez un inventaire pour faire compter le magasin à l'aveugle et corriger le stock." : "Aucun inventaire n'est prévu pour l'instant."}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[44rem] text-sm" data-testid="inv-list">
            <thead className="text-left text-xs font-medium text-muted-foreground">
              <tr className="border-b">
                <th className="h-10 px-3">Numéro</th>
                <th className="px-3">Dépôt</th>
                <th className="px-3">Type</th>
                <th className="px-3">Statut</th>
                <th className="px-3 text-right">Comptés</th>
                {canView ? <th className="px-3 text-right">Fiabilité</th> : null}
                <th className="px-3">Créé le</th>
                <th className="px-3">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className="h-14 hover:bg-background" data-testid={`inv-row-${r.number}`}>
                  <td className="px-3">
                    <Link href={`/stock/inventaires/${r.id}`} className="text-primary hover:underline" data-testid={`inv-link-${r.number}`}>
                      <DocNumber value={r.number} />
                    </Link>
                  </td>
                  <td className="px-3">{r.warehouse.name}</td>
                  <td className="px-3 text-muted-foreground">{r.kind === "COMPLET" ? "Complet" : "Tournant"}</td>
                  <td className="px-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-3 text-right tabular-nums">
                    {r.status === "PREPARE" ? `${r.lineCount} à compter` : `${r.countedCount} / ${r.lineCount}`}
                  </td>
                  {canView ? (
                    <td className="px-3 text-right tabular-nums" data-testid={`inv-reliability-${r.number}`}>
                      {r.reliabilityPct === null ? <span className="text-muted-foreground/70">—</span> : `${formatQty(r.reliabilityPct)} %`}
                    </td>
                  ) : null}
                  <td className="px-3">
                    <DateCell value={r.createdAt} />
                  </td>
                  <td className="px-3 text-right">
                    {canCount && r.status === "EN_COMPTAGE" ? (
                      <Link href={`/stock/inventaires/${r.id}/comptage`} className={cn(buttonVariants(), "h-11 px-4")} data-testid={`inv-count-${r.number}`}>
                        Compter
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function InventoriesPage({ searchParams }: PageProps<"/stock/inventaires">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <InventoriesContent searchParams={searchParams} />
    </Suspense>
  );
}
