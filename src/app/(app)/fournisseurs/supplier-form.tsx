"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CodeInput } from "@/components/code-input";
import { FormError, FormField, TextArea } from "@/components/form-field";
import { WriteButton } from "@/components/license/write-button";
import { NativeSelect } from "@/components/native-select";
import { COUNTRIES } from "@/components/referentials/countries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActionRunner } from "@/components/use-action-runner";
import { createSupplierSchema, updateSupplierSchema } from "@/modules/suppliers/schemas";
import { validateNcc } from "@/modules/referentials/codes";
import { INCOTERM_LABELS, ITEM_CATEGORY_LABELS, PAYMENT_TERM_LABELS, SUPPLIER_TYPE_LABELS } from "@/modules/referentials/labels";
import { createSupplierAction, updateSupplierAction } from "./actions";

export interface ContactDraft {
  name: string;
  role: string;
  phone: string;
  email: string;
  isPrimary: boolean;
}

export interface SupplierFormValues {
  code: string;
  name: string;
  type: string;
  country: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  bankDetails: string;
  currencyCode: string;
  ncc: string;
  rccm: string;
  paymentTerm: string;
  paymentTermNote: string;
  incoterm: string;
  leadTimeDays: string;
  categories: string[];
  status: string;
  notes: string;
  contacts: ContactDraft[];
}

export const EMPTY_SUPPLIER: SupplierFormValues = {
  code: "",
  name: "",
  type: "LOCAL",
  country: "CI",
  city: "",
  address: "",
  phone: "",
  email: "",
  bankDetails: "",
  currencyCode: "XOF",
  ncc: "",
  rccm: "",
  paymentTerm: "J30",
  paymentTermNote: "",
  incoterm: "",
  leadTimeDays: "",
  categories: [],
  status: "ACTIF",
  notes: "",
  contacts: [],
};

const EMPTY_CONTACT: ContactDraft = { name: "", role: "", phone: "", email: "", isPrimary: false };

/** Erreurs serveur rattachées à un champ précis. */
const SERVER_FIELD: Record<string, string> = {
  CODE_EXISTS: "code",
  NCC_EXISTS: "ncc",
  CURRENCY_INVALID: "currencyCode",
};

export function SupplierForm({
  mode,
  supplierId,
  updatedAt,
  initial,
  currencies,
  readOnly = false,
  blocked = false,
  codeSlot,
}: {
  mode: "create" | "edit";
  supplierId?: string;
  updatedAt?: string;
  initial: SupplierFormValues;
  currencies: { code: string; name: string }[];
  readOnly?: boolean;
  /** Fournisseur bloqué : le statut ne se change que par « Débloquer ». */
  blocked?: boolean;
  codeSlot?: ReactNode;
}) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const [v, setV] = useState<SupplierFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const set = <K extends keyof SupplierFormValues>(key: K, value: SupplierFormValues[K]) => {
    setV((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const setContact = (i: number, patch: Partial<ContactDraft>) => {
    setV((prev) => {
      const contacts = prev.contacts.map((c, idx) => {
        if (idx === i) return { ...c, ...patch };
        return patch.isPrimary ? { ...c, isPrimary: false } : c;
      });
      return { ...prev, contacts };
    });
    setErrors((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) if (k.startsWith(`contacts.${i}.`)) delete next[k];
      return next;
    });
  };

  const isImport = v.type === "IMPORT";
  const nccCheck = v.ncc.trim() ? validateNcc(v.ncc) : null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const common = {
      name: v.name,
      type: v.type,
      country: v.country,
      city: v.city,
      address: v.address,
      phone: v.phone,
      email: v.email,
      bankDetails: v.bankDetails,
      currencyCode: v.currencyCode,
      ncc: v.ncc,
      rccm: v.rccm,
      paymentTerm: v.paymentTerm,
      paymentTermNote: v.paymentTermNote,
      incoterm: isImport ? v.incoterm : "",
      leadTimeDays: v.leadTimeDays,
      categories: v.categories,
      status: blocked ? "ACTIF" : v.status,
      notes: v.notes,
    };
    const payload =
      mode === "edit"
        ? { id: supplierId, expectedUpdatedAt: updatedAt, ...common }
        : { code: v.code, ...common, contacts: v.contacts };
    const check = (mode === "edit" ? updateSupplierSchema : createSupplierSchema).safeParse(payload);
    if (!check.success) {
      const next: Record<string, string> = {};
      for (const issue of check.error.issues) {
        const key = issue.path.join(".");
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      setFormError("Corrigez les champs signalés en rouge avant d'enregistrer.");
      return;
    }
    const res = await run(() => (mode === "edit" ? updateSupplierAction(payload) : createSupplierAction(payload)), {
      success: mode === "edit" ? "Fournisseur enregistré." : "Fournisseur créé.",
      refresh: mode === "edit",
      onSuccess: (data) => {
        const r = data as { supplier: { id: string }; warnings: string[] };
        for (const w of r.warnings) toast.warning(w, { duration: 15_000 });
        if (mode === "create") router.push(`/fournisseurs/${r.supplier.id}`);
      },
      onError: (f) => {
        const key = SERVER_FIELD[f.code];
        if (key) setErrors({ [key]: f.message });
        else if (f.code !== "CONFLICT") setFormError(f.message);
      },
    });
    if (res && !res.ok && res.code === "CONFLICT") setFormError(res.message);
  }

  const toggleCategory = (c: string) =>
    set("categories", v.categories.includes(c) ? v.categories.filter((x) => x !== c) : [...v.categories, c]);

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6" data-testid="supplier-form">
      <fieldset disabled={readOnly || pending} className="space-y-6">
        <FormError message={formError} testId="supplier-form-error" />

        <section className="space-y-4 rounded-lg border bg-card p-4" aria-labelledby="sup-sec-id">
          <h2 id="sup-sec-id" className="font-medium">
            Identité
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              id="sup-code"
              label="Code fournisseur"
              error={errors.code}
              hint={mode === "create" ? "Laissez vide pour générer automatiquement (FRS-00001). Utilisez le code Sage s'il existe." : "Le code est la clé d'échange avec Sage."}
            >
              <div className="flex gap-2">
                <CodeInput
                  id="sup-code"
                  value={v.code}
                  onChange={(x) => set("code", x)}
                  readOnly={mode === "edit"}
                  placeholder={mode === "create" ? "Généré automatiquement" : undefined}
                  data-testid="supplier-code"
                />
                {mode === "edit" ? codeSlot : null}
              </div>
            </FormField>
            <FormField id="sup-name" label="Raison sociale" required error={errors.name}>
              <Input id="sup-name" className="h-11" value={v.name} maxLength={150} onChange={(e) => set("name", e.target.value)} data-testid="supplier-name" />
            </FormField>
            <FormField id="sup-type" label="Type" required error={errors.type}>
              <NativeSelect
                id="sup-type"
                value={v.type}
                onChange={(e) => {
                  set("type", e.target.value);
                  if (e.target.value === "LOCAL") set("incoterm", "");
                }}
                data-testid="supplier-type"
              >
                {Object.entries(SUPPLIER_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField id="sup-country" label="Pays" required error={errors.country}>
              <NativeSelect id="sup-country" value={v.country} onChange={(e) => set("country", e.target.value)} data-testid="supplier-country">
                {COUNTRIES.some((c) => c.code === v.country) ? null : <option value={v.country}>{v.country}</option>}
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField id="sup-city" label="Ville" error={errors.city}>
              <Input id="sup-city" className="h-11" value={v.city} maxLength={80} onChange={(e) => set("city", e.target.value)} data-testid="supplier-city" />
            </FormField>
            <FormField id="sup-address" label="Adresse" error={errors.address}>
              <Input id="sup-address" className="h-11" value={v.address} maxLength={250} onChange={(e) => set("address", e.target.value)} data-testid="supplier-address" />
            </FormField>
            <FormField id="sup-phone" label="Téléphone général" error={errors.phone}>
              <Input id="sup-phone" className="h-11" type="tel" inputMode="tel" value={v.phone} maxLength={25} onChange={(e) => set("phone", e.target.value)} data-testid="supplier-phone" />
            </FormField>
            <FormField id="sup-email" label="Email général" error={errors.email}>
              <Input id="sup-email" className="h-11" type="email" inputMode="email" value={v.email} maxLength={120} onChange={(e) => set("email", e.target.value)} data-testid="supplier-email" />
            </FormField>
            <FormField id="sup-currency" label="Devise par défaut" required error={errors.currencyCode}>
              <NativeSelect id="sup-currency" value={v.currencyCode} onChange={(e) => set("currencyCode", e.target.value)} data-testid="supplier-currency">
                {currencies.some((c) => c.code === v.currencyCode) ? null : <option value={v.currencyCode}>{v.currencyCode}</option>}
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} – {c.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField id="sup-ncc" label="NCC (n° de compte contribuable)" error={errors.ncc}>
              <Input id="sup-ncc" className="h-11 uppercase" value={v.ncc} maxLength={30} onChange={(e) => set("ncc", e.target.value.toUpperCase())} data-testid="supplier-ncc" />
              {nccCheck && !nccCheck.ok ? (
                <p className="text-sm text-amber-800" data-testid="supplier-ncc-warning">
                  {nccCheck.warning} Vous pouvez tout de même enregistrer.
                </p>
              ) : null}
            </FormField>
            <FormField id="sup-rccm" label="RCCM" error={errors.rccm}>
              <Input id="sup-rccm" className="h-11" value={v.rccm} maxLength={40} onChange={(e) => set("rccm", e.target.value)} data-testid="supplier-rccm" />
            </FormField>
          </div>
        </section>

        <section className="space-y-4 rounded-lg border bg-card p-4" aria-labelledby="sup-sec-terms">
          <h2 id="sup-sec-terms" className="font-medium">
            Conditions
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField id="sup-payment" label="Conditions de paiement" required error={errors.paymentTerm}>
              <NativeSelect id="sup-payment" value={v.paymentTerm} onChange={(e) => set("paymentTerm", e.target.value)} data-testid="supplier-payment">
                {Object.entries(PAYMENT_TERM_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            {v.paymentTerm === "AUTRE" ? (
              <FormField id="sup-payment-note" label="Précision" required error={errors.paymentTermNote}>
                <Input id="sup-payment-note" className="h-11" value={v.paymentTermNote} maxLength={200} onChange={(e) => set("paymentTermNote", e.target.value)} data-testid="supplier-payment-note" />
              </FormField>
            ) : null}
            {isImport ? (
              <FormField id="sup-incoterm" label="Incoterm habituel" error={errors.incoterm} hint="Répartition des frais et risques du transport.">
                <NativeSelect id="sup-incoterm" value={v.incoterm} onChange={(e) => set("incoterm", e.target.value)} data-testid="supplier-incoterm">
                  <option value="">Non précisé</option>
                  {Object.entries(INCOTERM_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
            ) : null}
            <FormField id="sup-lead" label="Délai moyen annoncé (jours)" error={errors.leadTimeDays}>
              <Input id="sup-lead" className="h-11" inputMode="numeric" value={v.leadTimeDays} onChange={(e) => set("leadTimeDays", e.target.value)} data-testid="supplier-lead" />
            </FormField>
            {!blocked ? (
              <FormField id="sup-status" label="Statut" error={errors.status} hint="« En évaluation » : nouveau fournisseur à valider. Le blocage se fait avec le bouton « Bloquer ».">
                <NativeSelect id="sup-status" value={v.status} onChange={(e) => set("status", e.target.value)} data-testid="supplier-status">
                  <option value="ACTIF">Actif</option>
                  <option value="EN_EVALUATION">En évaluation</option>
                </NativeSelect>
              </FormField>
            ) : null}
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Catégories fournies</legend>
            <div className="flex flex-wrap gap-2" data-testid="supplier-categories">
              {Object.entries(ITEM_CATEGORY_LABELS).map(([value, label]) => (
                <label key={value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-muted">
                  <input type="checkbox" className="size-5" checked={v.categories.includes(value)} onChange={() => toggleCategory(value)} data-testid={`supplier-category-${value}`} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <FormField id="sup-bank" label="Banque / RIB" error={errors.bankDetails} hint="Texte libre (banque, n° de compte ou RIB, IBAN/SWIFT pour l'import). Information sensible.">
            <TextArea id="sup-bank" value={v.bankDetails} maxLength={500} onChange={(e) => set("bankDetails", e.target.value)} data-testid="supplier-bank" />
          </FormField>
          <FormField id="sup-notes" label="Notes" error={errors.notes}>
            <TextArea id="sup-notes" value={v.notes} maxLength={2000} onChange={(e) => set("notes", e.target.value)} data-testid="supplier-notes" />
          </FormField>
        </section>

        {mode === "create" ? (
          <section className="space-y-4 rounded-lg border bg-card p-4" aria-labelledby="sup-sec-contacts">
            <div className="flex items-center justify-between">
              <h2 id="sup-sec-contacts" className="font-medium">
                Contacts
              </h2>
              <Button
                type="button"
                variant="outline"
                className="h-11 px-3"
                disabled={v.contacts.length >= 10}
                onClick={() => set("contacts", [...v.contacts, { ...EMPTY_CONTACT, isPrimary: v.contacts.length === 0 }])}
                data-testid="supplier-contact-add"
              >
                <Plus /> Ajouter un contact
              </Button>
            </div>
            {v.contacts.length === 0 ? <p className="text-sm text-muted-foreground">Aucun contact. Vous pourrez en ajouter depuis la fiche.</p> : null}
            {v.contacts.map((c, i) => (
              <div key={i} className="space-y-3 rounded-lg border bg-muted/20 p-3" data-testid={`supplier-contact-${i}`}>
                <div className="grid gap-3 md:grid-cols-2">
                  <FormField id={`ct-name-${i}`} label="Nom" required error={errors[`contacts.${i}.name`]}>
                    <Input id={`ct-name-${i}`} className="h-11" value={c.name} onChange={(e) => setContact(i, { name: e.target.value })} data-testid={`contact-name-${i}`} />
                  </FormField>
                  <FormField id={`ct-role-${i}`} label="Fonction" error={errors[`contacts.${i}.role`]}>
                    <Input id={`ct-role-${i}`} className="h-11" value={c.role} onChange={(e) => setContact(i, { role: e.target.value })} data-testid={`contact-role-${i}`} />
                  </FormField>
                  <FormField id={`ct-phone-${i}`} label="Téléphone" error={errors[`contacts.${i}.phone`]}>
                    <Input id={`ct-phone-${i}`} className="h-11" type="tel" inputMode="tel" value={c.phone} onChange={(e) => setContact(i, { phone: e.target.value })} data-testid={`contact-phone-${i}`} />
                  </FormField>
                  <FormField id={`ct-email-${i}`} label="Email" error={errors[`contacts.${i}.email`]}>
                    <Input id={`ct-email-${i}`} className="h-11" type="email" inputMode="email" value={c.email} onChange={(e) => setContact(i, { email: e.target.value })} data-testid={`contact-email-${i}`} />
                  </FormField>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input type="radio" name="primary-contact" className="size-5" checked={c.isPrimary} onChange={() => setContact(i, { isPrimary: true })} data-testid={`contact-primary-${i}`} />
                    Contact principal
                  </label>
                  <Button
                    type="button"
                    variant="destructive"
                    className="h-11 px-3"
                    onClick={() => set("contacts", v.contacts.filter((_, idx) => idx !== i))}
                    data-testid={`contact-remove-${i}`}
                  >
                    <Trash2 /> Retirer
                  </Button>
                </div>
              </div>
            ))}
          </section>
        ) : null}
      </fieldset>

      {readOnly ? (
        <p className="text-sm text-muted-foreground" data-testid="supplier-readonly-note">
          Fiche en lecture seule.
        </p>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          {mode === "create" ? (
            <Button type="button" variant="outline" className="h-11 px-4" onClick={() => router.push("/fournisseurs")} data-testid="supplier-cancel">
              Annuler
            </Button>
          ) : null}
          <WriteButton type="submit" className="h-11 px-6" disabled={pending} data-testid="supplier-save">
            {pending ? "Enregistrement…" : mode === "create" ? "Créer le fournisseur" : "Enregistrer"}
          </WriteButton>
        </div>
      )}
    </form>
  );
}
