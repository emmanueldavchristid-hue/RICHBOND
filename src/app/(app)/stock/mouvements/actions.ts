"use server";

import { revalidatePath } from "next/cache";
import { getNow } from "@/lib/clock";
import { getClientIp } from "@/modules/auth/ip";
import { withAction } from "@/modules/auth/session";
import { adjust, adjustSchema, itemLedger, itemLedgerSchema, listMovements, listMovementsSchema, transfer, transferSchema } from "@/modules/stock";

/** Server actions des mouvements de stock (LOT-07). Le stock ne change que par `applyMovements` dans les services. */
const READ = { writable: false } as const;
const at = async () => (await getNow()).now;
const touch = () => {
  revalidatePath("/stock");
  revalidatePath("/stock/mouvements");
  revalidatePath("/stock/articles");
};

export const transferAction = withAction("stock.transfer", transferSchema, async ({ user, input }) => {
  const r = await transfer(user, input, await getClientIp(), await at());
  touch();
  return r;
});

/** Ajustement : Responsable seulement, motif obligatoire. */
export const adjustAction = withAction("stock.adjust", adjustSchema, async ({ user, input }) => {
  const r = await adjust(user, input, await getClientIp(), await at());
  touch();
  return r;
});

export const listMovementsAction = withAction("stock.view", listMovementsSchema, ({ user, input }) => listMovements(user, input), READ);
export const itemLedgerAction = withAction("stock.view", itemLedgerSchema, ({ user, input }) => itemLedger(user, input), READ);
