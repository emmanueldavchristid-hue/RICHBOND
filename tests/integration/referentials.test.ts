import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createTestUser, cleanTestUsers } from "../helpers/db";
import { cleanReferentials, ensureCurrencies, IT_PREFIX } from "../helpers/referentials";
import {
  changeItemCode,
  createItem,
  deactivateItemSupplier,
  getItem,
  linkSupplier,
  listItems,
  listPriceHistory,
  setItemStatus,
  updateItem,
  updateItemSupplier,
} from "@/modules/items";
import {
  assertSupplierCanOrder,
  blockSupplier,
  createSupplier,
  listSuppliers,
  setSupplierStatus,
  unblockSupplier,
  updateSupplier,
  getSupplier,
} from "@/modules/suppliers";
import { createWarehouse, setWarehouseActive } from "@/modules/warehouses";
import {
  addExchangeRate,
  getRateAt,
  setCurrencyActive,
  updateExchangeRate,
  upsertCurrency,
} from "@/modules/currencies";
import { updateSetting, getSettings } from "@/modules/settings";
import { BusinessError } from "@/lib/errors";

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
  name: "Roulement 6308",
  category: "PDR",
  stockUnit: "U",
  purchaseUnit: "CARTON",
  conversionFactor: 10,
};
const supplierBase = { name: "Fournisseur test", type: "LOCAL", currencyCode: "XOF" };

const mkSupplier = (code: string, extra: Record<string, unknown> = {}) =>
  createSupplier(actor, { ...supplierBase, code, ...extra } as never).then((r) => r.supplier);
const mkItem = (code: string, extra: Record<string, unknown> = {}) =>
  createItem(actor, { ...itemBase, code, ...extra } as never);

beforeEach(async () => {
  await cleanReferentials();
  await cleanTestUsers();
  await ensureCurrencies();
  const u = await createTestUser("ref-buyer", { role: "ACHETEUR", purchaseScope: "ALL" });
  actor = { id: u.id, role: "ACHETEUR" };
});
afterAll(async () => {
  await cleanReferentials();
  await cleanTestUsers();
  await db.$disconnect();
});

describe("unicité et génération des codes (R1)", () => {
  it("10 créations parallèles du même code : 1 succès, 9 « Ce code existe déjà »", async () => {
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => mkItem("IT-DUP")));
    const ok = results.filter((r) => r.status === "fulfilled");
    const ko = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(ko).toHaveLength(9);
    for (const r of ko) {
      expect(r.reason).toBeInstanceOf(BusinessError);
      expect(r.reason.code).toBe("CODE_EXISTS");
      expect(r.reason.messageFr).toBe("Ce code existe déjà.");
    }
  });

  it("le code est normalisé en majuscules", async () => {
    const it = await mkItem("it-lower");
    expect(it.code).toBe("IT-LOWER");
  });

  it("20 codes automatiques en parallèle : séquence sans trou ni doublon", async () => {
    await db.counter.deleteMany({ where: { key: "ART" } });
    await db.counter.create({ data: { key: "ART", year: 0, value: 90000 } });
    const items = await Promise.all(Array.from({ length: 20 }, () => createItem(actor, itemBase as never)));
    const codes = items.map((i) => i.code).sort();
    expect(codes).toEqual(Array.from({ length: 20 }, (_, i) => `ART-${90001 + i}`));
    await db.counter.deleteMany({ where: { key: "ART" } });
  });

  it("code fournisseur automatique FRS-xxxxx ; saute un code déjà saisi à la main", async () => {
    await db.counter.deleteMany({ where: { key: "FRS" } });
    await db.counter.create({ data: { key: "FRS", year: 0, value: 91000 } });
    const manual = await mkSupplier("FRS-91001");
    expect(manual.code).toBe("FRS-91001");
    const auto = await createSupplier(actor, supplierBase as never);
    expect(auto.supplier.code).toBe("FRS-91002");
    await db.counter.deleteMany({ where: { key: "FRS" } });
  });

  it("changement de code : doublon refusé, audité", async () => {
    const a = await mkItem("IT-A");
    await mkItem("IT-B");
    await rejectsWith(
      changeItemCode(actor, { id: a.id, code: "it-b", expectedUpdatedAt: a.updatedAt }),
      "CODE_EXISTS",
    );
    const changed = await changeItemCode(actor, { id: a.id, code: "it-c", expectedUpdatedAt: a.updatedAt });
    expect(changed.code).toBe("IT-C");
    expect(await db.auditLog.count({ where: { entityId: a.id, action: "ITEM_CODE_CHANGE" } })).toBe(1);
  });

  it("code-barres et NCC uniques", async () => {
    await mkItem("IT-BC1", { barcode: "3760001" });
    await rejectsWith(mkItem("IT-BC2", { barcode: "3760001" }), "BARCODE_EXISTS");
    await mkSupplier("IT-S1", { ncc: "9990001Z" });
    await rejectsWith(mkSupplier("IT-S2", { ncc: "9990001Z" }), "NCC_EXISTS");
  });
});

describe("concurrence (R16)", () => {
  it("une mise à jour avec une ancienne version est refusée (CONFLICT)", async () => {
    const it = await mkItem("IT-CONF");
    const edit = (name: string, v: Date) =>
      updateItem(actor, { ...itemBase, id: it.id, name, expectedUpdatedAt: v } as never);
    const first = await edit("Première modification", it.updatedAt);
    expect(first.name).toBe("Première modification");
    await rejectsWith(
      edit("Deuxième (ancienne version)", it.updatedAt),
      "CONFLICT",
      /modifiée par un autre utilisateur/,
    );
    const stored = await db.item.findUniqueOrThrow({ where: { id: it.id } });
    expect(stored.name).toBe("Première modification");
  });

  it("fournisseur : même règle", async () => {
    const s = await mkSupplier("IT-SC");
    await updateSupplier(actor, {
      ...supplierBase,
      id: s.id,
      name: "AA",
      expectedUpdatedAt: s.updatedAt,
    } as never);
    await rejectsWith(
      updateSupplier(actor, {
        ...supplierBase,
        id: s.id,
        name: "BB",
        expectedUpdatedAt: s.updatedAt,
      } as never),
      "CONFLICT",
    );
  });
});

describe("fournisseur bloqué (R7, R8)", () => {
  it("motif obligatoire ; blocage renvoie les articles dont il est le principal", async () => {
    const s = await mkSupplier("IT-BLK");
    const it = await mkItem("IT-ITEM-BLK", { mainSupplierId: s.id });
    await expect(
      blockSupplier(actor, { id: s.id, reason: "", expectedUpdatedAt: s.updatedAt }),
    ).rejects.toThrow();
    const r = await blockSupplier(actor, {
      id: s.id,
      reason: "Lots non conformes",
      expectedUpdatedAt: s.updatedAt,
    });
    expect(r.supplier.status).toBe("BLOQUE");
    expect(r.supplier.blockedReason).toBe("Lots non conformes");
    expect(r.supplier.blockedById).toBe(actor.id);
    expect(r.affectedItems.map((i) => i.id)).toEqual([it.id]);
  });

  it("refusé comme fournisseur principal et comme lien ; assertSupplierCanOrder refuse", async () => {
    const s = await mkSupplier("IT-BLK2");
    const blocked = (
      await blockSupplier(actor, { id: s.id, reason: "Défaut de qualité", expectedUpdatedAt: s.updatedAt })
    ).supplier;
    await rejectsWith(mkItem("IT-I1", { mainSupplierId: s.id }), "SUPPLIER_BLOCKED", /bloqué/);
    const it = await mkItem("IT-I2");
    await rejectsWith(linkSupplier(actor, { itemId: it.id, supplierId: s.id }), "SUPPLIER_BLOCKED");
    expect(() => assertSupplierCanOrder(blocked)).toThrow(/bloqué/);
    expect(() => assertSupplierCanOrder({ name: "X", status: "ACTIF" })).not.toThrow();
    expect(() => assertSupplierCanOrder({ name: "X", status: "EN_EVALUATION" })).not.toThrow();
  });

  it("choisir un fournisseur principal crée le lien ItemSupplier", async () => {
    const s = await mkSupplier("IT-MAIN");
    const it = await mkItem("IT-I3", { mainSupplierId: s.id });
    expect(await db.itemSupplier.count({ where: { itemId: it.id, supplierId: s.id, active: true } })).toBe(1);
  });

  it("déblocage : remet le statut et efface le motif ; l'update ne débloque pas", async () => {
    const s = await mkSupplier("IT-UNB");
    const b = (
      await blockSupplier(actor, { id: s.id, reason: "Motif de test", expectedUpdatedAt: s.updatedAt })
    ).supplier;
    const upd = await updateSupplier(actor, {
      ...supplierBase,
      id: s.id,
      name: "Renommé",
      status: "ACTIF",
      expectedUpdatedAt: b.updatedAt,
    } as never);
    expect(upd.supplier.status).toBe("BLOQUE");
    await rejectsWith(
      setSupplierStatus(actor, { id: s.id, status: "ACTIF", expectedUpdatedAt: upd.supplier.updatedAt }),
      "SUPPLIER_BLOCKED",
    );
    const u = await unblockSupplier(actor, {
      id: s.id,
      status: "EN_EVALUATION",
      expectedUpdatedAt: upd.supplier.updatedAt,
    });
    expect(u).toMatchObject({
      status: "EN_EVALUATION",
      blockedReason: null,
      blockedAt: null,
      blockedById: null,
    });
  });

  it("fournisseur déjà bloqué / non bloqué", async () => {
    const s = await mkSupplier("IT-UNB2");
    await rejectsWith(
      unblockSupplier(actor, { id: s.id, status: "ACTIF", expectedUpdatedAt: s.updatedAt }),
      "NOT_BLOCKED",
    );
  });
});

describe("dépôts, devises (R12, R13)", () => {
  it("dépôt par défaut d'un article actif : non désactivable (message avec le nombre)", async () => {
    const w = await createWarehouse(actor, { code: "IT-W1", name: "Dépôt test" });
    await mkItem("IT-W-A", { defaultWarehouseId: w.id });
    await mkItem("IT-W-B", { defaultWarehouseId: w.id });
    await rejectsWith(
      setWarehouseActive(actor, { id: w.id, active: false, expectedUpdatedAt: w.updatedAt }),
      "WAREHOUSE_IN_USE",
      /2 article/,
    );
    await db.item.updateMany({ where: { defaultWarehouseId: w.id }, data: { status: "OBSOLETE" } });
    const fresh = await db.warehouse.findUniqueOrThrow({ where: { id: w.id } });
    const off = await setWarehouseActive(actor, {
      id: w.id,
      active: false,
      expectedUpdatedAt: fresh.updatedAt,
    });
    expect(off.active).toBe(false);
  });

  it("dépôt désactivé refusé comme dépôt par défaut", async () => {
    const w = await createWarehouse(actor, { code: "IT-W2", name: "Dépôt fermé" });
    await setWarehouseActive(actor, { id: w.id, active: false, expectedUpdatedAt: w.updatedAt });
    await rejectsWith(mkItem("IT-W-C", { defaultWarehouseId: w.id }), "WAREHOUSE_INVALID");
  });

  it("code dépôt en doublon", async () => {
    await createWarehouse(actor, { code: "IT-W3", name: "AA" });
    await rejectsWith(createWarehouse(actor, { code: "it-w3", name: "BB" }), "CODE_EXISTS");
  });

  it("XOF non désactivable", async () => {
    await rejectsWith(setCurrencyActive(actor, { code: "XOF", active: false }), "BASE_CURRENCY");
  });

  it("devise utilisée par un fournisseur non bloqué : non désactivable", async () => {
    await upsertCurrency(actor, { code: "ZZA", name: "Devise test", symbol: "Z", decimals: 2 });
    await mkSupplier("IT-CUR", { currencyCode: "ZZA", type: "IMPORT" });
    await rejectsWith(
      setCurrencyActive(actor, { code: "ZZA", active: false }),
      "CURRENCY_IN_USE",
      /1 fournisseur/,
    );
  });

  it("devise désactivée refusée pour un nouveau fournisseur", async () => {
    await upsertCurrency(actor, { code: "ZZB", name: "Devise test", symbol: "Z", decimals: 2 });
    await setCurrencyActive(actor, { code: "ZZB", active: false });
    await rejectsWith(mkSupplier("IT-CUR2", { currencyCode: "ZZB" }), "CURRENCY_INVALID");
  });
});

describe("taux de change (R11)", () => {
  const dateStr = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

  beforeEach(async () => {
    await upsertCurrency(actor, { code: "ZZR", name: "Devise taux", symbol: "Z", decimals: 2 });
  });

  it("getRateAt : taux du jour, veille, absent => RATE_MISSING, XOF = 1", async () => {
    await addExchangeRate(actor, { currencyCode: "ZZR", date: dateStr(-3), rate: "600", note: "IT-a" });
    await addExchangeRate(actor, { currencyCode: "ZZR", date: dateStr(-1), rate: "610,5", note: "IT-b" });
    const today = await getRateAt(db, "ZZR", new Date());
    expect(today.rate.toString()).toBe("610.5");
    expect(today.stale).toBe(false);
    const before = await getRateAt(db, "ZZR", new Date(Date.now() - 2 * 86_400_000));
    expect(before.rate.toString()).toBe("600");
    await rejectsWith(getRateAt(db, "ZZR", new Date(Date.now() - 10 * 86_400_000)), "RATE_MISSING");
    expect((await getRateAt(db, "XOF", new Date())).rate.toString()).toBe("1");
  });

  it("taux ancien (> 30 jours) signalé", async () => {
    await addExchangeRate(actor, { currencyCode: "ZZR", date: dateStr(-40), rate: "600", note: "IT-old" });
    expect((await getRateAt(db, "ZZR", new Date())).stale).toBe(true);
  });

  it("doublon (devise, date) refusé ; date future refusée ; XOF sans taux", async () => {
    await addExchangeRate(actor, { currencyCode: "ZZR", date: dateStr(-1), rate: "600", note: "IT-c" });
    await rejectsWith(
      addExchangeRate(actor, { currencyCode: "ZZR", date: dateStr(-1), rate: "601", note: "IT-d" }),
      "RATE_EXISTS",
    );
    await rejectsWith(
      addExchangeRate(actor, { currencyCode: "ZZR", date: dateStr(5), rate: "601" }),
      "RATE_FUTURE",
    );
    await rejectsWith(
      addExchangeRate(actor, { currencyCode: "XOF", date: dateStr(-1), rate: "1" }),
      "BASE_CURRENCY",
    );
  });

  it("EUR différent de 655,957 : confirmation exigée", async () => {
    // Le seed de démo date ses taux relativement au jour du seed : libère la date utilisée ici pour rester indépendant du jour.
    await db.exchangeRate.deleteMany({
      where: { currencyCode: "EUR", date: new Date(`${dateStr(-2)}T00:00:00.000Z`) },
    });
    await rejectsWith(
      addExchangeRate(actor, { currencyCode: "EUR", date: dateStr(-2), rate: "660", note: "IT-eur" }),
      "EUR_PARITY_CONFIRM",
    );
    const ok = await addExchangeRate(actor, {
      currencyCode: "EUR",
      date: dateStr(-2),
      rate: "660",
      note: "IT-eur",
      confirmEurDeviation: true,
    });
    expect(ok.rate).toBe("660");
  });

  it("modification d'un taux : version vérifiée et auditée", async () => {
    const r = await addExchangeRate(actor, {
      currencyCode: "ZZR",
      date: dateStr(-1),
      rate: "600",
      note: "IT-e",
    });
    const u = await updateExchangeRate(actor, {
      id: r.id,
      rate: "602",
      note: "IT-e",
      expectedUpdatedAt: r.updatedAt,
    });
    expect(u.rate).toBe("602");
    await rejectsWith(
      updateExchangeRate(actor, { id: r.id, rate: "603", note: "IT-e", expectedUpdatedAt: r.updatedAt }),
      "CONFLICT",
    );
    expect(await db.auditLog.count({ where: { entityId: r.id } })).toBe(2);
  });
});

describe("prix et historique (R10, R15)", () => {
  it("chaque changement de prix crée une ligne d'historique, taux figé si connu", async () => {
    const s = await mkSupplier("IT-PRICE", { currencyCode: "EUR", type: "IMPORT" });
    const it = await mkItem("IT-PITEM");
    const link = await linkSupplier(actor, {
      itemId: it.id,
      supplierId: s.id,
      lastPrice: 12.5,
      currencyCode: "EUR",
    });
    let h = await listPriceHistory(it.id, { showPrices: true });
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ price: "12.5", currencyCode: "EUR", source: "MANUEL" });
    const up = await updateItemSupplier(actor, {
      id: link.id,
      expectedUpdatedAt: link.updatedAt,
      lastPrice: 13,
      currencyCode: "EUR",
    });
    h = await listPriceHistory(it.id, { showPrices: true });
    expect(h).toHaveLength(2);
    // Mise à jour sans changement de prix : pas de nouvelle ligne.
    await updateItemSupplier(actor, {
      id: link.id,
      expectedUpdatedAt: up.updatedAt,
      lastPrice: 13,
      currencyCode: "EUR",
      supplierRef: "R1",
    });
    expect(await listPriceHistory(it.id, { showPrices: true })).toHaveLength(2);
  });

  it("prix XOF décimal refusé ; lien en doublon refusé", async () => {
    const s = await mkSupplier("IT-PRICE2");
    const it = await mkItem("IT-PITEM2");
    await expect(
      linkSupplier(actor, { itemId: it.id, supplierId: s.id, lastPrice: 10.5, currencyCode: "XOF" }),
    ).rejects.toThrow();
    await linkSupplier(actor, { itemId: it.id, supplierId: s.id, lastPrice: 10, currencyCode: "XOF" });
    await rejectsWith(linkSupplier(actor, { itemId: it.id, supplierId: s.id }), "LINK_EXISTS");
  });

  it("le fournisseur principal ne peut pas être retiré de l'article", async () => {
    const s = await mkSupplier("IT-PRICE3");
    const it = await mkItem("IT-PITEM3", { mainSupplierId: s.id });
    const link = await db.itemSupplier.findFirstOrThrow({ where: { itemId: it.id } });
    await rejectsWith(
      deactivateItemSupplier(actor, { id: link.id, expectedUpdatedAt: link.updatedAt }),
      "MAIN_SUPPLIER_LINK",
    );
  });

  it("prix masqués (showPrices=false) : ni fiche, ni historique, ni fournisseur ne les exposent", async () => {
    const s = await mkSupplier("IT-HID");
    const it = await mkItem("IT-HID-I");
    await linkSupplier(actor, { itemId: it.id, supplierId: s.id, lastPrice: 100, currencyCode: "XOF" });
    const hidden = await getItem(it.id, { showPrices: false });
    expect(JSON.stringify(hidden)).not.toMatch(/"lastPrice":"?100/);
    expect(hidden.suppliers[0]).toMatchObject({ lastPrice: null, currencyCode: null, lastPriceDate: null });
    expect(await listPriceHistory(it.id, { showPrices: false })).toEqual([]);
    const sup = await getSupplier(s.id, { showPrices: false });
    expect(sup.items[0]).toMatchObject({ lastPrice: null, currencyCode: null });
    const visible = await getItem(it.id, { showPrices: true });
    expect(visible.suppliers[0].lastPrice).toBe("100");
  });
});

describe("listes (R17)", () => {
  it("recherche insensible à la casse, filtres, tri, pagination, statut par défaut", async () => {
    for (let i = 1; i <= 7; i++) {
      await mkItem(`IT-L${i}`, {
        name: `Courroie ITX type ${i}`,
        criticality: i <= 3 ? "CRITIQUE" : "STANDARD",
        equipment: "Matelasseuse",
      });
    }
    await mkItem("IT-LX", { name: "Fil", category: "MATIERE_PREMIERE", equipment: "Matelasseuse" });
    const q = await listItems({ q: "COURROIE ITX", taille: 25 });
    expect(q.rows.filter((r) => r.code.startsWith("IT-L"))).toHaveLength(7);
    const crit = await listItems({ q: "courroie itx", criticite: "CRITIQUE" });
    expect(crit.total).toBe(3);
    const eq = await listItems({ equipement: "matelass" });
    expect(eq.rows.every((r) => r.category === "PDR")).toBe(true); // équipement : PDR uniquement
    const p = await listItems({ q: "courroie itx", taille: 25, page: 1, tri: "code", ordre: "desc" });
    expect(p.rows[0].code).toBe("IT-L7");
    // statut par défaut : actifs ; obsolète exclu sauf TOUS
    const l1 = await db.item.findFirstOrThrow({ where: { code: "IT-L1" } });
    await setItemStatus(actor, { id: l1.id, status: "OBSOLETE", expectedUpdatedAt: l1.updatedAt });
    expect((await listItems({ q: "courroie itx" })).total).toBe(6);
    expect((await listItems({ q: "courroie itx", statut: "TOUS" })).total).toBe(7);
    expect((await listItems({ q: "courroie itx", statut: "OBSOLETE" })).total).toBe(1);
  });

  it("recherche par référence fournisseur", async () => {
    const s = await mkSupplier("IT-REFS");
    const it = await mkItem("IT-REFI");
    await linkSupplier(actor, { itemId: it.id, supplierId: s.id, supplierRef: "SKF-6308-2RS" });
    const r = await listItems({ q: "6308-2rs" });
    expect(r.rows.map((x) => x.code)).toContain("IT-REFI");
  });

  it("fournisseurs : défaut = actifs + en évaluation (bloqués exclus), filtre type/pays", async () => {
    await mkSupplier("IT-F1", { name: "Alpha test", type: "IMPORT", country: "CN", currencyCode: "EUR" });
    const b = await mkSupplier("IT-F2", { name: "Alpha bloqué" });
    await blockSupplier(actor, { id: b.id, reason: "Motif de test", expectedUpdatedAt: b.updatedAt });
    const d = await listSuppliers({ q: "alpha test" });
    expect(d.total).toBe(1);
    expect((await listSuppliers({ q: "alpha", statut: "TOUS" })).total).toBe(2);
    expect((await listSuppliers({ q: "alpha", statut: "BLOQUE" })).total).toBe(1);
    expect((await listSuppliers({ q: "alpha", statut: "TOUS", pays: "cn" })).total).toBe(1);
    expect((await listSuppliers({ q: "alpha", statut: "TOUS", type: "LOCAL" })).total).toBe(1);
  });
});

describe("règles article", () => {
  it("SERVICE : non stocké, sans seuils ni dépôt", async () => {
    const it = await mkItem("IT-SRV", {
      category: "SERVICE",
      stocked: true,
      safetyStock: 5,
      reorderPoint: 8,
    });
    expect(it).toMatchObject({
      stocked: false,
      safetyStock: null,
      reorderPoint: null,
      defaultWarehouseId: null,
    });
  });

  it("alerte doublon de raison sociale et NCC non conforme (avertissements, pas d'erreur)", async () => {
    await mkSupplier("IT-W-1", { name: "Établissements Kouadio SARL" });
    const r = await createSupplier(actor, {
      ...supplierBase,
      code: "IT-W-2",
      name: "ETABLISSEMENTS KOUADIO",
      ncc: "XYZ",
    } as never);
    expect(r.warnings).toHaveLength(2);
    expect(r.warnings.join(" ")).toMatch(/très proche/);
    expect(r.warnings.join(" ")).toMatch(/NCC/);
  });

  it("contacts créés avec le fournisseur ; un seul contact principal", async () => {
    const r = await createSupplier(actor, {
      ...supplierBase,
      code: "IT-CT",
      contacts: [
        { name: "Awa", isPrimary: true, phone: "+225 27 00 00 00 00" },
        { name: "Koffi", isPrimary: true },
      ],
    } as never);
    expect(r.supplier.contacts).toHaveLength(2);
    expect(r.supplier.contacts.filter((c) => c.isPrimary)).toHaveLength(1);
  });
});

describe("audit : une écriture = au moins un AuditLog dans la même transaction", () => {
  it("création, modification, statut, blocage", async () => {
    const s = await mkSupplier("IT-AUD");
    const it = await mkItem("IT-AUD-I");
    expect(
      await db.auditLog.count({ where: { entityId: s.id, action: "SUPPLIER_CREATE", userId: actor.id } }),
    ).toBe(1);
    expect(
      await db.auditLog.count({ where: { entityId: it.id, action: "ITEM_CREATE", userId: actor.id } }),
    ).toBe(1);
    const up = await updateItem(actor, {
      ...itemBase,
      id: it.id,
      name: "Nouveau nom",
      expectedUpdatedAt: it.updatedAt,
    } as never);
    const log = await db.auditLog.findFirstOrThrow({ where: { entityId: it.id, action: "ITEM_UPDATE" } });
    expect((log.before as { name: string }).name).toBe("Roulement 6308");
    expect((log.after as { name: string }).name).toBe("Nouveau nom");
    await setItemStatus(actor, { id: it.id, status: "BLOQUE", expectedUpdatedAt: up.updatedAt });
    expect(await db.auditLog.count({ where: { entityId: it.id, action: "ITEM_STATUS" } })).toBe(1);
  });

  it("échec (code en doublon) : ni article, ni audit, ni compteur consommé en trop", async () => {
    await mkItem("IT-ROLL");
    const before = await db.auditLog.count({ where: { action: "ITEM_CREATE" } });
    await rejectsWith(mkItem("IT-ROLL"), "CODE_EXISTS");
    expect(await db.auditLog.count({ where: { action: "ITEM_CREATE" } })).toBe(before);
    expect(await db.item.count({ where: { code: "IT-ROLL" } })).toBe(1);
  });

  it("réglage : valeur validée, auditée", async () => {
    expect((await getSettings()).showPurchasePriceToWarehouse).toBe(false);
    await expect(
      updateSetting(actor, { key: "warehouse.showPurchasePrice", value: "oui" }),
    ).rejects.toThrow();
    await expect(updateSetting(actor, { key: "inconnu", value: true })).rejects.toThrow();
    await updateSetting(actor, { key: "warehouse.showPurchasePrice", value: true });
    expect((await getSettings()).showPurchasePriceToWarehouse).toBe(true);
    expect(
      await db.auditLog.count({
        where: { entityId: "warehouse.showPurchasePrice", action: "SETTING_UPDATE" },
      }),
    ).toBe(1);
  });
});

// Le préfixe est utilisé par les helpers de nettoyage.
void IT_PREFIX;
