/**
 * Inventaires fictifs (LOT-11), créés par les services d'inventaire (numéros INV, audit, mouvements AJUSTEMENT_INVENTAIRE
 * comme en production, jamais de mise à jour directe du stock) :
 * - un inventaire VALIDÉ : deux articles comptés, un petit écart (-1) ajusté à la validation, fiabilité 50 % ;
 * - un inventaire EN COMPTAGE : deux articles, un seul compté pour l'instant (de quoi tester l'écran tablette).
 * Aucune donnée réelle. Idempotent : un inventaire portant le commentaire du seed n'est pas recréé.
 */
import Module from "node:module";
import type { PrismaClient } from "../../src/generated/prisma/client";

const NOTE_DONE = "Inventaire de démonstration validé (données fictives).";
const NOTE_OPEN = "Inventaire de démonstration en cours de comptage (données fictives).";

/** `server-only` interdit l'import hors Next.js ; le seed est un script serveur : on le neutralise pour ce processus. */
function allowServerOnly() {
  const m = Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown };
  const original = m._load;
  m._load = function (request: string, ...rest: unknown[]) {
    if (request === "server-only") return {};
    return original.call(this, request, ...rest);
  };
}

export async function seedInventories(prisma: PrismaClient): Promise<void> {
  const [resp, store] = await Promise.all([
    prisma.user.findUnique({ where: { email: "responsable@richbond.test" } }),
    prisma.user.findUnique({ where: { email: "magasinier@richbond.test" } }),
  ]);
  if (!resp || !store) return;
  const done = await prisma.inventoryCount.findFirst({ where: { comment: NOTE_DONE }, select: { id: true } });
  const open = await prisma.inventoryCount.findFirst({ where: { comment: NOTE_OPEN }, select: { id: true } });
  if (done && open) return;

  /** Dépôt de la première désignation en stock ; seules les désignations de ce même dépôt sont gardées. */
  async function pick(names: string[]) {
    const levels = await prisma.stockLevel.findMany({ where: { item: { name: { in: names } }, quantity: { gt: 0 } }, include: { item: { select: { name: true } } } });
    const first = names.map((n) => levels.find((l) => l.item.name === n)).find(Boolean);
    if (!first) return null;
    const same = names.map((n) => levels.find((l) => l.item.name === n && l.warehouseId === first.warehouseId)).filter((l): l is NonNullable<typeof l> => !!l);
    return { warehouseId: first.warehouseId, levels: same };
  }

  allowServerOnly();
  const svc = await import("../../src/modules/inventory/service");
  const { db } = await import("../../src/lib/db");
  const respA = { id: resp.id, role: resp.role, purchaseScope: resp.purchaseScope };
  const storeA = { id: store.id, role: store.role, purchaseScope: store.purchaseScope };
  const sheetOf = (countId: string) => prisma.inventoryCountLine.findMany({ where: { countId }, include: { item: { select: { name: true } } } });

  try {
    if (!done) {
      const sel = await pick(["Graisse multi-usage", "Rame papier A4"]);
      if (sel) {
        const created = await svc.createInventoryCount(respA, { warehouseId: sel.warehouseId, kind: "TOURNANT", itemIds: sel.levels.map((l) => l.itemId), comment: NOTE_DONE });
        await svc.openInventoryCount(storeA, { countId: created.id });
        const lines = await sheetOf(created.id);
        // Premier article : 1 unité de moins que prévu ; les autres sont exacts.
        const entries = lines.map((l, i) => {
          const theo = Number(l.theoreticalQty ?? 0);
          return { lineId: l.id, quantity: i === 0 ? Math.max(0, theo - 1) : theo };
        });
        await svc.saveInventoryCount(storeA, { countId: created.id, lines: entries });
        await svc.submitInventoryCount(storeA, { countId: created.id });
        await svc.validateInventoryCount(respA, { countId: created.id, reasons: [] });
      }
    }
    if (!open) {
      const sel = await pick(["Film étirable", "Courroie trapézoïdale SPZ 1250"]);
      if (sel) {
        const created = await svc.createInventoryCount(respA, { warehouseId: sel.warehouseId, kind: "TOURNANT", itemIds: sel.levels.map((l) => l.itemId), comment: NOTE_OPEN });
        await svc.openInventoryCount(storeA, { countId: created.id });
        const lines = await sheetOf(created.id);
        if (lines.length > 1) await svc.saveInventoryCount(storeA, { countId: created.id, lines: [{ lineId: lines[0].id, quantity: Number(lines[0].theoreticalQty ?? 0) }] });
      }
    }
  } finally {
    await db.$disconnect();
  }
}
