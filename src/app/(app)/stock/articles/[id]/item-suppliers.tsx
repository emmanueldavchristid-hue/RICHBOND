"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Link2, Pencil, Unlink } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DateCell } from "@/components/date-cell";
import { EmptyState } from "@/components/empty-state";
import { FormError, FormField } from "@/components/form-field";
import { WriteButton } from "@/components/license/write-button";
import { MoneyCell } from "@/components/money-cell";
import { NativeSelect } from "@/components/native-select";
import { QtyCell } from "@/components/qty-cell";
import { unitName, unitShort } from "@/components/unit-select";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useActionRunner } from "@/components/use-action-runner";
import { linkSupplierSchema, updateItemSupplierSchema } from "@/modules/items/schemas";
import { SUPPLIER_STATUS_LABELS } from "@/modules/referentials/labels";
import { deactivateItemSupplierAction, linkSupplierAction, updateItemSupplierAction } from "../actions";

export interface ItemLinkRow {
  id: string;
  supplier: { id: string; code: string; name: string; status: "ACTIF" | "EN_EVALUATION" | "BLOQUE"; currencyCode: string };
  supplierRef: string | null;
  leadTimeDays: number | null;
  minOrderQty: string | null;
  active: boolean;
  updatedAt: Date;
  lastPrice: string | null;
  currencyCode: string | null;
  lastPriceDate: Date | null;
  /** Unité du prix et du minimum : unité d'achat de l'article. */
  priceUnit: string | null;
}

interface LinkValues {
  supplierId: string;
  supplierRef: string;
  lastPrice: string;
  currencyCode: string;
  leadTimeDays: string;
  minOrderQty: string;
}

type LinkErrors = Partial<Record<keyof LinkValues, string>>;

const SERVER_FIELD: Record<string, keyof LinkValues> = {
  SUPPLIER_BLOCKED: "supplierId",
  LINK_EXISTS: "supplierId",
  CURRENCY_INVALID: "currencyCode",
};

function LinkDialog({
  itemId,
  purchaseUnit,
  target,
  open,
  onOpenChange,
  supplierOptions,
  currencies,
  showPrices,
}: {
  itemId: string;
  purchaseUnit: string;
  /** null = nouveau lien. */
  target: ItemLinkRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierOptions: { id: string; code: string; name: string; currencyCode: string }[];
  currencies: { code: string }[];
  showPrices: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="item-link-dialog">
        {open ? (
          <LinkForm
            itemId={itemId}
            purchaseUnit={purchaseUnit}
            target={target}
            onDone={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
            supplierOptions={supplierOptions}
            currencies={currencies}
            showPrices={showPrices}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function LinkForm({
  itemId,
  purchaseUnit,
  target,
  onDone,
  onCancel,
  supplierOptions,
  currencies,
  showPrices,
}: {
  itemId: string;
  purchaseUnit: string;
  target: ItemLinkRow | null;
  onDone: () => void;
  onCancel: () => void;
  supplierOptions: { id: string; code: string; name: string; currencyCode: string }[];
  currencies: { code: string }[];
  showPrices: boolean;
}) {
  const { run, pending } = useActionRunner();
  const [v, setV] = useState<LinkValues>({
    supplierId: target?.supplier.id ?? "",
    supplierRef: target?.supplierRef ?? "",
    lastPrice: target?.lastPrice ?? "",
    currencyCode: target?.currencyCode ?? "XOF",
    leadTimeDays: target?.leadTimeDays != null ? String(target.leadTimeDays) : "",
    minOrderQty: target?.minOrderQty ?? "",
  });
  const [errors, setErrors] = useState<LinkErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const set = (k: keyof LinkValues, value: string) => {
    setV((p) => ({ ...p, [k]: value }));
    setErrors((p) => ({ ...p, [k]: undefined }));
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const base = {
      supplierRef: v.supplierRef,
      // Prix vide : on ne force pas de devise ; la devise n'est envoyée qu'avec un prix.
      lastPrice: v.lastPrice,
      currencyCode: v.lastPrice.trim() === "" ? "" : v.currencyCode,
      leadTimeDays: v.leadTimeDays,
      minOrderQty: v.minOrderQty,
    };
    const payload = target
      ? { id: target.id, expectedUpdatedAt: target.updatedAt.toISOString(), ...base }
      : { itemId, supplierId: v.supplierId, ...base };
    const check = (target ? updateItemSupplierSchema : linkSupplierSchema).safeParse(payload);
    if (!check.success || (!target && !v.supplierId)) {
      const next: LinkErrors = {};
      if (!target && !v.supplierId) next.supplierId = "Choisissez un fournisseur.";
      if (!check.success) {
        for (const issue of check.error.issues) {
          const key = issue.path[0] as keyof LinkValues | undefined;
          if (key && !next[key]) next[key] = issue.message;
        }
      }
      setErrors(next);
      return;
    }
    await run(() => (target ? updateItemSupplierAction(payload) : linkSupplierAction(payload)), {
      success: target ? "Fournisseur de l'article mis à jour." : "Fournisseur lié à l'article.",
      onSuccess: onDone,
      onError: (f) => {
        const key = SERVER_FIELD[f.code];
        if (key) setErrors({ [key]: f.message });
        else setFormError(f.message);
      },
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{target ? `Modifier : ${target.supplier.name}` : "Lier un fournisseur"}</DialogTitle>
        <DialogDescription>
          Référence, dernier prix, délai annoncé et minimum de commande pour cet article chez ce fournisseur.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} noValidate className="space-y-4" data-testid="item-link-form">
        <FormError message={formError} testId="item-link-error" />
        {!target ? (
          <FormField id="link-supplier" label="Fournisseur" required error={errors.supplierId}>
            <NativeSelect
              id="link-supplier"
              value={v.supplierId}
              onChange={(e) => {
                const s = supplierOptions.find((o) => o.id === e.target.value);
                set("supplierId", e.target.value);
                if (s && v.lastPrice.trim() === "") set("currencyCode", s.currencyCode);
              }}
              data-testid="link-supplier"
            >
              <option value="">Choisir un fournisseur…</option>
              {supplierOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </NativeSelect>
          </FormField>
        ) : null}
        <FormField id="link-ref" label="Référence chez le fournisseur" error={errors.supplierRef}>
          <Input id="link-ref" className="h-11" value={v.supplierRef} maxLength={60} onChange={(e) => set("supplierRef", e.target.value)} data-testid="link-ref" />
        </FormField>
        {showPrices ? (
          <div className="grid grid-cols-[1fr_8rem] gap-3">
            <FormField id="link-price" label={`Dernier prix d'achat (par ${unitShort(purchaseUnit)})`} error={errors.lastPrice} hint={`Prix pour 1 ${unitName(purchaseUnit)} (unité d'achat). En FCFA : nombre entier.`}>
              <Input id="link-price" className="h-11" inputMode="decimal" value={v.lastPrice} onChange={(e) => set("lastPrice", e.target.value)} data-testid="link-price" />
            </FormField>
            <FormField id="link-currency" label="Devise" error={errors.currencyCode}>
              <NativeSelect id="link-currency" value={v.currencyCode} onChange={(e) => set("currencyCode", e.target.value)} data-testid="link-currency">
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <FormField id="link-lead" label="Délai annoncé (jours)" error={errors.leadTimeDays}>
            <Input id="link-lead" className="h-11" inputMode="numeric" value={v.leadTimeDays} onChange={(e) => set("leadTimeDays", e.target.value)} data-testid="link-lead" />
          </FormField>
          <FormField id="link-moq" label={`Minimum de commande (en ${unitShort(purchaseUnit)})`} error={errors.minOrderQty}>
            <Input id="link-moq" className="h-11" inputMode="decimal" value={v.minOrderQty} onChange={(e) => set("minOrderQty", e.target.value)} data-testid="link-moq" />
          </FormField>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" className="h-11 px-4" onClick={onCancel}>
            Annuler
          </Button>
          <WriteButton type="submit" className="h-11 px-4" disabled={pending} data-testid="link-save">
            {pending ? "Enregistrement…" : target ? "Enregistrer" : "Lier le fournisseur"}
          </WriteButton>
        </div>
      </form>
    </>
  );
}

/** Onglet « Fournisseurs » d'un article : plusieurs fournisseurs, référence, dernier prix, délai, minimum. */
export function ItemSuppliersTab({
  itemId,
  purchaseUnit,
  links,
  mainSupplierId,
  supplierOptions,
  currencies,
  showPrices,
  canEdit,
}: {
  itemId: string;
  purchaseUnit: string;
  links: ItemLinkRow[];
  mainSupplierId: string | null;
  supplierOptions: { id: string; code: string; name: string; currencyCode: string }[];
  currencies: { code: string }[];
  showPrices: boolean;
  canEdit: boolean;
}) {
  const { run, pending } = useActionRunner();
  const [dialog, setDialog] = useState<{ target: ItemLinkRow | null } | null>(null);
  const [removing, setRemoving] = useState<ItemLinkRow | null>(null);

  const active = links.filter((l) => l.active);
  const linkedIds = new Set(active.map((l) => l.supplier.id));
  const available = supplierOptions.filter((s) => !linkedIds.has(s.id));

  return (
    <div className="space-y-4" data-testid="item-suppliers">
      {canEdit ? (
        <div className="flex justify-end">
          <WriteButton type="button" className="h-11 px-4" onClick={() => setDialog({ target: null })} data-testid="item-link-add">
            <Link2 /> Lier un fournisseur
          </WriteButton>
        </div>
      ) : null}
      {active.length === 0 ? (
        <EmptyState title="Aucun fournisseur lié" description="Liez au moins un fournisseur pour pouvoir commander cet article." />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm" data-testid="item-suppliers-table">
            <thead className="text-left text-xs font-medium text-muted-foreground border-b">
              <tr>
                <th className="p-3">Fournisseur</th>
                <th className="p-3">Référence</th>
                {showPrices ? <th className="p-3 text-right">Dernier prix (par {unitShort(purchaseUnit)})</th> : null}
                {showPrices ? <th className="p-3">Date du prix</th> : null}
                <th className="p-3 text-right">Délai (jours)</th>
                <th className="p-3 text-right">Minimum ({unitShort(purchaseUnit)})</th>
                {canEdit ? <th className="p-3" /> : null}
              </tr>
            </thead>
            <tbody>
              {active.map((l) => (
                <tr key={l.id} className="border-t" data-testid={`item-link-row-${l.supplier.code}`}>
                  <td className="p-3">
                    <Link href={`/fournisseurs/${l.supplier.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                      {l.supplier.name}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                      <span className="font-mono">{l.supplier.code}</span>
                      {l.supplier.id === mainSupplierId ? <StatusBadge tone="info" label="Principal" /> : null}
                      {l.supplier.status !== "ACTIF" ? (
                        <StatusBadge status={l.supplier.status} label={SUPPLIER_STATUS_LABELS[l.supplier.status]} />
                      ) : null}
                    </div>
                  </td>
                  <td className="p-3">{l.supplierRef ?? "—"}</td>
                  {showPrices ? (
                    <td className="p-3 text-right tabular-nums">
                      <MoneyCell value={l.lastPrice} currency={l.currencyCode} />
                      {l.lastPrice ? <span className="text-muted-foreground"> / {unitShort(l.priceUnit ?? purchaseUnit)}</span> : null}
                    </td>
                  ) : null}
                  {showPrices ? (
                    <td className="p-3">
                      <DateCell value={l.lastPriceDate} />
                    </td>
                  ) : null}
                  <td className="p-3 text-right tabular-nums">{l.leadTimeDays ?? "—"}</td>
                  <td className="p-3 text-right tabular-nums">
                    <QtyCell value={l.minOrderQty} unit={l.minOrderQty ? purchaseUnit : null} />
                  </td>
                  {canEdit ? (
                    <td className="p-3">
                      <div className="flex justify-end gap-2">
                        <WriteButton type="button" variant="outline" className="h-11 px-3" onClick={() => setDialog({ target: l })} data-testid="item-link-edit">
                          <Pencil /> Modifier
                        </WriteButton>
                        <WriteButton type="button" variant="destructive" className="h-11 px-3" onClick={() => setRemoving(l)} data-testid="item-link-remove">
                          <Unlink /> Retirer
                        </WriteButton>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <LinkDialog
        key={dialog?.target?.id ?? "new"}
        itemId={itemId}
        purchaseUnit={purchaseUnit}
        target={dialog?.target ?? null}
        open={dialog !== null}
        onOpenChange={(o) => (!o ? setDialog(null) : undefined)}
        supplierOptions={available}
        currencies={currencies}
        showPrices={showPrices}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => (!o ? setRemoving(null) : undefined)}
        title="Retirer ce fournisseur de l'article ?"
        description={
          removing
            ? `${removing.supplier.name} ne sera plus proposé pour cet article. L'historique des prix est conservé.`
            : undefined
        }
        confirmLabel="Retirer"
        destructive
        pending={pending}
        testId="item-link-confirm"
        onConfirm={async () => {
          if (!removing) return;
          await run(() => deactivateItemSupplierAction({ id: removing.id, expectedUpdatedAt: removing.updatedAt.toISOString() }), {
            success: "Fournisseur retiré de l'article.",
            onSuccess: () => setRemoving(null),
            onError: () => setRemoving(null),
          });
        }}
      />
    </div>
  );
}
