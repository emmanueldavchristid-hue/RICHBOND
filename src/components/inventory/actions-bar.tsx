"use client";

import type { InventoryStatus } from "@/modules/inventory/rules";
import { CancelInventoryButton, OpenCountButton } from "./inventory-actions";

/**
 * Actions de l'en-tête d'une fiche d'inventaire selon le statut et les droits.
 * Les boutons de l'état « À valider » (validation, recomptage, annulation) sont dans le panneau de revue.
 */
export function InventoryActionsBar({
  countId,
  number,
  status,
  canCount,
  canCancel,
}: {
  countId: string;
  number: string;
  status: InventoryStatus;
  canCount: boolean;
  canCancel: boolean;
}) {
  if (status === "PREPARE") {
    return (
      <>
        {canCancel ? <CancelInventoryButton countId={countId} number={number} /> : null}
        {canCount ? <OpenCountButton countId={countId} number={number} /> : null}
      </>
    );
  }
  if (status === "EN_COMPTAGE" && canCancel) return <CancelInventoryButton countId={countId} number={number} />;
  return null;
}
