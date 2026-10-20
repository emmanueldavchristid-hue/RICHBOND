import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft, Download, Info } from "lucide-react";
import { DateCell } from "@/components/date-cell";
import { MoneyCell } from "@/components/money-cell";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { AgeBadge } from "@/components/purchase-orders/age-badge";
import { LateBadge, RemindBadge } from "@/components/purchase-orders/late-badge";
import { OrderTimeline, type OrderEvent } from "@/components/purchase-orders/order-timeline";
import { OrderTotals } from "@/components/purchase-orders/order-totals";
import { PriceAlertBadge } from "@/components/purchase-orders/price-alert-badge";
import { CloseRemainderButton } from "@/components/receiving/close-remainder-button";
import { OrderReceiptsPanel } from "@/components/receiving/order-receipts-panel";
import { StatusBadge } from "@/components/status-badge";
import { StatusStepper, type StepDef } from "@/components/status-stepper";
import { unitShort } from "@/components/unit-select";
import { getNow } from "@/lib/clock";
import { dayKeyOf, formatDateOnly, todayAbidjan } from "@/lib/dates";
import { isBusinessError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { formatNumber, formatQty } from "@/lib/money";
import { requirePageAction } from "@/modules/auth/session";
import { getOrderForReceipt } from "@/modules/receiving";
import { CONTACT_CHANNEL_LABELS, getOrder, PO_ORIGIN_LABELS, PO_STATUS_LABELS, PO_TYPE_LABELS, type ContactChannelCode, type PoStatus } from "@/modules/purchase-orders";
import { INCOTERM_LABELS, PAYMENT_TERM_LABELS } from "@/modules/referentials/labels";
import { OrderActions } from "./order-actions";

export const metadata: Metadata = { title: "Bon de commande – RICHBOND" };

const BC_STEPS: StepDef[] = [
  { key: "BROUILLON", label: "Brouillon" },
  { key: "A_VALIDER", label: "À valider" },
  { key: "VALIDE", label: "Validé" },
  { key: "ENVOYE", label: "Envoyé" },
  { key: "CONFIRME", label: "Confirmé" },
  { key: "RECU", label: "Reçu" },
];

/** Étape de la frise ; un bon refusé ou annulé reste sur l'étape où il s'est arrêté. */
function stepOf(status: string, approved: boolean, submitted: boolean): string {
  switch (status) {
    case "BROUILLON":
    case "A_VALIDER":
    case "VALIDE":
    case "ENVOYE":
    case "CONFIRME":
      return status;
    case "PARTIELLEMENT_RECU":
    case "RECU":
    case "CLOTURE":
      return "RECU";
    case "REFUSE":
      return "A_VALIDER";
    default:
      return approved ? "VALIDE" : submitted ? "A_VALIDER" : "BROUILLON";
  }
}

function stoppedOf(status: string): { label: string } | null {
  if (status === "REFUSE") return { label: "Refusé" };
  if (status === "ANNULE") return { label: "Annulé" };
  return null;
}

function Info2({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div data-testid={testId}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{children}</dd>
    </div>
  );
}

const dayOrDash = (d: Date | string | null | undefined) => (d ? formatDateOnly(new Date(d)) : "—");

async function OrderContent({ params }: { params: PageProps<"/achats/commandes/[id]">["params"] }) {
  const { id } = await params;
  const user = await requirePageAction("purchaseOrder.view");
  const { now } = await getNow();
  let po;
  try {
    po = await getOrder(user, id, now);
  } catch (e) {
    if (isBusinessError(e) && e.code === "NOT_FOUND") notFound();
    if (isBusinessError(e) && e.code === "FORBIDDEN") redirect("/acces-refuse");
    throw e;
  }

  const status = po.status as PoStatus;
  const updatedAt = new Date(po.updatedAt).toISOString();
  const pending = status === "BROUILLON" || status === "A_VALIDER";
  const isForeign = po.currencyCode !== "XOF";
  const events = po.events as unknown as OrderEvent[];
  const lastReturn = [...po.events].reverse().find((e) => e.type === "RETURNED")?.comment ?? null;
  const priceAlertByLine = new Map(po.alerts.filter((a) => a.kind === "PRICE" && a.lineNo).map((a) => [a.lineNo as number, a.message]));
  const generalAlerts = po.alerts.filter((a) => !(a.kind === "PRICE" && a.lineNo));
  const priceAlerts = po.alerts.filter((a) => a.kind === "PRICE");
  const shownAlerts = pending ? po.alerts : [];
  const totalsView = { ...po.totals, vat: po.totals.vat.map((v) => ({ rate: v.rate, vat: v.vat })) };
  const orderDay = dayKeyOf(po.approvedAt ? new Date(po.approvedAt) : new Date(po.createdAt));
  const promisedDay = po.promisedDate ? new Date(po.promisedDate).toISOString().slice(0, 10) : null;
  const contact = po.supplier.contacts[0] ?? null;
  const amendmentInProgress = po.version > 1 && pending;
  // Bloc « Réceptions » : seulement pour un bon réellement émis (la lecture sans prix est faite par le module).
  const receiving = !pending && can(user, "receipt.view") ? await getOrderForReceipt(user, { orderId: po.id }).catch(() => null) : null;
  const remainderLines = receiving ? receiving.lines.filter((l) => Number(l.remainingQty) > 0) : [];

  return (
    <>
      <PageHeader
        title={po.displayNumber}
        description={`${po.supplier.code} – ${po.supplier.name} · ${PO_TYPE_LABELS[po.type]} · ${PO_ORIGIN_LABELS[po.origin]}`}
        titleClassName="page-title font-mono tracking-tight"
        meta={
          <div className="flex flex-wrap items-center gap-2" data-testid="po-badges">
            <StatusBadge status={po.status} />
            {po.late ? <LateBadge daysLate={po.daysLate} /> : null}
            {po.needsReminder ? <RemindBadge /> : null}
            {po.ageDays !== null ? <AgeBadge days={po.ageDays} severity={po.ageSeverity} /> : null}
          </div>
        }
      />

      <div className="mb-5">
        <StatusStepper steps={po.status === "PARTIELLEMENT_RECU" ? BC_STEPS.map((x) => (x.key === "RECU" ? { ...x, label: "Partiellement reçu" } : x)) : BC_STEPS} current={stepOf(po.status, !!po.approvedAt, !!po.submittedAt)} stopped={stoppedOf(po.status)} testId="po-stepper" label="Avancement du bon de commande" />
      </div>

      {pending ? (
        <p role="note" className="mb-4 rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm text-slate-800" data-testid="po-unvalidated-banner">
          <span className="font-medium">Non validé :</span> ce bon n&apos;a pas encore de numéro officiel et ne doit pas être envoyé au fournisseur. Le PDF est un aperçu.
        </p>
      ) : null}
      {amendmentInProgress ? (
        <p className="mb-4 rounded-lg border border-violet-300 bg-violet-50 p-3 text-sm text-violet-950" data-testid="po-amendment-banner">
          <span className="font-medium">Avenant en cours (version {po.version}) :</span> la version précédente
          {po.resumeStatus ? ` (${PO_STATUS_LABELS[po.resumeStatus as PoStatus] ?? po.resumeStatus})` : ""} reste valable tant que l&apos;avenant n&apos;est pas validé.
        </p>
      ) : null}
      {status === "BROUILLON" && lastReturn && !amendmentInProgress ? (
        <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" data-testid="po-return-banner">
          <span className="font-medium">À corriger :</span> {lastReturn}
        </p>
      ) : null}
      {status === "REFUSE" && po.rejectedReason ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900" data-testid="po-reject-banner">
          <span className="font-medium">Refusé :</span> {po.rejectedReason}
        </p>
      ) : null}
      {status === "ANNULE" && po.cancelledReason ? (
        <p className="mb-4 rounded-lg border bg-muted p-3 text-sm" data-testid="po-cancel-banner">
          <span className="font-medium">Annulé :</span> {po.cancelledReason}
        </p>
      ) : null}
      {po.late ? (
        <p role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-900" data-testid="po-late-banner">
          <AlertTriangle className="size-5 shrink-0" aria-hidden /> Livraison en retard de {po.daysLate} jour{po.daysLate > 1 ? "s" : ""} (attendue le {dayOrDash(po.expectedDate)}).
        </p>
      ) : null}

      {shownAlerts.length > 0 ? (
        <section className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4" aria-labelledby="po-alerts-title" data-testid="po-alerts">
          <h2 id="po-alerts-title" className="mb-2 flex items-center gap-2 font-medium text-amber-950">
            <AlertTriangle className="size-4" aria-hidden /> Points d&apos;attention avant validation
          </h2>
          <ul className="space-y-1.5 text-sm text-amber-950">
            {priceAlerts.map((a, i) => (
              <li key={`p${i}`} data-testid="po-alert-PRICE">
                {a.message}
              </li>
            ))}
            {generalAlerts.map((a, i) => (
              <li key={`g${i}`} data-testid={`po-alert-${a.kind}`}>
                {a.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}


      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
      <div className="mb-6">
        <OrderActions
          id={po.id}
          updatedAt={updatedAt}
          displayNumber={po.displayNumber}
          actions={po.actions}
          status={po.status}
          today={todayAbidjan(now)}
          orderDay={orderDay}
          promisedDay={promisedDay}
          selfApprove={po.createdById === user.id && user.role === "RESPONSABLE_ACHATS"}
          alertCount={po.alerts.length}
          amendment={po.version > 1}
        />
      </div>

      <section className="mb-6" aria-labelledby="po-lines-title">
        <h2 id="po-lines-title" className="mb-2 font-medium">
          Lignes du bon
        </h2>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[56rem] text-sm" data-testid="po-lines">
            <thead className="text-left text-xs font-medium text-muted-foreground">
              <tr>
                <th className="p-3">N°</th>
                <th className="p-3">Article</th>
                <th className="p-3 text-right">Commandé</th>
                <th className="p-3 text-right">Reçu</th>
                <th className="p-3 text-right">Reste</th>
                <th className="p-3 text-right">Prix unitaire</th>
                <th className="p-3 text-right">Remise</th>
                <th className="p-3 text-right">TVA</th>
                <th className="p-3 text-right">Montant</th>
              </tr>
            </thead>
            <tbody>
              {po.lines.map((l) => (
                <tr key={l.id} className="border-t align-top" data-testid={`po-line-${l.lineNo}`}>
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
                    {l.supplierRef ? <span className="block text-xs text-muted-foreground">Réf. fournisseur : {l.supplierRef}</span> : null}
                    {l.allocations.length > 0 ? (
                      <span className="mt-1 flex flex-wrap gap-1.5 text-xs" data-testid={`po-line-${l.lineNo}-allocations`}>
                        {l.allocations.map((a) => (
                          <Link key={a.id} href={`/achats/demandes/${a.requestId}`} className="rounded border px-1.5 py-0.5 text-primary hover:bg-muted">
                            {a.requestNumber ?? "DA"} : {formatQty(a.qty)} {unitShort(a.unit)}
                          </Link>
                        ))}
                      </span>
                    ) : null}
                    {l.note ? <span className="block text-xs text-muted-foreground">{l.note}</span> : null}
                    {priceAlertByLine.has(l.lineNo) && pending ? <PriceAlertBadge className="mt-1" message={priceAlertByLine.get(l.lineNo)!} /> : null}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap tabular-nums" data-testid={`po-line-${l.lineNo}-qty`}>
                    {formatQty(l.quantity)} {unitShort(l.unit)}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap tabular-nums" data-testid={`po-line-${l.lineNo}-received`}>
                    {formatQty(l.receivedQty)}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap tabular-nums" data-testid={`po-line-${l.lineNo}-remaining`}>
                    {formatQty(l.remainingQty)}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap tabular-nums">
                    <MoneyCell value={l.unitPrice} currency={po.currencyCode} decimals={isForeign ? po.currency.decimals : 0} />
                  </td>
                  <td className="p-3 text-right tabular-nums">{Number(l.discountPct) > 0 ? `${formatNumber(l.discountPct, 2)} %` : "—"}</td>
                  <td className="p-3 text-right tabular-nums">{formatNumber(l.vatRate, 2)} %</td>
                  <td className="p-3 text-right whitespace-nowrap tabular-nums">
                    <MoneyCell value={l.netAmount} currency={po.currencyCode} decimals={isForeign ? po.currency.decimals : 0} />
                  </td>
                </tr>
              ))}
              {po.charges.map((c) => (
                <tr key={c.id} className="border-t" data-testid="po-charge">
                  <td className="p-3" />
                  <td className="p-3 italic" colSpan={6}>
                    Frais : {c.label}
                  </td>
                  <td className="p-3 text-right tabular-nums">{formatNumber(c.vatRate, 2)} %</td>
                  <td className="p-3 text-right whitespace-nowrap tabular-nums">
                    <MoneyCell value={c.amount} currency={po.currencyCode} decimals={isForeign ? po.currency.decimals : 0} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4">
          <OrderTotals currency={po.currencyCode} totals={totalsView} rate={po.exchangeRate} rateIndicative={!po.exchangeRate} decimals={po.currency.decimals} />
        </div>
      </section>

          {receiving && (receiving.receipts.length > 0 || receiving.receivable) ? (
            <div className="mb-6">
              <OrderReceiptsPanel
                orderId={po.id}
                receipts={receiving.receipts}
                canReceive={receiving.receivable && can(user, "receipt.create")}
                closeButton={
                  status === "PARTIELLEMENT_RECU" && can(user, "purchaseOrder.closeRemainder") && remainderLines.length > 0 ? (
                    <CloseRemainderButton orderId={po.id} number={po.displayNumber} lines={remainderLines} />
                  ) : null
                }
              />
            </div>
          ) : null}

          <div className="mb-6">

        <section aria-labelledby="po-versions-title" data-testid="po-versions">
          <h2 id="po-versions-title" className="mb-2 font-medium">
            Versions validées (PDF)
          </h2>
          {po.versions.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="size-4" aria-hidden /> Aucune version validée pour l&apos;instant.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border bg-card text-sm">
              {po.versions.map((v) => (
                <li key={v.version} className="flex min-h-12 items-center justify-between gap-3 px-3 py-2" data-testid={`po-version-${v.version}`}>
                  <span>
                    Version {v.version}
                    {v.version === po.version && !pending ? " (actuelle)" : ""} · validée le <DateCell value={v.approvedAt} />
                  </span>
                  <a
                    href={`/api/purchase-orders/${po.id}/pdf?v=${v.version}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-11 items-center gap-1.5 rounded-lg border px-3 font-medium hover:bg-muted"
                    data-testid={`po-version-${v.version}-pdf`}
                  >
                    <Download className="size-4" /> PDF
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
          </div>
        </div>
        <aside className="space-y-4" aria-label="Informations et chronologie">
      <section className="rounded-xl border bg-card p-4" aria-label="Informations clés">
        <dl className="grid gap-3.5" data-testid="po-info">
          <Info2 label="Fournisseur">
            <Link href={`/fournisseurs/${po.supplier.id}`} className="text-primary underline-offset-4 hover:underline">
              {po.supplier.name}
            </Link>
            {contact ? <span className="block text-xs font-normal text-muted-foreground">{[contact.name, contact.phone].filter(Boolean).join(" · ")}</span> : null}
          </Info2>
          <Info2 label="Créé par">
            {po.createdBy.name}{" "}
            <span className="font-normal text-muted-foreground">
              le <DateCell value={po.createdAt} />
            </span>
          </Info2>
          <Info2 label="Validé par" testId="po-approved-by">
            {po.approvedBy ? (
              <>
                {po.approvedBy.name}{" "}
                <span className="font-normal text-muted-foreground">
                  le <DateCell value={po.approvedAt} />
                </span>
              </>
            ) : (
              "—"
            )}
          </Info2>
          <Info2 label="Devise">
            {po.currency.name} ({po.currencyCode})
            {isForeign ? (
              <span className="block text-xs font-normal text-muted-foreground">
                {po.exchangeRate ? `Taux figé : ${formatNumber(po.exchangeRate, 6)} FCFA (au ${dayOrDash(po.rateDate)})` : "Taux figé à la validation"}
              </span>
            ) : null}
          </Info2>
          <Info2 label="Conditions de paiement">
            {PAYMENT_TERM_LABELS[po.paymentTerm as keyof typeof PAYMENT_TERM_LABELS] ?? po.paymentTerm}
            {po.paymentTermNote ? <span className="block text-xs font-normal text-muted-foreground">{po.paymentTermNote}</span> : null}
          </Info2>
          {po.incoterm ? (
            <Info2 label="Incoterm">
              {po.incoterm} {po.incotermPlace ?? ""}
              <span className="block text-xs font-normal text-muted-foreground">{INCOTERM_LABELS[po.incoterm as keyof typeof INCOTERM_LABELS] ?? ""}</span>
            </Info2>
          ) : null}
          <Info2 label="Livraison demandée le">{dayOrDash(po.requestedDate)}</Info2>
          <Info2 label="Date promise" testId="po-promised">
            {po.promisedDate ? dayOrDash(po.promisedDate) : "Pas encore confirmée"}
            {po.promisedDateChanges > 0 ? (
              <span className="block text-xs font-normal text-amber-800">
                Reportée {po.promisedDateChanges} fois (1re date : {dayOrDash(po.firstPromisedDate)})
              </span>
            ) : null}
          </Info2>
          <Info2 label="Dépôt de livraison">
            {po.warehouse.name}
            <span className="block text-xs font-normal whitespace-pre-wrap text-muted-foreground">{po.deliveryAddress}</span>
          </Info2>
          <Info2 label="Envoyé" testId="po-sent">
            {po.sentAt ? (
              <>
                <DateCell value={po.sentAt} />
                {po.sentChannel ? <span className="block text-xs font-normal text-muted-foreground">{CONTACT_CHANNEL_LABELS[po.sentChannel as ContactChannelCode] ?? po.sentChannel}</span> : null}
              </>
            ) : (
              "—"
            )}
          </Info2>
          <Info2 label="Relances" testId="po-reminders">
            {po.reminderCount > 0 ? (
              <>
                {po.reminderCount} <span className="font-normal text-muted-foreground">(dernière le </span>
                <DateCell value={po.lastRemindedAt} />
                <span className="font-normal text-muted-foreground">)</span>
              </>
            ) : (
              "Aucune"
            )}
          </Info2>
          {po.supplierRef ? <Info2 label="Référence fournisseur">{po.supplierRef}</Info2> : null}
        </dl>
        {po.directReason ? (
          <div className="mt-4 border-t pt-3">
            <p className="text-xs text-muted-foreground">Motif de la commande directe</p>
            <p className="mt-0.5 text-sm whitespace-pre-wrap" data-testid="po-direct-reason">
              {po.directReason}
            </p>
          </div>
        ) : null}
        {po.notes ? (
          <div className="mt-4 border-t pt-3">
            <p className="text-xs text-muted-foreground">Observations (imprimées sur le bon)</p>
            <p className="mt-0.5 text-sm whitespace-pre-wrap">{po.notes}</p>
          </div>
        ) : null}
        {po.internalNote ? (
          <div className="mt-4 border-t pt-3">
            <p className="text-xs text-muted-foreground">Note interne (jamais imprimée)</p>
            <p className="mt-0.5 text-sm whitespace-pre-wrap">{po.internalNote}</p>
          </div>
        ) : null}
        {po.sourceRequests.length > 0 ? (
          <div className="mt-4 border-t pt-3" data-testid="po-sources">
            <p className="text-xs text-muted-foreground">Demandes d&apos;achat sources</p>
            <ul className="mt-1 flex flex-wrap gap-2 text-sm">
              {po.sourceRequests.map((r) => (
                <li key={r.id}>
                  <Link href={`/achats/demandes/${r.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 font-mono text-primary hover:bg-muted" data-testid={`po-source-${r.displayNumber}`}>
                    {r.displayNumber} <StatusBadge status={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
        <section aria-labelledby="po-history-title" className="rounded-xl border bg-card p-4">
          <h2 id="po-history-title" className="mb-4 text-[15px] font-semibold">
            Chronologie
          </h2>
          <OrderTimeline events={events} />
        </section>
        </aside>
      </div>
    </>
  );
}

export default function OrderPage({ params }: PageProps<"/achats/commandes/[id]">) {
  return (
    <>
      <Link href="/achats/commandes" className="mb-3 inline-flex lg:hidden min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Retour aux bons de commande
      </Link>
      <Suspense fallback={<PageSkeleton />}>
        <OrderContent params={params} />
      </Suspense>
    </>
  );
}
