import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { Decimal } from "@/modules/stock/pmp";
import { OPEN_STATUSES, selectRotating, type SelectionCandidate } from "./rules";

type Client = Pick<Prisma.TransactionClient, "item" | "inventoryCountLine">;

/** Articles gérés en stock, actifs, rattachés au dépôt (niveau de stock existant ou dépôt par défaut). */
export function warehouseItemsWhere(warehouseId: string): Prisma.ItemWhereInput {
  return {
    stocked: true,
    status: "ACTIF",
    OR: [{ stockLevels: { some: { warehouseId } } }, { defaultWarehouseId: warehouseId }],
  };
}

/** Articles déjà sur un inventaire non terminé de ce dépôt (un article n'est comptable qu'une fois à la fois). */
export async function itemsInOpenCounts(client: Client, warehouseId: string, exceptCountId?: string): Promise<Set<string>> {
  const rows = await client.inventoryCountLine.findMany({
    where: { count: { warehouseId, status: { in: OPEN_STATUSES } }, ...(exceptCountId ? { countId: { not: exceptCountId } } : {}) },
    select: { itemId: true },
  });
  return new Set(rows.map((r) => r.itemId));
}

export type SelectionRowData = SelectionCandidate & { code: string; name: string; abcClass: string | null; lastCountedAt: Date | null };

/** Sélection tournante proposée pour un dépôt (sans rien enregistrer). */
export async function loadRotatingSelection(client: Client, warehouseId: string, at: Date, cap?: number): Promise<SelectionRowData[]> {
  const items = await client.item.findMany({
    where: warehouseItemsWhere(warehouseId),
    select: { id: true, code: true, name: true, abcClass: true },
  });
  if (items.length === 0) return [];
  const history = await client.inventoryCountLine.findMany({
    where: { itemId: { in: items.map((i) => i.id) }, count: { warehouseId, status: "VALIDE" }, countedQty: { not: null } },
    select: { itemId: true, theoreticalQty: true, countedQty: true, recountQty: true, count: { select: { validatedAt: true } } },
    orderBy: { count: { validatedAt: "desc" } },
  });
  const last = new Map<string, { at: Date; variance: boolean }>();
  for (const h of history) {
    if (last.has(h.itemId) || !h.count.validatedAt) continue;
    const finalQty = new Decimal(String(h.recountQty ?? h.countedQty));
    last.set(h.itemId, { at: h.count.validatedAt, variance: !finalQty.eq(new Decimal(String(h.theoreticalQty ?? 0))) });
  }
  const picked = selectRotating(
    items.map((i) => {
      const l = last.get(i.id);
      return { itemId: i.id, abcClass: i.abcClass, lastCountedAt: l?.at ?? null, lastVarianceAt: l?.variance ? l.at : null };
    }),
    at,
    { cap, excludeItemIds: await itemsInOpenCounts(client, warehouseId) },
  );
  const byId = new Map(items.map((i) => [i.id, i]));
  return picked.map((p) => {
    const it = byId.get(p.itemId)!;
    return { ...p, code: it.code, name: it.name, abcClass: it.abcClass, lastCountedAt: last.get(p.itemId)?.at ?? null };
  });
}
