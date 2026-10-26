import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { now } from "@/lib/clock";
import { noonAbidjan, todayAbidjan } from "@/lib/dates";
import { BusinessError } from "@/lib/errors";
import type { Prisma } from "@/generated/prisma/client";
import { log } from "@/modules/audit";
import { getRateAt } from "@/modules/currencies/service";
import { normalizeCode } from "@/modules/referentials/codes";
import { applyMovements, type MovementInput } from "@/modules/stock/movements";
import { resolveMapping } from "./mapping";
import { parseImportFile, type ParsedFile, type RawLine } from "./parse";
import {
  emptyContext,
  itemPatch,
  linkPatch,
  STOCK_INITIAL_REF,
  supplierPatch,
  validateRows,
  type ItemRef,
  type SupplierRef,
  type ValidationContext,
} from "./validate";
import {
  fieldInfos,
  IMPORT_TYPE_LABELS,
  type ColumnMapping,
  type ImportSummary,
  type ImportType,
  type PreviewResult,
  type PreviewRow,
} from "./types";

type Client = Prisma.TransactionClient;

export interface ImportActor {
  id: string;
}

export interface ImportInput {
  type: ImportType;
  fileName: string;
  buffer: Buffer;
  mapping?: ColumnMapping | null;
}

const CHUNK = 500;
const MOVEMENT_CHUNK = 200;
const AUDIT_ACTION = "IMPORT_COMMIT";

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

// ------------------------------------------------------------------ contexte (lecture)

function codesOf(lines: RawLine[], mapping: ColumnMapping, key: string, normalize = true): string[] {
  const h = mapping[key];
  if (!h) return [];
  const set = new Set<string>();
  for (const l of lines) {
    const v = (l.cells[h] ?? "").trim();
    if (v) set.add(normalize ? normalizeCode(v) : v);
  }
  return [...set];
}

async function loadItems(tx: Client, codes: string[]): Promise<Map<string, ItemRef>> {
  const map = new Map<string, ItemRef>();
  for (const part of chunks(codes, 1000)) {
    const rows = await tx.item.findMany({ where: { code: { in: part } } });
    for (const r of rows) map.set(r.code, { ...r, conversionFactor: r.conversionFactor.toString() });
  }
  return map;
}

async function loadSuppliers(tx: Client, codes: string[]): Promise<Map<string, SupplierRef>> {
  const map = new Map<string, SupplierRef>();
  for (const part of chunks(codes, 1000)) {
    const rows = await tx.supplier.findMany({ where: { code: { in: part } } });
    for (const r of rows) map.set(r.code, r);
  }
  return map;
}

async function loadContext(tx: Client, type: ImportType, lines: RawLine[], mapping: ColumnMapping, at: Date): Promise<ValidationContext> {
  const ctx = emptyContext(todayAbidjan(at));
  const activeCurrencies = async () => {
    const cur = await tx.currency.findMany({ where: { active: true }, select: { code: true } });
    ctx.currencies = new Set(cur.map((c) => c.code));
  };
  if (type === "ARTICLES") {
    ctx.items = await loadItems(tx, codesOf(lines, mapping, "code"));
    const barcodes = codesOf(lines, mapping, "barcode", false);
    if (barcodes.length) {
      for (const part of chunks(barcodes, 1000)) {
        const owners = await tx.item.findMany({ where: { barcode: { in: part } }, select: { code: true, barcode: true } });
        for (const o of owners) if (o.barcode) ctx.barcodeOwners.set(o.barcode, o.code);
      }
    }
    const ids = [...ctx.items.values()].map((i) => i.id);
    const codeById = new Map([...ctx.items.values()].map((i) => [i.id, i.code]));
    for (const part of chunks(ids, 1000)) {
      const priced = await tx.itemSupplier.findMany({ where: { itemId: { in: part }, active: true, lastPrice: { not: null } }, select: { itemId: true } });
      for (const p of priced) ctx.pricedItems.add(codeById.get(p.itemId)!);
    }
  } else if (type === "FOURNISSEURS") {
    ctx.suppliers = await loadSuppliers(tx, codesOf(lines, mapping, "code"));
    await activeCurrencies();
    const nccs = codesOf(lines, mapping, "ncc", false).map((n) => n.toUpperCase());
    for (const part of chunks(nccs, 1000)) {
      const owners = await tx.supplier.findMany({ where: { ncc: { in: part } }, select: { code: true, ncc: true } });
      for (const o of owners) if (o.ncc) ctx.nccOwners.set(o.ncc, o.code);
    }
  } else if (type === "ARTICLE_FOURNISSEUR") {
    ctx.items = await loadItems(tx, codesOf(lines, mapping, "itemCode"));
    ctx.suppliers = await loadSuppliers(tx, codesOf(lines, mapping, "supplierCode"));
    await activeCurrencies();
    const itemById = new Map([...ctx.items.values()].map((i) => [i.id, i.code]));
    const supplierById = new Map([...ctx.suppliers.values()].map((s) => [s.id, s.code]));
    for (const part of chunks([...itemById.keys()], 1000)) {
      const links = await tx.itemSupplier.findMany({ where: { itemId: { in: part }, supplierId: { in: [...supplierById.keys()] } } });
      for (const l of links) {
        const key = `${itemById.get(l.itemId)}|${supplierById.get(l.supplierId)}`;
        ctx.links.set(key, {
          id: l.id,
          supplierRef: l.supplierRef,
          lastPrice: str(l.lastPrice),
          currencyCode: l.currencyCode,
          leadTimeDays: l.leadTimeDays,
          minOrderQty: str(l.minOrderQty),
          active: l.active,
        });
      }
    }
  } else {
    ctx.items = await loadItems(tx, codesOf(lines, mapping, "itemCode"));
    const whs = await tx.warehouse.findMany({ where: { active: true }, select: { id: true, code: true } });
    ctx.warehouses = new Map(whs.map((w) => [w.code, w]));
    const itemById = new Map([...ctx.items.values()].map((i) => [i.id, i.code]));
    const whById = new Map(whs.map((w) => [w.id, w.code]));
    for (const part of chunks([...itemById.keys()], 1000)) {
      const groups = await tx.stockMovement.groupBy({ by: ["itemId", "warehouseId", "documentRef"], where: { itemId: { in: part } } });
      for (const g of groups) {
        const wh = whById.get(g.warehouseId);
        if (!wh) continue;
        const key = `${itemById.get(g.itemId)}|${wh}`;
        const state = ctx.stockState.get(key) ?? { initial: false, other: false };
        if (g.documentRef === STOCK_INITIAL_REF) state.initial = true;
        else state.other = true;
        ctx.stockState.set(key, state);
      }
    }
  }
  return ctx;
}

// ------------------------------------------------------------------ aperçu

function summarize(parsed: ParsedFile, type: ImportType, mapping: ColumnMapping, suggested: ColumnMapping, rows: PreviewRow[]): PreviewResult {
  const errorCount = rows.filter((r) => r.status === "ERREUR").length;
  return {
    type,
    headers: parsed.headers,
    suggestedMapping: suggested,
    mapping,
    fields: fieldInfos(type),
    rows,
    okCount: rows.length - errorCount,
    errorCount,
  };
}

/** Aperçu : aucune écriture. Erreurs par ligne (code manquant, catégorie inconnue, doublon, nombre invalide…). */
export async function previewImport(input: ImportInput, at: Date = now()): Promise<PreviewResult> {
  const parsed = await parseImportFile(input.fileName, input.buffer);
  const suggested = resolveMapping(input.type, parsed.headers, null);
  const mapping = resolveMapping(input.type, parsed.headers, input.mapping);
  const ctx = await loadContext(db, input.type, parsed.lines, mapping, at);
  return summarize(parsed, input.type, mapping, suggested, validateRows(input.type, parsed.lines, mapping, ctx));
}

// ------------------------------------------------------------------ import

type Outcome = "CREE" | "MIS_A_JOUR" | "INCHANGE" | "ERREUR";
interface ReportLine {
  line: number;
  key: string;
  outcome: Outcome;
  message: string;
}

interface Counts {
  created: number;
  updated: number;
  unchanged: number;
}

async function applyItems(tx: Client, actor: ImportActor, rows: PreviewRow[], ctx: ValidationContext): Promise<Counts> {
  const counts: Counts = { created: 0, updated: 0, unchanged: 0 };
  const creates = rows.filter((r) => r.action === "CREATE");
  for (const part of chunks(creates, CHUNK)) {
    await tx.item.createMany({
      data: part.map(({ data: d }) => ({
        code: d.code as string,
        name: d.name as string,
        category: d.category as "PDR",
        family: str(d.family),
        stockUnit: d.stockUnit as string,
        purchaseUnit: d.purchaseUnit as string,
        conversionFactor: d.conversionFactor as string,
        criticality: (d.criticality as "STANDARD" | null) ?? "STANDARD",
        stocked: d.category !== "SERVICE",
        equipment: d.category === "PDR" ? str(d.equipment) : null,
        barcode: str(d.barcode),
        createdById: actor.id,
      })),
    });
  }
  counts.created = creates.length;
  for (const r of rows.filter((x) => x.action === "UPDATE")) {
    const existing = ctx.items.get(r.data.code as string)!;
    await tx.item.update({ where: { id: existing.id }, data: itemPatch(existing, r.data) as Prisma.ItemUpdateInput });
    counts.updated++;
  }
  counts.unchanged = rows.filter((r) => r.action === "UNCHANGED").length;
  return counts;
}

async function applySuppliers(tx: Client, actor: ImportActor, rows: PreviewRow[], ctx: ValidationContext): Promise<Counts> {
  const creates = rows.filter((r) => r.action === "CREATE");
  for (const part of chunks(creates, CHUNK)) {
    await tx.supplier.createMany({
      data: part.map(({ data: d }) => ({
        code: d.code as string,
        name: d.name as string,
        type: d.type as "LOCAL",
        country: d.country as string,
        city: str(d.city),
        phone: str(d.phone),
        email: str(d.email),
        ncc: str(d.ncc),
        currencyCode: d.currencyCode as string,
        createdById: actor.id,
      })),
    });
  }
  let updated = 0;
  for (const r of rows.filter((x) => x.action === "UPDATE")) {
    const existing = ctx.suppliers.get(r.data.code as string)!;
    await tx.supplier.update({ where: { id: existing.id }, data: supplierPatch(existing, r.data) as Prisma.SupplierUpdateInput });
    updated++;
  }
  return { created: creates.length, updated, unchanged: rows.filter((r) => r.action === "UNCHANGED").length };
}

async function applyLinks(tx: Client, actor: ImportActor, rows: PreviewRow[], ctx: ValidationContext, at: Date): Promise<Counts> {
  const rates = new Map<string, Prisma.Decimal | null>();
  const rateOf = async (code: string) => {
    if (!rates.has(code)) {
      try {
        rates.set(code, (await getRateAt(tx, code, at)).rate);
      } catch (e) {
        if (!(e instanceof BusinessError) || e.code !== "RATE_MISSING") throw e;
        rates.set(code, null);
      }
    }
    return rates.get(code)!;
  };
  const history: Prisma.ItemPriceHistoryCreateManyInput[] = [];
  const priceHistory = async (itemId: string, supplierId: string, d: PreviewRow["data"], purchaseUnit: string) => {
    history.push({
      itemId,
      supplierId,
      price: d.price as string,
      currencyCode: d.currencyCode as string,
      rateToXof: await rateOf(d.currencyCode as string),
      priceUnit: purchaseUnit,
      source: "MANUEL",
      sourceRef: "Import",
      date: at,
      createdById: actor.id,
    });
  };

  const creates = rows.filter((r) => r.action === "CREATE");
  const createData: Prisma.ItemSupplierCreateManyInput[] = [];
  for (const { data: d } of creates) {
    const item = ctx.items.get(d.itemCode as string)!;
    const supplier = ctx.suppliers.get(d.supplierCode as string)!;
    const priced = d.price !== null;
    createData.push({
      itemId: item.id,
      supplierId: supplier.id,
      supplierRef: str(d.supplierRef),
      lastPrice: priced ? (d.price as string) : null,
      currencyCode: priced ? (d.currencyCode as string) : null,
      lastPriceDate: priced ? at : null,
      priceUnit: priced ? item.purchaseUnit : null,
      leadTimeDays: (d.leadTimeDays as number | null) ?? null,
      minOrderQty: str(d.minOrderQty),
      createdById: actor.id,
    });
    if (priced && d.currencyCode) await priceHistory(item.id, supplier.id, d, item.purchaseUnit);
  }
  for (const part of chunks(createData, CHUNK)) await tx.itemSupplier.createMany({ data: part });

  let updated = 0;
  for (const r of rows.filter((x) => x.action === "UPDATE")) {
    const d = r.data;
    const item = ctx.items.get(d.itemCode as string)!;
    const supplier = ctx.suppliers.get(d.supplierCode as string)!;
    const existing = ctx.links.get(`${d.itemCode}|${d.supplierCode}`)!;
    const patch = linkPatch(existing, d);
    const priceChanged = "lastPrice" in patch;
    await tx.itemSupplier.update({
      where: { id: existing.id },
      data: { ...(patch as Prisma.ItemSupplierUpdateInput), ...(priceChanged ? { lastPriceDate: at, priceUnit: item.purchaseUnit } : {}) },
    });
    if (priceChanged && d.currencyCode) await priceHistory(item.id, supplier.id, d, item.purchaseUnit);
    updated++;
  }
  for (const part of chunks(history, CHUNK)) await tx.itemPriceHistory.createMany({ data: part });
  return { created: creates.length, updated, unchanged: rows.filter((r) => r.action === "UNCHANGED").length };
}

/** Stock initial : uniquement par `StockMovement` AJUSTEMENT_INVENTAIRE (PMP initial = coût de l'entrée), jamais en direct. */
async function applyStock(tx: Client, actor: ImportActor, rows: PreviewRow[], ctx: ValidationContext, batchId: string, fileName: string, at: Date): Promise<Counts> {
  const creates = rows.filter((r) => r.action === "CREATE");
  const today = todayAbidjan(at);
  for (const part of chunks(creates, MOVEMENT_CHUNK)) {
    const inputs = part.map(({ data: d }): MovementInput => {
      const day = d.date as string;
      return {
        itemId: ctx.items.get(d.itemCode as string)!.id,
        warehouseId: ctx.warehouses.get(d.warehouseCode as string)!.id,
        type: "AJUSTEMENT_INVENTAIRE",
        quantity: d.quantity as string,
        unitCost: d.unitCost as string,
        documentType: "INVENTAIRE",
        documentId: batchId,
        documentRef: STOCK_INITIAL_REF,
        comment: `Stock initial (import ${fileName})`,
        occurredAt: day === today ? at : noonAbidjan(day),
        createdById: actor.id,
      };
    });
    await applyMovements(tx, inputs);
  }
  return { created: creates.length, updated: 0, unchanged: rows.filter((r) => r.action === "UNCHANGED").length };
}

function reportLines(rows: PreviewRow[]): ReportLine[] {
  return rows.map((r) => ({
    line: r.line,
    key: r.key ?? "",
    outcome: r.status === "ERREUR" ? "ERREUR" : r.action === "CREATE" ? "CREE" : r.action === "UPDATE" ? "MIS_A_JOUR" : "INCHANGE",
    message: r.status === "ERREUR" ? r.errors.join(" ") : (r.warnings ?? []).join(" "),
  }));
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

/**
 * Import des lignes valides seulement, dans une transaction : tout ou rien côté technique, ligne par ligne côté métier.
 * Idempotent : un ré-import ne crée rien (lignes « inchangées »). Une trace d'audit par import (fichier, lignes, erreurs).
 */
export async function commitImport(actor: ImportActor, input: ImportInput, ip?: string | null, at: Date = now()): Promise<ImportSummary> {
  const parsed = await parseImportFile(input.fileName, input.buffer);
  const mapping = resolveMapping(input.type, parsed.headers, input.mapping);
  const batchId = randomUUID();
  try {
    return await db.$transaction(
      async (tx) => {
        const ctx = await loadContext(tx, input.type, parsed.lines, mapping, at);
        const rows = validateRows(input.type, parsed.lines, mapping, ctx);
        const valid = rows.filter((r) => r.status === "OK");
        const counts =
          input.type === "ARTICLES"
            ? await applyItems(tx, actor, valid, ctx)
            : input.type === "FOURNISSEURS"
              ? await applySuppliers(tx, actor, valid, ctx)
              : input.type === "ARTICLE_FOURNISSEUR"
                ? await applyLinks(tx, actor, valid, ctx, at)
                : await applyStock(tx, actor, valid, ctx, batchId, input.fileName, at);
        const summary: ImportSummary = {
          batchId,
          type: input.type,
          fileName: input.fileName,
          totalRows: rows.length,
          okCount: valid.length,
          errorCount: rows.length - valid.length,
          ...counts,
        };
        await log(tx, {
          userId: actor.id,
          action: AUDIT_ACTION,
          entity: "ImportBatch",
          entityId: batchId,
          after: { ...summary, typeLabel: IMPORT_TYPE_LABELS[input.type], at: at.toISOString(), lines: reportLines(rows) },
          ip,
        });
        return summary;
      },
      { timeout: 300_000, maxWait: 30_000 },
    );
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new BusinessError("IMPORT_CONFLIT", "Un code ou un code-barres existe déjà (import simultané ?). Relancez l'aperçu puis l'import.");
    }
    throw e;
  }
}

// ------------------------------------------------------------------ rapport

export interface ImportReport {
  summary: ImportSummary & { typeLabel: string; at: string };
  lines: ReportLine[];
}

export async function getImportReport(batchId: string): Promise<ImportReport> {
  const entry = await db.auditLog.findFirst({ where: { action: AUDIT_ACTION, entity: "ImportBatch", entityId: batchId } });
  if (!entry || !entry.after) throw new BusinessError("NOT_FOUND", "Rapport d'import introuvable.");
  const after = entry.after as unknown as ImportReport["summary"] & { lines: ReportLine[] };
  const { lines, ...summary } = after;
  return { summary, lines };
}
