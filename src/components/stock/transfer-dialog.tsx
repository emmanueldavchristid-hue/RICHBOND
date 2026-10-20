"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
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
import { transferAction } from "@/app/(app)/stock/mouvements/actions";
import { NUM_INPUT, parseQty } from "./qty";
import type { WarehouseStockView } from "./types";

export interface PrefilledItem {
  id: string;
  code: string;
  name: string;
  stockUnit: string;
  /** Stock par dépôt, quand il est connu (fiche article). */
  levels?: WarehouseStockView[];
}

/**
 * Transfert d'un article entre deux dépôts (Magasinier, Responsable). Deux mouvements liés par un même numéro TRF.
 * Le stock du dépôt d'origine est contrôlé par le serveur : le message d'erreur dit combien il reste.
 */
export function TransferDialog({
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
      <DialogContent className="sm:max-w-lg" data-testid="stk-transfer-dialog">
        <DialogHeader>
          <DialogTitle>Transfert entre dépôts</DialogTitle>
          <DialogDescription>Déplace du stock d&apos;un dépôt à un autre. Le coût moyen (PMP) de l&apos;article est conservé.</DialogDescription>
        </DialogHeader>
        {open ? <TransferForm warehouses={warehouses} prefilled={prefilled} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function TransferForm({ warehouses, prefilled, onDone }: { warehouses: { id: string; name: string }[]; prefilled?: PrefilledItem; onDone: () => void }) {
  const { run, pending } = useActionRunner();
  const [item, setItem] = useState<{ id: string; code: string; name: string; stockUnit: string } | null>(prefilled ?? null);
  const [from, setFrom] = useState(prefilled?.levels?.find((l) => Number(l.quantity) > 0)?.warehouseId ?? warehouses[0]?.id ?? "");
  const [to, setTo] = useState("");
  const [qty, setQty] = useState("");
  const [comment, setComment] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const available = prefilled?.levels?.find((l) => l.warehouseId === from)?.quantity;
  const q = parseQty(qty);
  const errors: Record<string, string> = {};
  if (!item) errors.item = "Choisissez l'article à transférer.";
  if (!from) errors.from = "Choisissez le dépôt d'origine.";
  if (!to) errors.to = "Choisissez le dépôt de destination.";
  else if (to === from) errors.to = "Le dépôt de destination doit être différent du dépôt d'origine.";
  if (Number.isNaN(q) || q <= 0) errors.qty = "Saisissez une quantité supérieure à 0.";
  else if (available !== undefined && q > Number(available)) errors.qty = `Stock insuffisant : ${formatQty(available)} ${item ? unitShort(item.stockUnit) : ""} disponibles.`;

  async function submit() {
    setShowErrors(true);
    setServerError(null);
    if (Object.keys(errors).length > 0 || !item) return;
    await run(
      () => transferAction({ itemId: item.id, fromWarehouseId: from, toWarehouseId: to, quantity: q, comment: comment.trim() || null }),
      {
        success: "Transfert enregistré. Les deux stocks sont à jour.",
        onSuccess: onDone,
        onError: (f) => setServerError(f.message),
        silentCodes: ["INSUFFICIENT_STOCK"],
      },
    );
  }

  return (
    <div className="space-y-4">
      <FormError message={serverError} testId="stk-transfer-error" />
      <FormField id="stk-transfer-item" label="Article" required error={showErrors ? errors.item : undefined}>
        {item ? (
          <div className="flex min-h-12 items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3">
            <span className="min-w-0 truncate">
              <span className="doc-number text-muted-foreground">{item.code}</span> <span className="font-medium">{item.name}</span>
            </span>
            {prefilled ? null : (
              <Button type="button" variant="ghost" className="h-9 px-2" onClick={() => setItem(null)} data-testid="stk-transfer-item-clear">
                Changer
              </Button>
            )}
          </div>
        ) : (
          <ItemSearchCombobox testId="stk-transfer-item" onSelect={(h: ItemHit) => setItem({ id: h.id, code: h.code, name: h.name, stockUnit: h.stockUnit })} />
        )}
      </FormField>
      <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <FormField id="stk-transfer-from" label="Depuis le dépôt" required error={showErrors ? errors.from : undefined}>
          <NativeSelect id="stk-transfer-from" className="h-12" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="stk-transfer-from">
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <ArrowRight className="mb-3.5 hidden size-5 text-muted-foreground sm:block" aria-hidden />
        <FormField id="stk-transfer-to" label="Vers le dépôt" required error={showErrors ? errors.to : undefined}>
          <NativeSelect id="stk-transfer-to" className="h-12" value={to} onChange={(e) => setTo(e.target.value)} data-testid="stk-transfer-to">
            <option value="">Choisir…</option>
            {warehouses
              .filter((w) => w.id !== from)
              .map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
          </NativeSelect>
        </FormField>
      </div>
      <FormField
        id="stk-transfer-qty"
        label={`Quantité${item ? ` (${unitShort(item.stockUnit)})` : ""}`}
        required
        hint={available !== undefined ? `Disponible au dépôt d'origine : ${formatQty(available)} ${item ? unitShort(item.stockUnit) : ""}` : undefined}
        error={showErrors ? errors.qty : undefined}
      >
        <Input
          id="stk-transfer-qty"
          inputMode="decimal"
          autoComplete="off"
          className={NUM_INPUT}
          value={qty}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setQty(e.target.value)}
          data-testid="stk-transfer-qty"
        />
      </FormField>
      <FormField id="stk-transfer-comment" label="Commentaire (facultatif)">
        <TextArea id="stk-transfer-comment" className="min-h-16" maxLength={300} value={comment} onChange={(e) => setComment(e.target.value)} data-testid="stk-transfer-comment" />
      </FormField>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" className="h-12 px-5" onClick={onDone} data-testid="stk-transfer-cancel">
          Annuler
        </Button>
        <WriteButton type="button" className="h-12 px-6" disabled={pending} onClick={() => void submit()} data-testid="stk-transfer-submit">
          {pending ? "En cours…" : "Transférer"}
        </WriteButton>
      </div>
    </div>
  );
}
