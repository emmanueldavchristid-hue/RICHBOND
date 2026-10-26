import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { cleanTestUsers, createTestUser } from "../helpers/db";
import { cleanReferentials, ensureCurrencies } from "../helpers/referentials";

const session: { current: { user: { id: string; sessionVersion: number } } | null } = { current: null };
vi.mock("@/lib/auth", () => ({ auth: async () => session.current }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/modules/auth/ip", () => ({ getClientIp: async () => "127.0.0.1" }));

const actions = await import("@/app/(app)/parametres/import/actions");
const { getImportReport } = await import("@/modules/import/service");

type Role = "RESPONSABLE_ACHATS" | "ACHETEUR" | "MAGASINIER" | "SUPER_ADMIN";
async function login(key: string, role: Role) {
  const u = await createTestUser(key, { role, purchaseScope: role === "ACHETEUR" ? "ALL" : null });
  session.current = { user: { id: u.id, sessionVersion: u.sessionVersion } };
  return u;
}

async function setLicense(status: "TRIAL" | "EXPIRED") {
  await db.license.deleteMany();
  const now = Date.now();
  await db.license.create({
    data: { status, trialStartsAt: new Date(now - 60 * 86_400_000), trialEndsAt: new Date(now + (status === "EXPIRED" ? -1 : 10) * 86_400_000) },
  });
}

const fixture = (name: string) => readFileSync(path.resolve(__dirname, "../fixtures/import", name));
function form(type: string, name: string, content: Buffer | string, mapping?: object) {
  const fd = new FormData();
  fd.set("type", type);
  fd.set("file", new File([new Uint8Array(Buffer.from(content))], name));
  if (mapping) fd.set("mapping", JSON.stringify(mapping));
  return fd;
}
async function run(kind: "preview" | "commit", type: string, name: string, content: Buffer | string = fixture(name)) {
  const fn = kind === "preview" ? actions.previewImportAction : actions.commitImportAction;
  return fn(form(type, name, content));
}

let savedLicenses: Awaited<ReturnType<typeof db.license.findMany>> = [];
async function clean() {
  await cleanReferentials();
  await db.auditLog.deleteMany({ where: { entity: "ImportBatch" } });
  await cleanTestUsers();
}
beforeEach(async () => {
  await clean();
  await ensureCurrencies();
  session.current = null;
  if (savedLicenses.length === 0) savedLicenses = await db.license.findMany();
  await setLicense("TRIAL");
  await db.warehouse.upsert({ where: { code: "IT-DEP" }, update: { active: true }, create: { code: "IT-DEP", name: "Dépôt test import" } });
});
afterAll(async () => {
  await clean();
  await db.license.deleteMany();
  if (savedLicenses.length) await db.license.createMany({ data: savedLicenses });
  await db.$disconnect();
});

const itCount = (where: object = {}) => db.item.count({ where: { code: { startsWith: "IT-IMP" }, ...where } });

describe("droits et licence", () => {
  it("Acheteur et Magasinier : refusés ; Super-admin : aperçu autorisé", async () => {
    for (const [key, role] of [["i-ach", "ACHETEUR"], ["i-mag", "MAGASINIER"]] as const) {
      await login(key, role);
      expect(await run("preview", "ARTICLES", "articles-valides.csv")).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect(await run("commit", "ARTICLES", "articles-valides.csv")).toMatchObject({ ok: false, code: "FORBIDDEN" });
    }
    await login("i-adm", "SUPER_ADMIN");
    expect((await run("preview", "ARTICLES", "articles-valides.csv")).ok).toBe(true);
    expect(await itCount()).toBe(0);
  });

  it("licence expirée : l'import est refusé, l'aperçu reste possible", async () => {
    await login("i-resp", "RESPONSABLE_ACHATS");
    await setLicense("EXPIRED");
    const c = await run("commit", "ARTICLES", "articles-valides.csv");
    expect(c.ok).toBe(false);
    expect(await itCount()).toBe(0);
    expect((await run("preview", "ARTICLES", "articles-valides.csv")).ok).toBe(true);
  });
});

describe("articles", () => {
  it("l'aperçu n'écrit rien ; l'import crée ; le ré-import ne crée aucun doublon", async () => {
    const u = await login("i-resp", "RESPONSABLE_ACHATS");
    const p = await run("preview", "ARTICLES", "articles-valides.csv");
    expect(p).toMatchObject({ ok: true, data: { preview: { okCount: 4, errorCount: 0 } } });
    expect(await itCount()).toBe(0);

    const first = await run("commit", "ARTICLES", "articles-valides.csv");
    expect(first).toMatchObject({ ok: true, data: { summary: { created: 4, updated: 0, unchanged: 0, errorCount: 0 } } });
    expect(await itCount()).toBe(4);
    const pdr = await db.item.findUniqueOrThrow({ where: { code: "IT-IMP-001" } });
    expect(pdr).toMatchObject({ category: "PDR", stockUnit: "U", createdById: u.id });
    const oil = await db.item.findUniqueOrThrow({ where: { code: "IT-IMP-002" } });
    expect(oil.purchaseUnit).toBe("BIDON");
    expect(Number(oil.conversionFactor)).toBe(20);

    const again = await run("commit", "ARTICLES", "articles-valides.csv");
    expect(again).toMatchObject({ ok: true, data: { summary: { created: 0, updated: 0, unchanged: 4 } } });
    expect(await itCount()).toBe(4);

    // Mise à jour par code : la désignation change, rien d'autre.
    const edited = fixture("articles-valides.csv").toString("utf8").replace("Roulement 6205 2RS", "Roulement 6205 2RS C3");
    expect(await run("commit", "ARTICLES", "articles-valides.csv", edited)).toMatchObject({ ok: true, data: { summary: { created: 0, updated: 1, unchanged: 3 } } });
    expect((await db.item.findUniqueOrThrow({ where: { code: "IT-IMP-001" } })).name).toBe("Roulement 6205 2RS C3");

    const log = await db.auditLog.findFirstOrThrow({ where: { action: "IMPORT_COMMIT", entity: "ImportBatch" }, orderBy: { createdAt: "asc" } });
    expect(log.userId).toBe(u.id);
    expect(log.after).toMatchObject({ fileName: "articles-valides.csv", totalRows: 4, errorCount: 0 });
  });

  it("les lignes en erreur ne sont pas importées ; le rapport les liste", async () => {
    await login("i-resp", "RESPONSABLE_ACHATS");
    const r = await run("commit", "ARTICLES", "articles-erreurs.csv");
    if (!r.ok) throw new Error(r.message);
    const s = (r.data as { summary: { batchId: string; okCount: number; errorCount: number; created: number } }).summary;
    expect(s).toMatchObject({ okCount: 2, errorCount: 4, created: 2 });
    expect(await itCount()).toBe(2);
    const report = await getImportReport(s.batchId);
    expect(report.lines.filter((l) => l.outcome === "ERREUR")).toHaveLength(4);
    expect(report.lines.find((l) => l.line === 2)?.message).toMatch(/manquant/);
  });
});

describe("fournisseurs, liens et stock initial", () => {
  it("chaîne complète idempotente ; le stock initial passe par des mouvements AJUSTEMENT_INVENTAIRE", async () => {
    await login("i-resp", "RESPONSABLE_ACHATS");
    await run("commit", "ARTICLES", "articles-valides.csv");

    const sup = await run("commit", "FOURNISSEURS", "fournisseurs.csv");
    expect(sup).toMatchObject({ ok: true, data: { summary: { created: 2, errorCount: 1 } } });
    expect(await run("commit", "FOURNISSEURS", "fournisseurs.csv")).toMatchObject({ ok: true, data: { summary: { created: 0, unchanged: 2 } } });

    const link = await run("commit", "ARTICLE_FOURNISSEUR", "article-fournisseur.csv");
    expect(link).toMatchObject({ ok: true, data: { summary: { created: 2, errorCount: 2 } } });
    expect(await run("commit", "ARTICLE_FOURNISSEUR", "article-fournisseur.csv")).toMatchObject({ ok: true, data: { summary: { created: 0, unchanged: 2 } } });
    const l = await db.itemSupplier.findFirstOrThrow({ where: { item: { code: "IT-IMP-001" }, supplier: { code: "IT-FRS-001" } } });
    expect(Number(l.lastPrice)).toBe(4500);
    expect(await db.itemPriceHistory.count({ where: { item: { code: "IT-IMP-001" } } })).toBe(2);

    const stock = await run("commit", "STOCK_INITIAL", "stock-initial.csv");
    expect(stock).toMatchObject({ ok: true, data: { summary: { created: 2, errorCount: 2 } } });
    const moves = await db.stockMovement.findMany({ where: { item: { code: { startsWith: "IT-IMP" } } }, include: { item: true }, orderBy: { item: { code: "asc" } } });
    expect(moves).toHaveLength(2);
    expect(moves.every((m) => m.type === "AJUSTEMENT_INVENTAIRE" && m.documentRef === "IMPORT-STOCK-INITIAL")).toBe(true);
    expect(moves[0].occurredAt.toISOString().slice(0, 10)).toBe("2025-12-31");
    const level = await db.stockLevel.findFirstOrThrow({ where: { item: { code: "IT-IMP-002" }, warehouse: { code: "IT-DEP" } } });
    expect(Number(level.quantity)).toBe(3.5);
    expect(Number(level.pmp)).toBe(18000.5);

    // Ré-import : aucun mouvement de plus, quantités inchangées.
    expect(await run("commit", "STOCK_INITIAL", "stock-initial.csv")).toMatchObject({ ok: true, data: { summary: { created: 0, unchanged: 2 } } });
    expect(await db.stockMovement.count({ where: { item: { code: { startsWith: "IT-IMP" } } } })).toBe(2);
    expect(Number((await db.stockLevel.findFirstOrThrow({ where: { item: { code: "IT-IMP-001" } } })).quantity)).toBe(12);
  });
});

describe("robustesse", () => {
  it("deux imports de stock initial simultanés ne doublent pas le stock", async () => {
    await login("i-resp2", "RESPONSABLE_ACHATS");
    await run("commit", "ARTICLES", "articles-valides.csv");
    await Promise.all([run("commit", "STOCK_INITIAL", "stock-initial.csv"), run("commit", "STOCK_INITIAL", "stock-initial.csv")]);
    expect(await db.stockMovement.count({ where: { item: { code: { startsWith: "IT-IMP" } } } })).toBe(2);
  });

  it("un faux .xlsx ou un CSV binaire est refusé", async () => {
    await login("i-resp3", "RESPONSABLE_ACHATS");
    expect(await run("preview", "ARTICLES", "faux.xlsx", "ceci n'est pas un zip")).toMatchObject({ ok: false });
    expect(await run("preview", "ARTICLES", "binaire.csv", Buffer.from([65, 0, 66, 10]))).toMatchObject({ ok: false });
  });
});

describe("performance", () => {
  it("2 000 articles importés en moins de 30 s", async () => {
    await login("i-resp", "RESPONSABLE_ACHATS");
    const lines = ["Référence;Désignation;Catégorie;Famille;Unité"];
    for (let i = 1; i <= 2000; i++) lines.push(`IT-P${String(i).padStart(5, "0")};Article de test ${i};Fourniture;Famille ${i % 20};U`);
    const t0 = Date.now();
    const r = await run("commit", "ARTICLES", "gros.csv", lines.join("\n"));
    const ms = Date.now() - t0;
    expect(r).toMatchObject({ ok: true, data: { summary: { created: 2000, errorCount: 0 } } });
    expect(ms).toBeLessThan(30_000);
    expect(await db.item.count({ where: { code: { startsWith: "IT-P0" } } })).toBe(2000);
  });
});
