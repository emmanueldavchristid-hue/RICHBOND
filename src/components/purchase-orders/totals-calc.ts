/**
 * Totaux indicatifs affichés en direct dans le formulaire (même règle que `modules/purchase-orders/totals.ts` :
 * remise, arrondi demi-supérieur, TVA par taux, frais au HT). Le serveur recalcule et fait foi.
 * Ce fichier n'importe rien du client Prisma : il est utilisable dans le navigateur.
 */
export interface CalcLine {
  quantity: string;
  unitPrice: string;
  discountPct: string;
  vatRate: string;
}

export interface CalcCharge {
  amount: string;
  vatRate: string;
}

const num = (s: string): number => {
  const n = Number(String(s ?? "").trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Arrondi demi vers +infini à `dec` décimales (tolérance pour les écarts binaires). */
function round(v: number, dec: number): number {
  const f = 10 ** dec;
  return Math.floor(v * f + 0.5 + 1e-9) / f;
}

export function lineNet(l: CalcLine, dec: number): number {
  const discount = Math.min(Math.max(num(l.discountPct), 0), 100);
  return round(num(l.quantity) * num(l.unitPrice) * (1 - discount / 100), dec);
}

export interface CalcTotals {
  lineNets: number[];
  totalHt: number;
  totalVat: number;
  totalTtc: number;
  vat: { rate: number; vat: number }[];
  totalTtcXof: number | null;
}

export function calcTotals(lines: CalcLine[], charges: CalcCharge[], currencyCode: string, decimals: number, rate: string | number | null): CalcTotals {
  const dec = currencyCode === "XOF" ? 0 : decimals;
  const lineNets = lines.map((l) => lineNet(l, dec));
  const bases = new Map<number, number>();
  const add = (r: string, v: number) => bases.set(Number(r) || 0, (bases.get(Number(r) || 0) ?? 0) + v);
  lines.forEach((l, i) => add(l.vatRate, lineNets[i]));
  const chargeNets = charges.map((c) => round(num(c.amount), dec));
  charges.forEach((c, i) => add(c.vatRate, chargeNets[i]));
  const totalHt = round(lineNets.reduce((a, b) => a + b, 0) + chargeNets.reduce((a, b) => a + b, 0), dec);
  const vat = [...bases.entries()].sort((a, b) => a[0] - b[0]).map(([r, base]) => ({ rate: r, vat: round((base * r) / 100, dec) }));
  const totalVat = round(vat.reduce((a, b) => a + b.vat, 0), dec);
  const totalTtc = round(totalHt + totalVat, dec);
  let totalTtcXof: number | null = null;
  if (currencyCode === "XOF") totalTtcXof = totalTtc;
  else if (rate !== null && rate !== "" && Number(rate) > 0) totalTtcXof = Math.floor(totalTtc * Number(rate) + 0.5);
  return { lineNets, totalHt, totalVat, totalTtc, vat, totalTtcXof };
}
