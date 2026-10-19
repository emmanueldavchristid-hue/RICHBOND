import { Prisma } from "@/generated/prisma/client";
import { BusinessError } from "@/lib/errors";
import { toFcfa } from "@/lib/money";

/**
 * D12 : calcul des montants d'un BC (fichier pur). Décimal exact (Prisma.Decimal), jamais de float :
 * - montant net d'une ligne = qté x PU x (1 - remise %), arrondi à l'unité (XOF) ou au centime, demi-supérieur ;
 * - frais d'approche ajoutés au HT, chacun avec son taux de TVA ;
 * - TVA = somme, par taux, de arrondi(base x taux) ; TTC = HT + TVA ;
 * - équivalent FCFA entier = `toFcfa(total en devise, taux)`.
 */
export type DecimalInput = string | number | Prisma.Decimal;

/** Plafond d'un BC : une colonne INTEGER (FCFA) par total. */
export const MAX_ORDER_XOF = 2_147_483_647;
/** Plus grand prix unitaire stocké (Decimal(14,2)). */
export const MAX_UNIT_PRICE = 999_999_999_999.99;

const D = (v: DecimalInput): Prisma.Decimal => new Prisma.Decimal(typeof v === "string" ? v.trim().replace(",", ".") : v);
const round = (v: Prisma.Decimal, decimals: number) => v.toDecimalPlaces(decimals, Prisma.Decimal.ROUND_HALF_UP);

/** Nombre de décimales d'une devise : 0 pour le FCFA, 2 par défaut. */
export function currencyDecimals(code: string, decimals?: number | null): number {
  if (code === "XOF") return 0;
  return decimals ?? 2;
}

/** Contrôle le format d'un prix unitaire : entier en FCFA, au plus 2 décimales en devise. Renvoie la valeur décimale. */
export function parseUnitPrice(value: DecimalInput, currencyCode: string, decimals?: number | null): Prisma.Decimal {
  let d: Prisma.Decimal;
  try {
    d = D(value);
  } catch {
    throw new BusinessError("MONTANT_INVALIDE", "Le prix unitaire n'est pas un nombre valide.");
  }
  if (!d.isFinite() || d.isNegative()) throw new BusinessError("MONTANT_INVALIDE", "Le prix unitaire ne peut pas être négatif.");
  if (d.gt(MAX_UNIT_PRICE)) throw new BusinessError("MONTANT_INVALIDE", "Prix unitaire trop élevé.");
  const dec = currencyDecimals(currencyCode, decimals);
  if (!d.eq(round(d, dec))) {
    throw new BusinessError(
      "MONTANT_INVALIDE",
      dec === 0
        ? "Le prix unitaire en FCFA doit être un nombre entier."
        : `Le prix unitaire accepte ${dec} décimale${dec > 1 ? "s" : ""} au maximum.`,
    );
  }
  return d;
}

export interface TotalsLineInput {
  quantity: DecimalInput;
  unitPrice: DecimalInput;
  /** 0 à 100. */
  discountPct?: DecimalInput;
  /** 0, 9 ou 18. */
  vatRate: DecimalInput;
}

export interface TotalsChargeInput {
  amount: DecimalInput;
  vatRate: DecimalInput;
}

/** Montant net d'une ligne (après remise), arrondi selon la devise. */
export function lineNetAmount(line: Pick<TotalsLineInput, "quantity" | "unitPrice" | "discountPct">, decimals: number): Prisma.Decimal {
  const discount = D(line.discountPct ?? 0);
  if (discount.lt(0) || discount.gt(100)) throw new BusinessError("DISCOUNT_INVALID", "La remise doit être comprise entre 0 et 100 %.");
  const factor = new Prisma.Decimal(100).minus(discount).div(100);
  return round(D(line.quantity).mul(D(line.unitPrice)).mul(factor), decimals);
}

/** Prix unitaire effectif après remise (non arrondi à l'unité) : sert au contrôle de prix et à l'historique. */
export function effectiveUnitPrice(unitPrice: DecimalInput, discountPct: DecimalInput = 0): Prisma.Decimal {
  return D(unitPrice).mul(new Prisma.Decimal(100).minus(D(discountPct))).div(100);
}

export interface VatBreakdown {
  rate: number;
  base: Prisma.Decimal;
  vat: Prisma.Decimal;
}

export interface OrderTotals {
  lineNets: Prisma.Decimal[];
  chargesTotal: Prisma.Decimal;
  totalHt: Prisma.Decimal;
  vat: VatBreakdown[];
  totalVat: Prisma.Decimal;
  totalTtc: Prisma.Decimal;
  /** FCFA entiers ; null si la devise n'est pas le FCFA et qu'aucun taux n'est connu. */
  totalHtXof: number | null;
  totalTtcXof: number | null;
}

export interface TotalsOptions {
  currencyCode: string;
  /** Décimales de la devise (XOF = 0 quoi qu'il arrive). */
  decimals?: number | null;
  /** FCFA pour 1 unité de devise ; ignoré pour le FCFA. */
  rate?: DecimalInput | null;
}

export function computeTotals(lines: TotalsLineInput[], charges: TotalsChargeInput[], opts: TotalsOptions): OrderTotals {
  const dec = currencyDecimals(opts.currencyCode, opts.decimals);
  const lineNets = lines.map((l) => lineNetAmount(l, dec));
  const chargeNets = charges.map((c) => round(D(c.amount), dec));
  const bases = new Map<number, Prisma.Decimal>();
  const add = (rate: DecimalInput, v: Prisma.Decimal) => {
    const key = D(rate).toNumber();
    bases.set(key, (bases.get(key) ?? new Prisma.Decimal(0)).plus(v));
  };
  lines.forEach((l, i) => add(l.vatRate, lineNets[i]));
  charges.forEach((c, i) => add(c.vatRate, chargeNets[i]));

  const chargesTotal = chargeNets.reduce((a, b) => a.plus(b), new Prisma.Decimal(0));
  const totalHt = lineNets.reduce((a, b) => a.plus(b), new Prisma.Decimal(0)).plus(chargesTotal);
  const vat: VatBreakdown[] = [...bases.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, base]) => ({ rate, base, vat: round(base.mul(rate).div(100), dec) }));
  const totalVat = vat.reduce((a, b) => a.plus(b.vat), new Prisma.Decimal(0));
  const totalTtc = totalHt.plus(totalVat);

  let totalHtXof: number | null = null;
  let totalTtcXof: number | null = null;
  if (opts.currencyCode === "XOF") {
    totalHtXof = totalHt.toNumber();
    totalTtcXof = totalTtc.toNumber();
  } else if (opts.rate !== null && opts.rate !== undefined) {
    const r = D(opts.rate).toFixed(6);
    totalHtXof = toFcfa(totalHt.toFixed(dec), r);
    totalTtcXof = toFcfa(totalTtc.toFixed(dec), r);
  }
  assertWithinCeiling(totalTtcXof);
  return { lineNets, chargesTotal, totalHt, vat, totalVat, totalTtc, totalHtXof, totalTtcXof };
}

/** Plafond INTEGER : message clair plutôt qu'une erreur SQL. */
export function assertWithinCeiling(totalTtcXof: number | null): void {
  if (totalTtcXof !== null && (!Number.isSafeInteger(totalTtcXof) || totalTtcXof > MAX_ORDER_XOF)) {
    throw new BusinessError(
      "TOTAL_TOO_HIGH",
      "Le total du bon de commande dépasse 2 147 483 647 FCFA : scindez la commande en plusieurs bons.",
    );
  }
}

/** Équivalent FCFA d'un prix unitaire (par unité d'achat), non arrondi : sert à comparer au dernier prix. */
export function unitPriceToXof(price: DecimalInput, currencyCode: string, rate?: DecimalInput | null): Prisma.Decimal | null {
  if (currencyCode === "XOF") return D(price);
  if (rate === null || rate === undefined) return null;
  return D(price).mul(D(rate));
}
