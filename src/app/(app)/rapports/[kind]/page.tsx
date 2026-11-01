import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Download, FileSpreadsheet } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { ReportFilters } from "@/components/reports/report-filters";
import { ReportView } from "@/components/reports/report-view";
import { buttonVariants } from "@/components/ui/button";
import { getNow } from "@/lib/clock";
import { todayAbidjan } from "@/lib/dates";
import { isBusinessError } from "@/lib/errors";
import { pickParams, type SearchParams } from "@/lib/search-params";
import { cn } from "@/lib/utils";
import { requirePageAction } from "@/modules/auth/session";
import { buildReport, isReportKind, reportFilterOptions } from "@/modules/reporting";
import { reportAccess } from "@/modules/reporting/report-access";
import { REPORT_LABELS } from "@/modules/reporting/report-types";

export const metadata: Metadata = { title: "Rapport – RICHBOND" };

const PARAMS = ["date", "month", "category", "buyerId", "supplierId", "warehouseId"] as const;
const DESCRIPTIONS = {
  quotidien: "Activité d'une journée : achats, réceptions, mouvements de stock, retards et ruptures.",
  hebdomadaire: "Synthèse d'une semaine (lundi au dimanche) comparée à la précédente.",
  mensuel: "Indicateurs de pilotage du mois comparés au mois précédent.",
} as const;

async function ReportContent({ params, searchParams }: { params: Promise<{ kind: string }>; searchParams: Promise<SearchParams> }) {
  const { kind } = await params;
  if (!isReportKind(kind)) notFound();
  const user = await requirePageAction(null);
  if (!reportAccess(user).allowed) redirect("/acces-refuse");
  const values = pickParams(await searchParams, PARAMS);
  const { now } = await getNow();
  const options = await reportFilterOptions();
  const qs = new URLSearchParams(Object.entries(values).filter((e): e is [string, string] => !!e[1])).toString();
  const exportHref = (format: "pdf" | "xlsx") => `/api/rapports/${kind}?format=${format}${qs ? `&${qs}` : ""}`;

  let report = null;
  let error: string | null = null;
  try {
    report = await buildReport(user, kind, values, now);
  } catch (e) {
    if (!isBusinessError(e)) throw e;
    error = e.messageFr;
  }

  return (
    <>
      <PageHeader
        title={REPORT_LABELS[kind]}
        description={report ? `${report.periodLabel} · ${DESCRIPTIONS[kind]}` : DESCRIPTIONS[kind]}
        actions={
          report ? (
            <>
              <a href={exportHref("xlsx")} className={cn(buttonVariants({ variant: "outline" }), "h-11 px-4")} data-testid="rpt-export-xlsx">
                <FileSpreadsheet aria-hidden /> Excel
              </a>
              <a href={exportHref("pdf")} className={cn(buttonVariants(), "h-11 px-4")} data-testid="rpt-export-pdf">
                <Download aria-hidden /> PDF
              </a>
            </>
          ) : null
        }
      />
      <ReportFilters kind={kind} values={values} options={options} today={todayAbidjan(now)} />
      {report ? (
        <>
          <p className="mb-4 text-sm text-muted-foreground" data-testid="rpt-period">
            {report.periodLabel}
            {report.filters.length > 0 ? ` · ${report.filters.map((f) => `${f.label} : ${f.value}`).join(" · ")}` : ""}
          </p>
          <ReportView report={report} />
        </>
      ) : (
        <EmptyState title="Rapport indisponible" description={error ?? "Le rapport n'a pas pu être calculé."} />
      )}
    </>
  );
}

export default function ReportPage({ params, searchParams }: PageProps<"/rapports/[kind]">) {
  return (
    <Suspense fallback={<PageSkeleton rows={6} />}>
      <ReportContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}
