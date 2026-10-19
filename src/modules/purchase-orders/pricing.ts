import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { checkPrice, type LastPrice } from "./price-check";
import { effectiveUnitPrice } from "./totals";
import type { FullOrder, Tx } from "./internal";

export interface LastPriceInfo extends LastPrice {
  supplierCode: string | null;
  supplierName: string | null;
}

/** D14 : dernier prix d'achat de chaque article (le plus récent `ItemPriceHistory`, tous fournisseurs). */
type PriceClient = Pick<Tx, "itemPriceHistory" | "supplier">;

export async function lastPrices(tx: PriceClient, itemIds: string[]): Promise<Map<string, LastPriceInfo>> {
  const ids = [...new Set(itemIds)];
  if (ids.length === 0) return new Map();
  const rows = await tx.itemPriceHistory.findMany({
    where: { itemId: { in: ids } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  const first = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!first.has(r.itemId)) first.set(r.itemId, r);
  const suppliers = new Map(
    (await tx.supplier.findMany({ where: { id: { in: [...new Set([...first.values()].map((r) => r.supplierId))] } }, select: { id: true, code: true, name: true } })).map((s) => [s.id, s]),
  );
  return new Map(
    [...first.entries()].map(([itemId, r]) => [
      itemId,
      {
        price: r.price,
        currencyCode: r.currencyCode,
        rateToXof: r.rateToXof,
        priceUnit: r.priceUnit,
        date: r.date,
        supplierCode: suppliers.get(r.supplierId)?.code ?? null,
        supplierName: suppliers.get(r.supplierId)?.name ?? null,
      },
    ]),
  );
}

/** Mémorise sur chaque ligne le dernier prix connu (FCFA) et l'écart en % (D14) ; renvoie le nombre de lignes en alerte. */
export async function applyPriceChecks(tx: Tx, po: FullOrder, thresholdPct: number): Promise<number> {
  const itemIds = po.lines.map((l) => l.itemId).filter((x): x is string => !!x);
  const last = await lastPrices(tx, itemIds);
  let alerts = 0;
  for (const l of po.lines) {
    const res = l.itemId
      ? checkPrice({
          unitPrice: l.unitPrice,
          discountPct: l.discountPct,
          currencyCode: po.currencyCode,
          rate: po.exchangeRate,
          unit: l.unit,
          last: last.get(l.itemId) ?? null,
          thresholdPct,
        })
      : { lastPriceXof: null, deltaPct: null, alert: false };
    if (res.alert) alerts += 1;
    await tx.purchaseOrderLine.update({ where: { id: l.id }, data: { lastPriceXof: res.lastPriceXof, priceDeltaPct: res.deltaPct } });
  }
  return alerts;
}

/**
 * D14 : à la validation, le prix du BC devient le dernier prix de l'article (`ItemPriceHistory`, source BC) et met à jour
 * `ItemSupplier.lastPrice` quand le lien article-fournisseur existe. Prix effectif après remise, par unité d'achat.
 */
export async function recordPriceHistory(tx: Tx, po: FullOrder, number: string, at: Date, userId: string): Promise<void> {
  for (const l of po.lines) {
    if (!l.itemId) continue;
    const price = effectiveUnitPrice(l.unitPrice, l.discountPct).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    await tx.itemPriceHistory.create({
      data: {
        itemId: l.itemId,
        supplierId: po.supplierId,
        price,
        currencyCode: po.currencyCode,
        rateToXof: po.currencyCode === "XOF" ? null : po.exchangeRate,
        priceUnit: l.unit,
        source: "BC",
        sourceRef: number,
        date: at,
        createdById: userId,
      },
    });
    await tx.itemSupplier.updateMany({
      where: { itemId: l.itemId, supplierId: po.supplierId },
      data: { lastPrice: price, currencyCode: po.currencyCode, lastPriceDate: at, priceUnit: l.unit },
    });
  }
}
