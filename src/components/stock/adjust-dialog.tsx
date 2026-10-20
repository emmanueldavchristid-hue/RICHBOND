"use client";

import { errorMessage } from "@/lib/action-feedback";
import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ItemSearchCombobox, type ItemHit } from "@/components/purchase-requests/item-search-combobox";
import { FormError, FormField, TextArea } from "@/components/form-field";
import { WriteButton } from "@/components/license/write-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/native-select";
import { unitShort } from "@/components/unit-select";
import { useActionRunner } from "@/components/use-action-runner";
import { formatQty } from "@/lib/money";
import { cn } from "@/lib/utils";
import { adjustAction } from "@/app/(app)/stock/mouvements/actions";
import { NUM_INPUT, parseQty } from "./qty";
import type { PrefilledItem } from "./transfer-dialog";

/**
 * Ajustement de stock (Responsable Achats seulement) : on indique le sens (ajouter ou retirer), la quantité et le
 * motif, obligatoire. Une confirmation est demandée : l'ajustement reste visible dans le journal des mouvements.
 */
export function AdjustDialog({
  open,
  onOpenChange,
  warehouses,
  item: prefilled,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  warehouses: { id: string; name: string }[];
  item?: PrefilledItem;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="stk-adjust-dialog">
        <DialogHeader>
          <DialogTitle>Ajustement de stock</DialogTitle>
          <DialogDescription>Corrige la quantité d&apos;un article (casse, écart constaté, erreur de saisie). Le motif est obligatoire.</DialogDescription>
        </DialogHeader>
        {open ? <AdjustForm warehouses={warehouses} prefilled={prefilled} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function AdjustForm({ warehouses, prefilled, onDone }: { warehouses: { id: string; name: string }[]; prefilled?: PrefilledItem; onDone: () => void }) {
  const { run, pending } = useActionRunner();
  const [item, setItem] = useState<{ id: string; code: string; name: string; stockUnit: string } | null>(prefilled ?? null);
  const [warehouseId, setWarehouseId] = useState(prefilled?.levels?.find((l) => Number(l.quantity) > 0)?.warehouseId ?? prefilled?.levels?.[0]?.warehouseId ?? warehouses[0]?.id ?? "");
  const [sign, setSign] = useState<1 | -1>(1);
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const current = prefilled?.levels?.find((l) => l.warehouseId === warehouseId)?.quantity;
  const q = parseQty(qty);
  const errors: Record<string, string> = {};
  if (!item) errors.item = "Choisissez l'article à ajuster.";
  if (!warehouseId) errors.warehouse = "Choisissez le dépôt.";
  if (Number.isNaN(q) || q <= 0) errors.qty = "Saisissez une quantité supérieure à 0.";
  else if (sign < 0 && current !== undefined && q > Number(current)) errors.qty = `Stock insuffisant : ${formatQty(current)} ${item ? unitShort(item.stockUnit) : ""} disponibles.`;
  if (reason.trim().length < 5) errors.reason = "Motif obligatoire (5 caractères minimum).";

  function validate() {
    setShowErrors(true);
    setServerError(null);
    if (Object.keys(errors).length === 0) setConfirmOpen(true);
  }

  async function submit() {
    if (!item) return;
    const res = await run(() => adjustAction({ itemId: item.id, warehouseId, quantity: sign * q, reason: reason.trim() }), {
      success: "Ajustement enregistré. Le stock est à jour.",
      onSuccess: onDone,
      onError: (f) => setServerError(errorMessage(f)),
      silentCodes: ["STOCK_INSUFFICIENT"],
    });
    if (res && !res.ok) setConfirmOpen(false);
  }

  return (
    <div className="space-y-4">
      <FormError message={serverError} testId="stk-adjust-error" />
      <FormField id="stk-adjust-item" label="Article" required error={showErrors ? errors.item : undefined}>
        {item ? (
          <div className="flex min-h-12 items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3">
            <span className="min-w-0 truncate">
              <span className="doc-number text-muted-foreground">{item.code}</span> <span className="font-medium">{item.name}</span>
            </span>
            {prefilled ? null : (
              <Button type="button" variant="ghost" className="h-9 px-2" onClick={() => setItem(null)} data-testid="stk-adjust-item-clear">
                Changer
              </Button>
            )}
          </div>
        ) : (
          <ItemSearchCombobox testId="stk-adjust-item" onSelect={(h: ItemHit) => setItem({ id: h.id, code: h.code, name: h.name, stockUnit: h.stockUnit })} />
        )}
      </FormField>
      <FormField
        id="stk-adjust-warehouse"
        label="Dépôt"
        required
        hint={current !== undefined ? `Stock actuel : ${formatQty(current)} ${item ? unitShort(item.stockUnit) : ""}` : undefined}
        error={showErrors ? errors.warehouse : undefined}
      >
        <NativeSelect id="stk-adjust-warehouse" className="h-12" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} data-testid="stk-adjust-warehouse">
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
        <div role="group" aria-label="Sens de l'ajustement" className="flex gap-2 sm:pt-[1.625rem]">
          {(
            [
              { v: 1, label: "Ajouter", icon: <Plus className="size-5" aria-hidden />, id: "plus" },
              { v: -1, label: "Retirer", icon: <Minus className="size-5" aria-hidden />, id: "minus" },
            ] as const
          ).map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={sign === o.v}
              onClick={() => setSign(o.v)}
              className={cn(
                "inline-flex h-12 min-w-28 items-center justify-center gap-2 rounded-lg border px-4 text-base font-medium transition-colors",
                sign === o.v ? "border-primary bg-primary/10 text-primary" : "bg-card hover:bg-muted",
              )}
              data-testid={`stk-adjust-sign-${o.id}`}
            >
              {o.icon} {o.label}
            </button>
          ))}
        </div>
        <FormField id="stk-adjust-qty" label={`Quantité${item ? ` (${unitShort(item.stockUnit)})` : ""}`} required error={showErrors ? errors.qty : undefined}>
          <Input
            id="stk-adjust-qty"
            inputMode="decimal"
            autoComplete="off"
            className={NUM_INPUT}
            value={qty}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setQty(e.target.value)}
            data-testid="stk-adjust-qty"
          />
        </FormField>
      </div>
      <FormField id="stk-adjust-reason" label="Motif de l'ajustement" required error={showErrors ? errors.reason : undefined} hint="Exemples : casse constatée, erreur de saisie, écart après comptage.">
        <TextArea id="stk-adjust-reason" className="min-h-20" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="stk-adjust-reason" />
      </FormField>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" className="h-12 px-5" onClick={onDone} data-testid="stk-adjust-cancel">
          Annuler
        </Button>
        <WriteButton type="button" className="h-12 px-6" disabled={pending} onClick={validate} data-testid="stk-adjust-submit">
          Enregistrer l&apos;ajustement
        </WriteButton>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Enregistrer cet ajustement ?"
        description={
          <>
            {sign > 0 ? "Ajout" : "Retrait"} de {Number.isNaN(q) ? "?" : formatQty(q)} {item ? unitShort(item.stockUnit) : ""} sur {item?.code ?? "l'article"}. Le stock change immédiatement et l&apos;ajustement est conservé dans le journal des mouvements.
          </>
        }
        confirmLabel="Enregistrer l'ajustement"
        pending={pending}
        onConfirm={submit}
        testId="stk-adjust-confirm"
      />
    </div>
  );
}
