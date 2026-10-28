"use client";

import { useMemo, useRef, useState } from "react";
import { CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { WriteButton } from "@/components/license/write-button";
import { useLicense } from "@/components/license/license-provider";
import { NativeSelect } from "@/components/native-select";
import { StatusBadge } from "@/components/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { IMPORT_DEFAULT_CATEGORIES, IMPORT_DEFAULT_CATEGORY_LABELS, type ColumnMapping, type ImportSummary, type ImportType, type PreviewResult } from "@/modules/import/types";
import { commitImportAction, previewImportAction } from "./actions";

type Mapping = ColumnMapping;
type Preview = PreviewResult;
type Summary = ImportSummary;
type Outcome = { ok: boolean; preview?: Preview; summary?: Summary; error?: string };

const TYPES: { value: ImportType; label: string; text: string }[] = [
  { value: "ARTICLES", label: "Articles", text: "Référence, désignation, famille, unité…" },
  { value: "FOURNISSEURS", label: "Fournisseurs", text: "Code, intitulé, coordonnées…" },
  { value: "ARTICLE_FOURNISSEUR", label: "Article-Fournisseur", text: "Quel fournisseur vend quel article, à quel prix" },
  { value: "STOCK_INITIAL", label: "Stock initial", text: "Quantités de départ et prix moyen (PMP)" },
];

const cell = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

function readOutcome(raw: unknown): Outcome {
  const r = raw as { ok?: boolean; data?: { preview?: Preview; summary?: Summary }; message?: string } | null;
  if (!r || typeof r !== "object") return { ok: false, error: "Réponse inattendue du serveur." };
  if (!r.ok) return { ok: false, error: r.message ?? "L'opération a échoué." };
  return { ok: true, preview: r.data?.preview, summary: r.data?.summary };
}

export function ImportWizard() {
  const { writable } = useLicense();
  const fileRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<ImportType>("ARTICLES");
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [defaultCategory, setDefaultCategory] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

  const fields = preview?.fields ?? [];
  const labelOf = (key: string) => fields.find((f) => f.key === key)?.label ?? key;

  function buildForm(m: Mapping) {
    const fd = new FormData();
    if (file) fd.set("file", file);
    fd.set("type", type);
    fd.set("mapping", JSON.stringify(m));
    if (type === "ARTICLES" && defaultCategory) fd.set("defaultCategory", defaultCategory);
    return fd;
  }

  async function call(fn: (fd: FormData) => Promise<unknown>, m: Mapping): Promise<Outcome | null> {
    setPending(true);
    setError(null);
    try {
      const out = readOutcome(await fn(buildForm(m)));
      if (!out.ok) {
        const msg = out.error ?? "L'opération a échoué.";
        setError(msg);
        toast.error(msg);
        return null;
      }
      return out;
    } catch {
      const msg = "La connexion au serveur a échoué. Vérifiez votre réseau puis réessayez.";
      setError(msg);
      toast.error(msg);
      return null;
    } finally {
      setPending(false);
    }
  }

  async function analyse() {
    if (!file) {
      setError("Choisissez d'abord un fichier .xlsx ou .csv.");
      return;
    }
    const out = await call(previewImportAction, {});
    if (out?.preview) {
      setPreview(out.preview);
      setMapping(out.preview.mapping);
      setStep(2);
    }
  }

  async function applyMapping() {
    const out = await call(previewImportAction, mapping);
    if (out?.preview) {
      setPreview(out.preview);
      setStep(3);
    }
  }

  async function commit() {
    setConfirmOpen(false);
    const out = await call(commitImportAction, mapping);
    if (out?.summary) {
      setSummary(out.summary);
      setStep(4);
      toast.success("Import terminé.");
    }
  }

  function restart() {
    setFile(null);
    setPreview(null);
    setSummary(null);
    setMapping({});
    setDefaultCategory("");
    setError(null);
    setErrorsOnly(false);
    if (fileRef.current) fileRef.current.value = "";
    setStep(1);
  }

  const rows = preview ? (errorsOnly ? preview.rows.filter((r) => r.status === "ERREUR") : preview.rows) : [];
  const dataCols = useMemo(() => {
    const keys = new Set<string>();
    for (const r of preview?.rows.slice(0, 50) ?? []) Object.keys(r.data).forEach((k) => keys.add(k));
    return [...keys];
  }, [preview]);
  const batch = summary?.batchId;
  const stepLabels = ["Fichier", "Colonnes", "Aperçu", "Résultat"];

  return (
    <div className="space-y-4" data-testid="import-page">
      <ol className="flex flex-wrap gap-2 text-sm" data-testid="import-steps">
        {stepLabels.map((l, i) => (
          <li
            key={l}
            data-testid={`import-step-${i + 1}`}
            aria-current={step === i + 1 ? "step" : undefined}
            className={cn(
              "rounded-full border px-3 py-1.5",
              step === i + 1 ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground",
            )}
          >
            {i + 1}. {l}
          </li>
        ))}
      </ol>

      {!writable ? (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" data-testid="import-readonly">
          La période d&apos;essai est terminée : l&apos;application est en lecture seule. Vous pouvez analyser un fichier, mais l&apos;import des lignes est désactivé.
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" data-testid="import-error">
          {error}
        </div>
      ) : null}

      {step === 1 ? (
        <section className="space-y-5 rounded-lg border bg-card p-5" data-testid="import-step-file">
          <div>
            <h2 className="mb-2 font-medium">1. Que voulez-vous importer ?</h2>
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Type de données">
              {TYPES.map((t) => (
                <label
                  key={t.value}
                  className={cn(
                    "flex min-h-16 cursor-pointer flex-col justify-center rounded-lg border p-4 hover:bg-muted",
                    type === t.value && "border-primary bg-primary/5 ring-1 ring-primary",
                  )}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <input
                      type="radio"
                      name="import-type"
                      className="size-5"
                      checked={type === t.value}
                      onChange={() => setType(t.value)}
                      data-testid={`import-type-${t.value}`}
                    />
                    {t.label}
                  </span>
                  <span className="pl-7 text-sm text-muted-foreground">{t.text}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href={`/parametres/import/modele?type=${type}`}
              download
              data-testid="import-template"
              className={cn(buttonVariants({ variant: "outline" }), "h-11 px-4")}
            >
              <Download /> Télécharger le modèle Excel
            </a>
            <span className="text-sm text-muted-foreground">Remplissez-le (ou copiez vos colonnes Sage), puis téléversez-le ci-dessous.</span>
          </div>

          <div>
            <h2 className="mb-2 font-medium">2. Votre fichier (.xlsx ou .csv)</h2>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.csv"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                data-testid="import-file"
              />
              <Button type="button" variant="outline" className="h-12 px-5" onClick={() => fileRef.current?.click()} data-testid="import-file-pick">
                <FileSpreadsheet /> Choisir un fichier
              </Button>
              <span className="text-sm" data-testid="import-file-name">
                {file ? file.name : "Aucun fichier choisi"}
              </span>
            </div>
          </div>

          <Button type="button" className="h-12 px-6" disabled={!file || pending} onClick={() => void analyse()} data-testid="import-analyse">
            <Upload /> {pending ? "Analyse en cours…" : "Analyser le fichier"}
          </Button>
        </section>
      ) : null}

      {step === 2 && preview ? (
        <section className="space-y-4 rounded-lg border bg-card p-5" data-testid="import-step-mapping">
          <div>
            <h2 className="font-medium">Correspondance des colonnes</h2>
            <p className="text-sm text-muted-foreground">
              Nous avons deviné la colonne de votre fichier pour chaque information. Corrigez si besoin. Les champs laissés vides ne seront pas importés.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {fields.map((f) => (
              <label key={f.key} className="space-y-1 text-sm">
                <span className="font-medium">
                  {f.label} {f.required ? <span className="text-red-700">(obligatoire)</span> : null}
                </span>
                <NativeSelect
                  value={mapping[f.key] ?? ""}
                  onChange={(e) => setMapping((p) => ({ ...p, [f.key]: e.target.value || null }))}
                  data-testid={`import-map-${f.key}`}
                >
                  <option value="">— Ne pas importer —</option>
                  {preview.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            ))}
            {type === "ARTICLES" ? (
              <label className="space-y-1 text-sm md:col-span-2">
                <span className="font-medium">Catégorie par défaut pour les lignes sans catégorie</span>
                <NativeSelect
                  value={defaultCategory}
                  onChange={(e) => setDefaultCategory(e.target.value)}
                  data-testid="import-default-category"
                >
                  <option value="">— Aucune : une ligne sans catégorie est refusée —</option>
                  {IMPORT_DEFAULT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {IMPORT_DEFAULT_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </NativeSelect>
                <span className="block text-muted-foreground">
                  S&apos;applique si la colonne Catégorie n&apos;est pas associée ou si la cellule est vide (un export Sage n&apos;a pas de catégorie).
                </span>
              </label>
            ) : null}
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <Button type="button" variant="outline" className="h-11 px-4" onClick={restart}>
              Changer de fichier
            </Button>
            <Button type="button" className="h-11 px-5" disabled={pending} onClick={() => void applyMapping()} data-testid="import-preview">
              {pending ? "Contrôle en cours…" : "Contrôler les lignes"}
            </Button>
          </div>
        </section>
      ) : null}

      {step === 3 && preview ? (
        <section className="space-y-4 rounded-lg border bg-card p-5" data-testid="import-step-preview">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-medium">Aperçu avant import</h2>
            <StatusBadge tone="success" label={`${preview.okCount} lignes valides`} />
            <StatusBadge tone={preview.errorCount > 0 ? "danger" : "neutral"} label={`${preview.errorCount} en erreur`} />
            <span className="sr-only" data-testid="import-count-ok">{preview.okCount}</span>
            <span className="sr-only" data-testid="import-count-error">{preview.errorCount}</span>
            <label className="ml-auto flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-5"
                checked={errorsOnly}
                onChange={(e) => setErrorsOnly(e.target.checked)}
                data-testid="import-errors-only"
              />
              Erreurs seulement
            </label>
          </div>
          <p className="text-sm text-muted-foreground">
            Seules les lignes valides seront importées. Les lignes en erreur sont ignorées : corrigez-les dans votre fichier puis ré-importez-le (les codes déjà créés sont mis à jour, sans doublon).
          </p>

          <div className="max-h-[28rem] overflow-auto rounded-lg border">
            <table className="w-full text-sm" data-testid="import-table">
              <thead className="sticky top-0 border-b bg-card text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="p-3">Ligne</th>
                  <th className="p-3">Statut</th>
                  {dataCols.map((c) => (
                    <th key={c} className="p-3">
                      {labelOf(c)}
                    </th>
                  ))}
                  <th className="p-3">Problèmes</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={dataCols.length + 3} className="p-6 text-center text-muted-foreground">
                      {errorsOnly ? "Aucune erreur : toutes les lignes sont valides." : "Aucune ligne dans le fichier."}
                    </td>
                  </tr>
                ) : null}
                {rows.map((r) => (
                  <tr key={r.line} className={cn("border-t align-top", r.status === "ERREUR" && "bg-red-50/60")} data-testid={`import-row-${r.line}`}>
                    <td className="p-3 tabular-nums">{r.line}</td>
                    <td className="p-3">
                      <StatusBadge tone={r.status === "OK" ? "success" : "danger"} label={r.status === "OK" ? "Valide" : "Erreur"} />
                    </td>
                    {dataCols.map((c) => (
                      <td key={c} className="p-3">
                        {cell(r.data[c])}
                      </td>
                    ))}
                    <td className="p-3" data-testid="import-row-errors">
                      {r.errors.length ? <span className="text-red-800">{r.errors.join(" ; ")}</span> : null}
                      {r.warnings?.length ? <span className="block text-amber-800">{r.warnings.join(" ; ")}</span> : null}
                      {r.status === "OK" && r.action ? (
                        <span className="text-muted-foreground">{r.action === "CREATE" ? "Sera créé" : r.action === "UPDATE" ? "Sera mis à jour" : "Déjà à jour"}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap justify-between gap-2">
            <Button type="button" variant="outline" className="h-11 px-4" onClick={() => setStep(2)}>
              Retour aux colonnes
            </Button>
            <WriteButton
              type="button"
              className="h-12 px-6"
              disabled={pending || preview.okCount === 0}
              onClick={() => setConfirmOpen(true)}
              data-testid="import-commit"
            >
              <CheckCircle2 /> Importer les lignes valides ({preview.okCount})
            </WriteButton>
          </div>
        </section>
      ) : null}

      {step === 4 && summary ? (
        <section className="space-y-4 rounded-lg border bg-card p-5" data-testid="import-step-result">
          <h2 className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="size-5 text-green-600" /> Import terminé
          </h2>
          <ul className="space-y-1 text-sm" data-testid="import-summary">
            <li>Fichier : <strong>{summary.fileName}</strong> ({summary.totalRows} lignes)</li>
            <li>Créés : <strong>{summary.created}</strong></li>
            <li>Mis à jour : <strong>{summary.updated}</strong></li>
            <li>Déjà à jour (sans effet) : <strong>{summary.unchanged}</strong></li>
            <li>Lignes en erreur, non importées : <strong>{summary.errorCount}</strong></li>
          </ul>
          <div className="flex flex-wrap gap-2">
            {batch ? (
              <a
                href={`/parametres/import/rapport?batch=${encodeURIComponent(batch)}`}
                download
                data-testid="import-report"
                className={cn(buttonVariants({ variant: "outline" }), "h-11 px-4")}
              >
                <Download /> Télécharger le rapport
              </a>
            ) : null}
            <Button type="button" className="h-11 px-4" onClick={restart} data-testid="import-restart">
              Faire un autre import
            </Button>
          </div>
        </section>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Importer les lignes valides ?"
        description={`${preview?.okCount ?? 0} lignes vont être créées ou mises à jour. Les ${preview?.errorCount ?? 0} lignes en erreur seront ignorées. L'import est tracé dans le journal.`}
        confirmLabel="Oui, importer"
        pending={pending}
        testId="import-confirm"
        onConfirm={commit}
      />
    </div>
  );
}
