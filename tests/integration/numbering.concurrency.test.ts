import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { nextNumber as nextNumberTx, type CounterKey } from "@/modules/numbering";

/** Variante de test : ouvre sa propre transaction. */
const nextNumber = (key: CounterKey, year: number, tx?: Parameters<typeof nextNumberTx>[2]) =>
  tx ? nextNumberTx(key, year, tx) : db.$transaction((t) => nextNumberTx(key, year, t));

beforeEach(async () => {
  await db.counter.deleteMany();
});
afterAll(async () => {
  await db.$disconnect();
});

describe("nextNumber (base de test)", () => {
  it("20 appels parallèles -> 20 numéros uniques consécutifs", async () => {
    const values = await Promise.all(Array.from({ length: 20 }, () => nextNumber("DA", 2026)));
    expect(new Set(values).size).toBe(20);
    expect([...values].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it("années et clés indépendantes", async () => {
    expect(await nextNumber("DA", 2026)).toBe(1);
    expect(await nextNumber("DA", 2026)).toBe(2);
    expect(await nextNumber("DA", 2027)).toBe(1);
    expect(await nextNumber("BC", 2026)).toBe(1);
  });

  it("transaction annulée -> numéro non consommé", async () => {
    await expect(
      db.$transaction(async (tx) => {
        await nextNumber("DA", 2026, tx);
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await nextNumber("DA", 2026)).toBe(1);
  });

  it("rejette une clé inconnue", async () => {
    // @ts-expect-error clé volontairement invalide
    await expect(nextNumber("ZZZ", 2026)).rejects.toThrow();
  });

  it("rejette une année invalide", async () => {
    await expect(nextNumber("DA", 1999)).rejects.toThrow();
    await expect(nextNumber("DA", 10000)).rejects.toThrow();
    await expect(nextNumber("DA", 2026.5)).rejects.toThrow();
  });
});
