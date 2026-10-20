"use client";

import { RefreshCw } from "lucide-react";
import { WriteButton } from "@/components/license/write-button";
import { useActionRunner } from "@/components/use-action-runner";
import { recomputeAbcAction } from "@/app/(app)/stock/reappro/actions";
import type { AbcResult } from "@/modules/stock/types";

/** « Recalculer » la classe ABC (Responsable) : valeur sortie sur 12 mois, à la demande. */
export function AbcRecomputeButton() {
  const { run, pending } = useActionRunner();
  return (
    <WriteButton
      variant="outline"
      className="h-11 px-4"
      disabled={pending}
      title="Recalcule la classe ABC d'après la valeur sortie sur 12 mois"
      onClick={() =>
        run(() => recomputeAbcAction({}), {
          success: (d: AbcResult) => `Classe ABC recalculée : ${d.A} A, ${d.B} B, ${d.C} C.`,
        })
      }
      data-testid="stk-abc-recompute"
    >
      <RefreshCw /> Recalculer l&apos;ABC
    </WriteButton>
  );
}
