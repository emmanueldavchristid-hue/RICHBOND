import type { Prisma } from "@/generated/prisma/client";
import { counterKeySchema, yearSchema, type CounterKey } from "./keys";
import { nextNumberWith } from "./next";

export { formatDocumentNumber } from "./format";
export { COUNTER_KEYS, type CounterKey } from "./keys";

/**
 * Prochain numéro d'ordre pour (key, year). Le `tx` de la transaction qui crée
 * la pièce est obligatoire : rollback => numéro non consommé.
 */
export async function nextNumber(
  key: CounterKey,
  year: number,
  tx: Prisma.TransactionClient,
): Promise<number> {
  counterKeySchema.parse(key);
  yearSchema.parse(year);
  return nextNumberWith(tx, key, year);
}
