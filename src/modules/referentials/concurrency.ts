import type { Prisma } from "@/generated/prisma/client";
import { BusinessError } from "@/lib/errors";

export const CONFLICT_MESSAGE = "Cette fiche a été modifiée par un autre utilisateur. Rechargez la page.";

/** R16 : comparaison pure de la version (`updatedAt`). */
export function assertFresh(current: Date, expected: Date): void {
  if (current.getTime() !== expected.getTime()) throw new BusinessError("CONFLICT", CONFLICT_MESSAGE);
}

/** Tables portant un `updatedAt` verrouillable (liste fermée : le nom est injecté dans le SQL). */
export const LOCKABLE_TABLES = [
  "items",
  "suppliers",
  "supplier_contacts",
  "item_suppliers",
  "warehouses",
  "departments",
  "exchange_rates",
  "purchase_requests",
] as const;
export type LockableTable = (typeof LOCKABLE_TABLES)[number];

/**
 * R16 : verrou optimiste fiable en concurrence. `SELECT ... FOR UPDATE` verrouille la ligne jusqu'à la fin de la
 * transaction puis compare `updated_at` à la version lue par l'utilisateur : deux écritures simultanées ne peuvent
 * plus passer toutes les deux (la seconde attend, relit la version validée par la première et reçoit CONFLICT).
 * Ligne absente : sans effet (l'appelant gère NOT_FOUND).
 */
export async function lockFresh(
  tx: Prisma.TransactionClient,
  table: LockableTable,
  id: string,
  expected: Date,
): Promise<void> {
  if (!LOCKABLE_TABLES.includes(table)) throw new Error(`Table non verrouillable : ${table}`);
  const rows = await tx.$queryRawUnsafe<{ updated_at: Date }[]>(
    `SELECT updated_at FROM "${table}" WHERE id = $1 FOR UPDATE`,
    id,
  );
  if (rows.length === 0) return;
  assertFresh(rows[0].updated_at, expected);
}
