import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { can, canViewOrder, type RequestActor } from "@/lib/permissions";
import { PO_COUNTED_STATUSES, PO_RELEASED_STATUSES, displayOrderNumber, type PoStatus } from "@/modules/purchase-orders/labels";

/**
 * LOT-05 (D22) : ce que les BC ont déjà pris sur une DA, pour la fiche DA (« Commandé / Reste », « Commandes liées »)
 * et pour l'action `createOrder`. Les brouillons de BC réservent la quantité (reste à commander) mais ne changent pas le statut.
 */
export interface LineOrderQuantities {
  lineId: string;
  /** Réservé par tous les BC non refusés/annulés, brouillons compris (unité de la ligne de DA). */
  reservedQty: Prisma.Decimal;
  /** Commandé : BC validés et au-delà. */
  orderedQty: Prisma.Decimal;
  /** Reste à commander = besoin - réservé (jamais négatif). */
  remainingQty: Prisma.Decimal;
}

export interface LinkedOrder {
  id: string;
  number: string | null;
  displayNumber: string;
  version: number;
  status: PoStatus;
  /** Quantité de cette DA rattachée au BC, par ligne de DA. */
  lines: { requestLineId: string; qty: Prisma.Decimal }[];
}

type Client = Pick<Prisma.TransactionClient, "purchaseOrderLineAllocation">;

export async function requestOrderQuantities(
  client: Client,
  lines: { id: string; quantity: Prisma.Decimal; approvedQty: Prisma.Decimal | null }[],
): Promise<Map<string, LineOrderQuantities>> {
  const rows = await client.purchaseOrderLineAllocation.findMany({
    where: { requestLineId: { in: lines.map((l) => l.id) }, orderLine: { order: { status: { notIn: [...PO_RELEASED_STATUSES] } } } },
    select: { requestLineId: true, qty: true, orderLine: { select: { order: { select: { status: true, resumeStatus: true } } } } },
  });
  const out = new Map<string, LineOrderQuantities>();
  for (const l of lines) {
    const mine = rows.filter((r) => r.requestLineId === l.id);
    const reservedQty = mine.reduce((a, r) => a.plus(r.qty), new Prisma.Decimal(0));
    const orderedQty = mine
      .filter((r) => PO_COUNTED_STATUSES.includes(r.orderLine.order.status) || r.orderLine.order.resumeStatus !== null)
      .reduce((a, r) => a.plus(r.qty), new Prisma.Decimal(0));
    const need = l.approvedQty ?? l.quantity;
    const left = need.minus(reservedQty);
    out.set(l.id, { lineId: l.id, reservedQty, orderedQty, remainingQty: left.isNegative() ? new Prisma.Decimal(0) : left });
  }
  return out;
}

/** BC liés à la DA visibles de `user` (jamais les brouillons d'autrui ; aucun pour qui n'a pas accès aux BC). */
export async function linkedOrders(user: RequestActor, requestId: string): Promise<LinkedOrder[]> {
  if (!can(user, "purchaseOrder.view")) return [];
  const rows = await db.purchaseOrderLineAllocation.findMany({
    where: { requestLine: { requestId } },
    select: {
      requestLineId: true,
      qty: true,
      orderLine: { select: { order: { select: { id: true, number: true, version: true, status: true, type: true, createdById: true } } } },
    },
    orderBy: { id: "asc" },
  });
  const byOrder = new Map<string, LinkedOrder>();
  for (const r of rows) {
    const o = r.orderLine.order;
    if (!canViewOrder(user, o)) continue;
    const entry = byOrder.get(o.id) ?? { id: o.id, number: o.number, displayNumber: displayOrderNumber(o), version: o.version, status: o.status, lines: [] };
    entry.lines.push({ requestLineId: r.requestLineId, qty: r.qty });
    byOrder.set(o.id, entry);
  }
  return [...byOrder.values()];
}
