import { describe, expect, it } from "vitest";
import {
  assertReceivedAtValid,
  entryUnitCost,
  isOrderComplete,
  lineQuantityProblem,
  maxAcceptableQty,
  overDeliveryExcess,
  receiptDaysLate,
  receivableProblem,
  remainingQty,
  stockFactor,
  toStock,
} from "@/modules/receiving/rules";
import { createReceiptSchema, closeRemainderSchema } from "@/modules/receiving/schemas";
import { receivedStatusOf } from "@/modules/purchase-orders/workflow";

describe("restant dû et sur-livraison", () => {
  const line = { quantity: "10", receivedQty: "4", closedQty: "0" };
  it("restant = commandé - reçu - soldé, jamais négatif", () => {
    expect(remainingQty(line).toString()).toBe("6");
    expect(remainingQty({ quantity: 10, receivedQty: 4, closedQty: 6 }).toString()).toBe("0");
    expect(remainingQty({ quantity: 10, receivedQty: 12 }).toString()).toBe("0");
  });
  it("tolérance 0 % : tout dépassement du restant est une sur-livraison", () => {
    expect(overDeliveryExcess(line, 6, 0).toString()).toBe("0");
    expect(overDeliveryExcess(line, 6.001, 0).toString()).toBe("0.001");
    expect(maxAcceptableQty(line, 0).toString()).toBe("6");
  });
  it("tolérance 5 % calculée sur la quantité commandée", () => {
    expect(maxAcceptableQty(line, 5).toString()).toBe("6.5");
    expect(overDeliveryExcess(line, 6.5, 5).toString()).toBe("0");
    expect(overDeliveryExcess(line, 6.6, 5).gt(0)).toBe(true);
  });
  it("le reliquat soldé réduit le plafond", () => {
    expect(maxAcceptableQty({ quantity: 10, receivedQty: 4, closedQty: 3 }, 0).toString()).toBe("3");
  });
});

describe("quantités et coût d'entrée", () => {
  it("livrée = acceptée + refusée ; motif obligatoire si refus", () => {
    expect(lineQuantityProblem({ delivered: 10, accepted: 7, refused: 3, refusalReason: "ABIME" })).toBeNull();
    expect(lineQuantityProblem({ delivered: 10, accepted: 7, refused: 2, refusalReason: "ABIME" })).toMatch(/livrée/);
    expect(lineQuantityProblem({ delivered: 10, accepted: 7, refused: 3 })).toMatch(/motif/);
  });
  it("coût = net / quantité x taux / facteur, 4 décimales, sans flottant", () => {
    expect(entryUnitCost({ netAmount: 100000, quantity: 10, exchangeRate: null, factor: 10 }).toString()).toBe("1000");
    // 3 EUR net pour 7 unités, 655,957 FCFA/EUR, facteur 1
    expect(entryUnitCost({ netAmount: "3.00", quantity: 7, exchangeRate: "655.957", factor: 1 }).toString()).toBe("281.1244");
  });
  it("facteur de conversion : celui du BC, sinon celui de l'article", () => {
    expect(stockFactor({ quantity: 5, stockQty: 50 }, 8).toString()).toBe("10");
    expect(stockFactor({ quantity: 5, stockQty: null }, 8).toString()).toBe("8");
    expect(stockFactor({ quantity: 5 }, null).toString()).toBe("1");
    expect(toStock("2.5", 10).toString()).toBe("25");
  });
});

describe("dates et ponctualité", () => {
  it("date future refusée", () => {
    expect(() => assertReceivedAtValid("2026-11-02", "2026-11-01")).toThrow(/futur/);
    expect(() => assertReceivedAtValid("2026-11-01", "2026-11-01")).not.toThrow();
  });
  it("jours de retard sur la date de référence, 0 si à l'heure ou en avance", () => {
    expect(receiptDaysLate("2026-11-01", "2026-11-04")).toBe(3);
    expect(receiptDaysLate("2026-11-04", "2026-11-04")).toBe(0);
    expect(receiptDaysLate("2026-11-10", "2026-11-04")).toBe(0);
  });
});

describe("statut du BC", () => {
  it("BC non envoyé : message dédié ; reçu : déjà soldé", () => {
    expect(receivableProblem("CONFIRME")).toBeNull();
    expect(receivableProblem("VALIDE")?.message).toMatch(/marqué envoyé/);
    expect(receivableProblem("RECU")?.code).toBe("ORDER_NOT_RECEIVABLE");
    expect(receivableProblem("BROUILLON")?.code).toBe("ORDER_NOT_RECEIVABLE");
  });
  it("receivedStatusOf tient compte du reliquat soldé (R8)", () => {
    expect(receivedStatusOf([{ quantity: 10, receivedQty: 4, closedQty: 6 }])).toBe("RECU");
    expect(receivedStatusOf([{ quantity: 10, receivedQty: 4, closedQty: 5 }])).toBe("PARTIELLEMENT_RECU");
    expect(receivedStatusOf([{ quantity: 10, receivedQty: 4 }])).toBe("PARTIELLEMENT_RECU");
  });
  it("complétude après réception", () => {
    const lines = [
      { id: "a", quantity: 10, receivedQty: 4, closedQty: 0 },
      { id: "b", quantity: 5, receivedQty: 5, closedQty: 0 },
    ];
    expect(isOrderComplete(lines, new Map([["a", 6]]))).toBe(true);
    expect(isOrderComplete(lines, new Map([["a", 5]]))).toBe(false);
  });
});

describe("schémas Zod", () => {
  const base = { orderId: "o1", deliveryNoteRef: "BL-1", receivedAt: "2026-11-01" };
  it("valide une réception, accepte la virgule décimale", () => {
    const r = createReceiptSchema.safeParse({ ...base, lines: [{ orderLineId: "l1", deliveredQty: "5,5", acceptedQty: "5,5" }] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.lines[0].refusedQty).toBe(0);
  });
  it("rejette livrée != acceptée + refusée, refus sans motif, ligne en double, BL manquant", () => {
    const bad = (lines: unknown[], over: object = {}) => createReceiptSchema.safeParse({ ...base, ...over, lines }).success;
    expect(bad([{ orderLineId: "l1", deliveredQty: 5, acceptedQty: 3 }])).toBe(false);
    expect(bad([{ orderLineId: "l1", deliveredQty: 5, acceptedQty: 3, refusedQty: 2 }])).toBe(false);
    expect(bad([{ orderLineId: "l1", deliveredQty: 5, acceptedQty: 3, refusedQty: 2, refusalReason: "ABIME" }])).toBe(true);
    expect(bad([{ orderLineId: "l1", deliveredQty: 1, acceptedQty: 1 }, { orderLineId: "l1", deliveredQty: 1, acceptedQty: 1 }])).toBe(false);
    expect(bad([{ orderLineId: "l1", deliveredQty: 1, acceptedQty: 1 }], { deliveryNoteRef: " " })).toBe(false);
    expect(bad([{ orderLineId: "l1", deliveredQty: 0, acceptedQty: 0 }])).toBe(false);
  });
  it("l'accord de sur-livraison exige un motif ; le solde de reliquat aussi", () => {
    const line = { orderLineId: "l1", deliveredQty: 1, acceptedQty: 1 };
    expect(createReceiptSchema.safeParse({ ...base, lines: [line], overDeliveryApproved: true }).success).toBe(false);
    expect(createReceiptSchema.safeParse({ ...base, lines: [line], overDeliveryApproved: true, overDeliveryReason: "Accord du fournisseur" }).success).toBe(true);
    expect(closeRemainderSchema.safeParse({ orderId: "o1", reason: "ok" }).success).toBe(false);
  });
});
