import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { counterKeySchema, type CounterKey } from "./keys";
import { nextNumberWith } from "./next";

export { formatDocumentNumber } from "./format";
export { COUNTER_KEYS, type CounterKey } from "./keys";

/**
 * Prochain numéro d'ordre pour (key, year). À appeler avec le `tx` de la
 * transaction qui crée la pièce : rollback => numéro non consommé.
 */
export async function nextNumber(
  key: CounterKey,
  year: number,
  tx?: Prisma.TransactionClient,
): Promise<number> {
  counterKeySchema.parse(key);
  if (tx) return nextNumberWith(tx, key, year);
  return db.$transaction((t) => nextNumberWith(t, key, year));
}
