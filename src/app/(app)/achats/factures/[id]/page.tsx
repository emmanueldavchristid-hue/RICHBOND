import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { DateCell } from "@/components/date-cell";
import { MoneyCell } from "@/components/money-cell";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { StatusStepper, type StepDef } from "@/components/status-stepper";
import { isBusinessError } from "@/lib/errors";
import { formatNumber, formatQty } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requirePageAction } from "@/modules/auth/session";
import { getInvoice } from "@/modules/invoices";
import { INVOICE_MATCH_LABELS, type InvoiceStatusCode } from "@/modules/invoices/labels";
import { InvoiceActions } from "./invoice-actions";
import { InvoiceAttachments } from "./invoice-attachments";

export const metadata: Metadata = { title: "Facture fournisseur – RICHBOND" };

const STEPS: StepDef[] = [
  { key: "SAISIE", label: "Saisie" },
  { key: "RAPPROCHEE", label: "Rapprochée" },
  { key: "BON_A_PAYER", label: "Bon à payer" },
  { key: "TRANSMISE", label: "Transmise compta" },
];

function stepOf(status: InvoiceStatusCode): string {
  switch (status) {
    case "CONFORME":
    case "ECART":
    case "LITIGE":
      return "RAPPROCHEE";
    case "ANNULEE":
      return "SAISIE";
    default:
      return status;
  }
}

function Info({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div data-testid={testId}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{children}</dd>
    </div>
  );
}

const signed = (v: string, suffix = "") => {
  const n = Number(v);
  return `${n > 0 ? "+" : ""}${formatNumber(v, 2)}${suffix}`;
};

async function InvoiceContent({ params }: { params: PageProps<"/achats/factures/[id]">["params"] }) {
  const { id } = await params;
  const user = await requirePageAction("invoice.view");
  let inv;
  try {
    inv = await getInvoice(user, { id });
  } catch (e) {
    if (isBusinessError(e) && e.code === "NOT_FOUND") notFound();
    if (isBusinessError(e) && e.code === "FORBIDDEN") redirect("/acces-refuse");
    throw e;
  }

  const canManage = can(user, "invoice.manage");
  const canOrders = can(user, "purchaseOrder.view");
  const isXof = inv.currencyCode === "XOF";
  const dec = isXof ? 0 : 2;
  const gapCount = inv.lines.filter((l) => l.match && l.match !== "CONFORME").length;
  const stopped = inv.status === "LITIGE" ? { label: "Litige" } : inv.status === "ANNULEE" ? { label: "Annulée" } : null;
  const orderLink = (orderId: string, label: string) =>
    canOrders ? (
      <Link href={`/achats/commandes/${orderId}`} className="doc-number text-primary hover:underline">
        {label}
      </Link>
    ) : (
      <span className="doc-number">{label}</span>
    );

  return (
    <>
      <PageHeader
        title={inv.number}
        description={`${inv.supplier.code} – ${inv.supplier.name} · facture n° ${inv.supplierInvoiceNo}`}
        titleClassName="page-title font-mono tracking-tight"
        meta={
          <div className="flex flex-wrap items-center gap-2" data-testid="inv-badges">
            <StatusBadge status={inv.status} />
            {gapCount > 0 ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700" data-testid="inv-gap-count">
                <AlertTriangle className="size-3.5" /> {gapCount} {gapCount > 1 ? "lignes en écart" : "ligne en écart"}
              </span>
            ) : null}
          </div>
        }
      />

      <div className="space-y-5">
        <StatusStepper steps={STEPS} current={stepOf(inv.status)} stopped={stopped} testId="inv-stepper" label="Avancement de la facture" />

        <InvoiceActions id={inv.id} number={inv.number} status={inv.status} canManage={canManage} canApprove={can(user, "invoice.approvePayment")} />

        {inv.status === "LITIGE" && inv.litigeReason ? (
          <p role="status" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900" data-testid="inv-litige-reason">
            <strong>Litige :</strong> {inv.litigeReason}
          </p>
        ) : null}
        {inv.status === "ANNULEE" && inv.cancelledReason ? (
          <p role="status" className="rounded-lg border bg-muted p-3 text-sm" data-testid="inv-cancel-reason">
            <strong>Facture annulée :</strong> {inv.cancelledReason}
          </p>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-3">
          <div className="space-y-5 xl:col-span-2">
            <section className="rounded-xl border bg-card p-4" data-testid="inv-matching">
              <h2 className="text-[15px] font-semibold">Rapprochement par ligne</h2>
              <p className="mb-3 mt-1 text-xs text-muted-foreground">
                Quantité facturée comparée à la quantité reçue et acceptée, prix facturé comparé au prix du bon de commande (net de remise). Les écarts sont surlignés.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                      <th className="py-2 pr-3">BC / ligne</th>
                      <th className="py-2 pr-3">Désignation</th>
                      <th className="py-2 pr-3 text-right">Qté facturée</th>
                      <th className="py-2 pr-3 text-right">Qté reçue facturable</th>
                      <th className="py-2 pr-3 text-right">Prix facturé</th>
                      <th className="py-2 pr-3 text-right">Prix du BC</th>
                      <th className="py-2 pr-3 text-right">Montant HT</th>
                      <th className="py-2">Résultat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inv.lines.map((l) => {
                      const qtyGap = l.match === "ECART_QTE" || l.match === "ECART_PRIX_QTE";
                      const priceGap = l.match === "ECART_PRIX" || l.match === "ECART_PRIX_QTE";
                      return (
                        <tr key={l.id} className={`border-b last:border-0 ${l.match && l.match !== "CONFORME" ? "bg-amber-50" : ""}`} data-testid={`inv-line-${l.lineNo}`} data-match={l.match ?? ""}>
                          <td className="py-2.5 pr-3 whitespace-nowrap">{orderLink(l.orderId, `${l.orderNumber} / ${l.orderLineNo}`)}</td>
                          <td className="py-2.5 pr-3">{l.designation}</td>
                          <td className={`py-2.5 pr-3 text-right tabular-nums whitespace-nowrap ${qtyGap ? "font-semibold text-amber-800" : ""}`} data-testid="inv-line-qty">
                            {formatQty(l.quantity)} {l.unit}
                            {qtyGap && l.qtyDelta ? <span className="block text-xs">{signed(l.qtyDelta)} {l.unit}</span> : null}
                          </td>
                          <td className="py-2.5 pr-3 text-right tabular-nums whitespace-nowrap">{l.billableQty !== null ? `${formatQty(l.billableQty)} ${l.unit}` : "—"}</td>
                          <td className={`py-2.5 pr-3 text-right tabular-nums whitespace-nowrap ${priceGap ? "font-semibold text-amber-800" : ""}`} data-testid="inv-line-price">
                            <MoneyCell value={l.unitPrice} currency={inv.currencyCode} decimals={dec} />
                            {priceGap && l.priceDeltaPct ? <span className="block text-xs">{signed(l.priceDeltaPct, " %")}</span> : null}
                          </td>
                          <td className="py-2.5 pr-3 text-right tabular-nums whitespace-nowrap">
                            <MoneyCell value={l.poPrice} currency={inv.currencyCode} decimals={dec} />
                          </td>
                          <td className="py-2.5 pr-3 text-right tabular-nums whitespace-nowrap">
                            <MoneyCell value={l.netAmount} currency={inv.currencyCode} decimals={dec} />
                          </td>
                          <td className="py-2.5">
                            {l.match === null ? (
                              <span className="text-muted-foreground">Pas encore rapprochée</span>
                            ) : l.match === "CONFORME" ? (
                              <StatusBadge status="CONFORME" />
                            ) : (
                              <StatusBadge status="ECART" label={INVOICE_MATCH_LABELS[l.match]} />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <dl className="mt-4 ml-auto w-full max-w-xs space-y-1 text-sm" data-testid="inv-totals">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Total HT</dt>
                  <dd className="tabular-nums"><MoneyCell value={inv.totalHt} currency={inv.currencyCode} decimals={dec} /></dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">TVA</dt>
                  <dd className="tabular-nums"><MoneyCell value={inv.totalVat} currency={inv.currencyCode} decimals={dec} /></dd>
                </div>
                <div className="flex justify-between border-t pt-1 text-base font-semibold">
                  <dt>Total TTC</dt>
                  <dd className="tabular-nums" data-testid="inv-total-ttc"><MoneyCell value={inv.totalTtc} currency={inv.currencyCode} decimals={dec} /></dd>
                </div>
                {!isXof && inv.totalTtcXof !== null ? (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <dt>Équivalent FCFA</dt>
                    <dd className="tabular-nums"><MoneyCell value={inv.totalTtcXof} currency="XOF" /></dd>
                  </div>
                ) : null}
              </dl>
            </section>

            {inv.notes ? (
              <section className="rounded-xl border bg-card p-4">
                <h2 className="mb-2 text-[15px] font-semibold">Remarques</h2>
                <p className="whitespace-pre-line text-sm" data-testid="inv-notes">{inv.notes}</p>
              </section>
            ) : null}
          </div>

          <aside className="space-y-5">
            <section className="rounded-xl border bg-card p-4" data-testid="inv-info">
              <h2 className="mb-3 text-[15px] font-semibold">Informations</h2>
              <dl className="grid grid-cols-2 gap-3">
                <Info label="Date de la facture"><DateCell value={inv.invoiceDate} /></Info>
                <Info label="Échéance" testId="inv-due-date"><DateCell value={inv.dueDate} /></Info>
                <Info label="Saisie par">{inv.createdBy.name}</Info>
                <Info label="Saisie le"><DateCell value={inv.createdAt} withTime /></Info>
                <Info label="Rapprochée le"><DateCell value={inv.matchedAt} withTime /></Info>
                <Info label="Bon à payer le"><DateCell value={inv.payApprovedAt} withTime /></Info>
                <Info label="Transmise le"><DateCell value={inv.transmittedAt} withTime /></Info>
              </dl>
            </section>

            <section className="rounded-xl border bg-card p-4" data-testid="inv-links">
              <h2 className="mb-3 text-[15px] font-semibold">Bons de commande et réceptions</h2>
              <dl className="space-y-3">
                <Info label="Bons de commande">
                  <span className="flex flex-wrap gap-x-3 gap-y-1">{inv.orders.map((o) => <span key={o.id}>{orderLink(o.id, o.number)}</span>)}</span>
                </Info>
                <Info label="Réceptions concernées">
                  {inv.receipts.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <ul className="space-y-0.5">
                      {inv.receipts.map((r) => (
                        <li key={r.id} className="text-sm">
                          <span className="doc-number">{r.number}</span> · <DateCell value={r.receivedAt} />
                          {r.deliveryNoteRef ? <span className="text-muted-foreground"> · BL {r.deliveryNoteRef}</span> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </Info>
              </dl>
            </section>

            <InvoiceAttachments invoiceId={inv.id} attachments={inv.attachments} canEdit={canManage && inv.status !== "ANNULEE"} />
          </aside>
        </div>
      </div>
    </>
  );
}

export default function InvoicePage({ params }: PageProps<"/achats/factures/[id]">) {
  return (
    <>
      <Link href="/achats/factures" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Retour aux factures
      </Link>
      <Suspense fallback={<PageSkeleton />}>
        <InvoiceContent params={params} />
      </Suspense>
    </>
  );
}
