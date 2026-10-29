import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { now } from "@/lib/clock";
import { currentYear } from "@/lib/dates";
import { BusinessError } from "@/lib/errors";
import { requireAction, type PermissionUser } from "@/lib/permissions";
import { log } from "@/modules/audit";
import { formatDocumentNumber, nextNumber } from "@/modules/numbering";
import { parseInput } from "@/modules/purchase-requests/parse";
import { getSettings } from "@/modules/settings/service";
import { applyMovements, lockStockLevels } from "@/modules/stock/movements";
import { Decimal, roundQty } from "@/modules/stock/pmp";
import {
  adjustmentQuantity,
  computeVariance,
  finalQuantity,
  linesMissingReason,
  needsRecount,
  OPEN_STATUSES,
  reliabilityPct,
  type InventoryStatus,
  type SelectionReason,
  type Thresholds,
} from "./rules";
import {
  addLinesSchema,
  cancelCountSchema,
  countIdSchema,
  createInventorySchema,
  removeLineSchema,
  requestRecountSchema,
  saveCountSchema,
  submitCountSchema,
  validateCountSchema,
} from "./schemas";
import { itemsInOpenCounts, loadRotatingSelection, warehouseItemsWhere } from "./selection";

/**
 * Écritures des inventaires (LOT-11). Chaque écriture : une transaction -> audit.
 * Le stock ne change QUE à la validation, via `applyMovements` (AJUSTEMENT_INVENTAIRE).
 */

export interface InventoryActor extends PermissionUser {
  id: string;
}

type Tx = Prisma.TransactionClient;
const dec = (v: unknown) => new Decimal(String(v));

const STATUS_FR: Record<InventoryStatus, string> = {
  PREPARE: "Préparé",
  EN_COMPTAGE: "En comptage",
  A_VALIDER: "À valider",
  VALIDE: "Validé",
  ANNULE: "Annulé",
};

async function loadCount(tx: Tx, countId: string) {
  const count = await tx.inventoryCount.findUnique({ where: { id: countId } });
  if (!count) throw new BusinessError("INVENTAIRE_INTROUVABLE", "Inventaire introuvable.");
  return count;
}

function assertStatus(count: { status: string; number: string }, allowed: InventoryStatus[], message: string) {
  if (!allowed.includes(count.status as InventoryStatus)) {
    throw new BusinessError("STATUT_INVALIDE", `${message} (${count.number} est au statut « ${STATUS_FR[count.status as InventoryStatus]} »).`);
  }
}

function thresholdsOf(count: { thresholdPct: unknown; thresholdValue: number }): Thresholds {
  return { pct: dec(count.thresholdPct), value: count.thresholdValue };
}

// ------------------------------------------------------------------ création / préparation

async function assertCountable(tx: Tx, warehouseId: string, itemIds: string[], exceptCountId?: string) {
  const items = await tx.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, code: true, stocked: true, status: true } });
  if (items.length !== itemIds.length) throw new BusinessError("ARTICLE_INTROUVABLE", "Un article est introuvable.");
  const bad = items.find((i) => !i.stocked || i.status !== "ACTIF");
  if (bad) throw new BusinessError("ARTICLE_NON_STOCKE", `L'article ${bad.code} n'est pas un article de stock actif.`);
  const busy = await itemsInOpenCounts(tx, warehouseId, exceptCountId);
  const clash = items.find((i) => busy.has(i.id));
  if (clash) throw new BusinessError("ARTICLE_DEJA_EN_INVENTAIRE", `L'article ${clash.code} figure déjà dans un inventaire en cours pour ce dépôt.`);
}

export async function createInventoryCount(actor: InventoryActor, raw: unknown, ip?: string | null, at: Date = now()) {
  requireAction(actor, "inventory.prepare");
  const input = parseInput(createInventorySchema, raw);
  const settings = await getSettings();

  return db.$transaction(async (tx) => {
    const wh = await tx.warehouse.findUnique({ where: { id: input.warehouseId }, select: { id: true, active: true } });
    if (!wh || !wh.active) throw new BusinessError("DEPOT_INTROUVABLE", "Dépôt introuvable ou inactif.");

    let picks: { itemId: string; reason: SelectionReason }[];
    if (input.kind === "COMPLET") {
      const items = await tx.item.findMany({ where: warehouseItemsWhere(wh.id), select: { id: true } });
      const busy = await itemsInOpenCounts(tx, wh.id);
      picks = items.filter((i) => !busy.has(i.id)).map((i) => ({ itemId: i.id, reason: "COMPLET" as const }));
    } else if (input.itemIds) {
      const ids = [...new Set(input.itemIds)];
      await assertCountable(tx, wh.id, ids);
      const auto = new Map((await loadRotatingSelection(tx, wh.id, at, 10_000)).map((c) => [c.itemId, c.reason]));
      picks = ids.map((itemId) => ({ itemId, reason: auto.get(itemId) ?? ("AJOUT_MANUEL" as const) }));
    } else {
      picks = (await loadRotatingSelection(tx, wh.id, at)).map((c) => ({ itemId: c.itemId, reason: c.reason }));
    }
    if (picks.length === 0) {
      throw new BusinessError("SELECTION_VIDE", "Aucun article à inventorier pour ce dépôt : tout est à jour ou déjà dans un inventaire en cours.");
    }

    const year = currentYear(at);
    const number = formatDocumentNumber("INV", year, await nextNumber("INV", year, tx));
    const count = await tx.inventoryCount.create({
      data: {
        number,
        kind: input.kind,
        warehouseId: wh.id,
        plannedFor: input.plannedFor ? new Date(`${input.plannedFor}T00:00:00.000Z`) : null,
        comment: input.comment ?? null,
        thresholdPct: input.thresholdPct ?? settings.inventoryThresholdPct,
        thresholdValue: input.thresholdValue ?? settings.inventoryThresholdValue,
        createdById: actor.id,
        lines: { create: picks.map((p) => ({ itemId: p.itemId, selectionReason: p.reason })) },
      },
    });
    await log(tx, {
      userId: actor.id,
      action: "INVENTORY_CREATE",
      entity: "InventoryCount",
      entityId: count.id,
      after: { number, kind: input.kind, warehouseId: wh.id, lines: picks.length, thresholdPct: String(count.thresholdPct), thresholdValue: count.thresholdValue },
      ip,
    });
    return { id: count.id, number, lineCount: picks.length };
  });
}

export async function addInventoryLines(actor: InventoryActor, raw: unknown, ip?: string | null) {
  requireAction(actor, "inventory.prepare");
  const input = parseInput(addLinesSchema, raw);
  return db.$transaction(async (tx) => {
    const count = await loadCount(tx, input.countId);
    assertStatus(count, ["PREPARE"], "La liste n'est modifiable que tant que le comptage n'est pas ouvert");
    const ids = [...new Set(input.itemIds)];
    const existing = await tx.inventoryCountLine.findMany({ where: { countId: count.id, itemId: { in: ids } }, select: { itemId: true } });
    const have = new Set(existing.map((e) => e.itemId));
    const toAdd = ids.filter((i) => !have.has(i));
    await assertCountable(tx, count.warehouseId, toAdd, count.id);
    if (toAdd.length > 0) {
      await tx.inventoryCountLine.createMany({ data: toAdd.map((itemId) => ({ countId: count.id, itemId, selectionReason: "AJOUT_MANUEL" })) });
    }
    await log(tx, { userId: actor.id, action: "INVENTORY_LINES_UPDATE", entity: "InventoryCount", entityId: count.id, after: { number: count.number, added: toAdd.length }, ip });
    return { added: toAdd.length };
  });
}

export async function removeInventoryLine(actor: InventoryActor, raw: unknown, ip?: string | null) {
  requireAction(actor, "inventory.prepare");
  const input = parseInput(removeLineSchema, raw);
  return db.$transaction(async (tx) => {
    const count = await loadCount(tx, input.countId);
    assertStatus(count, ["PREPARE"], "La liste n'est modifiable que tant que le comptage n'est pas ouvert");
    const line = await tx.inventoryCountLine.findFirst({ where: { id: input.lineId, countId: count.id } });
    if (!line) throw new BusinessError("LIGNE_INTROUVABLE", "Ligne introuvable.");
    const remaining = await tx.inventoryCountLine.count({ where: { countId: count.id } });
    if (remaining <= 1) throw new BusinessError("LISTE_VIDE", "Un inventaire doit garder au moins un article (sinon, annulez-le).");
    await tx.inventoryCountLine.delete({ where: { id: line.id } });
    await log(tx, { userId: actor.id, action: "INVENTORY_LINES_UPDATE", entity: "InventoryCount", entityId: count.id, after: { number: count.number, removedItemId: line.itemId }, ip });
    return { removed: 1 };
  });
}

// ------------------------------------------------------------------ ouverture : le théorique est figé

export async function openInventoryCount(actor: InventoryActor, raw: unknown, ip?: string | null, at: Date = now()) {
  requireAction(actor, "inventory.count");
  const input = parseInput(countIdSchema, raw);
  return db.$transaction(async (tx) => {
    const count = await loadCount(tx, input.countId);
    assertStatus(count, ["PREPARE"], "Le comptage ne peut être ouvert que depuis l'état Préparé");
    const lines = await tx.inventoryCountLine.findMany({ where: { countId: count.id }, select: { id: true, itemId: true } });
    if (lines.length === 0) throw new BusinessError("LISTE_VIDE", "Aucun article à compter.");
    // Verrou des niveaux de stock : le cliché (quantité + PMP) est cohérent avec les mouvements déjà validés.
    await lockStockLevels(tx, lines.map((l) => ({ itemId: l.itemId, warehouseId: count.warehouseId })));
    const levels = await tx.stockLevel.findMany({ where: { warehouseId: count.warehouseId, itemId: { in: lines.map((l) => l.itemId) } } });
    const byItem = new Map(levels.map((l) => [l.itemId, l]));
    for (const l of lines) {
      const lvl = byItem.get(l.itemId);
      await tx.inventoryCountLine.update({
        where: { id: l.id },
        data: { theoreticalQty: lvl ? lvl.quantity : 0, pmp: lvl ? lvl.pmp : 0 },
      });
    }
    await tx.inventoryCount.update({ where: { id: count.id }, data: { status: "EN_COMPTAGE", openedAt: at, openedById: actor.id } });
    await log(tx, { userId: actor.id, action: "INVENTORY_OPEN", entity: "InventoryCount", entityId: count.id, before: { status: count.status }, after: { number: count.number, status: "EN_COMPTAGE", lines: lines.length }, ip });
    return { id: count.id, number: count.number, lineCount: lines.length };
  });
}

// ------------------------------------------------------------------ saisie (aveugle, idempotente)

export interface BlindSaveResult {
  saved: number;
  unchanged: number;
  /** Lignes à recompter (sans aucune quantité attendue). */
  recountLineIds: string[];
  progress: { counted: number; total: number };
}

async function progressOf(tx: Tx, countId: string) {
  const [total, counted, recount] = await Promise.all([
    tx.inventoryCountLine.count({ where: { countId } }),
    tx.inventoryCountLine.count({ where: { countId, countedQty: { not: null } } }),
    tx.inventoryCountLine.findMany({ where: { countId, recountRequired: true }, select: { id: true } }),
  ]);
  return { progress: { counted, total }, recountLineIds: recount.map((r) => r.id) };
}

/** Premier comptage. Sauvegarde automatique : renvoyer la même valeur ne change rien et n'écrit pas d'audit. */
export async function saveInventoryCount(actor: InventoryActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<BlindSaveResult> {
  requireAction(actor, "inventory.count");
  const input = parseInput(saveCountSchema, raw);
  return writeCounts(actor, input.countId, input.lines, "COUNT", ip, at);
}

/** Recomptage (écart au-dessus du seuil, ou demandé par le Responsable). Remplace le premier comptage dans le calcul. */
export async function saveInventoryRecount(actor: InventoryActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<BlindSaveResult> {
  requireAction(actor, "inventory.count");
  const input = parseInput(saveCountSchema, raw);
  return writeCounts(actor, input.countId, input.lines, "RECOUNT", ip, at);
}

async function writeCounts(
  actor: InventoryActor,
  countId: string,
  entries: { lineId: string; quantity: number }[],
  phase: "COUNT" | "RECOUNT",
  ip: string | null | undefined,
  at: Date,
): Promise<BlindSaveResult> {
  return db.$transaction(async (tx) => {
    const count = await loadCount(tx, countId);
    assertStatus(count, ["EN_COMPTAGE"], "La saisie n'est possible que pendant le comptage");
    const thresholds = thresholdsOf(count);
    // Dernière valeur envoyée pour une même ligne.
    const wanted = new Map(entries.map((e) => [e.lineId, roundQty(e.quantity)]));
    const lines = await tx.inventoryCountLine.findMany({ where: { countId, id: { in: [...wanted.keys()] } } });
    if (lines.length !== wanted.size) throw new BusinessError("LIGNE_INTROUVABLE", "Une ligne ne fait pas partie de cet inventaire.");
    let saved = 0;
    let unchanged = 0;
    for (const l of lines) {
      const qty = wanted.get(l.id)!;
      if (phase === "COUNT") {
        if (l.countedQty !== null && dec(l.countedQty).eq(qty)) {
          // Même quantité : on rafraîchit la date, c'est une confirmation (utile après un mouvement : COMPTAGE_PERIME).
          await tx.inventoryCountLine.update({ where: { id: l.id }, data: { countedAt: at } });
          unchanged++;
          continue;
        }
        if (l.recountQty !== null) throw new BusinessError("DEJA_RECOMPTE", "Cet article a déjà été recompté : saisissez le recomptage.");
        const recountRequired = needsRecount({ theoreticalQty: l.theoreticalQty ?? 0, pmp: l.pmp ?? 0, countedQty: qty, recountQty: null }, thresholds);
        await tx.inventoryCountLine.update({ where: { id: l.id }, data: { countedQty: qty, countedById: actor.id, countedAt: at, recountRequired } });
      } else {
        if (l.countedQty === null) throw new BusinessError("COMPTAGE_MANQUANT", "Comptez d'abord cet article avant de le recompter.");
        if (l.recountQty !== null && dec(l.recountQty).eq(qty)) {
          await tx.inventoryCountLine.update({ where: { id: l.id }, data: { recountAt: at } });
          unchanged++;
          continue;
        }
        await tx.inventoryCountLine.update({ where: { id: l.id }, data: { recountQty: qty, recountAt: at, recountById: actor.id, recountRequired: false } });
      }
      saved++;
    }
    if (saved > 0) {
      // Pas de quantité dans le journal : seulement le nombre de lignes.
      await log(tx, { userId: actor.id, action: "INVENTORY_COUNT_SAVE", entity: "InventoryCount", entityId: count.id, after: { number: count.number, phase, lines: saved }, ip });
    }
    return { saved, unchanged, ...(await progressOf(tx, countId)) };
  });
}

// ------------------------------------------------------------------ mouvements pendant le comptage

/** Dernier mouvement de stock par article depuis l'ouverture du comptage (dépôt du comptage). */
export async function movementsSinceOpening(
  tx: Pick<Tx, "stockMovement">,
  count: { warehouseId: string; openedAt: Date | null },
  itemIds: string[],
): Promise<Map<string, Date>> {
  if (!count.openedAt || itemIds.length === 0) return new Map();
  const rows = await tx.stockMovement.groupBy({
    by: ["itemId"],
    where: { warehouseId: count.warehouseId, itemId: { in: itemIds }, createdAt: { gt: count.openedAt } },
    _max: { createdAt: true },
  });
  return new Map(rows.filter((r) => r._max.createdAt).map((r) => [r.itemId, r._max.createdAt!]));
}

/** Persiste le drapeau et retourne les articles comptés AVANT leur dernier mouvement (comptage périmé). */
async function flagMovedLines(tx: Tx, count: Awaited<ReturnType<typeof loadCount>>) {
  const lines = await tx.inventoryCountLine.findMany({ where: { countId: count.id }, include: { item: { select: { code: true } } } });
  const moved = await movementsSinceOpening(tx, count, lines.map((l) => l.itemId));
  const stale: string[] = [];
  for (const l of lines) {
    const last = moved.get(l.itemId);
    const flag = !!last;
    if (flag !== l.movedDuringCount) await tx.inventoryCountLine.update({ where: { id: l.id }, data: { movedDuringCount: flag } });
    const countedAt = l.recountAt ?? l.countedAt;
    if (last && countedAt && last > countedAt) stale.push(l.item.code);
  }
  return { lines, stale, movedCount: moved.size };
}

// ------------------------------------------------------------------ soumission

export async function submitInventoryCount(actor: InventoryActor, raw: unknown, ip?: string | null, at: Date = now()) {
  requireAction(actor, "inventory.count");
  const input = parseInput(submitCountSchema, raw);
  return db.$transaction(async (tx) => {
    const count = await loadCount(tx, input.countId);
    assertStatus(count, ["EN_COMPTAGE"], "Seul un inventaire en comptage peut être soumis");
    const { lines, stale, movedCount } = await flagMovedLines(tx, count);
    const missing = lines.filter((l) => l.countedQty === null).length;
    if (missing > 0) throw new BusinessError("COMPTAGE_INCOMPLET", `${missing} article(s) ne sont pas encore comptés.`);
    const toRecount = lines.filter((l) => l.recountRequired).length;
    if (toRecount > 0) throw new BusinessError("RECOMPTAGE_REQUIS", `${toRecount} article(s) sont à recompter avant de soumettre l'inventaire.`);
    if (stale.length > 0) {
      throw new BusinessError("COMPTAGE_PERIME", `Du stock a bougé après le comptage de : ${stale.slice(0, 5).join(", ")}${stale.length > 5 ? "…" : ""}. Recomptez ces articles.`);
    }
    await tx.inventoryCount.update({ where: { id: count.id }, data: { status: "A_VALIDER", submittedAt: at, submittedById: actor.id } });
    await log(tx, { userId: actor.id, action: "INVENTORY_SUBMIT", entity: "InventoryCount", entityId: count.id, before: { status: count.status }, after: { number: count.number, status: "A_VALIDER", lines: lines.length, movedDuringCount: movedCount }, ip });
    return { id: count.id, number: count.number, movedDuringCount: movedCount };
  });
}

/** Le Responsable renvoie des lignes en recomptage : l'inventaire repasse EN COMPTAGE. */
export async function requestInventoryRecount(actor: InventoryActor, raw: unknown, ip?: string | null) {
  requireAction(actor, "inventory.validate");
  const input = parseInput(requestRecountSchema, raw);
  return db.$transaction(async (tx) => {
    const count = await loadCount(tx, input.countId);
    assertStatus(count, ["A_VALIDER"], "Un recomptage ne se demande que sur un inventaire à valider");
    const ids = [...new Set(input.lineIds)];
    const res = await tx.inventoryCountLine.updateMany({
      where: { countId: count.id, id: { in: ids } },
      data: { recountRequired: true, recountQty: null, recountAt: null, recountById: null },
    });
    if (res.count !== ids.length) throw new BusinessError("LIGNE_INTROUVABLE", "Une ligne ne fait pas partie de cet inventaire.");
    await tx.inventoryCount.update({ where: { id: count.id }, data: { status: "EN_COMPTAGE", submittedAt: null, submittedById: null } });
    await log(tx, { userId: actor.id, action: "INVENTORY_RECOUNT_REQUEST", entity: "InventoryCount", entityId: count.id, before: { status: count.status }, after: { number: count.number, lines: ids.length, comment: input.comment ?? null }, ip });
    return { id: count.id, requested: ids.length };
  });
}

// ------------------------------------------------------------------ validation : seul endroit où le stock bouge

export async function validateInventoryCount(actor: InventoryActor, raw: unknown, ip?: string | null, at: Date = now()) {
  requireAction(actor, "inventory.validate");
  const input = parseInput(validateCountSchema, raw);
  return db.$transaction(async (tx) => {
    const count = await loadCount(tx, input.countId);
    assertStatus(count, ["A_VALIDER"], "Seul un inventaire à valider peut être validé");
    const thresholds = thresholdsOf(count);

    const { stale } = await flagMovedLines(tx, count);
    if (stale.length > 0) {
      throw new BusinessError("COMPTAGE_PERIME", `Du stock a bougé après le comptage de : ${stale.slice(0, 5).join(", ")}. Demandez un recomptage avant de valider.`);
    }
    const reasonByLine = new Map(input.reasons.map((r) => [r.lineId, r.reason]));
    const lines = await tx.inventoryCountLine.findMany({ where: { countId: count.id }, include: { item: { select: { code: true, name: true } } }, orderBy: { item: { code: "asc" } } });
    if (lines.some((l) => finalQuantity(l) === null || l.theoreticalQty === null)) {
      throw new BusinessError("COMPTAGE_INCOMPLET", "Des articles ne sont pas comptés.");
    }

    const rows = lines.map((l) => {
      const finalQty = finalQuantity(l)!;
      const variance = computeVariance(l.theoreticalQty!, finalQty, l.pmp ?? 0, thresholds);
      return { line: l, finalQty, variance, reason: (reasonByLine.get(l.id) ?? l.varianceReason)?.trim() || null };
    });
    const missingReason = linesMissingReason(
      rows.map((r) => ({ id: r.line.id, code: r.line.item.code, exceedsThreshold: r.variance.exceedsThreshold, varianceReason: r.reason })),
    );
    if (missingReason.length > 0) {
      throw new BusinessError(
        "MOTIF_OBLIGATOIRE",
        `Motif obligatoire pour les écarts importants : ${missingReason.slice(0, 5).map((m) => m.code).join(", ")}${missingReason.length > 5 ? "…" : ""}.`,
      );
    }

    // Ajustements : stock actuel verrouillé, delta = quantité retenue - stock actuel.
    await lockStockLevels(tx, lines.map((l) => ({ itemId: l.itemId, warehouseId: count.warehouseId })));
    const levels = await tx.stockLevel.findMany({ where: { warehouseId: count.warehouseId, itemId: { in: lines.map((l) => l.itemId) } } });
    const current = new Map(levels.map((l) => [l.itemId, l.quantity]));
    const planned = rows
      .map((r) => ({ r, delta: adjustmentQuantity(r.finalQty, current.get(r.line.itemId) ?? 0) }))
      .filter((p) => !p.delta.isZero());
    const movements = await applyMovements(
      tx,
      planned.map((p) => ({
        itemId: p.r.line.itemId,
        warehouseId: count.warehouseId,
        type: "AJUSTEMENT_INVENTAIRE" as const,
        quantity: p.delta,
        documentType: "INVENTAIRE" as const,
        documentId: count.id,
        documentRef: count.number,
        comment: p.r.reason ? `Inventaire ${count.number} : ${p.r.reason}` : `Inventaire ${count.number}`,
        occurredAt: at,
        createdById: actor.id,
      })),
    );
    for (let i = 0; i < planned.length; i++) {
      await tx.inventoryCountLine.update({ where: { id: planned[i].r.line.id }, data: { adjustmentMovementId: movements[i].id } });
    }
    for (const r of rows) {
      if (r.reason && r.reason !== r.line.varianceReason) await tx.inventoryCountLine.update({ where: { id: r.line.id }, data: { varianceReason: r.reason } });
    }

    const reliability = reliabilityPct(rows.map((r) => r.variance.quantity));
    const netValue = movements.reduce((s, m) => s + m.value, 0);
    await tx.inventoryCount.update({
      where: { id: count.id },
      data: { status: "VALIDE", validatedAt: at, validatedById: actor.id, reliabilityPct: reliability },
    });
    await log(tx, {
      userId: actor.id,
      action: "INVENTORY_VALIDATE",
      entity: "InventoryCount",
      entityId: count.id,
      before: { status: count.status },
      after: { number: count.number, status: "VALIDE", adjustments: movements.length, netAdjustmentValue: netValue, reliabilityPct: reliability.toString() },
      ip,
    });
    return { id: count.id, number: count.number, adjustments: movements.length, netAdjustmentValue: netValue, reliabilityPct: reliability.toString() };
  });
}

// ------------------------------------------------------------------ annulation

export async function cancelInventoryCount(actor: InventoryActor, raw: unknown, ip?: string | null, at: Date = now()) {
  requireAction(actor, "inventory.cancel");
  const input = parseInput(cancelCountSchema, raw);
  return db.$transaction(async (tx) => {
    const count = await loadCount(tx, input.countId);
    if (!OPEN_STATUSES.includes(count.status as InventoryStatus)) {
      throw new BusinessError("STATUT_INVALIDE", `Un inventaire « ${STATUS_FR[count.status as InventoryStatus]} » ne peut pas être annulé.`);
    }
    await tx.inventoryCount.update({ where: { id: count.id }, data: { status: "ANNULE", cancelledAt: at, cancelledById: actor.id, cancelledReason: input.reason } });
    await log(tx, { userId: actor.id, action: "INVENTORY_CANCEL", entity: "InventoryCount", entityId: count.id, before: { status: count.status }, after: { number: count.number, status: "ANNULE", reason: input.reason }, ip });
    return { id: count.id, number: count.number };
  });
}
