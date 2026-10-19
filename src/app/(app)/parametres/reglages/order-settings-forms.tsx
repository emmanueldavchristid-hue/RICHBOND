"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormError, FormField, TextArea } from "@/components/form-field";
import { WriteButton } from "@/components/license/write-button";
import { NativeSelect } from "@/components/native-select";
import { Input } from "@/components/ui/input";
import { useActionRunner } from "@/components/use-action-runner";
import { formatFcfa } from "@/lib/money";
import { removeLogoAction, updateSettingAction, uploadLogoAction } from "./actions";

export interface CompanyValues {
  name: string;
  address: string;
  phone: string;
  email: string;
  legalIds: string;
  pdfFooter: string;
  pdfConditions: string;
}

/** Enregistre successivement les réglages modifiés ; s'arrête à la première erreur. */
async function saveKeys(
  changes: { key: string; value: unknown }[],
  run: ReturnType<typeof useActionRunner>["run"],
  onFail: (message: string) => void,
): Promise<boolean> {
  for (const c of changes) {
    const res = await run(() => updateSettingAction(c), { refresh: false, onError: (f) => onFail(f.message) });
    if (!res?.ok) return false;
  }
  return true;
}

/** D29 : coordonnées imprimées en en-tête et en pied du PDF des bons de commande. */
export function CompanyForm({ initial }: { initial: CompanyValues }) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const [v, setV] = useState<CompanyValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof CompanyValues, val: string) => setV((p) => ({ ...p, [k]: val }));
  const keyOf: Record<keyof CompanyValues, string> = {
    name: "company.name",
    address: "company.address",
    phone: "company.phone",
    email: "company.email",
    legalIds: "company.legalIds",
    pdfFooter: "purchaseOrder.pdfFooter",
    pdfConditions: "purchaseOrder.pdfConditions",
  };
  const changed = (Object.keys(keyOf) as (keyof CompanyValues)[]).filter((k) => v[k].trim() !== initial[k]);

  async function save() {
    setError(null);
    if (v.name.trim().length < 2) return setError("La raison sociale est obligatoire (2 caractères minimum).");
    const ok = await saveKeys(
      changed.map((k) => ({ key: keyOf[k], value: v[k].trim() })),
      run,
      setError,
    );
    if (ok) {
      toast.success("Coordonnées de la société enregistrées.");
      router.refresh();
    }
  }

  return (
    <form
      className="max-w-2xl space-y-4 rounded-lg border bg-card p-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      data-testid="company-form"
    >
      <div>
        <h2 className="font-medium">Société et bons de commande (PDF)</h2>
        <p className="mt-1 text-sm text-muted-foreground">Ces informations sont imprimées sur chaque bon de commande : en-tête, pied de page et conditions d&apos;achat.</p>
      </div>
      <FormError message={error} testId="company-error" />
      <FormField id="company-name" label="Raison sociale" required>
        <Input id="company-name" className="h-11" maxLength={100} value={v.name} onChange={(e) => set("name", e.target.value)} data-testid="company-name" />
      </FormField>
      <FormField id="company-address" label="Adresse">
        <TextArea id="company-address" className="min-h-16" maxLength={300} value={v.address} onChange={(e) => set("address", e.target.value)} data-testid="company-address" />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="company-phone" label="Téléphone">
          <Input id="company-phone" className="h-11" maxLength={60} value={v.phone} onChange={(e) => set("phone", e.target.value)} data-testid="company-phone" />
        </FormField>
        <FormField id="company-email" label="E-mail">
          <Input id="company-email" type="email" className="h-11" maxLength={100} value={v.email} onChange={(e) => set("email", e.target.value)} data-testid="company-email" />
        </FormField>
      </div>
      <FormField id="company-legal" label="NCC, RCCM…" hint="Texte libre, imprimé en en-tête.">
        <Input id="company-legal" className="h-11" maxLength={300} value={v.legalIds} onChange={(e) => set("legalIds", e.target.value)} data-testid="company-legal" />
      </FormField>
      <FormField id="company-footer" label="Pied de page du bon de commande">
        <Input id="company-footer" className="h-11" maxLength={300} value={v.pdfFooter} onChange={(e) => set("pdfFooter", e.target.value)} data-testid="company-footer" />
      </FormField>
      <FormField id="company-conditions" label="Conditions générales d'achat" hint="Imprimées au bas du bon (1000 caractères maximum).">
        <TextArea id="company-conditions" className="min-h-24" maxLength={1000} value={v.pdfConditions} onChange={(e) => set("pdfConditions", e.target.value)} data-testid="company-conditions" />
      </FormField>
      <div className="flex justify-end">
        <WriteButton type="submit" className="h-11 px-6" disabled={changed.length === 0 || pending} data-testid="company-save">
          {pending ? "Enregistrement…" : "Enregistrer"}
        </WriteButton>
      </div>
    </form>
  );
}

/** D29 : logo PNG ou JPEG (1 Mo maximum) imprimé en en-tête des bons de commande. */
export function LogoForm({ hasLogo, version }: { hasLogo: boolean; version: number }) {
  const { run, pending } = useActionRunner();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  async function upload(file: File) {
    setError(null);
    if (file.size > 1024 * 1024) return setError("Le logo dépasse 1 Mo : réduisez-le avant de l'envoyer.");
    if (file.type !== "image/png" && file.type !== "image/jpeg") return setError("Format non accepté : utilisez une image PNG ou JPEG.");
    const fd = new FormData();
    fd.set("file", file);
    await run(() => uploadLogoAction(fd), { success: "Logo enregistré.", onError: (f) => setError(f.message) });
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <section className="max-w-2xl space-y-4 rounded-lg border bg-card p-5" data-testid="logo-form">
      <div>
        <h2 className="font-medium">Logo de la société</h2>
        <p className="mt-1 text-sm text-muted-foreground">Image PNG ou JPEG, 1 Mo maximum. Il apparaît en haut de chaque bon de commande PDF.</p>
      </div>
      <FormError message={error} testId="logo-error" />
      {hasLogo ? (
        <div className="flex items-center gap-4 rounded-lg border p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- image privée servie par une route protégée */}
          <img src={`/api/branding/logo?v=${version}`} alt="Logo actuel de la société" className="h-16 max-w-48 object-contain" data-testid="logo-preview" />
          <span className="text-sm text-muted-foreground">Logo actuel</span>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="logo-none">
          Aucun logo : le bon de commande n&apos;affichera que la raison sociale.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <input
          ref={fileRef}
          id="logo-file"
          type="file"
          accept="image/png,image/jpeg"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
          data-testid="logo-file"
        />
        <WriteButton type="button" variant="outline" className="h-11 px-4" disabled={pending} onClick={() => fileRef.current?.click()} data-testid="logo-upload">
          <ImageUp /> {hasLogo ? "Remplacer le logo" : "Choisir un logo"}
        </WriteButton>
        {hasLogo ? (
          <WriteButton type="button" variant="ghost" className="h-11 px-4 text-red-700" disabled={pending} onClick={() => setRemoving(true)} data-testid="logo-remove">
            <Trash2 /> Retirer le logo
          </WriteButton>
        ) : null}
      </div>
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title="Retirer le logo ?"
        description="Les prochains PDF n'afficheront plus de logo. Les bons déjà téléchargés ne changent pas."
        confirmLabel="Retirer le logo"
        destructive
        pending={pending}
        testId="logo-remove-dialog"
        onConfirm={async () => {
          await run(() => removeLogoAction({}), { success: "Logo retiré.", onSuccess: () => setRemoving(false), onError: () => setRemoving(false) });
        }}
      />
    </section>
  );
}

export interface OrderRulesValues {
  approvalThreshold: number;
  defaultVatRate: number;
  priceAlertPct: number;
  reminderAfterDays: number;
}

const toNum = (s: string) => Number(s.trim().replace(",", "."));

/** Règles de gestion des bons de commande : seuil de validation, TVA par défaut, alerte de prix, délai de relance. */
export function OrderRulesForm({ initial }: { initial: OrderRulesValues }) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const [threshold, setThreshold] = useState(String(initial.approvalThreshold));
  const [vat, setVat] = useState(String(initial.defaultVatRate));
  const [alertPct, setAlertPct] = useState(String(initial.priceAlertPct));
  const [days, setDays] = useState(String(initial.reminderAfterDays));
  const [error, setError] = useState<string | null>(null);

  const changes = [
    { key: "purchaseOrder.approvalThreshold", value: toNum(threshold || "0"), dirty: toNum(threshold || "0") !== initial.approvalThreshold },
    { key: "purchaseOrder.defaultVatRate", value: Number(vat), dirty: Number(vat) !== initial.defaultVatRate },
    { key: "purchaseOrder.priceAlertPct", value: toNum(alertPct || "0"), dirty: toNum(alertPct || "0") !== initial.priceAlertPct },
    { key: "purchaseOrder.reminderAfterDays", value: toNum(days || "0"), dirty: toNum(days || "0") !== initial.reminderAfterDays },
  ].filter((c) => c.dirty);

  async function save() {
    setError(null);
    if (!Number.isInteger(toNum(threshold || "0")) || toNum(threshold || "0") < 0) return setError("Le seuil est un montant entier en FCFA (0 = tous les bons passent par le Responsable).");
    const ok = await saveKeys(
      changes.map(({ key, value }) => ({ key, value })),
      run,
      setError,
    );
    if (ok) {
      toast.success("Règles des bons de commande enregistrées.");
      router.refresh();
    }
  }

  return (
    <form
      className="max-w-2xl space-y-4 rounded-lg border bg-card p-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      data-testid="order-rules-form"
    >
      <div>
        <h2 className="font-medium">Règles des bons de commande</h2>
        <p className="mt-1 text-sm text-muted-foreground">Contrôles appliqués à la saisie, à la validation et au suivi des livraisons.</p>
      </div>
      <FormError message={error} testId="order-rules-error" />
      <FormField
        id="rule-threshold"
        label="Seuil de validation automatique (FCFA TTC)"
        hint={`0 = chaque bon passe par le Responsable Achats. Au-dessous d'un seuil renseigné, le bon d'un acheteur est validé dès sa soumission.${toNum(threshold || "0") > 0 ? ` Soit ${formatFcfa(Math.trunc(toNum(threshold)))}.` : ""}`}
      >
        <Input id="rule-threshold" inputMode="numeric" className="h-11 max-w-xs text-right text-base" value={threshold} onChange={(e) => setThreshold(e.target.value.replace(/\D/g, ""))} data-testid="rule-threshold" />
      </FormField>
      <FormField id="rule-vat" label="TVA proposée par défaut (bons locaux)" hint="Les bons d'import sont proposés à 0 %.">
        <NativeSelect id="rule-vat" className="max-w-xs" value={vat} onChange={(e) => setVat(e.target.value)} data-testid="rule-vat">
          <option value="0">0 %</option>
          <option value="9">9 %</option>
          <option value="18">18 %</option>
        </NativeSelect>
      </FormField>
      <FormField id="rule-alert" label="Alerte de prix (%)" hint="Le Responsable est alerté quand un prix dépasse le dernier prix d'achat de plus de ce pourcentage.">
        <Input id="rule-alert" inputMode="decimal" className="h-11 max-w-xs text-right text-base" value={alertPct} onChange={(e) => setAlertPct(e.target.value.replace(/[^\d.,]/g, ""))} data-testid="rule-alert" />
      </FormField>
      <FormField id="rule-days" label="Relance : jours ouvrés sans confirmation" hint="Un bon envoyé et non confirmé depuis ce nombre de jours ouvrés est signalé « À relancer ».">
        <Input id="rule-days" inputMode="numeric" className="h-11 max-w-xs text-right text-base" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} data-testid="rule-days" />
      </FormField>
      <div className="flex justify-end">
        <WriteButton type="submit" className="h-11 px-6" disabled={changes.length === 0 || pending} data-testid="order-rules-save">
          {pending ? "Enregistrement…" : "Enregistrer"}
        </WriteButton>
      </div>
    </form>
  );
}
