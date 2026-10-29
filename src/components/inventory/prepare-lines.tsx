"use client";

import { Trash2 } from "lucide-react";
import { addInventoryLinesAction, removeInventoryLineAction } from "@/app/(app)/stock/inventaires/actions";
import { WriteButton } from "@/components/license/write-button";
import { useActionRunner } from "@/components/use-action-runner";
import type { SelectionReason } from "@/modules/inventory/rules";
import { InventoryItemPicker } from "./item-picker";
import { SELECTION_REASON_LABELS } from "./labels";

export interface PrepareLine {
  id: string;
  itemId: string;
  code: string;
  name: string;
  reason: SelectionReason;
}

/** Liste d'un inventaire « Préparé » : le Responsable ajoute ou retire des articles avant l'ouverture du comptage. */
export function PrepareLines({ countId, warehouseId, lines, canEdit }: { countId: string; warehouseId: string; lines: PrepareLine[]; canEdit: boolean }) {
  const { run, pending } = useActionRunner();
  return (
    <section className="space-y-3" aria-labelledby="inv-lines-title" data-testid="inv-prepare-lines">
      <h2 id="inv-lines-title" className="text-[15px] font-semibold">
        Articles à compter ({lines.length})
      </h2>
      {canEdit ? (
        <InventoryItemPicker
          warehouseId={warehouseId}
          excludeIds={lines.map((l) => l.itemId)}
          disabled={pending}
          onPick={(h) => void run(() => addInventoryLinesAction({ countId, itemIds: [h.id] }), { success: `${h.code} ajouté à la liste.` })}
        />
      ) : null}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[32rem] text-sm">
          <thead className="text-left text-xs font-medium text-muted-foreground">
            <tr className="border-b">
              <th className="h-10 px-3">Article</th>
              <th className="px-3">Pourquoi</th>
              {canEdit ? (
                <th className="w-20 px-3">
                  <span className="sr-only">Retirer</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y">
            {lines.map((l) => (
              <tr key={l.id} className="h-12" data-testid={`inv-line-${l.code}`}>
                <td className="px-3">
                  <span className="doc-number text-muted-foreground">{l.code}</span> {l.name}
                </td>
                <td className="px-3 text-muted-foreground">{SELECTION_REASON_LABELS[l.reason]}</td>
                {canEdit ? (
                  <td className="px-3 text-right">
                    <WriteButton
                      variant="ghost"
                      className="size-11"
                      aria-label={`Retirer ${l.name}`}
                      disabled={pending || lines.length <= 1}
                      onClick={() => void run(() => removeInventoryLineAction({ countId, lineId: l.id }), { success: `${l.code} retiré de la liste.` })}
                      data-testid={`inv-line-remove-${l.code}`}
                    >
                      <Trash2 />
                    </WriteButton>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
