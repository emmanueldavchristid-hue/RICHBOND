"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CodeInput } from "@/components/code-input";
import { FormError, FormField, TextArea } from "@/components/form-field";
import { WriteButton } from "@/components/license/write-button";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UnitSelect, unitName, unitShort } from "@/components/unit-select";
import { useActionRunner } from "@/components/use-action-runner";
import { formatQty } from "@/lib/money";
import { createItemSchema, updateItemSchema } from "@/modules/items/schemas";
import { CRITICALITY_LABELS, ITEM_CATEGORY_LABELS } from "@/modules/referentials/labels";
import { createItemAction, updateItemAction } from "./actions";

export interface ItemFormValues {
  code: string;
  name: string;
  category: string;
  family: string;
  stockUnit: string;
  purchaseUnit: string;
  conversionFactor: string;
  stocked: boolean;
  criticality: string;
  defaultWarehouseId: string;
  safetyStock: string;
  reorderPoint: string;
  economicOrderQty: string;
  leadTimeDays: string;
  mainSupplierId: string;
  barcode: string;
  equipment: string;
  notes: string;
}

export const EMPTY_ITEM: ItemFormValues = {
  code: "",
  name: "",
  category: "MATIERE_PREMIERE",
  family: "",
  stockUnit: "U",
  purchaseUnit: "U",
  conversionFactor: "1",
  stocked: true,
  criticality: "STANDARD",
  defaultWarehouseId: "",
  safetyStock: "",
  reorderPoint: "",
  economicOrderQty: "",
  leadTimeDays: "",
  mainSupplierId: "",
  barcode: "",
  equipment: "",
  notes: "",
};

type Errors = Partial<Record<keyof ItemFormValues, string>>;

/** Erreurs serveur rattachées à un champ précis. */
const SERVER_FIELD: Record<string, keyof ItemFormValues> = {
  CODE_EXISTS: "code",
  BARCODE_EXISTS: "barcode",
  WAREHOUSE_INVALID: "defaultWarehouseId",
  SUPPLIER_BLOCKED: "mainSupplierId",
  CONVERSION_INVALID: "conversionFactor",
};

export function ItemForm({
  mode,
  itemId,
  updatedAt,
  initial,
  warehouses,
  suppliers,
  families,
  readOnly = false,
  codeSlot,
}: {
  mode: "create" | "edit";
  itemId?: string;
  /** Version lue de la fiche (ISO) : envoyée en `expectedUpdatedAt`. */
  updatedAt?: string;
  initial: ItemFormValues;
  warehouses: { id: string; code: string; name: string }[];
  suppliers: { id: string; code: string; name: string; status: string }[];
  families: string[];
  readOnly?: boolean;
  /** Bouton « Modifier le code » (Responsable), affiché à côté du code en modification. */
  codeSlot?: ReactNode;
}) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const [v, setV] = useState<ItemFormValues>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const set = <K extends keyof ItemFormValues>(key: K, value: ItemFormValues[K]) => {
    setV((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const isService = v.category === "SERVICE";
  const isPdr = v.category === "PDR";
  const coef = Number(v.conversionFactor.replace(",", "."));
  const showPreview = Number.isFinite(coef) && coef > 0 && (v.purchaseUnit !== v.stockUnit || coef !== 1);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const payload = {
      ...(mode === "edit" ? { id: itemId, expectedUpdatedAt: updatedAt } : { code: v.code }),
      name: v.name,
      category: v.category,
      family: v.family,
      stockUnit: v.stockUnit,
      purchaseUnit: v.purchaseUnit,
      conversionFactor: v.conversionFactor,
      stocked: v.stocked,
      criticality: v.criticality,
      defaultWarehouseId: v.defaultWarehouseId,
      safetyStock: v.safetyStock,
      reorderPoint: v.reorderPoint,
      economicOrderQty: v.economicOrderQty,
      leadTimeDays: v.leadTimeDays,
      mainSupplierId: v.mainSupplierId,
      barcode: v.barcode,
      equipment: v.equipment,
      notes: v.notes,
    };
    const check = (mode === "edit" ? updateItemSchema : createItemSchema).safeParse(payload);
    if (!check.success) {
      const next: Errors = {};
      for (const issue of check.error.issues) {
        const key = issue.path[0] as keyof ItemFormValues | undefined;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      setFormError("Corrigez les champs signalés en rouge avant d'enregistrer.");
      return;
    }
    const res = await run(() => (mode === "edit" ? updateItemAction(payload) : createItemAction(payload)), {
      success: mode === "edit" ? "Article enregistré." : "Article créé.",
      refresh: mode === "edit",
      onSuccess: (data) => {
        if (mode === "create") router.push(`/stock/articles/${(data as { id: string }).id}`);
      },
      onError: (f) => {
        const key = SERVER_FIELD[f.code];
        if (key) setErrors({ [key]: f.message });
        else if (f.code !== "CONFLICT") setFormError(f.message);
      },
    });
    if (res && !res.ok && res.code === "CONFLICT") setFormError(res.message);
  }

  const err = (k: keyof ItemFormValues) => errors[k];

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6" data-testid="item-form">
      <fieldset disabled={readOnly || pending} className="space-y-6">
        <FormError message={formError} testId="item-form-error" />

        <section className="space-y-4 rounded-lg border bg-card p-4" aria-labelledby="item-sec-id">
          <h2 id="item-sec-id" className="font-medium">
            Identification
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              id="item-code"
              label="Code article"
              error={err("code")}
              hint={mode === "create" ? "Laissez vide pour générer automatiquement (ART-00001). Utilisez le code Sage s'il existe." : "Le code est la clé d'échange avec Sage."}
            >
              <div className="flex gap-2">
                <CodeInput
                  id="item-code"
                  value={v.code}
                  onChange={(x) => set("code", x)}
                  readOnly={mode === "edit"}
                  placeholder={mode === "create" ? "Généré automatiquement" : undefined}
                  data-testid="item-code"
                />
                {mode === "edit" ? codeSlot : null}
              </div>
            </FormField>
            <FormField id="item-name" label="Désignation" required error={err("name")}>
              <Input id="item-name" className="h-11" value={v.name} maxLength={150} onChange={(e) => set("name", e.target.value)} data-testid="item-name" />
            </FormField>
            <FormField id="item-category" label="Catégorie" required error={err("category")}>
              <NativeSelect
                id="item-category"
                value={v.category}
                onChange={(e) => set("category", e.target.value)}
                data-testid="item-category"
              >
                {Object.entries(ITEM_CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField id="item-family" label="Famille" error={err("family")} hint="Texte libre ; des suggestions apparaissent à partir des familles existantes.">
              <Input
                id="item-family"
                className="h-11"
                list="item-families"
                value={v.family}
                maxLength={60}
                onChange={(e) => set("family", e.target.value)}
                data-testid="item-family"
              />
              <datalist id="item-families">
                {families.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </FormField>
            <FormField
              id="item-criticality"
              label="Criticité"
              error={err("criticality")}
              hint="Critique : une rupture arrête une ligne de production."
            >
              <NativeSelect
                id="item-criticality"
                value={v.criticality}
                onChange={(e) => set("criticality", e.target.value)}
                data-testid="item-criticality"
              >
                {Object.entries(CRITICALITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            {isPdr ? (
              <FormField id="item-equipment" label="Équipement / machine concernée" error={err("equipment")} hint="Pour retrouver toutes les pièces d'une machine.">
                <Input
                  id="item-equipment"
                  className="h-11"
                  value={v.equipment}
                  maxLength={120}
                  onChange={(e) => set("equipment", e.target.value)}
                  data-testid="item-equipment"
                />
              </FormField>
            ) : null}
            <FormField id="item-barcode" label="Code-barres" error={err("barcode")}>
              <Input
                id="item-barcode"
                className="h-11"
                inputMode="numeric"
                value={v.barcode}
                maxLength={50}
                onChange={(e) => set("barcode", e.target.value)}
                data-testid="item-barcode"
              />
            </FormField>
          </div>
        </section>

        <section className="space-y-4 rounded-lg border bg-card p-4" aria-labelledby="item-sec-units">
          <h2 id="item-sec-units" className="font-medium">
            Unités et conversion
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            <FormField id="item-stock-unit" label="Unité de stock" required error={err("stockUnit")} hint="Unité dans laquelle le stock est compté.">
              <UnitSelect id="item-stock-unit" value={v.stockUnit} onChange={(e) => set("stockUnit", e.target.value)} data-testid="item-stock-unit" />
            </FormField>
            <FormField id="item-purchase-unit" label="Unité d'achat" required error={err("purchaseUnit")} hint="Unité figurant sur les bons de commande.">
              <UnitSelect
                id="item-purchase-unit"
                value={v.purchaseUnit}
                onChange={(e) => set("purchaseUnit", e.target.value)}
                data-testid="item-purchase-unit"
              />
            </FormField>
            <FormField
              id="item-coef"
              label="Coefficient de conversion"
              required
              error={err("conversionFactor")}
              hint="Nombre d'unités de stock dans 1 unité d'achat."
            >
              <Input
                id="item-coef"
                className="h-11"
                inputMode="decimal"
                value={v.conversionFactor}
                onChange={(e) => set("conversionFactor", e.target.value)}
                data-testid="item-coef"
              />
            </FormField>
          </div>
          {showPreview ? (
            <p className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900" data-testid="item-conversion-preview">
              1 {unitName(v.purchaseUnit)} ({unitShort(v.purchaseUnit)}) = {formatQty(coef)} {unitShort(v.stockUnit)}
            </p>
          ) : null}
        </section>

        {isService ? (
          <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground" data-testid="item-service-note">
            Un service n&apos;est pas stocké : les seuils de stock et le dépôt ne s&apos;appliquent pas.
          </p>
        ) : (
          <section className="space-y-4 rounded-lg border bg-card p-4" aria-labelledby="item-sec-stock">
            <h2 id="item-sec-stock" className="font-medium">
              Stock
            </h2>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-5"
                checked={v.stocked}
                onChange={(e) => set("stocked", e.target.checked)}
                data-testid="item-stocked"
              />
              Article stocké (suivi en magasin)
            </label>
            <div className="grid gap-4 md:grid-cols-4">
              <FormField id="item-warehouse" label="Dépôt par défaut" error={err("defaultWarehouseId")} className="md:col-span-1">
                <NativeSelect
                  id="item-warehouse"
                  value={v.defaultWarehouseId}
                  onChange={(e) => set("defaultWarehouseId", e.target.value)}
                  data-testid="item-warehouse"
                >
                  <option value="">Aucun</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField id="item-safety" label={`Stock de sécurité (en ${unitShort(v.stockUnit)})`} error={err("safetyStock")} hint="Niveau à ne jamais atteindre, en unité de stock.">
                <Input id="item-safety" className="h-11" inputMode="decimal" value={v.safetyStock} onChange={(e) => set("safetyStock", e.target.value)} data-testid="item-safety" />
              </FormField>
              <FormField id="item-reorder" label={`Point de commande (en ${unitShort(v.stockUnit)})`} error={err("reorderPoint")} hint="Déclenche le réapprovisionnement, en unité de stock.">
                <Input id="item-reorder" className="h-11" inputMode="decimal" value={v.reorderPoint} onChange={(e) => set("reorderPoint", e.target.value)} data-testid="item-reorder" />
              </FormField>
              <FormField id="item-eoq" label={`Quantité économique (en ${unitShort(v.stockUnit)})`} error={err("economicOrderQty")} hint="Quantité habituelle à commander, en unité de stock.">
                <Input id="item-eoq" className="h-11" inputMode="decimal" value={v.economicOrderQty} onChange={(e) => set("economicOrderQty", e.target.value)} data-testid="item-eoq" />
              </FormField>
            </div>
          </section>
        )}

        <section className="space-y-4 rounded-lg border bg-card p-4" aria-labelledby="item-sec-supply">
          <h2 id="item-sec-supply" className="font-medium">
            Approvisionnement
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField id="item-lead" label="Délai de réapprovisionnement (jours)" error={err("leadTimeDays")}>
              <Input id="item-lead" className="h-11" inputMode="numeric" value={v.leadTimeDays} onChange={(e) => set("leadTimeDays", e.target.value)} data-testid="item-lead" />
            </FormField>
            <FormField
              id="item-main-supplier"
              label="Fournisseur principal"
              error={err("mainSupplierId")}
              hint="Les fournisseurs bloqués ne sont pas proposés."
            >
              <NativeSelect
                id="item-main-supplier"
                value={v.mainSupplierId}
                onChange={(e) => set("mainSupplierId", e.target.value)}
                data-testid="item-main-supplier"
              >
                <option value="">Aucun</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code}){s.status === "EN_EVALUATION" ? " – en évaluation" : ""}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
          <FormField id="item-notes" label="Notes" error={err("notes")}>
            <TextArea id="item-notes" value={v.notes} maxLength={2000} onChange={(e) => set("notes", e.target.value)} data-testid="item-notes" />
          </FormField>
        </section>
      </fieldset>

      {readOnly ? (
        <p className="text-sm text-muted-foreground" data-testid="item-readonly-note">
          Fiche en lecture seule.
        </p>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          {mode === "create" ? (
            <Button type="button" variant="outline" className="h-11 px-4" onClick={() => router.push("/stock/articles")} data-testid="item-cancel">
              Annuler
            </Button>
          ) : null}
          <WriteButton type="submit" className="h-11 px-6" disabled={pending} data-testid="item-save">
            {pending ? "Enregistrement…" : mode === "create" ? "Créer l'article" : "Enregistrer"}
          </WriteButton>
        </div>
      )}
    </form>
  );
}
