import "server-only";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/errors";
import { now } from "@/lib/clock";
import type { Prisma, SupplierStatus } from "@/generated/prisma/client";
import { log } from "@/modules/audit";
import type { Actor } from "@/modules/referentials/actor";
import { generateCode } from "@/modules/referentials/auto-code";
import { assertFresh } from "@/modules/referentials/concurrency";
import { normalizeName, validateNcc, requiredCodeSchema } from "@/modules/referentials/codes";
import { codeExists, rethrowUnique } from "@/modules/referentials/db-errors";
import { EXPORT_MAX_ROWS, toPage, type Page } from "@/modules/referentials/list-query";
import { expectedUpdatedAtSchema, idSchema } from "@/modules/referentials/schemas";
import { z } from "zod";
import {
  addContactSchema,
  blockSupplierSchema,
  createSupplierSchema,
  listSuppliersSchema,
  unblockSupplierSchema,
  updateContactSchema,
  updateSupplierSchema,
  type CreateSupplierInput,
  type ListSuppliersInput,
  type UpdateSupplierInput,
} from "./schemas";

const SORTABLE = ["code", "name", "type", "status", "city", "country", "currencyCode"] as const;

const nccExists = () => new BusinessError("NCC_EXISTS", "Ce NCC est déjà utilisé par un autre fournisseur.");

export interface SupplierRow {
  id: string;
  code: string;
  name: string;
  type: "LOCAL" | "IMPORT";
  country: string;
  city: string | null;
  currencyCode: string;
  ncc: string | null;
  paymentTerm: string;
  incoterm: string | null;
  leadTimeDays: number | null;
  categories: string[];
  status: SupplierStatus;
  updatedAt: Date;
}

const rowSelect = {
  id: true,
  code: true,
  name: true,
  type: true,
  country: true,
  city: true,
  currencyCode: true,
  ncc: true,
  paymentTerm: true,
  incoterm: true,
  leadTimeDays: true,
  categories: true,
  status: true,
  updatedAt: true,
} satisfies Prisma.SupplierSelect;

/** Filtre partagé par la liste et l'export Excel (R17/R18). */
export function buildSupplierWhere(f: ReturnType<typeof listSuppliersSchema.parse>): Prisma.SupplierWhereInput {
  const and: Prisma.SupplierWhereInput[] = [];
  if (f.q) {
    and.push({
      OR: [
        { code: { contains: f.q, mode: "insensitive" } },
        { name: { contains: f.q, mode: "insensitive" } },
        { ncc: { contains: f.q, mode: "insensitive" } },
        { city: { contains: f.q, mode: "insensitive" } },
      ],
    });
  }
  if (f.type) and.push({ type: f.type });
  if (f.pays) and.push({ country: f.pays.toUpperCase() });
  if (f.categorie) and.push({ categories: { has: f.categorie } });
  if (f.statut === undefined) and.push({ status: { in: ["ACTIF", "EN_EVALUATION"] } });
  else if (f.statut !== "TOUS") and.push({ status: f.statut });
  return and.length ? { AND: and } : {};
}

export function buildSupplierOrder(f: { tri?: string; ordre: "asc" | "desc" }): Prisma.SupplierOrderByWithRelationInput[] {
  const key = (SORTABLE as readonly string[]).includes(f.tri ?? "") ? f.tri! : "name";
  return [{ [key]: f.ordre }, { id: "asc" }];
}

export async function listSuppliers(raw: ListSuppliersInput = {}): Promise<Page<SupplierRow>> {
  const f = listSuppliersSchema.parse(raw);
  const where = buildSupplierWhere(f);
  const [rows, total] = await Promise.all([
    db.supplier.findMany({
      where,
      orderBy: buildSupplierOrder(f),
      skip: (f.page - 1) * f.taille,
      take: f.taille,
      select: rowSelect,
    }),
    db.supplier.count({ where }),
  ]);
  return toPage(rows, total, f);
}

export async function listSupplierOptions() {
  return db.supplier.findMany({
    where: { status: { not: "BLOQUE" } },
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true, type: true, currencyCode: true, status: true },
  });
}

/** Indicateurs de la fiche (BC, montant 12 mois, taux de service, note) : alimentés aux lots 5, 10 et 14. */
export async function supplierIndicators(id: string): Promise<null> {
  void id;
  return null;
}

/** LOT-05 : un fournisseur bloqué ne peut plus recevoir de BC. */
export function assertSupplierCanOrder(supplier: { name: string; status: SupplierStatus }): void {
  if (supplier.status === "BLOQUE") {
    throw new BusinessError("SUPPLIER_BLOCKED", `Le fournisseur « ${supplier.name} » est bloqué : aucun bon de commande possible.`);
  }
}

export async function getSupplier(id: string, opts: { showPrices: boolean }) {
  const s = await db.supplier.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: [{ active: "desc" }, { isPrimary: "desc" }, { name: "asc" }] },
      currency: { select: { code: true, name: true } },
      items: {
        where: { active: true },
        orderBy: { item: { code: "asc" } },
        include: { item: { select: { id: true, code: true, name: true, status: true, stockUnit: true, purchaseUnit: true } } },
      },
      mainItems: { select: { id: true, code: true, name: true, status: true } },
    },
  });
  if (!s) throw new BusinessError("NOT_FOUND", "Fournisseur introuvable.");
  const { items, ...rest } = s;
  return {
    ...rest,
    showPrices: opts.showPrices,
    items: items.map((l) => ({
      id: l.id,
      item: l.item,
      supplierRef: l.supplierRef,
      leadTimeDays: l.leadTimeDays,
      minOrderQty: l.minOrderQty?.toString() ?? null,
      lastPrice: opts.showPrices ? (l.lastPrice?.toString() ?? null) : null,
      currencyCode: opts.showPrices ? l.currencyCode : null,
      lastPriceDate: opts.showPrices ? l.lastPriceDate : null,
    })),
    indicators: await supplierIndicators(id),
  };
}

async function assertCurrencyUsable(tx: Prisma.TransactionClient, code: string) {
  const c = await tx.currency.findUnique({ where: { code } });
  if (!c || !c.active) throw new BusinessError("CURRENCY_INVALID", "Devise inconnue ou désactivée.");
}

async function duplicateNameWarning(tx: Prisma.TransactionClient, name: string, exceptId?: string): Promise<string[]> {
  const key = normalizeName(name);
  if (!key) return [];
  const all = await tx.supplier.findMany({ select: { id: true, name: true, code: true } });
  const twin = all.find((o) => o.id !== exceptId && normalizeName(o.name) === key);
  return twin ? [`Un fournisseur très proche existe déjà : « ${twin.name} » (${twin.code}). Vérifiez qu'il ne s'agit pas d'un doublon.`] : [];
}

function nccWarning(ncc: string | null): string[] {
  if (!ncc) return [];
  const v = validateNcc(ncc);
  return v.warning ? [v.warning] : [];
}

/** Au plus un contact principal : le premier marqué gagne. */
function normalizePrimary<T extends { isPrimary: boolean }>(contacts: T[]): T[] {
  let seen = false;
  return contacts.map((c) => {
    const isPrimary = c.isPrimary && !seen;
    if (isPrimary) seen = true;
    return { ...c, isPrimary };
  });
}

export async function createSupplier(actor: Actor, raw: CreateSupplierInput, ip?: string | null) {
  const input = createSupplierSchema.parse(raw);
  const { contacts, code, ...data } = input;
  try {
    return await db.$transaction(async (tx) => {
      await assertCurrencyUsable(tx, data.currencyCode);
      const finalCode = code ?? (await generateCode(tx, "FRS", async (c) => !!(await tx.supplier.findUnique({ where: { code: c } }))));
      const created = await tx.supplier.create({
        data: {
          ...data,
          code: finalCode,
          createdById: actor.id,
          contacts: { create: normalizePrimary(contacts).map((c) => ({ ...c, createdById: actor.id })) },
        },
        include: { contacts: true },
      });
      await log(tx, { userId: actor.id, action: "SUPPLIER_CREATE", entity: "Supplier", entityId: created.id, after: created, ip });
      const warnings = [...nccWarning(created.ncc), ...(await duplicateNameWarning(tx, created.name, created.id))];
      return { supplier: created, warnings };
    });
  } catch (e) {
    return rethrowUnique(e, { code: codeExists(), ncc: nccExists() });
  }
}

export async function updateSupplier(actor: Actor, raw: UpdateSupplierInput, ip?: string | null) {
  const input = updateSupplierSchema.parse(raw);
  const { id, expectedUpdatedAt, ...data } = input;
  try {
    return await db.$transaction(async (tx) => {
      const before = await tx.supplier.findUnique({ where: { id } });
      if (!before) throw new BusinessError("NOT_FOUND", "Fournisseur introuvable.");
      assertFresh(before.updatedAt, expectedUpdatedAt);
      if (data.currencyCode !== before.currencyCode) await assertCurrencyUsable(tx, data.currencyCode);
      // Le blocage/déblocage passe par ses propres actions (motif, droits).
      const status = before.status === "BLOQUE" ? "BLOQUE" : data.status;
      const after = await tx.supplier.update({ where: { id }, data: { ...data, status } });
      await log(tx, { userId: actor.id, action: "SUPPLIER_UPDATE", entity: "Supplier", entityId: id, before, after, ip });
      const warnings = [...nccWarning(after.ncc), ...(await duplicateNameWarning(tx, after.name, after.id))];
      return { supplier: after, warnings };
    });
  } catch (e) {
    return rethrowUnique(e, { ncc: nccExists() });
  }
}

/** R2 : le code est la clé d'échange Sage ; modifiable par le Responsable seul (droit vérifié par l'action). */
export async function changeSupplierCode(
  actor: Actor,
  raw: { id: string; code: string; expectedUpdatedAt: Date | string },
  ip?: string | null,
) {
  const input = z
    .object({ id: idSchema, code: requiredCodeSchema, expectedUpdatedAt: expectedUpdatedAtSchema })
    .parse(raw);
  try {
    return await db.$transaction(async (tx) => {
      const before = await tx.supplier.findUnique({ where: { id: input.id } });
      if (!before) throw new BusinessError("NOT_FOUND", "Fournisseur introuvable.");
      assertFresh(before.updatedAt, input.expectedUpdatedAt);
      if (before.code === input.code) return before;
      const after = await tx.supplier.update({ where: { id: before.id }, data: { code: input.code } });
      await log(tx, {
        userId: actor.id,
        action: "SUPPLIER_CODE_CHANGE",
        entity: "Supplier",
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

/** R7/R8 : motif obligatoire ; retourne les articles actifs dont il est le fournisseur principal. */
export async function blockSupplier(actor: Actor, raw: z.input<typeof blockSupplierSchema>, ip?: string | null) {
  const input = blockSupplierSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const before = await tx.supplier.findUnique({ where: { id: input.id } });
    if (!before) throw new BusinessError("NOT_FOUND", "Fournisseur introuvable.");
    assertFresh(before.updatedAt, input.expectedUpdatedAt);
    if (before.status === "BLOQUE") throw new BusinessError("ALREADY_BLOCKED", "Ce fournisseur est déjà bloqué.");
    const after = await tx.supplier.update({
      where: { id: before.id },
      data: { status: "BLOQUE", blockedReason: input.reason, blockedAt: now(), blockedById: actor.id },
    });
    const affectedItems = await tx.item.findMany({
      where: { mainSupplierId: before.id, status: "ACTIF" },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    });
    await log(tx, {
      userId: actor.id,
      action: "SUPPLIER_BLOCK",
      entity: "Supplier",
      entityId: before.id,
      before: { status: before.status },
      after: { status: after.status, reason: input.reason, affectedItems: affectedItems.map((i) => i.code) },
      ip,
    });
    return { supplier: after, affectedItems };
  });
}

/** R8 : réservé au Responsable (`supplier.evaluate`, vérifié par l'action). */
export async function unblockSupplier(actor: Actor, raw: z.input<typeof unblockSupplierSchema>, ip?: string | null) {
  const input = unblockSupplierSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const before = await tx.supplier.findUnique({ where: { id: input.id } });
    if (!before) throw new BusinessError("NOT_FOUND", "Fournisseur introuvable.");
    assertFresh(before.updatedAt, input.expectedUpdatedAt);
    if (before.status !== "BLOQUE") throw new BusinessError("NOT_BLOCKED", "Ce fournisseur n'est pas bloqué.");
    const after = await tx.supplier.update({
      where: { id: before.id },
      data: { status: input.status, blockedReason: null, blockedAt: null, blockedById: null },
    });
    await log(tx, {
      userId: actor.id,
      action: "SUPPLIER_UNBLOCK",
      entity: "Supplier",
      entityId: before.id,
      before: { status: before.status, reason: before.blockedReason },
      after: { status: after.status },
      ip,
    });
    return after;
  });
}

/** Passage ACTIF <-> EN_EVALUATION (le blocage a ses propres actions). */
export async function setSupplierStatus(
  actor: Actor,
  raw: { id: string; status: "ACTIF" | "EN_EVALUATION"; expectedUpdatedAt: Date | string },
  ip?: string | null,
) {
  const input = z
    .object({ id: idSchema, status: z.enum(["ACTIF", "EN_EVALUATION"]), expectedUpdatedAt: expectedUpdatedAtSchema })
    .parse(raw);
  return db.$transaction(async (tx) => {
    const before = await tx.supplier.findUnique({ where: { id: input.id } });
    if (!before) throw new BusinessError("NOT_FOUND", "Fournisseur introuvable.");
    assertFresh(before.updatedAt, input.expectedUpdatedAt);
    if (before.status === "BLOQUE") {
      throw new BusinessError("SUPPLIER_BLOCKED", "Fournisseur bloqué : utilisez « Débloquer » (Responsable Achats).");
    }
    const after = await tx.supplier.update({ where: { id: before.id }, data: { status: input.status } });
    await log(tx, {
      userId: actor.id,
      action: "SUPPLIER_STATUS",
      entity: "Supplier",
      entityId: before.id,
      before: { status: before.status },
      after: { status: after.status },
      ip,
    });
    return after;
  });
}

// ------------------------------------------------------------------ contacts

async function clearOtherPrimary(tx: Prisma.TransactionClient, supplierId: string, exceptId: string) {
  await tx.supplierContact.updateMany({
    where: { supplierId, isPrimary: true, id: { not: exceptId } },
    data: { isPrimary: false },
  });
}

export async function addContact(actor: Actor, raw: z.input<typeof addContactSchema>, ip?: string | null) {
  const input = addContactSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const sup = await tx.supplier.findUnique({ where: { id: input.supplierId }, select: { id: true } });
    if (!sup) throw new BusinessError("NOT_FOUND", "Fournisseur introuvable.");
    const created = await tx.supplierContact.create({ data: { ...input, createdById: actor.id } });
    if (created.isPrimary) await clearOtherPrimary(tx, sup.id, created.id);
    await log(tx, { userId: actor.id, action: "SUPPLIER_CONTACT_CREATE", entity: "SupplierContact", entityId: created.id, after: created, ip });
    return created;
  });
}

export async function updateContact(actor: Actor, raw: z.input<typeof updateContactSchema>, ip?: string | null) {
  const { id, expectedUpdatedAt, ...data } = updateContactSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const before = await tx.supplierContact.findUnique({ where: { id } });
    if (!before) throw new BusinessError("NOT_FOUND", "Contact introuvable.");
    assertFresh(before.updatedAt, expectedUpdatedAt);
    const after = await tx.supplierContact.update({ where: { id }, data });
    if (after.isPrimary) await clearOtherPrimary(tx, after.supplierId, after.id);
    await log(tx, { userId: actor.id, action: "SUPPLIER_CONTACT_UPDATE", entity: "SupplierContact", entityId: id, before, after, ip });
    return after;
  });
}

export async function setContactActive(
  actor: Actor,
  raw: { id: string; active: boolean; expectedUpdatedAt: Date | string },
  ip?: string | null,
) {
  const input = z.object({ id: idSchema, active: z.boolean(), expectedUpdatedAt: expectedUpdatedAtSchema }).parse(raw);
  return db.$transaction(async (tx) => {
    const before = await tx.supplierContact.findUnique({ where: { id: input.id } });
    if (!before) throw new BusinessError("NOT_FOUND", "Contact introuvable.");
    assertFresh(before.updatedAt, input.expectedUpdatedAt);
    const after = await tx.supplierContact.update({
      where: { id: before.id },
      data: { active: input.active, ...(input.active ? {} : { isPrimary: false }) },
    });
    await log(tx, {
      userId: actor.id,
      action: "SUPPLIER_CONTACT_ACTIVE",
      entity: "SupplierContact",
      entityId: before.id,
      before: { active: before.active },
      after: { active: after.active },
      ip,
    });
    return after;
  });
}

/** R18 : mêmes filtres que la liste, plafond 10 000 lignes. */
export async function exportSuppliers(raw: ListSuppliersInput = {}) {
  const f = listSuppliersSchema.parse(raw);
  const where = buildSupplierWhere(f);
  const total = await db.supplier.count({ where });
  if (total > EXPORT_MAX_ROWS) {
    throw new BusinessError("EXPORT_TOO_LARGE", `Trop de lignes (${total}) : affinez les filtres (maximum ${EXPORT_MAX_ROWS}).`);
  }
  return db.supplier.findMany({
    where,
    orderBy: buildSupplierOrder(f),
    include: { contacts: { where: { active: true, isPrimary: true }, take: 1 } },
  });
}
