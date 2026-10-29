"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Trash2 } from "lucide-react";
import { createInventoryCountAction, proposeInventorySelectionAction } from "@/app/(app)/stock/inventaires/actions";
import { FormError, FormField } from "@/components/form-field";
import { WriteButton } from "@/components/license/write-button";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActionRunner } from "@/components/use-action-runner";
import { errorMessage } from "@/lib/action-feedback";
import type { SelectionRow } from "@/modules/inventory/types";
import { InventoryItemPicker } from "./item-picker";
import { SELECTION_REASON_LABELS } from "./labels";

interface Row {
  itemId: string;
  code: string;
  name: string;
  reason: keyof typeof SELECTION_REASON_LABELS;
}

/**
 * Préparation d'un inventaire par le Responsable : dépôt, type, puis liste d'articles.
 * Pour un inventaire tournant, la liste de la semaine est proposée automatiquement (A mensuel, B trimestriel, C semestriel,
 * écarts récents) ; on peut retirer ou ajouter des articles. Un inventaire complet reprend tous les articles du dépôt.
 */
export function PrepareInventoryForm({ warehouses }: { warehouses: { id: string; name: string }[] }) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [kind, setKind] = useState<"TOURNANT" | "COMPLET">("TOURNANT");
  const [plannedFor, setPlannedFor] = useState("");
  const [comment, setComment] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (kind !== "TOURNANT" || !warehouseId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement de la proposition à chaque changement de dépôt
    setLoading(true);
    void proposeInventorySelectionAction({ warehouseId }).then((res) => {
      if (cancelled) return;
      setLoading(false);
      setLoaded(true);
      setRows(res.ok ? (res.data as SelectionRow[]).map((r) => ({ itemId: r.itemId, code: r.code, name: r.name, reason: r.reason })) : []);
    });
    return () => {
      cancelled = true;
    };
  }, [warehouseId, kind]);

  async function submit() {
    setShowErrors(true);
    setServerError(null);
    if (!warehouseId) return;
    if (kind === "TOURNANT" && rows.length === 0) return;
    await run(
      () =>
        createInventoryCountAction({
          warehouseId,
          kind,
          ...(kind === "TOURNANT" ? { itemIds: rows.map((r) => r.itemId) } : {}),
          ...(plannedFor ? { plannedFor } : {}),
          ...(comment.trim() ? { comment: comment.trim() } : {}),
        }),
      {
        success: (d) => `Inventaire ${(d as { number: string }).number} préparé.`,
        refresh: false,
        onSuccess: (d) => router.push(`/stock/inventaires/${(d as { id: string }).id}`),
        onError: (f) => setServerError(errorMessage(f)),
      },
    );
  }

  return (
    <div className="space-y-6" data-testid="inv-prepare-form">
      <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="inv-prep-info">
        <h2 id="inv-prep-info" className="mb-4 text-[15px] font-semibold">
          Que faut-il compter ?
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="inv-warehouse" label="Dépôt" required>
            <NativeSelect
              id="inv-warehouse"
              className="h-12"
              value={warehouseId}
              onChange={(e) => {
                setWarehouseId(e.target.value);
                setRows([]);
                setLoaded(false);
              }}
              data-testid="inv-warehouse"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="inv-planned" label="Date prévue" hint="Facultatif. Le jour où le magasin fera le comptage.">
            <Input id="inv-planned" type="date" className="h-12 text-base" value={plannedFor} onChange={(e) => setPlannedFor(e.target.value)} data-testid="inv-planned" />
          </FormField>
        </div>
        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-medium">Type d&apos;inventaire</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["TOURNANT", "Tournant", "La liste de la semaine : articles A chaque mois, B chaque trimestre, C chaque semestre, plus les écarts récents."],
                ["COMPLET", "Complet", "Tous les articles stockés du dépôt. À réserver aux grandes opérations (fin d'année, audit)."],
              ] as const
            ).map(([value, label, help]) => (
              <label
                key={value}
                className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border p-3 ${kind === value ? "border-primary bg-primary/5" : "bg-card"}`}
              >
                <input
                  type="radio"
                  name="inv-kind"
                  className="mt-1 size-5 accent-[var(--primary)]"
                  checked={kind === value}
                  onChange={() => setKind(value)}
                  data-testid={`inv-kind-${value}`}
                />
                <span>
                  <span className="block font-medium">{label}</span>
                  <span className="block text-sm text-muted-foreground">{help}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <FormField id="inv-comment" label="Commentaire" className="mt-4" hint="Facultatif.">
          <Input id="inv-comment" className="h-12 text-base" maxLength={500} autoComplete="off" value={comment} onChange={(e) => setComment(e.target.value)} data-testid="inv-comment" />
        </FormField>
      </section>

      {kind === "TOURNANT" ? (
        <section aria-labelledby="inv-prep-lines" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="inv-prep-lines" className="text-[15px] font-semibold">
              Articles à compter
            </h2>
            {rows.length > 0 ? (
              <Button type="button" variant="outline" className="h-11 px-4" onClick={() => setRows([])} data-testid="inv-prep-clear">
                Tout retirer
              </Button>
            ) : null}
          </div>
          <InventoryItemPicker
            warehouseId={warehouseId}
            excludeIds={rows.map((r) => r.itemId)}
            onPick={(h) => setRows((p) => [...p, { itemId: h.id, code: h.code, name: h.name, reason: "AJOUT_MANUEL" }])}
          />
          {loading ? (
            <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground" data-testid="inv-prep-loading">
              Calcul de la liste de la semaine…
            </p>
          ) : rows.length === 0 ? (
            <p className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground" data-testid="inv-prep-empty">
              {showErrors ? (
                <span className="text-red-700">Ajoutez au moins un article.</span>
              ) : loaded ? (
                "Aucun article n'est à compter cette semaine dans ce dépôt. Vous pouvez en ajouter avec la recherche ci-dessus."
              ) : (
                "Choisissez un dépôt."
              )}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-card">
              <table className="w-full min-w-[32rem] text-sm" data-testid="inv-prep-lines">
                <thead className="text-left text-xs font-medium text-muted-foreground">
                  <tr className="border-b">
                    <th className="h-10 px-3">Article</th>
                    <th className="px-3">Pourquoi</th>
                    <th className="w-16 px-3">
                      <span className="sr-only">Retirer</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => (
                    <tr key={r.itemId} className="h-12" data-testid={`inv-prep-row-${r.code}`}>
                      <td className="px-3">
                        <span className="doc-number text-muted-foreground">{r.code}</span> {r.name}
                      </td>
                      <td className="px-3 text-muted-foreground">{SELECTION_REASON_LABELS[r.reason]}</td>
                      <td className="px-3 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          className="size-11"
                          aria-label={`Retirer ${r.name}`}
                          onClick={() => setRows((p) => p.filter((x) => x.itemId !== r.itemId))}
                          data-testid={`inv-prep-remove-${r.code}`}
                        >
                          <Trash2 />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground" data-testid="inv-prep-complet-note">
          Tous les articles stockés du dépôt seront ajoutés à la liste. Les articles déjà présents dans un autre inventaire en cours sont ignorés.
        </p>
      )}

      <FormError message={serverError} testId="inv-prep-error" />

      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-between gap-3 border-t bg-background/95 px-1 py-3 backdrop-blur">
        <p className="text-sm text-muted-foreground" data-testid="inv-prep-summary">
          {kind === "TOURNANT" ? `${rows.length} article${rows.length > 1 ? "s" : ""} à compter` : "Inventaire complet du dépôt"}
        </p>
        <WriteButton className="h-14 px-8 text-base" disabled={pending || loading} onClick={() => void submit()} data-testid="inv-prep-submit">
          <ClipboardList /> Préparer l&apos;inventaire
        </WriteButton>
      </div>
    </div>
  );
}
