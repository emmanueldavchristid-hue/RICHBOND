import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/errors";
import { now } from "@/lib/clock";
import { Prisma, type ItemStatus } from "@/generated/prisma/client";
import { log } from "@/modules/audit";
import { getRateAt } from "@/modules/currencies/service";
import type { Actor } from "@/modules/referentials/actor";
import { generateCode } from "@/modules/referentials/auto-code";
import { assertFresh } from "@/modules/referentials/concurrency";
import { codeExists, rethrowUnique } from "@/modules/referentials/db-errors";
import { EXPORT_MAX_ROWS, toPage, type Page } from "@/modules/referentials/list-query";
import { expectedUpdatedAtSchema, idSchema } from "@/modules/referentials/schemas";
import {
  changeItemCodeSchema,
  createItemSchema,
  linkSupplierSchema,
  listItemsSchema,
  setItemStatusSchema,
  updateItemSchema,
  updateItemSupplierSchema,
  type CreateItemInput,
  type ListItemsInput,
  type UpdateItemInput,
} from "./schemas";

const SORTABLE = ["code", "name", "category", "family", "criticality", "status", "equipment", "stockUnit"] as const;

const barcodeExists = () => new BusinessError("BARCODE_EXISTS", "Ce code-barres est déjà utilisé par un autre article.");
const uniqueMap = () => ({ code: codeExists(), barcode: barcodeExists() });

export interface ItemRow {
  id: string;
  code: string;
  name: string;
  category: string;
  family: string | null;
  stockUnit: string;
  purchaseUnit: string;
  criticality: string;
  status: ItemStatus;
  stocked: boolean;
  equipment: string | null;
  mainSupplier: { id: string; code: string; name: string } | null;
  updatedAt: Date;
}

/** Filtre partagé par la liste et l'export Excel (R17/R18). Aucune donnée de prix. */
export function buildItemWhere(f: z.output<typeof listItemsSchema>): Prisma.ItemWhereInput {
  const and: Prisma.ItemWhereInput[] = [];
  if (f.q) {
    and.push({
      OR: [
        { code: { contains: f.q, mode: "insensitive" } },
        { name: { contains: f.q, mode: "insensitive" } },
        { barcode: { contains: f.q, mode: "insensitive" } },
        { equipment: { contains: f.q, mode: "insensitive" } },
        { suppliers: { some: { supplierRef: { contains: f.q, mode: "insensitive" } } } },
      ],
    });
  }
  if (f.categorie) and.push({ category: f.categorie });
  if (f.criticite) and.push({ criticality: f.criticite });
  if (f.famille) and.push({ family: { equals: f.famille, mode: "insensitive" } });
  if (f.equipement) and.push({ category: "PDR", equipment: { contains: f.equipement, mode: "insensitive" } });
  if (f.statut === undefined) and.push({ status: "ACTIF" });
  else if (f.statut !== "TOUS") and.push({ status: f.statut });
  return and.length ? { AND: and } : {};
}

export function buildItemOrder(f: { tri?: string; ordre: "asc" | "desc" }): Prisma.ItemOrderByWithRelationInput[] {
  const key = (SORTABLE as readonly string[]).includes(f.tri ?? "") ? f.tri! : "code";
  return [{ [key]: f.ordre }, { id: "asc" }];
}

export async function listItems(raw: ListItemsInput = {}): Promise<Page<ItemRow>> {
  const f = listItemsSchema.parse(raw);
  const where = buildItemWhere(f);
  const [rows, total] = await Promise.all([
    db.item.findMany({
      where,
      orderBy: buildItemOrder(f),
      skip: (f.page - 1) * f.taille,
      take: f.taille,
      select: {
        id: true,
        code: true,
        name: true,
        category: true,
        family: true,
        stockUnit: true,
        purchaseUnit: true,
        criticality: true,
        status: true,
        stocked: true,
        equipment: true,
        updatedAt: true,
        mainSupplier: { select: { id: true, code: true, name: true } },
      },
    }),
    db.item.count({ where }),
  ]);
  return toPage(rows, total, f);
}

/** Valeurs distinctes de la famille (suggestions, R5). */
export async function listFamilies(): Promise<string[]> {
  const rows = await db.item.findMany({
    where: { family: { not: null } },
    distinct: ["family"],
    select: { family: true },
    orderBy: { family: "asc" },
  });
  return rows.map((r) => r.family!).filter(Boolean);
}

/** Articles pour les listes déroulantes (DA, BC). */
export async function listItemOptions(opts: { q?: string; limit?: number } = {}) {
  return db.item.findMany({
    where: {
      status: "ACTIF",
      ...(opts.q
        ? { OR: [{ code: { contains: opts.q, mode: "insensitive" } }, { name: { contains: opts.q, mode: "insensitive" } }] }
        : {}),
    },
    orderBy: { code: "asc" },
    take: Math.min(opts.limit ?? 50, 200),
    select: { id: true, code: true, name: true, category: true, stockUnit: true, purchaseUnit: true },
  });
}

const dec = (v: Prisma.Decimal | null) => (v === null ? null : v.toString());

export async function getItem(id: string, opts: { showPrices: boolean }) {
  const it = await db.item.findUnique({
    where: { id },
    include: {
      defaultWarehouse: { select: { id: true, code: true, name: true } },
      mainSupplier: { select: { id: true, code: true, name: true, status: true } },
      suppliers: {
        orderBy: [{ active: "desc" }, { supplier: { name: "asc" } }],
        include: { supplier: { select: { id: true, code: true, name: true, status: true, currencyCode: true } } },
      },
    },
  });
  if (!it) throw new BusinessError("NOT_FOUND", "Article introuvable.");
  const { suppliers, conversionFactor, safetyStock, reorderPoint, economicOrderQty, ...rest } = it;
  return {
    ...rest,
    conversionFactor: conversionFactor.toString(),
    safetyStock: dec(safetyStock),
    reorderPoint: dec(reorderPoint),
    economicOrderQty: dec(economicOrderQty),
    hasPhoto: !!it.photoPath,
    showPrices: opts.showPrices,
    suppliers: suppliers.map((l) => ({
      id: l.id,
      supplier: l.supplier,
      supplierRef: l.supplierRef,
      leadTimeDays: l.leadTimeDays,
      minOrderQty: dec(l.minOrderQty),
      active: l.active,
      updatedAt: l.updatedAt,
      lastPrice: opts.showPrices ? dec(l.lastPrice) : null,
      currencyCode: opts.showPrices ? l.currencyCode : null,
      lastPriceDate: opts.showPrices ? l.lastPriceDate : null,
    })),
  };
}

export async function listPriceHistory(itemId: string, opts: { showPrices: boolean }) {
  if (!opts.showPrices) return [];
  const rows = await db.itemPriceHistory.findMany({
    where: { itemId },
    orderBy: { date: "desc" },
    take: 200,
  });
  const names = await db.supplier.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.supplierId))] } },
    select: { id: true, code: true, name: true },
  });
  const byId = new Map(names.map((s) => [s.id, s]));
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    supplier: byId.get(r.supplierId) ?? null,
    price: r.price.toString(),
    currencyCode: r.currencyCode,
    rateToXof: dec(r.rateToXof),
    source: r.source,
    sourceRef: r.sourceRef,
  }));
}

// ------------------------------------------------------------------ règles

async function assertWarehouseUsable(tx: Prisma.TransactionClient, id: string) {
  const w = await tx.warehouse.findUnique({ where: { id } });
  if (!w || !w.active) throw new BusinessError("WAREHOUSE_INVALID", "Dépôt inconnu ou désactivé.");
}

/** R7 : fournisseur principal ACTIF ou EN_EVALUATION ; crée/réactive la ligne ItemSupplier. */
async function ensureMainSupplier(tx: Prisma.TransactionClient, actor: Actor, itemId: string, supplierId: string) {
  const s = await tx.supplier.findUnique({ where: { id: supplierId } });
  if (!s) throw new BusinessError("NOT_FOUND", "Fournisseur introuvable.");
  if (s.status === "BLOQUE") {
    throw new BusinessError("SUPPLIER_BLOCKED", `Le fournisseur « ${s.name} » est bloqué : il ne peut pas être fournisseur principal.`);
  }
  const link = await tx.itemSupplier.findUnique({ where: { itemId_supplierId: { itemId, supplierId } } });
  if (!link) {
    const created = await tx.itemSupplier.create({ data: { itemId, supplierId, createdById: actor.id } });
    await log(tx, { userId: actor.id, action: "ITEM_SUPPLIER_LINK", entity: "ItemSupplier", entityId: created.id, after: created });
  } else if (!link.active) {
    await tx.itemSupplier.update({ where: { id: link.id }, data: { active: true } });
  }
}

export async function createItem(actor: Actor, raw: CreateItemInput, ip?: string | null) {
  const input = createItemSchema.parse(raw);
  const { code, mainSupplierId, ...data } = input;
  try {
    return await db.$transaction(async (tx) => {
      if (data.defaultWarehouseId) await assertWarehouseUsable(tx, data.defaultWarehouseId);
      const finalCode = code ?? (await generateCode(tx, "ART", async (c) => !!(await tx.item.findUnique({ where: { code: c } }))));
      const created = await tx.item.create({
        data: { ...data, code: finalCode, mainSupplierId: null, createdById: actor.id },
      });
      let result = created;
      if (mainSupplierId) {
        await ensureMainSupplier(tx, actor, created.id, mainSupplierId);
        result = await tx.item.update({ where: { id: created.id }, data: { mainSupplierId } });
      }
      await log(tx, { userId: actor.id, action: "ITEM_CREATE", entity: "Item", entityId: created.id, after: result, ip });
      return result;
    });
  } catch (e) {
    return rethrowUnique(e, uniqueMap());
  }
}

export async function updateItem(actor: Actor, raw: UpdateItemInput, ip?: string | null) {
  const input = updateItemSchema.parse(raw);
  const { id, expectedUpdatedAt, ...data } = input;
  try {
    return await db.$transaction(async (tx) => {
      const before = await tx.item.findUnique({ where: { id } });
      if (!before) throw new BusinessError("NOT_FOUND", "Article introuvable.");
      assertFresh(before.updatedAt, expectedUpdatedAt);
      if (data.defaultWarehouseId && data.defaultWarehouseId !== before.defaultWarehouseId) {
        await assertWarehouseUsable(tx, data.defaultWarehouseId);
      }
      if (data.mainSupplierId && data.mainSupplierId !== before.mainSupplierId) {
        await ensureMainSupplier(tx, actor, id, data.mainSupplierId);
      }
      const after = await tx.item.update({ where: { id }, data });
      await log(tx, { userId: actor.id, action: "ITEM_UPDATE", entity: "Item", entityId: id, before, after, ip });
      return after;
    });
  } catch (e) {
    return rethrowUnique(e, uniqueMap());
  }
}

export async function setItemStatus(actor: Actor, raw: z.input<typeof setItemStatusSchema>, ip?: string | null) {
  const input = setItemStatusSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const before = await tx.item.findUnique({ where: { id: input.id } });
    if (!before) throw new BusinessError("NOT_FOUND", "Article introuvable.");
    assertFresh(before.updatedAt, input.expectedUpdatedAt);
    if (before.status === input.status) return before;
    const after = await tx.item.update({ where: { id: before.id }, data: { status: input.status } });
    await log(tx, {
      userId: actor.id,
      action: "ITEM_STATUS",
      entity: "Item",
      entityId: before.id,
      before: { status: before.status },
      after: { status: after.status },
      ip,
    });
    return after;
  });
}

/** R2 : le code est la clé d'échange Sage ; modifiable par le Responsable seul (droit vérifié par l'action). */
export async function changeItemCode(actor: Actor, raw: z.input<typeof changeItemCodeSchema>, ip?: string | null) {
  const input = changeItemCodeSchema.parse(raw);
  try {
    return await db.$transaction(async (tx) => {
      const before = await tx.item.findUnique({ where: { id: input.id } });
      if (!before) throw new BusinessError("NOT_FOUND", "Article introuvable.");
      assertFresh(before.updatedAt, input.expectedUpdatedAt);
      if (before.code === input.code) return before;
      const after = await tx.item.update({ where: { id: before.id }, data: { code: input.code } });
      await log(tx, {
        userId: actor.id,
        action: "ITEM_CODE_CHANGE",
        entity: "Item",
        entityId: before.id,
        before: { code: before.code },
        after: { code: after.code },
        ip,
      });
      return after;
    });
  } catch (e) {
    return rethrowUnique(e, { code: codeExists() });
  }
}

// ------------------------------------------------------------------ fournisseurs de l'article

/** R10 : toute modification de prix (ou de devise) crée une ligne d'historique, taux figé si connu. */
async function recordPrice(
  tx: Prisma.TransactionClient,
  actor: Actor,
  itemId: string,
  supplierId: string,
  price: number,
  currencyCode: string,
  at: Date,
) {
  let rateToXof: Prisma.Decimal | null = null;
  try {
    rateToXof = (await getRateAt(tx, currencyCode, at)).rate;
  } catch (e) {
    if (!(e instanceof BusinessError) || e.code !== "RATE_MISSING") throw e;
  }
  await tx.itemPriceHistory.create({
    data: { itemId, supplierId, price, currencyCode, rateToXof, source: "MANUEL", date: at, createdById: actor.id },
  });
}

async function assertCurrencyKnown(tx: Prisma.TransactionClient, code: string | null) {
  if (!code) return;
  const c = await tx.currency.findUnique({ where: { code } });
  if (!c || !c.active) throw new BusinessError("CURRENCY_INVALID", "Devise inconnue ou désactivée.");
}

export async function linkSupplier(actor: Actor, raw: z.input<typeof linkSupplierSchema>, ip?: string | null) {
  const input = linkSupplierSchema.parse(raw);
  const { itemId, supplierId, ...fields } = input;
  try {
    return await db.$transaction(async (tx) => {
      const [item, supplier] = await Promise.all([
        tx.item.findUnique({ where: { id: itemId }, select: { id: true } }),
        tx.supplier.findUnique({ where: { id: supplierId }, select: { id: true, name: true, status: true } }),
      ]);
      if (!item) throw new BusinessError("NOT_FOUND", "Article introuvable.");
      if (!supplier) throw new BusinessError("NOT_FOUND", "Fournisseur introuvable.");
      if (supplier.status === "BLOQUE") {
        throw new BusinessError("SUPPLIER_BLOCKED", `Le fournisseur « ${supplier.name} » est bloqué.`);
      }
      await assertCurrencyKnown(tx, fields.currencyCode);
      const at = now();
      const existing = await tx.itemSupplier.findUnique({ where: { itemId_supplierId: { itemId, supplierId } } });
      if (existing?.active) {
        throw new BusinessError("LINK_EXISTS", "Cet article est déjà lié à ce fournisseur.");
      }
      const data = { ...fields, lastPriceDate: fields.lastPrice != null ? at : null, active: true };
      const link = existing
        ? await tx.itemSupplier.update({ where: { id: existing.id }, data })
        : await tx.itemSupplier.create({ data: { itemId, supplierId, ...data, createdById: actor.id } });
      if (fields.lastPrice != null && fields.currencyCode) {
        await recordPrice(tx, actor, itemId, supplierId, fields.lastPrice, fields.currencyCode, at);
      }
      await log(tx, { userId: actor.id, action: "ITEM_SUPPLIER_LINK", entity: "ItemSupplier", entityId: link.id, after: link, ip });
      return link;
    });
  } catch (e) {
    return rethrowUnique(e, { item_id: new BusinessError("LINK_EXISTS", "Cet article est déjà lié à ce fournisseur.") });
  }
}

export async function updateItemSupplier(actor: Actor, raw: z.input<typeof updateItemSupplierSchema>, ip?: string | null) {
  const { id, expectedUpdatedAt, ...fields } = updateItemSupplierSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const before = await tx.itemSupplier.findUnique({ where: { id } });
    if (!before) throw new BusinessError("NOT_FOUND", "Lien article-fournisseur introuvable.");
    assertFresh(before.updatedAt, expectedUpdatedAt);
    await assertCurrencyKnown(tx, fields.currencyCode);
    const at = now();
    const priceChanged =
      fields.lastPrice != null &&
      (before.lastPrice === null || !before.lastPrice.eq(fields.lastPrice) || before.currencyCode !== fields.currencyCode);
    const after = await tx.itemSupplier.update({
      where: { id },
      data: { ...fields, lastPriceDate: priceChanged ? at : fields.lastPrice == null ? null : before.lastPriceDate },
    });
    if (priceChanged && fields.lastPrice != null && fields.currencyCode) {
      await recordPrice(tx, actor, before.itemId, before.supplierId, fields.lastPrice, fields.currencyCode, at);
    }
    await log(tx, { userId: actor.id, action: "ITEM_SUPPLIER_UPDATE", entity: "ItemSupplier", entityId: id, before, after, ip });
    return after;
  });
}

export async function deactivateItemSupplier(
  actor: Actor,
  raw: { id: string; expectedUpdatedAt: Date | string },
  ip?: string | null,
) {
  const input = z.object({ id: idSchema, expectedUpdatedAt: expectedUpdatedAtSchema }).parse(raw);
  return db.$transaction(async (tx) => {
    const before = await tx.itemSupplier.findUnique({ where: { id: input.id } });
    if (!before) throw new BusinessError("NOT_FOUND", "Lien article-fournisseur introuvable.");
    assertFresh(before.updatedAt, input.expectedUpdatedAt);
    if (!before.active) return before;
    const item = await tx.item.findUnique({ where: { id: before.itemId }, select: { mainSupplierId: true } });
    if (item?.mainSupplierId === before.supplierId) {
      throw new BusinessError(
        "MAIN_SUPPLIER_LINK",
        "Ce fournisseur est le fournisseur principal de l'article : choisissez-en un autre avant de le retirer.",
      );
    }
    const after = await tx.itemSupplier.update({ where: { id: before.id }, data: { active: false } });
    await log(tx, {
      userId: actor.id,
      action: "ITEM_SUPPLIER_DEACTIVATE",
      entity: "ItemSupplier",
      entityId: before.id,
      before: { active: true },
      after: { active: false },
      ip,
    });
    return after;
  });
}


/** R18 : mêmes filtres que la liste, plafond 10 000 lignes, aucune colonne de prix. */
export async function exportItems(raw: ListItemsInput = {}) {
  const f = listItemsSchema.parse(raw);
  const where = buildItemWhere(f);
  const total = await db.item.count({ where });
  if (total > EXPORT_MAX_ROWS) {
    throw new BusinessError("EXPORT_TOO_LARGE", `Trop de lignes (${total}) : affinez les filtres (maximum ${EXPORT_MAX_ROWS}).`);
  }
  return db.item.findMany({
    where,
    orderBy: buildItemOrder(f),
    include: {
      mainSupplier: { select: { code: true, name: true } },
      defaultWarehouse: { select: { code: true, name: true } },
    },
  });
}
