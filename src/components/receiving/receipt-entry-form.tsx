"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCheck, PackageCheck } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DocNumber } from "@/components/doc-number";
import { FormError, FormField, TextArea } from "@/components/form-field";
import { WriteButton } from "@/components/license/write-button";
import { NativeSelect } from "@/components/native-select";
import { Input } from "@/components/ui/input";
import { unitShort } from "@/components/unit-select";
import { useActionRunner } from "@/components/use-action-runner";
import { formatQty } from "@/lib/money";
import { createReceiptAction } from "@/app/(app)/stock/receptions/actions";
import type { RefusalReasonCode } from "@/modules/receiving/labels";
import type { ReceiptOrderView } from "@/modules/receiving/types";
import { REFUSAL_OPTIONS } from "./labels";

interface LineState {
  delivered: string;
  refused: string;
  reason: string;
  lot: string;
}

const EPS = 0.0005;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** « 12,5 » ou « 12.5 » -> 12.5 ; vide -> 0 ; invalide -> NaN. */
function parseQty(s: string): number {
  const t = s.trim().replace(/\s/g, "").replace(",", ".");
  if (t === "") return 0;
  if (!/^\d+(\.\d{1,3})?$/.test(t)) return NaN;
  return Number(t);
}

const NUM_INPUT = "h-12 text-right text-lg font-medium tabular-nums";

/**
 * Saisie d'une réception sur tablette : tout est pré-rempli avec le restant dû, « Tout accepter » remet
 * toutes les lignes à la quantité attendue. Aucun prix n'est affiché ni demandé.
 */
export function ReceiptEntryForm({ order, warehouses, today }: { order: ReceiptOrderView; warehouses: { id: string; label: string }[]; today: string }) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const [lines, setLines] = useState<Record<string, LineState>>(() =>
    Object.fromEntries(order.lines.map((l) => [l.id, { delivered: formatQty(l.remainingQty).replace(/\s/g, ""), refused: "", reason: "", lot: "" }])),
  );
  const [deliveryNoteRef, setDeliveryNoteRef] = useState("");
  const [receivedAt, setReceivedAt] = useState(today);
  const [warehouseId, setWarehouseId] = useState(order.warehouseId);
  const [carrier, setCarrier] = useState("");
  const [comment, setComment] = useState("");
  const [approved, setApproved] = useState(false);
  const [overReason, setOverReason] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const set = (id: string, patch: Partial<LineState>) => setLines((p) => ({ ...p, [id]: { ...p[id], ...patch } }));

  const computed = useMemo(
    () =>
      order.lines.map((l) => {
        const s = lines[l.id];
        const delivered = parseQty(s.delivered);
        const refused = parseQty(s.refused);
        const accepted = round3(delivered - refused);
        const limit = Number(l.maxAcceptableQty);
        const errors: string[] = [];
        if (Number.isNaN(delivered)) errors.push("Quantité livrée invalide.");
        else if (Number.isNaN(refused)) errors.push("Quantité refusée invalide.");
        else if (refused > delivered + EPS) errors.push("Le refus dépasse la quantité livrée.");
        else if (refused > EPS && !s.reason) errors.push("Choisissez le motif du refus.");
        const over = !Number.isNaN(accepted) && accepted > limit + EPS;
        return { line: l, state: s, delivered, refused, accepted, over, errors };
      }),
    [order, lines],
  );

  const active = computed.filter((c) => c.delivered > EPS);
  const anyOver = active.some((c) => c.over);
  const anyRefused = active.some((c) => c.refused > EPS);
  const header: Record<string, string> = {};
  if (!deliveryNoteRef.trim()) header.bl = "Le numéro du bon de livraison est obligatoire.";
  if (!receivedAt) header.date = "La date est obligatoire.";
  else if (receivedAt > today) header.date = "La date ne peut pas être dans le futur.";
  if (!warehouseId) header.warehouse = "Choisissez le dépôt.";
  const lineErrors = active.flatMap((c) => c.errors);
  const overBlocked = anyOver && (!order.canApproveOverDelivery || !approved || overReason.trim().length < 5);
  const nothing = active.length === 0;

  function toAllAccepted() {
    setLines(Object.fromEntries(order.lines.map((l) => [l.id, { delivered: formatQty(l.remainingQty).replace(/\s/g, ""), refused: "", reason: "", lot: lines[l.id]?.lot ?? "" }])));
    setApproved(false);
  }

  function validate() {
    setShowErrors(true);
    setServerError(null);
    if (Object.keys(header).length > 0 || lineErrors.length > 0 || nothing || overBlocked) return;
    setConfirmOpen(true);
  }

  async function submit() {
    const res = await run(
      () =>
        createReceiptAction({
          orderId: order.orderId,
          deliveryNoteRef: deliveryNoteRef.trim(),
          receivedAt,
          warehouseId,
          carrier: carrier.trim() || null,
          comment: comment.trim() || null,
          overDeliveryApproved: anyOver && approved,
          overDeliveryReason: anyOver && approved ? overReason.trim() : null,
          lines: active.map((c) => ({
            orderLineId: c.line.id,
            deliveredQty: c.delivered,
            acceptedQty: c.accepted,
            refusedQty: c.refused,
            refusalReason: c.refused > EPS ? (c.state.reason as RefusalReasonCode) : null,
            lotNumber: c.state.lot.trim() || null,
          })),
        }),
      {
        success: "Réception enregistrée. Le stock est à jour.",
        refresh: false,
        onSuccess: (data) => {
          router.push(`/stock/receptions/${data.id}`);
        },
        onError: (f) => setServerError(f.message),
        silentCodes: ["OVER_DELIVERY"],
      },
    );
    if (res && !res.ok) setConfirmOpen(false);
  }

  return (
    <div className="space-y-6" data-testid="rec-form">
      <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="rec-form-info">
        <h2 id="rec-form-info" className="mb-4 text-[15px] font-semibold">
          Bon de livraison
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="rec-bl" label="N° du bon de livraison fournisseur" required error={showErrors ? header.bl : undefined}>
            <Input id="rec-bl" className="h-12 text-base" value={deliveryNoteRef} maxLength={60} onChange={(e) => setDeliveryNoteRef(e.target.value)} autoComplete="off" data-testid="rec-bl" />
          </FormField>
          <FormField id="rec-date" label="Date de réception" required error={showErrors ? header.date : undefined}>
            <Input id="rec-date" type="date" className="h-12 text-base" value={receivedAt} max={today} onChange={(e) => setReceivedAt(e.target.value)} data-testid="rec-date" />
          </FormField>
          <FormField id="rec-warehouse" label="Dépôt" required error={showErrors ? header.warehouse : undefined}>
            <NativeSelect id="rec-warehouse" className="h-12" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} data-testid="rec-warehouse">
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="rec-carrier" label="Transporteur (facultatif)">
            <Input id="rec-carrier" className="h-12 text-base" value={carrier} maxLength={80} onChange={(e) => setCarrier(e.target.value)} data-testid="rec-carrier" />
          </FormField>
        </div>
      </section>

      <section aria-labelledby="rec-form-lines">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="rec-form-lines" className="text-[15px] font-semibold">
              Quantités reçues
            </h2>
            <p className="text-xs text-muted-foreground">Les quantités sont pré-remplies avec le restant dû. Corrigez seulement ce qui diffère.</p>
          </div>
          <button
            type="button"
            onClick={toAllAccepted}
            className="inline-flex h-12 items-center gap-2 rounded-lg border bg-card px-5 text-base font-medium transition-colors hover:bg-muted"
            data-testid="rec-accept-all"
          >
            <CheckCheck className="size-5" aria-hidden /> Tout accepter
          </button>
        </div>
        <ul className="space-y-3">
          {computed.map((c) => {
            const l = c.line;
            const blocked = Number(l.remainingQty) <= EPS;
            return (
              <li key={l.id} className="rounded-xl border bg-card p-4" data-testid={`rec-line-${l.lineNo}`}>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    {l.itemCode ? <span className="doc-number text-muted-foreground">{l.itemCode}</span> : null}
                    <p className="font-medium">{l.designation}</p>
                  </div>
                  <p className="text-right text-sm text-muted-foreground tabular-nums" data-testid={`rec-line-${l.lineNo}-due`}>
                    Commandé {formatQty(l.quantity)} · déjà reçu {formatQty(l.receivedQty)}
                    {Number(l.closedQty) > 0 ? ` · soldé ${formatQty(l.closedQty)}` : ""}
                    <span className="block text-sm font-semibold text-foreground">
                      Restant dû : {formatQty(l.remainingQty)} {unitShort(l.unit)}
                    </span>
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))]">
                  <FormField id={`rec-delivered-${l.lineNo}`} label={`Livré (${unitShort(l.unit)})`}>
                    <Input
                      id={`rec-delivered-${l.lineNo}`}
                      inputMode="decimal"
                      autoComplete="off"
                      className={NUM_INPUT}
                      value={c.state.delivered}
                      disabled={blocked}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => set(l.id, { delivered: e.target.value })}
                      data-testid={`rec-delivered-${l.lineNo}`}
                    />
                  </FormField>
                  <FormField id={`rec-refused-${l.lineNo}`} label={`Refusé (${unitShort(l.unit)})`}>
                    <Input
                      id={`rec-refused-${l.lineNo}`}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0"
                      className={NUM_INPUT}
                      value={c.state.refused}
                      disabled={blocked}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => set(l.id, { refused: e.target.value })}
                      data-testid={`rec-refused-${l.lineNo}`}
                    />
                  </FormField>
                  <div className="space-y-1.5">
                    <p className="text-sm leading-none font-medium">Accepté (entre en stock)</p>
                    <p
                      className="flex h-12 items-center justify-end rounded-lg bg-muted px-3 text-lg font-semibold tabular-nums"
                      aria-live="polite"
                      data-testid={`rec-accepted-${l.lineNo}`}
                    >
                      {Number.isNaN(c.accepted) || c.accepted < 0 ? "—" : formatQty(c.accepted)} {unitShort(l.unit)}
                    </p>
                  </div>
                </div>
                {c.refused > EPS ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <FormField id={`rec-reason-${l.lineNo}`} label="Motif du refus" required error={showErrors && !c.state.reason ? "Choisissez le motif du refus." : undefined}>
                      <NativeSelect
                        id={`rec-reason-${l.lineNo}`}
                        className="h-12"
                        value={c.state.reason}
                        onChange={(e) => set(l.id, { reason: e.target.value })}
                        data-testid={`rec-reason-${l.lineNo}`}
                      >
                        <option value="">Choisir…</option>
                        {REFUSAL_OPTIONS.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </NativeSelect>
                    </FormField>
                  </div>
                ) : null}
                <div className="mt-3 max-w-xs">
                  <FormField id={`rec-lot-${l.lineNo}`} label="N° de lot (facultatif)">
                    <Input id={`rec-lot-${l.lineNo}`} className="h-12 text-base" value={c.state.lot} maxLength={60} autoComplete="off" onChange={(e) => set(l.id, { lot: e.target.value })} data-testid={`rec-lot-${l.lineNo}`} />
                  </FormField>
                </div>
                {showErrors && c.delivered > EPS && c.errors.some((m) => !m.startsWith("Choisissez")) ? (
                  <p role="alert" className="mt-2 text-sm text-red-700" data-testid={`rec-line-${l.lineNo}-error`}>
                    {c.errors.filter((m) => !m.startsWith("Choisissez")).join(" ")}
                  </p>
                ) : null}
                {c.over ? (
                  <p className="mt-2 flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300" data-testid={`rec-line-${l.lineNo}-over`}>
                    <AlertTriangle className="size-4 shrink-0" aria-hidden /> Plus que le restant dû ({formatQty(l.remainingQty)} {unitShort(l.unit)}).
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {anyOver ? (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100" data-testid="rec-over">
          <h2 className="mb-1 flex items-center gap-2 text-[15px] font-semibold">
            <AlertTriangle className="size-4" aria-hidden /> Sur-livraison
          </h2>
          {order.canApproveOverDelivery ? (
            <div className="space-y-3">
              <p className="text-sm">La quantité acceptée dépasse ce qui a été commandé (tolérance : {order.overDeliveryPct} %). Vous pouvez donner votre accord.</p>
              <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
                <input type="checkbox" className="size-5" checked={approved} onChange={(e) => setApproved(e.target.checked)} data-testid="rec-over-approve" />
                Accord du Responsable pour recevoir plus que la commande
              </label>
              {approved ? (
                <FormField id="rec-over-reason" label="Motif de l'accord" required error={showErrors && overReason.trim().length < 5 ? "Motif obligatoire (5 caractères minimum)." : undefined}>
                  <TextArea id="rec-over-reason" value={overReason} maxLength={300} onChange={(e) => setOverReason(e.target.value)} data-testid="rec-over-reason" className="bg-card" />
                </FormField>
              ) : null}
            </div>
          ) : (
            <p className="text-sm" data-testid="rec-over-blocked">
              La quantité acceptée dépasse ce qui a été commandé. Réduisez la quantité acceptée (le surplus doit être refusé) ou demandez l&apos;accord du Responsable Achats.
            </p>
          )}
        </section>
      ) : null}

      <section className="rounded-xl border bg-card p-4 sm:p-5">
        <FormField id="rec-comment" label="Commentaire (facultatif)">
          <TextArea id="rec-comment" value={comment} maxLength={500} onChange={(e) => setComment(e.target.value)} data-testid="rec-comment" />
        </FormField>
      </section>

      <FormError message={serverError} testId="rec-error" />
      {showErrors && nothing ? (
        <p role="alert" className="text-sm text-red-700" data-testid="rec-empty-error">
          Aucune quantité saisie : indiquez au moins une quantité livrée.
        </p>
      ) : null}

      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-between gap-3 border-t bg-background/95 px-1 py-3 backdrop-blur">
        <p className="text-sm text-muted-foreground" data-testid="rec-summary">
          {active.length} ligne{active.length > 1 ? "s" : ""} reçue{active.length > 1 ? "s" : ""}
          {anyRefused ? " · avec refus (une non-conformité sera ouverte)" : ""}
        </p>
        <WriteButton className="h-14 px-8 text-base" disabled={pending} onClick={validate} data-testid="rec-submit">
          <PackageCheck /> Valider la réception
        </WriteButton>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Valider la réception ?"
        description={
          <>
            Le stock sera mis à jour immédiatement pour <DocNumber value={order.number} />
            {anyRefused ? " et une non-conformité sera ouverte pour la marchandise refusée" : ""}. Une réception validée ne se modifie plus : seul le Responsable Achats peut la contre-passer.
          </>
        }
        confirmLabel="Valider la réception"
        pending={pending}
        onConfirm={submit}
        testId="rec-confirm"
      />
    </div>
  );
}
