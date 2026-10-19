import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { cleanTestUsers, createTestUser } from "../helpers/db";
import { cleanReferentials, ensureCurrencies } from "../helpers/referentials";

const session: { current: { user: { id: string; sessionVersion: number } } | null } = { current: null };
vi.mock("@/lib/auth", () => ({ auth: async () => session.current }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/modules/auth/ip", () => ({ getClientIp: async () => "127.0.0.1" }));

const items = await import("@/app/(app)/stock/articles/actions");
const suppliers = await import("@/app/(app)/fournisseurs/actions");
const warehouses = await import("@/app/(app)/parametres/depots/actions");
const departments = await import("@/app/(app)/parametres/services/actions");
const currencies = await import("@/app/(app)/parametres/devises/actions");
const reglages = await import("@/app/(app)/parametres/reglages/actions");

async function login(key: string, role: "RESPONSABLE_ACHATS" | "ACHETEUR" | "MAGASINIER" | "SUPER_ADMIN") {
  const u = await createTestUser(key, { role, purchaseScope: role === "ACHETEUR" ? "ALL" : null });
  session.current = { user: { id: u.id, sessionVersion: u.sessionVersion } };
  return u;
}

async function setLicense(status: "TRIAL" | "EXPIRED") {
  await db.license.deleteMany();
  const now = Date.now();
  await db.license.create({
    data: {
      status,
      trialStartsAt: new Date(now - 60 * 86_400_000),
      trialEndsAt: new Date(now + (status === "EXPIRED" ? -1 : 10) * 86_400_000),
    },
  });
}

const itemInput = { name: "Roulement 6205", category: "PDR", stockUnit: "U", purchaseUnit: "CARTON", conversionFactor: 10, code: "IT-ACT-1" };
const supplierInput = { name: "Fournisseur action", type: "LOCAL", currencyCode: "XOF", code: "IT-ACT-S1" };

let savedLicenses: Awaited<ReturnType<typeof db.license.findMany>> = [];

beforeEach(async () => {
  await cleanReferentials();
  await cleanTestUsers();
  await ensureCurrencies();
  session.current = null;
  if (savedLicenses.length === 0) savedLicenses = await db.license.findMany();
  await setLicense("TRIAL");
});
afterAll(async () => {
  await cleanReferentials();
  await cleanTestUsers();
  await db.license.deleteMany();
  if (savedLicenses.length) await db.license.createMany({ data: savedLicenses });
  await db.$disconnect();
});

describe("Magasinier : lecture seule", () => {
  it("toutes les écritures sont refusées (FORBIDDEN)", async () => {
    await login("m1", "MAGASINIER");
    const writes: Array<[string, () => Promise<{ ok: boolean; code?: string }>]> = [
      ["createItem", () => items.createItemAction(itemInput)],
      ["updateItem", () => items.updateItemAction({})],
      ["setItemStatus", () => items.setItemStatusAction({})],
      ["changeItemCode", () => items.changeItemCodeAction({})],
      ["linkSupplier", () => items.linkSupplierAction({})],
      ["setItemPhoto", () => items.setItemPhotoAction(new FormData())],
      ["createSupplier", () => suppliers.createSupplierAction(supplierInput)],
      ["blockSupplier", () => suppliers.blockSupplierAction({})],
      ["unblockSupplier", () => suppliers.unblockSupplierAction({})],
      ["addContact", () => suppliers.addContactAction({})],
      ["createWarehouse", () => warehouses.createWarehouseAction({ code: "IT-M", name: "Dépôt" })],
      ["createDepartment", () => departments.createDepartmentAction({ code: "IT-M", name: "Service" })],
      ["upsertCurrency", () => currencies.upsertCurrencyAction({ code: "ZZM", name: "Test", symbol: "Z" })],
      ["addExchangeRate", () => currencies.addExchangeRateAction({ currencyCode: "EUR", date: "2026-01-01", rate: "655.957" })],
      ["updateSetting", () => reglages.updateSettingAction({ key: "warehouse.showPurchasePrice", value: true })],
    ];
    for (const [name, call] of writes) {
      expect(await call(), name).toMatchObject({ ok: false, code: "FORBIDDEN" });
    }
    expect(await db.item.count({ where: { code: "IT-ACT-1" } })).toBe(0);
  });

  it("listes autorisées ; articles consultables ; fournisseurs non", async () => {
    await login("m2", "MAGASINIER");
    expect((await items.listItemsAction({})).ok).toBe(true);
    expect((await warehouses.listWarehousesAction({})).ok).toBe(true);
    expect((await departments.listDepartmentsAction({})).ok).toBe(true);
    expect((await currencies.listCurrenciesAction({})).ok).toBe(true);
    expect(await suppliers.listSuppliersAction({})).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("prix : jamais renvoyés au Magasinier par défaut ; visibles si le réglage est activé", async () => {
    const buyer = await login("b1", "ACHETEUR");
    const s = await suppliers.createSupplierAction(supplierInput);
    const i = await items.createItemAction(itemInput);
    if (!s.ok || !i.ok) throw new Error("préparation");
    const l = await items.linkSupplierAction({ itemId: i.data.id, supplierId: s.data.supplier.id, lastPrice: 4321, currencyCode: "XOF" });
    expect(l.ok).toBe(true);
    const asBuyer = await items.listPriceHistoryAction({ id: i.data.id });
    expect(asBuyer.ok && asBuyer.data.length).toBe(1);

    await login("m3", "MAGASINIER");
    const fiche = await items.getItemAction({ id: i.data.id });
    expect(fiche.ok).toBe(true);
    expect(JSON.stringify(fiche)).not.toContain("4321");
    expect(await items.listPriceHistoryAction({ id: i.data.id })).toEqual({ ok: true, data: [] });
    expect(JSON.stringify(await items.listItemsAction({}))).not.toContain("4321");

    session.current = { user: { id: buyer.id, sessionVersion: buyer.sessionVersion } };
    // L'Acheteur ne gère pas les réglages ; le Responsable active l'affichage.
    expect(await reglages.updateSettingAction({ key: "warehouse.showPurchasePrice", value: true })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    await login("r1", "RESPONSABLE_ACHATS");
    expect((await reglages.updateSettingAction({ key: "warehouse.showPurchasePrice", value: true })).ok).toBe(true);
    await login("m4", "MAGASINIER");
    expect(JSON.stringify(await items.getItemAction({ id: i.data.id }))).toContain("4321");
  });
});

describe("droits Acheteur / Responsable", () => {
  it("Acheteur : écrit articles, fournisseurs, taux ; pas dépôts, devises, déblocage, changement de code", async () => {
    await login("b2", "ACHETEUR");
    const s = await suppliers.createSupplierAction(supplierInput);
    const i = await items.createItemAction(itemInput);
    expect(s.ok && i.ok).toBe(true);
    if (!s.ok || !i.ok) return;
    expect(await warehouses.createWarehouseAction({ code: "IT-B", name: "Dépôt" })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await currencies.upsertCurrencyAction({ code: "ZZB", name: "Test", symbol: "Z" })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(
      await items.changeItemCodeAction({ id: i.data.id, code: "IT-NEW", expectedUpdatedAt: i.data.updatedAt }),
    ).toMatchObject({ ok: false, code: "FORBIDDEN" });
    const blocked = await suppliers.blockSupplierAction({
      id: s.data.supplier.id,
      reason: "Retards répétés",
      expectedUpdatedAt: s.data.supplier.updatedAt,
    });
    expect(blocked.ok).toBe(true);
    if (!blocked.ok) return;
    expect(
      await suppliers.unblockSupplierAction({
        id: s.data.supplier.id,
        expectedUpdatedAt: blocked.data.supplier.updatedAt,
      }),
    ).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(
      (await currencies.addExchangeRateAction({ currencyCode: "EUR", date: "2026-01-02", rate: "655.957", note: "IT-x" })).ok,
    ).toBe(true);
  });

  it("Responsable : débloque, change un code, gère dépôts et devises", async () => {
    await login("b3", "ACHETEUR");
    const s = await suppliers.createSupplierAction(supplierInput);
    if (!s.ok) throw new Error("préparation");
    const b = await suppliers.blockSupplierAction({ id: s.data.supplier.id, reason: "Qualité", expectedUpdatedAt: s.data.supplier.updatedAt });
    if (!b.ok) throw new Error("préparation");
    await login("r2", "RESPONSABLE_ACHATS");
    const u = await suppliers.unblockSupplierAction({ id: s.data.supplier.id, expectedUpdatedAt: b.data.supplier.updatedAt });
    expect(u).toMatchObject({ ok: true });
    const c = await suppliers.changeSupplierCodeAction({ id: s.data.supplier.id, code: "it-act-s9", expectedUpdatedAt: u.ok ? u.data.updatedAt : "" });
    expect(c).toMatchObject({ ok: true, data: { code: "IT-ACT-S9" } });
    expect((await warehouses.createWarehouseAction({ code: "IT-R", name: "Dépôt R" })).ok).toBe(true);
    expect((await currencies.upsertCurrencyAction({ code: "ZZR", name: "Test", symbol: "Z" })).ok).toBe(true);
  });

  it("validation Zod : message français, code VALIDATION", async () => {
    await login("b4", "ACHETEUR");
    expect(await items.createItemAction({ ...itemInput, name: "" })).toMatchObject({
      ok: false,
      code: "VALIDATION",
      message: expect.stringMatching(/désignation/i),
    });
    expect(await suppliers.blockSupplierAction({ id: "x", reason: "", expectedUpdatedAt: new Date() })).toMatchObject({
      ok: false,
      code: "VALIDATION",
      message: expect.stringMatching(/motif/i),
    });
  });
});

describe("essai expiré (LOT-02)", () => {
  it("écritures => LICENSE_READ_ONLY ; listes et lectures => OK", async () => {
    await login("b5", "ACHETEUR");
    const s = await suppliers.createSupplierAction(supplierInput);
    if (!s.ok) throw new Error("préparation");
    await setLicense("EXPIRED");
    expect(await items.createItemAction(itemInput)).toMatchObject({ ok: false, code: "LICENSE_READ_ONLY" });
    expect(await suppliers.createSupplierAction({ ...supplierInput, code: "IT-ACT-S2" })).toMatchObject({ ok: false, code: "LICENSE_READ_ONLY" });
    expect(await currencies.addExchangeRateAction({ currencyCode: "EUR", date: "2026-01-03", rate: "655.957" })).toMatchObject({
      ok: false,
      code: "LICENSE_READ_ONLY",
    });
    expect((await items.listItemsAction({})).ok).toBe(true);
    expect((await suppliers.listSuppliersAction({})).ok).toBe(true);
    expect((await suppliers.getSupplierAction({ id: s.data.supplier.id })).ok).toBe(true);
    expect((await currencies.listCurrenciesAction({})).ok).toBe(true);
  });
});

describe("audit des actions", () => {
  it("chaque écriture réussie laisse exactement une trace par entité", async () => {
    await login("b6", "ACHETEUR");
    const s = await suppliers.createSupplierAction(supplierInput);
    const i = await items.createItemAction(itemInput);
    if (!s.ok || !i.ok) throw new Error("préparation");
    expect(await db.auditLog.count({ where: { action: "SUPPLIER_CREATE", entityId: s.data.supplier.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "ITEM_CREATE", entityId: i.data.id } })).toBe(1);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "ITEM_CREATE", entityId: i.data.id } });
    expect(log.ip).toBe("127.0.0.1");
    expect(log.userId).toBe(session.current!.user.id);
  });
});
