import { BusinessError } from "./errors";

const NBSP = " ";

function assertInt(n: number): void {
  if (!Number.isSafeInteger(n)) {
    throw new BusinessError("MONTANT_INVALIDE", "Le montant en FCFA doit être un nombre entier.");
  }
}

/** 1250000 -> "1 250 000 FCFA" (espaces insécables). */
export function formatFcfa(n: number): string {
  assertInt(n);
  const abs = Math.abs(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${n < 0 ? "-" : ""}${abs}${NBSP}FCFA`;
}

/**
 * Montant dans une devise : XOF -> "1 250 000 FCFA", autre -> "1 250,50 CNY" (espaces insécables, virgule décimale).
 * `value` peut être une chaîne décimale (Decimal sérialisé).
 */
export function formatAmount(value: number | string, currency: string, decimals = 2): string {
  const n = Number(typeof value === "string" ? value.trim().replace(",", ".") : value);
  if (!Number.isFinite(n)) throw new BusinessError("MONTANT_INVALIDE", "Le montant n'est pas un nombre valide.");
  if (currency === "XOF") return formatFcfa(Math.round(n));
  const [i, f] = Math.abs(n).toFixed(decimals).split(".");
  const int = i.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${n < 0 ? "-" : ""}${int}${f ? `,${f}` : ""}${NBSP}${currency}`;
}

/** Quantité décimale sans zéros inutiles : "200.000" -> "200", "12.5" -> "12,5". */
export function formatQty(value: number | string): string {
  const n = Number(typeof value === "string" ? value.trim().replace(",", ".") : value);
  if (!Number.isFinite(n)) return "–";
  const [i, f = ""] = n.toFixed(3).split(".");
  const int = i.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const frac = f.replace(/0+$/, "");
  return `${int}${frac ? `,${frac}` : ""}`;
}

/** Arrondi au franc, demi vers +infini (pas d'arrondi bancaire). */
export function roundFcfa(x: number): number {
  if (!Number.isFinite(x)) {
    throw new BusinessError("MONTANT_INVALIDE", "Le montant n'est pas un nombre valide.");
  }
  const r = Math.floor(x + 0.5);
  return r === 0 ? 0 : r;
}

/** Convertit un montant en devise (chaîne décimale ou nombre) au taux donné, en FCFA entiers. Calcul décimal exact via BigInt. */
export function toFcfa(amount: number | string, rate: number | string): number {
  const a = parseDecimal(amount);
  const r = parseDecimal(rate);
  const scale = 10n ** BigInt(a.scale + r.scale);
  // arrondi demi vers +infini : floor((2n + scale) / (2 * scale))
  const res = Number(floorDivide(2n * a.int * r.int + scale, 2n * scale));
  assertInt(res);
  return res;
}

function floorDivide(a: bigint, b: bigint): bigint {
  const q = a / b;
  return a % b !== 0n && a < 0n !== b < 0n ? q - 1n : q;
}

function parseDecimal(v: number | string): { int: bigint; scale: number } {
  const s = (typeof v === "number" ? v.toString() : v).trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) {
    throw new BusinessError("MONTANT_INVALIDE", `Valeur numérique invalide : « ${String(v)} ».`);
  }
  const [i, f = ""] = s.split(".");
  return { int: BigInt(i + f), scale: f.length };
}

/** "1 250 000" ou "1 250 000 FCFA" -> 1250000. */
export function parseFcfa(input: string): number {
  const cleaned = input.replace(/FCFA/gi, "").replace(/[\s  ]/g, "");
  if (!/^-?\d+$/.test(cleaned)) {
    throw new BusinessError("MONTANT_INVALIDE", `Montant FCFA invalide : « ${input} ».`);
  }
  const n = Number(cleaned);
  assertInt(n);
  return n;
}
