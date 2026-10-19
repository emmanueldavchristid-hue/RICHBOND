"use client";

import { useEffect, useId, useRef, useState, type Ref } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchItemsForRequestAction } from "@/app/(app)/achats/demandes/actions";

export interface ItemHit {
  id: string;
  code: string;
  name: string;
  category: string;
  stockUnit: string;
  purchaseUnit: string;
  conversionFactor: string;
  stocked: boolean;
}

const DEBOUNCE_MS = 250;

/**
 * Recherche d'article au clavier (code ou désignation) : flèches, Entrée pour choisir, Échap pour fermer.
 * Les résultats sont limités aux articles actifs (stockés seulement pour le Magasinier, côté serveur).
 */
export function ItemSearchCombobox({
  onSelect,
  disabled = false,
  placeholder = "Rechercher un article (code ou désignation)",
  testId = "item-search",
  inputRef,
  excludeIds = [],
}: {
  onSelect: (item: ItemHit) => void;
  disabled?: boolean;
  placeholder?: string;
  testId?: string;
  inputRef?: Ref<HTMLInputElement>;
  /** Articles déjà dans la DA : affichés grisés, non sélectionnables. */
  excludeIds?: string[];
}) {
  const listId = useId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<ItemHit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);
  // Fermeture différée au blur : annulée si le champ reprend le focus (sinon elle fermerait la liste rouverte entre-temps).
  const blurTimer = useRef<number | null>(null);
  const cancelBlur = () => {
    if (blurTimer.current !== null) window.clearTimeout(blurTimer.current);
    blurTimer.current = null;
  };

  useEffect(() => {
    if (!open) return;
    const my = ++seq.current;
    const t = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchItemsForRequestAction({ q, limit: 15 });
        if (my !== seq.current) return;
        if (res.ok) {
          setHits(res.data as ItemHit[]);
          setFailed(false);
        } else {
          setHits([]);
          setFailed(true);
        }
        setActive(0);
      } catch {
        if (my === seq.current) setFailed(true);
      } finally {
        if (my === seq.current) setLoading(false);
      }
    }, q === "" ? 0 : DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [q, open]);

  function choose(h: ItemHit | undefined) {
    if (!h || excludeIds.includes(h.id)) return;
    onSelect(h);
    setQ("");
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive((i) => Math.min(i + 1, Math.max(hits.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      // Entrée choisit l'article surligné ; elle ne doit jamais envoyer le formulaire.
      e.preventDefault();
      if (open) choose(hits[active]);
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    }
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground" aria-hidden />
      <Input
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && hits[active] ? `${listId}-${hits[active].id}` : undefined}
        aria-label={placeholder}
        autoComplete="off"
        disabled={disabled}
        value={q}
        placeholder={placeholder}
        className="h-12 pl-9 text-base"
        data-testid={testId}
        onFocus={() => {
          cancelBlur();
          setOpen(true);
        }}
        onBlur={() => {
          cancelBlur();
          blurTimer.current = window.setTimeout(() => setOpen(false), 120);
        }}
        onChange={(e) => {
          cancelBlur();
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border bg-popover p-1 shadow-md"
          data-testid={`${testId}-results`}
        >
          {loading && hits.length === 0 ? <li className="px-3 py-3 text-sm text-muted-foreground">Recherche…</li> : null}
          {failed ? <li className="px-3 py-3 text-sm text-red-700">La recherche a échoué. Réessayez.</li> : null}
          {!loading && !failed && hits.length === 0 ? (
            <li className="px-3 py-3 text-sm text-muted-foreground" data-testid={`${testId}-empty`}>
              Aucun article trouvé.
            </li>
          ) : null}
          {hits.map((h, i) => {
            const already = excludeIds.includes(h.id);
            return (
              <li
                key={h.id}
                id={`${listId}-${h.id}`}
                role="option"
                aria-selected={i === active}
                aria-disabled={already}
                data-testid={`${testId}-option-${h.code}`}
                // mouseDown : le champ ne perd pas le focus avant le choix (tablette comprise).
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(h);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm ${
                  i === active ? "bg-muted" : ""
                } ${already ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <span className="min-w-0">
                  <span className="font-mono text-xs text-muted-foreground">{h.code}</span>
                  <span className="block truncate font-medium">{h.name}</span>
                </span>
                {already ? <span className="shrink-0 text-xs text-muted-foreground">Déjà dans la DA</span> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
