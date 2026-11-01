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
import { formatAmount } from "@/lib/money";
import { IMPORT_MODES, IMPORT_MODE_LABELS, type ImportModeCode } from "@/modules/import-files/labels";
import { createImportFileAction, listEligibleOrdersAction } from "../actions";

const INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"] as const;

interface EligibleOrder {
  id: string;
  number: string | null;
  status: string;
  currencyCode: string;
  totalHt: string;
  totalHtXof: number | null;
  expectedDate: string | null;
}

const INPUT = "h-11";

export function ImportFileForm({ suppliers }: { suppliers: { id: string; label: string; currencyCode: string }[] }) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const [supplierId, setSupplierId] = useState("");
  const [mode, setMode] = useState<ImportModeCode | "">("");
  const [orders, setOrders] = useState<EligibleOrder[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    incoterm: "",
    incotermPlace: "",
    loadingPort: "",
    transitaire: "",
    blNumber: "",
    containerNumber: "",
    customsDeclaration: "",
    customsRegime: "",
    notes: "",
  });
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  async function pickSupplier(id: string) {
    setSupplierId(id);
    setOrders([]);
    setPicked([]);
    setError(null);
    if (!id) return;
    setLoading(true);
    const res = await listEligibleOrdersAction({ supplierId: id }).catch(() => null);
    setLoading(false);
    if (!res || !res.ok) {
      setError(res && !res.ok ? res.message : "Impossible de charger les bons de commande. Réessayez.");
      return;
    }
    setOrders(res.data);
  }

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function submit() {
    setError(null);
    if (!supplierId) return setError("Choisissez le fournisseur.");
    if (!mode) return setError("Choisissez le mode de transport.");
    const res = await run(
      () =>
        createImportFileAction({
          supplierId,
          mode,
          orderIds: picked,
          incoterm: (f.incoterm || null) as never,
          incotermPlace: f.incotermPlace,
          loadingPort: f.loadingPort,
          transitaire: f.transitaire,
          blNumber: f.blNumber,
          containerNumber: f.containerNumber,
          customsDeclaration: f.customsDeclaration,
          customsRegime: f.customsRegime,
          notes: f.notes,
        }),
      { success: (d) => `Dossier ${d.number} créé.`, onError: (e) => setError(e.message), refresh: false },
    );
    if (res?.ok) router.push(`/import/${res.data.id}`);
  }

  const text = (key: keyof typeof f, label: string, hint?: string, testId?: string) => (
    <FormField id={`imp-${key}`} label={label} hint={hint}>
      <Input id={`imp-${key}`} className={INPUT} value={f[key]} onChange={(e) => set(key)(e.target.value)} data-testid={testId ?? `imp-${key}`} />
    </FormField>
  );

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      data-testid="imp-form"
    >
      <FormError message={error} testId="imp-form-error" />

      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-[15px] font-semibold">Expédition</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="imp-supplier" label="Fournisseur" required>
            <NativeSelect id="imp-supplier" value={supplierId} onChange={(e) => void pickSupplier(e.target.value)} data-testid="imp-supplier">
              <option value="">Choisir un fournisseur</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} ({s.currencyCode})
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="imp-mode" label="Mode de transport" required hint="Détermine les coefficients d'approche estimés par défaut.">
            <NativeSelect id="imp-mode" value={mode} onChange={(e) => setMode(e.target.value as ImportModeCode | "")} data-testid="imp-mode">
              <option value="">Choisir le mode</option>
              {IMPORT_MODES.map((m) => (
                <option key={m} value={m}>
                  {IMPORT_MODE_LABELS[m]}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="imp-incoterm" label="Incoterm">
            <NativeSelect id="imp-incoterm" value={f.incoterm} onChange={(e) => set("incoterm")(e.target.value)} data-testid="imp-incoterm">
              <option value="">Non précisé</option>
              {INCOTERMS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          {text("incotermPlace", "Lieu de l'incoterm", "Exemple : Abidjan")}
          {text("loadingPort", "Port ou aéroport de chargement")}
          {text("transitaire", "Transitaire")}
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-[15px] font-semibold">Transport et douane</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {text("blNumber", "N° du connaissement (BL) ou de la LTA")}
          {text("containerNumber", "N° du conteneur")}
          {text("customsDeclaration", "N° de la déclaration en douane")}
          {text("customsRegime", "Régime douanier", "Exemple : mise à la consommation")}
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4" data-testid="imp-orders">
        <h2 className="text-[15px] font-semibold">Bons de commande import</h2>
        <p className="mb-3 mt-1 text-xs text-muted-foreground">Bons validés du fournisseur, pas encore rattachés à un dossier. Vous pourrez en ajouter plus tard.</p>
        {!supplierId ? (
          <p className="text-sm text-muted-foreground">Choisissez d&apos;abord le fournisseur.</p>
        ) : loading ? (
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Chargement…
          </p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="imp-orders-empty">
            Aucun bon de commande import disponible pour ce fournisseur.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {orders.map((o) => (
              <li key={o.id}>
                <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/50" data-testid={`imp-order-${o.number}`}>
                  <input type="checkbox" className="size-5" checked={picked.includes(o.id)} onChange={() => toggle(o.id)} data-testid="imp-order-check" />
                  <span className="doc-number">{o.number}</span>
                  <span className="ml-auto text-sm tabular-nums">{formatAmount(o.totalHt, o.currencyCode, o.currencyCode === "XOF" ? 0 : 2)}</span>
                  {o.currencyCode !== "XOF" && o.totalHtXof !== null ? <span className="text-xs text-muted-foreground tabular-nums">{formatAmount(o.totalHtXof, "XOF", 0)}</span> : null}
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border bg-card p-4">
        <FormField id="imp-notes" label="Remarques">
          <TextArea id="imp-notes" value={f.notes} maxLength={1000} onChange={(e) => set("notes")(e.target.value)} data-testid="imp-notes" />
        </FormField>
      </section>

      <div className="flex flex-wrap justify-end gap-3">
        <Button type="button" variant="outline" className="h-12 px-5 text-base" onClick={() => router.push("/import")}>
          Annuler
        </Button>
        <WriteButton type="submit" className="h-12 px-5 text-base" disabled={pending} data-testid="imp-submit">
          {pending ? <Loader2 className="animate-spin" /> : <Save />} Créer le dossier
        </WriteButton>
      </div>
    </form>
  );
}
