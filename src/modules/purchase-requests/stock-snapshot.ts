import "server-only";
import { db } from "@/lib/db";
import { now } from "@/lib/clock";
import { todayAbidjan } from "@/lib/dates";
import { getSettings } from "@/modules/settings/service";
import { FORECAST_ITEM_SELECT, buildForecast, loadStats } from "@/modules/stock/stats";

export interface StockSnapshot {
  /** Quantité disponible en unité de stock (chaîne décimale). */
  onHand: string;
  /** Couverture en jours ; null si la consommation est inconnue. */
  coverageDays: number | null;
}

/** D14 : stock actuel et couverture par article (LOT-07 : niveaux de stock et consommation réels). */
export async function getStockSnapshot(itemIds: string[]): Promise<Record<string, StockSnapshot> | null> {
  if (itemIds.length === 0) return {};
  const at = now();
  const settings = await getSettings();
  const [items, stats] = await Promise.all([
    db.item.findMany({ where: { id: { in: itemIds } }, select: FORECAST_ITEM_SELECT }),
    loadStats(db, { itemIds, at, settings }),
  ]);
  const out: Record<string, StockSnapshot> = {};
  for (const item of items) {
    if (!item.stocked) continue;
    const fc = buildForecast(item, stats.get(item.id), settings, todayAbidjan(at));
    out[item.id] = { onHand: fc.onHand, coverageDays: fc.coverageDays };
  }
  return out;
}
