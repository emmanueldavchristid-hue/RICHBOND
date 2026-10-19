import ExcelJS from "exceljs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { cleanTestUsers, createTestUser } from "../helpers/db";
import { cleanReferentials, ensureCurrencies } from "../helpers/referentials";

const session: { current: { user: { id: string; sessionVersion: number } } | null } = { current: null };
vi.mock("@/lib/auth", () => ({ auth: async () => session.current }));

const { GET } = await import("@/app/api/export/[entity]/route");
const { createItem } = await import("@/modules/items");
const { createSupplier } = await import("@/modules/suppliers");

async function login(key: string, role: "ACHETEUR" | "MAGASINIER") {
  const u = await createTestUser(key, { role, purchaseScope: role === "ACHETEUR" ? "ALL" : null });
  session.current = { user: { id: u.id, sessionVersion: u.sessionVersion } };
  return u;
}

const call = (entity: string, qs = "") =>
  GET(new NextRequest(`http://localhost/api/export/${entity}${qs}`), { params: Promise.resolve({ entity }) });

async function rowsOf(res: Response) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as never);
  const ws = wb.worksheets[0];
  const out: string[][] = [];
  ws.eachRow((row) => out.push((row.values as unknown[]).slice(1).map((v) => (v == null ? "" : String(v)))));
  return out;
}

let savedLicenses: Awaited<ReturnType<typeof db.license.findMany>> = [];

beforeEach(async () => {
  await cleanReferentials();
  await cleanTestUsers();
  await ensureCurrencies();
  session.current = null;
  if (savedLicenses.length === 0) savedLicenses = await db.license.findMany();
  await db.license.deleteMany();
  await db.license.create({
    data: { status: "EXPIRED", trialStartsAt: new Date(Date.now() - 60 * 86_400_000), trialEndsAt: new Date(Date.now() - 86_400_000) },
  });
});
afterAll(async () => {
  await cleanReferentials();
  await cleanTestUsers();
  await db.license.deleteMany();
  if (savedLicenses.length) await db.license.createMany({ data: savedLicenses });
  await db.$disconnect();
});

describe("export Excel (R18)", () => {
  it("refuse sans session (401)", async () => {
    expect((await call("articles")).status).toBe(401);
  });

  it("essai expiré : export autorisé ; lignes = filtre ; pas de colonne de prix", async () => {
    const u = await login("x1", "ACHETEUR");
    const actor = { id: u.id, role: u.role };
    for (let i = 1; i <= 3; i++) {
      await createItem(actor, { code: `IT-X${i}`, name: `Export EXPX ${i}`, category: i === 3 ? "INTRANT" : "PDR", stockUnit: "U", purchaseUnit: "U" } as never);
    }
    const res = await call("articles", "?q=EXPX&categorie=PDR");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/articles_\d{8}\.xlsx/);
    const rows = await rowsOf(res);
    expect(rows).toHaveLength(3); // en-tête + 2 lignes
    expect(rows[0].join("|")).not.toMatch(/prix/i);
    expect(rows.slice(1).map((r) => r[0]).sort()).toEqual(["IT-X1", "IT-X2"]);
  });

  it("fournisseurs : colonnes et filtre par défaut (bloqués exclus)", async () => {
    const u = await login("x2", "ACHETEUR");
    await createSupplier({ id: u.id, role: u.role }, { code: "IT-XS1", name: "Fournisseur EXPS", type: "LOCAL", currencyCode: "XOF" } as never);
    const rows = await rowsOf(await call("fournisseurs", "?q=EXPS"));
    expect(rows[0]).toContain("Raison sociale");
    expect(rows).toHaveLength(2);
  });

  it("Magasinier : articles oui, fournisseurs non ; filtre invalide => 400 ; entité inconnue => 404", async () => {
    await login("x3", "MAGASINIER");
    expect((await call("articles")).status).toBe(200);
    expect((await call("fournisseurs")).status).toBe(403);
    expect((await call("articles", "?taille=7")).status).toBe(400);
    expect((await call("clients")).status).toBe(404);
  });
});
