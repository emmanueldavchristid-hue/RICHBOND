import { CODE_FORMAT_MESSAGE, CODE_REGEX, normalizeCode } from "@/modules/referentials/codes";
import type { RawLine } from "./parse";
import type { ColumnMapping, ImportType, PreviewRow, RowAction, RowData } from "./types";
import {
  isValidEmail,
  parseCategory,
  parseCountry,
  parseCriticality,
  parseDateString,
  isAmbiguousNumber,
  parseDecimalString,
  parseIntString,
  parseSupplierType,
  parseUnit,
} from "./values";

/**
 * Validation pure des lignes (aucune écriture, aucun accès base) : l'état de la base est fourni par `ValidationContext`.
 * Le même code sert à l'aperçu et à l'import, qui ne retient que les lignes `OK`.
 */

export interface ItemRef {
  id: string;
  code: string;
  name: string;
  category: string;
  family: string | null;
  stockUnit: string;
  purchaseUnit: string;
  conversionFactor: string;
  criticality: string;
  barcode: string | null;
  equipment: string | null;
  stocked: boolean;
}

export interface SupplierRef {
  id: string;
  code: string;
  name: string;
  type: string;
  country: string;
  city: string | null;
  phone: string | null;
  email: string | null;
  ncc: string | null;
  currencyCode: string;
  status: string;
}

export interface LinkRef {
  id: string;
  supplierRef: string | null;
  lastPrice: string | null;
  currencyCode: string | null;
  leadTimeDays: number | null;
  minOrderQty: string | null;
  active: boolean;
}

export interface ValidationContext {
  items: Map<string, ItemRef>;
  suppliers: Map<string, SupplierRef>;
  /** Clé `${codeArticle}|${codeFournisseur}`. */
  links: Map<string, LinkRef>;
  currencies: Set<string>;
  /** Dépôts actifs par code. */
  warehouses: Map<string, { id: string; code: string }>;
  /** Code-barres -> code de l'article qui le porte. */
  barcodeOwners: Map<string, string>;
  /** NCC -> code du fournisseur qui le porte. */
  nccOwners: Map<string, string>;
  /** Codes des articles ayant au moins un prix fournisseur actif (l'unité d'achat est alors verrouillée). */
  pricedItems: Set<string>;
  /** Clé `${codeArticle}|${codeDépôt}` -> état des mouvements. */
  stockState: Map<string, { initial: boolean; other: boolean }>;
  /** AAAA-MM-JJ, fuseau Africa/Abidjan. */
  today: string;
  /** Import ARTICLES : catégorie appliquée aux lignes sans catégorie (colonne non associée ou cellule vide). */
  defaultCategory: string | null;
}

export function emptyContext(today: string): ValidationContext {
  return {
    items: new Map(),
    suppliers: new Map(),
    links: new Map(),
    currencies: new Set(),
    warehouses: new Map(),
    barcodeOwners: new Map(),
    nccOwners: new Map(),
    pricedItems: new Set(),
    stockState: new Map(),
    today,
    defaultCategory: null,
  };
}

export const STOCK_INITIAL_REF = "IMPORT-STOCK-INITIAL";

type Cells = Record<string, string>;
const cell = (cells: Cells, mapping: ColumnMapping, key: string): string => {
  const h = mapping[key];
  return h ? (cells[h] ?? "").trim() : "";
};

function readCode(raw: string, label: string, errors: string[]): string {
  if (!raw) {
    errors.push(`${label} manquant.`);
    return "";
  }
  const code = normalizeCode(raw);
  if (!CODE_REGEX.test(code)) errors.push(`${label} « ${raw} » : ${CODE_FORMAT_MESSAGE}`);
  return code;
}

// ------------------------------------------------------------------ différences (aussi utilisées par l'import)

export function itemPatch(existing: ItemRef, d: RowData): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (d.name !== existing.name) patch.name = d.name;
  if (d.category !== existing.category) {
    patch.category = d.category;
    patch.stocked = d.category !== "SERVICE";
  }
  if (d.family !== null && d.family !== existing.family) patch.family = d.family;
  if (d.purchaseUnit !== existing.purchaseUnit) patch.purchaseUnit = d.purchaseUnit;
  if (Number(d.conversionFactor) !== Number(existing.conversionFactor)) patch.conversionFactor = d.conversionFactor;
  if (d.criticality !== null && d.criticality !== existing.criticality) patch.criticality = d.criticality;
  if (d.barcode !== null && d.barcode !== existing.barcode) patch.barcode = d.barcode;
  const equipment = d.category === "PDR" ? d.equipment : null;
  if (equipment !== null && equipment !== existing.equipment) patch.equipment = equipment;
  if (d.category !== "PDR" && existing.equipment !== null && d.category !== existing.category) patch.equipment = null;
  return patch;
}

export function supplierPatch(existing: SupplierRef, d: RowData): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const k of ["name", "type", "country", "currencyCode"] as const) if (d[k] !== existing[k]) patch[k] = d[k];
  for (const k of ["city", "phone", "email", "ncc"] as const) if (d[k] !== null && d[k] !== existing[k]) patch[k] = d[k];
  return patch;
}

export function linkPatch(existing: LinkRef, d: RowData): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (d.supplierRef !== null && d.supplierRef !== existing.supplierRef) patch.supplierRef = d.supplierRef;
  if (d.price !== null && (existing.lastPrice === null || Number(existing.lastPrice) !== Number(d.price) || existing.currencyCode !== d.currencyCode)) {
    patch.lastPrice = d.price;
    patch.currencyCode = d.currencyCode;
  }
  if (d.leadTimeDays !== null && d.leadTimeDays !== existing.leadTimeDays) patch.leadTimeDays = d.leadTimeDays;
  if (d.minOrderQty !== null && (existing.minOrderQty === null || Number(existing.minOrderQty) !== Number(d.minOrderQty))) patch.minOrderQty = d.minOrderQty;
  if (!existing.active) patch.active = true;
  return patch;
}

// ------------------------------------------------------------------ validateurs par type

function ambiguousMessage(raw: string, value: string): string {
  return `Quantité « ${raw} » lue comme ${value.replace(".", ",")} (virgule décimale) : si vous vouliez dire ${raw.replace(/[.,]/, "")}, corrigez le fichier.`;
}

type Validator = (cells: Cells, mapping: ColumnMapping, ctx: ValidationContext, seen: Map<string, number>, line: number) => Omit<PreviewRow, "line">;

function finish(key: string, errors: string[], data: RowData, action: RowAction | undefined, warnings: string[] = []): Omit<PreviewRow, "line"> {
  return {
    status: errors.length ? "ERREUR" : "OK",
    errors,
    ...(warnings.length ? { warnings } : {}),
    key,
    ...(errors.length ? {} : { action }),
    data,
  };
}

function checkDuplicate(key: string, seen: Map<string, number>, line: number, errors: string[], what: string) {
  if (!key) return;
  const first = seen.get(key);
  if (first !== undefined) errors.push(`Doublon dans le fichier : ${what} déjà présent à la ligne ${first}.`);
  else seen.set(key, line);
}

const validateItem: Validator = (cells, m, ctx, seen, line) => {
  const errors: string[] = [];
  const code = readCode(cell(cells, m, "code"), "Référence (code article)", errors);
  checkDuplicate(code, seen, line, errors, `l'article ${code}`);
  const existing = code ? ctx.items.get(code) : undefined;

  const name = cell(cells, m, "name");
  if (name.length < 2) errors.push("Désignation manquante (2 caractères minimum).");
  else if (name.length > 150) errors.push("Désignation trop longue (150 caractères maximum).");

  const rawCat = cell(cells, m, "category");
  let category = "";
  if (!rawCat) {
    if (ctx.defaultCategory) category = ctx.defaultCategory;
    else errors.push("Catégorie manquante.");
  } else {
    const c = parseCategory(rawCat);
    if (!c) errors.push(`Catégorie inconnue : « ${rawCat} » (Matière première, Intrant, PDR, Fourniture ou Service).`);
    else category = c;
  }

  const rawUnit = cell(cells, m, "stockUnit");
  let stockUnit = "";
  if (!rawUnit) errors.push("Unité manquante.");
  else {
    const u = parseUnit(rawUnit);
    if (!u) errors.push(`Unité inconnue : « ${rawUnit} ».`);
    else stockUnit = u;
  }
  if (existing && stockUnit && stockUnit !== existing.stockUnit) {
    errors.push(`L'unité de stock d'un article existant ne peut pas être modifiée par import (actuelle : ${existing.stockUnit}).`);
  }

  const rawPu = cell(cells, m, "purchaseUnit");
  let purchaseUnit = stockUnit;
  if (rawPu) {
    const u = parseUnit(rawPu);
    if (!u) errors.push(`Unité d'achat inconnue : « ${rawPu} ».`);
    else purchaseUnit = u;
  } else if (existing) purchaseUnit = existing.purchaseUnit;

  const rawCoef = cell(cells, m, "conversionFactor");
  let coef = "1";
  if (rawCoef) {
    const c = parseDecimalString(rawCoef, 3);
    if (c === null || Number(c) <= 0) errors.push(`Coefficient invalide : « ${rawCoef} » (nombre positif, 3 décimales au plus).`);
    else coef = c;
  } else if (purchaseUnit && stockUnit && purchaseUnit !== stockUnit) {
    if (existing && existing.purchaseUnit === purchaseUnit) coef = existing.conversionFactor;
    else errors.push("Coefficient de conversion obligatoire quand l'unité d'achat diffère de l'unité de stock.");
  }
  if (purchaseUnit && stockUnit && purchaseUnit === stockUnit && Number(coef) !== 1) {
    errors.push("Même unité d'achat et de stock : le coefficient doit être 1.");
  }
  if (existing && purchaseUnit && purchaseUnit !== existing.purchaseUnit && ctx.pricedItems.has(code)) {
    errors.push("L'unité d'achat ne peut plus changer : des prix fournisseurs sont exprimés dans l'unité actuelle.");
  }

  const rawCrit = cell(cells, m, "criticality");
  let criticality: string | null = null;
  if (rawCrit) {
    criticality = parseCriticality(rawCrit);
    if (!criticality) errors.push(`Criticité inconnue : « ${rawCrit} » (Critique, Important ou Standard).`);
  }

  const family = cell(cells, m, "family");
  if (family.length > 60) errors.push("Famille trop longue (60 caractères maximum).");
  const equipment = cell(cells, m, "equipment");
  if (equipment.length > 120) errors.push("Équipement trop long (120 caractères maximum).");

  const barcode = cell(cells, m, "barcode");
  if (barcode.length > 50) errors.push("Code-barres trop long (50 caractères maximum).");
  if (barcode && code) {
    const owner = ctx.barcodeOwners.get(barcode);
    if (owner && owner !== code) errors.push(`Code-barres déjà utilisé par l'article ${owner}.`);
    checkDuplicate(`bc:${barcode}`, seen, line, errors, `le code-barres ${barcode}`);
  }

  const data: RowData = {
    code,
    name,
    category: category || null,
    family: family || null,
    stockUnit: stockUnit || null,
    purchaseUnit: purchaseUnit || null,
    conversionFactor: coef,
    criticality,
    equipment: equipment || null,
    barcode: barcode || null,
  };
  const action: RowAction = !existing ? "CREATE" : Object.keys(itemPatch(existing, data)).length ? "UPDATE" : "UNCHANGED";
  return finish(code, errors, data, action);
};

const validateSupplier: Validator = (cells, m, ctx, seen, line) => {
  const errors: string[] = [];
  const code = readCode(cell(cells, m, "code"), "Code fournisseur", errors);
  checkDuplicate(code, seen, line, errors, `le fournisseur ${code}`);
  const existing = code ? ctx.suppliers.get(code) : undefined;

  const name = cell(cells, m, "name");
  if (name.length < 2) errors.push("Intitulé manquant (2 caractères minimum).");
  else if (name.length > 150) errors.push("Intitulé trop long (150 caractères maximum).");

  const rawType = cell(cells, m, "type");
  let type = existing?.type ?? "LOCAL";
  if (rawType) {
    const t = parseSupplierType(rawType);
    if (!t) errors.push(`Type inconnu : « ${rawType} » (Local ou Import).`);
    else type = t;
  }

  const rawCountry = cell(cells, m, "country");
  let country = existing?.country ?? "CI";
  if (rawCountry) {
    const c = parseCountry(rawCountry);
    if (!c) errors.push(`Pays invalide : « ${rawCountry} » (code ISO à 2 lettres, ex. CI).`);
    else country = c;
  }

  const rawCur = cell(cells, m, "currencyCode");
  let currencyCode = existing?.currencyCode ?? "XOF";
  if (rawCur) {
    currencyCode = rawCur.toUpperCase();
    if (!ctx.currencies.has(currencyCode)) errors.push(`Devise inconnue ou désactivée : « ${rawCur} ».`);
  }

  const email = cell(cells, m, "email");
  if (email && !isValidEmail(email)) errors.push(`Email invalide : « ${email} ».`);
  const phone = cell(cells, m, "phone");
  if (phone.length > 30) errors.push("Téléphone trop long (30 caractères maximum).");
  const city = cell(cells, m, "city");
  if (city.length > 80) errors.push("Ville trop longue (80 caractères maximum).");

  const ncc = cell(cells, m, "ncc").toUpperCase();
  if (ncc.length > 30) errors.push("NCC trop long (30 caractères maximum).");
  if (ncc && code) {
    const owner = ctx.nccOwners.get(ncc);
    if (owner && owner !== code) errors.push(`NCC déjà utilisé par le fournisseur ${owner}.`);
    checkDuplicate(`ncc:${ncc}`, seen, line, errors, `le NCC ${ncc}`);
  }

  const data: RowData = { code, name, type, country, city: city || null, phone: phone || null, email: email || null, ncc: ncc || null, currencyCode };
  const action: RowAction = !existing ? "CREATE" : Object.keys(supplierPatch(existing, data)).length ? "UPDATE" : "UNCHANGED";
  return finish(code, errors, data, action);
};

const validateLink: Validator = (cells, m, ctx, seen, line) => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const itemCode = readCode(cell(cells, m, "itemCode"), "Référence (code article)", errors);
  const supplierCode = readCode(cell(cells, m, "supplierCode"), "Code fournisseur", errors);
  const key = itemCode && supplierCode ? `${itemCode}|${supplierCode}` : "";
  checkDuplicate(key, seen, line, errors, `le couple ${itemCode} / ${supplierCode}`);

  const item = itemCode ? ctx.items.get(itemCode) : undefined;
  const supplier = supplierCode ? ctx.suppliers.get(supplierCode) : undefined;
  if (itemCode && !item) errors.push(`Article inconnu : « ${itemCode} » (importez d'abord les articles).`);
  if (supplierCode && !supplier) errors.push(`Fournisseur inconnu : « ${supplierCode} » (importez d'abord les fournisseurs).`);
  if (supplier?.status === "BLOQUE") errors.push(`Le fournisseur « ${supplier.name} » est bloqué.`);

  const supplierRef = cell(cells, m, "supplierRef");
  if (supplierRef.length > 60) errors.push("Référence fournisseur trop longue (60 caractères maximum).");

  const rawPrice = cell(cells, m, "price");
  let price: string | null = null;
  if (rawPrice) {
    price = parseDecimalString(rawPrice, 2);
    if (price === null || Number(price) < 0) {
      errors.push(`Prix invalide : « ${rawPrice} » (nombre positif, 2 décimales au plus).`);
      price = null;
    }
  }
  const rawCur = cell(cells, m, "currencyCode");
  let currencyCode: string | null = null;
  if (rawCur) {
    currencyCode = rawCur.toUpperCase();
    if (!ctx.currencies.has(currencyCode)) errors.push(`Devise inconnue ou désactivée : « ${rawCur} ».`);
  } else if (price !== null) currencyCode = supplier?.currencyCode ?? null;

  const rawLead = cell(cells, m, "leadTimeDays");
  let leadTimeDays: number | null = null;
  if (rawLead) {
    leadTimeDays = parseIntString(rawLead);
    if (leadTimeDays === null || leadTimeDays < 0 || leadTimeDays > 730) {
      errors.push(`Délai invalide : « ${rawLead} » (entier de 0 à 730 jours).`);
      leadTimeDays = null;
    }
  }
  const rawMin = cell(cells, m, "minOrderQty");
  let minOrderQty: string | null = null;
  if (rawMin) {
    minOrderQty = parseDecimalString(rawMin, 3);
    if (minOrderQty === null || Number(minOrderQty) <= 0) {
      errors.push(`Quantité minimale invalide : « ${rawMin} » (nombre positif, 3 décimales au plus).`);
      minOrderQty = null;
    } else if (isAmbiguousNumber(rawMin)) warnings.push(ambiguousMessage(rawMin, minOrderQty));
  }

  const data: RowData = { itemCode, supplierCode, supplierRef: supplierRef || null, price, currencyCode, leadTimeDays, minOrderQty };
  const existing = key ? ctx.links.get(key) : undefined;
  const action: RowAction = !existing ? "CREATE" : Object.keys(linkPatch(existing, data)).length ? "UPDATE" : "UNCHANGED";
  return finish(key, errors, data, action, warnings);
};

const validateStock: Validator = (cells, m, ctx, seen, line) => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const itemCode = readCode(cell(cells, m, "itemCode"), "Référence (code article)", errors);
  const item = itemCode ? ctx.items.get(itemCode) : undefined;
  if (itemCode && !item) errors.push(`Article inconnu : « ${itemCode} » (importez d'abord les articles).`);
  if (item && !item.stocked) errors.push(`L'article ${itemCode} n'est pas géré en stock.`);

  const rawWh = cell(cells, m, "warehouseCode");
  let warehouseCode = "";
  if (rawWh) {
    warehouseCode = normalizeCode(rawWh);
    if (!ctx.warehouses.has(warehouseCode)) errors.push(`Dépôt inconnu ou inactif : « ${rawWh} ».`);
  } else if (ctx.warehouses.size === 1) warehouseCode = [...ctx.warehouses.keys()][0];
  else errors.push("Dépôt manquant (plusieurs dépôts actifs : indiquez le code du dépôt).");

  const key = itemCode && warehouseCode ? `${itemCode}|${warehouseCode}` : "";
  checkDuplicate(key, seen, line, errors, `l'article ${itemCode} dans le dépôt ${warehouseCode}`);

  const rawQty = cell(cells, m, "quantity");
  let quantity: string | null = null;
  let zeroQty = false;
  if (!rawQty) errors.push("Quantité manquante.");
  else {
    quantity = parseDecimalString(rawQty, 3);
    if (quantity === null) errors.push(`Quantité invalide : « ${rawQty} » (nombre, 3 décimales au plus).`);
    else if (Number(quantity) < 0) {
      errors.push("La quantité ne peut pas être négative.");
      quantity = null;
    } else if (Number(quantity) === 0) zeroQty = true;
    else if (isAmbiguousNumber(rawQty)) warnings.push(ambiguousMessage(rawQty, quantity));
  }

  const rawCost = cell(cells, m, "unitCost");
  let unitCost: string | null = null;
  if (zeroQty) {
    // Quantité 0 : ligne ignorée, le PMP n'a pas à être contrôlé.
  } else if (!rawCost) errors.push("PMP initial manquant.");
  else {
    unitCost = parseDecimalString(rawCost, 2);
    if (unitCost === null || Number(unitCost) < 0) {
      errors.push(`PMP invalide : « ${rawCost} » (FCFA par unité de stock, nombre positif, 2 décimales au plus).`);
      unitCost = null;
    }
  }

  const rawDate = cell(cells, m, "date");
  let date = ctx.today;
  if (rawDate) {
    const d = parseDateString(rawDate);
    if (!d) errors.push(`Date invalide : « ${rawDate} » (JJ/MM/AAAA).`);
    else if (d > ctx.today) errors.push("La date du stock initial ne peut pas être dans le futur.");
    else date = d;
  }

  let action: RowAction = "CREATE";
  const state = key ? ctx.stockState.get(key) : undefined;
  if (zeroQty) {
    action = "UNCHANGED";
    warnings.push("Quantité à 0 : ligne ignorée (aucun mouvement de stock créé).");
  } else if (state?.initial) {
    action = "UNCHANGED";
    warnings.push("Stock initial déjà importé pour cet article et ce dépôt : ligne ignorée.");
  } else if (state?.other) {
    errors.push("Cet article a déjà des mouvements de stock dans ce dépôt : corrigez-le par un ajustement ou un inventaire.");
  }

  const data: RowData = { itemCode, warehouseCode: warehouseCode || null, quantity, unitCost, date };
  return finish(key, errors, data, action, warnings);
};

const VALIDATORS: Record<ImportType, Validator> = {
  ARTICLES: validateItem,
  FOURNISSEURS: validateSupplier,
  ARTICLE_FOURNISSEUR: validateLink,
  STOCK_INITIAL: validateStock,
};

export function validateRows(type: ImportType, lines: RawLine[], mapping: ColumnMapping, ctx: ValidationContext): PreviewRow[] {
  const seen = new Map<string, number>();
  const validate = VALIDATORS[type];
  return lines.map((l) => ({ line: l.line, ...validate(l.cells, mapping, ctx, seen, l.line) }));
}
