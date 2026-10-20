import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { applyMovement, applyMovements, getStockLevel } from "@/modules/stock";
import { cleanTestUsers, createTestUser } from "../helpers/db";
import { IT_PREFIX, cleanReferentials } from "../helpers/referentials";
import { cleanStock } from "../helpers/stock";

let userId: string;
let itemId: string;
let item2Id: string;
let whA: string;
let whB: string;
const day = new Date("2026-10-01T00:00:00Z");

const base = (over: Record<string, unknown> = {}) => ({
  itemId,
  warehouseId: whA,
  type: "ENTREE_RECEPTION" as const,
  quantity: 100,
  unitCost: 1000,
  documentType: "RECEPTION" as const,
  documentRef: "REC-TEST-00001",
  occurredAt: day,
  createdById: userId,
  ...over,
});

const inTx = <T,>(fn: (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<T>) => db.$transaction(fn);

async function reset() {
  await cleanStock();
}

beforeAll(async () => {
  await cleanStock();
  await cleanReferentials();
  await cleanTestUsers();
  userId = (await createTestUser("stk", { role: "MAGASINIER" })).id;
  const mk = (code: string) =>
    db.item.create({
      data: { code: `${IT_PREFIX}${code}`, name: code, category: "PDR", stockUnit: "U", purchaseUnit: "U", createdById: userId },
    });
  itemId = (await mk("STK1")).id;
  item2Id = (await mk("STK2")).id;
  whA = (await db.warehouse.create({ data: { code: `${IT_PREFIX}A`, name: "Principal" } })).id;
  whB = (await db.warehouse.create({ data: { code: `${IT_PREFIX}B`, name: "Annexe" } })).id;
});

afterAll(async () => {
  await cleanStock();
  await cleanReferentials();
  await cleanTestUsers();
});

describe("applyMovement", () => {
  it("entrée puis sortie : niveau, PMP et historique mémorisés", async () => {
    await reset();
    await inTx((tx) => applyMovement(tx, base()));
    const e2 = await inTx((tx) => applyMovement(tx, base({ quantity: 50, unitCost: 1300 })));
    expect(e2.pmpBefore.toString()).toBe("1000");
    expect(e2.pmpAfter.toString()).toBe("1100");
    expect(e2.stockAfter.toString()).toBe("150");
    const out = await inTx((tx) =>
      applyMovement(tx, base({ type: "SORTIE", quantity: -40, unitCost: undefined, documentType: "SORTIE", documentRef: "SOR-TEST-1" })),
    );
    expect(out.value).toBe(-44000);
    const lvl = await getStockLevel(db, itemId, whA);
    expect(lvl.quantity.toString()).toBe("110");
    expect(lvl.pmp.toString()).toBe("1100");
  });

  it("sortie au-delà du stock : refusée, aucun mouvement écrit", async () => {
    await reset();
    await inTx((tx) => applyMovement(tx, base({ quantity: 4 })));
    await expect(
      inTx((tx) => applyMovement(tx, base({ type: "SORTIE", quantity: -5, unitCost: undefined }))),
    ).rejects.toMatchObject({ code: "STOCK_INSUFFICIENT", messageFr: "Stock insuffisant : 4 U disponibles au dépôt Principal." });
    expect(await db.stockMovement.count()).toBe(1);
    expect((await getStockLevel(db, itemId, whA)).quantity.toString()).toBe("4");
  });

  it("document multi-lignes tout ou rien", async () => {
    await reset();
    await inTx((tx) => applyMovement(tx, base({ quantity: 10 })));
    await expect(
      inTx((tx) =>
        applyMovements(tx, [
          base({ type: "SORTIE", quantity: -5, unitCost: undefined }),
          base({ type: "SORTIE", itemId: item2Id, quantity: -1, unitCost: undefined }),
        ]),
      ),
    ).rejects.toMatchObject({ code: "STOCK_INSUFFICIENT" });
    expect((await getStockLevel(db, itemId, whA)).quantity.toString()).toBe("10");
    expect(await db.stockMovement.count()).toBe(1);
  });

  it("deux sorties parallèles sur le dernier stock : une seule réussit", async () => {
    await reset();
    await inTx((tx) => applyMovement(tx, base({ quantity: 5 })));
    const out = () => inTx((tx) => applyMovement(tx, base({ type: "SORTIE", quantity: -5, unitCost: undefined })));
    const results = await Promise.allSettled([out(), out()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect((await getStockLevel(db, itemId, whA)).quantity.toString()).toBe("0");
  });

  it("contre-passation d'une entrée : stock et PMP restaurés, une seule fois", async () => {
    await reset();
    await inTx((tx) => applyMovement(tx, base()));
    const e2 = await inTx((tx) => applyMovement(tx, base({ quantity: 50, unitCost: 1300 })));
    const rev = await inTx((tx) =>
      applyMovement(tx, { ...base(), reversalOfId: e2.id, quantity: 0, unitCost: undefined, comment: "Erreur de saisie" }),
    );
    expect(rev.quantity.toString()).toBe("-50");
    expect(rev.value).toBe(-65000);
    const lvl = await getStockLevel(db, itemId, whA);
    expect(lvl.quantity.toString()).toBe("100");
    expect(lvl.pmp.toString()).toBe("1000");
    await expect(inTx((tx) => applyMovement(tx, { ...base(), reversalOfId: e2.id, quantity: 0 }))).rejects.toMatchObject({
      code: "DEJA_CONTREPASSE",
    });
  });

  it("contre-passation d'une entrée refusée si le stock a été sorti", async () => {
    await reset();
    const e = await inTx((tx) => applyMovement(tx, base({ quantity: 12 })));
    await inTx((tx) => applyMovement(tx, base({ type: "SORTIE", quantity: -10, unitCost: undefined })));
    await expect(inTx((tx) => applyMovement(tx, { ...base(), reversalOfId: e.id, quantity: 0 }))).rejects.toMatchObject({
      code: "STOCK_INSUFFICIENT",
    });
    expect((await getStockLevel(db, itemId, whA)).quantity.toString()).toBe("2");
  });

  it("transfert : sortie au PMP source, entrée au même coût, PMP destination pondéré", async () => {
    await reset();
    await inTx((tx) => applyMovement(tx, base({ quantity: 100, unitCost: 1100 })));
    await inTx((tx) => applyMovement(tx, base({ warehouseId: whB, quantity: 20, unitCost: 1500 })));
    const [out, inn] = await inTx((tx) =>
      applyMovements(tx, [
        base({ type: "TRANSFERT", quantity: -30, unitCost: undefined, documentType: "TRANSFERT", documentRef: "TRF-T-1" }),
        base({ type: "TRANSFERT", warehouseId: whB, quantity: 30, unitCost: 1100, documentType: "TRANSFERT", documentRef: "TRF-T-1" }),
      ]),
    );
    expect(out.value).toBe(-33000);
    expect(inn.value).toBe(33000);
    expect((await getStockLevel(db, itemId, whB)).pmp.toString()).toBe("1260");
    expect((await getStockLevel(db, itemId, whA)).quantity.toString()).toBe("70");
  });

  it("refuse entrée sans coût, signe incohérent et quantité nulle", async () => {
    await reset();
    await expect(inTx((tx) => applyMovement(tx, base({ unitCost: undefined })))).rejects.toMatchObject({ code: "COUT_INVALIDE" });
    await expect(inTx((tx) => applyMovement(tx, base({ quantity: -1 })))).rejects.toMatchObject({ code: "QUANTITE_INVALIDE" });
    await expect(inTx((tx) => applyMovement(tx, base({ type: "SORTIE", quantity: 1 })))).rejects.toMatchObject({
      code: "QUANTITE_INVALIDE",
    });
    await expect(inTx((tx) => applyMovement(tx, base({ quantity: 0 })))).rejects.toMatchObject({ code: "QUANTITE_INVALIDE" });
  });

  it("CHECK SQL : quantité négative impossible même en contournant le service", async () => {
    await reset();
    await db.stockLevel.create({ data: { itemId, warehouseId: whA, quantity: 1 } });
    await expect(db.stockLevel.update({ where: { itemId_warehouseId: { itemId, warehouseId: whA } }, data: { quantity: -1 } })).rejects.toThrow();
  });
});

describe("règle : le stock ne change que par applyMovement (test statique)", () => {
  it("aucun fichier de src/ hors movements.ts n'écrit StockLevel", () => {
    const root = path.resolve(__dirname, "../../src");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (p.includes(`${path.sep}generated${path.sep}`)) continue;
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name)) files.push(p);
      }
    };
    walk(root);
    const allowed = path.join(root, "modules", "stock", "movements.ts");
    const offenders = files.filter((f) => {
      if (f === allowed) return false;
      const src = readFileSync(f, "utf8");
      return /stockLevel\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/.test(src) || /(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+stock_levels/i.test(src);
    });
    expect(offenders).toEqual([]);
  });
});
