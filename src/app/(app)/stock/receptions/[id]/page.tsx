import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { DateCell } from "@/components/date-cell";
import { DocNumber } from "@/components/doc-number";
import { MoneyCell } from "@/components/money-cell";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { ReceiptActions } from "@/components/receiving/receipt-actions";
import { REFUSAL_REASON_LABELS } from "@/components/receiving/labels";
import { StatusBadge } from "@/components/status-badge";
import { StatusStepper, type StepDef } from "@/components/status-stepper";
import { TimelineItem } from "@/components/timeline-item";
import { unitShort } from "@/components/unit-select";
import { isBusinessError } from "@/lib/errors";
import { formatNumber, formatQty } from "@/lib/money";
import { requirePageAction } from "@/modules/auth/session";
import { NC_DECISION_LABELS, RECEIPT_STATUS_LABELS, getReceipt } from "@/modules/receiving";

export const metadata: Metadata = { title: "Réception – RICHBOND" };

const STEPS: StepDef[] = [
  { key: "ORDER", label: "Commandé" },
  { key: "RECEIVED", label: "Livraison reçue" },
  { key: "STOCK", label: "Entré en stock" },
];

function Info({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div data-testid={testId}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{children}</dd>
    </div>
  );
}

async function ReceiptContent({ params }: { params: PageProps<"/stock/receptions/[id]">["params"] }) {
  const { id } = await params;
  const user = await requirePageAction("receipt.view");
  let r;
  try {
    r = await getReceipt(user, { id });
  } catch (e) {
    if (isBusinessError(e) && e.code === "NOT_FOUND") notFound();
    if (isBusinessError(e) && e.code === "FORBIDDEN") redirect("/acces-refuse");
    throw e;
  }
  const cancelled = r.status === "ANNULEE";
  const refused = r.lines.filter((l) => Number(l.refusedQty) > 0);
  const showPrices = r.pricesVisible;

  type Ev = { key: string; name: string; at: Date; node: ReactNode };
  const events: Ev[] = [
    {
      key: "created",
      name: r.createdByName,
      at: r.createdAt,
      node: (
        <p className="text-sm">
          Réception enregistrée, bon de livraison <span className="font-medium">{r.deliveryNoteRef}</span>.
        </p>
      ),
    },
  ];
  if (r.overDeliveryApproved) {
    events.push({
      key: "over",
      name: r.createdByName,
      at: r.createdAt,
      node: <p className="text-sm">Sur-livraison acceptée par le Responsable{r.overDeliveryReason ? ` : ${r.overDeliveryReason}` : ""}.</p>,
    });
  }
  for (const nc of r.nonConformities) {
    events.push({
      key: nc.id,
      name: r.createdByName,
      at: r.createdAt,
      node: (
        <p className="text-sm">
          Non-conformité <span className="doc-number">{nc.number}</span> ouverte ({formatQty(nc.qty)} refusé, {REFUSAL_REASON_LABELS[nc.reason]})
          {nc.decision ? `, décision : ${NC_DECISION_LABELS[nc.decision]}` : ""}.
        </p>
      ),
    });
  }
  if (cancelled && r.cancelledAt) {
    events.push({
      key: "cancelled",
      name: r.cancelledByName ?? "Responsable Achats",
      at: r.cancelledAt,
      node: <p className="text-sm font-medium text-red-700 dark:text-red-400">Contre-passée : {r.cancelledReason}</p>,
    });
  }

  return (
    <>
      <PageHeader
        title={r.number}
        titleClassName="page-title font-mono tracking-tight"
        description={`${r.supplierName} · bon de commande ${r.orderNumber} · dépôt ${r.warehouseName}`}
        meta={
          <div className="flex flex-wrap items-center gap-2" data-testid="rec-badges">
            <StatusBadge status={r.status} label={RECEIPT_STATUS_LABELS[r.status]} />
            {r.daysLate > 0 ? <StatusBadge tone="danger" label={`Livré avec ${r.daysLate} j de retard`} /> : <StatusBadge tone="neutral" label="Livré à l'heure" />}
            {r.inFull ? <StatusBadge tone="success" label="Bon soldé" /> : null}
          </div>
        }
        actions={<ReceiptActions id={r.id} number={r.number} canCancel={r.canCancel} />}
      />

      <div className="mb-5">
        <StatusStepper
          steps={STEPS}
          current="STOCK"
          stopped={cancelled ? { label: "Contre-passée" } : null}
          testId="rec-stepper"
          label="Avancement de la réception"
        />
      </div>

      {cancelled ? (
        <p className="mb-4 rounded-lg border bg-muted p-3 text-sm" data-testid="rec-cancel-banner">
          <span className="font-medium">Réception contre-passée le <DateCell value={r.cancelledAt} /> :</span> {r.cancelledReason}. Le stock et le restant dû du bon ont été corrigés.
        </p>
      ) : null}
      {refused.length > 0 ? (
        <p role="note" className="mb-4 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100" data-testid="rec-refusal-banner">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          Marchandise refusée sur {refused.length} ligne{refused.length > 1 ? "s" : ""} : {r.nonConformities.length} non-conformité{r.nonConformities.length > 1 ? "s" : ""} ouverte
          {r.nonConformities.length > 1 ? "s" : ""}.{" "}
          <Link href="/stock/receptions/non-conformites" className="font-medium underline underline-offset-4">
            Voir les non-conformités
          </Link>
        </p>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0" aria-labelledby="rec-lines-title">
          <h2 id="rec-lines-title" className="mb-2 text-[15px] font-semibold">
            Lignes reçues
          </h2>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[40rem] text-sm" data-testid="rec-lines">
              <thead className="text-left text-xs font-medium text-muted-foreground">
                <tr className="border-b">
                  <th className="h-10 px-3">N°</th>
                  <th className="px-3">Article</th>
                  <th className="px-3 text-right">Livré</th>
                  <th className="px-3 text-right">Accepté</th>
                  <th className="px-3 text-right">Refusé</th>
                  {showPrices ? <th className="px-3 text-right">Coût unitaire</th> : null}
                  {showPrices ? <th className="px-3 text-right">Valeur</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y">
                {r.lines.map((l) => (
                  <tr key={l.id} className="align-top" data-testid={`rec-line-${l.lineNo}`}>
                    <td className="px-3 py-2.5 tabular-nums">{l.lineNo}</td>
                    <td className="px-3 py-2.5">
                      {l.itemCode ? <span className="doc-number block text-muted-foreground">{l.itemCode}</span> : null}
                      <span className="font-medium">{l.designation}</span>
                      {l.lotNumber ? <span className="block text-xs text-muted-foreground">Lot {l.lotNumber}</span> : null}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                      {formatQty(l.deliveredQty)} {unitShort(l.unit)}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums" data-testid={`rec-line-${l.lineNo}-accepted`}>
                      {formatQty(l.acceptedQty)} {unitShort(l.unit)}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums" data-testid={`rec-line-${l.lineNo}-refused`}>
                      {Number(l.refusedQty) > 0 ? (
                        <span className="text-red-700 dark:text-red-400">
                          {formatQty(l.refusedQty)} {unitShort(l.unit)}
                          {l.refusalReason ? <span className="block text-xs">{REFUSAL_REASON_LABELS[l.refusalReason]}</span> : null}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/70">—</span>
                      )}
                    </td>
                    {showPrices ? (
                      <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">{l.unitCostXof ? `${formatNumber(l.unitCostXof, 2)} FCFA` : "—"}</td>
                    ) : null}
                    {showPrices ? (
                      <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                        <MoneyCell value={l.valueXof} decimals={0} />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
              {showPrices && r.totalValueXof !== undefined ? (
                <tfoot>
                  <tr className="border-t">
                    <td colSpan={6} className="px-3 py-2.5 text-right text-sm text-muted-foreground">
                      Valeur d&apos;entrée en stock
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap tabular-nums" data-testid="rec-total">
                      <MoneyCell value={r.totalValueXof} decimals={0} />
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </section>

        <aside className="space-y-4" aria-label="Informations et chronologie">
          <section className="rounded-xl border bg-card p-4" aria-label="Informations clés">
            <dl className="grid gap-3.5" data-testid="rec-info">
              <Info label="Fournisseur">
                <Link href={`/fournisseurs/${r.supplierId}`} className="text-primary underline-offset-4 hover:underline">
                  {r.supplierName}
                </Link>
              </Info>
              <Info label="Bon de commande">
                <Link href={`/achats/commandes/${r.orderId}`} className="text-primary underline-offset-4 hover:underline">
                  <DocNumber value={r.orderNumber} />
                </Link>
              </Info>
              <Info label="Date de réception">
                <DateCell value={r.receivedAt} />
              </Info>
              <Info label="Date prévue au bon">
                <DateCell value={r.referenceDate} />
              </Info>
              <Info label="N° du bon de livraison">{r.deliveryNoteRef}</Info>
              <Info label="Dépôt">{r.warehouseName}</Info>
              <Info label="Transporteur">{r.carrier ?? "—"}</Info>
              <Info label="Reçu par">{r.createdByName}</Info>
              {r.comment ? <Info label="Commentaire">{r.comment}</Info> : null}
            </dl>
          </section>
          <section className="rounded-xl border bg-card p-4" aria-labelledby="rec-timeline-title">
            <h2 id="rec-timeline-title" className="mb-3 text-[15px] font-semibold">
              Chronologie
            </h2>
            <ol data-testid="rec-timeline">
              {events.map((e, i) => (
                <TimelineItem key={e.key} name={e.name} at={e.at} last={i === events.length - 1} testId={`rec-event-${e.key}`}>
                  {e.node}
                </TimelineItem>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}

export default function ReceiptPage({ params }: PageProps<"/stock/receptions/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <ReceiptContent params={params} />
    </Suspense>
  );
}
