import "server-only";
import { Prisma, type PurchaseOrderEventType, type PurchaseOrderStatus } from "@/generated/prisma/client";
import { BusinessError } from "@/lib/errors";
import { dayKey } from "@/modules/currencies/rate";
import { lockFresh } from "@/modules/referentials/concurrency";
import { PO_COUNTED_STATUSES, PO_RELEASED_STATUSES, displayOrderNumber } from "./labels";
import { expectedDateOf } from "./lateness";
import type { WorkflowOrder } from "./workflow";

export type Tx = Prisma.TransactionClient;

export const asJson = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

export const orderLink = (id: string) => `/achats/commandes/${id}`;
export const requestLink = (id: string) => `/achats/demandes/${id}`;

/** Utilisateur qui agit (compatible `CurrentUser`). */
export interface OrderActor {
  id: string;
  role: "SUPER_ADMIN" | "RESPONSABLE_ACHATS" | "ACHETEUR" | "MAGASINIER";
  purchaseScope?: "LOCAL" | "IMPORT" | "ALL" | null;
}

export interface OrderResult {
  id: string;
  number: string | null;
  displayNumber: string;
  status: PurchaseOrderStatus;
  version: number;
  updatedAt: Date;
}

export function orderResult(po: { id: string; number: string | null; status: PurchaseOrderStatus; version: number; updatedAt: Date }): OrderResult {
  return { id: po.id, number: po.number, displayNumber: displayOrderNumber(po), status: po.status, version: po.version, updatedAt: po.updatedAt };
}

export async function recordEvent(
  tx: Tx,
  e: {
    orderId: string;
    version: number;
    type: PurchaseOrderEventType;
    userId: string;
    from?: PurchaseOrderStatus | null;
    to?: PurchaseOrderStatus | null;
    comment?: string | null;
    payload?: unknown;
    at: Date;
  },
) {
  await tx.purchaseOrderEvent.create({
    data: {
      orderId: e.orderId,
      version: e.version,
      type: e.type,
      userId: e.userId,
      fromStatus: e.from ?? null,
      toStatus: e.to ?? null,
      comment: e.comment ?? null,
      payload: e.payload === undefined ? undefined : asJson(e.payload),
      createdAt: e.at,
    },
  });
}

/** Chargement complet d'un BC (lignes, allocations, frais, fournisseur). */
export const FULL_INCLUDE = {
  lines: { orderBy: { lineNo: "asc" as const }, include: { allocations: true, item: true } },
  charges: { orderBy: { id: "asc" as const } },
  supplier: { include: { contacts: { where: { active: true }, orderBy: [{ isPrimary: "desc" as const }, { name: "asc" as const }] } } },
  warehouse: true,
  currency: true,
  createdBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
} satisfies Prisma.PurchaseOrderInclude;

export type FullOrder = Prisma.PurchaseOrderGetPayload<{ include: typeof FULL_INCLUDE }>;

/** Verrouille la ligne (FOR UPDATE), contrôle la version puis charge le BC complet. */
export async function loadLocked(tx: Tx, id: string, expectedUpdatedAt: Date): Promise<FullOrder> {
  await lockFresh(tx, "purchase_orders", id, expectedUpdatedAt);
  return loadFull(tx, id);
}

export async function loadFull(tx: Tx, id: string): Promise<FullOrder> {
  const po = await tx.purchaseOrder.findUnique({ where: { id }, include: FULL_INCLUDE });
  if (!po) throw new BusinessError("NOT_FOUND", "Bon de commande introuvable.");
  return po;
}

/** Entrée du workflow pur depuis un BC chargé. */
export function toWorkflow(po: FullOrder | (Pick<FullOrder, "status" | "createdById" | "type" | "version" | "resumeStatus"> & { lines?: { receivedQty: Prisma.Decimal }[] })): WorkflowOrder {
  return {
    status: po.status,
    createdById: po.createdById,
    type: po.type,
    version: po.version,
    resumeStatus: po.resumeStatus,
    hasReceipts: po.lines?.some((l) => l.receivedQty.gt(0)) ?? false,
  };
}

export async function activeResponsableIds(tx: Tx, excludeId?: string): Promise<string[]> {
  const rows = await tx.user.findMany({
    where: { role: "RESPONSABLE_ACHATS", active: true, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * D7 : verrou des DA sources (`SELECT ... FOR UPDATE`, ordre d'identifiant croissant : pas d'interblocage) pour que deux
 * acheteurs ne réservent pas simultanément le même reste à commander.
 */
export async function lockRequests(tx: Tx, requestIds: string[]): Promise<void> {
  const ids = [...new Set(requestIds)].sort();
  if (ids.length === 0) return;
  await tx.$queryRaw`SELECT id FROM purchase_requests WHERE id = ANY(${ids}) ORDER BY id FOR UPDATE`;
}

/** Quantités déjà rattachées (unité de la ligne de DA) par d'autres BC non refusés/annulés, brouillons compris. */
export async function allocatedElsewhere(tx: Tx, requestLineIds: string[], excludeOrderId?: string | null): Promise<Map<string, Prisma.Decimal>> {
  if (requestLineIds.length === 0) return new Map();
  const rows = await tx.purchaseOrderLineAllocation.groupBy({
    by: ["requestLineId"],
    where: {
      requestLineId: { in: requestLineIds },
      orderLine: { order: { status: { notIn: [...PO_RELEASED_STATUSES] }, ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}) } },
    },
    _sum: { qty: true },
  });
  return new Map(rows.map((r) => [r.requestLineId, r._sum.qty ?? new Prisma.Decimal(0)]));
}

/**
 * D9 : quantités commandées par ligne de DA = somme des allocations des BC validés et au-delà (hors refusés/annulés).
 * Un avenant en cours (brouillon ou à valider portant `resumeStatus`) compte encore : il a déjà été validé.
 */
export async function orderedByRequestLine(tx: Tx, requestId: string): Promise<Record<string, string>> {
  const rows = await tx.purchaseOrderLineAllocation.groupBy({
    by: ["requestLineId"],
    where: {
      requestLine: { requestId },
      orderLine: {
        order: { OR: [{ status: { in: [...PO_COUNTED_STATUSES] } }, { resumeStatus: { not: null }, status: { in: ["BROUILLON", "A_VALIDER"] } }] },
      },
    },
    _sum: { qty: true },
  });
  return Object.fromEntries(rows.map((r) => [r.requestLineId, (r._sum.qty ?? new Prisma.Decimal(0)).toString()]));
}

/** DA sources d'un BC (via les allocations de ses lignes) : identifiant, numéro, créateur. */
export async function sourceRequests(tx: Tx, po: { lines: { allocations: { requestLineId: string }[] }[] }) {
  const lineIds = [...new Set(po.lines.flatMap((l) => l.allocations.map((a) => a.requestLineId)))];
  if (lineIds.length === 0) return [];
  const lines = await tx.purchaseRequestLine.findMany({
    where: { id: { in: lineIds } },
    select: { request: { select: { id: true, number: true, createdById: true, assignedBuyerId: true } } },
  });
  const byId = new Map(lines.map((l) => [l.request.id, l.request]));
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** Colonne `expectedDate` : date promise, sinon date demandée. */
export function expectedDateColumn(po: { promisedDate?: Date | null; requestedDate: Date }): Date {
  return new Date(`${expectedDateOf(po)}T00:00:00.000Z`);
}

/** Dernier taux connu au plus tard le jour de `at` (FCFA pour 1 unité de devise) ; le FCFA vaut 1 sans ligne de taux. */
export async function latestRate(tx: Pick<Tx, "exchangeRate">, currencyCode: string, at: Date): Promise<{ rate: Prisma.Decimal; date: Date } | null> {
  if (currencyCode === "XOF") return { rate: new Prisma.Decimal(1), date: dayKey(at) };
  const r = await tx.exchangeRate.findFirst({
    where: { currencyCode, date: { lte: dayKey(at) } },
    orderBy: { date: "desc" },
    select: { rate: true, date: true },
  });
  return r ? { rate: r.rate, date: r.date } : null;
}

/** Date jour seul (colonne DATE) depuis `yyyy-MM-dd`. */
export const dateOnly = (iso: string): Date => new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
export const isoDay = (d: Date): string => d.toISOString().slice(0, 10);
