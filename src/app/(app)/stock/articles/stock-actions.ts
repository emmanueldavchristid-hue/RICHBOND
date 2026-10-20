"use server";

import { getNow } from "@/lib/clock";
import { withAction } from "@/modules/auth/session";
import { itemLedger, itemLedgerSchema, listStock, listStockSchema } from "@/modules/stock";

/** Lectures du stock par article (LOT-07), autorisées en lecture seule. */
const READ = { writable: false } as const;

export const listStockAction = withAction("stock.view", listStockSchema, async ({ user, input }) => listStock(user, input, (await getNow()).now), READ);
export const itemLedgerStockAction = withAction("stock.view", itemLedgerSchema, ({ user, input }) => itemLedger(user, input), READ);
