import { Prisma } from "@/generated/prisma/client";
import { BusinessError } from "@/lib/errors";

type DecimalInput = string | number | Prisma.Decimal;

const BAD_COEF = () =>
  new BusinessError("CONVERSION_INVALID", "Le coefficient de conversion doit être strictement positif.");

function toDecimal(v: DecimalInput): Prisma.Decimal {
  const d = new Prisma.Decimal(typeof v === "string" ? v.replace(",", ".") : v);
  if (!d.isFinite()) throw new BusinessError("QTY_INVALID", "Quantité invalide.");
  return d;
}

function coef(c: DecimalInput): Prisma.Decimal {
  const d = toDecimal(c);
  if (d.lte(0)) throw BAD_COEF();
  return d;
}

/** R3 : quantité achetée -> quantité en stock (1 FÛT = 200 KG), 3 décimales, demi-supérieur. */
export function toStockQty(purchaseQty: DecimalInput, coefficient: DecimalInput): Prisma.Decimal {
  return toDecimal(purchaseQty).mul(coef(coefficient)).toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
}

/** Inverse : quantité en stock -> quantité d'achat. */
export function toPurchaseQty(stockQty: DecimalInput, coefficient: DecimalInput): Prisma.Decimal {
  return toDecimal(stockQty).div(coef(coefficient)).toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
}
