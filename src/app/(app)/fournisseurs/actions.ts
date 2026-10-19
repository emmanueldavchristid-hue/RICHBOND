"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getNow } from "@/lib/clock";
import { getClientIp } from "@/modules/auth/ip";
import { withAction } from "@/modules/auth/session";
import { expectedUpdatedAtSchema, idSchema } from "@/modules/referentials";
import { serialize } from "@/modules/referentials/serialize";
import { viewerCanSeePrices } from "@/modules/settings";
import {
  addContact,
  addContactSchema,
  blockSupplier,
  blockSupplierSchema,
  changeSupplierCode,
  createSupplier,
  createSupplierSchema,
  getSupplier,
  listSupplierOptions,
  listSuppliers,
  listSuppliersSchema,
  setContactActive,
  setSupplierStatus,
  supplierEditableStatusSchema,
  supplierIdSchema,
  unblockSupplier,
  unblockSupplierSchema,
  updateContact,
  updateContactSchema,
  updateSupplier,
  updateSupplierSchema,
} from "@/modules/suppliers";

const READ = { writable: false } as const;
const touch = (id?: string) => {
  revalidatePath("/fournisseurs");
  if (id) revalidatePath(`/fournisseurs/${id}`);
};

// ---------------------------------------------------------------- lectures (supplier.view)

export const listSuppliersAction = withAction("supplier.view", listSuppliersSchema, ({ input }) => listSuppliers(input), READ);

export const getSupplierAction = withAction(
  "supplier.view",
  supplierIdSchema,
  async ({ user, input }) => getSupplier(input.id, { showPrices: await viewerCanSeePrices(user) }).then(serialize),
  READ,
);

/** Fournisseurs non bloqués pour les listes déroulantes. */
export const listSupplierOptionsAction = withAction("supplier.view", z.object({}).optional(), () => listSupplierOptions(), READ);

// ---------------------------------------------------------------- écritures (supplier.manage)

export const createSupplierAction = withAction("supplier.manage", createSupplierSchema, async ({ user, input }) => {
  const r = await createSupplier(user, input, await getClientIp());
  touch(r.supplier.id);
  return serialize(r);
});

export const updateSupplierAction = withAction("supplier.manage", updateSupplierSchema, async ({ user, input }) => {
  const r = await updateSupplier(user, input, await getClientIp());
  touch(r.supplier.id);
  return serialize(r);
});

export const setSupplierStatusAction = withAction(
  "supplier.manage",
  z.object({ id: idSchema, status: supplierEditableStatusSchema, expectedUpdatedAt: expectedUpdatedAtSchema }),
  async ({ user, input }) => {
    const r = await setSupplierStatus(user, input, await getClientIp());
    touch(r.id);
    return serialize(r);
  },
);

/** Bloquer : acheteurs et Responsable. Retourne `affectedItems` (articles dont il est le principal). */
export const blockSupplierAction = withAction("supplier.manage", blockSupplierSchema, async ({ user, input }) => {
  const r = await blockSupplier(user, input, await getClientIp(), (await getNow()).now);
  touch(input.id);
  return serialize(r);
});

/** Débloquer : Responsable seul (`supplier.evaluate`). */
export const unblockSupplierAction = withAction("supplier.evaluate", unblockSupplierSchema, async ({ user, input }) => {
  const r = await unblockSupplier(user, input, await getClientIp());
  touch(input.id);
  return serialize(r);
});

/** R2 : changement de code réservé au Responsable. */
export const changeSupplierCodeAction = withAction(
  "settings.manage",
  z.object({ id: idSchema, code: z.string(), expectedUpdatedAt: expectedUpdatedAtSchema }),
  async ({ user, input }) => {
    const r = await changeSupplierCode(user, input, await getClientIp());
    touch(r.id);
    return serialize(r);
  },
);

export const addContactAction = withAction("supplier.manage", addContactSchema, async ({ user, input }) => {
  const r = await addContact(user, input, await getClientIp());
  touch(input.supplierId);
  return serialize(r);
});

export const updateContactAction = withAction("supplier.manage", updateContactSchema, async ({ user, input }) => {
  const r = await updateContact(user, input, await getClientIp());
  touch(r.supplierId);
  return serialize(r);
});

export const setContactActiveAction = withAction(
  "supplier.manage",
  z.object({ id: idSchema, active: z.boolean(), expectedUpdatedAt: expectedUpdatedAtSchema }),
  async ({ user, input }) => {
    const r = await setContactActive(user, input, await getClientIp());
    touch(r.supplierId);
    return serialize(r);
  },
);
