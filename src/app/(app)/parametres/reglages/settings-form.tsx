"use client";

import { useState } from "react";
import { WriteButton } from "@/components/license/write-button";
import { useActionRunner } from "@/components/use-action-runner";
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
