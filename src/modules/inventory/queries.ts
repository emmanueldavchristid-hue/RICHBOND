import "server-only";
import { db } from "@/lib/db";
import { now } from "@/lib/clock";
import { BusinessError } from "@/lib/errors";
import { can, requireAction, type PermissionUser } from "@/lib/permissions";
import { parseInput } from "@/modules/purchase-requests/parse";
import { Decimal } from "@/modules/stock/pmp";
import { SHEET_LINE_SELECT, toBlindLine } from "./dto";
import { computeVariance, finalQuantity, reliabilityPct, type InventoryStatus, type SelectionReason } from "./rules";
import { countIdSchema, listCountsSchema, proposeSelectionSchema, searchItemsSchema } from "./schemas";
import { loadRotatingSelection, warehouseItemsWhere } from "./selection";
import { movementsSinceOpening } from "./service";
import type { BlindSheet, InventoryCountSummary, InventoryReview, ReviewLine, SelectionRow } from "./types";

/**
 * Lectures des inventaires.
 * - `getBlindSheet` : feuille de comptage SANS théorique/PMP/valeur (Magasinier et Responsable en saisie).
 * - `getInventoryReview` : vue complète (écarts, valeurs) réservée à `inventory.view` (jamais le Magasinier).
 */

const dec = (v: unknown) => new Decimal(String(v));

export async function listInventoryCounts(user: PermissionUser, raw?: unknown): Promise<InventoryCountSummary[]> {
  const seesAll = can(user, "inventory.view");
  if (!seesAll) requireAction(user, "inventory.count");
  const f = parseInput(listCountsSchema, raw);
  const rows = await db.inventoryCount.findMany({
    where: { ...(f.status ? { status: f.status } : {}), ...(f.warehouseId ? { warehouseId: f.warehouseId } : {}) },
    select: {
      id: true,
      number: true,
      status: true,
      kind: true,
      plannedFor: true,
      createdAt: true,
      openedAt: true,
      reliabilityPct: true,
      warehouse: { select: { id: true, code: true, name: true } },
      _count: { select: { lines: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const counted = await db.inventoryCountLine.groupBy({
    by: ["countId"],
    where: { countId: { in: rows.map((r) => r.id) }, countedQty: { not: null } },
    _count: { _all: true },
  });
  const countedBy = new Map(counted.map((c) => [c.countId, c._count._all]));
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    status: r.status as InventoryStatus,
    kind: r.kind,
    warehouse: r.warehouse,
    plannedFor: r.plannedFor,
    createdAt: r.createdAt,
    openedAt: r.openedAt,
    lineCount: r._count.lines,
    countedCount: countedBy.get(r.id) ?? 0,
    reliabilityPct: seesAll && r.reliabilityPct !== null ? r.reliabilityPct.toString() : null,
  }));
}

/** Feuille de comptage aveugle. Le `select` Prisma ne lit pas les colonnes théorique/PMP. */
export async function getBlindSheet(user: PermissionUser, raw: unknown): Promise<BlindSheet> {
  requireAction(user, "inventory.count");
  const { countId } = parseInput(countIdSchema, raw);
  const count = await db.inventoryCount.findUnique({
    where: { id: countId },
    select: {
      id: true,
      number: true,
      status: true,
      plannedFor: true,
      warehouse: { select: { id: true, code: true, name: true } },
      lines: { select: SHEET_LINE_SELECT, orderBy: { item: { code: "asc" } } },
    },
  });
  if (!count) throw new BusinessError("INVENTAIRE_INTROUVABLE", "Inventaire introuvable.");
  const lines = count.lines.map(toBlindLine);
  return {
    blind: true,
    id: count.id,
    number: count.number,
    status: count.status as InventoryStatus,
    warehouse: count.warehouse,
    plannedFor: count.plannedFor,
    total: lines.length,
    counted: lines.filter((l) => l.countedQty !== null).length,
    lines,
  };
}

/** Écarts en quantité et en valeur (PMP figé), drapeaux de mouvements. Réservé à `inventory.view`. */
export async function getInventoryReview(user: PermissionUser, raw: unknown): Promise<InventoryReview> {
  requireAction(user, "inventory.view");
  const { countId } = parseInput(countIdSchema, raw);
  const count = await db.inventoryCount.findUnique({
    where: { id: countId },
    include: {
      warehouse: { select: { id: true, code: true, name: true } },
      lines: { include: { item: { select: { code: true, name: true, stockUnit: true } } }, orderBy: { item: { code: "asc" } } },
    },
  });
  if (!count) throw new BusinessError("INVENTAIRE_INTROUVABLE", "Inventaire introuvable.");
  const thresholds = { pct: dec(count.thresholdPct), value: count.thresholdValue };
  const moved = await movementsSinceOpening(db, count, count.lines.map((l) => l.itemId));

  const lines: ReviewLine[] = count.lines.map((l) => {
    const finalQty = finalQuantity(l);
    const frozen = l.theoreticalQty !== null;
    const v = frozen && finalQty ? computeVariance(l.theoreticalQty!, finalQty, l.pmp ?? 0, thresholds) : null;
    return {
      id: l.id,
      itemId: l.itemId,
      code: l.item.code,
      name: l.item.name,
      unit: l.item.stockUnit,
      selectionReason: l.selectionReason as SelectionReason,
      theoreticalQty: l.theoreticalQty?.toString() ?? null,
      pmp: l.pmp?.toString() ?? null,
      countedQty: l.countedQty?.toString() ?? null,
      recountQty: l.recountQty?.toString() ?? null,
      finalQty: finalQty?.toString() ?? null,
      varianceQty: v?.quantity.toString() ?? null,
      varianceValue: v?.value ?? null,
      variancePct: v ? (v.pct === null ? null : v.pct.toDecimalPlaces(2).toString()) : null,
      exceedsThreshold: v?.exceedsThreshold ?? false,
      recountRequired: l.recountRequired,
      varianceReason: l.varianceReason,
      movedDuringCount: l.movedDuringCount || moved.has(l.itemId),
    };
  });
  const measured = lines.filter((l) => l.varianceQty !== null);
  const live = reliabilityPct(measured.map((l) => l.varianceQty!));
  return {
    id: count.id,
    number: count.number,
    status: count.status as InventoryStatus,
    kind: count.kind,
    warehouse: count.warehouse,
    thresholdPct: count.thresholdPct.toString(),
    thresholdValue: count.thresholdValue,
    openedAt: count.openedAt,
    submittedAt: count.submittedAt,
    validatedAt: count.validatedAt,
    comment: count.comment,
    lines,
    totals: {
      lines: lines.length,
      counted: measured.length,
      withVariance: measured.filter((l) => !dec(l.varianceQty).isZero()).length,
      exceeding: lines.filter((l) => l.exceedsThreshold).length,
      movedDuringCount: lines.filter((l) => l.movedDuringCount).length,
      varianceValue: measured.reduce((s, l) => s + (l.varianceValue ?? 0), 0),
      absVarianceValue: measured.reduce((s, l) => s + Math.abs(l.varianceValue ?? 0), 0),
    },
    reliabilityPct: count.reliabilityPct?.toString() ?? live.toString(),
  };
}

/** Liste tournante proposée pour la semaine (Responsable). Rien n'est enregistré. */
export async function proposeInventorySelection(user: PermissionUser, raw: unknown, at: Date = now()): Promise<SelectionRow[]> {
  requireAction(user, "inventory.prepare");
  const input = parseInput(proposeSelectionSchema, raw);
  const rows = await loadRotatingSelection(db, input.warehouseId, at, input.cap);
  return rows.map((r) => ({ itemId: r.itemId, code: r.code, name: r.name, abcClass: r.abcClass, reason: r.reason, lastCountedAt: r.lastCountedAt }));
}

/** Recherche d'articles à ajouter à une liste (Responsable) : code ou désignation. */
export async function searchInventoryItems(user: PermissionUser, raw: unknown) {
  requireAction(user, "inventory.prepare");
  const input = parseInput(searchItemsSchema, raw);
  const items = await db.item.findMany({
    where: {
      ...warehouseItemsWhere(input.warehouseId),
      ...(input.q ? { OR: [{ code: { contains: input.q, mode: "insensitive" } }, { name: { contains: input.q, mode: "insensitive" } }] } : {}),
    },
    select: { id: true, code: true, name: true, abcClass: true },
    orderBy: { code: "asc" },
    take: 30,
  });
  return items;
}

/** Historique de fiabilité (derniers inventaires validés) + moyenne : indicateur du tableau de bord. */
export async function getInventoryReliability(user: PermissionUser, warehouseId?: string) {
  requireAction(user, "inventory.view");
  const rows = await db.inventoryCount.findMany({
    where: { status: "VALIDE", ...(warehouseId ? { warehouseId } : {}) },
    select: { id: true, number: true, validatedAt: true, reliabilityPct: true, warehouse: { select: { name: true } } },
    orderBy: { validatedAt: "desc" },
    take: 12,
  });
  const history = rows.map((r) => ({ id: r.id, number: r.number, validatedAt: r.validatedAt, warehouse: r.warehouse.name, reliabilityPct: r.reliabilityPct?.toString() ?? "0" }));
  const last = history[0]?.reliabilityPct ?? null;
  return { last, history };
}
