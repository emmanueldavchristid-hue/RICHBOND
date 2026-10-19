import "server-only";
import { formatInTimeZone } from "date-fns-tz";
import { db } from "@/lib/db";
import { now } from "@/lib/clock";
import { APP_TZ, currentYear, formatDateOnly } from "@/lib/dates";
import { BusinessError } from "@/lib/errors";
import { requireAction } from "@/lib/permissions";
import { Prisma, type PurchaseRequestEventType, type PurchaseRequestStatus } from "@/generated/prisma/client";
import { log } from "@/modules/audit";
import { notify } from "@/modules/notifications";
import { formatDocumentNumber, nextNumber } from "@/modules/numbering";
import { toStockQty } from "@/modules/referentials/conversion";
import { lockFresh } from "@/modules/referentials/concurrency";
import { buyerCoversType, pickLeastLoaded } from "./assignment";
import { duplicateWarnings, type DuplicateWarning } from "./commitments";
import { displayNumber, PR_URGENCY_LABELS, type PrKind, type PrType } from "./labels";
import { parseInput } from "./parse";
import { assertNeededByNotPast, dateOnly, effectivePriority, priorityOf, resolveNeededBy } from "./priority";
import {
  approveManySchema,
  approveRequestSchema,
  assignBuyerSchema,
  cancelRequestSchema,
  commentRequestSchema,
  createReplenishmentSchema,
  createRequestSchema,
  rejectRequestSchema,
  requestVersionSchema,
  returnRequestSchema,
  updateRequestSchema,
  type RequestLine,
} from "./schemas";
import { estimatedTotal } from "./totals";
import { assertTransition, type PrAction, type WorkflowUser } from "./workflow";

/** Utilisateur qui agit (compatible `CurrentUser`). */
export type RequestUser = WorkflowUser;

type Tx = Prisma.TransactionClient;

export interface RequestResult {
  id: string;
  number: string | null;
  displayNumber: string;
  status: PurchaseRequestStatus;
  updatedAt: Date;
}

const OPEN_FOR_BUYER: PurchaseRequestStatus[] = ["VALIDEE", "EN_CONSULTATION", "PARTIELLEMENT_COMMANDEE"];

const todayIso = (at: Date) => formatInTimeZone(at, APP_TZ, "yyyy-MM-dd");
const link = (id: string) => `/achats/demandes/${id}`;
const asJson = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

function result(pr: { id: string; number: string | null; status: PurchaseRequestStatus; updatedAt: Date }): RequestResult {
  return { id: pr.id, number: pr.number, displayNumber: displayNumber(pr), status: pr.status, updatedAt: pr.updatedAt };
}

async function recordEvent(
  tx: Tx,
  e: {
    requestId: string;
    type: PurchaseRequestEventType;
    userId: string;
    from?: PurchaseRequestStatus | null;
    to?: PurchaseRequestStatus | null;
    comment?: string | null;
    payload?: unknown;
    at: Date;
  },
) {
  await tx.purchaseRequestEvent.create({
    data: {
      requestId: e.requestId,
      type: e.type,
      userId: e.userId,
      fromStatus: e.from ?? null,
      toStatus: e.to ?? null,
      comment: e.comment ?? null,
      payload: e.payload === undefined ? undefined : asJson(e.payload),
      createdAt: e.at,
    },
  });
}

/** Verrouille la ligne (FOR UPDATE), contrôle la version puis charge la DA et ses lignes. */
async function loadLocked(tx: Tx, id: string, expectedUpdatedAt: Date) {
  await lockFresh(tx, "purchase_requests", id, expectedUpdatedAt);
  const pr = await tx.purchaseRequest.findUnique({ where: { id }, include: { lines: { orderBy: { lineNo: "asc" } } } });
  if (!pr) throw new BusinessError("NOT_FOUND", "Demande d'achat introuvable.");
  return pr;
}

async function activeResponsableIds(tx: Tx, excludeId?: string): Promise<string[]> {
  const rows = await tx.user.findMany({
    where: { role: "RESPONSABLE_ACHATS", active: true, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function assertDepartmentUsable(tx: Tx, id: string) {
  const d = await tx.department.findUnique({ where: { id } });
  if (!d || !d.active) throw new BusinessError("DEPARTMENT_INVALID", "Service inconnu ou désactivé.");
}

/** D8 : contrôle des articles, unités et conversion ; prix retirés si `allowPrices` est faux. */
async function buildLines(tx: Tx, lines: RequestLine[], opts: { kind: PrKind; allowPrices: boolean }) {
  const itemIds = lines.map((l) => l.itemId).filter((x): x is string => !!x);
  const items = await tx.item.findMany({ where: { id: { in: itemIds } } });
  const byId = new Map(items.map((i) => [i.id, i]));
  return lines.map((l, idx) => {
    const lineNo = idx + 1;
    const price = opts.allowPrices ? l.estimatedUnitPrice : null;
    if (!l.itemId) {
      return {
        lineNo,
        itemId: null,
        freeDesignation: l.freeDesignation,
        quantity: new Prisma.Decimal(l.quantity),
        unit: l.unit!,
        stockQty: null,
        estimatedUnitPrice: price,
        note: l.note,
      };
    }
    const it = byId.get(l.itemId);
    if (!it) throw new BusinessError("NOT_FOUND", `Ligne ${lineNo} : article introuvable.`);
    if (it.status !== "ACTIF") {
      throw new BusinessError("ITEM_NOT_ACTIVE", `Ligne ${lineNo} : l'article ${it.code} est bloqué ou obsolète.`);
    }
    if (opts.kind === "REAPPRO" && !it.stocked) {
      throw new BusinessError("ITEM_NOT_STOCKED", `Ligne ${lineNo} : l'article ${it.code} n'est pas un article stocké.`);
    }
    const unit = l.unit ?? it.purchaseUnit;
    if (unit !== it.purchaseUnit && unit !== it.stockUnit) {
      throw new BusinessError(
        "UNIT_INVALID",
        `Ligne ${lineNo} : l'unité doit être ${it.purchaseUnit} (achat) ou ${it.stockUnit} (stock) pour l'article ${it.code}.`,
      );
    }
    const qty = new Prisma.Decimal(l.quantity);
    const stockQty = unit === it.purchaseUnit ? toStockQty(qty, it.conversionFactor) : qty;
    return {
      lineNo,
      itemId: it.id,
      freeDesignation: null,
      quantity: qty,
      unit,
      stockQty,
      estimatedUnitPrice: price,
      note: l.note,
    };
  });
}

function auditView(pr: {
  number: string | null;
  status: string;
  kind: string;
  urgency: string;
  type: string;
  departmentId: string;
  requesterName: string;
  reason: string;
  neededBy: Date;
  estimatedTotal: number | null;
  assignedBuyerId?: string | null;
}, lineCount?: number) {
  return {
    number: pr.number,
    status: pr.status,
    kind: pr.kind,
    urgency: pr.urgency,
    type: pr.type,
    departmentId: pr.departmentId,
    requesterName: pr.requesterName,
    reason: pr.reason,
    neededBy: pr.neededBy.toISOString().slice(0, 10),
    estimatedTotal: pr.estimatedTotal,
    assignedBuyerId: pr.assignedBuyerId ?? null,
    ...(lineCount === undefined ? {} : { lines: lineCount }),
  };
}

// ------------------------------------------------------------------ création / modification

/** Création d'un brouillon. Magasinier : DA de réapprovisionnement (articles stockés, sans prix). Pas de numéro. */
export async function createRequest(actor: RequestUser, raw: unknown, ip?: string | null, at: Date = now()): Promise<RequestResult> {
  const kind: PrKind = actor.role === "MAGASINIER" ? "REAPPRO" : "STANDARD";
  requireAction(actor, kind === "REAPPRO" ? "purchaseRequest.createReplenishment" : "purchaseRequest.create");
  const input = parseInput(kind === "REAPPRO" ? createReplenishmentSchema : createRequestSchema, raw);
  const today = todayIso(at);
  const neededBy = resolveNeededBy(input.urgency, input.neededBy, today);
  if (!neededBy) throw new BusinessError("VALIDATION", "La date de besoin est obligatoire.");
  assertNeededByNotPast(neededBy, today);

  return db.$transaction(async (tx) => {
    await assertDepartmentUsable(tx, input.departmentId);
    const lines = await buildLines(tx, input.lines, { kind, allowPrices: actor.role !== "MAGASINIER" });
    const pr = await tx.purchaseRequest.create({
      data: {
        status: "BROUILLON",
        kind,
        urgency: input.urgency,
        priority: priorityOf(input.urgency),
        type: input.type,
        departmentId: input.departmentId,
        requesterName: input.requesterName,
        reason: input.reason,
        neededBy: dateOnly(neededBy),
        estimatedTotal: estimatedTotal(lines),
        createdById: actor.id,
        lines: { create: lines },
      },
    });
    await recordEvent(tx, { requestId: pr.id, type: "CREATED", userId: actor.id, to: "BROUILLON", at });
    await log(tx, { userId: actor.id, action: "PR_CREATE", entity: "PurchaseRequest", entityId: pr.id, after: auditView(pr, lines.length), ip });
    return result(pr);
  });
}

/** Modification du contenu (brouillon ou à compléter), version contrôlée. */
export async function updateRequest(actor: RequestUser, raw: unknown, ip?: string | null, at: Date = now()): Promise<RequestResult> {
  const input = parseInput(updateRequestSchema, raw);
  const today = todayIso(at);
  const neededBy = resolveNeededBy(input.urgency, input.neededBy, today);
  if (!neededBy) throw new BusinessError("VALIDATION", "La date de besoin est obligatoire.");

  return db.$transaction(async (tx) => {
    const before = await loadLocked(tx, input.id, input.expectedUpdatedAt);
    assertTransition(before, "edit", actor);
    if (neededBy !== before.neededBy.toISOString().slice(0, 10)) assertNeededByNotPast(neededBy, today);
    if (before.kind === "REAPPRO" && input.lines.some((l) => !l.itemId)) {
      throw new BusinessError("VALIDATION", "Une DA de réapprovisionnement ne porte que sur des articles du catalogue.");
    }
    await assertDepartmentUsable(tx, input.departmentId);
    const lines = await buildLines(tx, input.lines, { kind: before.kind, allowPrices: actor.role !== "MAGASINIER" });
    await tx.purchaseRequestLine.deleteMany({ where: { requestId: before.id } });
    const after = await tx.purchaseRequest.update({
      where: { id: before.id },
      data: {
        urgency: input.urgency,
        priority: priorityOf(input.urgency),
        type: input.type,
        departmentId: input.departmentId,
        requesterName: input.requesterName,
        reason: input.reason,
        neededBy: dateOnly(neededBy),
        estimatedTotal: estimatedTotal(lines),
        lines: { create: lines },
      },
    });
    await recordEvent(tx, {
      requestId: before.id,
      type: "UPDATED",
      userId: actor.id,
      payload: { lines: lines.length },
      at,
    });
    await log(tx, {
      userId: actor.id,
      action: "PR_UPDATE",
      entity: "PurchaseRequest",
      entityId: before.id,
      before: auditView(before, before.lines.length),
      after: auditView(after, lines.length),
      ip,
    });
    return result(after);
  });
}

// ------------------------------------------------------------------ soumission

export interface SubmitResult extends RequestResult {
  duplicates: DuplicateWarning[];
}

/**
 * BROUILLON / A_COMPLETER -> SOUMISE. Le numéro DA-AAAA-NNNNN est attribué ici, dans la même transaction,
 * à la première soumission seulement (une DA renvoyée « à compléter » garde son numéro).
 */
export async function submitRequest(actor: RequestUser, raw: unknown, ip?: string | null, at: Date = now()): Promise<SubmitResult> {
  const input = parseInput(requestVersionSchema, raw);
  const out = await db.$transaction(async (tx) => {
    const pr = await loadLocked(tx, input.id, input.expectedUpdatedAt);
    const { to } = assertTransition(pr, "submit", actor);
    if (pr.lines.length === 0) throw new BusinessError("NO_LINES", "Ajoutez au moins une ligne avant de soumettre la demande.");
    assertNeededByNotPast(pr.neededBy.toISOString().slice(0, 10), todayIso(at));
    await assertDepartmentUsable(tx, pr.departmentId);
    const itemIds = pr.lines.map((l) => l.itemId).filter((x): x is string => !!x);
    const inactive = await tx.item.findMany({ where: { id: { in: itemIds }, status: { not: "ACTIF" } }, select: { code: true } });
    if (inactive.length > 0) {
      throw new BusinessError(
        "ITEM_NOT_ACTIVE",
        `Article(s) bloqué(s) ou obsolète(s) : ${inactive.map((i) => i.code).join(", ")}. Retirez-les avant de soumettre.`,
      );
    }

    const resubmission = pr.number !== null;
    let number = pr.number;
    if (!number) {
      const value = await nextNumber("DA", currentYear(at), tx);
      number = formatDocumentNumber("DA", currentYear(at), value);
    }
    const after = await tx.purchaseRequest.update({
      where: { id: pr.id },
      data: { status: to!, number, submittedAt: at },
    });
    await recordEvent(tx, {
      requestId: pr.id,
      type: resubmission ? "RESUBMITTED" : "SUBMITTED",
      userId: actor.id,
      from: pr.status,
      to: to!,
      payload: { number },
      at,
    });
    await log(tx, {
      userId: actor.id,
      action: "PR_SUBMIT",
      entity: "PurchaseRequest",
      entityId: pr.id,
      before: { status: pr.status, number: pr.number },
      after: { status: after.status, number: after.number, urgency: after.urgency },
      ip,
    });

    // D17 : le Responsable est prévenu tout de suite ; arrêt de production = gravité critique.
    const stop = after.urgency === "ARRET_PRODUCTION";
    const dept = await tx.department.findUnique({ where: { id: after.departmentId }, select: { name: true } });
    await notify(tx, await activeResponsableIds(tx, actor.id), {
      type: "PR_SUBMITTED",
      severity: stop ? "CRITIQUE" : after.urgency === "URGENTE" ? "IMPORTANT" : "INFO",
      title: stop ? `Arrêt de production : ${number} à valider` : `${number} à valider`,
      body: `${PR_URGENCY_LABELS[after.urgency]} – ${dept?.name ?? ""} – ${after.requesterName} : ${after.reason.slice(0, 120)}`,
      link: link(pr.id),
      entity: "PurchaseRequest",
      entityId: pr.id,
    });
    const duplicates = await duplicateWarnings(tx, itemIds, pr.id);
    return { ...result(after), duplicates };
  });
  return out;
}

// ------------------------------------------------------------------ validation

async function candidateBuyers(tx: Tx, type: "LOCAL" | "IMPORT") {
  const buyers = await tx.user.findMany({
    where: { role: "ACHETEUR", active: true, purchaseScope: { in: type === "LOCAL" ? ["LOCAL", "ALL"] : ["IMPORT", "ALL"] } },
    select: { id: true, name: true, purchaseScope: true },
  });
  const counts = await tx.purchaseRequest.groupBy({
    by: ["assignedBuyerId"],
    where: { assignedBuyerId: { in: buyers.map((b) => b.id) }, status: { in: OPEN_FOR_BUYER } },
    _count: { _all: true },
  });
  const byId = new Map(counts.map((c) => [c.assignedBuyerId, c._count._all]));
  return buyers.map((b) => ({ ...b, openCount: byId.get(b.id) ?? 0 }));
}

async function resolveBuyer(tx: Tx, type: "LOCAL" | "IMPORT", wantedId: string | null) {
  if (wantedId) {
    const u = await tx.user.findUnique({ where: { id: wantedId }, select: { id: true, name: true, role: true, active: true, purchaseScope: true } });
    if (!u || !u.active || u.role !== "ACHETEUR") {
      throw new BusinessError("BUYER_INVALID", "L'acheteur choisi est introuvable ou inactif.");
    }
    if (!buyerCoversType(u.purchaseScope, type)) {
      throw new BusinessError(
        "BUYER_OUT_OF_SCOPE",
        `Cet acheteur n'est pas habilité pour les achats ${type === "LOCAL" ? "locaux" : "import"}.`,
      );
    }
    return { id: u.id, name: u.name };
  }
  const picked = pickLeastLoaded(await candidateBuyers(tx, type));
  return picked ? { id: picked.id, name: picked.name } : null;
}

export interface ApproveResult extends RequestResult {
  autoApproved: boolean;
  assignedBuyer: { id: string; name: string } | null;
  unassigned: boolean;
  changedLines: number;
  duplicates: DuplicateWarning[];
}

/**
 * SOUMISE -> VALIDEE (Responsable). Quantités modifiables (tracées), type obligatoire si « À définir »,
 * assignation automatique à l'acheteur du périmètre le moins chargé (ou choix explicite).
 */
export async function approveRequest(actor: RequestUser, raw: unknown, ip?: string | null, at: Date = now()): Promise<ApproveResult> {
  const input = parseInput(approveRequestSchema, raw);
  return db.$transaction(async (tx) => {
    const pr = await loadLocked(tx, input.id, input.expectedUpdatedAt);
    const { to, autoApproved } = assertTransition(pr, "approve", actor);

    const finalType = (input.type ?? pr.type) as PrType;
    if (finalType === "A_DEFINIR") {
      throw new BusinessError("TYPE_REQUIRED", "Choisissez Local ou Import avant de valider cette demande.");
    }

    // D9 : quantités validées
    const wanted = new Map((input.lines ?? []).map((l) => [l.lineId, new Prisma.Decimal(l.approvedQty)]));
    for (const id of wanted.keys()) {
      if (!pr.lines.some((l) => l.id === id)) throw new BusinessError("VALIDATION", "Ligne inconnue pour cette demande.");
    }
    const approved = pr.lines.map((l) => {
      const q = wanted.get(l.id) ?? l.quantity;
      if (q.gt(l.quantity)) {
        throw new BusinessError(
          "QTY_ABOVE_REQUEST",
          `Ligne ${l.lineNo} : la quantité validée ne peut pas dépasser la quantité demandée (${l.quantity.toString()}).`,
        );
      }
      return { line: l, qty: q };
    });
    if (!approved.some((a) => a.qty.gt(0))) {
      throw new BusinessError("ALL_LINES_REMOVED", "Au moins une ligne doit rester à une quantité supérieure à 0. Refusez la demande sinon.");
    }

    const buyer = await resolveBuyer(tx, finalType, input.buyerId);
    const changed = approved.filter((a) => !a.qty.eq(a.line.quantity));
    for (const a of approved) {
      await tx.purchaseRequestLine.update({ where: { id: a.line.id }, data: { approvedQty: a.qty } });
    }
    const total = estimatedTotal(approved.map((a) => ({ quantity: a.line.quantity, approvedQty: a.qty, estimatedUnitPrice: a.line.estimatedUnitPrice })));
    const after = await tx.purchaseRequest.update({
      where: { id: pr.id },
      data: {
        status: to!,
        type: finalType,
        approvedAt: at,
        approvedById: actor.id,
        assignedBuyerId: buyer?.id ?? null,
        estimatedTotal: total,
      },
    });

    const changedItemIds = changed.map((a) => a.line.itemId).filter((x): x is string => !!x);
    const changedItems = new Map(
      (await tx.item.findMany({ where: { id: { in: changedItemIds } }, select: { id: true, code: true, name: true } })).map((i) => [i.id, i]),
    );
    for (const a of changed) {
      const it = a.line.itemId ? changedItems.get(a.line.itemId) : undefined;
      const designation = it ? `${it.code} – ${it.name}` : (a.line.freeDesignation ?? "");
      await recordEvent(tx, {
        requestId: pr.id,
        type: "QTY_CHANGED",
        userId: actor.id,
        payload: { lineNo: a.line.lineNo, code: it?.code ?? null, designation, before: a.line.quantity.toString(), after: a.qty.toString(), unit: a.line.unit },
        at,
      });
      await log(tx, {
        userId: actor.id,
        action: "PR_QTY_CHANGE",
        entity: "PurchaseRequest",
        entityId: pr.id,
        before: { lineNo: a.line.lineNo, quantity: a.line.quantity.toString() },
        after: { lineNo: a.line.lineNo, approvedQty: a.qty.toString() },
        ip,
      });
    }
    await recordEvent(tx, {
      requestId: pr.id,
      type: "APPROVED",
      userId: actor.id,
      from: pr.status,
      to: to!,
      payload: { autoApproved, type: finalType, assignedBuyerId: buyer?.id ?? null, assignedBuyerName: buyer?.name ?? null, changedLines: changed.length },
      at,
    });
    await log(tx, {
      userId: actor.id,
      action: "PR_APPROVE",
      entity: "PurchaseRequest",
      entityId: pr.id,
      before: { status: pr.status, type: pr.type, assignedBuyerId: pr.assignedBuyerId },
      after: { status: after.status, type: after.type, assignedBuyerId: after.assignedBuyerId, autoApproved, estimatedTotal: after.estimatedTotal },
      ip,
    });

    // D17 : acheteur assigné + demandeur ; sans acheteur compatible, le Responsable est alerté.
    const number = after.number!;
    if (buyer) {
      await notify(tx, [buyer.id], {
        type: "PR_ASSIGNED",
        severity: after.urgency === "ARRET_PRODUCTION" ? "CRITIQUE" : after.urgency === "URGENTE" ? "IMPORTANT" : "INFO",
        title: `${number} validée et assignée à vous`,
        body: `${PR_URGENCY_LABELS[after.urgency]} – besoin le ${formatDateOnly(after.neededBy)}`,
        link: link(pr.id),
        entity: "PurchaseRequest",
        entityId: pr.id,
      });
    } else {
      await notify(tx, await activeResponsableIds(tx), {
        type: "PR_UNASSIGNED",
        severity: "IMPORTANT",
        title: `${number} validée sans acheteur`,
        body: `Aucun acheteur actif ne couvre le périmètre ${finalType === "LOCAL" ? "local" : "import"} : assignez-la manuellement.`,
        link: link(pr.id),
        entity: "PurchaseRequest",
        entityId: pr.id,
      });
    }
    if (pr.createdById !== actor.id && pr.createdById !== buyer?.id) {
      await notify(tx, [pr.createdById], {
        type: "PR_APPROVED",
        title: `${number} validée`,
        body: changed.length ? `${changed.length} quantité(s) modifiée(s) à la validation.` : null,
        link: link(pr.id),
        entity: "PurchaseRequest",
        entityId: pr.id,
      });
    }
    const itemIds = pr.lines.map((l) => l.itemId).filter((x): x is string => !!x);
    return {
      ...result(after),
      autoApproved,
      assignedBuyer: buyer,
      unassigned: !buyer,
      changedLines: changed.length,
      duplicates: await duplicateWarnings(tx, itemIds, pr.id),
    };
  });
}

export interface ApproveManyItem {
  id: string;
  number: string | null;
  ok: boolean;
  code?: string;
  message?: string;
}

/** D19 : chaque DA dans sa propre transaction ; une erreur ne bloque pas les autres. Quantités non modifiables ici. */
export async function approveMany(actor: RequestUser, raw: unknown, ip?: string | null, at: Date = now()) {
  const input = parseInput(approveManySchema, raw);
  requireAction(actor, "purchaseRequest.approve");
  const results: ApproveManyItem[] = [];
  for (const it of input.items) {
    try {
      const r = await approveRequest(actor, { id: it.id, expectedUpdatedAt: it.expectedUpdatedAt, type: it.type ?? null }, ip, at);
      results.push({ id: it.id, number: r.number, ok: true });
    } catch (e) {
      const number = await db.purchaseRequest
        .findUnique({ where: { id: it.id }, select: { number: true } })
        .then((r) => r?.number ?? null)
        .catch(() => null);
      if (!(e instanceof BusinessError)) {
        console.error(`[approveMany] erreur technique sur la DA ${it.id}`, e);
        results.push({ id: it.id, number, ok: false, code: "INTERNAL", message: "Erreur technique, réessayez" });
        continue;
      }
      const message = e.code === "TYPE_REQUIRED" ? "Écartée : choisissez Local ou Import (type à définir)." : e.messageFr;
      results.push({ id: it.id, number, ok: false, code: e.code, message });
    }
  }
  const approved = results.filter((r) => r.ok).length;
  return { approved, failed: results.length - approved, results };
}

// ------------------------------------------------------------------ refus, retour, annulation

async function decide(
  actor: RequestUser,
  id: string,
  expectedUpdatedAt: Date,
  action: Extract<PrAction, "reject" | "return" | "cancel">,
  detail: string,
  ip: string | null | undefined,
  at: Date,
): Promise<RequestResult> {
  const cfg = {
    reject: { event: "REJECTED", audit: "PR_REJECT", verb: "refusée", severity: "IMPORTANT" },
    return: { event: "RETURNED", audit: "PR_RETURN", verb: "renvoyée pour complément", severity: "IMPORTANT" },
    cancel: { event: "CANCELLED", audit: "PR_CANCEL", verb: "annulée", severity: "INFO" },
  } as const;
  const c = cfg[action];
  return db.$transaction(async (tx) => {
    const pr = await loadLocked(tx, id, expectedUpdatedAt);
    const { to } = assertTransition(pr, action, actor);
    const data: Prisma.PurchaseRequestUncheckedUpdateInput = { status: to!, priority: effectivePriority(pr.urgency, to!) };
    if (action === "reject") data.rejectedReason = detail;
    if (action === "cancel") {
      data.cancelledReason = detail;
      data.cancelledAt = at;
      data.cancelledById = actor.id;
    }
    const after = await tx.purchaseRequest.update({ where: { id }, data });
    await recordEvent(tx, { requestId: id, type: c.event, userId: actor.id, from: pr.status, to: to!, comment: detail, at });
    await log(tx, {
      userId: actor.id,
      action: c.audit,
      entity: "PurchaseRequest",
      entityId: id,
      before: { status: pr.status },
      after: { status: after.status, reason: detail },
      ip,
    });
    const recipients = new Set<string>();
    if (pr.createdById !== actor.id) recipients.add(pr.createdById);
    if (action === "cancel" && pr.assignedBuyerId && pr.assignedBuyerId !== actor.id) recipients.add(pr.assignedBuyerId);
    await notify(tx, recipients, {
      type: `PR_${c.event}`,
      severity: c.severity,
      title: `${displayNumber(after)} ${c.verb}`,
      body: detail.slice(0, 200),
      link: link(id),
      entity: "PurchaseRequest",
      entityId: id,
    });
    return result(after);
  });
}

export async function rejectRequest(actor: RequestUser, raw: unknown, ip?: string | null, at: Date = now()) {
  const i = parseInput(rejectRequestSchema, raw);
  return decide(actor, i.id, i.expectedUpdatedAt, "reject", i.reason, ip, at);
}

export async function returnForCompletion(actor: RequestUser, raw: unknown, ip?: string | null, at: Date = now()) {
  const i = parseInput(returnRequestSchema, raw);
  return decide(actor, i.id, i.expectedUpdatedAt, "return", i.comment, ip, at);
}

export async function cancelRequest(actor: RequestUser, raw: unknown, ip?: string | null, at: Date = now()) {
  const i = parseInput(cancelRequestSchema, raw);
  return decide(actor, i.id, i.expectedUpdatedAt, "cancel", i.reason, ip, at);
}

// ------------------------------------------------------------------ assignation, commentaire

/** Réassignation par le Responsable, à tout moment avant COMMANDEE ; l'acheteur doit couvrir le type de la DA. */
export async function assignBuyer(actor: RequestUser, raw: unknown, ip?: string | null, at: Date = now()): Promise<RequestResult> {
  const input = parseInput(assignBuyerSchema, raw);
  return db.$transaction(async (tx) => {
    const pr = await loadLocked(tx, input.id, input.expectedUpdatedAt);
    assertTransition(pr, "assign", actor);
    const type = pr.type === "IMPORT" ? "IMPORT" : "LOCAL";
    const buyer = await resolveBuyer(tx, type, input.buyerId);
    if (pr.assignedBuyerId === buyer!.id) return result(pr);
    const after = await tx.purchaseRequest.update({ where: { id: pr.id }, data: { assignedBuyerId: buyer!.id } });
    await recordEvent(tx, {
      requestId: pr.id,
      type: "ASSIGNED",
      userId: actor.id,
      payload: { from: pr.assignedBuyerId, to: buyer!.id, toName: buyer!.name },
      at,
    });
    await log(tx, {
      userId: actor.id,
      action: "PR_ASSIGN",
      entity: "PurchaseRequest",
      entityId: pr.id,
      before: { assignedBuyerId: pr.assignedBuyerId },
      after: { assignedBuyerId: buyer!.id },
      ip,
    });
    await notify(tx, buyer!.id === actor.id ? [] : [buyer!.id], {
      type: "PR_ASSIGNED",
      severity: after.urgency === "ARRET_PRODUCTION" ? "CRITIQUE" : "INFO",
      title: `${displayNumber(after)} vous est assignée`,
      link: link(pr.id),
      entity: "PurchaseRequest",
      entityId: pr.id,
    });
    return result(after);
  });
}

/** Commentaire libre (tout lecteur de la DA ayant un droit d'écriture DA). Ne modifie pas la DA : pas de conflit de version. */
export async function addComment(actor: RequestUser, raw: unknown, ip?: string | null, at: Date = now()) {
  const input = parseInput(commentRequestSchema, raw);
  return db.$transaction(async (tx) => {
    const pr = await tx.purchaseRequest.findUnique({ where: { id: input.id } });
    if (!pr) throw new BusinessError("NOT_FOUND", "Demande d'achat introuvable.");
    assertTransition(pr, "comment", actor);
    await recordEvent(tx, { requestId: pr.id, type: "COMMENT", userId: actor.id, comment: input.comment, at });
    await log(tx, {
      userId: actor.id,
      action: "PR_COMMENT",
      entity: "PurchaseRequest",
      entityId: pr.id,
      after: { comment: input.comment },
      ip,
    });
    const to = new Set<string>();
    if (pr.createdById !== actor.id) to.add(pr.createdById);
    if (pr.assignedBuyerId && pr.assignedBuyerId !== actor.id) to.add(pr.assignedBuyerId);
    await notify(tx, to, {
      type: "PR_COMMENT",
      title: `Commentaire sur ${displayNumber(pr)}`,
      body: input.comment.slice(0, 200),
      link: link(pr.id),
      entity: "PurchaseRequest",
      entityId: pr.id,
    });
    return { id: pr.id };
  });
}

// ------------------------------------------------------------------ statuts posés par LOT-05 / LOT-10

/**
 * Appelé depuis la transaction de consultation (LOT-10) : VALIDEE -> EN_CONSULTATION.
 * Sans effet si la DA est déjà au-delà (idempotent).
 */
export async function markInConsultation(tx: Tx, requestId: string, actor: { id: string }, at: Date = now()) {
  const pr = await tx.purchaseRequest.findUnique({ where: { id: requestId } });
  if (!pr) throw new BusinessError("NOT_FOUND", "Demande d'achat introuvable.");
  if (pr.status !== "VALIDEE") return result(pr);
  const user = { id: actor.id, role: "RESPONSABLE_ACHATS" as const };
  const { to } = assertTransition(pr, "markInConsultation", user);
  const after = await tx.purchaseRequest.update({ where: { id: requestId }, data: { status: to! } });
  await recordEvent(tx, { requestId, type: "STATUS_SYNC", userId: actor.id, from: pr.status, to: to!, at });
  await log(tx, {
    userId: actor.id,
    action: "PR_STATUS_SYNC",
    entity: "PurchaseRequest",
    entityId: requestId,
    before: { status: pr.status },
    after: { status: after.status },
  });
  return result(after);
}

/**
 * Appelé depuis la transaction du BC (LOT-05) : recalcule PARTIELLEMENT_COMMANDEE / COMMANDEE à partir des
 * quantités commandées par ligne de DA (en unité de la ligne). Les lignes retirées (approvedQty = 0) sont ignorées.
 * Ne revient jamais en arrière.
 */
export async function refreshOrderedStatus(
  tx: Tx,
  requestId: string,
  orderedByLineId: Record<string, string | number>,
  actor: { id: string },
  at: Date = now(),
) {
  const pr = await tx.purchaseRequest.findUnique({ where: { id: requestId }, include: { lines: true } });
  if (!pr) throw new BusinessError("NOT_FOUND", "Demande d'achat introuvable.");
  if (!OPEN_FOR_BUYER.includes(pr.status)) return result(pr);
  const needed = pr.lines.map((l) => ({ id: l.id, need: l.approvedQty ?? l.quantity })).filter((l) => l.need.gt(0));
  const ordered = (id: string) => new Prisma.Decimal(orderedByLineId[id] ?? 0);
  const complete = needed.length > 0 && needed.every((l) => ordered(l.id).gte(l.need));
  const started = needed.some((l) => ordered(l.id).gt(0));
  const target: PurchaseRequestStatus | null = complete ? "COMMANDEE" : started ? "PARTIELLEMENT_COMMANDEE" : null;
  if (!target || target === pr.status) return result(pr);
  const user = { id: actor.id, role: "RESPONSABLE_ACHATS" as const };
  const { to } = assertTransition(pr, target === "COMMANDEE" ? "markOrdered" : "markPartiallyOrdered", user);
  const after = await tx.purchaseRequest.update({ where: { id: requestId }, data: { status: to!, priority: effectivePriority(pr.urgency, to!) } });
  await recordEvent(tx, { requestId, type: "STATUS_SYNC", userId: actor.id, from: pr.status, to: to!, at });
  await log(tx, {
    userId: actor.id,
    action: "PR_STATUS_SYNC",
    entity: "PurchaseRequest",
    entityId: requestId,
    before: { status: pr.status },
    after: { status: after.status },
  });
  return result(after);
}
