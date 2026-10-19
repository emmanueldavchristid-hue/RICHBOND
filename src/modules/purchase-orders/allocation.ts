import { Prisma } from "@/generated/prisma/client";
import { BusinessError } from "@/lib/errors";
import { formatQty } from "@/lib/money";
import { toPurchaseQty, toStockQty } from "@/modules/referentials/conversion";

/**
 * D6-D8 : rattachement des lignes de BC aux lignes de DA (fichier pur).
 * - Reste à commander d'une ligne de DA = (quantité validée, sinon demandée) - somme des allocations des BC non refusés/annulés.
 * - Une ligne de BC est en unité d'achat ; une allocation est exprimée dans l'unité de la ligne de DA.
 */
export type QtyInput = string | number | Prisma.Decimal;

const Q = (v: QtyInput) => new Prisma.Decimal(v);
const ZERO = new Prisma.Decimal(0);

/** Au-delà de ce dépassement (%) de la quantité commandée sur le besoin alloué, le validateur est averti (D8). */
export const QTY_OVER_WARN_PCT = 10;

export interface ItemUnits {
  purchaseUnit: string;
  stockUnit: string;
  conversionFactor: QtyInput;
}

/** Besoin d'une ligne de DA : quantité validée, sinon demandée. */
export function requestLineNeed(l: { quantity: QtyInput; approvedQty?: QtyInput | null }): Prisma.Decimal {
  return Q(l.approvedQty ?? l.quantity);
}

/** Reste à commander (jamais négatif). */
export function remainingToOrder(need: QtyInput, allocated: QtyInput): Prisma.Decimal {
  const r = Q(need).minus(Q(allocated));
  return r.isNegative() ? ZERO : r;
}

/** Convertit une quantité entre l'unité d'achat et l'unité de stock d'un article ; toute autre unité est refusée. */
export function convertQty(qty: QtyInput, from: string, to: string, item: ItemUnits): Prisma.Decimal {
  if (from === to) return Q(qty);
  if (from === item.stockUnit && to === item.purchaseUnit) return toPurchaseQty(qty, item.conversionFactor);
  if (from === item.purchaseUnit && to === item.stockUnit) return toStockQty(qty, item.conversionFactor);
  throw new BusinessError("UNIT_INVALID", `Conversion impossible de ${from} vers ${to}.`);
}

/** Dépassement de la quantité commandée sur la quantité allouée, en % (null sans allocation). */
export function qtyOverPct(ordered: QtyInput, allocatedInOrderUnit: QtyInput): Prisma.Decimal | null {
  const a = Q(allocatedInOrderUnit);
  if (a.lte(0)) return null;
  return Q(ordered).minus(a).div(a).mul(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export const isQtyOverWarning = (pct: Prisma.Decimal | null): boolean => pct !== null && pct.gt(QTY_OVER_WARN_PCT);

export interface AllocationInput {
  requestLineId: string;
  /** Dans l'unité de la ligne de DA. */
  qty: QtyInput;
}

export interface OrderLineForAllocation {
  lineNo: number;
  itemId: string | null;
  /** Quantité commandée, en unité d'achat. */
  quantity: QtyInput;
  unit: string;
  allocations: AllocationInput[];
}

export interface RequestLineForAllocation {
  id: string;
  itemId: string | null;
  unit: string;
  /** Besoin de la ligne (quantité validée, sinon demandée). */
  need: QtyInput;
  /** Déjà alloué par d'autres BC non refusés/annulés (hors le BC contrôlé). */
  allocatedElsewhere: QtyInput;
  /** Pour les messages : « DA-2026-00012 ligne 2 ». */
  label: string;
}

/**
 * Contrôle complet des allocations d'un BC (appelé sous verrou des DA sources) :
 * ligne de DA connue et du même article, pas de doublon, quantité > 0, jamais plus que le reste à commander,
 * jamais plus que la quantité commandée sur la ligne de BC.
 */
export function validateAllocations(
  lines: OrderLineForAllocation[],
  requestLines: Map<string, RequestLineForAllocation>,
  items: Map<string, ItemUnits>,
): void {
  const perRequestLine = new Map<string, Prisma.Decimal>();
  for (const line of lines) {
    const seen = new Set<string>();
    let inOrderUnit = ZERO;
    for (const a of line.allocations) {
      const rl = requestLines.get(a.requestLineId);
      if (!rl) throw new BusinessError("ALLOCATION_INVALID", `Ligne ${line.lineNo} : la ligne de demande d'achat est introuvable ou n'est plus commandable.`);
      if (seen.has(a.requestLineId)) throw new BusinessError("ALLOCATION_INVALID", `Ligne ${line.lineNo} : ${rl.label} est rattachée deux fois.`);
      seen.add(a.requestLineId);
      if (Q(a.qty).lte(0)) throw new BusinessError("ALLOCATION_INVALID", `Ligne ${line.lineNo} : la quantité rattachée à ${rl.label} doit être strictement positive.`);
      if ((rl.itemId ?? null) !== (line.itemId ?? null)) {
        throw new BusinessError("ALLOCATION_INVALID", `Ligne ${line.lineNo} : ${rl.label} concerne un autre article.`);
      }
      perRequestLine.set(a.requestLineId, (perRequestLine.get(a.requestLineId) ?? ZERO).plus(Q(a.qty)));
      if (line.itemId) {
        const it = items.get(line.itemId);
        if (!it) throw new BusinessError("ALLOCATION_INVALID", `Ligne ${line.lineNo} : article introuvable.`);
        inOrderUnit = inOrderUnit.plus(convertQty(a.qty, rl.unit, line.unit, it));
      } else {
        if (rl.unit !== line.unit) throw new BusinessError("UNIT_INVALID", `Ligne ${line.lineNo} : l'unité doit être ${rl.unit} comme sur la demande d'achat.`);
        inOrderUnit = inOrderUnit.plus(Q(a.qty));
      }
    }
    if (inOrderUnit.gt(Q(line.quantity))) {
      throw new BusinessError(
        "ALLOCATION_ABOVE_LINE",
        `Ligne ${line.lineNo} : les besoins rattachés (${formatQty(inOrderUnit.toString())} ${line.unit}) dépassent la quantité commandée (${formatQty(Q(line.quantity).toString())} ${line.unit}).`,
      );
    }
  }
  for (const [id, total] of perRequestLine) {
    const rl = requestLines.get(id)!;
    const remaining = remainingToOrder(rl.need, rl.allocatedElsewhere);
    if (total.gt(remaining)) {
      throw new BusinessError(
        "ALLOCATION_EXCEEDED",
        `${rl.label} : il ne reste que ${formatQty(remaining.toString())} ${rl.unit} à commander (${formatQty(total.toString())} demandés). Une autre commande a peut-être déjà réservé ce besoin.`,
      );
    }
  }
}

/**
 * Répartit une quantité d'achat entre des lignes de DA (dans l'ordre fourni, par exemple les plus urgentes d'abord),
 * chacune plafonnée à son reste. Sert à pré-remplir un brouillon depuis « À commander ».
 */
export function autoAllocate(
  orderQty: QtyInput,
  orderUnit: string,
  targets: { requestLineId: string; unit: string; remaining: QtyInput }[],
  item: ItemUnits | null,
): AllocationInput[] {
  let left = Q(orderQty);
  const out: AllocationInput[] = [];
  for (const t of targets) {
    if (left.lte(0)) break;
    const remaining = Q(t.remaining);
    if (remaining.lte(0)) continue;
    const remainingInOrderUnit = item ? convertQty(remaining, t.unit, orderUnit, item) : remaining;
    const takeOrder = Prisma.Decimal.min(left, remainingInOrderUnit);
    const take = takeOrder.eq(remainingInOrderUnit) ? remaining : item ? convertQty(takeOrder, orderUnit, t.unit, item) : takeOrder;
    if (take.lte(0)) continue;
    out.push({ requestLineId: t.requestLineId, qty: take.toString() });
    left = left.minus(takeOrder);
  }
  return out;
}
