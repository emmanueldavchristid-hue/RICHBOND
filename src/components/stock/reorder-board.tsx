"use client";

import { useState } from "react";
import Link from "next/link";
import { FilePlus2, Sparkles } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { WriteButton } from "@/components/license/write-button";
import { QtyCell } from "@/components/qty-cell";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { unitShort } from "@/components/unit-select";
import { useActionRunner } from "@/components/use-action-runner";
import { CriticalityBadge } from "@/components/criticality-badge";
import { applySuggestedThresholdsAction, createReorderRequestsAction } from "@/app/(app)/stock/reappro/actions";
import { formatQty } from "@/lib/money";
import { PURCHASE_TYPE_LABELS } from "@/modules/stock/labels";
import { CoverageBadge } from "./coverage";
import { NUM_INPUT, parseQty } from "./qty";
import type { ReorderRowView } from "./types";


/**
 * Articles sous le point de commande. Les articles déjà couverts par une DA ouverte sont signalés et non cochés.
 * Le Magasinier ou l'Acheteur coche, ajuste la quantité (en unité d'achat) puis crée les DA (une par type local/import).
 */
export function ReorderBoard({ rows, canCreate, canApplyThresholds }: { rows: ReorderRowView[]; canCreate: boolean; canApplyThresholds: boolean }) {
  const { run, pending } = useActionRunner();
  const [checked, setChecked] = useState<Record<string, boolean>>(() => Object.fromEntries(rows.map((r) => [r.itemId, !r.existingRequest])));
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.itemId, formatQty(r.suggestedQty).replace(/\s/g, "")])));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [thresholdsOpen, setThresholdsOpen] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  if (rows.length === 0) {
    return <EmptyState title="Aucun article à réapprovisionner" description="Tous les articles sont au-dessus de leur point de commande, commandes en cours comprises." />;
  }

  const selected = rows.filter((r) => checked[r.itemId]);
  const invalid = selected.filter((r) => {
    const q = parseQty(qty[r.itemId] ?? "");
    return Number.isNaN(q) || q <= 0;
  });
  const allSelectable = rows.filter((r) => !r.existingRequest);
  const allChecked = allSelectable.length > 0 && allSelectable.every((r) => checked[r.itemId]);
  const missingSupplier = selected.filter((r) => r.purchaseType === "A_DEFINIR").length;

  function toggleAll(v: boolean) {
    setChecked(Object.fromEntries(rows.map((r) => [r.itemId, r.existingRequest ? (checked[r.itemId] ?? false) : v])));
  }

  function validate() {
    setShowErrors(true);
    if (selected.length === 0 || invalid.length > 0) return;
    setConfirmOpen(true);
  }

  async function create() {
    const res = await run(
      () => createReorderRequestsAction({ items: selected.map((r) => ({ itemId: r.itemId, quantity: parseQty(qty[r.itemId] ?? "") })) }),
      {
        success: (d) => {
          const n = (d as { requests?: unknown[] } | null)?.requests?.length;
          return n ? `${n} demande${n > 1 ? "s" : ""} d'achat créée${n > 1 ? "s" : ""} et soumise${n > 1 ? "s" : ""} à validation.` : "Demandes d'achat créées.";
        },
      },
    );
    if (res) setConfirmOpen(false);
  }

  async function applyThresholds() {
    const res = await run(() => applySuggestedThresholdsAction({ itemIds: rows.map((r) => r.itemId) }), {
      success: "Valeurs suggérées appliquées aux articles de la liste.",
    });
    if (res) setThresholdsOpen(false);
  }

  return (
    <div className="space-y-3" data-testid="reap-board">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" data-testid="reap-summary">
          {rows.length} article{rows.length > 1 ? "s" : ""} sous le point de commande · {selected.length} sélectionné{selected.length > 1 ? "s" : ""}
        </p>
        {canApplyThresholds ? (
          <WriteButton variant="outline" className="h-11 px-4" disabled={pending} onClick={() => setThresholdsOpen(true)} data-testid="reap-apply-thresholds">
            <Sparkles /> Appliquer les valeurs suggérées
          </WriteButton>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[60rem] text-sm" data-testid="reap-table">
          <thead className="text-left text-xs font-medium text-muted-foreground">
            <tr className="border-b">
              <th className="h-10 w-12 px-3">
                <input
                  type="checkbox"
                  className="size-5"
                  aria-label="Tout sélectionner"
                  checked={allChecked}
                  disabled={!canCreate}
                  onChange={(e) => toggleAll(e.target.checked)}
                  data-testid="reap-check-all"
                />
              </th>
              <th className="px-3">Article</th>
              <th className="px-3 text-right">Stock</th>
              <th className="px-3 text-right">En commande</th>
              <th className="px-3 text-right">Point de commande</th>
              <th className="px-3 text-right">Couverture</th>
              <th className="px-3">Fournisseur</th>
              <th className="px-3 text-right">Quantité à commander</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => {
              const q = parseQty(qty[r.itemId] ?? "");
              const bad = checked[r.itemId] && (Number.isNaN(q) || q <= 0);
              return (
                <tr key={r.itemId} className="transition-colors hover:bg-background" data-testid={`reap-row-${r.code}`}>
                  <td className="h-14 px-3">
                    <input
                      type="checkbox"
                      className="size-5"
                      aria-label={`Sélectionner ${r.name}`}
                      checked={checked[r.itemId] ?? false}
                      disabled={!canCreate}
                      onChange={(e) => setChecked((p) => ({ ...p, [r.itemId]: e.target.checked }))}
                      data-testid={`reap-check-${r.code}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/stock/articles/${r.itemId}`} className="doc-number text-primary hover:underline">
                        {r.code}
                      </Link>
                      <CriticalityBadge value={r.criticality} />
                    </div>
                    <p className="font-medium">{r.name}</p>
                    {r.existingRequest ? (
                      <p className="mt-1 text-xs" data-testid={`reap-existing-${r.code}`}>
                        <Link href={`/achats/demandes/${r.existingRequest.id}`} title="Ouvrir la DA en cours" className="hover:underline">
                          <StatusBadge label={`${r.existingRequest.number} en cours`} tone="warning" />
                        </Link>
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 text-right tabular-nums">
                    <QtyCell value={r.onHand} unit={r.stockUnit} />
                  </td>
                  <td className="px-3 text-right tabular-nums">
                    <QtyCell value={r.onOrder} unit={r.stockUnit} />
                  </td>
                  <td className="px-3 text-right tabular-nums">
                    <QtyCell value={r.reorderPoint} unit={r.stockUnit} />
                    {r.suggestedReorderPoint && r.suggestedReorderPoint !== r.reorderPoint ? (
                      <span className="block text-xs text-muted-foreground">suggéré : {formatQty(r.suggestedReorderPoint)}</span>
                    ) : null}
                  </td>
                  <td className="px-3 text-right">
                    <CoverageBadge days={r.coverageDays} leadTimeDays={r.leadTimeDays} />
                  </td>
                  <td className="px-3">
                    {r.supplierName ?? <span className="text-muted-foreground/70">—</span>}
                    {r.purchaseType !== "A_DEFINIR" ? <span className="block text-xs text-muted-foreground">{PURCHASE_TYPE_LABELS[r.purchaseType]}</span> : null}
                  </td>
                  <td className="px-3 py-2">
                    <div className="ml-auto flex w-56 items-center gap-2">
                      <Input
                        inputMode="decimal"
                        autoComplete="off"
                        aria-label={`Quantité à commander pour ${r.name}`}
                        className={NUM_INPUT}
                        value={qty[r.itemId] ?? ""}
                        disabled={!canCreate}
                        aria-invalid={showErrors && bad ? true : undefined}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => setQty((p) => ({ ...p, [r.itemId]: e.target.value }))}
                        data-testid={`reap-qty-${r.code}`}
                      />
                      <span className="w-16 shrink-0 text-xs text-muted-foreground">{unitShort(r.purchaseUnit)}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canCreate ? (
        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t bg-background/95 py-3 backdrop-blur">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {showErrors && selected.length === 0 ? <span className="text-red-700">Cochez au moins un article.</span> : null}
            {showErrors && invalid.length > 0 ? <span className="text-red-700">Corrigez les quantités à commander.</span> : null}
            {!showErrors && missingSupplier > 0 ? `${missingSupplier} article(s) sans fournisseur principal : la DA sera à compléter.` : null}
          </p>
          <WriteButton className="h-14 px-8 text-base" disabled={pending} onClick={validate} data-testid="reap-create">
            <FilePlus2 /> Créer les DA
          </WriteButton>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Créer les demandes d'achat ?"
        description={`${selected.length} article${selected.length > 1 ? "s" : ""} : une DA de réapprovisionnement sera créée par type d'achat (local, import) et soumise à validation du Responsable.`}
        confirmLabel="Créer les DA"
        pending={pending}
        onConfirm={create}
        testId="reap-confirm"
      />
      <ConfirmDialog
        open={thresholdsOpen}
        onOpenChange={setThresholdsOpen}
        title="Appliquer les valeurs suggérées ?"
        description="Le point de commande et le stock de sécurité de ces articles seront remplacés par les valeurs calculées d'après la consommation. L'opération est tracée dans le journal."
        confirmLabel="Appliquer"
        pending={pending}
        onConfirm={applyThresholds}
        testId="reap-thresholds-confirm"
      />
    </div>
  );
}
