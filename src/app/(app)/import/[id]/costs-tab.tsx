"use client";

import { useState } from "react";
import { AlertTriangle, CheckCheck, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { DateCell } from "@/components/date-cell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormError, FormField } from "@/components/form-field";
import { WriteButton } from "@/components/license/write-button";
import { MoneyCell } from "@/components/money-cell";
import { NativeSelect } from "@/components/native-select";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useActionRunner } from "@/components/use-action-runner";
import { formatNumber } from "@/lib/money";
import { ALLOCATION_KEYS, ALLOCATION_KEY_LABELS, type AllocationKeyCode, type CostStatusCode } from "@/modules/import-files/labels";
import { addCostAction, refreshEstimatesAction, removeCostAction, updateCostAction } from "../actions";

export interface CostView {
  id: string;
  typeCode: string;
  typeLabel: string;
  status: CostStatusCode;
  amount: string;
  currencyCode: string;
  rate: string;
  amountXof: number;
  vatRecoverable: boolean;
  allocationKey: AllocationKeyCode;
  keyUsed: AllocationKeyCode;
  fallback: boolean;
  excluded: boolean;
  payee: string | null;
}

export interface CostTypeOption {
  id: string;
  label: string;
  defaultKey: string;
  vatRecoverableDefault: boolean;
}

interface FormState {
  typeId: string;
  status: CostStatusCode;
  amount: string;
  currencyCode: string;
  rate: string;
  vatRecoverable: boolean;
  allocationKey: AllocationKeyCode;
  payee: string;
  note: string;
  reason: string;
}

const EMPTY: FormState = { typeId: "", status: "REEL", amount: "", currencyCode: "XOF", rate: "", vatRecoverable: false, allocationKey: "VALEUR", payee: "", note: "", reason: "" };

const parse = (s: string): number | null => {
  const v = s.trim().replace(/\s/g, "").replace(",", ".");
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const dec = (code: string) => (code === "XOF" ? 0 : 2);

/** Frais d'approche : estimés par défaut, remplacés par le réel au fil des factures (transitaire, armateur, douane…). */
export function CostsTab({
  fileId,
  costs,
  types,
  currencies,
  canWrite,
  history,
}: {
  fileId: string;
  costs: CostView[];
  types: CostTypeOption[];
  currencies: { code: string; name: string }[];
  canWrite: boolean;
  history: { id: string; kind: string; reason: string | null; createdAt: string | Date }[];
}) {
  const { run, pending } = useActionRunner();
  const [dialog, setDialog] = useState<null | { mode: "add" } | { mode: "edit"; cost: CostView }>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<CostView | null>(null);
  const [confirmRefresh, setConfirmRefresh] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((p) => ({ ...p, [k]: v }));

  const estimated = costs.filter((c) => c.status === "ESTIME" && !c.vatRecoverable).length;

  function openAdd() {
    setForm(EMPTY);
    setError(null);
    setDialog({ mode: "add" });
  }
  function openEdit(c: CostView, toReal: boolean) {
    setForm({
      typeId: "",
      status: toReal ? "REEL" : c.status,
      amount: toReal ? "" : c.amount,
      currencyCode: c.currencyCode,
      rate: c.currencyCode === "XOF" ? "" : c.rate,
      vatRecoverable: c.vatRecoverable,
      allocationKey: c.allocationKey,
      payee: c.payee ?? "",
      note: "",
      reason: "",
    });
    setError(null);
    setDialog({ mode: "edit", cost: c });
  }
  function pickType(id: string) {
    const t = types.find((x) => x.id === id);
    setForm((p) => ({
      ...p,
      typeId: id,
      vatRecoverable: t?.vatRecoverableDefault ?? false,
      allocationKey: (t?.defaultKey as AllocationKeyCode | undefined) ?? "VALEUR",
    }));
  }

  function save() {
    if (!dialog) return;
    const amount = parse(form.amount);
    if (amount === null || amount < 0) return setError("Saisissez un montant (0 ou plus).");
    const rate = parse(form.rate);
    if (form.currencyCode !== "XOF" && form.rate.trim() !== "" && (rate === null || rate <= 0)) return setError("Le taux doit être un nombre positif (FCFA pour 1 unité de devise).");
    const common = {
      amount,
      currencyCode: form.currencyCode,
      ...(form.currencyCode !== "XOF" && rate !== null ? { rate } : {}),
      vatRecoverable: form.vatRecoverable,
      allocationKey: form.allocationKey,
      payee: form.payee.trim() || null,
      note: form.note.trim() || null,
    };
    if (dialog.mode === "add") {
      if (!form.typeId) return setError("Choisissez le type de frais.");
      void run(() => addCostAction({ fileId, typeId: form.typeId, status: form.status, ...common }), {
        success: "Frais ajouté.",
        onSuccess: () => setDialog(null),
        onError: (e) => setError(e.message),
      });
    } else {
      const costId = dialog.cost.id;
      void run(() => updateCostAction({ costId, status: form.status, ...common, reason: form.reason.trim() || null }), {
        success: form.status === "REEL" && dialog.cost.status === "ESTIME" ? "Montant réel enregistré." : "Frais modifié.",
        onSuccess: () => setDialog(null),
        onError: (e) => setError(e.message),
      });
    }
  }

  const KIND: Record<string, string> = { CREATE: "Frais ajouté", MODIFICATION: "Frais modifié", ESTIME_VERS_REEL: "Estimé remplacé par le réel", SUPPRESSION: "Frais supprimé", CLOTURE: "Clôture" };

  return (
    <div className="space-y-5" data-testid="imp-costs">
      <section className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold">Frais d&apos;approche</h2>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              Chaque frais est d&apos;abord estimé (coefficient par défaut), puis remplacé par le montant réel de la facture. Il est réparti sur les marchandises selon sa clé (valeur, poids, volume ou quantité). Une TVA récupérable est exclue du coût de revient.
            </p>
          </div>
          {canWrite ? (
            <div className="flex flex-wrap gap-2">
              <WriteButton variant="outline" className="h-11 px-4" disabled={pending} onClick={() => setConfirmRefresh(true)} data-testid="imp-refresh-estimates">
                <RefreshCw /> Rafraîchir les estimations
              </WriteButton>
              <WriteButton className="h-11 px-4" onClick={openAdd} data-testid="imp-cost-add">
                <Plus /> Ajouter un frais
              </WriteButton>
            </div>
          ) : null}
        </div>
        {estimated > 0 ? (
          <p className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="imp-estimated-warning">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            {estimated} {estimated > 1 ? "frais sont encore estimés" : "frais est encore estimé"} : le coût de revient sera définitif quand les montants réels seront saisis.
          </p>
        ) : null}
        {costs.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="imp-costs-none">
            Aucun frais pour le moment.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm" data-testid="imp-costs-table">
              <thead>
                <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                  <th className="py-2 pr-3">Type de frais</th>
                  <th className="py-2 pr-3">Statut</th>
                  <th className="py-2 pr-3 text-right">Montant</th>
                  <th className="py-2 pr-3 text-right">Montant en FCFA</th>
                  <th className="py-2 pr-3">Répartition</th>
                  <th className="py-2 pr-3">TVA</th>
                  <th className="py-2 pr-3">Payé à</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {costs.map((c) => (
                  <tr key={c.id} className="border-b last:border-0" data-testid={`imp-cost-${c.typeCode}`} data-status={c.status}>
                    <td className="py-2.5 pr-3 font-medium">{c.typeLabel}</td>
                    <td className="py-2.5 pr-3">
                      <StatusBadge status={c.status} label={c.status === "ESTIME" ? "Estimé" : "Réel"} tone={c.status === "ESTIME" ? "warning" : "success"} />
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums whitespace-nowrap">
                      <MoneyCell value={c.amount} currency={c.currencyCode} decimals={dec(c.currencyCode)} />
                      {c.currencyCode !== "XOF" ? <span className="block text-xs text-muted-foreground">taux {formatNumber(c.rate, 4)}</span> : null}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums whitespace-nowrap" data-testid="imp-cost-xof">
                      <MoneyCell value={c.amountXof} currency="XOF" decimals={0} />
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      {ALLOCATION_KEY_LABELS[c.allocationKey]}
                      {c.fallback ? (
                        <span className="block text-xs text-amber-700" title="Poids ou volume manquant sur une ligne : la répartition se fait sur la valeur.">
                          faute de données : {ALLOCATION_KEY_LABELS[c.keyUsed].toLowerCase()}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">{c.vatRecoverable ? <span className="text-muted-foreground">Récupérable (exclue)</span> : "Incluse au coût"}</td>
                    <td className="py-2.5 pr-3">{c.payee ?? <span className="text-muted-foreground/70">—</span>}</td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      {canWrite ? (
                        <span className="inline-flex gap-1">
                          {c.status === "ESTIME" ? (
                            <WriteButton variant="outline" className="h-11 px-3" onClick={() => openEdit(c, true)} data-testid={`imp-cost-real-${c.typeCode}`}>
                              <CheckCheck /> Saisir le réel
                            </WriteButton>
                          ) : null}
                          <WriteButton variant="ghost" className="h-11 px-3" onClick={() => openEdit(c, false)} aria-label={`Modifier ${c.typeLabel}`} data-testid={`imp-cost-edit-${c.typeCode}`}>
                            <Pencil />
                          </WriteButton>
                          <WriteButton variant="ghost" className="h-11 px-3 text-red-700" onClick={() => setRemoving(c)} aria-label={`Supprimer ${c.typeLabel}`} data-testid={`imp-cost-remove-${c.typeCode}`}>
                            <Trash2 />
                          </WriteButton>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {history.length > 0 ? (
        <section className="rounded-xl border bg-card p-4" data-testid="imp-cost-history">
          <h2 className="mb-2 text-[15px] font-semibold">Historique des modifications</h2>
          <ul className="space-y-1 text-sm">
            {history.slice(0, 10).map((h) => (
              <li key={h.id} className="flex flex-wrap gap-x-2 text-muted-foreground">
                <span className="text-foreground">{KIND[h.kind] ?? h.kind}</span>
                <DateCell value={h.createdAt} withTime />
                {h.reason ? <span>– {h.reason}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-xl" data-testid="imp-cost-dialog">
          <DialogHeader>
            <DialogTitle>{dialog?.mode === "add" ? "Ajouter un frais" : dialog?.mode === "edit" ? `${dialog.cost.typeLabel}` : ""}</DialogTitle>
            <DialogDescription>{dialog?.mode === "edit" && dialog.cost.status === "ESTIME" && form.status === "REEL" ? "Saisissez le montant réel de la facture : il remplace l'estimation." : "Montant en FCFA ou en devise étrangère avec son taux."}</DialogDescription>
          </DialogHeader>
          <FormError message={error} testId="imp-cost-error" />
          <div className="grid gap-4 sm:grid-cols-2">
            {dialog?.mode === "add" ? (
              <FormField id="imp-cost-type" label="Type de frais" required className="sm:col-span-2">
                <NativeSelect id="imp-cost-type" value={form.typeId} onChange={(e) => pickType(e.target.value)} data-testid="imp-cost-type">
                  <option value="">Choisir un type</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
            ) : null}
            <FormField id="imp-cost-status" label="Nature du montant">
              <NativeSelect id="imp-cost-status" value={form.status} onChange={(e) => set("status", e.target.value as CostStatusCode)} data-testid="imp-cost-status">
                <option value="REEL">Réel (facture reçue)</option>
                <option value="ESTIME">Estimé</option>
              </NativeSelect>
            </FormField>
            <FormField id="imp-cost-key" label="Clé de répartition" hint="Comment le frais est partagé entre les lignes.">
              <NativeSelect id="imp-cost-key" value={form.allocationKey} onChange={(e) => set("allocationKey", e.target.value as AllocationKeyCode)} data-testid="imp-cost-key">
                {ALLOCATION_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {ALLOCATION_KEY_LABELS[k]}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField id="imp-cost-amount" label="Montant" required>
              <Input id="imp-cost-amount" inputMode="decimal" className="h-11 text-right tabular-nums" value={form.amount} onChange={(e) => set("amount", e.target.value)} data-testid="imp-cost-amount" />
            </FormField>
            <FormField id="imp-cost-currency" label="Devise">
              <NativeSelect id="imp-cost-currency" value={form.currencyCode} onChange={(e) => set("currencyCode", e.target.value)} data-testid="imp-cost-currency">
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} – {c.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            {form.currencyCode !== "XOF" ? (
              <FormField id="imp-cost-rate" label="Taux (FCFA pour 1 unité)" hint="Laissez vide pour le dernier taux connu." className="sm:col-span-2">
                <Input id="imp-cost-rate" inputMode="decimal" className="h-11 text-right tabular-nums" value={form.rate} onChange={(e) => set("rate", e.target.value)} data-testid="imp-cost-rate" />
              </FormField>
            ) : null}
            <FormField id="imp-cost-payee" label="Payé à" className="sm:col-span-2">
              <Input id="imp-cost-payee" className="h-11" maxLength={120} value={form.payee} onChange={(e) => set("payee", e.target.value)} data-testid="imp-cost-payee" />
            </FormField>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm sm:col-span-2">
              <input type="checkbox" className="size-5" checked={form.vatRecoverable} onChange={(e) => set("vatRecoverable", e.target.checked)} data-testid="imp-cost-vat" />
              <span>
                TVA récupérable <span className="text-muted-foreground">(exclue du coût de revient)</span>
              </span>
            </label>
            {dialog?.mode === "edit" ? (
              <FormField id="imp-cost-reason" label="Motif de la modification" className="sm:col-span-2" hint="Facultatif, conservé dans l'historique.">
                <Input id="imp-cost-reason" className="h-11" maxLength={300} value={form.reason} onChange={(e) => set("reason", e.target.value)} data-testid="imp-cost-reason" />
              </FormField>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="h-11 px-4" onClick={() => setDialog(null)}>
              Retour
            </Button>
            <WriteButton className="h-11 px-4" disabled={pending} onClick={save} data-testid="imp-cost-save">
              {pending ? "En cours…" : "Enregistrer"}
            </WriteButton>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Supprimer le frais « ${removing?.typeLabel ?? ""} » ?`}
        description="Le coût de revient est recalculé sans ce frais. La suppression est tracée dans l'historique."
        confirmLabel="Supprimer le frais"
        destructive
        pending={pending}
        testId="imp-cost-remove-dialog"
        onConfirm={async () => {
          if (!removing) return;
          await run(() => removeCostAction({ costId: removing.id }), { success: "Frais supprimé.", onSuccess: () => setRemoving(null) });
        }}
      />
      <ConfirmDialog
        open={confirmRefresh}
        onOpenChange={setConfirmRefresh}
        title="Rafraîchir les estimations ?"
        description="Les frais estimés automatiquement sont recalculés avec les coefficients par défaut et la valeur actuelle des marchandises. Les montants réels ne sont pas touchés."
        confirmLabel="Rafraîchir"
        pending={pending}
        testId="imp-refresh-dialog"
        onConfirm={async () => {
          await run(() => refreshEstimatesAction({ id: fileId }), { success: "Estimations rafraîchies.", onSuccess: () => setConfirmRefresh(false) });
        }}
      />
    </div>
  );
}
