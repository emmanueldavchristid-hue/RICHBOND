import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { currentYear, todayAbidjan } from "@/lib/dates";
import { cleanTestUsers, createTestUser } from "../helpers/db";
import { IT_PREFIX, cleanReferentials, ensureCurrencies } from "../helpers/referentials";
import { cleanPurchaseOrders } from "../helpers/purchase-orders";
import { createReceipt } from "@/modules/receiving";
import {
  approvePayment,
  cancelInvoice,
  createInvoice,
  dueSchedule,
  invoiceDiscrepancyRows,
  listInvoiceableReceipts,
  listInvoices,
  markLitige,
  markTransmitted,
  rematchInvoice,
  resolveLitige,
  updateInvoice,
} from "@/modules/invoices";
import type { OrderActor } from "@/modules/purchase-orders";

const session: { current: { user: { id: string; sessionVersion: number } } | null } = { current: null };
vi.mock("@/lib/auth", () => ({ auth: async () => session.current }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/modules/auth/ip", () => ({ getClientIp: async () => "127.0.0.1" }));
const actions = await import("@/app/(app)/achats/factures/actions");

let resp: OrderActor;
let ach: OrderActor;
let mag: OrderActor;
let sessions: Record<string, { id: string; sessionVersion: number }> = {};
let wh: { id: string };
let item: { id: string };
let supplier: { id: string };
let savedLicenses: Awaited<ReturnType<typeof db.license.findMany>> = [];

const toActor = (u: { id: string; role: OrderActor["role"]; purchaseScope: OrderActor["purchaseScope"] }): OrderActor => ({ id: u.id, role: u.role, purchaseScope: u.purchaseScope });
const today = () => todayAbidjan(new Date());
const dayOffset = (n: number) => new Date(`${today()}T00:00:00.000Z`).getTime() + n * 86_400_000;
const isoOffset = (n: number) => new Date(dayOffset(n)).toISOString().slice(0, 10);

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "OK";
  } catch (e) {
    return (e as { code?: string }).code ?? `ERR:${(e as Error).message}`;
  }
}

let seq = 0;
/** BC local confirmé, une ligne de `qty` cartons à 10 000 FCFA, TVA 18 %, paiement 30 jours ; réception de `received` cartons. */
async function makeOrder(o: { qty?: number; received?: number } = {}) {
  const qty = o.qty ?? 10;
  seq += 1;
  const po = await db.purchaseOrder.create({
    data: {
      number: `BC-${currentYear()}-8${String(seq).padStart(4, "0")}`,
      status: "CONFIRME",
      sentAt: new Date(),
      confirmedAt: new Date(),
      type: "LOCAL",
      origin: "DIRECT",
      supplierId: supplier.id,
      createdById: ach.id,
      currencyCode: "XOF",
      paymentTerm: "J30",
      warehouseId: wh.id,
      deliveryAddress: "Zone industrielle, Abidjan",
      requestedDate: new Date(dayOffset(-5)),
      expectedDate: new Date(dayOffset(-5)),
      lines: { create: [{ lineNo: 1, itemId: item.id, quantity: qty, unit: "CARTON", stockQty: qty * 10, unitPrice: 10000, vatRate: 18, netAmount: qty * 10000 }] },
    },
    include: { lines: true },
  });
  const lineId = po.lines[0].id;
  const received = o.received ?? qty;
  if (received > 0) {
    await createReceipt(mag, { orderId: po.id, deliveryNoteRef: "BL-IT", receivedAt: today(), lines: [{ orderLineId: lineId, deliveredQty: received, acceptedQty: received }] });
  }
  return { id: po.id, lineId };
}

let invSeq = 0;
const invoiceInput = (lineId: string, qty: number, price = 10000, extra: Record<string, unknown> = {}) => {
  invSeq += 1;
  return { supplierId: supplier.id, supplierInvoiceNo: `FA-${invSeq}`, invoiceDate: today(), lines: [{ orderLineId: lineId, quantity: qty, unitPrice: price }], ...extra };
};
const orderOf = (id: string) => db.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { lines: true } });

async function setLicense(status: "TRIAL" | "EXPIRED") {
  await db.license.deleteMany();
  const n = Date.now();
  await db.license.create({ data: { status, trialStartsAt: new Date(n - 60 * 86_400_000), trialEndsAt: new Date(n + (status === "EXPIRED" ? -1 : 10) * 86_400_000) } });
}

async function wipe() {
  await cleanPurchaseOrders();
  await cleanReferentials();
  await cleanTestUsers();
  await db.setting.deleteMany({ where: { key: { startsWith: "invoice." } } });
}

beforeAll(async () => {
  savedLicenses = await db.license.findMany();
});

beforeEach(async () => {
  await wipe();
  await setLicense("TRIAL");
  await ensureCurrencies();
  const r = await createTestUser("in-resp", { role: "RESPONSABLE_ACHATS" });
  const a = await createTestUser("in-ach", { role: "ACHETEUR", purchaseScope: "ALL" });
  const m = await createTestUser("in-mag", { role: "MAGASINIER" });
  resp = toActor(r);
  ach = toActor(a);
  mag = toActor(m);
  sessions = { resp: r, ach: a, mag: m };
  session.current = null;
  wh = await db.warehouse.create({ data: { code: `${IT_PREFIX}IN-WH`, name: "Dépôt facture test" } });
  item = await db.item.create({ data: { code: `${IT_PREFIX}IN-A`, name: "Roulement test facture", category: "PDR", stockUnit: "U", purchaseUnit: "CARTON", conversionFactor: 10 } });
  supplier = await db.supplier.create({ data: { code: `${IT_PREFIX}IN-S`, name: "Fournisseur facture test", type: "LOCAL", currencyCode: "XOF", paymentTerm: "J30" } });
});

afterAll(async () => {
  await wipe();
  await db.license.deleteMany();
  if (savedLicenses.length) await db.license.createMany({ data: savedLicenses });
  await db.$disconnect();
});

describe("saisie et rapprochement", () => {
  it("facture conforme : numéro, montants, échéance, BC clôturé, audit et notification", async () => {
    const { id, lineId } = await makeOrder();
    const r = await createInvoice(ach, invoiceInput(lineId, 10));
    expect(r.number).toBe(`FAC-${currentYear()}-00001`);
    expect(r.status).toBe("CONFORME");
    expect(r.closedOrders).toHaveLength(1);
    const inv = await db.supplierInvoice.findUniqueOrThrow({ where: { id: r.id }, include: { lines: true } });
    expect([inv.totalHt.toString(), inv.totalVat.toString(), inv.totalTtc.toString(), inv.totalTtcXof]).toEqual(["100000", "18000", "118000", 118000]);
    expect(inv.dueDate.toISOString().slice(0, 10)).toBe(isoOffset(30));
    expect(inv.matchedAt).not.toBeNull();
    expect(inv.lines[0].match).toBe("CONFORME");
    const po = await orderOf(id);
    expect(po.lines[0].invoicedQty.toString()).toBe("10");
    expect(po.status).toBe("CLOTURE");
    expect(await db.auditLog.count({ where: { entity: "SupplierInvoice", action: "INVOICE_CREATE" } })).toBe(1);
    expect(await db.notification.count({ where: { recipientId: resp.id, type: "INVOICE_TO_APPROVE" } })).toBe(1);
  });

  it("écart de prix au-delà de la tolérance, toléré en dessous", async () => {
    const a = await makeOrder();
    const gap = await createInvoice(ach, invoiceInput(a.lineId, 10, 10500));
    expect(gap.status).toBe("ECART");
    expect(gap.lineMatches).toEqual(["ECART_PRIX"]);
    expect(await db.notification.count({ where: { recipientId: resp.id, type: "INVOICE_GAP" } })).toBe(1);
    const b = await makeOrder();
    expect((await createInvoice(ach, invoiceInput(b.lineId, 10, 10050))).status).toBe("CONFORME");
  });

  it("écart de quantité : facturé > reçu", async () => {
    const { lineId } = await makeOrder({ qty: 10, received: 6 });
    const r = await createInvoice(ach, invoiceInput(lineId, 8));
    expect(r.status).toBe("ECART");
    const line = await db.supplierInvoiceLine.findFirstOrThrow({ where: { invoiceId: r.id } });
    expect(line.match).toBe("ECART_QTE");
    expect(line.matchQtyDelta?.toString()).toBe("2");
    expect(line.matchReceivedQty?.toString()).toBe("6");
  });

  it("facturation partielle puis complément : le BC n'est clôturé qu'à la dernière facture", async () => {
    const { id, lineId } = await makeOrder();
    const f1 = await createInvoice(ach, invoiceInput(lineId, 4));
    expect(f1.status).toBe("CONFORME");
    expect((await orderOf(id)).status).toBe("RECU");
    const f2 = await createInvoice(ach, invoiceInput(lineId, 6));
    expect(f2.status).toBe("CONFORME");
    expect((await orderOf(id)).status).toBe("CLOTURE");
    const f3 = await createInvoice(ach, invoiceInput(lineId, 1));
    expect(f3.status).toBe("ECART");
  });

  it("pré-remplissage : ne propose que le reçu non encore facturé", async () => {
    const { lineId } = await makeOrder();
    await createInvoice(ach, invoiceInput(lineId, 4));
    const rows = await listInvoiceableReceipts(ach, { supplierId: supplier.id });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ orderLineId: lineId, billableQty: "6", poPrice: "10000" });
  });

  it("refuse une facture en double (casse et espaces ignorés), y compris en parallèle", async () => {
    const { lineId } = await makeOrder({ qty: 100 });
    await createInvoice(ach, invoiceInput(lineId, 1, 10000, { supplierInvoiceNo: "fa 001" }));
    expect(await code(createInvoice(ach, invoiceInput(lineId, 1, 10000, { supplierInvoiceNo: "FA001" })))).toBe("FACTURE_EN_DOUBLE");
    const results = await Promise.all([1, 2, 3].map(() => code(createInvoice(ach, invoiceInput(lineId, 1, 10000, { supplierInvoiceNo: "PAR-1" })))));
    expect(results.filter((r) => r === "OK")).toHaveLength(1);
    expect(results.filter((r) => r === "FACTURE_EN_DOUBLE")).toHaveLength(2);
    expect(await db.supplierInvoice.count({ where: { supplierInvoiceNo: "PAR-1" } })).toBe(1);
  });

  it("deux factures simultanées ne dépassent pas le facturable : une seule est conforme", async () => {
    const { lineId } = await makeOrder({ qty: 10, received: 10 });
    const out = await Promise.all([createInvoice(ach, invoiceInput(lineId, 7)), createInvoice(ach, invoiceInput(lineId, 7))]);
    expect(out.map((o) => o.status).sort()).toEqual(["CONFORME", "ECART"]);
  });

  it("refuse un autre fournisseur, une devise différente, un BC sans réception", async () => {
    const { lineId } = await makeOrder();
    const other = await db.supplier.create({ data: { code: `${IT_PREFIX}IN-S2`, name: "Autre fournisseur", type: "LOCAL", currencyCode: "XOF" } });
    expect(await code(createInvoice(ach, { ...invoiceInput(lineId, 1), supplierId: other.id }))).toBe("FACTURE_AUTRE_FOURNISSEUR");
    expect(await code(createInvoice(ach, invoiceInput(lineId, 1, 10000, { currencyCode: "EUR" })))).toBe("FACTURE_DEVISE");
    const none = await makeOrder({ received: 0 });
    expect(await code(createInvoice(ach, invoiceInput(none.lineId, 1)))).toBe("BC_NON_FACTURABLE");
  });

  it("tolérances paramétrables", async () => {
    await db.setting.create({ data: { key: "invoice.priceTolerancePct", value: 10 } });
    await db.setting.create({ data: { key: "invoice.qtyTolerance", value: 1 } });
    const { lineId } = await makeOrder({ qty: 10, received: 10 });
    const r = await createInvoice(ach, invoiceInput(lineId, 11, 10900));
    expect(r.status).toBe("CONFORME");
  });
});

describe("workflow de la facture", () => {
  it("bon à payer réservé au Responsable, motif obligatoire sur un écart, puis transmission", async () => {
    const a = await makeOrder();
    const conforme = await createInvoice(ach, invoiceInput(a.lineId, 10));
    expect(await code(approvePayment(ach, { id: conforme.id }))).toBe("FORBIDDEN");
    expect((await approvePayment(resp, { id: conforme.id })).status).toBe("BON_A_PAYER");
    const b = await makeOrder();
    const gap = await createInvoice(ach, invoiceInput(b.lineId, 10, 11000));
    expect(gap.status).toBe("ECART");
    expect(await code(approvePayment(resp, { id: gap.id }))).toBe("FACTURE_ECART_MOTIF");
    expect((await approvePayment(resp, { id: gap.id, derogationReason: "Hausse du prix acceptée par M. DIBI" })).status).toBe("BON_A_PAYER");
    expect((await markTransmitted(ach, { id: gap.id })).status).toBe("TRANSMISE");
    expect(await code(cancelInvoice(resp, { id: gap.id, reason: "Trop tard pour annuler" }))).toBe("INVALID_STATUS");
    expect(await code(markTransmitted(ach, { id: gap.id }))).toBe("INVALID_STATUS");
  });

  it("litige puis reprise avec nouveau rapprochement ; modification d'une facture en écart", async () => {
    const { lineId } = await makeOrder();
    const gap = await createInvoice(ach, invoiceInput(lineId, 10, 11000));
    expect(await code(markLitige(ach, { id: gap.id, reason: "x" }))).toBe("VALIDATION");
    expect((await markLitige(ach, { id: gap.id, reason: "Prix non conforme au devis" })).status).toBe("LITIGE");
    expect(await code(approvePayment(resp, { id: gap.id, derogationReason: "Motif quelconque" }))).toBe("INVALID_STATUS");
    expect((await resolveLitige(ach, { id: gap.id })).status).toBe("ECART");
    const inv = await db.supplierInvoice.findUniqueOrThrow({ where: { id: gap.id } });
    const fixed = await updateInvoice(ach, { id: gap.id, supplierInvoiceNo: inv.supplierInvoiceNo, invoiceDate: today(), lines: [{ orderLineId: lineId, quantity: 10, unitPrice: 10000 }] });
    expect(fixed.status).toBe("CONFORME");
    expect((await rematchInvoice(ach, { id: gap.id })).status).toBe("CONFORME");
  });

  it("annulation : libère les quantités, rouvre le BC clôturé, libère le n° fournisseur", async () => {
    const { id, lineId } = await makeOrder();
    const input = invoiceInput(lineId, 10);
    const f = await createInvoice(ach, input);
    expect((await orderOf(id)).status).toBe("CLOTURE");
    const c = await cancelInvoice(ach, { id: f.id, reason: "Facture saisie par erreur" });
    expect(c.reopenedOrders).toHaveLength(1);
    const po = await orderOf(id);
    expect(po.status).toBe("RECU");
    expect(po.lines[0].invoicedQty.toString()).toBe("0");
    expect(await code(createInvoice(ach, input))).toBe("OK");
    expect(await db.auditLog.count({ where: { action: "INVOICE_CANCEL", entityId: f.id } })).toBe(1);
  });

  it("seul le créateur ou le Responsable annule", async () => {
    const { lineId } = await makeOrder();
    const f = await createInvoice(ach, invoiceInput(lineId, 10));
    const ach2 = toActor(await createTestUser("in-ach2", { role: "ACHETEUR", purchaseScope: "ALL" }));
    expect(await code(cancelInvoice(ach2, { id: f.id, reason: "Pas mon dossier" }))).toBe("FORBIDDEN");
    expect(await code(cancelInvoice(resp, { id: f.id, reason: "Annulation Responsable" }))).toBe("OK");
  });
});

describe("accès, licence, échéancier, export", () => {
  it("le Magasinier n'a aucun accès aux factures", async () => {
    const { lineId } = await makeOrder();
    expect(await code(createInvoice(mag, invoiceInput(lineId, 1)))).toBe("FORBIDDEN");
    expect(await code(listInvoices(mag, {}))).toBe("FORBIDDEN");
    session.current = { user: sessions.mag };
    expect(await actions.listInvoicesAction({})).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("essai expiré : écriture refusée (LICENSE_READ_ONLY), lecture permise", async () => {
    const { lineId } = await makeOrder();
    const f = await createInvoice(ach, invoiceInput(lineId, 10));
    await setLicense("EXPIRED");
    session.current = { user: sessions.ach };
    expect(await actions.createInvoiceAction(invoiceInput(lineId, 1))).toMatchObject({ ok: false, code: "LICENSE_READ_ONLY" });
    session.current = { user: sessions.resp };
    expect(await actions.approvePaymentAction({ id: f.id })).toMatchObject({ ok: false, code: "LICENSE_READ_ONLY" });
    expect(await actions.listInvoicesAction({})).toMatchObject({ ok: true });
    await setLicense("TRIAL");
    expect(await actions.approvePaymentAction({ id: f.id })).toMatchObject({ ok: true });
  });

  it("échéancier (retard, semaine, mois) et lignes d'écart exportables", async () => {
    const a = await makeOrder();
    const late = await createInvoice(ach, invoiceInput(a.lineId, 5, 10000, { invoiceDate: isoOffset(-60) }));
    const b = await makeOrder();
    const soon = await createInvoice(ach, invoiceInput(b.lineId, 5, 10800, { dueDate: isoOffset(2) }));
    const sched = await dueSchedule(ach);
    expect(sched.late.items.map((i) => i.id)).toContain(late.id);
    expect(sched.late.items.find((i) => i.id === late.id)?.daysOverdue).toBeGreaterThan(0);
    expect(sched.week.items.map((i) => i.id)).toContain(soon.id);
    expect(sched.week.totalXof).toBe(63720);
    const rows = await invoiceDiscrepancyRows(resp, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ invoiceNumber: soon.number, match: "ECART_PRIX", priceDeltaPct: 8, poPrice: 10000, invoicePrice: 10800 });
    const list = await listInvoices(resp, { onglet: "ecarts" });
    expect(list.total).toBe(1);
    expect(list.counts["a-traiter"]).toBe(1);
  });
});
