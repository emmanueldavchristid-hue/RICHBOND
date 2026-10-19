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

const nameSchema = z.string().trim().min(2, "Le nom du service est obligatoire.").max(80, "Nom trop long.");

export const createDepartmentSchema = z.object({ code: requiredCodeSchema, name: nameSchema });
export const updateDepartmentSchema = z.object({
  id: idSchema,
  expectedUpdatedAt: expectedUpdatedAtSchema,
  name: nameSchema,
});
export const setDepartmentActiveSchema = z.object({
  id: idSchema,
  active: z.boolean(),
  expectedUpdatedAt: expectedUpdatedAtSchema,
});

export type CreateDepartmentInput = z.input<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.input<typeof updateDepartmentSchema>;
export type SetDepartmentActiveInput = z.input<typeof setDepartmentActiveSchema>;

export async function listDepartments(opts: { activeOnly?: boolean } = {}) {
  return db.department.findMany({
    where: opts.activeOnly ? { active: true } : undefined,
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: { id: true, code: true, name: true, active: true, updatedAt: true },
  });
}

export async function createDepartment(actor: Actor, raw: CreateDepartmentInput, ip?: string | null) {
  const input = createDepartmentSchema.parse(raw);
  try {
    return await db.$transaction(async (tx) => {
      const created = await tx.department.create({ data: { ...input, createdById: actor.id } });
      await log(tx, { userId: actor.id, ip, action: "DEPARTMENT_CREATE", entity: "Department", entityId: created.id, after: created });
      return created;
    });
  } catch (e) {
    return rethrowUnique(e, { code: codeExists() });
  }
}

export async function updateDepartment(actor: Actor, raw: UpdateDepartmentInput, ip?: string | null) {
  const input = updateDepartmentSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const before = await tx.department.findUnique({ where: { id: input.id } });
    if (!before) throw new BusinessError("NOT_FOUND", "Service introuvable.");
    await lockFresh(tx, "departments", before.id, input.expectedUpdatedAt);
    const after = await tx.department.update({ where: { id: before.id }, data: { name: input.name } });
    await log(tx, { userId: actor.id, ip, action: "DEPARTMENT_UPDATE", entity: "Department", entityId: after.id, before, after });
    return after;
  });
}

/** Désactivation simple (les DA du LOT-04 gardent leur service ; jamais de suppression). */
export async function setDepartmentActive(actor: Actor, raw: SetDepartmentActiveInput, ip?: string | null) {
  const input = setDepartmentActiveSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const before = await tx.department.findUnique({ where: { id: input.id } });
    if (!before) throw new BusinessError("NOT_FOUND", "Service introuvable.");
    await lockFresh(tx, "departments", before.id, input.expectedUpdatedAt);
    if (before.active === input.active) return before;
    const after = await tx.department.update({ where: { id: before.id }, data: { active: input.active } });
    await log(tx, {
      userId: actor.id, ip,
      action: "DEPARTMENT_ACTIVE",
      entity: "Department",
      entityId: after.id,
      before: { active: before.active },
      after: { active: after.active },
    });
    return after;
  });
}
