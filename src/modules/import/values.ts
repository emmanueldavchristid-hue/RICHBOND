import { UNITS, UNIT_LABELS } from "@/modules/referentials/units";
import { normalizeText } from "./mapping";

/** Lecteurs de valeurs de cellules (purs). Chaque lecteur renvoie null si la valeur est invalide. */

const NBSP = /[\s  ]/g;

/**
 * Nombre décimal en notation française ou anglaise : « 1 250,50 », « 1.250,50 », « 1,250.50 », « 12.5 ».
 * Retourne la forme canonique « 1250.50 » ou null. Au plus `maxDecimals` décimales.
 */
export function parseDecimalString(raw: string, maxDecimals: number): string | null {
  const s = raw.replace(NBSP, "");
  if (!/^-?[0-9][0-9.,]*$/.test(s)) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let intPart = s;
  let frac = "";
  const decimalIdx = Math.max(lastDot, lastComma);
  if (decimalIdx >= 0) {
    const sepChar = s[decimalIdx];
    const sameCount = s.split(sepChar).length - 1;
    const other = sepChar === "." ? "," : ".";
    // Séparateur répété (1.250.000) = milliers ; sinon c'est la virgule décimale, sauf s'il y a l'autre séparateur après.
    if (sameCount > 1 && !s.includes(other)) {
      intPart = s.replace(/[.,]/g, "");
    } else if (sameCount > 1) {
      return null;
    } else {
      const head = s.slice(0, decimalIdx);
      if (/[.,]/.test(head) && !/^-?\d{1,3}([.,]\d{3})+$/.test(head)) return null;
      intPart = head.replace(/[.,]/g, "");
      frac = s.slice(decimalIdx + 1);
    }
  }
  if (!/^-?[0-9]+$/.test(intPart) || (frac !== "" && !/^[0-9]+$/.test(frac))) return null;
  frac = frac.replace(/0+$/, "");
  if (frac.length > maxDecimals) return null;
  return frac ? `${intPart}.${frac}` : intPart;
}

export function parseIntString(raw: string): number | null {
  const d = parseDecimalString(raw, 0);
  if (d === null || d.includes(".")) return null;
  const n = Number(d);
  return Number.isSafeInteger(n) ? n : null;
}

const CATEGORY_ALIASES: Record<string, string> = {
  "matiere premiere": "MATIERE_PREMIERE",
  mp: "MATIERE_PREMIERE",
  intrant: "INTRANT",
  intrants: "INTRANT",
  pdr: "PDR",
  "piece de rechange": "PDR",
  "pieces de rechange": "PDR",
  "piece de rechange pdr": "PDR",
  fourniture: "FOURNITURE",
  fournitures: "FOURNITURE",
  service: "SERVICE",
  services: "SERVICE",
  prestation: "SERVICE",
};

export function parseCategory(raw: string): string | null {
  return CATEGORY_ALIASES[normalizeText(raw)] ?? null;
}

export function parseCriticality(raw: string): string | null {
  const v = normalizeText(raw);
  if (v === "critique") return "CRITIQUE";
  if (v === "important") return "IMPORTANT";
  if (v === "standard" || v === "normal") return "STANDARD";
  return null;
}

const UNIT_MAP: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const u of UNITS) {
    m.set(normalizeText(u), u);
    m.set(normalizeText(UNIT_LABELS[u]), u);
  }
  const extra: Record<string, string> = { kilo: "KG", kilos: "KG", litre: "L", litres: "L", metre: "M", piece: "PCE", pieces: "PCE", unite: "U", unites: "U", sacs: "SAC", cartons: "CARTON", tonne: "T", tonnes: "T" };
  for (const [k, v] of Object.entries(extra)) m.set(k, v);
  return m;
})();

export function parseUnit(raw: string): string | null {
  return UNIT_MAP.get(normalizeText(raw)) ?? null;
}

export function parseSupplierType(raw: string): "LOCAL" | "IMPORT" | null {
  const v = normalizeText(raw);
  if (["local", "locale", "national", "nationale"].includes(v)) return "LOCAL";
  if (["import", "importation", "etranger", "etrangere", "international"].includes(v)) return "IMPORT";
  return null;
}

export function parseCountry(raw: string): string | null {
  const v = normalizeText(raw);
  if (["cote d ivoire", "cote divoire", "ci", "ivory coast"].includes(v)) return "CI";
  return /^[a-z]{2}$/.test(v) ? v.toUpperCase() : null;
}

export function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/** AAAA-MM-JJ ou JJ/MM/AAAA (ou JJ-MM-AAAA) -> AAAA-MM-JJ si la date existe. */
export function parseDateString(raw: string): string | null {
  let y: number, m: number, d: number;
  let mt = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(raw);
  if (mt) [y, m, d] = [Number(mt[1]), Number(mt[2]), Number(mt[3])];
  else {
    mt = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(raw);
    if (!mt) return null;
    [d, m, y] = [Number(mt[1]), Number(mt[2]), Number(mt[3])];
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}
