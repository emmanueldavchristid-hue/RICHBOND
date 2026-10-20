import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DateCell } from "@/components/date-cell";
import { DocNumber } from "@/components/doc-number";
import { MoneyCell } from "@/components/money-cell";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { QtyCell } from "@/components/qty-cell";
import { StatusBadge } from "@/components/status-badge";
import { CancelIssueButton } from "@/components/stock/cancel-issue-button";
import { ISSUE_STATUS_LABELS } from "@/components/stock/labels";
import { isBusinessError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { requirePageAction } from "@/modules/auth/session";
import { getIssue } from "@/modules/stock";

export const metadata: Metadata = { title: "Sortie de stock – RICHBOND" };

const Info = ({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) => (
  <div>
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="mt-0.5 text-sm" data-testid={testId}>
      {children}
    </dd>
  </div>
);

async function IssueContent({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageAction("stock.view");
  const { id } = await params;
  const issue = await getIssue(user, { id }).catch((e: unknown) => {
    if (isBusinessError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const showCosts = can(user, "price.viewPmp");
  const cancelled = issue.status === "ANNULEE";
  return (
    <>
      <PageHeader
        title={issue.number}
        titleClassName="page-title doc-number"
        description={`${issue.departmentName} · ${issue.warehouseName}`}
        meta={<StatusBadge status={issue.status} label={ISSUE_STATUS_LABELS[issue.status]} tone={cancelled ? "danger" : "success"} />}
        actions={!cancelled && can(user, "stock.adjust") ? <CancelIssueButton id={issue.id} number={issue.number} /> : null}
      />
      <div className="space-y-4">
        <section className="rounded-xl border bg-card p-4 sm:p-5" aria-label="Informations de la sortie">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Info label="Date de sortie">
              <DateCell value={issue.issuedAt} />
            </Info>
            <Info label="Demandeur" testId="sor-requester-value">
              {issue.requesterName}
            </Info>
            <Info label="Motif">{issue.reason}</Info>
            <Info label="Machine">{issue.equipment ?? <span className="text-muted-foreground/70">—</span>}</Info>
            <Info label="Saisi par">{issue.createdByName}</Info>
            {showCosts ? (
              <Info label="Valeur totale">
                <MoneyCell value={issue.totalValue} />
              </Info>
            ) : null}
          </dl>
        </section>
        {cancelled ? (
          <p role="status" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200" data-testid="sor-cancelled-note">
            Sortie annulée{issue.cancelledByName ? ` par ${issue.cancelledByName}` : ""}
            {issue.cancelledAt ? (
              <>
                {" le "}
                <DateCell value={issue.cancelledAt} />
              </>
            ) : null}
            . Motif : {issue.cancelledReason}
          </p>
        ) : null}
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[32rem] text-sm" data-testid="sor-lines">
            <thead className="text-left text-xs font-medium text-muted-foreground">
              <tr className="border-b">
                <th className="h-10 px-3">Article</th>
                <th className="px-3 text-right">Quantité</th>
                {showCosts ? <th className="px-3 text-right">Coût unitaire</th> : null}
                {showCosts ? <th className="px-3 text-right">Valeur</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y">
              {issue.lines.map((l) => (
                <tr key={l.id} className="h-11" data-testid={`sor-line-row-${l.itemCode}`}>
                  <td className="px-3">
                    <Link href={`/stock/articles/${l.itemId}`} className="text-primary hover:underline">
                      <DocNumber value={l.itemCode} />
                    </Link>{" "}
                    {l.itemName}
                  </td>
                  <td className="px-3 text-right tabular-nums">
                    <QtyCell value={l.quantity} unit={l.stockUnit} />
                  </td>
                  {showCosts ? (
                    <td className="px-3 text-right tabular-nums">
                      <MoneyCell value={l.unitCost} />
                    </td>
                  ) : null}
                  {showCosts ? (
                    <td className="px-3 text-right tabular-nums">
                      <MoneyCell value={l.value} />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export default function IssuePage({ params }: PageProps<"/stock/sorties/[id]">) {
  return (
    <>
      <Link href="/stock/sorties" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground" data-testid="sor-back">
        <ArrowLeft className="size-4" /> Retour aux sorties
      </Link>
      <Suspense fallback={<PageSkeleton rows={4} />}>
        <IssueContent params={params} />
      </Suspense>
    </>
  );
}
