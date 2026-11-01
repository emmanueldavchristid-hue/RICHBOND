"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Info, Pencil, Plus } from "lucide-react";
import { CodeInput } from "@/components/code-input";
import { FormError, FormField } from "@/components/form-field";
import { WriteButton } from "@/components/license/write-button";
import { NativeSelect } from "@/components/native-select";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useActionRunner } from "@/components/use-action-runner";
import { formatNumber } from "@/lib/money";
import { ALLOCATION_KEYS, ALLOCATION_KEY_LABELS, IMPORT_MODES, IMPORT_MODE_LABELS, type AllocationKeyCode, type ImportModeCode } from "@/modules/import-files/labels";
import { saveCostTypeAction, setCoefficientDefaultAction } from "../../import/actions";

interface CostTypeRow {
  id: string;
  code: string;
  label: string;
  defaultKey: string;
  vatRecoverableDefault: boolean;
  sortOrder: number;
  active: boolean;
  defaults: Record<ImportModeCode, string>;
}

interface Form {
  id?: string;
  code: string;
  label: string;
  defaultKey: AllocationKeyCode;
  vatRecoverableDefault: boolean;
  sortOrder: string;
  active: boolean;
  pct: Record<ImportModeCode, string>;
}

const NEW_FORM: Form = { code: "", label: "", defaultKey: "VALEUR", vatRecoverableDefault: false, sortOrder: "100", active: true, pct: { MARITIME: "0", AERIEN: "0", ROUTIER: "0" } };

const parse = (s: string) => {
  const n = Number(s.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

export function CostTypesManager({ types, defaultCoefficients }: { types: CostTypeRow[]; defaultCoefficients: Record<ImportModeCode, string> }) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((p) => (p ? { ...p, [k]: v } : p));

  function edit(t: CostTypeRow) {
    setError(null);
    setForm({ id: t.id, code: t.code, label: t.label, defaultKey: t.defaultKey as AllocationKeyCode, vatRecoverableDefault: t.vatRecoverableDefault, sortOrder: String(t.sortOrder), active: t.active, pct: { ...t.defaults } });
  }

  async function save() {
    if (!form) return;
    setError(null);
    const sortOrder = parse(form.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0) return setError("L'ordre d'affichage doit être un entier positif.");
    const pcts = IMPORT_MODES.map((m) => [m, parse(form.pct[m])] as const);
    if (pcts.some(([, v]) => !Number.isFinite(v) || v < 0 || v > 100)) return setError("Chaque pourcentage doit être compris entre 0 et 100.");
    const res = await run(
      () => saveCostTypeAction({ id: form.id, code: form.code, label: form.label, defaultKey: form.defaultKey, vatRecoverableDefault: form.vatRecoverableDefault, sortOrder, active: form.active }),
      { refresh: false, onError: (e) => setError(e.message) },
    );
    if (!res?.ok) return;
    for (const [mode, pctOfValue] of pcts) {
      const r = await run(() => setCoefficientDefaultAction({ mode, typeId: res.data.id, pctOfValue }), { refresh: false, onError: (e) => setError(e.message) });
      if (!r?.ok) return;
    }
    setForm(null);
    toast.success(form.id ? "Type de frais enregistré." : "Type de frais créé.");
    router.refresh();
  }

  return (
    <div className="space-y-5" data-testid="imp-cost-types">
      <section className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-[15px] font-semibold">Types de frais et pourcentages par mode</h2>
          <WriteButton className="h-11 px-4" onClick={() => (setError(null), setForm(NEW_FORM))} data-testid="imp-type-add">
            <Plus /> Nouveau type de frais
          </WriteButton>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                <th className="py-2 pr-3">Type de frais</th>
                <th className="py-2 pr-3">Répartition</th>
                <th className="py-2 pr-3">TVA</th>
                <th className="py-2 pr-3">Statut</th>
                {IMPORT_MODES.map((m) => (
                  <th key={m} className="py-2 pr-3 text-right">
                    {IMPORT_MODE_LABELS[m]} (% de la valeur)
                  </th>
                ))}
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <tr key={t.id} className="border-b last:border-0" data-testid={`imp-type-${t.code}`}>
                  <td className="py-2.5 pr-3">
                    <span className="font-medium">{t.label}</span>
                    <span className="block font-mono text-xs text-muted-foreground">{t.code}</span>
                  </td>
                  <td className="py-2.5 pr-3">{ALLOCATION_KEY_LABELS[t.defaultKey as AllocationKeyCode]}</td>
                  <td className="py-2.5 pr-3">{t.vatRecoverableDefault ? "Récupérable (exclue)" : "Incluse au coût"}</td>
                  <td className="py-2.5 pr-3">
                    <StatusBadge status={t.active ? "ACTIF" : "DESACTIVE"} />
                  </td>
                  {IMPORT_MODES.map((m) => (
                    <td key={m} className="py-2.5 pr-3 text-right tabular-nums" data-testid={`imp-type-${t.code}-${m}`}>
                      {formatNumber(t.defaults[m], 2)} %
                    </td>
                  ))}
                  <td className="py-2.5 text-right">
                    <WriteButton variant="ghost" className="h-11 px-3" onClick={() => edit(t)} data-testid={`imp-type-edit-${t.code}`}>
                      <Pencil /> Modifier
                    </WriteButton>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t font-semibold">
                <td className="py-2.5 pr-3" colSpan={4}>
                  <span className="inline-flex items-center gap-1.5">
                    Coefficient d&apos;approche par défaut
                    <Tooltip>
                      <TooltipTrigger render={<button type="button" aria-label="Aide : coefficient par défaut" className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground" />}>
                        <Info className="size-4" />
                      </TooltipTrigger>
                      <TooltipContent>1 + somme des pourcentages des types actifs dont la TVA n&apos;est pas récupérable. Utilisé quand aucun dossier clôturé ne permet une meilleure estimation.</TooltipContent>
                    </Tooltip>
                  </span>
                </td>
                {IMPORT_MODES.map((m) => (
                  <td key={m} className="py-2.5 pr-3 text-right tabular-nums" data-testid={`imp-default-coef-${m}`}>
                    {formatNumber(defaultCoefficients[m], 4)}
                  </td>
                ))}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="sm:max-w-xl" data-testid="imp-type-dialog">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Modifier le type de frais" : "Nouveau type de frais"}</DialogTitle>
            <DialogDescription>Les pourcentages sont appliqués à la valeur des marchandises pour estimer le frais avant réception de la facture.</DialogDescription>
          </DialogHeader>
          <FormError message={error} testId="imp-type-error" />
          {form ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="imp-type-code" label="Code" required hint="Lettres majuscules, chiffres et _ (2 à 30 caractères).">
                <CodeInput id="imp-type-code" value={form.code} onChange={(v) => set("code", v)} data-testid="imp-type-code" />
              </FormField>
              <FormField id="imp-type-label" label="Libellé" required>
                <Input id="imp-type-label" className="h-11" maxLength={80} value={form.label} onChange={(e) => set("label", e.target.value)} data-testid="imp-type-label" />
              </FormField>
              <FormField id="imp-type-key" label="Clé de répartition par défaut">
                <NativeSelect id="imp-type-key" value={form.defaultKey} onChange={(e) => set("defaultKey", e.target.value as AllocationKeyCode)} data-testid="imp-type-key">
                  {ALLOCATION_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {ALLOCATION_KEY_LABELS[k]}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField id="imp-type-order" label="Ordre d'affichage">
                <Input id="imp-type-order" inputMode="numeric" className="h-11 text-right tabular-nums" value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} data-testid="imp-type-order" />
              </FormField>
              {IMPORT_MODES.map((m) => (
                <FormField key={m} id={`imp-type-pct-${m}`} label={`${IMPORT_MODE_LABELS[m]} (% de la valeur)`}>
                  <Input id={`imp-type-pct-${m}`} inputMode="decimal" className="h-11 text-right tabular-nums" value={form.pct[m]} onChange={(e) => set("pct", { ...form.pct, [m]: e.target.value })} data-testid={`imp-type-pct-${m}`} />
                </FormField>
              ))}
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                <input type="checkbox" className="size-5" checked={form.vatRecoverableDefault} onChange={(e) => set("vatRecoverableDefault", e.target.checked)} data-testid="imp-type-vat" />
                <span>TVA récupérable (exclue du coût)</span>
              </label>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                <input type="checkbox" className="size-5" checked={form.active} onChange={(e) => set("active", e.target.checked)} data-testid="imp-type-active" />
                <span>Type actif</span>
              </label>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="h-11 px-4" onClick={() => setForm(null)}>
              Retour
            </Button>
            <WriteButton className="h-11 px-4" disabled={pending} onClick={() => void save()} data-testid="imp-type-save">
              {pending ? "En cours…" : "Enregistrer"}
            </WriteButton>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
