import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { extractText, getDocumentProxy } from "unpdf";
import { describe, expect, it } from "vitest";
import { PurchaseOrderDocument, fixed, moneyText, type CompanyInfo } from "@/modules/purchase-orders/pdf/document";
import type { OrderSnapshot } from "@/modules/purchase-orders/snapshot";

const NBSP = " ";

const company: CompanyInfo = {
  name: "RICHBOND CI (fictif)",
  address: "Zone industrielle de Yopougon, Abidjan",
  phone: "+225 27 00 00 00 00",
  email: "achats@richbond.test",
  legalIds: "NCC 0000000A – RCCM CI-ABJ-0000-B-00000",
  footer: "Document généré par l'application Achats et Stocks",
  conditions: "Paiement à réception de la facture. Livraison franco magasin.",
};

function snapshot(over: Partial<OrderSnapshot> = {}): OrderSnapshot {
  return {
    schema: 1,
    orderId: "po1",
    number: "BC-2026-00042",
    version: 1,
    type: "LOCAL",
    origin: "DA",
    directReason: null,
    orderDate: "2026-11-05",
    supplier: { id: "s1", code: "FRS-00012", name: "Quincaillerie Générale d'Abidjan", address: "Rue des Garages", city: "Abidjan", country: "CI", phone: "0102030405", email: "vente@qga.test", contact: { name: "M. Koffi", phone: "0708091011", email: null } },
    currencyCode: "XOF",
    currencyDecimals: 0,
    exchangeRate: null,
    rateDate: null,
    paymentTerm: "J30",
    paymentTermNote: null,
    incoterm: null,
    incotermPlace: null,
    warehouse: { id: "w1", code: "MAG1", name: "Magasin principal" },
    deliveryAddress: "Zone industrielle de Yopougon, Abidjan",
    requestedDate: "2026-11-20",
    supplierRef: null,
    notes: "Livraison avant 16 h.",
    internalNote: "NOTE INTERNE SECRETE",
    createdByName: "Acheteur Local",
    lines: [
      { lineNo: 1, itemId: "i1", itemCode: "ART-00012", designation: "Roulement 6205", supplierRef: "RLM-6205", quantity: "10", unit: "U", stockQty: "10", unitPrice: "6500", discountPct: "0", vatRate: "18", netAmount: "65000", lastPriceXof: null, priceDeltaPct: null, note: null, allocations: [] },
      { lineNo: 2, itemId: "i2", itemCode: "ART-00020", designation: "Graisse EP2", supplierRef: null, quantity: "12.5", unit: "KG", stockQty: "12.5", unitPrice: "2400", discountPct: "10", vatRate: "18", netAmount: "27000", lastPriceXof: null, priceDeltaPct: null, note: null, allocations: [] },
    ],
    charges: [{ label: "Transport", amount: "5000", vatRate: "18" }],
    totals: { totalHt: "97000", totalVat: "17460", totalTtc: "114460", chargesTotal: "5000", totalHtXof: 97000, totalTtcXof: 114460, vat: [{ rate: 18, base: "97000", vat: "17460" }] },
    approval: { approvedAt: "2026-11-05T09:30:00.000Z", approvedById: "r1", approvedByName: "M. Dibi (fictif)", autoApproved: false, underThreshold: false },
    ...over,
  };
}

async function textOf(snap: OrderSnapshot, preview = false): Promise<string> {
  const doc = createElement(PurchaseOrderDocument, { snapshot: snap, company, preview }) as unknown as Parameters<typeof renderToBuffer>[0];
  const bytes = await renderToBuffer(doc);
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return text.replace(/ /g, " "); // l'extraction restitue l'espace insécable en espace simple
}

describe("PDF du bon de commande (D28)", () => {
  it("contient le numéro, la date, le fournisseur et le total TTC formaté", async () => {
    const t = await textOf(snapshot());
    expect(t).toContain("BON DE COMMANDE");
    expect(t).toContain("BC-2026-00042");
    expect(t).toContain("05/11/2026");
    expect(t).toContain("Quincaillerie Générale d'Abidjan");
    expect(t).toContain("114 460 FCFA");
    expect(t).toContain("RICHBOND CI (fictif)");
    expect(t).toContain("M. Dibi (fictif)");
    expect(t).not.toContain("NON VALIDÉ");
    expect(t).not.toContain("SECRETE"); // la note interne n'est jamais imprimée
  });

  it("un avenant porte « v2 » et la mention d'avenant", async () => {
    const t = await textOf(snapshot({ version: 2 }));
    expect(t).toContain("BC-2026-00042 v2");
    expect(t).toContain("Avenant");
  });

  it("aperçu : filigrane, aucun numéro, aucune signature", async () => {
    const t = await textOf(snapshot({ number: null, orderDate: null, approval: null }), true);
    expect(t).toContain("NON VALIDÉ");
    expect(t).toContain("NE PAS ENVOYER");
    expect(t).not.toContain("BC-2026");
    expect(t).not.toContain("M. Dibi");
  });

  it("import en devise : total devise, équivalent FCFA au taux figé, incoterm et lieu", async () => {
    const t = await textOf(
      snapshot({
        type: "IMPORT",
        currencyCode: "USD",
        currencyDecimals: 2,
        exchangeRate: "605.25",
        rateDate: "2026-11-04",
        incoterm: "FOB",
        incotermPlace: "Shanghai",
        lines: [{ lineNo: 1, itemId: "i1", itemCode: "ART-00012", designation: "Polyol", supplierRef: null, quantity: "20", unit: "FUT", stockQty: "4000", unitPrice: "249.90", discountPct: "0", vatRate: "0", netAmount: "4998.00", lastPriceXof: null, priceDeltaPct: null, note: null, allocations: [] }],
        charges: [],
        totals: { totalHt: "4998", totalVat: "0", totalTtc: "4998", chargesTotal: "0", totalHtXof: 3_024_990, totalTtcXof: 3_024_990, vat: [{ rate: 0, base: "4998", vat: "0" }] },
      }),
    );
    expect(t).toContain("4 998,00 USD");
    expect(t).toContain("FOB");
    expect(t).toContain("Shanghai");
    expect(t).toContain("605,25");
    expect(t).toContain("3 024 990 FCFA");
  });

  it("nombreuses lignes : plusieurs pages, pagination « Page x/y »", async () => {
    const lines = Array.from({ length: 60 }, (_, i) => ({ lineNo: i + 1, itemId: `i${i}`, itemCode: `ART-${i}`, designation: `Article numéro ${i + 1}`, supplierRef: null, quantity: "1", unit: "U", stockQty: "1", unitPrice: "1000", discountPct: "0", vatRate: "18", netAmount: "1000", lastPriceXof: null, priceDeltaPct: null, note: null, allocations: [] }));
    const t = await textOf(snapshot({ lines }));
    expect(t).toMatch(/Page 1\/[2-9]/);
    expect(t).toContain("Article numéro 60");
  });

  it("formats de nombre : séparateur de milliers insécable, virgule décimale", () => {
    expect(fixed("1250000", 0)).toBe(`1${NBSP}250${NBSP}000`);
    expect(fixed("1250.5", 2)).toBe(`1${NBSP}250,50`);
    expect(moneyText("114460", "XOF", 0)).toBe(`114${NBSP}460${NBSP}FCFA`);
    expect(moneyText("12.3", "EUR", 2)).toBe(`12,30${NBSP}EUR`);
  });
});
