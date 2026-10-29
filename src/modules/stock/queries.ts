import "server-only";
import type { Prisma, StockDocumentType } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { now } from "@/lib/clock";
import { todayAbidjan } from "@/lib/dates";
import { BusinessError } from "@/lib/errors";
import { can, canSeePurchasePrice, requireAction, type PermissionUser } from "@/lib/permissions";
import { buildItemWhere } from "@/modules/items/service";
import { parseInput } from "@/modules/purchase-requests/parse";
import { EXPORT_MAX_ROWS, toPage } from "@/modules/referentials/list-query";
import { getSettings } from "@/modules/settings/service";
import type { AppSettings } from "@/modules/settings/keys";
import { isDormant } from "./forecast";
import { PURCHASE_COST_MOVEMENTS, type AbcClass, type MovementTypeCode } from "./labels";
import { Decimal } from "./pmp";
import { isBelowReorderPoint, reorderQuantity } from "./reorder";
import {
  itemLedgerSchema,
  listIssuesSchema,
  listMovementsSchema,
  listStockSchema,
  searchIssueItemsSchema,
  issueIdSchema,
  type ListIssuesInput,
  type ListMovementsInput,
  type ListStockInput,
} from "./schemas";
import { FORECAST_ITEM_SELECT, buildForecast, itemLeadTime, loadStats, type ForecastItem } from "./stats";
import type {
  IssueDetailView,
  IssueItemHit,
  IssueRowView,
  ItemLedger,
  LedgerRowView,
  MovementRowView,
  ReorderRowView,
  StockListResult,
  StockListRow,
} from "./types";

type Client = Prisma.TransactionClient;

const dateOnly = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
/** Quantité en chaîne décimale « 12.5 » (point, sans zéros inutiles) pour les types sérialisés. */
const q = (d: Prisma.Decimal | Decimal | string | number) => new Decimal(d).toDecimalPlaces(3).toString();

/** Lien vers la pièce d'origine d'un mouvement. */
export function documentHref(type: StockDocumentType, id: string | null): string | null {
  if (!id) return null;
  if (type === "RECEPTION") return `/stock/receptions/${id}`;
  if (type === "SORTIE") return `/stock/sorties/${id}`;
  return null;
}

async function visibility(user: PermissionUser, settings: AppSettings) {
  return {
    pmp: can(user, "price.viewPmp"),
    purchase: canSeePurchasePrice(user, { showPurchasePriceToWarehouse: settings.showPurchasePriceToWarehouse || settings.receiptShowPricesToStorekeeper }),
  };
}

// ------------------------------------------------------------------ stock par article

const SITUATION_FILTER = {
  ROUGE: (r: StockListRow) => r.severity === "ROUGE",
  ORANGE: (r: StockListRow) => r.severity === "ORANGE",
  VERT: (r: StockListRow) => r.severity === "VERT",
  SOUS_POINT: (r: StockListRow) => r.belowReorderPoint,
  RUPTURE: (r: StockListRow) => new Decimal(r.onHand).lte(0),
  DORMANT: (r: StockListRow) => r.dormant,
} as const;

async function buildStockRows(client: Client, user: PermissionUser, f: ReturnType<typeof listStockSchema.parse>, at: Date) {
  const settings = await getSettings();
  const vis = await visibility(user, settings);
  // Mêmes critères que la liste des articles (recherche code/désignation/code-barres/équipement/réf. fournisseur,
  // catégorie, criticité, famille, équipement, statut), mais seuls les articles gérés en stock : pas de services.
  const where: Prisma.ItemWhereInput = {
    AND: [
      { stocked: true },
      buildItemWhere({ ...f, tri: undefined }),
      ...(f.classe ? [{ abcClass: f.classe }] : []),
      ...(f.depot ? [{ stockLevels: { some: { warehouseId: f.depot } } }] : []),
    ],
  };
  const items = await client.item.findMany({ where, select: FORECAST_ITEM_SELECT, orderBy: { code: "asc" } });
  const stats = await loadStats(client, { itemIds: items.length < 2000 ? items.map((i) => i.id) : undefined, warehouseId: f.depot, at, settings });
  const today = todayAbidjan(at);
  let rows: StockListRow[] = items.map((item) => {
    const s = stats.get(item.id);
    const fc = buildForecast(item, s, settings, today);
    const onHand = s?.onHand ?? new Decimal(0);
    const value = s?.value ?? 0;
    const row: StockListRow = {
      id: item.id,
      code: item.code,
      name: item.name,
      category: item.category,
      criticality: item.criticality,
      status: item.status,
      family: item.family,
      equipment: item.equipment,
      stockUnit: item.stockUnit,
      onHand: q(onHand),
      onOrder: q(s?.onOrder ?? 0),
      leadTimeDays: fc.leadTimeDays,
      coverageDays: fc.coverageDays,
      stockoutDate: fc.stockoutDate ? dateOnly(fc.stockoutDate) : null,
      reorderPoint: new Decimal(fc.reorderPoint).gt(0) ? fc.reorderPoint : null,
      abcClass: (item.abcClass as AbcClass | null) ?? null,
      belowReorderPoint: fc.belowReorderPoint,
      dormant: isDormant(onHand, s?.lastMovementAt ?? null, at, settings.stockDormantDays),
      severity: fc.severity,
    };
    if (vis.pmp) {
      row.pmp = onHand.gt(0) ? new Decimal(value).div(onHand).toDecimalPlaces(2).toNumber() : null;
      row.value = value;
    }
    return row;
  });
  if (f.situation) rows = rows.filter(SITUATION_FILTER[f.situation]);

  const dir = f.ordre === "desc" ? -1 : 1;
  const cmpNullLast = (a: number | null, b: number | null) => (a === null ? (b === null ? 0 : 1) : b === null ? -1 : (a - b) * dir);
  const sorters: Record<string, (a: StockListRow, b: StockListRow) => number> = {
    code: (a, b) => a.code.localeCompare(b.code) * dir,
    name: (a, b) => a.name.localeCompare(b.name, "fr") * dir,
    stock: (a, b) => new Decimal(a.onHand).sub(b.onHand).toNumber() * dir,
    valeur: (a, b) => ((a.value ?? 0) - (b.value ?? 0)) * dir,
    couverture: (a, b) => cmpNullLast(a.coverageDays, b.coverageDays),
    rupture: (a, b) => cmpNullLast(a.stockoutDate ? a.stockoutDate.getTime() : null, b.stockoutDate ? b.stockoutDate.getTime() : null),
  };
  if (f.tri && sorters[f.tri]) rows.sort(sorters[f.tri]);
  return { rows, vis };
}

/** Stock par article : stock, PMP, valeur, couverture, date de rupture, seuils effectifs, classe ABC, dormants. */
export async function listStock(user: PermissionUser, raw: ListStockInput = {}, at: Date = now()): Promise<StockListResult> {
  requireAction(user, "stock.view");
  const f = parseInput(listStockSchema, raw);
  const { rows, vis } = await buildStockRows(db, user, f, at);
  const page = toPage(rows.slice((f.page - 1) * f.taille, f.page * f.taille), rows.length, f);
  return {
    ...page,
    totals: {
      ...(vis.pmp ? { value: rows.reduce((s, r) => s + (r.value ?? 0), 0) } : {}),
      count: rows.length,
      belowReorderCount: rows.filter((r) => r.belowReorderPoint).length,
      dormantCount: rows.filter((r) => r.dormant).length,
      criticalCount: rows.filter((r) => r.severity === "ROUGE").length,
    },
  };
}

/** Export Excel : mêmes filtres, sans pagination (plafond EXPORT_MAX_ROWS). */
export async function exportStock(user: PermissionUser, raw: ListStockInput = {}, at: Date = now()) {
  requireAction(user, "stock.view");
  const f = parseInput(listStockSchema, raw);
  const { rows } = await buildStockRows(db, user, f, at);
  if (rows.length > EXPORT_MAX_ROWS) {
    throw new BusinessError("EXPORT_TOO_LARGE", `Trop de lignes (${rows.length}) : affinez les filtres (maximum ${EXPORT_MAX_ROWS}).`);
  }
  return rows;
}

// ------------------------------------------------------------------ mouvements

const MOVEMENT_INCLUDE = {
  item: { select: { code: true, name: true, stockUnit: true } },
  warehouse: { select: { name: true } },
  createdBy: { select: { name: true } },
  issueLine: { select: { issue: { select: { department: { select: { name: true } } } } } },
} satisfies Prisma.StockMovementInclude;

type MovementRecord = Prisma.StockMovementGetPayload<{ include: typeof MOVEMENT_INCLUDE }>;

function movementWhere(f: { article?: string; depot?: string; type?: MovementTypeCode; du?: string; au?: string; q?: string }): Prisma.StockMovementWhereInput {
  const occurredAt: Prisma.DateTimeFilter = {};
  if (f.du) occurredAt.gte = dateOnly(f.du);
  if (f.au) occurredAt.lt = new Date(dateOnly(f.au).getTime() + 86_400_000);
  return {
    ...(f.article ? { itemId: f.article } : {}),
    ...(f.depot ? { warehouseId: f.depot } : {}),
    ...(f.type ? { type: f.type } : {}),
    ...(Object.keys(occurredAt).length ? { occurredAt } : {}),
    ...(f.q
      ? { OR: [{ documentRef: { contains: f.q, mode: "insensitive" } }, { item: { code: { contains: f.q, mode: "insensitive" } } }, { item: { name: { contains: f.q, mode: "insensitive" } } }] }
      : {}),
  };
}

function toMovementRow(m: MovementRecord, vis: { pmp: boolean; purchase: boolean }): MovementRowView {
  const type = m.type as MovementTypeCode;
  const row: MovementRowView = {
    id: m.id,
    occurredAt: m.occurredAt,
    itemId: m.itemId,
    itemCode: m.item.code,
    itemName: m.item.name,
    stockUnit: m.item.stockUnit,
    warehouseName: m.warehouse.name,
    type,
    quantity: q(m.quantity),
    stockAfter: q(m.stockAfter),
    documentRef: m.documentRef,
    documentHref: documentHref(m.documentType, m.documentId),
    departmentName: m.issueLine?.issue.department.name ?? null,
    comment: m.comment,
    createdByName: m.createdBy.name,
    isReversal: m.reversalOfId !== null,
  };
  const costOk = PURCHASE_COST_MOVEMENTS.includes(type) ? vis.purchase : vis.pmp;
  if (costOk) {
    row.unitCost = new Decimal(m.unitCost).toDecimalPlaces(4).toString();
    row.value = m.value;
  }
  return row;
}

/** Journal des mouvements, filtrable par article, dépôt, type, période (jours Abidjan). */
export async function listMovements(user: PermissionUser, raw: ListMovementsInput = {}) {
  requireAction(user, "stock.view");
  const f = parseInput(listMovementsSchema, raw);
  const vis = await visibility(user, await getSettings());
  const where = movementWhere(f);
  const [total, rows] = await Promise.all([
    db.stockMovement.count({ where }),
    db.stockMovement.findMany({
      where,
      include: MOVEMENT_INCLUDE,
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      skip: (f.page - 1) * f.taille,
      take: f.taille,
    }),
  ]);
  return toPage(rows.map((m) => toMovementRow(m, vis)), total, f);
}

export async function exportMovements(user: PermissionUser, raw: ListMovementsInput = {}) {
  requireAction(user, "stock.view");
  const f = parseInput(listMovementsSchema, raw);
  const vis = await visibility(user, await getSettings());
  const where = movementWhere(f);
  const total = await db.stockMovement.count({ where });
  if (total > EXPORT_MAX_ROWS) {
    throw new BusinessError("EXPORT_TOO_LARGE", `Trop de lignes (${total}) : affinez les filtres (maximum ${EXPORT_MAX_ROWS}).`);
  }
  const rows = await db.stockMovement.findMany({ where, include: MOVEMENT_INCLUDE, orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }] });
  return rows.map((m) => toMovementRow(m, vis));
}

/** Fiche de stock d'un article : mouvements (récents d'abord) avec solde progressif, et stock par dépôt. */
export async function itemLedger(user: PermissionUser, raw: unknown): Promise<ItemLedger> {
  requireAction(user, "stock.view");
  const f = parseInput(itemLedgerSchema, raw);
  const vis = await visibility(user, await getSettings());
  const item = await db.item.findUnique({ where: { id: f.itemId }, select: { id: true, stockUnit: true } });
  if (!item) throw new BusinessError("NOT_FOUND", "Article introuvable.");
  const [movements, levels] = await Promise.all([
    db.stockMovement.findMany({
      where: { itemId: f.itemId, ...(f.warehouseId ? { warehouseId: f.warehouseId } : {}) },
      include: { warehouse: { select: { name: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    db.stockLevel.findMany({ where: { itemId: f.itemId }, include: { warehouse: { select: { name: true } } }, orderBy: { warehouse: { name: "asc" } } }),
  ]);
  let balance = new Decimal(0);
  const all: LedgerRowView[] = movements.map((m) => {
    balance = f.warehouseId ? new Decimal(m.stockAfter) : balance.add(m.quantity);
    const type = m.type as MovementTypeCode;
    const row: LedgerRowView = {
      id: m.id,
      occurredAt: m.occurredAt,
      type,
      documentRef: m.documentRef,
      documentHref: documentHref(m.documentType, m.documentId),
      warehouseName: m.warehouse.name,
      quantity: q(m.quantity),
      stockAfter: q(m.stockAfter),
      balance: q(balance),
      comment: m.comment,
    };
    if (PURCHASE_COST_MOVEMENTS.includes(type) ? vis.purchase : vis.pmp) {
      row.pmpAfter = new Decimal(m.pmpAfter).toDecimalPlaces(4).toString();
      row.value = m.value;
    }
    return row;
  });
  return {
    itemId: item.id,
    stockUnit: item.stockUnit,
    rows: all.slice(-f.limit).reverse(),
    warehouses: levels.map((l) => ({
      warehouseId: l.warehouseId,
      warehouseName: l.warehouse.name,
      quantity: q(l.quantity),
      ...(vis.pmp ? { pmp: new Decimal(l.pmp).toDecimalPlaces(4).toString() } : {}),
    })),
  };
}

// ------------------------------------------------------------------ bons de sortie

const ISSUE_INCLUDE = {
  warehouse: { select: { name: true } },
  department: { select: { name: true } },
  createdBy: { select: { name: true } },
  lines: { include: { item: { select: { code: true, name: true, stockUnit: true } } }, orderBy: { id: "asc" } },
} satisfies Prisma.StockIssueInclude;

type IssueRecord = Prisma.StockIssueGetPayload<{ include: typeof ISSUE_INCLUDE }>;

function toIssueRow(i: IssueRecord, pmp: boolean): IssueRowView {
  return {
    id: i.id,
    number: i.number,
    status: i.status,
    issuedAt: i.issuedAt,
    warehouseName: i.warehouse.name,
    departmentName: i.department.name,
    requesterName: i.requesterName,
    reason: i.reason,
    equipment: i.equipment,
    lineCount: i.lines.length,
    createdByName: i.createdBy.name,
    ...(pmp ? { totalValue: i.lines.reduce((s, l) => s + l.value, 0) } : {}),
  };
}

export async function listIssues(user: PermissionUser, raw: ListIssuesInput = {}) {
  requireAction(user, "stock.view");
  const f = parseInput(listIssuesSchema, raw);
  const issuedAt: Prisma.DateTimeFilter = {};
  if (f.du) issuedAt.gte = dateOnly(f.du);
  if (f.au) issuedAt.lte = dateOnly(f.au);
  const where: Prisma.StockIssueWhereInput = {
    ...(f.statut ? { status: f.statut } : {}),
    ...(f.service ? { departmentId: f.service } : {}),
    ...(f.depot ? { warehouseId: f.depot } : {}),
    ...(Object.keys(issuedAt).length ? { issuedAt } : {}),
    ...(f.q
      ? {
          OR: [
            { number: { contains: f.q, mode: "insensitive" } },
            { requesterName: { contains: f.q, mode: "insensitive" } },
            { equipment: { contains: f.q, mode: "insensitive" } },
            { lines: { some: { item: { OR: [{ code: { contains: f.q, mode: "insensitive" } }, { name: { contains: f.q, mode: "insensitive" } }] } } } },
          ],
        }
      : {}),
  };
  const pmp = can(user, "price.viewPmp");
  const [total, rows] = await Promise.all([
    db.stockIssue.count({ where }),
    db.stockIssue.findMany({
      where,
      include: ISSUE_INCLUDE,
      orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
      skip: (f.page - 1) * f.taille,
      take: f.taille,
    }),
  ]);
  return toPage(rows.map((r) => toIssueRow(r, pmp)), total, f);
}

export async function getIssue(user: PermissionUser, raw: unknown): Promise<IssueDetailView> {
  requireAction(user, "stock.view");
  const { id } = parseInput(issueIdSchema, raw);
  const i = await db.stockIssue.findUnique({ where: { id }, include: ISSUE_INCLUDE });
  if (!i) throw new BusinessError("NOT_FOUND", "Bon de sortie introuvable.");
  const pmp = can(user, "price.viewPmp");
  const canceller = i.cancelledById ? await db.user.findUnique({ where: { id: i.cancelledById }, select: { name: true } }) : null;
  return {
    ...toIssueRow(i, pmp),
    lines: i.lines.map((l) => ({
      id: l.id,
      itemId: l.itemId,
      itemCode: l.item.code,
      itemName: l.item.name,
      stockUnit: l.item.stockUnit,
      quantity: q(l.quantity),
      ...(pmp ? { unitCost: new Decimal(l.unitCost).toDecimalPlaces(4).toString(), value: l.value } : {}),
    })),
    cancelledAt: i.cancelledAt,
    cancelledReason: i.cancelledReason,
    cancelledByName: canceller?.name ?? null,
  };
}

/** Recherche d'article pour une sortie (code, désignation ou code-barres) avec le stock disponible au dépôt. */
export async function searchIssueItems(user: PermissionUser, raw: unknown): Promise<IssueItemHit[]> {
  requireAction(user, "stock.issue");
  const f = parseInput(searchIssueItemsSchema, raw);
  const term = f.q.trim();
  const items = await db.item.findMany({
    where: {
      stocked: true,
      status: { not: "OBSOLETE" },
      ...(term ? { OR: [{ code: { contains: term, mode: "insensitive" } }, { name: { contains: term, mode: "insensitive" } }, { barcode: term }] } : {}),
    },
    select: { id: true, code: true, name: true, category: true, stockUnit: true, stockLevels: { where: { warehouseId: f.warehouseId }, select: { quantity: true } } },
    orderBy: { code: "asc" },
    take: 60,
  });
  return items
    .map((i) => ({ id: i.id, code: i.code, name: i.name, category: i.category, stockUnit: i.stockUnit, available: q(i.stockLevels[0]?.quantity ?? 0) }))
    .sort((a, b) => Number(new Decimal(b.available).gt(0)) - Number(new Decimal(a.available).gt(0)))
    .slice(0, f.limit);
}

// ------------------------------------------------------------------ réapprovisionnement

const OPEN_REQUEST_STATUSES = ["SOUMISE", "A_COMPLETER", "VALIDEE", "EN_CONSULTATION"] as const;
const SEVERITY_RANK = { ROUGE: 0, ORANGE: 1, VERT: 2 } as const;

export interface ReorderComputed {
  row: ReorderRowView;
  item: ForecastItem;
  /** Quantité suggérée en unité de stock. */
  suggestedStockQty: string;
}

/** Articles sous leur point de commande effectif (position = stock + reste à recevoir), les plus urgents d'abord. */
export async function computeReorder(client: Client, at: Date): Promise<ReorderComputed[]> {
  const settings = await getSettings();
  const items = await client.item.findMany({ where: { stocked: true, status: "ACTIF" }, select: FORECAST_ITEM_SELECT, orderBy: { code: "asc" } });
  const stats = await loadStats(client, { at, settings });
  const today = todayAbidjan(at);
  const below = items
    .map((item) => ({ item, fc: buildForecast(item, stats.get(item.id), settings, today) }))
    .filter(({ fc }) => isBelowReorderPoint(fc.position, fc.reorderPoint));
  if (below.length === 0) return [];
  const open = await client.purchaseRequestLine.findMany({
    where: { itemId: { in: below.map((b) => b.item.id) }, request: { status: { in: [...OPEN_REQUEST_STATUSES] } } },
    select: { itemId: true, request: { select: { id: true, number: true } } },
    orderBy: { request: { createdAt: "desc" } },
  });
  const openByItem = new Map<string, { id: string; number: string }>();
  for (const o of open) if (o.itemId && o.request.number && !openByItem.has(o.itemId)) openByItem.set(o.itemId, { id: o.request.id, number: o.request.number });

  const out = below.map(({ item, fc }): ReorderComputed => {
    const mainLink = item.suppliers.find((s) => s.supplierId === item.mainSupplierId && s.active);
    const conv = reorderQuantity({
      position: fc.position,
      reorderPoint: fc.reorderPoint,
      economicOrderQty: item.economicOrderQty,
      dailyConsumption: fc.avgDailyConsumption,
      leadTimeDays: itemLeadTime(item, settings),
      factor: item.conversionFactor,
      minOrderQty: mainLink?.minOrderQty ?? null,
    });
    return {
      item,
      suggestedStockQty: q(conv.stockQty),
      row: {
        itemId: item.id,
        code: item.code,
        name: item.name,
        criticality: item.criticality,
        stockUnit: item.stockUnit,
        purchaseUnit: item.purchaseUnit,
        onHand: fc.onHand,
        onOrder: fc.onOrder,
        position: fc.position,
        reorderPoint: item.reorderPoint ? q(item.reorderPoint) : null,
        suggestedReorderPoint: fc.suggestedReorderPoint,
        suggestedSafetyStock: fc.suggestedSafetyStock,
        coverageDays: fc.coverageDays,
        stockoutDate: fc.stockoutDate ? dateOnly(fc.stockoutDate) : null,
        severity: fc.severity,
        leadTimeDays: fc.leadTimeDays,
        suggestedQty: q(conv.purchaseQty),
        minOrderQty: mainLink?.minOrderQty ? q(mainLink.minOrderQty) : null,
        supplierName: item.mainSupplier?.name ?? null,
        purchaseType: item.mainSupplier?.type ?? "A_DEFINIR",
        existingRequest: openByItem.get(item.id) ?? null,
      },
    };
  });
  out.sort((a, b) => {
    const ra = a.row.severity ? SEVERITY_RANK[a.row.severity] : 3;
    const rb = b.row.severity ? SEVERITY_RANK[b.row.severity] : 3;
    return ra - rb || (a.row.coverageDays ?? Infinity) - (b.row.coverageDays ?? Infinity) || a.row.code.localeCompare(b.row.code);
  });
  return out;
}

export async function listReorder(user: PermissionUser, at: Date = now()): Promise<ReorderRowView[]> {
  requireAction(user, "stock.reorder");
  return (await computeReorder(db, at)).map((r) => r.row);
}
