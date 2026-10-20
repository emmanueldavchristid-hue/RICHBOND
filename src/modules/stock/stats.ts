import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { now } from "@/lib/clock";
import { todayAbidjan } from "@/lib/dates";
import { getSettings } from "@/modules/settings/service";
import type { AppSettings } from "@/modules/settings/keys";
import { computeForecast, effectiveLeadTime } from "./forecast";
import { Decimal, movementValue } from "./pmp";
import type { ItemForecast } from "./types";

/**
 * Chargement des agrégats de stock (lectures seules, aucun verrou) : niveaux, consommation, dernier mouvement,
 * reste à recevoir. Module sans dépendance vers les services DA/BC (importable par le module des demandes d'achat).
 */

type Client = Pick<Prisma.TransactionClient, "stockLevel" | "stockMovement" | "purchaseOrderLine" | "item">;

const DAY_MS = 86_400_000;
/** BC dont une livraison est attendue. */
export const ON_ORDER_STATUSES = ["ENVOYE", "CONFIRME", "PARTIELLEMENT_RECU"] as const;

export const FORECAST_ITEM_SELECT = {
  id: true,
  code: true,
  name: true,
  category: true,
  criticality: true,
  status: true,
  stocked: true,
  stockUnit: true,
  purchaseUnit: true,
  conversionFactor: true,
  abcClass: true,
  abcComputedAt: true,
  safetyStock: true,
  reorderPoint: true,
  economicOrderQty: true,
  leadTimeDays: true,
  mainSupplierId: true,
  mainSupplier: { select: { id: true, name: true, type: true } },
  suppliers: { select: { supplierId: true, leadTimeDays: true, minOrderQty: true, active: true } },
} satisfies Prisma.ItemSelect;

export type ForecastItem = Prisma.ItemGetPayload<{ select: typeof FORECAST_ITEM_SELECT }>;

export interface ItemStats {
  onHand: Decimal;
  /** FCFA entiers (Σ dépôts de quantité x PMP). */
  value: number;
  consumed: Decimal;
  lastMovementAt: Date | null;
  onOrder: Decimal;
  /** yyyy-MM-dd */
  nextDeliveryIso: string | null;
}

export interface StatsOptions {
  itemIds?: string[];
  warehouseId?: string;
  at: Date;
  settings: AppSettings;
}

export async function loadStats(client: Client, o: StatsOptions): Promise<Map<string, ItemStats>> {
  const windowStart = new Date(o.at.getTime() - o.settings.stockConsumptionWindowDays * DAY_MS);
  const itemFilter = o.itemIds ? { itemId: { in: o.itemIds } } : {};
  const whFilter = o.warehouseId ? { warehouseId: o.warehouseId } : {};
  const [levels, consumed, lasts, lines] = await Promise.all([
    client.stockLevel.findMany({ where: { ...itemFilter, ...whFilter }, select: { itemId: true, quantity: true, pmp: true } }),
    client.stockMovement.groupBy({
      by: ["itemId"],
      where: { ...itemFilter, ...whFilter, type: "SORTIE", occurredAt: { gte: windowStart, lte: o.at } },
      _sum: { quantity: true },
    }),
    client.stockMovement.groupBy({ by: ["itemId"], where: { ...itemFilter, ...whFilter }, _max: { occurredAt: true } }),
    client.purchaseOrderLine.findMany({
      where: {
        itemId: o.itemIds ? { in: o.itemIds } : { not: null },
        order: { status: { in: [...ON_ORDER_STATUSES] }, ...whFilter },
      },
      select: {
        itemId: true,
        quantity: true,
        stockQty: true,
        receivedQty: true,
        closedQty: true,
        item: { select: { conversionFactor: true } },
        order: { select: { expectedDate: true } },
      },
    }),
  ]);

  const out = new Map<string, ItemStats>();
  const get = (id: string): ItemStats => {
    let s = out.get(id);
    if (!s) {
      s = { onHand: new Decimal(0), value: 0, consumed: new Decimal(0), lastMovementAt: null, onOrder: new Decimal(0), nextDeliveryIso: null };
      out.set(id, s);
    }
    return s;
  };
  for (const l of levels) {
    const s = get(l.itemId);
    s.onHand = s.onHand.add(l.quantity);
    s.value += movementValue(l.quantity, l.pmp);
  }
  for (const c of consumed) get(c.itemId).consumed = new Decimal(c._sum.quantity ?? 0).neg();
  for (const m of lasts) get(m.itemId).lastMovementAt = m._max.occurredAt;
  for (const l of lines) {
    if (!l.itemId) continue;
    const ordered = new Decimal(l.quantity);
    const remaining = Decimal.max(ordered.sub(l.receivedQty).sub(l.closedQty), new Decimal(0));
    if (remaining.lte(0)) continue;
    const factor = l.stockQty && ordered.gt(0) && new Decimal(l.stockQty).gt(0) ? new Decimal(l.stockQty).div(ordered) : new Decimal(l.item?.conversionFactor ?? 1);
    const s = get(l.itemId);
    s.onOrder = s.onOrder.add(remaining.mul(factor.gt(0) ? factor : 1));
    const iso = l.order.expectedDate.toISOString().slice(0, 10);
    if (s.nextDeliveryIso === null || iso < s.nextDeliveryIso) s.nextDeliveryIso = iso;
  }
  return out;
}

export function itemLeadTime(item: ForecastItem, settings: AppSettings): number {
  const main = item.suppliers.find((s) => s.supplierId === item.mainSupplierId);
  return effectiveLeadTime({ item: item.leadTimeDays, supplier: main?.leadTimeDays, fallback: settings.stockDefaultLeadTimeDays });
}

export function buildForecast(item: ForecastItem, stats: ItemStats | undefined, settings: AppSettings, todayIso: string): ItemForecast {
  return computeForecast({
    itemId: item.id,
    onHand: stats?.onHand ?? 0,
    onOrder: stats?.onOrder ?? 0,
    netIssued: stats?.consumed ?? 0,
    windowDays: settings.stockConsumptionWindowDays,
    leadTimeDays: itemLeadTime(item, settings),
    criticality: item.criticality,
    safetyStock: item.safetyStock,
    reorderPoint: item.reorderPoint,
    todayIso,
    nextDeliveryIso: stats?.nextDeliveryIso ?? null,
  });
}

/**
 * Prévision d'un article (couverture, date de rupture, seuils suggérés et effectifs, alerte avant livraison).
 * Exportée pour LOT-08 (rapports, alertes). Null si l'article n'existe pas.
 */
export async function itemForecast(itemId: string, at: Date = now(), client: Client = db): Promise<ItemForecast | null> {
  const item = await client.item.findUnique({ where: { id: itemId }, select: FORECAST_ITEM_SELECT });
  if (!item) return null;
  const settings = await getSettings();
  const stats = await loadStats(client, { itemIds: [itemId], at, settings });
  return buildForecast(item, stats.get(itemId), settings, todayAbidjan(at));
}
