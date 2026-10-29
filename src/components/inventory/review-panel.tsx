"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Repeat } from "lucide-react";
import { requestInventoryRecountAction, validateInventoryCountAction } from "@/app/(app)/stock/inventaires/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormError } from "@/components/form-field";
import { KpiCard } from "@/components/kpi-card";
import { WriteButton } from "@/components/license/write-button";
import { Input } from "@/components/ui/input";
import { unitShort } from "@/components/unit-select";
import { useActionRunner } from "@/components/use-action-runner";
import { errorMessage } from "@/lib/action-feedback";
import { formatFcfa, formatQty } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { InventoryReview } from "@/modules/inventory/types";
import { CancelInventoryButton } from "./inventory-actions";
import { SELECTION_REASON_LABELS } from "./labels";

/** Même règle que `linesMissingReason` (modules/inventory/rules) : ce module tire Prisma, donc il n'est pas importable côté navigateur. */
const MIN_REASON_LENGTH = 3;

const signed = (n: number) => (n > 0 ? `+${formatFcfa(n)}` : formatFcfa(n));
const signedQty = (v: string) => (Number(v) > 0 ? `+${formatQty(v)}` : formatQty(v));
const tone = (n: number) => (n < 0 ? "text-red-700" : n > 0 ? "text-emerald-700" : "text-muted-foreground");

/**
 * Revue des écarts par le Responsable : quantité et valeur (au PMP figé), motif obligatoire pour chaque écart important,
 * demande de recomptage, validation (crée les ajustements de stock) et annulation.
 */
export function InventoryReviewPanel({ review, canValidate, canCancel }: { review: InventoryReview; canValidate: boolean; canCancel: boolean }) {
  const { run, pending } = useActionRunner();
  const editable = review.status === "A_VALIDER" && canValidate;
  const [reasons, setReasons] = useState<Record<string, string>>(() => Object.fromEntries(review.lines.map((l) => [l.id, l.varianceReason ?? ""])));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showErrors, setShowErrors] = useState(false);
  const [validateOpen, setValidateOpen] = useState(false);
  const [recountOpen, setRecountOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const missing = new Set(review.lines.filter((l) => l.exceedsThreshold && (reasons[l.id] ?? "").trim().length < MIN_REASON_LENGTH).map((l) => l.id));
  const t = review.totals;

  function askValidate() {
    setShowErrors(true);
    setServerError(null);
    if (missing.size > 0) return;
    setValidateOpen(true);
  }

  async function validate() {
    await run(
      () =>
        validateInventoryCountAction({
          countId: review.id,
          reasons: review.lines.filter((l) => (reasons[l.id] ?? "").trim().length > 0).map((l) => ({ lineId: l.id, reason: reasons[l.id].trim() })),
        }),
      {
        success: (d) => `Inventaire ${review.number} validé : ${(d as { adjustments: number }).adjustments} ajustement(s) de stock.`,
        onError: (f) => setServerError(errorMessage(f)),
      },
    );
    setValidateOpen(false);
  }

  async function requestRecount() {
    await run(() => requestInventoryRecountAction({ countId: review.id, lineIds: [...selected] }), {
      success: "Recomptage demandé au magasin.",
      onError: (f) => setServerError(errorMessage(f)),
    });
    setRecountOpen(false);
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-5" data-testid="inv-review">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          testId="inv-kpi-reliability"
          label="Fiabilité du stock"
          value={`${formatQty(review.reliabilityPct)} %`}
          help="Part des articles comptés dont la quantité réelle correspond exactement à la quantité de l'application. 100 % = aucun écart."
        />
        <KpiCard
          testId="inv-kpi-variance-count"
          label="Articles avec écart"
          value={`${t.withVariance} / ${t.counted}`}
          help="Nombre d'articles dont la quantité comptée est différente de la quantité théorique, sur le total des articles comptés."
        />
        <KpiCard
          testId="inv-kpi-exceeding"
          label="Écarts importants"
          value={String(t.exceeding)}
          hint={`Seuil : ${formatQty(review.thresholdPct)} % ou ${formatFcfa(review.thresholdValue)}`}
          help="Écarts au-dessus du seuil (en % de la quantité théorique ou en valeur). Chacun doit être justifié par un motif avant la validation."
        />
        <KpiCard
          testId="inv-kpi-net"
          label="Écart net"
          value={signed(t.varianceValue)}
          help="Somme des écarts valorisés au prix moyen pondéré (PMP) figé à l'ouverture. Négatif = stock manquant, positif = stock en trop."
        />
        <KpiCard
          testId="inv-kpi-abs"
          label="Écart absolu"
          value={formatFcfa(t.absVarianceValue)}
          help="Somme des écarts sans tenir compte du signe : mesure l'ampleur totale des erreurs de stock, même quand elles se compensent."
        />
      </div>

      {t.movedDuringCount > 0 ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
          data-testid="inv-moved-warning"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Du stock a bougé pendant le comptage pour {t.movedDuringCount} article{t.movedDuringCount > 1 ? "s" : ""} (réception, sortie, transfert…). Ils sont signalés
            par une icône dans le tableau. Si la quantité comptée date d&apos;avant le mouvement, demandez un recomptage.
          </span>
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[56rem] text-sm" data-testid="inv-review-table">
          <thead className="text-left text-xs font-medium text-muted-foreground">
            <tr className="border-b">
              {editable ? (
                <th className="w-12 px-3">
                  <span className="sr-only">Demander un recomptage</span>
                </th>
              ) : null}
              <th className="h-10 px-3">Article</th>
              <th className="px-3 text-right">Théorique</th>
              <th className="px-3 text-right">Compté</th>
              <th className="px-3 text-right">Écart</th>
              <th className="px-3 text-right">Écart %</th>
              <th className="px-3 text-right">Valeur de l&apos;écart</th>
              <th className="min-w-56 px-3">Motif</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {review.lines.map((l) => {
              const varQty = l.varianceQty ?? "0";
              return (
                <tr key={l.id} className={cn("min-h-12", l.exceedsThreshold && "bg-red-50/60 dark:bg-red-950/20")} data-testid={`inv-rv-row-${l.code}`}>
                  {editable ? (
                    <td className="px-3">
                      <input
                        type="checkbox"
                        className="size-5"
                        aria-label={`Demander le recomptage de ${l.name}`}
                        checked={selected.has(l.id)}
                        onChange={() => toggle(l.id)}
                        data-testid={`inv-rv-select-${l.code}`}
                      />
                    </td>
                  ) : null}
                  <td className="py-2 px-3">
                    <span className="doc-number text-muted-foreground">{l.code}</span> {l.name}
                    <span className="block text-xs text-muted-foreground">{SELECTION_REASON_LABELS[l.selectionReason]}</span>
                    {l.movedDuringCount ? (
                      <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-amber-800" data-testid={`inv-rv-moved-${l.code}`}>
                        <AlertTriangle className="size-3.5" aria-hidden /> Mouvement pendant le comptage
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 text-right tabular-nums" data-testid={`inv-rv-theo-${l.code}`}>
                    {l.theoreticalQty === null ? "—" : `${formatQty(l.theoreticalQty)} ${unitShort(l.unit)}`}
                  </td>
                  <td className="px-3 text-right tabular-nums" data-testid={`inv-rv-final-${l.code}`}>
                    {l.finalQty === null ? "—" : `${formatQty(l.finalQty)} ${unitShort(l.unit)}`}
                    {l.recountQty !== null && l.countedQty !== null ? (
                      <span className="block text-xs text-muted-foreground" data-testid={`inv-rv-first-${l.code}`}>
                        1<sup>er</sup> comptage : {formatQty(l.countedQty)}
                      </span>
                    ) : null}
                  </td>
                  <td className={cn("px-3 text-right font-medium tabular-nums", tone(Number(varQty)))} data-testid={`inv-rv-var-${l.code}`}>
                    {l.varianceQty === null ? "—" : Number(varQty) === 0 ? "0" : signedQty(varQty)}
                  </td>
                  <td className="px-3 text-right tabular-nums text-muted-foreground">
                    {l.varianceQty === null || Number(varQty) === 0 ? "—" : l.variancePct === null ? "∞" : `${formatQty(l.variancePct)} %`}
                  </td>
                  <td className={cn("px-3 text-right font-medium tabular-nums", tone(l.varianceValue ?? 0))} data-testid={`inv-rv-value-${l.code}`}>
                    {l.varianceValue === null ? "—" : signed(l.varianceValue)}
                  </td>
                  <td className="px-3 py-1.5">
                    {l.exceedsThreshold ? (
                      editable ? (
                        <>
                          <Input
                            className="h-11 text-base"
                            placeholder="Motif de l'écart (obligatoire)"
                            aria-label={`Motif de l'écart pour ${l.name}`}
                            aria-invalid={showErrors && missing.has(l.id) ? true : undefined}
                            maxLength={300}
                            autoComplete="off"
                            value={reasons[l.id] ?? ""}
                            onChange={(e) => setReasons((p) => ({ ...p, [l.id]: e.target.value }))}
                            data-testid={`inv-rv-reason-${l.code}`}
                          />
                          {showErrors && missing.has(l.id) ? (
                            <span role="alert" className="mt-1 block text-xs text-red-700" data-testid={`inv-rv-reason-error-${l.code}`}>
                              Motif obligatoire (3 caractères minimum).
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span data-testid={`inv-rv-reason-${l.code}`}>{l.varianceReason ?? "—"}</span>
                      )
                    ) : (
                      <span className="text-muted-foreground/70">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <FormError message={serverError} testId="inv-review-error" />

      {review.status === "VALIDE" ? (
        <p className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200" data-testid="inv-validated-note">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          Inventaire validé : les écarts ont été passés en stock par des mouvements « Ajustement d&apos;inventaire ».
          <Link href={`/stock/mouvements?q=${encodeURIComponent(review.number)}`} className="min-h-11 content-center font-medium text-primary hover:underline" data-testid="inv-see-movements">
            Voir les mouvements
          </Link>
        </p>
      ) : null}

      {editable || (canCancel && review.status === "A_VALIDER") ? (
        <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-between gap-3 border-t bg-background/95 px-1 py-3 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            {canCancel ? <CancelInventoryButton countId={review.id} number={review.number} /> : null}
            {editable ? (
              <WriteButton
                variant="outline"
                className="h-11 px-4"
                disabled={selected.size === 0 || pending}
                onClick={() => setRecountOpen(true)}
                data-testid="inv-request-recount"
              >
                <Repeat /> Demander un recomptage{selected.size > 0 ? ` (${selected.size})` : ""}
              </WriteButton>
            ) : null}
          </div>
          {editable ? (
            <WriteButton className="h-14 px-8 text-base" disabled={pending} onClick={askValidate} data-testid="inv-validate">
              <CheckCircle2 /> Valider l&apos;inventaire
            </WriteButton>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={validateOpen}
        onOpenChange={setValidateOpen}
        title={`Valider l'inventaire ${review.number} ?`}
        description={`Le stock sera corrigé pour ${t.withVariance} article${t.withVariance > 1 ? "s" : ""} (écart net ${signed(t.varianceValue)}). Cette action est définitive : une erreur se corrige ensuite par un ajustement tracé.`}
        confirmLabel="Valider l'inventaire"
        pending={pending}
        onConfirm={validate}
        testId="inv-validate-confirm"
      />
      <ConfirmDialog
        open={recountOpen}
        onOpenChange={setRecountOpen}
        title="Demander un recomptage ?"
        description={`${selected.size} article${selected.size > 1 ? "s seront renvoyés" : " sera renvoyé"} au magasin, sans que la quantité attendue soit révélée. L'inventaire repasse « En comptage ».`}
        confirmLabel="Demander le recomptage"
        pending={pending}
        onConfirm={requestRecount}
        testId="inv-recount-confirm"
      />
    </div>
  );
}
