import "server-only";
import { db } from "@/lib/db";
import { now } from "@/lib/clock";
import { currentYear, noonAbidjan, todayAbidjan } from "@/lib/dates";
import { BusinessError } from "@/lib/errors";
import { can, requireAction, type PermissionUser } from "@/lib/permissions";
import { log } from "@/modules/audit";
import { formatDocumentNumber, nextNumber } from "@/modules/numbering";
import { parseInput } from "@/modules/purchase-requests/parse";
import { createSubmittedReplenishment } from "@/modules/purchase-requests/service";
import { addDaysIso, averageDailyConsumption, suggestedReorderPoint, suggestedSafetyStock } from "./forecast";
import { classifyAbc } from "./abc";
import type { AbcClass, ReorderPurchaseType } from "./labels";
import { applyMovements, lockStockLevels, type MovementInput } from "./movements";
import { Decimal } from "./pmp";
import { groupByPurchaseType } from "./reorder";
import { computeReorder } from "./queries";
import {
  adjustSchema,
  applyThresholdsSchema,
  cancelIssueSchema,
  createIssueSchema,
  createReorderRequestsSchema,
  recomputeAbcSchema,
  transferSchema,
} from "./schemas";
import { FORECAST_ITEM_SELECT, itemLeadTime, loadStats } from "./stats";
import { getSettings } from "@/modules/settings/service";
import type { AbcResult, AdjustResult, IssueResult, ReorderRequestResult, ThresholdsResult, TransferResult } from "./types";

/**
 * Écritures du stock (LOT-07) : sorties, transferts, ajustements, demandes de réapprovisionnement, seuils, ABC.
 * Chaque écriture : une transaction (numéro -> document -> mouvements via `applyMovements` -> audit). Le stock ne change
 * que par `applyMovements`.
 */

export interface StockActor extends PermissionUser {
  id: string;
}

const MAX_BACKDATE_DAYS = 31;
const ABC_WINDOW_DAYS = 365;
const DAY_MS = 86_400_000;

/** Date métier d'un mouvement : l'instant réel si la pièce est du jour, sinon midi (Abidjan) du jour saisi. */
const movementDate = (day: string, today: string, at: Date) => (day === today ? at : noonAbidjan(day));
const dateOnly = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const dec = (v: unknown) => new Decimal(String(v));

export function assertIssuedAtValid(issuedAt: string, today: string): void {
  if (issuedAt > today) throw new BusinessError("DATE_FUTURE", "La date de la sortie ne peut pas être dans le futur.");
  if (issuedAt < addDaysIso(today, -MAX_BACKDATE_DAYS)) {
    throw new BusinessError("DATE_TROP_ANCIENNE", `La date de la sortie ne peut pas remonter à plus de ${MAX_BACKDATE_DAYS} jours.`);
  }
}

async function assertWarehouseActive(tx: Pick<typeof db, "warehouse">, id: string, label = "Dépôt") {
  const w = await tx.warehouse.findUnique({ where: { id }, select: { id: true, active: true } });
  if (!w || !w.active) throw new BusinessError("DEPOT_INTROUVABLE", `${label} introuvable ou inactif.`);
}

// ------------------------------------------------------------------ bon de sortie

export async function createIssue(actor: StockActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<IssueResult> {
  requireAction(actor, "stock.issue");
  const input = parseInput(createIssueSchema, raw);
  const today = todayAbidjan(at);
  const issuedAt = input.issuedAt ?? today;
  assertIssuedAtValid(issuedAt, today);

  return db.$transaction(async (tx) => {
    await assertWarehouseActive(tx, input.warehouseId);
    const dept = await tx.department.findUnique({ where: { id: input.departmentId }, select: { active: true } });
    if (!dept || !dept.active) throw new BusinessError("DEPARTMENT_INVALID", "Service inconnu ou désactivé.");
    const items = await tx.item.findMany({ where: { id: { in: input.lines.map((l) => l.itemId) } }, select: { id: true, code: true, category: true, stocked: true } });
    const byId = new Map(items.map((i) => [i.id, i]));
    for (const l of input.lines) {
      const it = byId.get(l.itemId);
      if (!it) throw new BusinessError("NOT_FOUND", "Un article de la sortie est introuvable.");
      if (!it.stocked) throw new BusinessError("ARTICLE_NON_STOCKE", `L'article ${it.code} n'est pas géré en stock.`);
    }
    if (!input.equipment && items.some((i) => i.category === "PDR")) {
      throw new BusinessError("MACHINE_OBLIGATOIRE", "La machine ou l'équipement est obligatoire pour la sortie d'une pièce de rechange (PDR).");
    }

    const year = currentYear(at);
    const number = formatDocumentNumber("SOR", year, await nextNumber("SOR", year, tx));
    const issue = await tx.stockIssue.create({
      data: {
        number,
        status: "VALIDEE",
        warehouseId: input.warehouseId,
        departmentId: input.departmentId,
        requesterName: input.requesterName,
        reason: input.reason,
        equipment: input.equipment,
        issuedAt: dateOnly(issuedAt),
        createdById: actor.id,
      },
    });
    const lineRows: Awaited<ReturnType<typeof tx.stockIssueLine.create>>[] = [];
    for (const l of input.lines) {
      lineRows.push(await tx.stockIssueLine.create({ data: { issueId: issue.id, itemId: l.itemId, quantity: dec(l.quantity), unitCost: 0, value: 0 } }));
    }
    const occurredAt = movementDate(issuedAt, today, at);
    const movements = await applyMovements(
      tx,
      input.lines.map((l, i): MovementInput => ({
        itemId: l.itemId,
        warehouseId: input.warehouseId,
        type: "SORTIE",
        quantity: dec(l.quantity).neg(),
        documentType: "SORTIE",
        documentId: issue.id,
        documentRef: number,
        issueLineId: lineRows[i].id,
        comment: input.reason,
        occurredAt,
        createdById: actor.id,
      })),
    );
    let total = 0;
    for (const [i, m] of movements.entries()) {
      total += -m.value;
      await tx.stockIssueLine.update({ where: { id: lineRows[i].id }, data: { unitCost: m.unitCost, value: -m.value } });
    }
    await log(tx, {
      userId: actor.id,
      action: "STOCK_ISSUE_CREATE",
      entity: "StockIssue",
      entityId: issue.id,
      after: {
        number,
        warehouseId: input.warehouseId,
        departmentId: input.departmentId,
        requesterName: input.requesterName,
        reason: input.reason,
        equipment: input.equipment,
        issuedAt,
        totalValue: total,
        lines: input.lines.map((l) => ({ itemId: l.itemId, quantity: String(l.quantity) })),
      },
      ip,
    });
    return { id: issue.id, number, ...(can(actor, "price.viewPmp") ? { totalValue: total } : {}) };
  });
}

/** Annulation par contre-passation (Responsable) : chaque mouvement de la sortie est inversé, le stock est remis. */
export async function cancelIssue(actor: StockActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<{ id: string; number: string }> {
  requireAction(actor, "stock.adjust");
  const input = parseInput(cancelIssueSchema, raw);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM stock_issues WHERE id = ${input.id} FOR UPDATE`;
    const issue = await tx.stockIssue.findUnique({ where: { id: input.id }, include: { lines: { select: { id: true } } } });
    if (!issue) throw new BusinessError("NOT_FOUND", "Bon de sortie introuvable.");
    if (issue.status !== "VALIDEE") throw new BusinessError("ISSUE_ALREADY_CANCELLED", "Ce bon de sortie est déjà annulé.");
    const originals = await tx.stockMovement.findMany({
      where: { issueLineId: { in: issue.lines.map((l) => l.id) }, reversalOfId: null },
      orderBy: { createdAt: "asc" },
    });
    await applyMovements(
      tx,
      originals.map((m): MovementInput => ({
        itemId: m.itemId,
        warehouseId: m.warehouseId,
        type: m.type,
        quantity: new Decimal(m.quantity).neg(),
        documentType: "SORTIE",
        documentId: issue.id,
        documentRef: issue.number,
        reversalOfId: m.id,
        comment: `Annulation : ${input.reason}`,
        occurredAt: at,
        createdById: actor.id,
      })),
    );
    await tx.stockIssue.update({ where: { id: issue.id }, data: { status: "ANNULEE", cancelledAt: at, cancelledById: actor.id, cancelledReason: input.reason } });
    await log(tx, {
      userId: actor.id,
      action: "STOCK_ISSUE_CANCEL",
      entity: "StockIssue",
      entityId: issue.id,
      before: { status: "VALIDEE", number: issue.number },
      after: { status: "ANNULEE", reason: input.reason, reversedMovements: originals.length },
      ip,
    });
    return { id: issue.id, number: issue.number };
  });
}

// ------------------------------------------------------------------ transfert

/** Transfert entre dépôts : sortie au PMP du dépôt source, entrée au même coût dans le dépôt d'arrivée (TRF-AAAA-NNNNN). */
export async function transfer(actor: StockActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<TransferResult> {
  requireAction(actor, "stock.transfer");
  const input = parseInput(transferSchema, raw);
  return db.$transaction(async (tx) => {
    await assertWarehouseActive(tx, input.fromWarehouseId, "Dépôt de départ");
    await assertWarehouseActive(tx, input.toWarehouseId, "Dépôt d'arrivée");
    const year = currentYear(at);
    const number = formatDocumentNumber("TRF", year, await nextNumber("TRF", year, tx));
    // Tous les verrous d'abord, dans l'ordre (article, dépôt) : deux transferts inverses ne s'interbloquent pas.
    await lockStockLevels(
      tx,
      input.lines.flatMap((l) => [
        { itemId: l.itemId, warehouseId: input.fromWarehouseId },
        { itemId: l.itemId, warehouseId: input.toWarehouseId },
      ]),
    );
    const base = { type: "TRANSFERT" as const, documentType: "TRANSFERT" as const, documentRef: number, comment: input.comment, occurredAt: at, createdById: actor.id };
    const outs = await applyMovements(
      tx,
      input.lines.map((l): MovementInput => ({ ...base, itemId: l.itemId, warehouseId: input.fromWarehouseId, quantity: dec(l.quantity).neg() })),
    );
    await applyMovements(
      tx,
      input.lines.map((l, i): MovementInput => ({ ...base, itemId: l.itemId, warehouseId: input.toWarehouseId, quantity: dec(l.quantity), unitCost: outs[i].unitCost })),
    );
    await log(tx, {
      userId: actor.id,
      action: "STOCK_TRANSFER",
      entity: "StockMovement",
      entityId: outs[0].id,
      after: { number, from: input.fromWarehouseId, to: input.toWarehouseId, comment: input.comment, lines: input.lines.map((l) => ({ itemId: l.itemId, quantity: String(l.quantity) })) },
      ip,
    });
    return { number };
  });
}

// ------------------------------------------------------------------ ajustement

/** Ajustement manuel (Responsable) : motif obligatoire, valorisé au PMP (ajout : coût saisi, sinon PMP). */
export async function adjust(actor: StockActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<AdjustResult> {
  requireAction(actor, "stock.adjust");
  const input = parseInput(adjustSchema, raw);
  return db.$transaction(async (tx) => {
    await assertWarehouseActive(tx, input.warehouseId);
    const level = await tx.stockLevel.findUnique({ where: { itemId_warehouseId: { itemId: input.itemId, warehouseId: input.warehouseId } } });
    if (input.quantity > 0 && input.unitCost === null && (!level || dec(level.pmp).lte(0))) {
      throw new BusinessError("COUT_INVALIDE", "Indiquez le coût unitaire : cet article n'a pas encore de PMP dans ce dépôt.");
    }
    const year = currentYear(at);
    const number = formatDocumentNumber("AJU", year, await nextNumber("AJU", year, tx));
    const [m] = await applyMovements(tx, [
      {
        itemId: input.itemId,
        warehouseId: input.warehouseId,
        type: "AJUSTEMENT",
        quantity: dec(input.quantity),
        ...(input.quantity > 0 && input.unitCost !== null ? { unitCost: dec(input.unitCost) } : {}),
        documentType: "AJUSTEMENT",
        documentRef: number,
        comment: input.reason,
        occurredAt: at,
        createdById: actor.id,
      },
    ]);
    await log(tx, {
      userId: actor.id,
      action: "STOCK_ADJUST",
      entity: "StockMovement",
      entityId: m.id,
      before: { stock: dec(m.stockAfter).sub(m.quantity).toString(), pmp: m.pmpBefore.toString() },
      after: { number, itemId: input.itemId, warehouseId: input.warehouseId, quantity: String(input.quantity), stock: m.stockAfter.toString(), pmp: m.pmpAfter.toString(), value: m.value, reason: input.reason },
      ip,
    });
    return { number, stockAfter: dec(m.stockAfter).toString(), pmpAfter: dec(m.pmpAfter).toString() };
  });
}

// ------------------------------------------------------------------ réapprovisionnement

/**
 * « Créer les DA » : une DA de réapprovisionnement par type d'achat (local / import / à définir d'après le fournisseur
 * principal), au statut SOUMISE, via le service des demandes d'achat. Les articles doivent toujours être sous leur point de commande.
 */
export async function createReorderRequests(actor: StockActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<ReorderRequestResult> {
  requireAction(actor, "stock.reorder");
  const input = parseInput(createReorderRequestsSchema, raw);
  return db.$transaction(async (tx) => {
    const computed = await computeReorder(tx, at);
    const byId = new Map(computed.map((c) => [c.row.itemId, c]));
    const today = todayAbidjan(at);
    const picked = input.items.map((req) => {
      const c = byId.get(req.itemId);
      if (!c) throw new BusinessError("HORS_REAPPRO", "Un article choisi n'est plus sous son point de commande : actualisez la liste.");
      return { row: c.row, quantity: req.quantity ?? Number(c.row.suggestedQty) };
    });
    const groups = groupByPurchaseType(picked.map((p) => ({ ...p, purchaseType: p.row.purchaseType })));

    const dept =
      (await tx.department.findFirst({ where: { active: true, code: "LOG" } })) ?? (await tx.department.findFirst({ where: { active: true }, orderBy: { name: "asc" } }));
    if (!dept) throw new BusinessError("DEPARTMENT_INVALID", "Aucun service actif : créez un service dans les paramètres.");
    const user = await tx.user.findUnique({ where: { id: actor.id }, select: { name: true } });

    const requests: ReorderRequestResult["requests"] = [];
    for (const [type, rows] of groups) {
      const stockouts = rows.map((r) => r.row.stockoutDate?.toISOString().slice(0, 10)).filter((d): d is string => !!d);
      const earliest = stockouts.length ? stockouts.sort()[0] : null;
      const neededBy = earliest && earliest > today ? earliest : earliest ? today : addDaysIso(today, 14);
      const urgent = rows.some((r) => r.row.severity === "ROUGE");
      const pr = await createSubmittedReplenishment(
        tx,
        actor,
        {
          type: type as ReorderPurchaseType,
          departmentId: dept.id,
          requesterName: user?.name ?? "Magasin",
          reason: `Réapprovisionnement : ${rows.length} article(s) sous le point de commande`,
          urgency: urgent ? "URGENTE" : "NORMALE",
          neededBy,
          lines: rows.map((r) => ({ itemId: r.row.itemId, quantity: r.quantity })),
        },
        ip,
        at,
      );
      requests.push({ id: pr.id, number: pr.number ?? pr.displayNumber, type, lineCount: rows.length });
    }
    return { requests };
  });
}

// ------------------------------------------------------------------ seuils suggérés et ABC (Responsable)

/** Applique les seuils suggérés (stock de sécurité et point de commande) ; jamais automatique. Article sans consommation : ignoré. */
export async function applySuggestedThresholds(actor: StockActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<ThresholdsResult> {
  requireAction(actor, "stock.thresholds");
  const input = parseInput(applyThresholdsSchema, raw);
  const settings = await getSettings();
  return db.$transaction(async (tx) => {
    const items = await tx.item.findMany({
      where: { stocked: true, status: "ACTIF", ...(input.itemIds ? { id: { in: input.itemIds } } : {}) },
      select: FORECAST_ITEM_SELECT,
    });
    const stats = await loadStats(tx, { itemIds: input.itemIds, at, settings });
    let updated = 0;
    let skipped = 0;
    for (const item of items) {
      const daily = averageDailyConsumption(stats.get(item.id)?.consumed ?? 0, settings.stockConsumptionWindowDays);
      if (daily.lte(0)) {
        skipped += 1;
        continue;
      }
      const lead = itemLeadTime(item, settings);
      const safety = suggestedSafetyStock(daily, lead, item.criticality);
      const rop = suggestedReorderPoint(daily, lead, item.criticality);
      if (item.safetyStock && item.reorderPoint && dec(item.safetyStock).eq(safety) && dec(item.reorderPoint).eq(rop)) {
        skipped += 1;
        continue;
      }
      await tx.item.update({ where: { id: item.id }, data: { safetyStock: safety, reorderPoint: rop } });
      await log(tx, {
        userId: actor.id,
        action: "ITEM_THRESHOLDS_APPLY",
        entity: "Item",
        entityId: item.id,
        before: { safetyStock: item.safetyStock?.toString() ?? null, reorderPoint: item.reorderPoint?.toString() ?? null },
        after: { safetyStock: safety.toString(), reorderPoint: rop.toString(), avgDailyConsumption: daily.toString(), leadTimeDays: lead },
        ip,
      });
      updated += 1;
    }
    return { updated, skipped };
  });
}

/** Recalcule la classe ABC (valeur sortie nette sur 12 mois ; sans consommation = C). */
export async function recomputeAbc(actor: StockActor, raw: unknown = {}, ip?: string | null, at: Date = now()): Promise<AbcResult> {
  requireAction(actor, "stock.thresholds");
  parseInput(recomputeAbcSchema, raw);
  return db.$transaction(async (tx) => {
    const from = new Date(at.getTime() - ABC_WINDOW_DAYS * DAY_MS);
    const [items, sums] = await Promise.all([
      tx.item.findMany({ where: { stocked: true }, select: { id: true } }),
      tx.stockMovement.groupBy({ by: ["itemId"], where: { type: "SORTIE", occurredAt: { gte: from, lte: at } }, _sum: { value: true } }),
    ]);
    const valueById = new Map(sums.map((s) => [s.itemId, -(s._sum.value ?? 0)]));
    const classes = classifyAbc(items.map((i) => ({ id: i.id, value: valueById.get(i.id) ?? 0 })));
    const counts: Record<AbcClass, number> = { A: 0, B: 0, C: 0 };
    for (const cls of ["A", "B", "C"] as const) {
      const ids = items.filter((i) => classes.get(i.id) === cls).map((i) => i.id);
      counts[cls] = ids.length;
      if (ids.length) await tx.item.updateMany({ where: { id: { in: ids } }, data: { abcClass: cls, abcComputedAt: at } });
    }
    await log(tx, { userId: actor.id, action: "ITEM_ABC_RECOMPUTE", entity: "Item", entityId: "ABC", after: { ...counts, computedAt: at.toISOString() }, ip });
    return { ...counts, computedAt: at };
  });
}
