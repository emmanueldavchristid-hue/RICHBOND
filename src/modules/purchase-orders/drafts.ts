import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { now } from "@/lib/clock";
import { todayAbidjan } from "@/lib/dates";
import { BusinessError } from "@/lib/errors";
import { requireAction } from "@/lib/permissions";
import { requestOrderQuantities } from "@/modules/purchase-requests/order-links";
import { parseInput } from "@/modules/purchase-requests/parse";
import { assertSupplierCanOrder } from "@/modules/suppliers";
import { convertQty } from "./allocation";
import type { OrderActor } from "./internal";
import { createFromRequestLinesSchema } from "./schemas";
import { createDraft, type OrderWithWarnings } from "./service";

/**
 * D6 (écran « À commander », fiche DA « Créer le BC ») : crée un brouillon de BC à partir de lignes de DA cochées.
 * Un article présent sur plusieurs DA donne une seule ligne de BC portant plusieurs allocations (regroupement).
 * Quantité par défaut = tout le reste à commander ; prix = dernier prix du fournisseur pour l'article s'il est dans la devise du BC.
 */
export async function createDraftFromRequestLines(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<OrderWithWarnings> {
  const input = parseInput(createFromRequestLinesSchema, raw);
  const supplier = await db.supplier.findUnique({ where: { id: input.supplierId } });
  if (!supplier) throw new BusinessError("NOT_FOUND", "Fournisseur introuvable.");
  assertSupplierCanOrder(supplier);
  requireAction(actor, "purchaseOrder.create", { scope: supplier.type });

  const ids = input.lines.map((l) => l.requestLineId);
  const rows = await db.purchaseRequestLine.findMany({
    where: { id: { in: ids } },
    include: { request: { select: { id: true, number: true, neededBy: true } }, item: true },
  });
  if (rows.length !== new Set(ids).size) throw new BusinessError("ALLOCATION_INVALID", "Une ligne de demande d'achat est introuvable.");
  const quantities = await requestOrderQuantities(db, rows);
  const wanted = new Map(input.lines.map((l) => [l.requestLineId, l.qty]));
  const links = new Map(
    (await db.itemSupplier.findMany({ where: { supplierId: supplier.id, itemId: { in: rows.flatMap((r) => (r.itemId ? [r.itemId] : [])) } } })).map((l) => [l.itemId, l]),
  );

  interface Group {
    itemId: string | null;
    freeDesignation: string | null;
    unit: string;
    qty: Prisma.Decimal;
    allocations: { requestLineId: string; qty: string }[];
  }
  const groups = new Map<string, Group>();
  for (const r of rows) {
    const qty = new Prisma.Decimal(wanted.get(r.id) ?? quantities.get(r.id)!.remainingQty);
    if (qty.lte(0)) continue;
    const key = r.itemId ?? `free:${r.id}`;
    const g = groups.get(key) ?? { itemId: r.itemId, freeDesignation: r.freeDesignation, unit: r.item?.purchaseUnit ?? r.unit, qty: new Prisma.Decimal(0), allocations: [] };
    g.qty = g.qty.plus(r.item ? convertQty(qty, r.unit, r.item.purchaseUnit, r.item) : qty);
    g.allocations.push({ requestLineId: r.id, qty: qty.toString() });
    groups.set(key, g);
  }
  if (groups.size === 0) throw new BusinessError("NOTHING_TO_ORDER", "Il ne reste rien à commander sur les lignes choisies.");

  const today = todayAbidjan(at);
  const earliest = rows.map((r) => r.request.neededBy.toISOString().slice(0, 10)).sort()[0];
  const warehouse =
    input.warehouseId ??
    rows.find((r) => r.item?.defaultWarehouseId)?.item?.defaultWarehouseId ??
    (await db.warehouse.findFirst({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true } }))?.id;
  if (!warehouse) throw new BusinessError("WAREHOUSE_INVALID", "Aucun dépôt actif : créez-en un dans Paramètres > Dépôts.");

  return createDraft(
    actor,
    {
      supplierId: supplier.id,
      origin: "DA",
      warehouseId: warehouse,
      requestedDate: input.requestedDate ?? (earliest && earliest > today ? earliest : today),
      lines: [...groups.values()].map((g) => {
        const link = g.itemId ? links.get(g.itemId) : undefined;
        const price = link?.lastPrice && link.currencyCode === supplier.currencyCode ? link.lastPrice.toString() : "0";
        return {
          itemId: g.itemId,
          freeDesignation: g.itemId ? null : g.freeDesignation,
          unit: g.unit,
          quantity: g.qty.toString(),
          unitPrice: price,
          allocations: g.allocations,
        };
      }),
    },
    ip,
    at,
  );
}
