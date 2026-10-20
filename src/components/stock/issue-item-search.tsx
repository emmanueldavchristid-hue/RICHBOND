"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { unitShort } from "@/components/unit-select";
import { formatQty } from "@/lib/money";
import { searchIssueItemsAction } from "@/app/(app)/stock/sorties/actions";
import type { IssueItemHit } from "./types";

const DEBOUNCE_MS = 250;

/** Recherche d'article pour une sortie : code ou désignation, avec le stock disponible au dépôt choisi. */
export function IssueItemSearch({
  warehouseId,
  excludeIds,
  disabled,
  onSelect,
}: {
  warehouseId: string;
  excludeIds: string[];
  disabled?: boolean;
  onSelect: (hit: IssueItemHit) => void;
}) {
  const listId = useId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<IssueItemHit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);
  const blurTimer = useRef<number | null>(null);
  const cancelBlur = () => {
    if (blurTimer.current !== null) window.clearTimeout(blurTimer.current);
    blurTimer.current = null;
  };

  useEffect(() => {
    if (!open || !warehouseId) return;
    const my = ++seq.current;
    const t = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchIssueItemsAction({ q, warehouseId, limit: 15 });
        if (my !== seq.current) return;
        if (res.ok) {
          setHits(res.data as IssueItemHit[]);
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
  }, [q, open, warehouseId]);

  function choose(h: IssueItemHit | undefined) {
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
      e.preventDefault();
      if (open) choose(hits[active]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-4 left-3 size-4 text-muted-foreground" aria-hidden />
      <Input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label="Rechercher un article à sortir (code ou désignation)"
        autoComplete="off"
        disabled={disabled}
        value={q}
        placeholder="Rechercher un article à sortir (code ou désignation)"
        className="h-12 pl-9 text-base"
        data-testid="sor-item-search"
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
        <ul id={listId} role="listbox" className="absolute z-30 mt-1 max-h-80 w-full overflow-auto rounded-lg border bg-popover p-1 shadow-md" data-testid="sor-item-search-results">
          {loading && hits.length === 0 ? <li className="px-3 py-3 text-sm text-muted-foreground">Recherche…</li> : null}
          {failed ? <li className="px-3 py-3 text-sm text-red-700">La recherche a échoué. Réessayez.</li> : null}
          {!loading && !failed && hits.length === 0 ? (
            <li className="px-3 py-3 text-sm text-muted-foreground" data-testid="sor-item-search-empty">
              Aucun article trouvé dans ce dépôt.
            </li>
          ) : null}
          {hits.map((h, i) => {
            const already = excludeIds.includes(h.id);
            const none = Number(h.available) <= 0;
            return (
              <li
                key={h.id}
                id={`${listId}-${h.id}`}
                role="option"
                aria-selected={i === active}
                aria-disabled={already}
                data-testid={`sor-item-option-${h.code}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(h);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm ${i === active ? "bg-muted" : ""} ${already ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <span className="min-w-0">
                  <span className="doc-number text-muted-foreground">{h.code}</span>
                  <span className="block truncate font-medium">{h.name}</span>
                </span>
                <span className={`shrink-0 text-right tabular-nums ${none ? "text-red-700 dark:text-red-400" : "text-muted-foreground"}`}>
                  {already ? "Déjà ajouté" : `${formatQty(h.available)} ${unitShort(h.stockUnit)} dispo`}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
