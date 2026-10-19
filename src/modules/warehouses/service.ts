import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/errors";
import { log } from "@/modules/audit";
import type { Actor } from "@/modules/referentials/actor";
import { lockFresh } from "@/modules/referentials/concurrency";
import { codeExists, rethrowUnique } from "@/modules/referentials/db-errors";
import { expectedUpdatedAtSchema, idSchema } from "@/modules/referentials/schemas";
import { requiredCodeSchema } from "@/modules/referentials/codes";

const nameSchema = z.string().trim().min(2, "Le nom du dépôt est obligatoire.").max(80, "Nom trop long.");

/** Adresse de livraison des bons de commande ; vide = aucune. */
const addressSchema = z
  .string()
  .trim()
  .max(300, "Adresse trop longue (300 caractères maximum).")
  .nullish()
  .transform((v) => (v ? v : null));

export const createWarehouseSchema = z.object({ code: requiredCodeSchema, name: nameSchema, address: addressSchema });
export const updateWarehouseSchema = z.object({
  id: idSchema,
  expectedUpdatedAt: expectedUpdatedAtSchema,
  name: nameSchema,
  /** `undefined` : adresse inchangée ; chaîne vide : adresse effacée. */
  address: z
    .string()
    .trim()
    .max(300, "Adresse trop longue (300 caractères maximum).")
    .nullish()
    .transform((v) => (v === undefined ? undefined : v ? v : null)),
});
export const setWarehouseActiveSchema = z.object({
  id: idSchema,
  active: z.boolean(),
  expectedUpdatedAt: expectedUpdatedAtSchema,
});

export type CreateWarehouseInput = z.input<typeof createWarehouseSchema>;
export type UpdateWarehouseInput = z.input<typeof updateWarehouseSchema>;
export type SetWarehouseActiveInput = z.input<typeof setWarehouseActiveSchema>;

export async function listWarehouses(opts: { activeOnly?: boolean } = {}) {
  return db.warehouse.findMany({
    where: opts.activeOnly ? { active: true } : undefined,
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: { id: true, code: true, name: true, address: true, active: true, updatedAt: true },
  });
}

export async function createWarehouse(actor: Actor, raw: CreateWarehouseInput, ip?: string | null) {
  const input = createWarehouseSchema.parse(raw);
  try {
    return await db.$transaction(async (tx) => {
      const created = await tx.warehouse.create({ data: { ...input, createdById: actor.id } });
      await log(tx, { userId: actor.id, ip, action: "WAREHOUSE_CREATE", entity: "Warehouse", entityId: created.id, after: created });
      return created;
    });
  } catch (e) {
    return rethrowUnique(e, { code: codeExists() });
  }
}

export async function updateWarehouse(actor: Actor, raw: UpdateWarehouseInput, ip?: string | null) {
  const input = updateWarehouseSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const before = await tx.warehouse.findUnique({ where: { id: input.id } });
    if (!before) throw new BusinessError("NOT_FOUND", "Dépôt introuvable.");
    await lockFresh(tx, "warehouses", before.id, input.expectedUpdatedAt);
    const after = await tx.warehouse.update({ where: { id: before.id }, data: { name: input.name, ...(input.address !== undefined ? { address: input.address } : {}) } });
    await log(tx, { userId: actor.id, ip, action: "WAREHOUSE_UPDATE", entity: "Warehouse", entityId: after.id, before, after });
    return after;
  });
}

/** R13 : un dépôt par défaut d'un article actif ne se désactive pas (LOT-07 ajoutera « stock non nul »). */
export async function setWarehouseActive(actor: Actor, raw: SetWarehouseActiveInput, ip?: string | null) {
  const input = setWarehouseActiveSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const before = await tx.warehouse.findUnique({ where: { id: input.id } });
    if (!before) throw new BusinessError("NOT_FOUND", "Dépôt introuvable.");
    await lockFresh(tx, "warehouses", before.id, input.expectedUpdatedAt);
    if (before.active === input.active) return before;
    if (!input.active) {
      const n = await tx.item.count({ where: { defaultWarehouseId: before.id, status: "ACTIF" } });
      if (n > 0) {
        throw new BusinessError(
          "WAREHOUSE_IN_USE",
          `Impossible de désactiver ce dépôt : il est le dépôt par défaut de ${n} article(s) actif(s).`,
        );
      }
    }
    const after = await tx.warehouse.update({ where: { id: before.id }, data: { active: input.active } });
    await log(tx, {
      userId: actor.id, ip,
      action: "WAREHOUSE_ACTIVE",
      entity: "Warehouse",
      entityId: after.id,
      before: { active: before.active },
      after: { active: after.active },
    });
    return after;
  });
}
