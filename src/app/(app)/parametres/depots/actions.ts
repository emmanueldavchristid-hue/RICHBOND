"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getClientIp } from "@/modules/auth/ip";
import { withAction } from "@/modules/auth/session";
import { serialize } from "@/modules/referentials/serialize";
import {
  createWarehouse,
  createWarehouseSchema,
  listWarehouses,
  setWarehouseActive,
  setWarehouseActiveSchema,
  updateWarehouse,
  updateWarehouseSchema,
} from "@/modules/warehouses";

const READ = { writable: false } as const;
const touch = () => revalidatePath("/parametres/depots");

/** Lecture : tout utilisateur connecté (listes déroulantes). */
export const listWarehousesAction = withAction(
  null,
  z.object({ activeOnly: z.boolean().optional() }),
  ({ input }) => listWarehouses(input),
  READ,
);

export const createWarehouseAction = withAction("settings.manage", createWarehouseSchema, async ({ user, input }) => {
  const r = await createWarehouse(user, input, await getClientIp());
  touch();
  return serialize(r);
});

export const updateWarehouseAction = withAction("settings.manage", updateWarehouseSchema, async ({ user, input }) => {
  const r = await updateWarehouse(user, input, await getClientIp());
  touch();
  return serialize(r);
});

export const setWarehouseActiveAction = withAction("settings.manage", setWarehouseActiveSchema, async ({ user, input }) => {
  const r = await setWarehouseActive(user, input, await getClientIp());
  touch();
  return serialize(r);
});
