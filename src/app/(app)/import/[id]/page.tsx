import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { DateCell } from "@/components/date-cell";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { TabLink, TabsNav } from "@/components/tabs-nav";
import { getNow } from "@/lib/clock";
import { todayAbidjan } from "@/lib/dates";
import { isBusinessError } from "@/lib/errors";
import { formatNumber } from "@/lib/money";
import { can } from "@/lib/permissions";
import { pickParams } from "@/lib/search-params";
import { requirePageAction } from "@/modules/auth/session";
import { listCurrencies } from "@/modules/currencies";
import { getImportFile, listCostTypes } from "@/modules/import-files";
import { IMPORT_MODE_LABELS } from "@/modules/import-files/labels";
import { CostSheetTab } from "./cost-sheet-tab";
import { CostsTab } from "./costs-tab";
import { DocumentsTab } from "./documents-tab";
import { FileActions } from "./file-actions";
import { MilestonesTab } from "./milestones-tab";
import { LogisticsEditor, OrdersPanel } from "./summary-panels";

export const metadata: Metadata = { title: "Dossier import – RICHBOND" };

const TABS = ["synthese", "jalons", "frais", "cout", "documents"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = { synthese: "Synthèse", jalons: "Jalons", frais: "Frais d'approche", cout: "Coût de revient", documents: "Documents" };

function Info({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div data-testid={testId}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{children}</dd>
    </div>
  );
}

const dash = <span className="text-muted-foreground/70">—</span>;

async function ImportFileContent({ params, searchParams }: { params: PageProps<"/import/[id]">["params"]; searchParams: PageProps<"/import/[id]">["searchParams"] }) {
  const { id } = await params;
  const user = await requirePageAction("importFile.view", { scope: "IMPORT" });
  const { now } = await getNow();
  let d;
  try {
    d = await getImportFile(user, { id }, now);
  } catch (e) {
    if (isBusinessError(e) && e.code === "NOT_FOUND") notFound();
    if (isBusinessError(e) && e.code === "FORBIDDEN") redirect("/acces-refuse");
    throw e;
  }

  const raw = pickParams(await searchParams, ["onglet"]);
  const tab: Tab = (TABS as readonly string[]).includes(raw.onglet ?? "") ? (raw.onglet as Tab) : "synthese";
  const canWrite = d.can.manage && can(user, "importFile.manage", { scope: "IMPORT" });
  const today = todayAbidjan(now);
  const t = d.sheet.totals;
  const lateCount = d.status === "OUVERT" ? d.milestones.filter((m) => m.late).length : 0;
  const href = (k: Tab) => `/import/${id}${k === "synthese" ? "" : `?onglet=${k}`}`;

  const [costTypes, currencies] =
    tab === "frais" && canWrite ? await Promise.all([listCostTypes(user), listCurrencies({ activeOnly: true })]) : [null, null];

  return (
    <>
      <PageHeader
        title={d.number}
        titleClassName="page-title font-mono tracking-tight"
        description={`${d.supplier.name} · ${IMPORT_MODE_LABELS[d.mode]}${d.incoterm ? ` · ${d.incoterm}` : ""}`}
        meta={
          <div className="flex flex-wrap items-center gap-2" data-testid="imp-badges">
            <StatusBadge status={d.status} />
            {lateCount > 0 ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700" data-testid="imp-late-count">
                <AlertTriangle className="size-3.5" aria-hidden /> {lateCount} {lateCount > 1 ? "jalons en retard" : "jalon en retard"}
              </span>
            ) : null}
          </div>
        }
        actions={
          <FileActions id={d.id} number={d.number} canManage={canWrite} canClose={d.can.close} closable={d.closable} estimatedCount={t.estimatedCostCount} />
        }
      />

      {d.status === "OUVERT" && d.can.close && !d.closable.ok ? (
        <p className="mb-4 rounded-lg border bg-muted p-3 text-sm" data-testid="imp-close-blockers">
          <strong>Clôture impossible pour le moment :</strong> {d.closable.reasons.join(" ")}
        </p>
      ) : null}
      {d.status === "ANNULE" && d.cancelledReason ? (
        <p role="status" className="mb-4 rounded-lg border bg-muted p-3 text-sm" data-testid="imp-cancel-reason">
          <strong>Dossier annulé :</strong> {d.cancelledReason}
        </p>
      ) : null}

      <TabsNav label="Sections du dossier" testId="imp-tabs">
        {TABS.map((k) => (
          <TabLink
            key={k}
            href={href(k)}
            active={tab === k}
            label={TAB_LABELS[k]}
            count={k === "jalons" ? lateCount : k === "frais" ? d.sheet.costs.length : k === "documents" ? d.documents.length : undefined}
            alert={k === "jalons" && lateCount > 0}
            testId={`imp-tab-${k}`}
          />
        ))}
      </TabsNav>

      {tab === "synthese" ? (
        <div className="grid gap-5 xl:grid-cols-3" data-testid="imp-summary">
          <div className="space-y-5 xl:col-span-2">
            <div className="grid gap-3 sm:grid-cols-3">
              <KpiCard testId="imp-sum-goods" label="Valeur des marchandises" value={`${formatNumber(t.goodsValueXof, 0)} FCFA`} help="Valeur des articles en FCFA (réceptions validées, sinon bons de commande)." />
              <KpiCard testId="imp-sum-landed" label="Coût dédouané" value={`${formatNumber(t.landedXof, 0)} FCFA`} help="Valeur des marchandises + frais d'approche répartis." />
              <KpiCard
                testId="imp-sum-coefficient"
                label="Coefficient d'approche"
                value={t.coefficient ? formatNumber(t.coefficient, 4) : "—"}
                help="Coût dédouané ÷ valeur des marchandises. Plus il est proche de 1, moins les frais pèsent."
                hint={d.status === "CLOTURE" ? "Définitif" : "Provisoire"}
              />
            </div>
            <OrdersPanel fileId={d.id} supplierId={d.supplier.id} orders={d.orders} canWrite={canWrite} canViewOrders={can(user, "purchaseOrder.view")} />
            <LogisticsEditor key={d.orders.flatMap((o) => o.lines.map((l) => `${l.id}:${l.unitWeightKg}:${l.unitVolumeM3}`)).join("|")} fileId={d.id} orders={d.orders} canWrite={canWrite} />
          </div>
          <aside className="space-y-5">
            <section className="rounded-xl border bg-card p-4" data-testid="imp-info">
              <h2 className="mb-3 text-[15px] font-semibold">Informations</h2>
              <dl className="grid grid-cols-2 gap-3">
                <Info label="Fournisseur">{d.supplier.name}</Info>
                <Info label="Pays">{d.supplier.country}</Info>
                <Info label="Mode">{IMPORT_MODE_LABELS[d.mode]}</Info>
                <Info label="Incoterm">{d.incoterm ? `${d.incoterm}${d.incotermPlace ? ` ${d.incotermPlace}` : ""}` : dash}</Info>
                <Info label="Chargement">{d.loadingPort ?? dash}</Info>
                <Info label="Transitaire">{d.transitaire ?? dash}</Info>
                <Info label="BL / LTA">{d.blNumber ?? dash}</Info>
                <Info label="Conteneur">{d.containerNumber ?? dash}</Info>
                <Info label="Déclaration en douane">{d.customsDeclaration ?? dash}</Info>
                <Info label="Régime">{d.customsRegime ?? dash}</Info>
                <Info label="Créé le">
                  <DateCell value={d.createdAt} />
                </Info>
                <Info label="Clôturé le">
                  <DateCell value={d.closedAt} />
                </Info>
              </dl>
              {d.notes ? <p className="mt-3 whitespace-pre-line border-t pt-3 text-sm">{d.notes}</p> : null}
            </section>
          </aside>
        </div>
      ) : null}

      {tab === "jalons" ? <MilestonesTab fileId={d.id} items={d.milestones} today={today} canWrite={canWrite} /> : null}

      {tab === "frais" ? (
        <CostsTab
          fileId={d.id}
          costs={d.sheet.costs}
          types={(costTypes?.types ?? []).filter((x) => x.active).map((x) => ({ id: x.id, label: x.label, defaultKey: x.defaultKey, vatRecoverableDefault: x.vatRecoverableDefault }))}
          currencies={(currencies ?? []).map((c) => ({ code: c.code, name: c.name }))}
          canWrite={canWrite}
          history={d.adjustments.map((a) => ({ id: a.id, kind: a.kind, reason: a.reason, createdAt: a.createdAt }))}
        />
      ) : null}

      {tab === "cout" ? <CostSheetTab detail={d} /> : null}

      {tab === "documents" ? <DocumentsTab fileId={d.id} documents={d.documents} canWrite={canWrite} /> : null}
    </>
  );
}

export default function ImportFilePage({ params, searchParams }: PageProps<"/import/[id]">) {
  return (
    <>
      <Link href="/import" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Retour aux dossiers import
      </Link>
      <Suspense fallback={<PageSkeleton />}>
        <ImportFileContent params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}
