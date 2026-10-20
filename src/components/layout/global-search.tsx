"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Package, Search, ShoppingCart, Truck, type LucideIcon } from "lucide-react";
import { globalSearchAction } from "@/app/(app)/recherche/actions";
import { StatusBadge } from "@/components/status-badge";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { GlobalSearchHit, GlobalSearchKind } from "@/modules/search/schemas";

const KINDS: { kind: GlobalSearchKind; label: string; icon: LucideIcon }[] = [
  { kind: "DA", label: "Demandes d'achat", icon: FileText },
  { kind: "BC", label: "Bons de commande", icon: ShoppingCart },
  { kind: "ARTICLE", label: "Articles", icon: Package },
  { kind: "FOURNISSEUR", label: "Fournisseurs", icon: Truck },
];

const DEBOUNCE_MS = 220;

/** Recherche globale (Ctrl+K) : DA et BC par numéro, articles par code ou désignation, fournisseurs par nom. */
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [state, setState] = useState<{ q: string; hits: GlobalSearchHit[]; error: string | null }>({ q: "", hits: [], error: null });
  const [active, setActive] = useState(0);
  const timer = useRef<number | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const run = useCallback((q: string) => {
    const id = ++seq.current;
    void globalSearchAction({ q }).then((r) => {
      if (id !== seq.current) return;
      setState(r.ok ? { q, hits: r.data, error: null } : { q, hits: [], error: r.message });
      setActive(0);
    });
  }, []);

  function onChange(value: string) {
    setText(value);
    if (timer.current) window.clearTimeout(timer.current);
    const q = value.trim();
    if (q.length < 2) {
      seq.current++;
      setState({ q: "", hits: [], error: null });
      return;
    }
    timer.current = window.setTimeout(() => run(q), DEBOUNCE_MS);
  }

  const q = text.trim();
  const ready = q.length >= 2 && state.q === q;
  const hits = ready ? state.hits : [];
  const ordered = KINDS.flatMap((k) => hits.filter((h) => h.kind === k.kind));

  function go(hit: GlobalSearchHit) {
    setOpen(false);
    router.push(hit.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(ordered.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && ordered[active]) {
      e.preventDefault();
      go(ordered[active]);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Rechercher (Ctrl+K)"
        data-testid="global-search-trigger"
        className="inline-flex h-9 items-center gap-2 rounded-lg border bg-background px-2.5 text-[13px] text-muted-foreground transition-colors hover:border-input hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:w-56"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="hidden flex-1 text-left md:inline">Rechercher…</span>
        <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground md:inline">Ctrl K</kbd>
      </button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setText("");
            setState({ q: "", hits: [], error: null });
          }
        }}
      >
        <DialogContent showCloseButton={false} className="top-[18%] translate-y-0 gap-0 p-0 sm:max-w-xl" data-testid="global-search-dialog">
          <DialogTitle className="sr-only">Recherche globale</DialogTitle>
          <DialogDescription className="sr-only">Saisissez un numéro de DA ou de BC, un code ou une désignation d&apos;article, ou un nom de fournisseur.</DialogDescription>
          <div className="flex items-center gap-2 border-b px-4">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              autoFocus
              value={text}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Numéro de DA ou de BC, article, fournisseur…"
              aria-label="Recherche globale"
              role="combobox"
              aria-expanded={ordered.length > 0}
              aria-controls="global-search-results"
              aria-activedescendant={ordered[active] ? `gs-${ordered[active].kind}-${ordered[active].id}` : undefined}
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              data-testid="global-search-input"
            />
            {q.length >= 2 && !ready ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Recherche en cours" /> : null}
          </div>
          <div id="global-search-results" role="listbox" aria-label="Résultats" className="max-h-96 overflow-y-auto p-2" data-testid="global-search-results">
            {q.length < 2 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Saisissez au moins 2 caractères. Exemples : DA-2026-00012, BC-2026-00003, roulement, nom d&apos;un fournisseur.</p>
            ) : state.error && ready ? (
              <p className="px-3 py-6 text-center text-sm text-red-700">{state.error}</p>
            ) : ready && ordered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground" data-testid="global-search-empty">
                Aucun résultat pour « {q} ».
              </p>
            ) : (
              KINDS.map(({ kind, label, icon: Icon }) => {
                const group = hits.filter((h) => h.kind === kind);
                if (group.length === 0) return null;
                return (
                  <div key={kind} className="mb-1" role="group" aria-label={label}>
                    <p className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">{label}</p>
                    {group.map((h) => {
                      const idx = ordered.indexOf(h);
                      return (
                        <button
                          key={h.id}
                          type="button"
                          role="option"
                          id={`gs-${h.kind}-${h.id}`}
                          aria-selected={idx === active}
                          onMouseMove={() => setActive(idx)}
                          onClick={() => go(h)}
                          data-testid="global-search-result"
                          className={cn("flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm", idx === active ? "bg-muted" : "")}
                        >
                          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="doc-number shrink-0">{h.ref}</span>
                          <span className="min-w-0 flex-1 truncate text-muted-foreground">{h.label}</span>
                          {h.status ? <StatusBadge status={h.status} /> : null}
                        </button>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
