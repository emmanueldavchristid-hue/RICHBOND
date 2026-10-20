import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { cleanTestUsers, createTestUser } from "../helpers/db";
import { IT_PREFIX, cleanReferentials, ensureCurrencies } from "../helpers/referentials";
import { cleanPurchaseRequests } from "../helpers/purchase-requests";
import {
  buyerDashboard,
  dashboardFor,
  responsibleDashboard,
  storekeeperDashboard,
  type BuyerDashboard,
  type ResponsibleDashboard,
  type StorekeeperDashboard,
} from "@/modules/reporting";

const session: { current: { user: { id: string; sessionVersion: number } } | null } = { current: null };
vi.mock("@/lib/auth", () => ({ auth: async () => session.current }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
const { dashboardAction } = await import("@/modules/reporting/actions");

/** Dernière minute d'octobre à Abidjan (changement de mois) : TEST_NOW 31/10 23:59. */
const NOW = new Date("2026-10-31T23:59:00.000Z");
const NOV_1 = new Date("2026-11-01T00:00:00.000Z");
const d = (iso: string) => new Date(iso);

type Actor = { id: string; role: "RESPONSABLE_ACHATS" | "ACHETEUR" | "MAGASINIER" | "SUPER_ADMIN"; purchaseScope: "LOCAL" | "IMPORT" | "ALL" | null };
let resp: Actor;
let buyerA: Actor;
let buyerB: Actor;
let mag: Actor;
let wh: { id: string };
let dept: { id: string };
let s1: { id: string };
let s2: { id: string };
let iCrit: { id: string };
let iA: { id: string };
let iStd: { id: string };
let savedLicenses: Awaited<ReturnType<typeof db.license.findMany>> = [];
let seq = 0;

const toActor = (u: { id: string; role: Actor["role"]; purchaseScope: Actor["purchaseScope"] }): Actor => ({ id: u.id, role: u.role, purchaseScope: u.purchaseScope });

async function mkPo(o: {
  status: "VALIDE" | "ENVOYE" | "CONFIRME" | "PARTIELLEMENT_RECU" | "RECU" | "A_VALIDER" | "ANNULE";
  by: Actor;
  supplier?: { id: string };
  type?: "LOCAL" | "IMPORT";
  approvedAt?: string | null;
  expected?: string;
  amount?: number;
  itemId?: string;
  qty?: number;
  received?: number;
  sentAt?: string | null;
}) {
  seq += 1;
  const expected = d(`${o.expected ?? "2026-12-31"}T00:00:00.000Z`);
  return db.purchaseOrder.create({
    data: {
      number: o.status === "A_VALIDER" ? null : `BC-IT-${String(seq).padStart(5, "0")}`,
      status: o.status,
      type: o.type ?? "LOCAL",
      supplierId: (o.supplier ?? s1).id,
      createdById: o.by.id,
      currencyCode: "XOF",
      paymentTerm: "J30",
      warehouseId: wh.id,
      requestedDate: expected,
      expectedDate: expected,
      totalHtXof: o.amount ?? 0,
      approvedAt: o.approvedAt === undefined ? (o.status === "A_VALIDER" ? null : d("2026-10-01T09:00:00.000Z")) : o.approvedAt ? d(o.approvedAt) : null,
      sentAt: o.sentAt ? d(o.sentAt) : null,
      lines: {
        create: [{ lineNo: 1, itemId: o.itemId ?? iStd.id, quantity: o.qty ?? 10, unit: "U", unitPrice: 100, vatRate: 18, netAmount: 1000, receivedQty: o.received ?? 0 }],
      },
    },
    include: { lines: true },
  });
}

async function mkPr(o: { status: "SOUMISE" | "VALIDEE" | "COMMANDEE"; priority?: number; approvedAt?: string; buyer?: Actor }) {
  seq += 1;
  return db.purchaseRequest.create({
    data: {
      status: o.status,
      priority: o.priority ?? 2,
      urgency: o.priority === 0 ? "ARRET_PRODUCTION" : "NORMALE",
      departmentId: dept.id,
      requesterName: "Demandeur test",
      reason: `DA test dashboard ${seq}`,
      neededBy: d("2026-12-31T00:00:00.000Z"),
      createdById: resp.id,
      approvedAt: o.approvedAt ? d(o.approvedAt) : null,
      assignedBuyerId: o.buyer?.id ?? null,
      lines: { create: [{ lineNo: 1, itemId: iStd.id, quantity: 10, unit: "U" }] },
    },
    include: { lines: true },
  });
}

async function mkReceipt(po: { id: string; supplierId: string; lines: { id: string }[] }, o: { at: string; daysLate: number; status?: "VALIDEE" | "ANNULEE" }) {
  seq += 1;
  return db.receipt.create({
    data: {
      number: `REC-IT-${String(seq).padStart(5, "0")}`,
      status: o.status ?? "VALIDEE",
      orderId: po.id,
      supplierId: po.supplierId,
      warehouseId: wh.id,
      deliveryNoteRef: `BL-${seq}`,
      receivedAt: d(`${o.at}T00:00:00.000Z`),
      referenceDate: d(`${o.at}T00:00:00.000Z`),
      daysLate: o.daysLate,
      createdById: mag.id,
      lines: { create: [{ orderLineId: po.lines[0].id, itemId: iStd.id, deliveredQty: 10, acceptedQty: 10, acceptedStockQty: 10, unitCostXof: 100 }] },
    },
    include: { lines: true },
  });
}

async function mkMovement(o: { itemId: string; type: "ENTREE_RECEPTION" | "SORTIE"; qty: number; value: number; stockAfter: number; at: string }) {
  seq += 1;
  return db.stockMovement.create({
    data: {
      itemId: o.itemId,
      warehouseId: wh.id,
      type: o.type,
      quantity: o.qty,
      unitCost: 1000,
      value: o.value,
      pmpBefore: 1000,
      pmpAfter: 1000,
      stockAfter: o.stockAfter,
      documentType: o.type === "SORTIE" ? "SORTIE" : "RECEPTION",
      documentRef: `DOC-IT-${seq}`,
      occurredAt: d(o.at),
      createdById: mag.id,
    },
  });
}

async function setLicense(status: "TRIAL" | "EXPIRED") {
  await db.license.deleteMany();
  const now = Date.now();
  await db.license.create({ data: { status, trialStartsAt: new Date(now - 60 * 86_400_000), trialEndsAt: new Date(now + (status === "EXPIRED" ? -1 : 10) * 86_400_000) } });
}

async function wipe() {
  await cleanPurchaseRequests(); // BC, réceptions, NC, stock, DA
  await cleanReferentials();
  await cleanTestUsers();
}

async function seedScenario() {
  // Achats d'octobre : 1 500 000 FCFA (2 BC) ; septembre : 1 000 000 FCFA (2 BC). Un BC annulé est exclu.
  const prA = await mkPr({ status: "COMMANDEE", approvedAt: "2026-10-01T09:00:00.000Z" });
  const prB = await mkPr({ status: "COMMANDEE", approvedAt: "2026-10-29T09:00:00.000Z" });
  const prC = await mkPr({ status: "COMMANDEE", approvedAt: "2026-09-04T09:00:00.000Z" });
  const po1 = await mkPo({ status: "PARTIELLEMENT_RECU", by: buyerA, approvedAt: "2026-10-05T09:00:00.000Z", amount: 1_000_000, expected: "2026-11-30", received: 10 });
  const po2 = await mkPo({ status: "CONFIRME", by: buyerB, supplier: s2, type: "IMPORT", approvedAt: "2026-10-31T23:30:00.000Z", amount: 500_000, expected: "2026-12-15" });
  await mkPo({ status: "ANNULE", by: buyerA, approvedAt: "2026-10-10T09:00:00.000Z", amount: 300_000 });
  const po4 = await mkPo({ status: "RECU", by: buyerA, approvedAt: "2026-09-10T09:00:00.000Z", amount: 600_000, received: 10 });
  await mkPo({ status: "RECU", by: buyerB, supplier: s2, type: "IMPORT", approvedAt: "2026-09-30T23:59:00.000Z", amount: 400_000, received: 10 });
  const alloc = (po: { lines: { id: string }[] }, pr: { lines: { id: string }[] }) =>
    db.purchaseOrderLineAllocation.create({ data: { orderLineId: po.lines[0].id, requestLineId: pr.lines[0].id, qty: 10 } });
  await alloc(po1, prA); // 5 - 1 = 4 jours
  await alloc(po2, prB); // 31 - 29 = 2 jours
  await alloc(po4, prC); // 10 - 4 = 6 jours

  // Réceptions : octobre 1 à temps + 1 en retard (+ 1 annulée ignorée), septembre 1 à temps.
  const r1 = await mkReceipt(po1, { at: "2026-10-12", daysLate: 0 }); // 1re réception de po1 : 7 jours
  await mkReceipt(po1, { at: "2026-10-20", daysLate: 8 });
  await mkReceipt(po1, { at: "2026-10-22", daysLate: 0, status: "ANNULEE" });
  await mkReceipt(po4, { at: "2026-09-16", daysLate: 0 }); // 6 jours

  // Non-conformités : 2 ouvertes, 1 clôturée.
  for (const status of ["OUVERTE", "OUVERTE", "CLOTUREE"] as const) {
    seq += 1;
    await db.nonConformity.create({
      data: {
        number: `NC-IT-${String(seq).padStart(5, "0")}`,
        supplierId: s1.id,
        orderId: po1.id,
        receiptId: r1.id,
        receiptLineId: r1.lines[0].id,
        itemId: iStd.id,
        qty: 2,
        reason: "ABIME",
        status,
      },
    });
  }

  // DA à valider (dont un arrêt de production) et DA validées assignées.
  await mkPr({ status: "SOUMISE", priority: 0 });
  await mkPr({ status: "SOUMISE" });
  await mkPr({ status: "VALIDEE", buyer: buyerA, approvedAt: "2026-10-27T09:00:00.000Z" });
  await mkPr({ status: "VALIDEE", buyer: buyerA, approvedAt: "2026-10-28T09:00:00.000Z" });
  await mkPr({ status: "VALIDEE", buyer: buyerB, approvedAt: "2026-10-28T09:00:00.000Z" });

  // BC à valider, à envoyer, en retard, attendus.
  await mkPo({ status: "A_VALIDER", by: buyerA });
  await mkPo({ status: "VALIDE", by: buyerA, approvedAt: "2026-10-30T09:00:00.000Z", amount: 200_000, expected: "2026-12-10" }); // à envoyer (A)
  await mkPo({ status: "VALIDE", by: buyerB, approvedAt: "2026-10-26T09:00:00.000Z", amount: 200_000, expected: "2026-10-30" }); // à envoyer et en retard (B)
  await mkPo({ status: "ENVOYE", by: buyerA, approvedAt: "2026-10-08T09:00:00.000Z", amount: 100_000, expected: "2026-10-25", sentAt: "2026-10-09T10:00:00.000Z" }); // en retard, à relancer (A)
  await mkPo({ status: "CONFIRME", by: buyerB, approvedAt: "2026-10-12T09:00:00.000Z", amount: 100_000, expected: "2026-10-31" }); // attendu aujourd'hui, pas en retard
  await mkPo({ status: "CONFIRME", by: buyerB, approvedAt: "2026-10-12T09:00:00.000Z", amount: 100_000, expected: "2026-11-04" }); // cette semaine
  await mkPo({ status: "PARTIELLEMENT_RECU", by: buyerB, approvedAt: "2026-10-12T09:00:00.000Z", amount: 100_000, expected: "2026-10-31", received: 10 }); // soldé : exclu
  // Livraison prévue pour l'article A (avant sa rupture) : pas de risque.
  await mkPo({ status: "ENVOYE", by: buyerB, approvedAt: "2026-10-15T09:00:00.000Z", amount: 100_000, expected: "2026-11-15", itemId: iA.id, sentAt: "2026-10-16T10:00:00.000Z" });

  // Stock : valeur actuelle 50 000 ; mouvements d'octobre nets +20 000 -> fin septembre 30 000.
  await db.stockLevel.createMany({
    data: [
      { itemId: iCrit.id, warehouseId: wh.id, quantity: 30, pmp: 1000 },
      { itemId: iA.id, warehouseId: wh.id, quantity: 10, pmp: 2000 },
    ],
  });
  await mkMovement({ itemId: iCrit.id, type: "ENTREE_RECEPTION", qty: 40, value: 40_000, stockAfter: 40, at: "2026-10-05T09:00:00.000Z" });
  await mkMovement({ itemId: iCrit.id, type: "SORTIE", qty: -10, value: -10_000, stockAfter: 30, at: "2026-10-20T09:00:00.000Z" });
  await mkMovement({ itemId: iA.id, type: "SORTIE", qty: -5, value: -10_000, stockAfter: 0, at: "2026-10-20T10:00:00.000Z" }); // rupture d'octobre
  await mkMovement({ itemId: iCrit.id, type: "SORTIE", qty: -1, value: 0, stockAfter: 0, at: "2026-09-10T10:00:00.000Z" }); // rupture de septembre
}

beforeAll(async () => {
  savedLicenses = await db.license.findMany();
});

beforeEach(async () => {
  await wipe();
  session.current = null;
  seq = 0;
  await setLicense("TRIAL");
  await ensureCurrencies();
  resp = toActor(await createTestUser("db-resp", { role: "RESPONSABLE_ACHATS" }));
  buyerA = toActor(await createTestUser("db-ach-a", { role: "ACHETEUR", purchaseScope: "ALL" }));
  buyerB = toActor(await createTestUser("db-ach-b", { role: "ACHETEUR", purchaseScope: "ALL" }));
  mag = toActor(await createTestUser("db-mag", { role: "MAGASINIER" }));
  wh = await db.warehouse.create({ data: { code: `${IT_PREFIX}DB-W`, name: "Dépôt dashboard" } });
  dept = await db.department.create({ data: { code: `${IT_PREFIX}DB-D`, name: "Service dashboard" } });
  s1 = await db.supplier.create({ data: { code: `${IT_PREFIX}DB-1`, name: "Fournisseur local test", type: "LOCAL", currencyCode: "XOF", createdById: resp.id } });
  s2 = await db.supplier.create({ data: { code: `${IT_PREFIX}DB-2`, name: "Fournisseur import test", type: "IMPORT", currencyCode: "XOF", createdById: resp.id } });
  iCrit = await db.item.create({ data: { code: `${IT_PREFIX}DB-C`, name: "Article critique test", category: "PDR", stockUnit: "U", purchaseUnit: "U", criticality: "CRITIQUE", reorderPoint: 50, createdById: resp.id } });
  iA = await db.item.create({ data: { code: `${IT_PREFIX}DB-A`, name: "Article classe A test", category: "INTRANT", stockUnit: "U", purchaseUnit: "U", abcClass: "A", createdById: resp.id } });
  iStd = await db.item.create({ data: { code: `${IT_PREFIX}DB-S`, name: "Article standard test", category: "FOURNITURE", stockUnit: "U", purchaseUnit: "U", createdById: resp.id } });
  await seedScenario();
});

afterAll(async () => {
  await wipe();
  await db.license.deleteMany();
  if (savedLicenses.length) await db.license.createMany({ data: savedLicenses });
  await db.$disconnect();
});

const kpi = (dash: ResponsibleDashboard, key: string) => dash.kpis.find((k) => k.key === key)!;
const card = (cards: { key: string; count: number }[], key: string) => cards.find((c) => c.key === key)?.count;

describe("tableau de bord Responsable : KPI sur jeu connu (31/10 23:59 Abidjan)", () => {
  it("montant commandé et nombre de BC : octobre contre septembre complet, annulés exclus, 23:30 le 31 compté en octobre", async () => {
    const dash = await responsibleDashboard(NOW);
    expect(dash.month).toBe("2026-10");
    expect(dash.previousMonth).toBe("2026-09");
    expect(dash.comparedUntil).toBe("2026-10-31");
    const amount = kpi(dash, "montant-commande");
    // Octobre : 1 000 000 + 500 000 (31/10 23:30) + 2 x 200 000 + 5 x 100 000 = 2 400 000 (9 BC) ; septembre : 1 000 000 (2 BC).
    expect(amount.unit).toBe("FCFA");
    expect(Number.isInteger(amount.value)).toBe(true);
    expect(amount.previous).toBe(1_000_000);
    expect(amount.value).toBe(2_400_000);
    expect(amount.variationPct).toBe(140);
    const count = kpi(dash, "nombre-bc");
    expect([count.value, count.previous]).toEqual([9, 2]);
  });

  it("délais DA -> BC et BC -> réception, taux à temps (réceptions annulées ignorées)", async () => {
    const dash = await responsibleDashboard(NOW);
    const da = kpi(dash, "delai-da-bc");
    expect([da.value, da.previous, da.variationPct]).toEqual([3, 6, -50]); // (4+2)/2 contre 6
    const rec = kpi(dash, "delai-bc-reception");
    expect([rec.value, rec.previous]).toEqual([7, 6]);
    const onTime = kpi(dash, "taux-a-temps");
    expect([onTime.value, onTime.previous]).toEqual([50, 100]); // 1 à temps sur 2 reçues ; septembre 1 sur 1
    expect(onTime.goodDirection).toBe("UP");
    expect(kpi(dash, "ruptures").goodDirection).toBe("DOWN");
  });

  it("T3 : valeur du stock actuelle et de fin septembre ; ruptures du mois", async () => {
    const dash = await responsibleDashboard(NOW);
    const stock = kpi(dash, "valeur-stock");
    expect([stock.value, stock.previous]).toEqual([50_000, 30_000]);
    expect(stock.variationPct).toBe(66.7);
    const out = kpi(dash, "ruptures");
    expect([out.value, out.previous]).toEqual([1, 1]);
  });

  it("changement de mois : le 1er novembre 00:00, octobre devient le mois précédent et novembre est vide sans division par zéro", async () => {
    const dash = await responsibleDashboard(NOV_1);
    expect(dash.month).toBe("2026-11");
    expect(dash.comparedUntil).toBe("2026-11-01");
    const amount = kpi(dash, "montant-commande");
    expect([amount.value, amount.previous, amount.variationPct]).toEqual([0, 0, null]);
    const da = kpi(dash, "delai-da-bc");
    expect([da.value, da.previous, da.variationPct]).toEqual([null, null, null]); // « – »
    expect(kpi(dash, "taux-a-temps").value).toBeNull();
    // Le BC de 23:30 le 31/10 est bien en octobre dans la série mensuelle.
    const oct = dash.purchasesByMonth.find((m) => m.month === "2026-10")!;
    expect(oct.importXof).toBe(500_000 + 0); // seul BC import validé d'octobre
    expect(dash.purchasesByMonth.find((m) => m.month === "2026-11")!.totalXof).toBe(0);
  });

  it("séries : 12 mois dont les mois vides, local contre import, top fournisseurs, stock par catégorie", async () => {
    const dash = await responsibleDashboard(NOW);
    expect(dash.purchasesByMonth).toHaveLength(12);
    expect(dash.purchasesByMonth[0].month).toBe("2025-11");
    expect(dash.purchasesByMonth[11].month).toBe("2026-10");
    const sep = dash.purchasesByMonth.find((m) => m.month === "2026-09")!;
    expect([sep.localXof, sep.importXof, sep.totalXof]).toEqual([600_000, 400_000, 1_000_000]);
    expect(dash.purchasesByMonth.filter((m) => m.totalXof === 0).length).toBe(10);
    expect(dash.topSuppliers.length).toBeLessThanOrEqual(10);
    expect(dash.topSuppliers[0].amountXof).toBeGreaterThanOrEqual(dash.topSuppliers[dash.topSuppliers.length - 1].amountXof);
    expect(dash.topSuppliers.reduce((s, t) => s + t.sharePct, 0)).toBeGreaterThan(99);
    expect(dash.stockByCategory.map((c) => [c.category, c.valueXof]).sort()).toEqual([["INTRANT", 20_000], ["PDR", 30_000]]);
  });

  it("cartes à traiter : DA, BC à valider, BC en retard, risques de rupture, NC ouvertes", async () => {
    const dash = await responsibleDashboard(NOW);
    expect(card(dash.cards, "da-a-valider")).toBe(2);
    expect(dash.cards.find((c) => c.key === "da-a-valider")!.hint).toBe("dont 1 arrêt de production");
    expect(card(dash.cards, "bc-a-valider")).toBe(1);
    expect(card(dash.cards, "bc-en-retard")).toBe(2); // ENVOYE du 25/10 et VALIDE du 30/10 ; celui du 31/10 n'est pas en retard
    expect(card(dash.cards, "nc-ouvertes")).toBe(2);
    expect(dash.cards.every((c) => c.href.startsWith("/"))).toBe(true);
  });

  it("T6 : le jour attendu devient en retard à minuit", async () => {
    const dash = await responsibleDashboard(NOV_1);
    expect(card(dash.cards, "bc-en-retard")).toBe(4);
  });

  it("T4 : risques de rupture = classe A ou critique, hors article avec livraison prévue avant la rupture", async () => {
    const dash = await responsibleDashboard(NOW);
    const codes = dash.ruptureRisks.rows.map((r) => r.code);
    expect(codes).toContain(`${IT_PREFIX}DB-C`); // critique, consommation, aucune livraison
    expect(codes).not.toContain(`${IT_PREFIX}DB-A`); // livraison prévue le 15/11, rupture bien plus tard
    expect(codes).not.toContain(`${IT_PREFIX}DB-S`); // ni A ni critique
    expect(dash.ruptureRisks.total).toBe(1);
    expect(card(dash.cards, "risques-rupture")).toBe(1);
    expect(dash.ruptureRisks.rows[0].nextDeliveryDate).toBeNull();
  });

  it("réponse entièrement sérialisable en JSON (dates ISO, entiers pour les montants)", async () => {
    const dash = await responsibleDashboard(NOW);
    expect(JSON.parse(JSON.stringify(dash))).toEqual(dash);
    for (const k of dash.kpis.filter((x) => x.unit === "FCFA")) expect(Number.isInteger(k.value)).toBe(true);
  });
});

describe("tableau de bord Acheteur : uniquement ses DA et ses BC", () => {
  it("acheteur A : ses 2 DA assignées, son BC à envoyer, son BC en retard à relancer", async () => {
    const dash = await buyerDashboard(buyerA, NOW);
    expect(dash.kind).toBe("ACHETEUR");
    expect(dash.myRequests.total).toBe(2);
    expect(dash.ordersToSend.total).toBe(1);
    expect(dash.lateOrders.total).toBe(1);
    expect(dash.lateOrders.rows[0].daysLate).toBe(6);
    expect(dash.ordersToRemind.total).toBe(1);
    expect(dash.ordersToRemind.rows[0].needsReminder).toBe(true);
    expect(dash.ordersToRemind.rows[0].updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(card(dash.cards, "mes-da")).toBe(2);
    expect(card(dash.cards, "mes-bc-a-relancer")).toBe(1);
  });

  it("acheteur B : ne voit ni les DA ni les BC de A", async () => {
    const a = await buyerDashboard(buyerA, NOW);
    const b = await buyerDashboard(buyerB, NOW);
    expect(b.myRequests.total).toBe(1);
    expect(b.ordersToSend.total).toBe(1);
    expect(b.lateOrders.total).toBe(1);
    expect(b.ordersToRemind.total).toBe(1); // son BC envoyé le 16/10 et jamais confirmé ; son BC en retard n'est que « validé » (pas encore envoyé)
    const idsA = new Set([...a.ordersToSend.rows, ...a.lateOrders.rows, ...a.ordersToRemind.rows].map((r) => r.id));
    const idsB = [...b.ordersToSend.rows, ...b.lateOrders.rows, ...b.ordersToRemind.rows].map((r) => r.id);
    expect(idsB.some((id) => idsA.has(id))).toBe(false);
    const reqA = new Set(a.myRequests.rows.map((r) => r.id));
    expect(b.myRequests.rows.some((r) => reqA.has(r.id))).toBe(false);
  });

  it("les listes sont plafonnées (jamais de liste complète) mais le total reste exact", async () => {
    for (let i = 0; i < 12; i += 1) await mkPr({ status: "VALIDEE", buyer: buyerA, approvedAt: "2026-10-28T09:00:00.000Z" });
    const dash: BuyerDashboard = await buyerDashboard(buyerA, NOW);
    expect(dash.myRequests.total).toBe(14);
    expect(dash.myRequests.rows.length).toBeLessThanOrEqual(10);
  });
});

describe("tableau de bord Magasinier : aucun montant", () => {
  it("réceptions attendues aujourd'hui / cette semaine / en retard, articles sous le point de commande", async () => {
    // La base de test partagée contient les articles du seed (point de commande renseigné, stock vide) : on les écarte le temps du test.
    const others = await db.item.findMany({ where: { code: { not: { startsWith: IT_PREFIX } }, status: "ACTIF" }, select: { id: true } });
    await db.item.updateMany({ where: { id: { in: others.map((i) => i.id) } }, data: { status: "BLOQUE" } });
    let dash: StorekeeperDashboard;
    try {
      dash = await storekeeperDashboard(mag, NOW);
    } finally {
      await db.item.updateMany({ where: { id: { in: others.map((i) => i.id) } }, data: { status: "ACTIF" } });
    }
    expect(dash.kind).toBe("MAGASINIER");
    expect(dash.expectedToday.total).toBe(1); // le BC soldé du 31/10 est exclu
    expect(dash.expectedThisWeek.total).toBe(1);
    expect(card(dash.cards, "livraisons-retard")).toBe(1); // le BC envoyé du 25/10 ; le BC « validé » du 30/10 n'est pas encore envoyé
    expect(dash.belowReorder.total).toBe(1);
    expect(dash.belowReorder.rows[0].code).toBe(`${IT_PREFIX}DB-C`);
  });

  it("aucun champ monétaire dans la réponse (ni valeur, ni PMP, ni prix, ni FCFA)", async () => {
    const dash = await storekeeperDashboard(mag, NOW);
    const keys: string[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") {
        for (const [k, x] of Object.entries(v)) {
          keys.push(k);
          walk(x);
        }
      }
    };
    walk(dash);
    expect(keys.filter((k) => /xof|amount|price|prix|pmp|cost|value|montant|fcfa|ttc|ht$/i.test(k))).toEqual([]);
    expect(JSON.stringify(dash)).not.toMatch(/XOF|FCFA/);
  });

  it("dernières sorties : au plus 10, les plus récentes d'abord", async () => {
    for (let i = 1; i <= 12; i += 1) {
      await db.stockIssue.create({
        data: {
          number: `SOR-IT-${String(i).padStart(5, "0")}`,
          warehouseId: wh.id,
          departmentId: dept.id,
          requesterName: "Chef d'équipe",
          reason: "Maintenance",
          issuedAt: d(`2026-10-${String(i).padStart(2, "0")}T00:00:00.000Z`),
          createdById: mag.id,
        },
      });
    }
    const dash = await storekeeperDashboard(mag, NOW);
    expect(dash.recentIssues).toHaveLength(10);
    expect(dash.recentIssues[0].number).toBe("SOR-IT-00012");
    expect(dash.recentIssues[0].issuedAt).toBe("2026-10-12");
    await db.stockIssue.deleteMany({ where: { number: { startsWith: "SOR-IT-" } } });
  });
});

describe("aiguillage et droits", () => {
  it("dashboardFor choisit le tableau du rôle", async () => {
    expect((await dashboardFor(resp, NOW)).kind).toBe("RESPONSABLE");
    expect((await dashboardFor(buyerA, NOW)).kind).toBe("ACHETEUR");
    expect((await dashboardFor(mag, NOW)).kind).toBe("MAGASINIER");
  });

  it("l'action renvoie le tableau du rôle connecté, même quand l'essai est expiré (lecture seule)", async () => {
    await setLicense("EXPIRED");
    const user = await db.user.findUniqueOrThrow({ where: { id: mag.id } });
    session.current = { user: { id: user.id, sessionVersion: user.sessionVersion } };
    const res = await dashboardAction({});
    expect(res.ok).toBe(true);
    if (res.ok) expect((res.data as StorekeeperDashboard).kind).toBe("MAGASINIER");
    const r = await db.user.findUniqueOrThrow({ where: { id: resp.id } });
    session.current = { user: { id: r.id, sessionVersion: r.sessionVersion } };
    const res2 = await dashboardAction({});
    expect(res2.ok && (res2.data as ResponsibleDashboard).kind).toBe("RESPONSABLE");
  });

  it("sans session : refus", async () => {
    session.current = null;
    const res = await dashboardAction({});
    expect(res.ok).toBe(false);
  });
});
