import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/errors";
import { cleanTestUsers, createTestUser } from "../helpers/db";
import { cleanReferentials, ensureCurrencies } from "../helpers/referentials";

const session: { current: { user: { id: string; sessionVersion: number } } | null } = { current: null };
vi.mock("@/lib/auth", () => ({ auth: async () => session.current }));

const { createItem, updateItem, linkSupplier, updateItemSupplier, setItemPhoto, removeItemPhoto } =
  await import("@/modules/items");
const { createSupplier, addContact, updateContact } = await import("@/modules/suppliers");
const { createWarehouse, updateWarehouse } = await import("@/modules/warehouses");
const { createDepartment, updateDepartment } = await import("@/modules/departments");
const { addExchangeRate, updateExchangeRate, upsertCurrency } = await import("@/modules/currencies");
const { listEntityAudit } = await import("@/modules/audit/list");
const { GET: getPhoto } = await import("@/app/api/items/[id]/photo/route");

let actor: { id: string; role: "ACHETEUR" };

async function rejectsWith(p: Promise<unknown>, code: string, message?: RegExp) {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  );
  expect(e, `attendu ${code}`).toBeInstanceOf(BusinessError);
  expect((e as BusinessError).code).toBe(code);
  if (message) expect((e as BusinessError).messageFr).toMatch(message);
}

const itemBase = {
  name: "Article revue",
  category: "PDR",
  stockUnit: "U",
  purchaseUnit: "CARTON",
  conversionFactor: 10,
};
const mkItem = (code: string, extra: Record<string, unknown> = {}) =>
  createItem(actor, { ...itemBase, code, ...extra } as never);
const mkSupplier = (code: string, extra: Record<string, unknown> = {}) =>
  createSupplier(actor, {
    name: "Fournisseur revue",
    type: "LOCAL",
    currencyCode: "XOF",
    code,
    ...extra,
  } as never).then((r) => r.supplier);

const PHOTO_DIR = path.resolve(process.cwd(), "storage", "items");
const png = (extra = 16) =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(extra).fill(7)]);
const jpg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

async function photoFiles(itemId: string) {
  try {
    return (await readdir(PHOTO_DIR)).filter((f) => f.startsWith(itemId));
  } catch {
    return [];
  }
}
async function cleanPhotos() {
  const items = await db.item.findMany({ where: { code: { startsWith: "IT-" } }, select: { id: true } });
  for (const i of items)
    for (const f of await photoFiles(i.id)) await rm(path.join(PHOTO_DIR, f), { force: true });
}

beforeEach(async () => {
  await cleanPhotos();
  await cleanReferentials();
  await cleanTestUsers();
  await ensureCurrencies();
  session.current = null;
  const u = await createTestUser("rev-buyer", { role: "ACHETEUR", purchaseScope: "ALL" });
  actor = { id: u.id, role: "ACHETEUR" };
});
afterAll(async () => {
  await cleanPhotos();
  await cleanReferentials();
  await cleanTestUsers();
  await db.$disconnect();
});

/** Lance n écritures simultanées avec la même version : une seule doit passer, les autres reçoivent CONFLICT. */
async function expectSingleWinner(run: (i: number) => Promise<unknown>, n = 6) {
  const results = await Promise.allSettled(Array.from({ length: n }, (_, i) => run(i)));
  const ok = results.filter((r) => r.status === "fulfilled");
  const ko = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  expect(ok).toHaveLength(1);
  expect(ko).toHaveLength(n - 1);
  for (const r of ko) {
    expect(r.reason).toBeInstanceOf(BusinessError);
    expect(r.reason.code).toBe("CONFLICT");
  }
}

describe("concurrence : une seule écriture gagne avec la même version (R16)", () => {
  it("article", async () => {
    const it = await mkItem("IT-CC-ITEM");
    await expectSingleWinner((i) =>
      updateItem(actor, {
        ...itemBase,
        id: it.id,
        name: `Version ${i}`,
        expectedUpdatedAt: it.updatedAt,
      } as never),
    );
    expect(await db.auditLog.count({ where: { entityId: it.id, action: "ITEM_UPDATE" } })).toBe(1);
  });

  it("lien article-fournisseur", async () => {
    const it = await mkItem("IT-CC-LK");
    const s = await mkSupplier("IT-CC-LKS");
    const link = await linkSupplier(actor, {
      itemId: it.id,
      supplierId: s.id,
      lastPrice: 100,
      currencyCode: "XOF",
    });
    await expectSingleWinner((i) =>
      updateItemSupplier(actor, {
        id: link.id,
        expectedUpdatedAt: link.updatedAt,
        lastPrice: 200 + i,
        currencyCode: "XOF",
      }),
    );
    expect(await db.itemPriceHistory.count({ where: { itemId: it.id } })).toBe(2);
  });

  it("contact fournisseur", async () => {
    const s = await mkSupplier("IT-CC-CT");
    const c = await addContact(actor, { supplierId: s.id, name: "Contact initial" });
    await expectSingleWinner((i) =>
      updateContact(actor, { id: c.id, expectedUpdatedAt: c.updatedAt, name: `Contact ${i}` }),
    );
  });

  it("dépôt et service", async () => {
    const w = await createWarehouse(actor, { code: "IT-CC-W", name: "Dépôt initial" });
    await expectSingleWinner((i) =>
      updateWarehouse(actor, { id: w.id, expectedUpdatedAt: w.updatedAt, name: `Dépôt ${i}` }),
    );
    const d = await createDepartment(actor, { code: "IT-CC-D", name: "Service initial" });
    await expectSingleWinner((i) =>
      updateDepartment(actor, { id: d.id, expectedUpdatedAt: d.updatedAt, name: `Service ${i}` }),
    );
  });

  it("taux de change", async () => {
    await upsertCurrency(actor, { code: "ZZC", name: "Devise concurrence", symbol: "Z", decimals: 2 });
    const r = await addExchangeRate(actor, {
      currencyCode: "ZZC",
      date: new Date().toISOString().slice(0, 10),
      rate: "600",
      note: "IT-cc",
    });
    await expectSingleWinner((i) =>
      updateExchangeRate(actor, {
        id: r.id,
        expectedUpdatedAt: r.updatedAt,
        rate: String(600 + i),
        note: "IT-cc",
      }),
    );
  });
});

describe("photo article (R19)", () => {
  it("photo PNG acceptée : fichier écrit, chemin enregistré, audit, aucun fichier temporaire", async () => {
    const it = await mkItem("IT-PH-OK");
    const r = await setItemPhoto(actor, { id: it.id, expectedUpdatedAt: it.updatedAt, bytes: png() });
    expect(r.photoPath).toMatch(new RegExp(`^${it.id}-[a-f0-9]{12}\\.png$`));
    expect((await db.item.findUniqueOrThrow({ where: { id: it.id } })).photoPath).toBe(r.photoPath);
    expect(await db.auditLog.count({ where: { entityId: it.id, action: "ITEM_PHOTO" } })).toBe(1);
    const all = await readdir(PHOTO_DIR);
    expect(all.filter((f) => f.endsWith(".tmp"))).toHaveLength(0);
  });

  it("faux PNG (contenu non image) et fichier vide : refusés", async () => {
    const it = await mkItem("IT-PH-BAD");
    const fake = new TextEncoder().encode("<?php echo 'pas une image'; ?>");
    await rejectsWith(
      setItemPhoto(actor, { id: it.id, expectedUpdatedAt: it.updatedAt, bytes: fake }),
      "PHOTO_INVALID",
      /JPEG, PNG ou WebP/,
    );
    await rejectsWith(
      setItemPhoto(actor, { id: it.id, expectedUpdatedAt: it.updatedAt, bytes: new Uint8Array() }),
      "PHOTO_INVALID",
    );
    expect(await photoFiles(it.id)).toHaveLength(0);
  });

  it("plus de 2 Mo : refusée ; exactement 2 Mo : acceptée", async () => {
    const it = await mkItem("IT-PH-BIG");
    await rejectsWith(
      setItemPhoto(actor, { id: it.id, expectedUpdatedAt: it.updatedAt, bytes: png(2 * 1024 * 1024) }),
      "PHOTO_TOO_LARGE",
      /2 Mo/,
    );
    expect(await photoFiles(it.id)).toHaveLength(0);
    const exact = png(2 * 1024 * 1024 - 8);
    expect(exact.length).toBe(2 * 1024 * 1024);
    await setItemPhoto(actor, { id: it.id, expectedUpdatedAt: it.updatedAt, bytes: exact });
  });

  it("conflit de version : refusée, ancienne photo intacte, aucun fichier orphelin", async () => {
    const it = await mkItem("IT-PH-CF");
    const first = await setItemPhoto(actor, { id: it.id, expectedUpdatedAt: it.updatedAt, bytes: png() });
    await rejectsWith(
      setItemPhoto(actor, { id: it.id, expectedUpdatedAt: it.updatedAt, bytes: jpg() }),
      "CONFLICT",
    );
    expect((await db.item.findUniqueOrThrow({ where: { id: it.id } })).photoPath).toBe(first.photoPath);
    expect(await photoFiles(it.id)).toEqual([first.photoPath]);
  });

  it("remplacement : envois simultanés => un seul gagnant, un seul fichier (celui de la base)", async () => {
    const it = await mkItem("IT-PH-RP");
    const first = await setItemPhoto(actor, { id: it.id, expectedUpdatedAt: it.updatedAt, bytes: png() });
    const v1 = await db.item.findUniqueOrThrow({ where: { id: it.id } });
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        setItemPhoto(actor, { id: it.id, expectedUpdatedAt: v1.updatedAt, bytes: jpg() }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const final = await db.item.findUniqueOrThrow({ where: { id: it.id } });
    expect(final.photoPath).not.toBe(first.photoPath);
    expect(await photoFiles(it.id)).toEqual([final.photoPath]);
  });

  it("suppression de la photo : fichier retiré, ancienne version refusée", async () => {
    const it = await mkItem("IT-PH-RM");
    await setItemPhoto(actor, { id: it.id, expectedUpdatedAt: it.updatedAt, bytes: png() });
    const v = await db.item.findUniqueOrThrow({ where: { id: it.id } });
    await rejectsWith(removeItemPhoto(actor, { id: it.id, expectedUpdatedAt: it.updatedAt }), "CONFLICT");
    await removeItemPhoto(actor, { id: it.id, expectedUpdatedAt: v.updatedAt });
    expect(await photoFiles(it.id)).toHaveLength(0);
  });

  describe("GET /api/items/[id]/photo", () => {
    const call = (id: string) =>
      getPhoto(new Request(`http://localhost/api/items/${id}/photo`) as never, {
        params: Promise.resolve({ id }),
      });

    it("401 sans session, 403 si le mot de passe doit être changé, 404 sans photo, 200 avec la bonne image", async () => {
      const it = await mkItem("IT-PH-GET");
      expect((await call(it.id)).status).toBe(401);

      const locked = await createTestUser("rev-locked", {
        role: "ACHETEUR",
        purchaseScope: "ALL",
        mustChangePassword: true,
      });
      session.current = { user: { id: locked.id, sessionVersion: locked.sessionVersion } };
      expect((await call(it.id)).status).toBe(403);

      const mag = await createTestUser("rev-mag", { role: "MAGASINIER" });
      session.current = { user: { id: mag.id, sessionVersion: mag.sessionVersion } };
      expect((await call(it.id)).status).toBe(404);

      await setItemPhoto(actor, { id: it.id, expectedUpdatedAt: it.updatedAt, bytes: png() });
      const res = await call(it.id);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/png");
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(png());
    });
  });
});

describe("unités d'achat et prix (I1, I3, C1)", () => {
  it("unité d'achat = unité de stock avec coefficient ≠ 1 : refusé avec un message clair", async () => {
    const e = await mkItem("IT-U-BAD", { stockUnit: "KG", purchaseUnit: "KG", conversionFactor: 25 }).then(
      () => null,
      (x: unknown) => x,
    );
    expect(String(e)).toMatch(/coefficient de conversion doit être 1/);
    const ok = await mkItem("IT-U-OK", { stockUnit: "KG", purchaseUnit: "KG", conversionFactor: 1 });
    expect(ok.purchaseUnit).toBe("KG");
  });

  it("le lien enregistre l'unité d'achat de l'article, aussi dans l'historique ; l'unité d'achat est verrouillée tant que des prix existent", async () => {
    const it = await mkItem("IT-U-PRICE", { stockUnit: "KG", purchaseUnit: "FUT", conversionFactor: 200 });
    const s = await mkSupplier("IT-U-PRICES");
    const link = await linkSupplier(actor, {
      itemId: it.id,
      supplierId: s.id,
      lastPrice: 380000,
      currencyCode: "XOF",
      minOrderQty: 2,
    });
    expect(link.priceUnit).toBe("FUT");
    const hist = await db.itemPriceHistory.findMany({ where: { itemId: it.id } });
    expect(hist.map((h) => h.priceUnit)).toEqual(["FUT"]);
    await rejectsWith(
      updateItem(actor, {
        ...itemBase,
        stockUnit: "KG",
        purchaseUnit: "BIDON",
        conversionFactor: 25,
        id: it.id,
        expectedUpdatedAt: it.updatedAt,
      } as never),
      "PURCHASE_UNIT_LOCKED",
    );
  });

  it("nouvelles unités BOBINE, BIDON, PCE acceptées", async () => {
    const it = await mkItem("IT-U-NEW", { stockUnit: "PCE", purchaseUnit: "BOBINE", conversionFactor: 500 });
    expect(it.purchaseUnit).toBe("BOBINE");
    await mkItem("IT-U-NEW2", { stockUnit: "L", purchaseUnit: "BIDON", conversionFactor: 20 });
  });
});

describe("codes (I4)", () => {
  it("code de 18 caractères ou avec un espace/accent : refusé, jamais tronqué", async () => {
    for (const bad of ["IT-ABCDEFGHIJKLMNOP", "IT BAD", "IT-ÉCOLE"]) {
      const e = await mkItem(bad).then(
        () => null,
        (x: unknown) => x,
      );
      expect(String(e), bad).toMatch(/17 caractères maximum/);
    }
    expect(await db.item.count({ where: { code: { startsWith: "IT-ABCDEFGHIJ" } } })).toBe(0);
    const ok = await mkItem("IT-ABCDEFGHIJKL-N");
    expect(ok.code).toHaveLength(17);
  });
});

describe("écart de taux > 20 % (confirmation)", () => {
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

  beforeEach(async () => {
    await upsertCurrency(actor, { code: "ZZD", name: "Devise écart", symbol: "Z", decimals: 2 });
  });

  it("premier taux libre ; +25 % demande confirmation ; +15 % passe ; confirmDeviation accepté", async () => {
    await addExchangeRate(actor, { currencyCode: "ZZD", date: day(-3), rate: "100", note: "IT-dev" });
    await rejectsWith(
      addExchangeRate(actor, { currencyCode: "ZZD", date: day(-2), rate: "125", note: "IT-dev" }),
      "RATE_DEVIATION_CONFIRM",
      /20 %/,
    );
    await addExchangeRate(actor, { currencyCode: "ZZD", date: day(-2), rate: "115", note: "IT-dev" });
    await addExchangeRate(actor, {
      currencyCode: "ZZD",
      date: day(-1),
      rate: "60",
      note: "IT-dev",
      confirmDeviation: true,
    });
  });

  it("la modification d'un taux est comparée au taux précédent (pas à lui-même)", async () => {
    await addExchangeRate(actor, { currencyCode: "ZZD", date: day(-3), rate: "100", note: "IT-dev" });
    const r = await addExchangeRate(actor, {
      currencyCode: "ZZD",
      date: day(-2),
      rate: "105",
      note: "IT-dev",
    });
    await rejectsWith(
      updateExchangeRate(actor, { id: r.id, expectedUpdatedAt: r.updatedAt, rate: "140", note: "IT-dev" }),
      "RATE_DEVIATION_CONFIRM",
    );
    await updateExchangeRate(actor, {
      id: r.id,
      expectedUpdatedAt: r.updatedAt,
      rate: "140",
      note: "IT-dev",
      confirmDeviation: true,
    });
  });

  it("la date « aujourd'hui » vient de l'horloge passée en paramètre (cookie rb-test-now)", async () => {
    const simulated = new Date(Date.now() + 10 * 86_400_000);
    const futureDay = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    await rejectsWith(
      addExchangeRate(actor, { currencyCode: "ZZD", date: futureDay, rate: "100", note: "IT-dev" }),
      "RATE_FUTURE",
    );
    const ok = await addExchangeRate(
      actor,
      { currencyCode: "ZZD", date: futureDay, rate: "100", note: "IT-dev" },
      null,
      simulated,
    );
    expect(ok.rate).toBe("100");
  });
});

describe("journal d'un article (audits des liens inclus)", () => {
  it("listEntityAudit remonte les opérations ItemSupplier liées", async () => {
    const it = await mkItem("IT-JR");
    const s = await mkSupplier("IT-JRS");
    const link = await linkSupplier(actor, {
      itemId: it.id,
      supplierId: s.id,
      lastPrice: 10,
      currencyCode: "XOF",
    });
    await updateItemSupplier(actor, {
      id: link.id,
      expectedUpdatedAt: link.updatedAt,
      lastPrice: 12,
      currencyCode: "XOF",
    });
    const plain = await listEntityAudit("Item", it.id);
    expect(plain.map((e) => e.action)).toEqual(["ITEM_CREATE"]);
    const withLinks = await listEntityAudit("Item", it.id, 50, [{ entity: "ItemSupplier", ids: [link.id] }]);
    expect(withLinks.map((e) => e.action).sort()).toEqual([
      "ITEM_CREATE",
      "ITEM_SUPPLIER_LINK",
      "ITEM_SUPPLIER_UPDATE",
    ]);
  });
});

describe("fiche fournisseur : coordonnées (I5)", () => {
  it("adresse, téléphone, email, banque enregistrés ; banque absente du journal ; email invalide refusé", async () => {
    const s = await mkSupplier("IT-CO", {
      address: "12 rue des Industries, Abidjan",
      phone: "+225 27 00 00 00 00",
      email: "Contact@Exemple.TEST",
      bankDetails: "Banque fictive RIB 0000",
    });
    expect(s.address).toBe("12 rue des Industries, Abidjan");
    expect(s.email).toBe("contact@exemple.test");
    expect(s.bankDetails).toBe("Banque fictive RIB 0000");
    const audit = await db.auditLog.findFirstOrThrow({
      where: { entityId: s.id, action: "SUPPLIER_CREATE" },
    });
    expect(JSON.stringify(audit.after)).not.toContain("RIB 0000");
    await expect(mkSupplier("IT-CO2", { email: "pas-un-email" })).rejects.toThrow();
  });
});
