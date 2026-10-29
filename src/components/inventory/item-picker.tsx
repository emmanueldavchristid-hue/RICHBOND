"use client";

import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchInventoryItemsAction } from "@/app/(app)/stock/inventaires/actions";

export interface PickedItem {
  id: string;
  code: string;
  name: string;
  abcClass: string | null;
}

/** Recherche d'un article du dépôt (code ou désignation) à ajouter à la liste d'inventaire. */
export function InventoryItemPicker({
  warehouseId,
  excludeIds,
  onPick,
  disabled,
}: {
  warehouseId: string;
  excludeIds: string[];
  onPick: (item: PickedItem) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PickedItem[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!warehouseId || q.trim().length < 2) return; // les résultats ne s'affichent qu'à partir de 2 lettres
    let cancelled = false;
    const timer = setTimeout(async () => {
      const res = await searchInventoryItemsAction({ warehouseId, q: q.trim() });
      if (!cancelled && res.ok) setHits(res.data as PickedItem[]);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, warehouseId]);

  const visible = hits.filter((h) => !excludeIds.includes(h.id));

  return (
    <div className="relative" data-testid="inv-picker">
      <label htmlFor="inv-picker-input" className="mb-1.5 block text-sm font-medium">
        Ajouter un article
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          id="inv-picker-input"
          className="h-12 pl-9 text-base"
          placeholder="Code ou désignation (2 lettres minimum)"
          autoComplete="off"
          disabled={disabled}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          data-testid="inv-picker-input"
        />
      </div>
      {open && q.trim().length >= 2 ? (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border bg-popover p-1 shadow-md" data-testid="inv-picker-results">
          {visible.length === 0 ? <li className="px-3 py-3 text-sm text-muted-foreground">Aucun article trouvé (ou déjà dans la liste).</li> : null}
          {visible.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onPick(h);
                  setQ("");
                  setHits([]);
                  setOpen(false);
                }}
                data-testid={`inv-picker-option-${h.code}`}
              >
                <Plus className="size-4 shrink-0 text-primary" aria-hidden />
                <span className="doc-number text-muted-foreground">{h.code}</span>
                <span className="min-w-0 flex-1 truncate">{h.name}</span>
                {h.abcClass ? <span className="text-xs text-muted-foreground">Classe {h.abcClass}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
