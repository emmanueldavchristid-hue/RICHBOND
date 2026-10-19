import "server-only";
import { formatCommitment } from "@/modules/purchase-requests/duplicates";
import { findOpenOrderCommitments } from "./open-orders";
import type { Tx } from "./internal";
import type { db } from "@/lib/db";

/** Avertissements non bloquants montrés à la saisie et au validateur. */
export interface OrderWarning {
  code: "SUPPLIER_IN_EVALUATION" | "ALREADY_ORDERED" | "RATE_STALE" | "QTY_OVER_REQUEST" | "SUPPLIER_NOT_EVALUATED";
  message: string;
  /** Numéro de ligne concernée, le cas échéant. */
  lineNo?: number;
  /** Article concerné (doublons). */
  itemId?: string;
}

/** « Déjà commandé : BC-2026-00042, 40 U attendues le 12/11 » : BC ouverts sur les mêmes articles (hors le BC lui-même). */
export async function alreadyOrderedWarnings(tx: Tx | typeof db, itemIds: string[], excludeOrderId: string | null): Promise<OrderWarning[]> {
  const commitments = await findOpenOrderCommitments(tx, itemIds, excludeOrderId);
  return commitments.map((c) => ({ code: "ALREADY_ORDERED" as const, message: formatCommitment(c), itemId: c.itemId }));
}
