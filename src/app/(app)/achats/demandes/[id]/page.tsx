import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { DateCell } from "@/components/date-cell";
import { MoneyCell } from "@/components/money-cell";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { AttachmentsPanel } from "@/components/purchase-requests/attachments-panel";
import { Timeline, type TimelineEvent } from "@/components/purchase-requests/timeline";
import { UrgencyBadge } from "@/components/purchase-requests/urgency-badge";
import { AllocationCell } from "@/components/purchase-orders/allocation-cell";
import { StatusBadge } from "@/components/status-badge";
import { unitShort } from "@/components/unit-select";
import { isBusinessError } from "@/lib/errors";
import { formatFcfa, formatQty } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requirePageAction } from "@/modules/auth/session";
import { getRequest, listAssignableBuyers, PR_KIND_LABELS, PR_TYPE_LABELS } from "@/modules/purchase-requests";
import { viewerCanSeePrices } from "@/modules/settings";
import { RequestActions } from "./request-actions";
import { RequestDuplicates } from "./request-duplicates";

export const metadata: Metadata = { title: "Demande d'achat – RICHBOND" };

function Info({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div data-testid={testId}>
      <dt className="text-xs text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{children}</dd>
    </div>
  );
}

async function RequestContent({ params }: { params: PageProps<"/achats/demandes/[id]">["params"] }) {
  const { id } = await params;
  const user = await requirePageAction("purchaseRequest.view");
  const showPrices = await viewerCanSeePrices(user);
  let pr;
  try {
    pr = await getRequest(user, id, { showPrices });
  } catch (e) {
    if (isBusinessError(e) && e.code === "NOT_FOUND") notFound();
    if (isBusinessError(e) && e.code === "FORBIDDEN") redirect("/acces-refuse");
    throw e;
  }

  const updatedAt = new Date(pr.updatedAt).toISOString();
  const canApprove = can(user, "purchaseRequest.approve");
  const [local, imp] = canApprove ? await Promise.all([listAssignableBuyers("LOCAL"), listAssignableBuyers("IMPORT")]) : [null, null];
  const choice = (r: typeof local) => ({
    proposedId: r?.proposedId ?? null,
    buyers: (r?.buyers ?? []).map(({ id: i, name, openCount }) => ({ id: i, name, openCount })),
  });
  const buyers = { LOCAL: choice(local), IMPORT: choice(imp) };

  const hasApproved = pr.lines.some((l) => l.approvedQty != null);
  const itemIds = pr.lines.map((l) => l.itemId).filter((x): x is string => !!x);
  const events = pr.events as unknown as TimelineEvent[];
  const lastReturn = [...pr.events].reverse().find((e) => e.type === "RETURNED")?.comment ?? null;
  const decisionOpen = pr.status === "SOUMISE";
  // LOT-05 : colonnes « Commandé / Reste » dès qu'un bon de commande touche la demande (ou qu'elle est ouverte à la commande).
  const showOrdering = pr.linkedOrders.length > 0 || ["VALIDEE", "EN_CONSULTATION", "PARTIELLEMENT_COMMANDEE", "COMMANDEE"].includes(pr.status);

  return (
    <>
      <PageHeader
        title={pr.displayNumber}
        description={`${PR_KIND_LABELS[pr.kind]} · ${pr.department.name}`}
        actions={
          <div className="flex flex-wrap items-center gap-2" data-testid="pr-badges">
            <StatusBadge status={pr.status} />
            <UrgencyBadge urgency={pr.urgency} />
          </div>
        }
      />

      {pr.urgency === "ARRET_PRODUCTION" && decisionOpen ? (
        <p role="alert" className="mb-4 flex items-center gap-2 rounded-lg bg-red-700 p-3 text-sm font-medium text-white" data-testid="pr-stop-banner">
          <AlertTriangle className="size-5 shrink-0" aria-hidden /> Arrêt de production : cette demande attend une décision immédiate.
        </p>
      ) : null}
      {pr.exceedsThreshold ? (
        <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" data-testid="pr-threshold-banner">
          Au-delà du seuil de {formatFcfa(pr.approvalThreshold)} : validation direction prévue (information, rien ne bloque aujourd&apos;hui).
        </p>
      ) : null}
      {pr.status === "A_COMPLETER" && lastReturn ? (
        <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" data-testid="pr-return-banner">
          <span className="font-medium">À compléter :</span> {lastReturn}
        </p>
      ) : null}
      {pr.status === "REFUSEE" && pr.rejectedReason ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900" data-testid="pr-reject-banner">
          <span className="font-medium">Refusée :</span> {pr.rejectedReason}
        </p>
      ) : null}
      {pr.status === "ANNULEE" && pr.cancelledReason ? (
        <p className="mb-4 rounded-lg border bg-muted p-3 text-sm" data-testid="pr-cancel-banner">
          <span className="font-medium">Annulée :</span> {pr.cancelledReason}
        </p>
      ) : null}

      <section className="mb-6 rounded-lg border bg-card p-5">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="pr-info">
          <Info label="Service">{pr.department.name}</Info>
          <Info label="Demandeur">{pr.requesterName}</Info>
          <Info label="Date de besoin">
            <DateCell value={pr.neededBy} />
          </Info>
          <Info label="Type d'achat">{PR_TYPE_LABELS[pr.type]}</Info>
          <Info label="Créée par">
            {pr.createdBy.name}{" "}
            <span className="font-normal text-muted-foreground">
              le <DateCell value={pr.createdAt} />
            </span>
          </Info>
          <Info label="Soumise le">
            <DateCell value={pr.submittedAt} />
          </Info>
          <Info label="Validée par" testId="pr-approved-by">
            {pr.approvedBy ? (
              <>
                {pr.approvedBy.name}{" "}
                <span className="font-normal text-muted-foreground">
                  le <DateCell value={pr.approvedAt} />
                </span>
              </>
            ) : (
              "–"
            )}
          </Info>
          <Info label="Acheteur assigné" testId="pr-buyer">
            {pr.assignedBuyer?.name ?? (pr.status === "VALIDEE" ? <span className="text-amber-800">Non assignée</span> : "–")}
          </Info>
          {showPrices ? (
            <Info label="Montant estimé" testId="pr-total">
              <MoneyCell value={pr.estimatedTotal} decimals={0} empty="non chiffré" />
            </Info>
          ) : null}
        </dl>
        <div className="mt-4 border-t pt-3">
          <p className="text-xs text-muted-foreground uppercase">Motif</p>
          <p className="mt-0.5 text-sm whitespace-pre-wrap" data-testid="pr-reason">
            {pr.reason}
          </p>
        </div>
      </section>

      <div className="mb-6">
        <RequestActions
          id={pr.id}
          updatedAt={updatedAt}
          displayNumber={pr.displayNumber}
          actions={pr.actions}
          type={pr.type}
          isStop={pr.urgency === "ARRET_PRODUCTION"}
          lines={pr.lines.map((l) => ({
            id: l.id,
            lineNo: l.lineNo,
            code: l.item?.code ?? "",
            name: l.item?.name ?? l.freeDesignation ?? "",
            quantity: String(l.quantity),
            unit: l.unit,
            approvedQty: l.approvedQty != null ? String(l.approvedQty) : null,
          }))}
          buyers={buyers}
          assignedBuyerId={pr.assignedBuyerId}
          selfApprove={pr.createdById === user.id && user.role === "RESPONSABLE_ACHATS"}
          exceedsThreshold={pr.exceedsThreshold}
        />
      </div>

      {decisionOpen && canApprove ? (
        <div className="mb-6">
          <RequestDuplicates requestId={pr.id} itemIds={itemIds} />
        </div>
      ) : null}

      <section className="mb-6" aria-labelledby="pr-lines-title">
        <h2 id="pr-lines-title" className="mb-2 font-medium">
          Articles demandés
        </h2>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[44rem] text-sm" data-testid="pr-lines">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground uppercase">
              <tr>
                <th className="p-3">N°</th>
                <th className="p-3">Article</th>
                <th className="p-3 text-right">Demandé</th>
                {hasApproved ? <th className="p-3 text-right">Validé</th> : null}
                <th className="p-3">Unité</th>
                {showOrdering ? <th className="p-3 text-right">Commandé / Reste</th> : null}
                {showPrices ? <th className="p-3 text-right">Prix estimé</th> : null}
                {showPrices ? <th className="p-3 text-right">Total</th> : null}
              </tr>
            </thead>
            <tbody>
              {pr.lines.map((l) => {
                const diff = l.approvedQty != null && Number(l.approvedQty) !== Number(l.quantity);
                return (
                  <tr key={l.id} className="border-t" data-testid={`pr-line-${l.lineNo}`}>
                    <td className="p-3 tabular-nums">{l.lineNo}</td>
                    <td className="p-3">
                      {l.item ? (
                        <>
                          <span className="font-mono text-xs text-muted-foreground">{l.item.code}</span>
                          <span className="block font-medium">{l.item.name}</span>
                        </>
                      ) : (
                        <>
                          <span className="block font-medium">{l.freeDesignation}</span>
                          <span className="text-xs text-muted-foreground">Article hors catalogue</span>
                        </>
                      )}
                    </td>
                    <td className="p-3 text-right tabular-nums">{formatQty(l.quantity)}</td>
                    {hasApproved ? (
                      <td className={`p-3 text-right tabular-nums ${diff ? "font-semibold text-amber-800" : ""}`} data-testid={`pr-line-${l.lineNo}-approved`}>
                        {l.approvedQty != null ? formatQty(l.approvedQty) : "–"}
                        {diff ? <span className="block text-xs font-normal">{Number(l.approvedQty) === 0 ? "ligne retirée" : "modifié"}</span> : null}
                      </td>
                    ) : null}
                    <td className="p-3">{unitShort(l.unit)}</td>
                    {showOrdering ? (
                      <td className="p-3 text-right" data-testid={`pr-line-${l.lineNo}-ordering`}>
                        <AllocationCell ordered={l.orderedQty} remaining={l.remainingQty} unit={l.unit} />
                      </td>
                    ) : null}
                    {showPrices ? (
                      <td className="p-3 text-right tabular-nums">
                        <MoneyCell value={l.estimatedUnitPrice} decimals={0} />
                      </td>
                    ) : null}
                    {showPrices ? (
                      <td className="p-3 text-right tabular-nums">
                        <MoneyCell value={l.lineTotal} decimals={0} />
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {pr.linkedOrders.length > 0 ? (
        <section className="mb-6" aria-labelledby="pr-orders-title" data-testid="pr-linked-orders">
          <h2 id="pr-orders-title" className="mb-2 font-medium">
            Commandes liées
          </h2>
          <ul className="divide-y rounded-lg border bg-card text-sm">
            {pr.linkedOrders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2" data-testid={`pr-linked-order-${o.displayNumber.replace(/\s+/g, "-")}`}>
                <Link href={`/achats/commandes/${o.id}`} className="inline-flex min-h-11 items-center font-mono font-medium text-primary underline-offset-4 hover:underline">
                  {o.displayNumber}
                </Link>
                <StatusBadge status={o.status} />
                <span className="text-muted-foreground tabular-nums">
                  {o.lines
                    .map((ol) => {
                      const line = pr.lines.find((l) => l.id === ol.requestLineId);
                      return line ? `ligne ${line.lineNo} : ${formatQty(ol.qty)} ${unitShort(line.unit)}` : null;
                    })
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted-foreground">Les bons en brouillon réservent la quantité mais ne changent pas le statut de la demande.</p>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="pr-att-title">
          <h2 id="pr-att-title" className="mb-2 font-medium">
            Pièces jointes
          </h2>
          <AttachmentsPanel requestId={pr.id} items={pr.attachments} canEdit={pr.actions.includes("attach")} />
        </section>
        <section aria-labelledby="pr-history-title">
          <h2 id="pr-history-title" className="mb-3 font-medium">
            Chronologie
          </h2>
          <Timeline events={events} />
        </section>
      </div>
    </>
  );
}

export default function RequestPage({ params }: PageProps<"/achats/demandes/[id]">) {
  return (
    <>
      <Link href="/achats/demandes" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Retour aux demandes d&apos;achat
      </Link>
      <Suspense fallback={<PageSkeleton />}>
        <RequestContent params={params} />
      </Suspense>
    </>
  );
}
