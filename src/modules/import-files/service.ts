import "server-only";
import { Prisma, type ImportMilestoneCode } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { now } from "@/lib/clock";
import { currentYear, dayKeyOf, todayAbidjan } from "@/lib/dates";
import { BusinessError } from "@/lib/errors";
import { log } from "@/modules/audit";
import { notify } from "@/modules/notifications";
import { formatDocumentNumber, nextNumber } from "@/modules/numbering";
import { parseInput } from "@/modules/purchase-requests/parse";
import { activeResponsableIds, asJson, dateOnly, latestRate, type OrderActor, type Tx } from "@/modules/purchase-orders/internal";
import { applyMovement, lockStockLevels } from "@/modules/stock";
import { estimateCosts } from "./estimates";
import { MILESTONE_CODES, MILESTONE_LABELS, importFileLink } from "./labels";
import { toXof } from "./landed-cost";
import { assertImportAccess } from "./scope";
import {
  addCostSchema,
  cancelImportFileSchema,
  closeImportFileSchema,
  coefficientDefaultSchema,
  costTypeSchema,
  createImportFileSchema,
  lineLogisticsSchema,
  milestoneSchema,
  orderLinkSchema,
  removeCostSchema,
  fileIdSchema,
  updateCostSchema,
  updateImportFileSchema,
} from "./schemas";
import { computeCostSheet } from "./sheet";

/**
 * Dossiers import, frais d'approche et coût d'arrivée dédouané (LOT-12).
 * Chaque écriture : session/droit/périmètre IMPORT (`assertImportAccess`) -> Zod -> transaction (verrou du dossier) -> audit.
 * La licence (essai expiré = lecture seule) est contrôlée par les server actions (`withAction`).
 * Le stock ne change que par `applyMovement` (REEVALUATION_COUT) lors de la clôture.
 */

export interface ImportFileResult {
  id: string;
  number: string;
  status: "OUVERT" | "CLOTURE" | "ANNULE";
}

const NOT_LINKABLE = ["BROUILLON", "A_VALIDER", "REFUSE", "ANNULE"] as const;

const lockFile = (tx: Tx, id: string) => tx.$queryRaw`SELECT id FROM import_files WHERE id = ${id} FOR UPDATE`;
const lockOrders = async (tx: Tx, ids: string[]) => {
  const sorted = [...new Set(ids)].sort();
  if (sorted.length > 0) await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ANY(${sorted}) ORDER BY id FOR UPDATE`;
};

async function loadOpenFile(tx: Tx, id: string) {
  await lockFile(tx, id);
  const file = await tx.importFile.findUnique({ where: { id }, include: { orders: { select: { orderId: true } } } });
  if (!file) throw new BusinessError("NOT_FOUND", "Dossier import introuvable.");
  if (file.status !== "OUVERT") {
    throw new BusinessError("INVALID_STATUS", `Le dossier ${file.number} est ${file.status === "CLOTURE" ? "clôturé" : "annulé"} : il ne peut plus être modifié.`);
  }
  return file;
}

/** Taux figé : FCFA = 1 ; taux saisi ; à défaut dernier taux connu à la date. */
async function resolveRate(tx: Tx, currencyCode: string, given: number | undefined, at: Date): Promise<Prisma.Decimal> {
  if (currencyCode === "XOF") return new Prisma.Decimal(1);
  if (given !== undefined) return new Prisma.Decimal(given);
  const found = await latestRate(tx, currencyCode, at);
  if (!found) throw new BusinessError("TAUX_MANQUANT", `Aucun taux de change connu pour ${currencyCode} : saisissez le taux du jour.`);
  return found.rate;
}

async function trace(tx: Tx, e: { fileId: string; costId?: string | null; userId: string; kind: string; before?: unknown; after?: unknown; reason?: string | null; at: Date }) {
  await tx.approachCostAdjustment.create({
    data: {
      fileId: e.fileId,
      costId: e.costId ?? null,
      userId: e.userId,
      kind: e.kind,
      before: e.before === undefined ? undefined : asJson(e.before),
      after: e.after === undefined ? undefined : asJson(e.after),
      reason: e.reason ?? null,
      createdAt: e.at,
    },
  });
}

async function assertLinkable(tx: Tx, supplierId: string, orderIds: string[], currentFileId?: string) {
  if (orderIds.length === 0) return;
  await lockOrders(tx, orderIds);
  const orders = await tx.purchaseOrder.findMany({ where: { id: { in: orderIds } }, include: { importLink: { include: { file: { select: { id: true, number: true } } } } } });
  if (orders.length !== new Set(orderIds).size) throw new BusinessError("NOT_FOUND", "Un bon de commande est introuvable.");
  for (const o of orders) {
    const ref = o.number ?? "(brouillon)";
    if (o.type !== "IMPORT") throw new BusinessError("BC_NON_IMPORT", `Le bon ${ref} est un achat local : seul un bon import peut être rattaché à un dossier import.`);
    if (o.supplierId !== supplierId) throw new BusinessError("BC_AUTRE_FOURNISSEUR", `Le bon ${ref} appartient à un autre fournisseur que celui du dossier.`);
    if ((NOT_LINKABLE as readonly string[]).includes(o.status)) throw new BusinessError("BC_NON_VALIDE", `Le bon ${ref} n'est pas validé (statut ${o.status}) : il ne peut pas être rattaché.`);
    if (o.importLink && o.importLink.fileId !== currentFileId) {
      throw new BusinessError("BC_DEJA_RATTACHE", `Le bon ${ref} est déjà rattaché au dossier ${o.importLink.file.number}.`);
    }
  }
}

/** Remplace les estimations automatiques par celles des coefficients par défaut du mode (sur la valeur marchandise actuelle). */
async function regenerateEstimates(tx: Tx, fileId: string, mode: "MARITIME" | "AERIEN" | "ROUTIER", userId: string, at: Date): Promise<number> {
  await tx.approachCost.deleteMany({ where: { fileId, autoEstimate: true, status: "ESTIME" } });
  const sheet = await computeCostSheet(tx, fileId, at);
  const taken = new Set((await tx.approachCost.findMany({ where: { fileId }, select: { typeId: true } })).map((c) => c.typeId));
  const defaults = (await tx.approachCoefficientDefault.findMany({ where: { mode, type: { active: true } }, include: { type: true } })).filter((d) => !taken.has(d.typeId));
  const estimates = estimateCosts(sheet.totals.goodsValueXof, defaults.map((d) => ({ typeId: d.typeId, pctOfValue: d.pctOfValue })));
  for (const e of estimates) {
    const type = defaults.find((d) => d.typeId === e.typeId)!.type;
    await tx.approachCost.create({
      data: {
        fileId,
        typeId: e.typeId,
        status: "ESTIME",
        amount: e.amountXof,
        currencyCode: "XOF",
        rate: 1,
        amountXof: e.amountXof,
        vatRecoverable: type.vatRecoverableDefault,
        allocationKey: type.defaultKey,
        autoEstimate: true,
        createdById: userId,
        createdAt: at,
      },
    });
  }
  return estimates.length;
}

const headerData = (i: {
  incoterm?: string | null;
  incotermPlace?: string | null;
  loadingPort?: string | null;
  transitaire?: string | null;
  blNumber?: string | null;
  containerNumber?: string | null;
  customsDeclaration?: string | null;
  customsRegime?: string | null;
  notes?: string | null;
}) => ({
  incoterm: (i.incoterm ?? null) as Prisma.ImportFileCreateInput["incoterm"],
  incotermPlace: i.incotermPlace ?? null,
  loadingPort: i.loadingPort ?? null,
  transitaire: i.transitaire ?? null,
  blNumber: i.blNumber ?? null,
  containerNumber: i.containerNumber ?? null,
  customsDeclaration: i.customsDeclaration ?? null,
  customsRegime: i.customsRegime ?? null,
  notes: i.notes ?? null,
});

// ------------------------------------------------------------------ dossier

export async function createImportFile(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<ImportFileResult> {
  assertImportAccess(actor, "importFile.manage");
  const input = parseInput(createImportFileSchema, raw);
  return db.$transaction(async (tx) => {
    const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId }, select: { id: true, name: true, type: true, country: true } });
    if (!supplier) throw new BusinessError("NOT_FOUND", "Fournisseur introuvable.");
    if (supplier.type !== "IMPORT") throw new BusinessError("FOURNISSEUR_LOCAL", "Un dossier import concerne un fournisseur étranger (type « import »).");
    const orderIds = [...new Set(input.orderIds)];
    await assertLinkable(tx, supplier.id, orderIds);

    const year = currentYear(at);
    const number = formatDocumentNumber("IMP", year, await nextNumber("IMP", year, tx));
    const file = await tx.importFile.create({
      data: {
        number,
        supplierId: supplier.id,
        mode: input.mode,
        createdById: actor.id,
        createdAt: at,
        ...headerData(input),
        orders: { create: orderIds.map((orderId) => ({ orderId })) },
        milestones: { create: MILESTONE_CODES.map((code) => ({ code })) },
      },
    });
    const estimated = await regenerateEstimates(tx, file.id, input.mode, actor.id, at);
    await log(tx, {
      userId: actor.id,
      action: "IMPORT_FILE_CREATE",
      entity: "ImportFile",
      entityId: file.id,
      after: { number, supplier: supplier.name, mode: input.mode, incoterm: input.incoterm ?? null, orders: orderIds.length, estimatedCosts: estimated },
      ip,
    });
    return { id: file.id, number, status: file.status };
  });
}

export async function updateImportFile(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<ImportFileResult> {
  assertImportAccess(actor, "importFile.manage");
  const input = parseInput(updateImportFileSchema, raw);
  return db.$transaction(async (tx) => {
    const file = await loadOpenFile(tx, input.id);
    const data = { ...headerData(input), ...(input.mode ? { mode: input.mode } : {}) };
    const updated = await tx.importFile.update({ where: { id: file.id }, data });
    if (input.mode && input.mode !== file.mode) await regenerateEstimates(tx, file.id, input.mode, actor.id, at);
    await log(tx, {
      userId: actor.id,
      action: "IMPORT_FILE_UPDATE",
      entity: "ImportFile",
      entityId: file.id,
      before: { mode: file.mode, incoterm: file.incoterm, loadingPort: file.loadingPort, transitaire: file.transitaire, blNumber: file.blNumber, containerNumber: file.containerNumber, customsDeclaration: file.customsDeclaration, customsRegime: file.customsRegime },
      after: { number: file.number, ...data },
      ip,
    });
    return { id: updated.id, number: updated.number, status: updated.status };
  });
}

export async function linkImportOrder(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<ImportFileResult> {
  assertImportAccess(actor, "importFile.manage");
  const input = parseInput(orderLinkSchema, raw);
  return db.$transaction(async (tx) => {
    const file = await loadOpenFile(tx, input.fileId);
    await assertLinkable(tx, file.supplierId, [input.orderId], file.id);
    await tx.importFileOrder.upsert({ where: { orderId: input.orderId }, create: { fileId: file.id, orderId: input.orderId }, update: {} });
    const estimated = await regenerateEstimates(tx, file.id, file.mode, actor.id, at);
    await log(tx, { userId: actor.id, action: "IMPORT_FILE_ORDER_LINK", entity: "ImportFile", entityId: file.id, after: { number: file.number, orderId: input.orderId, estimatedCosts: estimated }, ip });
    return { id: file.id, number: file.number, status: file.status };
  });
}

export async function unlinkImportOrder(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<ImportFileResult> {
  assertImportAccess(actor, "importFile.manage");
  const input = parseInput(orderLinkSchema, raw);
  return db.$transaction(async (tx) => {
    const file = await loadOpenFile(tx, input.fileId);
    const deleted = await tx.importFileOrder.deleteMany({ where: { fileId: file.id, orderId: input.orderId } });
    if (deleted.count === 0) throw new BusinessError("NOT_FOUND", "Ce bon de commande n'est pas rattaché au dossier.");
    await regenerateEstimates(tx, file.id, file.mode, actor.id, at);
    await log(tx, { userId: actor.id, action: "IMPORT_FILE_ORDER_UNLINK", entity: "ImportFile", entityId: file.id, before: { number: file.number, orderId: input.orderId }, ip });
    return { id: file.id, number: file.number, status: file.status };
  });
}

export async function cancelImportFile(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<ImportFileResult> {
  assertImportAccess(actor, "importFile.manage");
  const input = parseInput(cancelImportFileSchema, raw);
  return db.$transaction(async (tx) => {
    const file = await loadOpenFile(tx, input.id);
    await tx.importFileOrder.deleteMany({ where: { fileId: file.id } }); // les BC redeviennent rattachables
    const updated = await tx.importFile.update({ where: { id: file.id }, data: { status: "ANNULE", cancelledAt: at, cancelledById: actor.id, cancelledReason: input.reason } });
    await log(tx, {
      userId: actor.id,
      action: "IMPORT_FILE_CANCEL",
      entity: "ImportFile",
      entityId: file.id,
      before: { status: file.status, orders: file.orders.length },
      after: { number: file.number, status: "ANNULE", reason: input.reason },
      ip,
    });
    return { id: updated.id, number: updated.number, status: updated.status };
  });
}

// ------------------------------------------------------------------ jalons

export async function updateMilestone(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()) {
  assertImportAccess(actor, "importFile.manage");
  const input = parseInput(milestoneSchema, raw);
  const today = todayAbidjan(at);
  if (input.actualDate && input.actualDate > today) {
    throw new BusinessError("DATE_FUTURE", "La date réelle d'un jalon ne peut pas être dans le futur : saisissez la date prévue.");
  }
  return db.$transaction(async (tx) => {
    const file = await loadOpenFile(tx, input.fileId);
    const current = await tx.importMilestone.findUnique({ where: { fileId_code: { fileId: file.id, code: input.code as ImportMilestoneCode } } });
    if (!current) throw new BusinessError("NOT_FOUND", "Jalon introuvable.");
    const planned = input.plannedDate === undefined ? current.plannedDate : input.plannedDate ? dateOnly(input.plannedDate) : null;
    const actual = input.actualDate === undefined ? current.actualDate : input.actualDate ? dateOnly(input.actualDate) : null;
    const updated = await tx.importMilestone.update({
      where: { id: current.id },
      data: { plannedDate: planned, actualDate: actual, ...(input.note !== undefined ? { note: input.note } : {}), updatedAt: at },
    });
    await log(tx, {
      userId: actor.id,
      action: "IMPORT_MILESTONE_UPDATE",
      entity: "ImportFile",
      entityId: file.id,
      before: { milestone: current.code, plannedDate: current.plannedDate && dayKeyOf(current.plannedDate), actualDate: current.actualDate && dayKeyOf(current.actualDate) },
      after: { number: file.number, milestone: current.code, label: MILESTONE_LABELS[current.code], plannedDate: planned && dayKeyOf(planned), actualDate: actual && dayKeyOf(actual) },
      ip,
    });
    return { id: updated.id };
  });
}

// ------------------------------------------------------------------ poids et volume

/** Poids (kg) et volume (m3) par unité d'achat des lignes de BC du dossier : clés de répartition POIDS et VOLUME. */
export async function setLineLogistics(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()) {
  assertImportAccess(actor, "importFile.manage");
  const input = parseInput(lineLogisticsSchema, raw);
  return db.$transaction(async (tx) => {
    const file = await loadOpenFile(tx, input.fileId);
    const lines = await tx.purchaseOrderLine.findMany({
      where: { id: { in: input.lines.map((l) => l.orderLineId) }, order: { importLink: { fileId: file.id } } },
      select: { id: true, lineNo: true, unitWeightKg: true, unitVolumeM3: true, order: { select: { number: true } } },
    });
    if (lines.length !== new Set(input.lines.map((l) => l.orderLineId)).size) {
      throw new BusinessError("LIGNE_INTROUVABLE", "Une ligne n'appartient à aucun bon de commande du dossier.");
    }
    for (const l of input.lines) {
      await tx.purchaseOrderLine.update({ where: { id: l.orderLineId }, data: { unitWeightKg: l.unitWeightKg, unitVolumeM3: l.unitVolumeM3 } });
    }
    await log(tx, {
      userId: actor.id,
      action: "IMPORT_LINE_LOGISTICS",
      entity: "ImportFile",
      entityId: file.id,
      before: lines.map((l) => ({ line: `${l.order.number}/${l.lineNo}`, unitWeightKg: l.unitWeightKg?.toString() ?? null, unitVolumeM3: l.unitVolumeM3?.toString() ?? null })),
      after: { number: file.number, lines: input.lines.length },
      ip,
    });
    return { updated: input.lines.length, at: at.toISOString() };
  });
}

// ------------------------------------------------------------------ frais d'approche

export async function addCost(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()) {
  assertImportAccess(actor, "importFile.manage");
  const input = parseInput(addCostSchema, raw);
  return db.$transaction(async (tx) => {
    const file = await loadOpenFile(tx, input.fileId);
    const type = await tx.approachCostType.findUnique({ where: { id: input.typeId } });
    if (!type || !type.active) throw new BusinessError("TYPE_FRAIS_INTROUVABLE", "Type de frais introuvable ou désactivé.");
    const currency = await tx.currency.findUnique({ where: { code: input.currencyCode }, select: { code: true, active: true } });
    if (!currency || !currency.active) throw new BusinessError("DEVISE_INTROUVABLE", `Devise ${input.currencyCode} inconnue ou inactive.`);
    const rate = await resolveRate(tx, input.currencyCode, input.rate, at);
    const amountXof = toXof(input.amount, rate);
    const cost = await tx.approachCost.create({
      data: {
        fileId: file.id,
        typeId: type.id,
        status: input.status,
        amount: input.amount.toFixed(2),
        currencyCode: input.currencyCode,
        rate,
        amountXof,
        vatRecoverable: input.vatRecoverable ?? type.vatRecoverableDefault,
        allocationKey: input.allocationKey ?? type.defaultKey,
        payee: input.payee ?? null,
        note: input.note ?? null,
        createdById: actor.id,
        createdAt: at,
      },
    });
    await trace(tx, { fileId: file.id, costId: cost.id, userId: actor.id, kind: "CREATE", after: { type: type.code, status: cost.status, amountXof, currency: cost.currencyCode, rate: rate.toString() }, at });
    await log(tx, {
      userId: actor.id,
      action: "IMPORT_COST_ADD",
      entity: "ImportFile",
      entityId: file.id,
      after: { number: file.number, costId: cost.id, type: type.code, status: cost.status, amount: cost.amount.toString(), currency: cost.currencyCode, rate: rate.toString(), amountXof, vatRecoverable: cost.vatRecoverable, key: cost.allocationKey },
      ip,
    });
    return { id: cost.id, amountXof };
  });
}

export async function updateCost(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()) {
  assertImportAccess(actor, "importFile.manage");
  const input = parseInput(updateCostSchema, raw);
  return db.$transaction(async (tx) => {
    const found = await tx.approachCost.findUnique({ where: { id: input.costId }, include: { type: true } });
    if (!found) throw new BusinessError("NOT_FOUND", "Frais introuvable.");
    const file = await loadOpenFile(tx, found.fileId);
    const cost = await tx.approachCost.findUniqueOrThrow({ where: { id: found.id }, include: { type: true } });

    if (input.status === "ESTIME" && cost.status === "REEL") {
      throw new BusinessError("INVALID_STATUS", "Un frais réel ne redevient pas estimé : corrigez son montant.");
    }
    const toReal = input.status === "REEL" && cost.status === "ESTIME";
    if (toReal && cost.autoEstimate && input.amount === undefined) {
      throw new BusinessError("MONTANT_REEL_REQUIS", "Saisissez le montant réel pour remplacer l'estimation automatique.");
    }
    const currencyCode = input.currencyCode ?? cost.currencyCode;
    if (input.currencyCode && input.currencyCode !== cost.currencyCode) {
      const c = await tx.currency.findUnique({ where: { code: currencyCode }, select: { active: true } });
      if (!c || !c.active) throw new BusinessError("DEVISE_INTROUVABLE", `Devise ${currencyCode} inconnue ou inactive.`);
    }
    const currencyChanged = currencyCode !== cost.currencyCode;
    const rate = input.rate !== undefined || currencyChanged ? await resolveRate(tx, currencyCode, input.rate, at) : cost.rate;
    const amount = input.amount !== undefined ? new Prisma.Decimal(input.amount.toFixed(2)) : cost.amount;
    const amountXof = toXof(amount, rate);
    const next = {
      status: toReal ? ("REEL" as const) : cost.status,
      amount,
      currencyCode,
      rate,
      amountXof,
      vatRecoverable: input.vatRecoverable ?? cost.vatRecoverable,
      allocationKey: input.allocationKey ?? cost.allocationKey,
      payee: input.payee === undefined ? cost.payee : input.payee,
      note: input.note === undefined ? cost.note : input.note,
      autoEstimate: toReal ? false : cost.autoEstimate,
    };
    // Un frais estimé dont on change le montant sans le déclarer réel reste une estimation saisie à la main.
    if (!toReal && cost.autoEstimate && (input.amount !== undefined || currencyChanged)) next.autoEstimate = false;
    const snap = (c: { status: string; amount: Prisma.Decimal; currencyCode: string; rate: Prisma.Decimal; amountXof: number; vatRecoverable: boolean; allocationKey: string }) => ({
      status: c.status,
      amount: c.amount.toString(),
      currency: c.currencyCode,
      rate: c.rate.toString(),
      amountXof: c.amountXof,
      vatRecoverable: c.vatRecoverable,
      key: c.allocationKey,
    });
    const before = snap(cost);
    const after = snap(next);
    await tx.approachCost.update({ where: { id: cost.id }, data: next });
    await trace(tx, { fileId: file.id, costId: cost.id, userId: actor.id, kind: toReal ? "ESTIME_VERS_REEL" : "MODIFICATION", before, after, reason: input.reason, at });
    await log(tx, {
      userId: actor.id,
      action: toReal ? "IMPORT_COST_CONFIRM" : "IMPORT_COST_UPDATE",
      entity: "ImportFile",
      entityId: file.id,
      before: { number: file.number, type: cost.type.code, ...before },
      after: { type: cost.type.code, ...after, reason: input.reason ?? null },
      ip,
    });
    return { id: cost.id, amountXof, status: next.status };
  });
}

export async function removeCost(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()) {
  assertImportAccess(actor, "importFile.manage");
  const input = parseInput(removeCostSchema, raw);
  return db.$transaction(async (tx) => {
    const found = await tx.approachCost.findUnique({ where: { id: input.costId }, include: { type: true } });
    if (!found) throw new BusinessError("NOT_FOUND", "Frais introuvable.");
    const file = await loadOpenFile(tx, found.fileId);
    await tx.approachCost.delete({ where: { id: found.id } });
    const before = { type: found.type.code, status: found.status, amount: found.amount.toString(), currency: found.currencyCode, amountXof: found.amountXof };
    await trace(tx, { fileId: file.id, costId: null, userId: actor.id, kind: "SUPPRESSION", before, reason: input.reason, at });
    await log(tx, { userId: actor.id, action: "IMPORT_COST_REMOVE", entity: "ImportFile", entityId: file.id, before: { number: file.number, ...before }, after: { reason: input.reason ?? null }, ip });
    return { removed: true };
  });
}

/** Régénère les estimations automatiques (après changement des coefficients par défaut ou des marchandises). */
export async function refreshEstimates(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()) {
  assertImportAccess(actor, "importFile.manage");
  const input = parseInput(fileIdSchema, raw);
  return db.$transaction(async (tx) => {
    const file = await loadOpenFile(tx, input.id);
    const count = await regenerateEstimates(tx, file.id, file.mode, actor.id, at);
    await log(tx, { userId: actor.id, action: "IMPORT_ESTIMATES_REFRESH", entity: "ImportFile", entityId: file.id, after: { number: file.number, estimatedCosts: count }, ip });
    return { estimatedCosts: count };
  });
}

// ------------------------------------------------------------------ clôture

export interface CloseImportFileResult extends ImportFileResult {
  coefficient: string;
  landedXof: number;
  goodsValueXof: number;
  costsXof: number;
  /** Surcoût ajouté au PMP du stock restant, et part déjà sortie (exposée, non réécrite). */
  appliedXof: number;
  exposedXof: number;
  movements: number;
}

/**
 * Clôture : refusée si un BC n'est pas entièrement réceptionné ou si des frais sont encore estimés sans accord explicite.
 * Une seule transaction : coût dédouané écrit sur les lignes de réception -> mouvements REEVALUATION_COUT (PMP du stock
 * restant) -> historique du coefficient -> fiche figée -> audit.
 */
export async function closeImportFile(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<CloseImportFileResult> {
  assertImportAccess(actor, "importFile.close");
  const input = parseInput(closeImportFileSchema, raw);
  return db.$transaction(async (tx) => {
    const file = await loadOpenFile(tx, input.id);
    const full = await tx.importFile.findUniqueOrThrow({ where: { id: file.id }, include: { supplier: { select: { name: true, country: true } } } });
    const orders = await tx.purchaseOrder.findMany({ where: { id: { in: file.orders.map((o) => o.orderId) } }, select: { id: true, number: true, status: true } });
    if (orders.length === 0) throw new BusinessError("DOSSIER_VIDE", "Rattachez au moins un bon de commande import avant de clôturer le dossier.");
    await lockOrders(tx, orders.map((o) => o.id));
    const pending = (await tx.purchaseOrder.findMany({ where: { id: { in: orders.map((o) => o.id) }, status: { notIn: ["RECU", "CLOTURE"] } }, select: { number: true, status: true } }));
    if (pending.length > 0) {
      throw new BusinessError(
        "BC_NON_RECEPTIONNE",
        `Clôture impossible : ${pending.map((o) => o.number ?? "(brouillon)").join(", ")} ${pending.length > 1 ? "ne sont pas entièrement réceptionnés" : "n'est pas entièrement réceptionné"}. Réceptionnez ou soldez le reliquat d'abord.`,
      );
    }

    // Verrou des niveaux de stock concernés AVANT de lire stock et PMP : le plan de réajustement ne peut plus être périmé.
    const probe = await computeCostSheet(tx, file.id, at);
    await lockStockLevels(tx, probe.reappraisal.map((r) => ({ itemId: r.itemId, warehouseId: r.warehouseId })));
    const sheet = await computeCostSheet(tx, file.id, at);

    if (sheet.lines.length === 0 || sheet.totals.goodsValueXof <= 0) {
      throw new BusinessError("DOSSIER_VIDE", "Aucune marchandise reçue sur ce dossier : rien à valoriser.");
    }
    if (sheet.lines.some((l) => l.source !== "RECU")) {
      throw new BusinessError("BC_NON_RECEPTIONNE", "Une ligne du dossier n'a pas encore été reçue.");
    }
    const missingRate = sheet.warnings.find((w) => w.startsWith("Taux"));
    if (missingRate) throw new BusinessError("TAUX_MANQUANT", missingRate);
    if (sheet.totals.estimatedCostCount > 0 && !input.confirmEstimated) {
      throw new BusinessError(
        "FRAIS_ESTIMES",
        `${sheet.totals.estimatedCostCount} frais sont encore estimés. Saisissez les montants réels, ou confirmez explicitement la clôture avec les estimations.`,
      );
    }

    // 1. Coût d'arrivée dédouané sur chaque ligne de réception.
    for (const l of sheet.lines) {
      for (const r of l.receiptLines) {
        await tx.receiptLine.update({ where: { id: r.id }, data: { landedUnitCostXof: l.unitLandedCost } });
      }
    }

    // 2. PMP du stock restant : un mouvement de valeur seule par couple article x dépôt.
    let movements = 0;
    let appliedXof = 0;
    let exposedXof = 0;
    for (const r of sheet.reappraisal) {
      exposedXof += r.exposedXof;
      if (r.appliedXof <= 0) continue;
      await applyMovement(tx, {
        itemId: r.itemId,
        warehouseId: r.warehouseId,
        type: "REEVALUATION_COUT",
        quantity: 0,
        valueDelta: r.appliedXof,
        documentType: "DOSSIER_IMPORT",
        documentId: file.id,
        documentRef: file.number,
        comment: `Surcoût d'approche du dossier ${file.number} (${r.appliedXof} FCFA sur le stock restant ; ${r.exposedXof} FCFA sur les quantités déjà sorties)`,
        occurredAt: at,
        createdById: actor.id,
      });
      appliedXof += r.appliedXof;
      movements += 1;
    }

    // 3. Historique du coefficient, jalon « réception magasin », fiche figée.
    const coefficient = sheet.totals.coefficient!;
    await tx.approachCoefficientHistory.create({
      data: { fileId: file.id, supplierId: file.supplierId, origin: full.supplier.country, mode: file.mode, coefficient, goodsValueXof: sheet.totals.goodsValueXof, costsXof: sheet.totals.costsXof, closedAt: at },
    });
    const lastReceipt = await tx.receipt.findFirst({ where: { orderId: { in: orders.map((o) => o.id) }, status: "VALIDEE" }, orderBy: { receivedAt: "desc" }, select: { receivedAt: true } });
    if (lastReceipt) {
      await tx.importMilestone.updateMany({ where: { fileId: file.id, code: "RECEPTION_MAGASIN", actualDate: null }, data: { actualDate: lastReceipt.receivedAt, updatedAt: at } });
    }
    const final = { ...sheet, final: true, file: { ...sheet.file, status: "CLOTURE" as const, closedAt: at.toISOString() } };
    await tx.importFile.update({
      where: { id: file.id },
      data: { status: "CLOTURE", closedAt: at, closedById: actor.id, coefficient, closingSheet: asJson(final) },
    });
    await trace(tx, { fileId: file.id, userId: actor.id, kind: "CLOTURE", after: { coefficient, landedXof: sheet.totals.landedXof, estimatedKept: sheet.totals.estimatedCostCount, appliedXof, exposedXof }, at });
    await log(tx, {
      userId: actor.id,
      action: "IMPORT_FILE_CLOSE",
      entity: "ImportFile",
      entityId: file.id,
      before: { status: "OUVERT" },
      after: {
        number: file.number,
        status: "CLOTURE",
        supplier: full.supplier.name,
        coefficient: coefficient.toString(),
        goodsValueXof: sheet.totals.goodsValueXof,
        costsXof: sheet.totals.costsXof,
        excludedXof: sheet.totals.excludedXof,
        landedXof: sheet.totals.landedXof,
        estimatedCostsKept: sheet.totals.estimatedCostCount,
        confirmEstimated: input.confirmEstimated,
        pmpRevaluedXof: appliedXof,
        pmpExposedXof: exposedXof,
        movements,
      },
      ip,
    });
    const recipients = (await activeResponsableIds(tx)).filter((id) => id !== actor.id);
    await notify(tx, recipients, {
      type: "IMPORT_FILE_CLOSED",
      severity: "INFO",
      title: `Dossier import ${file.number} clôturé`,
      body: `${full.supplier.name} – coefficient d'approche ${coefficient.toString().replace(".", ",")}.`,
      link: importFileLink(file.id),
      entity: "ImportFile",
      entityId: file.id,
    });
    return {
      id: file.id,
      number: file.number,
      status: "CLOTURE",
      coefficient: coefficient.toString(),
      landedXof: sheet.totals.landedXof,
      goodsValueXof: sheet.totals.goodsValueXof,
      costsXof: sheet.totals.costsXof,
      appliedXof,
      exposedXof,
      movements,
    };
  });
}

// ------------------------------------------------------------------ paramétrage (Responsable seul)

export async function saveCostType(actor: OrderActor, raw: unknown, ip?: string | null) {
  assertImportAccess(actor, "importCost.configure");
  const input = parseInput(costTypeSchema, raw);
  try {
    return await db.$transaction(async (tx) => {
      const data = { code: input.code, label: input.label, defaultKey: input.defaultKey, vatRecoverableDefault: input.vatRecoverableDefault, sortOrder: input.sortOrder, active: input.active };
      const before = input.id ? await tx.approachCostType.findUnique({ where: { id: input.id } }) : null;
      if (input.id && !before) throw new BusinessError("NOT_FOUND", "Type de frais introuvable.");
      const saved = input.id ? await tx.approachCostType.update({ where: { id: input.id }, data }) : await tx.approachCostType.create({ data });
      await log(tx, { userId: actor.id, action: input.id ? "IMPORT_COST_TYPE_UPDATE" : "IMPORT_COST_TYPE_CREATE", entity: "ApproachCostType", entityId: saved.id, before: before ?? undefined, after: data, ip });
      return { id: saved.id };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new BusinessError("CODE_EXISTANT", "Ce code de type de frais existe déjà.");
    throw e;
  }
}

export async function setCoefficientDefault(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()) {
  assertImportAccess(actor, "importCost.configure");
  const input = parseInput(coefficientDefaultSchema, raw);
  const pct = new Prisma.Decimal(input.pctOfValue.toFixed(2));
  return db.$transaction(async (tx) => {
    const type = await tx.approachCostType.findUnique({ where: { id: input.typeId }, select: { id: true, code: true } });
    if (!type) throw new BusinessError("NOT_FOUND", "Type de frais introuvable.");
    const before = await tx.approachCoefficientDefault.findUnique({ where: { mode_typeId: { mode: input.mode, typeId: type.id } } });
    const saved = await tx.approachCoefficientDefault.upsert({
      where: { mode_typeId: { mode: input.mode, typeId: type.id } },
      create: { mode: input.mode, typeId: type.id, pctOfValue: pct, updatedAt: at },
      update: { pctOfValue: pct, updatedAt: at },
    });
    await log(tx, {
      userId: actor.id,
      action: "IMPORT_COEFFICIENT_DEFAULT",
      entity: "ApproachCoefficientDefault",
      entityId: saved.id,
      before: before ? { pctOfValue: before.pctOfValue.toString() } : undefined,
      after: { mode: input.mode, type: type.code, pctOfValue: pct.toString() },
      ip,
    });
    return { id: saved.id };
  });
}
