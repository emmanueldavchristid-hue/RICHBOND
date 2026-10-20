import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine, ChevronRight, PackageOpen, ShieldCheck, Truck } from "lucide-react";
import { DocNumber } from "@/components/doc-number";
import { formatQty } from "@/lib/money";
import type { BelowReorderRow, ExpectedDeliveryRow, StorekeeperDashboard } from "@/modules/reporting/types";
import { ActionTiles } from "./action-tile";
import { CoverageGauge } from "./coverage-gauge";
import { formatDay } from "./format";
import { Panel, PanelEmpty } from "./panel";

const BIG_LINK =
  "flex min-h-16 flex-1 items-center justify-center gap-3 rounded-xl px-5 text-base font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-6";

function DeliveryList({ title, description, total, rows, testId, emptyTitle }: { title: string; description: string; total: number; rows: ExpectedDeliveryRow[]; testId: string; emptyTitle: string }) {
  return (
    <Panel title={title} description={description} testId={testId} href="/stock/receptions" hrefLabel="Toutes les réceptions">
      {rows.length === 0 ? (
        <PanelEmpty icon={<Truck aria-hidden />} title={emptyTitle} />
      ) : (
        <>
          <ul className="divide-y border-t">
            {rows.map((r) => (
              <li key={r.orderId} data-testid={`${testId}-row-${r.number}`}>
                <Link href={r.href} className="flex min-h-16 items-center gap-3 px-4 py-2 transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset">
                  <div className="min-w-0 flex-1">
                    <DocNumber value={r.number} />
                    <p className="mt-0.5 truncate text-sm">{r.supplierName}</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    {r.daysLate > 0 ? (
                      <p className="text-[13px] font-medium text-[#B91C1C] dark:text-red-400">En retard de {r.daysLate} j</p>
                    ) : (
                      <p className="text-[13px] font-medium text-foreground">{formatDay(r.expectedDate).slice(0, 5)}</p>
                    )}
                    <p>{r.lineCount} ligne{r.lineCount > 1 ? "s" : ""}</p>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          {total > rows.length ? (
            <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
              {total - rows.length} autre{total - rows.length > 1 ? "s" : ""} livraison{total - rows.length > 1 ? "s" : ""} : voir la page Réceptions.
            </p>
          ) : null}
        </>
      )}
    </Panel>
  );
}

function BelowReorderList({ total, rows }: { total: number; rows: BelowReorderRow[] }) {
  return (
    <Panel
      title="Articles sous le point de commande"
      description="Stock disponible plus commandes en cours sous le seuil : pensez à une demande de réapprovisionnement."
      testId="dash-below-reorder"
      href="/stock/reappro"
      hrefLabel="Réapprovisionnement"
    >
      {rows.length === 0 ? (
        <PanelEmpty icon={<ShieldCheck aria-hidden />} title="Tous les articles sont au-dessus de leur seuil" hint="Rien à réapprovisionner pour le moment." />
      ) : (
        <>
          <ul className="divide-y border-t">
            {rows.map((r) => (
              <li key={r.itemId} data-testid={`dash-below-row-${r.code}`}>
                <Link href={r.href} className="flex min-h-16 items-center gap-3 px-4 py-2 transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset">
                  <div className="min-w-0 flex-1">
                    <span className="doc-number">{r.code}</span>
                    <p className="mt-0.5 truncate text-sm" title={r.name}>
                      {r.name}
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground tabular-nums">
                    <p className="text-[13px] font-medium text-foreground">
                      {formatQty(r.onHand)} {r.stockUnit}
                    </p>
                    <p>Seuil {r.reorderPoint ? formatQty(r.reorderPoint) : "—"}</p>
                  </div>
                  <div className="hidden w-32 justify-end sm:flex">
                    <CoverageGauge days={r.coverageDays} severity={r.severity} />
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          {total > rows.length ? (
            <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">{total - rows.length} autre(s) article(s) : voir la page Réapprovisionnement.</p>
          ) : null}
        </>
      )}
    </Panel>
  );
}

/** Tableau du Magasinier : gros boutons tablette, aucun montant. */
export function StorekeeperBoard({ data, canReceive, canIssue }: { data: StorekeeperDashboard; canReceive: boolean; canIssue: boolean }) {
  return (
    <div className="space-y-5" data-testid="dash-magasinier">
      {canReceive || canIssue ? (
        <div className="flex flex-col gap-3 sm:flex-row" data-testid="dash-quick-actions">
          {canReceive ? (
            <Link href="/stock/receptions/nouvelle" className={`${BIG_LINK} bg-primary text-primary-foreground hover:opacity-90`} data-testid="dash-new-receipt">
              <ArrowDownToLine aria-hidden /> Recevoir une livraison
            </Link>
          ) : null}
          {canIssue ? (
            <Link href="/stock/sorties/nouvelle" className={`${BIG_LINK} border bg-card hover:bg-muted`} data-testid="dash-new-issue">
              <ArrowUpFromLine aria-hidden /> Enregistrer une sortie
            </Link>
          ) : null}
        </div>
      ) : null}

      <ActionTiles cards={data.cards} large />

      <div className="grid gap-4 lg:grid-cols-2">
        <DeliveryList
          title="Réceptions attendues aujourd'hui"
          description="Livraisons prévues ce jour ou en retard."
          total={data.expectedToday.total}
          rows={data.expectedToday.rows}
          testId="dash-expected-today"
          emptyTitle="Aucune livraison attendue aujourd'hui"
        />
        <DeliveryList
          title="Réceptions attendues cette semaine"
          description="Livraisons prévues dans les jours qui viennent."
          total={data.expectedThisWeek.total}
          rows={data.expectedThisWeek.rows}
          testId="dash-expected-week"
          emptyTitle="Aucune autre livraison cette semaine"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BelowReorderList total={data.belowReorder.total} rows={data.belowReorder.rows} />
        <Panel title="Dernières sorties" description="Les 10 dernières sorties de stock validées." testId="dash-recent-issues" href="/stock/sorties">
          {data.recentIssues.length === 0 ? (
            <PanelEmpty icon={<PackageOpen aria-hidden />} title="Aucune sortie enregistrée" hint="Les sorties vers les ateliers apparaîtront ici." />
          ) : (
            <ul className="divide-y border-t">
              {data.recentIssues.map((i) => (
                <li key={i.id} data-testid={`dash-issue-${i.number}`}>
                  <Link href={i.href} className="flex min-h-14 items-center gap-3 px-4 py-2 transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset">
                    <div className="min-w-0 flex-1">
                      <DocNumber value={i.number} />
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {i.departmentName} · {i.requesterName}
                      </p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p className="text-[13px] font-medium text-foreground tabular-nums">{formatDay(i.issuedAt)}</p>
                      <p>{i.lineCount} ligne{i.lineCount > 1 ? "s" : ""}</p>
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
