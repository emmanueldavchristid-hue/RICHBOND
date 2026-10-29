/**
 * Seed de charge OPTIONNEL (LOT-18) : 2 000 articles et 10 000 mouvements fictifs pour mesurer les temps de réponse.
 * Usage : npm run seed:charge   (base de développement uniquement, jamais en production).
 * Idempotent : si des articles `CHG-` existent déjà, rien n'est ajouté.
 * Les mouvements sont insérés en masse (hors applyMovement) mais restent cohérents : chaque StockLevel égale la somme
 * des mouvements de l'article, le PMP reste constant (toutes les entrées au même coût), stockAfter est le cumul.
 */
import "dotenv/config";
import { createPrismaClient } from "../src/lib/prisma-client";
import type { ItemCategory } from "../src/generated/prisma/client";

const ITEMS = 2000;
const MOVEMENTS_PER_ITEM = 5; // 1 entrée initiale + 4 mouvements = 10 000 au total
const DAY = 86_400_000;
const CATEGORIES: ItemCategory[] = ["PDR", "FOURNITURE", "INTRANT", "MATIERE_PREMIERE"];

/** Générateur pseudo-aléatoire déterministe (résultats reproductibles). */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

async function main() {
  const prisma = createPrismaClient();
  try {
    if ((await prisma.item.count({ where: { code: { startsWith: "CHG-" } } })) > 0) {
      console.log("Seed de charge déjà présent (articles CHG-) : rien à faire.");
      return;
    }
    const user = await prisma.user.findUnique({ where: { email: "magasinier@richbond.test" } });
    const wh = await prisma.warehouse.findFirst({ where: { active: true }, orderBy: { code: "asc" } });
    if (!user || !wh) throw new Error("Lancer d'abord `npx prisma db seed` (utilisateurs et dépôt requis).");

    const rand = rng(42);
    const now = Date.now();
    const items: unknown[] = [];
    const itemList: { id: string; code: string; cost: number }[] = [];
    for (let i = 1; i <= ITEMS; i++) {
      const code = `CHG-${String(i).padStart(5, "0")}`;
      const cost = 100 + Math.floor(rand() * 50_000);
      itemList.push({ id: `chg-item-${i}`, code, cost });
      items.push({
        id: `chg-item-${i}`,
        code,
        name: `Article de charge ${i}`,
        category: CATEGORIES[i % CATEGORIES.length],
        family: `Famille ${i % 25}`,
        stockUnit: "U",
        purchaseUnit: "U",
        defaultWarehouseId: wh.id,
        reorderPoint: 20,
        safetyStock: 10,
        leadTimeDays: 15,
        notes: "Données fictives (seed de charge LOT-18)",
        createdById: user.id,
      });
    }
    await prisma.item.createMany({ data: items as never });

    const movements: Record<string, unknown>[] = [];
    const levels: Record<string, unknown>[] = [];
    for (const it of itemList) {
      let stock = 0;
      for (let k = 0; k < MOVEMENTS_PER_ITEM; k++) {
        const daysAgo = Math.round(200 - (k * 190) / (MOVEMENTS_PER_ITEM - 1));
        const occurredAt = new Date(now - daysAgo * DAY);
        let qty: number;
        if (k === 0) qty = 200 + Math.floor(rand() * 800);
        else if (rand() < 0.2) qty = 20 + Math.floor(rand() * 100); // entrée
        else qty = -Math.min(stock, 5 + Math.floor(rand() * 60)); // sortie, jamais sous zéro
        stock += qty;
        const isIn = qty > 0;
        movements.push({
          itemId: it.id,
          warehouseId: wh.id,
          type: isIn ? "ENTREE_RECEPTION" : "SORTIE",
          quantity: qty,
          unitCost: it.cost,
          value: Math.round(qty * it.cost),
          pmpBefore: k === 0 ? 0 : it.cost,
          pmpAfter: it.cost,
          stockAfter: stock,
          documentType: isIn ? "RECEPTION" : "SORTIE",
          documentRef: `CHG-${isIn ? "REC" : "SOR"}-${it.code.slice(4)}-${k}`,
          comment: "Données fictives (seed de charge LOT-18)",
          occurredAt,
          createdById: user.id,
        });
      }
      levels.push({ itemId: it.id, warehouseId: wh.id, quantity: stock, pmp: it.cost });
    }
    for (let i = 0; i < movements.length; i += 2000) {
      await prisma.stockMovement.createMany({ data: movements.slice(i, i + 2000) as never });
    }
    await prisma.stockLevel.createMany({ data: levels as never });
    console.log(`Seed de charge : ${ITEMS} articles, ${movements.length} mouvements.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
