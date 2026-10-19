"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getClientIp } from "@/modules/auth/ip";
import { withAction } from "@/modules/auth/session";
import { serialize } from "@/modules/referentials/serialize";
import {
  createDepartment,
  createDepartmentSchema,
  listDepartments,
  setDepartmentActive,
  setDepartmentActiveSchema,
  updateDepartment,
  updateDepartmentSchema,
} from "@/modules/departments";

const READ = { writable: false } as const;
const touch = () => revalidatePath("/parametres/services");

/** Lecture : tout utilisateur connecté (listes déroulantes). */
export const listDepartmentsAction = withAction(
  null,
  z.object({ activeOnly: z.boolean().optional() }),
  ({ input }) => listDepartments(input),
  READ,
);

export const createDepartmentAction = withAction("settings.manage", createDepartmentSchema, async ({ user, input }) => {
  const r = await createDepartment(user, input, await getClientIp());
  touch();
  return serialize(r);
});

export const updateDepartmentAction = withAction("settings.manage", updateDepartmentSchema, async ({ user, input }) => {
  const r = await updateDepartment(user, input, await getClientIp());
  touch();
  return serialize(r);
});

export const setDepartmentActiveAction = withAction("settings.manage", setDepartmentActiveSchema, async ({ user, input }) => {
  const r = await setDepartmentActive(user, input, await getClientIp());
  touch();
  return serialize(r);
});
