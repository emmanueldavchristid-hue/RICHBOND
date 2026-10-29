"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { FormError, FormField, TextArea } from "@/components/form-field";
import { WriteButton } from "@/components/license/write-button";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActionRunner } from "@/components/use-action-runner";
import { formatAmount, formatQty } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { InvoiceableLine } from "@/modules/invoices/types";
import { createInvoiceAction, listInvoiceableReceiptsAction } from "./actions";

interface FormLine extends InvoiceableLine {
  checked: boolean;
  quantity: string;
  unitPrice: string;
}

const num = (s: string) => {
  const n = Number(s.trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export function InvoiceForm({ suppliers, today }: { suppliers: { id: string; label: string }[]; today: string }) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const [supplierId, setSupplierId] = useState("");
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<FormLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);

  async function pickSupplier(id: string) {
    setSupplierId(id);
    setLines([]);
    setError(null);
    if (!id) return;
    setLoading(true);
    const res = await listInvoiceableReceiptsAction({ supplierId: id }).catch(() => null);
    setLoading(false);
    if (!res || !res.ok) {
      setError(res && !res.ok ? res.message : "Impossible de charger les réceptions à facturer. Réessayez.");
      return;
    }
    setLines(res.data.map((l) => ({ ...l, checked: true, quantity: l.billableQty, unitPrice: l.poPrice })));
  }

  const patch = (key: string, p: Partial<FormLine>) => setLines((ls) => ls.map((l) => (l.orderLineId === key ? { ...l, ...p } : l)));

  const selected = lines.filter((l) => l.checked);
  const currency = selected[0]?.currencyCode ?? lines[0]?.currencyCode ?? "XOF";
  const mixedCurrencies = new Set(selected.map((l) => l.currencyCode)).size > 1;
  const totals = selected.reduce(
    (t, l) => {
      const net = num(l.quantity) * num(l.unitPrice) * (1 - num(l.discountPct) / 100);
      return { ht: t.ht + net, vat: t.vat + (net * num(l.vatRate)) / 100 };
    },
    { ht: 0, vat: 0 },
  );
  const decimals = currency === "XOF" ? 0 : 2;
  const money = (n: number) => formatAmount(n, currency, decimals);

  async function submit() {
    setError(null);
    setDuplicate(false);
    if (!supplierId) return setError("Choisissez le fournisseur.");
    if (!supplierInvoiceNo.trim()) return setError("Saisissez le numéro de la facture du fournisseur.");
    if (selected.length === 0) return setError("Cochez au moins une ligne à facturer.");
    if (mixedCurrencies) return setError("Les lignes cochées ont des devises différentes : une facture ne peut avoir qu'une seule devise.");
    if (selected.some((l) => num(l.quantity) <= 0)) return setError("Chaque ligne cochée doit avoir une quantité facturée supérieure à 0.");
    const res = await run(
      () =>
        createInvoiceAction({
          supplierId,
          supplierInvoiceNo,
          invoiceDate,
          dueDate: dueDate || null,
          currencyCode: currency,
          notes: notes.trim() || null,
          lines: selected.map((l) => ({ orderLineId: l.orderLineId, quantity: l.quantity, unitPrice: l.unitPrice, discountPct: l.discountPct, vatRate: l.vatRate })),
        }),
      {
        success: (r) => `Facture ${r.number} enregistrée : ${r.status === "ECART" ? "des écarts ont été détectés." : r.status === "CONFORME" ? "elle est conforme." : "à rapprocher."}`,
        onSuccess: (r) => router.push(`/achats/factures/${r.id}`),
        refresh: false,
        silentCodes: ["FACTURE_EN_DOUBLE"],
      },
    );
    if (res && !res.ok) {
      setError(res.message);
      setDuplicate(res.code === "FACTURE_EN_DOUBLE");
    }
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      data-testid="inv-form"
    >
      <FormError message={error} testId={duplicate ? "inv-duplicate-error" : "inv-form-error"} />

      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-4 text-[15px] font-semibold">Facture du fournisseur</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <FormField id="inv-supplier" label="Fournisseur" required className="xl:col-span-2">
            <NativeSelect id="inv-supplier" value={supplierId} onChange={(e) => void pickSupplier(e.target.value)} data-testid="inv-supplier">
              <option value="">Choisir un fournisseur…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="inv-number" label="N° de la facture du fournisseur" required>
            <Input id="inv-number" className="h-11" maxLength={60} value={supplierInvoiceNo} onChange={(e) => setSupplierInvoiceNo(e.target.value)} data-testid="inv-number" />
          </FormField>
          <FormField id="inv-date" label="Date de la facture" required>
            <Input id="inv-date" type="date" className="h-11" value={invoiceDate} max={today} onChange={(e) => setInvoiceDate(e.target.value)} data-testid="inv-date" />
          </FormField>
          <FormField id="inv-due" label="Échéance" hint="Laissez vide : calculée depuis les conditions de paiement du fournisseur." className="xl:col-span-2">
            <Input id="inv-due" type="date" className="h-11" value={dueDate} min={invoiceDate} onChange={(e) => setDueDate(e.target.value)} data-testid="inv-due" />
          </FormField>
          <FormField id="inv-notes" label="Remarques" className="md:col-span-2">
            <TextArea id="inv-notes" className="min-h-11" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="inv-notes" />
          </FormField>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-[15px] font-semibold">Lignes à facturer</h2>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">
          Seules les quantités reçues et acceptées, pas encore facturées, sont proposées. Corrigez la quantité et le prix pour qu&apos;ils correspondent à la facture papier.
        </p>
        {!supplierId ? (
          <p className="text-sm text-muted-foreground" data-testid="inv-lines-hint">
            Choisissez d&apos;abord le fournisseur.
          </p>
        ) : loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Chargement des réceptions…
          </p>
        ) : lines.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground" data-testid="inv-no-lines">
            Aucune réception à facturer pour ce fournisseur : tout ce qui a été reçu est déjà facturé.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm" data-testid="inv-lines">
              <thead>
                <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                  <th className="w-12 py-2 pr-2" />
                  <th className="py-2 pr-3">BC</th>
                  <th className="py-2 pr-3">Désignation</th>
                  <th className="py-2 pr-3 text-right">Reçu à facturer</th>
                  <th className="w-32 py-2 pr-3 text-right">Qté facturée</th>
                  <th className="w-36 py-2 pr-3 text-right">Prix unitaire</th>
                  <th className="py-2 pr-3 text-right">Prix du BC</th>
                  <th className="py-2 text-right">Montant HT</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const net = num(l.quantity) * num(l.unitPrice) * (1 - num(l.discountPct) / 100);
                  return (
                    <tr key={l.orderLineId} className={cn("border-b last:border-0", !l.checked && "opacity-50")} data-testid={`inv-line-${l.orderNumber}-${l.lineNo}`}>
                      <td className="py-2 pr-2">
                        <input
                          type="checkbox"
                          className="size-6 accent-[var(--primary)]"
                          checked={l.checked}
                          onChange={(e) => patch(l.orderLineId, { checked: e.target.checked })}
                          aria-label={`Facturer la ligne ${l.lineNo} de ${l.orderNumber}`}
                          data-testid="inv-line-check"
                        />
                      </td>
                      <td className="doc-number py-2 pr-3 whitespace-nowrap">
                        {l.orderNumber} / {l.lineNo}
                      </td>
                      <td className="py-2 pr-3">{l.designation}</td>
                      <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">
                        {formatQty(l.billableQty)} {l.unit}
                      </td>
                      <td className="py-2 pr-3">
                        <Input
                          inputMode="decimal"
                          className="h-11 text-right tabular-nums"
                          value={l.quantity}
                          disabled={!l.checked}
                          onChange={(e) => patch(l.orderLineId, { quantity: e.target.value })}
                          aria-label="Quantité facturée"
                          data-testid="inv-line-qty"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <Input
                          inputMode="decimal"
                          className="h-11 text-right tabular-nums"
                          value={l.unitPrice}
                          disabled={!l.checked}
                          onChange={(e) => patch(l.orderLineId, { unitPrice: e.target.value })}
                          aria-label="Prix unitaire facturé"
                          data-testid="inv-line-price"
                        />
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground whitespace-nowrap">{formatAmount(l.poPrice, l.currencyCode, l.currencyCode === "XOF" ? 0 : 2)}</td>
                      <td className="py-2 text-right tabular-nums whitespace-nowrap">{l.checked ? money(net) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {selected.length > 0 ? (
          <dl className="mt-4 ml-auto w-full max-w-xs space-y-1 text-sm" data-testid="inv-totals">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Total HT</dt>
              <dd className="tabular-nums" data-testid="inv-total-ht">{money(totals.ht)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">TVA</dt>
              <dd className="tabular-nums" data-testid="inv-total-vat">{money(totals.vat)}</dd>
            </div>
            <div className="flex justify-between border-t pt-1 text-base font-semibold">
              <dt>Total TTC</dt>
              <dd className="tabular-nums" data-testid="inv-total-ttc">{money(totals.ht + totals.vat)}</dd>
            </div>
            <p className="pt-1 text-xs text-muted-foreground">Montants indicatifs : le total officiel est recalculé à l&apos;enregistrement.</p>
          </dl>
        ) : null}
      </section>

      <div className="flex flex-wrap justify-end gap-3">
        <Button type="button" variant="outline" className="h-12 px-5 text-base" onClick={() => router.push("/achats/factures")} data-testid="inv-cancel">
          Annuler
        </Button>
        <WriteButton type="submit" className="h-12 px-5 text-base" disabled={pending} data-testid="inv-submit">
          <Save /> {pending ? "Enregistrement…" : "Enregistrer et rapprocher"}
        </WriteButton>
      </div>
    </form>
  );
}
