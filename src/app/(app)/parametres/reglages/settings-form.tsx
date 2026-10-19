"use client";

import { useState } from "react";
import { FormField } from "@/components/form-field";
import { WriteButton } from "@/components/license/write-button";
import { Input } from "@/components/ui/input";
import { useActionRunner } from "@/components/use-action-runner";
import { formatFcfa } from "@/lib/money";
import { updateSettingAction } from "./actions";

/** Réglage « prix d'achat visibles au Magasinier » (H13) : masqués par défaut, jamais envoyés au navigateur. */
export function SettingsForm({ showPurchasePrice }: { showPurchasePrice: boolean }) {
  const { run, pending } = useActionRunner();
  const [value, setValue] = useState(showPurchasePrice);
  const dirty = value !== showPurchasePrice;

  return (
    <form
      className="max-w-2xl space-y-4 rounded-lg border bg-card p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => updateSettingAction({ key: "warehouse.showPurchasePrice", value }), {
          success: value ? "Les prix d'achat sont maintenant visibles par le Magasinier." : "Les prix d'achat sont maintenant masqués pour le Magasinier.",
        });
      }}
      data-testid="settings-form"
    >
      <div>
        <h2 className="font-medium">Prix d&apos;achat et magasin</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Par défaut, le Magasinier ne voit pas les prix d&apos;achat ni l&apos;historique des prix sur les fiches articles et fournisseurs. Il ne voit que les quantités.
        </p>
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:bg-muted">
        <input type="checkbox" className="size-6" checked={value} onChange={(e) => setValue(e.target.checked)} data-testid="setting-show-purchase-price" />
        <span className="text-sm">Afficher les prix d&apos;achat au Magasinier</span>
      </label>
      <div className="flex justify-end">
        <WriteButton type="submit" className="h-11 px-6" disabled={!dirty || pending} data-testid="settings-save">
          {pending ? "Enregistrement…" : "Enregistrer"}
        </WriteButton>
      </div>
    </form>
  );
}

/** D12 : seuil de validation des demandes d'achat (FCFA entiers, 0 = désactivé). Information seulement tant que la direction n'est pas définie. */
export function ApprovalThresholdForm({ approvalThreshold }: { approvalThreshold: number }) {
  const { run, pending } = useActionRunner();
  const [raw, setRaw] = useState(String(approvalThreshold));
  const [error, setError] = useState<string | undefined>();
  const parsed = raw.trim() === "" ? 0 : Number(raw);
  const dirty = parsed !== approvalThreshold;

  return (
    <form
      className="max-w-2xl space-y-4 rounded-lg border bg-card p-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!Number.isInteger(parsed) || parsed < 0) {
          setError("Saisissez un montant entier en FCFA (0 pour désactiver).");
          return;
        }
        setError(undefined);
        void run(() => updateSettingAction({ key: "purchaseRequest.approvalThreshold", value: parsed }), {
          success: parsed === 0 ? "Seuil de validation désactivé." : `Seuil de validation enregistré : ${formatFcfa(parsed)}.`,
        });
      }}
      data-testid="threshold-form"
    >
      <div>
        <h2 className="font-medium">Seuil de validation des demandes d&apos;achat</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Au-delà de ce montant estimé, la fiche de la demande affiche « validation direction prévue ». Pour l&apos;instant c&apos;est une simple information : le Responsable Achats valide toujours. Laissez 0 pour désactiver.
        </p>
      </div>
      <FormField id="setting-threshold" label="Seuil (FCFA)" error={error} hint={parsed > 0 && Number.isInteger(parsed) ? `Soit ${formatFcfa(parsed)}` : undefined}>
        <Input
          id="setting-threshold"
          inputMode="numeric"
          className="h-11 max-w-xs text-right text-base"
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value.replace(/D/g, ""));
            setError(undefined);
          }}
          data-testid="setting-threshold"
        />
      </FormField>
      <div className="flex justify-end">
        <WriteButton type="submit" className="h-11 px-6" disabled={!dirty || pending} data-testid="threshold-save">
          {pending ? "Enregistrement…" : "Enregistrer"}
        </WriteButton>
      </div>
    </form>
  );
}
