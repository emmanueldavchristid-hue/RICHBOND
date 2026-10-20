/**
 * Stock fictif (LOT-07), tout passe par `applyMovement` (PMP, niveaux et historique cohérents) :
 * - 6 mois de sorties hebdomadaires régulières sur quelques articles (consommation moyenne exploitable) ;
 * - un article critique proche du point de commande (Roulement 6205, scénario S3) : couverture inférieure au délai ;
 * - deux articles dormants (entrée ancienne, aucune sortie) ;
 * - classe ABC calculée sur 12 mois.
 * Aucune donnée réelle. Idempotent : un article déjà marqué (commentaire du seed) n'est pas retouché.
 */
import type { PrismaClient } from "../../src/generated/prisma/client";

const DAY = 86_400_000;
const MARK = "Données fictives (seed LOT-07)";

interface Plan {
  name: string;
  /** Coût unitaire d'entrée, FCFA par unité de stock. */
  cost: number;
  /** Sortie hebdomadaire de base (unité de stock) ; 0 = article dormant. */
  weekly: number;
  /** Stock voulu à la fin. */
  target: number;
  /** Ancienneté (jours) de la première entrée. */
  entryDaysAgo: number;
}

const PLANS: Plan[] = [
  // S3 : critique, consommation ~1,4 U/jour, stock 25 -> couverture ~18 jours pour un délai de 20 jours, sous le point de commande (40).
  { name: "Roulement 6205", cost: 3800, weekly: 10, target: 25, entryDaysAgo: 190 },
  { name: "Roulement 6308", cost: 11500, weekly: 2, target: 60, entryDaysAgo: 190 },
  { name: "Courroie trapézoïdale SPZ 1250", cost: 9500, weekly: 1, target: 12, entryDaysAgo: 190 },
  { name: "Rame papier A4", cost: 620, weekly: 8, target: 70, entryDaysAgo: 190 },
  { name: "Graisse multi-usage", cost: 350, weekly: 5, target: 120, entryDaysAgo: 190 },
  { name: "Polyol polyéther PO-3000", cost: 1250, weekly: 2000, target: 20000, entryDaysAgo: 190 },
  { name: "Film étirable", cost: 533, weekly: 6, target: 40, entryDaysAgo: 190 },
  // Dormants : aucune sortie, dernière entrée il y a plus de 180 jours.
  { name: "Variateur de fréquence 7,5 kW", cost: 420000, weekly: 0, target: 1, entryDaysAgo: 250 },
  { name: "Buse de mélange", cost: 249000, weekly: 0, target: 2, entryDaysAgo: 220 },
];

const FACTORS = [1, 0.9, 1.1];

export async function seedStock(prisma: PrismaClient): Promise<void> {
  const magasinier = await prisma.user.findUnique({ where: { email: "magasinier@richbond.test" } });
  if (!magasinier) return;
  const { applyMovement } = await import("../../src/modules/stock/movements");
  const { classifyAbc } = await import("../../src/modules/stock/abc");
  const fallbackWh = await prisma.warehouse.findFirst({ where: { active: true }, orderBy: { code: "asc" } });
  const at = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY);
  let seq = 0;

  for (const plan of PLANS) {
    const item = await prisma.item.findFirst({ where: { name: plan.name, stocked: true } });
    if (!item) continue;
    if (await prisma.stockMovement.findFirst({ where: { itemId: item.id, comment: MARK }, select: { id: true } })) continue;
    const warehouseId = item.defaultWarehouseId ?? fallbackWh?.id;
    if (!warehouseId) continue;
    const existing = await prisma.stockLevel.findUnique({ where: { itemId_warehouseId: { itemId: item.id, warehouseId } } });
    const current = Number(existing?.quantity ?? 0);

    const weeks = plan.weekly > 0 ? 26 : 0;
    const issues = Array.from({ length: weeks }, (_, k) => ({
      daysAgo: 7 * (weeks - k) - 2,
      qty: Math.max(1, Math.round(plan.weekly * FACTORS[k % 3])),
    }));
    const totalOut = issues.reduce((s, i) => s + i.qty, 0);
    const needed = Math.max(totalOut + plan.target - current, totalOut > 0 ? totalOut : 1);
    const first = Math.ceil(needed * 0.6);
    const entries = plan.weekly > 0 ? [{ daysAgo: plan.entryDaysAgo, qty: first, cost: plan.cost }, { daysAgo: 95, qty: needed - first, cost: Math.round(plan.cost * 1.04) }] : [{ daysAgo: plan.entryDaysAgo, qty: needed, cost: plan.cost }];

    const events = [
      ...entries.map((e) => ({ ...e, kind: "in" as const })),
      ...issues.map((i) => ({ daysAgo: i.daysAgo, qty: i.qty, cost: 0, kind: "out" as const })),
    ].sort((a, b) => b.daysAgo - a.daysAgo);

    for (const ev of events) {
      seq += 1;
      await prisma.$transaction(async (tx) => {
        await applyMovement(tx, {
          itemId: item.id,
          warehouseId,
          type: ev.kind === "in" ? "ENTREE_RECEPTION" : "SORTIE",
          quantity: ev.kind === "in" ? ev.qty : -ev.qty,
          ...(ev.kind === "in" ? { unitCost: ev.cost } : {}),
          documentType: ev.kind === "in" ? "RECEPTION" : "SORTIE",
          documentRef: `${ev.kind === "in" ? "REC" : "SOR"}-DEMO-${String(seq).padStart(5, "0")}`,
          comment: MARK,
          occurredAt: at(ev.daysAgo),
          createdById: magasinier.id,
        });
      });
    }
  }

  // Classe ABC sur 12 mois de valeur sortie nette (même règle que « Recalculer »).
  const from = at(365);
  const [items, sums] = await Promise.all([
    prisma.item.findMany({ where: { stocked: true }, select: { id: true } }),
    prisma.stockMovement.groupBy({ by: ["itemId"], where: { type: "SORTIE", occurredAt: { gte: from } }, _sum: { value: true } }),
  ]);
  const valueById = new Map(sums.map((s) => [s.itemId, -(s._sum.value ?? 0)]));
  const classes = classifyAbc(items.map((i) => ({ id: i.id, value: valueById.get(i.id) ?? 0 })));
  const computedAt = new Date();
  for (const cls of ["A", "B", "C"] as const) {
    const ids = items.filter((i) => classes.get(i.id) === cls).map((i) => i.id);
    if (ids.length) await prisma.item.updateMany({ where: { id: { in: ids } }, data: { abcClass: cls, abcComputedAt: computedAt } });
  }
}
