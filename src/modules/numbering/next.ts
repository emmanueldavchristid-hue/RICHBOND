import type { Prisma } from "@/generated/prisma/client";

/** Incrément atomique (INSERT ... ON CONFLICT) sur le client/transaction fourni. */
export async function nextNumberWith(
  client: Pick<Prisma.TransactionClient, "$queryRaw">,
  key: string,
  year: number,
): Promise<number> {
  const rows = await client.$queryRaw<{ value: number }[]>`
    INSERT INTO counters (key, year, value, updated_at)
    VALUES (${key}, ${year}, 1, now())
    ON CONFLICT (key, year)
    DO UPDATE SET value = counters.value + 1, updated_at = now()
    RETURNING value`;
  return rows[0].value;
}
