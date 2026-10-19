import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { db } from "@/lib/db";
import { registerOpenOrderSource, type ItemCommitment, type OpenOrderSource } from "@/modules/purchase-requests/commitments";
import { isoDay } from "./internal";

/** D23 : statuts de BC dont le reste à recevoir est un engagement (les brouillons n'en sont pas). */
export const OPEN_ORDER_STATUSES = ["A_VALIDER", "VALIDE", "ENVOYE", "CONFIRME", "PARTIELLEMENT_RECU"] as const;

type Client = Prisma.TransactionClient | typeof db;

/**
 * BC ouverts sur des articles : numéro, quantité restant à recevoir, unité, date attendue. Contrat de
 * `OpenOrderSource` : jamais de prix ni de fournisseur. `excludeOrderId` : le BC en cours de saisie ne se compte pas lui-même.
 */
export async function findOpenOrderCommitments(client: Client, itemIds: string[], excludeOrderId?: string | null): Promise<ItemCommitment[]> {
  const ids = [...new Set(itemIds)];
  if (ids.length === 0) return [];
  const rows = await client.purchaseOrderLine.findMany({
    where: {
      itemId: { in: ids },
      order: { status: { in: [...OPEN_ORDER_STATUSES] }, ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}) },
    },
    select: {
      itemId: true,
      quantity: true,
      receivedQty: true,
      unit: true,
      order: { select: { id: true, number: true, version: true, expectedDate: true } },
    },
    orderBy: [{ order: { expectedDate: "asc" } }, { id: "asc" }],
  });
  const out: ItemCommitment[] = [];
  for (const r of rows) {
    const left = r.quantity.minus(r.receivedQty);
    if (left.lte(0)) continue;
    out.push({
      source: "BC",
      itemId: r.itemId!,
      documentId: r.order.id,
      // Un BC à valider n'a pas encore de numéro.
      number: r.order.number ? (r.order.version > 1 ? `${r.order.number} v${r.order.version}` : r.order.number) : "",
      qty: left.toString(),
      unit: r.unit,
      date: new Date(`${isoDay(r.order.expectedDate)}T00:00:00.000Z`),
    });
  }
  return out;
}

export const openOrderSource: OpenOrderSource = {
  findOpenOrders: (client, itemIds) => findOpenOrderCommitments(client, itemIds),
};

// Branchement au chargement du module (les DA le chargent à la demande : voir `findAllOpenCommitments`).
registerOpenOrderSource(openOrderSource);
