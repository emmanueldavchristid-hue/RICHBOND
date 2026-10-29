import { describe, expect, it } from "vitest";
import {
  computeDueDate,
  invoiceStatusFromLines,
  isOrderFullyInvoiced,
  matchLine,
  normalizeSupplierInvoiceNo,
} from "@/modules/invoices/rules";

describe("échéance", () => {
  it("applique les conditions de paiement", () => {
    expect(computeDueDate("2026-03-10", "COMPTANT")).toBe("2026-03-10");
    expect(computeDueDate("2026-03-10", "J30")).toBe("2026-04-09");
    expect(computeDueDate("2026-03-10", "J45")).toBe("2026-04-24");
    expect(computeDueDate("2026-03-10", "J60")).toBe("2026-05-09");
    expect(computeDueDate("2026-03-10", "J90")).toBe("2026-06-08");
  });
  it("fin de mois + 30 jours, y compris en février et en fin d'année", () => {
    expect(computeDueDate("2026-03-10", "FIN_DE_MOIS_30")).toBe("2026-04-30");
    expect(computeDueDate("2026-02-03", "FIN_DE_MOIS_30")).toBe("2026-03-30");
    expect(computeDueDate("2026-12-15", "FIN_DE_MOIS_30")).toBe("2027-01-30");
  });
  it("AUTRE : 30 jours par défaut, sinon les jours de la précision", () => {
    expect(computeDueDate("2026-03-10", "AUTRE")).toBe("2026-04-09");
    expect(computeDueDate("2026-03-10", "AUTRE", "15 jours après livraison")).toBe("2026-03-25");
    expect(computeDueDate(new Date("2026-03-10T00:00:00Z"), "J30")).toBe("2026-04-09");
  });
});

describe("rapprochement d'une ligne", () => {
  const base = { invoicedQty: 10, invoicePrice: 1000, poPrice: 1000, receivedAcceptedQty: 10, alreadyInvoicedElsewhere: 0 };
  const tol = { pricePct: 1, qty: 0 };

  it("conforme", () => {
    expect(matchLine(base, tol)).toMatchObject({ match: "CONFORME", priceDeltaPct: 0, qtyDelta: 0 });
  });
  it("prix : écart au-delà de 1 %, toléré en dessous", () => {
    expect(matchLine({ ...base, invoicePrice: 1010 }, tol).match).toBe("CONFORME");
    const r = matchLine({ ...base, invoicePrice: 1050 }, tol);
    expect(r).toMatchObject({ match: "ECART_PRIX", priceDeltaPct: 5 });
    expect(matchLine({ ...base, invoicePrice: 950 }, tol).match).toBe("ECART_PRIX");
  });
  it("quantité : écart si facturé > facturable + tolérance", () => {
    expect(matchLine({ ...base, invoicedQty: 11 }, tol)).toMatchObject({ match: "ECART_QTE", qtyDelta: 1 });
    expect(matchLine({ ...base, invoicedQty: 11 }, { pricePct: 1, qty: 1 }).match).toBe("CONFORME");
  });
  it("facturation partielle = conforme ; le déjà facturé réduit le facturable", () => {
    expect(matchLine({ ...base, invoicedQty: 4 }, tol).match).toBe("CONFORME");
    expect(matchLine({ ...base, invoicedQty: 6, alreadyInvoicedElsewhere: 4 }, tol).match).toBe("CONFORME");
    expect(matchLine({ ...base, invoicedQty: 7, alreadyInvoicedElsewhere: 4 }, tol)).toMatchObject({ match: "ECART_QTE", qtyDelta: 1, billableQty: 6 });
  });
  it("prix et quantité", () => {
    expect(matchLine({ ...base, invoicedQty: 12, invoicePrice: 1100 }, tol).match).toBe("ECART_PRIX_QTE");
  });
  it("rien reçu : toute quantité facturée est un écart", () => {
    expect(matchLine({ ...base, receivedAcceptedQty: 0 }, tol).match).toBe("ECART_QTE");
  });
});

describe("statut et clôture", () => {
  it("statut de la facture", () => {
    expect(invoiceStatusFromLines(["CONFORME", "CONFORME"])).toBe("CONFORME");
    expect(invoiceStatusFromLines(["CONFORME", "ECART_PRIX"])).toBe("ECART");
    expect(invoiceStatusFromLines([])).toBe("ECART");
  });
  it("BC clôturable quand tout le reçu est facturé et les lignes sont complètes", () => {
    const l = { quantity: 10, receivedQty: 10, closedQty: 0, invoicedQty: 10 };
    expect(isOrderFullyInvoiced([l])).toBe(true);
    expect(isOrderFullyInvoiced([{ ...l, invoicedQty: 6 }])).toBe(false);
    expect(isOrderFullyInvoiced([{ ...l, receivedQty: 6, invoicedQty: 6 }])).toBe(false);
    expect(isOrderFullyInvoiced([{ ...l, receivedQty: 6, closedQty: 4, invoicedQty: 6 }])).toBe(true);
    expect(isOrderFullyInvoiced([])).toBe(false);
  });
  it("normalise le n° fournisseur", () => {
    expect(normalizeSupplierInvoiceNo("  fa 2026 / 001 ")).toBe("FA2026/001");
  });
});
