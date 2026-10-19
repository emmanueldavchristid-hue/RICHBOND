"use client";

import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { Download, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/native-select";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDef {
  /** Nom du paramètre d'URL. */
  param: string;
  label: string;
  /** « select » par défaut. La première option (valeur vide) est le choix par défaut. */
  type?: "select" | "text";
  options?: FilterOption[];
  placeholder?: string;
  maxLength?: number;
}

const DEBOUNCE_MS = 300;

/** Champ texte qui met l'URL à jour 300 ms après la dernière frappe. */
export function DebouncedInput({
  value,
  onCommit,
  ...props
}: {
  value: string;
  onCommit: (value: string) => void;
} & Omit<ComponentProps<typeof Input>, "value" | "onChange">) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  const [committed, setCommitted] = useState(value);

  // L'URL a changé de l'extérieur (retour arrière, réinitialisation) : on recopie, sauf pour notre propre valeur.
  if (value !== seen) {
    setSeen(value);
    if (value !== committed) {
      setText(value);
      setCommitted(value);
    }
  }

  useEffect(() => {
    if (text === committed) return;
    const t = window.setTimeout(() => {
      setCommitted(text);
      onCommit(text.trim());
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [text, committed, onCommit]);

  // Perte de focus (clic sur une ligne, un lien, un bouton) : on valide tout de suite la saisie en attente,
  // sinon le délai de 300 ms ramènerait à la liste après l'ouverture d'une fiche.
  function flush() {
    if (text === committed) return;
    setCommitted(text);
    onCommit(text.trim());
  }

  return <Input {...props} value={text} onChange={(e) => setText(e.target.value)} onBlur={flush} />;
}

/** Téléchargement Excel : mêmes filtres que la liste ; l'erreur (ex. trop de lignes) s'affiche en toast. */
export function ExportButton({ href, query, testId }: { href: string; query: string; testId: string }) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const res = await fetch(query ? `${href}?${query}` : href, { cache: "no-store" });
      if (!res.ok) {
        let message = "L'export a échoué. Réessayez ou contactez l'administrateur.";
        try {
          const body = (await res.json()) as { message?: string };
          if (body.message) message = body.message;
        } catch {
          // corps non JSON : message par défaut
        }
        toast.error(message);
        return;
      }
      const blob = await res.blob();
      const match = /filename="?([^";]+)"?/.exec(res.headers.get("Content-Disposition") ?? "");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = match?.[1] ?? "export.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Export Excel téléchargé.");
    } catch {
      toast.error("La connexion au serveur a échoué. Vérifiez votre réseau puis réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="outline" className="h-11 px-4" disabled={busy} onClick={() => void download()} data-testid={testId}>
      <Download /> {busy ? "Export en cours…" : "Exporter Excel"}
    </Button>
  );
}

export function Toolbar({
  testId,
  searchValue,
  searchPlaceholder,
  onSearch,
  filters,
  getParam,
  onFilter,
  onReset,
  canReset,
  exportButton,
  extra,
}: {
  testId: string;
  searchValue: string;
  searchPlaceholder: string;
  onSearch: (v: string) => void;
  filters: FilterDef[];
  getParam: (p: string) => string;
  onFilter: (param: string, value: string) => void;
  onReset: () => void;
  canReset: boolean;
  exportButton?: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3" data-testid={`${testId}-toolbar`}>
      <div className="relative min-w-60 flex-1">
        <Search className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground" />
        <DebouncedInput
          value={searchValue}
          onCommit={onSearch}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="h-11 pl-9"
          data-testid={`${testId}-search`}
        />
      </div>
      {filters.map((f) =>
        f.type === "text" ? (
          <div key={f.param} className="w-48">
            <DebouncedInput
              value={getParam(f.param)}
              onCommit={(v) => onFilter(f.param, v)}
              placeholder={f.placeholder ?? f.label}
              aria-label={f.label}
              maxLength={f.maxLength}
              className="h-11"
              data-testid={`${testId}-filter-${f.param}`}
            />
          </div>
        ) : (
          <NativeSelect
            key={f.param}
            value={getParam(f.param)}
            onChange={(e) => onFilter(f.param, e.target.value)}
            aria-label={f.label}
            className="w-auto min-w-44"
            data-testid={`${testId}-filter-${f.param}`}
          >
            {(f.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        ),
      )}
      {canReset ? (
        <Button type="button" variant="ghost" className="h-11 px-3" onClick={onReset} data-testid={`${testId}-reset`}>
          <X /> Réinitialiser
        </Button>
      ) : null}
      {exportButton}
      {extra}
    </div>
  );
}
