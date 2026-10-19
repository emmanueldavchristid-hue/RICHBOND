import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { formatCommitment, type Commitment } from "./duplicates";
import { canViewRequest, type RequestActor } from "@/lib/permissions";
import { PR_OPEN_COMMITMENT_STATUSES } from "./labels";

type Client = Pick<Prisma.TransactionClient, "purchaseRequestLine">;

export interface ItemCommitment extends Commitment {
  itemId: string;
  /** Identifiant de la pièce (DA ou BC) pour le lien. */
  documentId: string;
  /** Interne : sert à filtrer selon le lecteur, retiré avant exposition. */
  ref?: { createdById: string; kind: "STANDARD" | "REAPPRO"; status: string };
}

/**
 * Brancher les BC en cours (LOT-05) sans toucher au code des DA.
 * Contrat : jamais de prix ni de fournisseur dans les engagements renvoyés (numéro, quantité, unité, date seulement).
 */
export interface OpenOrderSource {
  findOpenOrders(client: Prisma.TransactionClient | typeof db, itemIds: string[]): Promise<ItemCommitment[]>;
}

const sources: OpenOrderSource[] = [];

export function registerOpenOrderSource(source: OpenOrderSource): void {
  if (!sources.includes(source)) sources.push(source);
}

/**
 * LOT-05 : la source « BC » s'enregistre au chargement du module `purchase-orders`. Import dynamique pour éviter
 * une dépendance circulaire (les BC dépendent des DA) tout en garantissant que les doublons voient les BC.
 */
async function ensureOrderSources(): Promise<void> {
  await import("@/modules/purchase-orders/open-orders");
}

/** D13 : lignes de DA SOUMISE / A_COMPLETER / VALIDEE / EN_CONSULTATION / PARTIELLEMENT_COMMANDEE (hors DA exclue). */
export async function findOpenCommitments(
  client: Client,
  itemIds: string[],
  excludePrId?: string | null,
): Promise<ItemCommitment[]> {
  const ids = [...new Set(itemIds)];
  if (ids.length === 0) return [];
  const rows = await client.purchaseRequestLine.findMany({
    where: {
      itemId: { in: ids },
      OR: [{ approvedQty: null }, { approvedQty: { gt: 0 } }],
      request: {
        status: { in: [...PR_OPEN_COMMITMENT_STATUSES] },
        number: { not: null },
        ...(excludePrId ? { id: { not: excludePrId } } : {}),
      },
    },
    select: {
      itemId: true,
      quantity: true,
      approvedQty: true,
      unit: true,
      request: { select: { id: true, number: true, neededBy: true, createdById: true, kind: true, status: true } },
    },
    orderBy: [{ request: { neededBy: "asc" } }, { id: "asc" }],
  });
  const das: ItemCommitment[] = rows.map((r) => ({
    source: "DA",
    itemId: r.itemId!,
    documentId: r.request.id,
    number: r.request.number!,
    qty: (r.approvedQty ?? r.quantity).toString(),
    unit: r.unit,
    date: r.request.neededBy,
    ref: { createdById: r.request.createdById, kind: r.request.kind, status: r.request.status },
  }));
  return das;
}

/** DA ouvertes + BC ouverts (sources enregistrées). */
export async function findAllOpenCommitments(
  client: Prisma.TransactionClient | typeof db,
  itemIds: string[],
  excludePrId?: string | null,
): Promise<ItemCommitment[]> {
  await ensureOrderSources();
  const das = await findOpenCommitments(client, itemIds, excludePrId);
  const orders = (await Promise.all(sources.map((s) => s.findOpenOrders(client, itemIds)))).flat();
  return [...das, ...orders];
}

/**
 * Le Magasinier ne voit ni numéro ni identifiant d'une DA qu'il ne peut pas consulter, ni les BC :
 * l'avertissement reste utile (quantité, date) mais anonymisé.
 */
function maskFor(c: ItemCommitment, viewer?: RequestActor): ItemCommitment {
  const { ref, ...rest } = c;
  if (!viewer) return rest;
  const visible = c.source === "DA" && ref ? canViewRequest(viewer, ref) : viewer.role !== "MAGASINIER";
  return visible ? rest : { ...rest, number: "", documentId: "" };
}

/** Point d'entrée des actions : avertissements de doublons filtrés selon le lecteur. */
export function checkDuplicates(itemIds: string[], excludeId: string | null | undefined, user: RequestActor) {
  return duplicateWarnings(db, itemIds, excludeId, user);
}

export interface DuplicateWarning {
  itemId: string;
  itemCode: string;
  itemName: string;
  messages: string[];
  commitments: ItemCommitment[];
}

/** Avertissements groupés par article (non bloquants). */
export async function duplicateWarnings(
  client: Prisma.TransactionClient | typeof db,
  itemIds: string[],
  excludePrId?: string | null,
  viewer?: RequestActor,
): Promise<DuplicateWarning[]> {
  const commitments = (await findAllOpenCommitments(client, itemIds, excludePrId)).map((c) => maskFor(c, viewer));
  if (commitments.length === 0) return [];
  const byItem = new Map<string, ItemCommitment[]>();
  for (const c of commitments) byItem.set(c.itemId, [...(byItem.get(c.itemId) ?? []), c]);
  const items = await client.item.findMany({
    where: { id: { in: [...byItem.keys()] } },
    select: { id: true, code: true, name: true },
  });
  const names = new Map(items.map((i) => [i.id, i]));
  return [...byItem.entries()].map(([itemId, list]) => ({
    itemId,
    itemCode: names.get(itemId)?.code ?? "",
    itemName: names.get(itemId)?.name ?? "",
    messages: list.map(formatCommitment),
    commitments: list,
  }));
}
