"use client";

import { errorMessage } from "@/lib/action-feedback";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, PackageMinus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormError, FormField } from "@/components/form-field";
import { WriteButton } from "@/components/license/write-button";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unitShort } from "@/components/unit-select";
import { useActionRunner } from "@/components/use-action-runner";
import { formatQty } from "@/lib/money";
import { createIssueAction } from "@/app/(app)/stock/sorties/actions";
import { IssueItemSearch } from "./issue-item-search";
import { NUM_INPUT, parseQty } from "./qty";
import type { IssueItemHit } from "./types";

interface Line {
  hit: IssueItemHit;
  qty: string;
}

/** Message de stock insuffisant, identique à celui du serveur : « Stock insuffisant : 4 U disponibles ». */
export function insufficientMessage(available: string, unit: string): string {
  return `Stock insuffisant : ${formatQty(available)} ${unitShort(unit)} disponibles`;
}

/**
 * Bon de sortie sur tablette : peu de champs (dépôt, service, demandeur, motif, machine pour les pièces de rechange),
 * puis les lignes avec grosses zones de saisie. Tout ou rien : une seule ligne en excès bloque toute la sortie.
 */
export function IssueForm({
  warehouses,
  departments,
  defaultWarehouseId,
}: {
  warehouses: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  defaultWarehouseId?: string;
}) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId ?? warehouses[0]?.id ?? "");
  const [departmentId, setDepartmentId] = useState("");
  const [requester, setRequester] = useState("");
  const [reason, setReason] = useState("");
  const [equipment, setEquipment] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const hasPdr = lines.some((l) => l.hit.category === "PDR");
  const setQty = (id: string, qty: string) => setLines((p) => p.map((l) => (l.hit.id === id ? { ...l, qty } : l)));

  const computed = lines.map((l) => {
    const q = parseQty(l.qty);
    let error: string | null = null;
    if (Number.isNaN(q) || q <= 0) error = "Saisissez une quantité supérieure à 0.";
    else if (q > Number(l.hit.available)) error = insufficientMessage(l.hit.available, l.hit.stockUnit);
    return { line: l, q, error };
  });

  const header: Record<string, string> = {};
  if (!warehouseId) header.warehouse = "Choisissez le dépôt.";
  if (!departmentId) header.department = "Choisissez le service demandeur.";
  if (requester.trim().length < 2) header.requester = "Indiquez le nom du demandeur.";
  if (reason.trim().length < 3) header.reason = "Indiquez le motif de la sortie.";
  if (hasPdr && !equipment.trim()) header.equipment = "La machine est obligatoire pour une pièce de rechange.";
  const lineErrors = computed.filter((c) => c.error);

  function validate() {
    setShowErrors(true);
    setServerError(null);
    if (lines.length === 0 || Object.keys(header).length > 0 || lineErrors.length > 0) return;
    setConfirmOpen(true);
  }

  async function submit() {
    const res = await run(
      () =>
        createIssueAction({
          warehouseId,
          departmentId,
          requesterName: requester.trim(),
          reason: reason.trim(),
          equipment: equipment.trim() || null,
          lines: computed.map((c) => ({ itemId: c.line.hit.id, quantity: c.q })),
        }),
      {
        success: "Sortie enregistrée. Le stock est à jour.",
        refresh: false,
        onSuccess: (data) => router.push(`/stock/sorties/${(data as { id: string }).id}`),
        onError: (f) => setServerError(errorMessage(f)),
        silentCodes: ["STOCK_INSUFFICIENT"],
      },
    );
    if (res && !res.ok) setConfirmOpen(false);
  }

  return (
    <div className="space-y-6" data-testid="sor-form">
      <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="sor-form-info">
        <h2 id="sor-form-info" className="mb-4 text-[15px] font-semibold">
          Demande de sortie
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="sor-warehouse" label="Dépôt" required error={showErrors ? header.warehouse : undefined} hint={lines.length > 0 ? "Retirez les lignes pour changer de dépôt." : undefined}>
            <NativeSelect id="sor-warehouse" className="h-12" value={warehouseId} disabled={lines.length > 0} onChange={(e) => setWarehouseId(e.target.value)} data-testid="sor-warehouse">
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="sor-department" label="Service demandeur" required error={showErrors ? header.department : undefined}>
            <NativeSelect id="sor-department" className="h-12" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} data-testid="sor-department">
              <option value="">Choisir…</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="sor-requester" label="Demandeur" required error={showErrors ? header.requester : undefined}>
            <Input id="sor-requester" className="h-12 text-base" maxLength={80} autoComplete="off" value={requester} onChange={(e) => setRequester(e.target.value)} data-testid="sor-requester" />
          </FormField>
          <FormField id="sor-reason" label="Motif" required error={showErrors ? header.reason : undefined}>
            <Input id="sor-reason" className="h-12 text-base" maxLength={200} autoComplete="off" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="sor-reason" />
          </FormField>
          {hasPdr ? (
            <FormField id="sor-equipment" label="Machine concernée" required error={showErrors ? header.equipment : undefined} hint="Obligatoire dès qu'une pièce de rechange est sortie.">
              <Input id="sor-equipment" className="h-12 text-base" maxLength={120} autoComplete="off" value={equipment} onChange={(e) => setEquipment(e.target.value)} data-testid="sor-equipment" />
            </FormField>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="sor-form-lines">
        <h2 id="sor-form-lines" className="mb-3 text-[15px] font-semibold">
          Articles à sortir
        </h2>
        <IssueItemSearch
          warehouseId={warehouseId}
          excludeIds={lines.map((l) => l.hit.id)}
          onSelect={(hit) => setLines((p) => [...p, { hit, qty: "" }])}
        />
        {lines.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground" data-testid="sor-lines-empty">
            {showErrors ? <span className="text-red-700">Ajoutez au moins un article à sortir.</span> : "Recherchez un article ci-dessus pour l'ajouter à la sortie."}
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {computed.map(({ line: l, error }) => (
              <li key={l.hit.id} className="rounded-xl border bg-card p-4" data-testid={`sor-line-${l.hit.code}`}>
                <div className="grid items-end gap-3 sm:grid-cols-[1fr_11rem_auto]">
                  <div className="min-w-0">
                    <span className="doc-number text-muted-foreground">{l.hit.code}</span>
                    <p className="font-medium">{l.hit.name}</p>
                    <p className="text-sm text-muted-foreground tabular-nums">
                      Disponible : {formatQty(l.hit.available)} {unitShort(l.hit.stockUnit)}
                    </p>
                  </div>
                  <FormField id={`sor-qty-${l.hit.code}`} label={`Quantité (${unitShort(l.hit.stockUnit)})`}>
                    <Input
                      id={`sor-qty-${l.hit.code}`}
                      inputMode="decimal"
                      autoComplete="off"
                      className={NUM_INPUT}
                      value={l.qty}
                      aria-invalid={error && (showErrors || l.qty !== "") ? true : undefined}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => setQty(l.hit.id, e.target.value)}
                      data-testid={`sor-qty-${l.hit.code}`}
                    />
                  </FormField>
                  <Button
                    type="button"
                    variant="outline"
                    className="size-12"
                    aria-label={`Retirer ${l.hit.name}`}
                    onClick={() => setLines((p) => p.filter((x) => x.hit.id !== l.hit.id))}
                    data-testid={`sor-remove-${l.hit.code}`}
                  >
                    <Trash2 />
                  </Button>
                </div>
                {error && (showErrors || l.qty !== "") ? (
                  <p role="alert" className="mt-2 flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-400" data-testid={`sor-line-error-${l.hit.code}`}>
                    <AlertTriangle className="size-4 shrink-0" aria-hidden /> {error}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <FormError message={serverError} testId="sor-error" />

      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-between gap-3 border-t bg-background/95 px-1 py-3 backdrop-blur">
        <p className="text-sm text-muted-foreground" data-testid="sor-summary">
          {lines.length} article{lines.length > 1 ? "s" : ""} à sortir
        </p>
        <WriteButton className="h-14 px-8 text-base" disabled={pending} onClick={validate} data-testid="sor-submit">
          <PackageMinus /> Valider la sortie
        </WriteButton>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Valider la sortie ?"
        description="Le stock sera diminué immédiatement. Une sortie validée ne se modifie plus : seul le Responsable Achats peut l'annuler."
        confirmLabel="Valider la sortie"
        pending={pending}
        onConfirm={submit}
        testId="sor-confirm"
      />
    </div>
  );
}
