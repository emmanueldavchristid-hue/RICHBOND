import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { BusinessError } from "@/lib/errors";
import { requireAction } from "@/lib/permissions";
import { isRateStale } from "@/modules/currencies/rate";
import { alreadyOrderedWarnings, type OrderWarning } from "./warnings";
import { assertSupplierCanOrder } from "@/modules/suppliers";
import { toStockQty } from "@/modules/referentials/conversion";
import { assertTransition as assertRequestTransition } from "@/modules/purchase-requests/workflow";
import { displayNumber } from "@/modules/purchase-requests/labels";
import { convertQty, isQtyOverWarning, qtyOverPct, validateAllocations, type ItemUnits, type RequestLineForAllocation } from "./allocation";
import { allocatedElsewhere, dateOnly, isoDay, latestRate, lockRequests, type FullOrder, type OrderActor, type Tx } from "./internal";
import { assertRequestedDateNotPast } from "./rules";
import type { createOrderSchema } from "./schemas";
import { computeTotals, parseUnitPrice, type OrderTotals } from "./totals";

export type ParsedOrderInput = z.output<typeof createOrderSchema>;

/** Statuts de DA sur lesquels on peut rattacher un BC (COMMANDEE : un avenant garde ses rattachements). */
const ALLOCATABLE_REQUEST_STATUSES = ["VALIDEE", "EN_CONSULTATION", "PARTIELLEMENT_COMMANDEE", "COMMANDEE"] as const;

export interface PreparedLine {
  lineNo: number;
  itemId: string | null;
  freeDesignation: string | null;
  supplierRef: string | null;
  quantity: Prisma.Decimal;
  unit: string;
  stockQty: Prisma.Decimal | null;
  unitPrice: Prisma.Decimal;
  discountPct: Prisma.Decimal;
  vatRate: Prisma.Decimal;
  netAmount: Prisma.Decimal;
  note: string | null;
  allocations: { requestLineId: string; qty: Prisma.Decimal }[];
}

export interface PreparedContent {
  supplier: { id: string; code: string; name: string; status: string };
  header: {
    type: "LOCAL" | "IMPORT";
    origin: "DA" | "DIRECT";
    directReason: string | null;
    supplierId: string;
    currencyCode: string;
    exchangeRate: Prisma.Decimal | null;
    rateDate: Date | null;
    paymentTerm: Prisma.PurchaseOrderUncheckedCreateInput["paymentTerm"];
    paymentTermNote: string | null;
    incoterm: Prisma.PurchaseOrderUncheckedCreateInput["incoterm"] | null;
    incotermPlace: string | null;
    warehouseId: string;
    deliveryAddress: string;
    requestedDate: Date;
    supplierRef: string | null;
    notes: string | null;
    internalNote: string | null;
    totalHt: Prisma.Decimal;
    totalVat: Prisma.Decimal;
    totalTtc: Prisma.Decimal;
    totalHtXof: number | null;
    totalTtcXof: number | null;
  };
  lines: PreparedLine[];
  charges: { label: string; amount: Prisma.Decimal; vatRate: Prisma.Decimal }[];
  totals: OrderTotals;
  warnings: OrderWarning[];
}

export interface ContentContext {
  at: Date;
  today: string;
  /** BC existant (modification) ; null à la création. */
  existing: FullOrder | null;
  defaultVatRate: number;
}

/**
 * Valide et prépare tout le contenu d'un BC (création ou modification) : fournisseur, devise, dépôt, lignes, unités,
 * prix, frais, totaux et allocations. Les allocations sont contrôlées sous le verrou des DA sources (D7).
 */
export async function buildContent(tx: Tx, actor: OrderActor, input: ParsedOrderInput, ctx: ContentContext): Promise<PreparedContent> {
  const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
  if (!supplier) throw new BusinessError("NOT_FOUND", "Fournisseur introuvable.");
  assertSupplierCanOrder(supplier);
  const type = supplier.type;
  const ex = ctx.existing;
  if (ex && ex.version > 1 && ex.supplierId !== supplier.id) {
    throw new BusinessError("SUPPLIER_LOCKED", "Le fournisseur d'un avenant ne peut pas changer.");
  }
  if (ex && ex.origin !== input.origin) throw new BusinessError("VALIDATION", "L'origine d'un bon de commande ne peut pas changer.");
  requireAction(actor, "purchaseOrder.create", { scope: type });
  if (input.origin === "DIRECT" && actor.role !== "RESPONSABLE_ACHATS") {
    throw new BusinessError("FORBIDDEN", "Une commande directe sans demande d'achat est réservée au Responsable Achats.");
  }

  const currencyCode = input.currencyCode ?? supplier.currencyCode;
  const currency = await tx.currency.findUnique({ where: { code: currencyCode } });
  if (!currency || (!currency.active && ex?.currencyCode !== currencyCode)) {
    throw new BusinessError("CURRENCY_INVALID", "Devise inconnue ou désactivée.");
  }
  const warehouse = await tx.warehouse.findUnique({ where: { id: input.warehouseId } });
  if (!warehouse || (!warehouse.active && ex?.warehouseId !== warehouse?.id)) {
    throw new BusinessError("WAREHOUSE_INVALID", "Dépôt inconnu ou désactivé.");
  }
  const requestedChanged = !ex || isoDay(ex.requestedDate) !== input.requestedDate;
  if (requestedChanged) assertRequestedDateNotPast(input.requestedDate, ctx.today);

  const indicative = await latestRate(tx, currencyCode, ctx.at);
  const rate = currencyCode === "XOF" ? null : (indicative?.rate ?? null);

  // ---- lignes
  const itemIds = input.lines.map((l) => l.itemId).filter((x): x is string => !!x);
  const items = new Map((await tx.item.findMany({ where: { id: { in: itemIds } } })).map((i) => [i.id, i]));
  const links = new Map(
    (await tx.itemSupplier.findMany({ where: { supplierId: supplier.id, itemId: { in: itemIds } }, select: { itemId: true, supplierRef: true } })).map((l) => [l.itemId, l]),
  );
  const lines: PreparedLine[] = input.lines.map((l, idx) => {
    const lineNo = idx + 1;
    const unitPrice = parseUnitPrice(l.unitPrice, currencyCode, currency.decimals);
    const vatRate = new Prisma.Decimal(l.vatRate ?? (type === "IMPORT" ? 0 : ctx.defaultVatRate));
    const base = {
      lineNo,
      unitPrice,
      discountPct: new Prisma.Decimal(l.discountPct),
      vatRate,
      note: l.note,
      allocations: l.allocations.map((a) => ({ requestLineId: a.requestLineId, qty: new Prisma.Decimal(a.qty) })),
    };
    const quantity = new Prisma.Decimal(l.quantity);
    if (!l.itemId) {
      return { ...base, itemId: null, freeDesignation: l.freeDesignation, supplierRef: l.supplierRef, quantity, unit: l.unit!, stockQty: null, netAmount: new Prisma.Decimal(0) };
    }
    const it = items.get(l.itemId);
    if (!it) throw new BusinessError("NOT_FOUND", `Ligne ${lineNo} : article introuvable.`);
    if (it.status !== "ACTIF") throw new BusinessError("ITEM_NOT_ACTIVE", `Ligne ${lineNo} : l'article ${it.code} est bloqué ou obsolète.`);
    const unit = l.unit ?? it.purchaseUnit;
    if (unit !== it.purchaseUnit) {
      throw new BusinessError("UNIT_INVALID", `Ligne ${lineNo} : un bon de commande se saisit en unité d'achat (${it.purchaseUnit}) pour l'article ${it.code}.`);
    }
    return {
      ...base,
      itemId: it.id,
      freeDesignation: null,
      supplierRef: l.supplierRef ?? links.get(it.id)?.supplierRef ?? null,
      quantity,
      unit,
      stockQty: toStockQty(quantity, it.conversionFactor),
      netAmount: new Prisma.Decimal(0),
    };
  });

  // ---- montants
  const totals = computeTotals(
    lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, discountPct: l.discountPct, vatRate: l.vatRate })),
    input.charges.map((c) => ({ amount: c.amount, vatRate: c.vatRate })),
    { currencyCode, decimals: currency.decimals, rate },
  );
  lines.forEach((l, i) => (l.netAmount = totals.lineNets[i]));
  const charges = input.charges.map((c) => ({
    label: c.label,
    amount: parseUnitPrice(c.amount, currencyCode, currency.decimals),
    vatRate: new Prisma.Decimal(c.vatRate),
  }));

  // ---- allocations (sous verrou des DA sources)
  const warnings: OrderWarning[] = [];
  const allocated = await checkAllocations(tx, actor, lines, ex, items);
  for (const l of lines) {
    const pct = qtyOverPct(l.quantity, allocated.get(l.lineNo) ?? 0);
    if (isQtyOverWarning(pct)) {
      warnings.push({
        code: "QTY_OVER_REQUEST",
        lineNo: l.lineNo,
        message: `Ligne ${l.lineNo} : quantité commandée +${pct!.toString().replace(".", ",")} % par rapport aux demandes d'achat.`,
      });
    }
  }

  if (supplier.status === "EN_EVALUATION") {
    warnings.push({ code: "SUPPLIER_IN_EVALUATION", message: `Le fournisseur « ${supplier.name} » est en évaluation.` });
  }
  if (currencyCode !== "XOF" && indicative && isRateStale(indicative.date, ctx.at)) {
    warnings.push({ code: "RATE_STALE", message: `Le dernier taux ${currencyCode} date de plus de 30 jours : mettez-le à jour avant la validation.` });
  }
  warnings.push(...(await alreadyOrderedWarnings(tx, itemIds, ex?.id ?? null)));

  const incoterm = input.incoterm ?? (type === "IMPORT" ? supplier.incoterm : null);
  return {
    supplier: { id: supplier.id, code: supplier.code, name: supplier.name, status: supplier.status },
    header: {
      type,
      origin: input.origin,
      directReason: input.origin === "DIRECT" ? input.directReason : null,
      supplierId: supplier.id,
      currencyCode,
      exchangeRate: rate,
      rateDate: rate && indicative ? indicative.date : null,
      paymentTerm: input.paymentTerm ?? supplier.paymentTerm,
      paymentTermNote: input.paymentTerm ? input.paymentTermNote : (input.paymentTermNote ?? supplier.paymentTermNote),
      incoterm,
      incotermPlace: incoterm ? input.incotermPlace : null,
      warehouseId: warehouse.id,
      deliveryAddress: input.deliveryAddress ?? warehouse.address ?? "",
      requestedDate: dateOnly(input.requestedDate),
      supplierRef: input.supplierRef,
      notes: input.notes,
      internalNote: input.internalNote,
      totalHt: totals.totalHt,
      totalVat: totals.totalVat,
      totalTtc: totals.totalTtc,
      totalHtXof: totals.totalHtXof,
      totalTtcXof: totals.totalTtcXof,
    },
    lines,
    charges,
    totals,
    warnings,
  };
}

/**
 * Contrôle des allocations sous verrou : DA sources commandables, droit de création sur les DA nouvellement
 * rattachées (D5), puis reste à commander (D7) et quantités (D8). Ajoute l'avertissement « quantité > besoin ».
 */
export async function checkAllocations(
  tx: Tx,
  actor: OrderActor,
  lines: Pick<PreparedLine, "lineNo" | "itemId" | "quantity" | "unit" | "allocations">[],
  existing: FullOrder | null,
  itemsHint: Map<string, ItemUnits & { id: string }> | null,
): Promise<Map<number, Prisma.Decimal>> {
  const allocated = new Map<number, Prisma.Decimal>();
  const requestLineIds = [...new Set(lines.flatMap((l) => l.allocations.map((a) => a.requestLineId)))];
  if (requestLineIds.length === 0) return allocated;
  const first = await tx.purchaseRequestLine.findMany({ where: { id: { in: requestLineIds } }, select: { requestId: true } });
  await lockRequests(tx, first.map((r) => r.requestId));
  // Relecture après verrou : besoin et statut à jour.
  const rows = await tx.purchaseRequestLine.findMany({
    where: { id: { in: requestLineIds } },
    include: { request: { select: { id: true, number: true, status: true, kind: true, type: true, createdById: true, assignedBuyerId: true } } },
  });
  const elsewhere = await allocatedElsewhere(tx, requestLineIds, existing?.id);
  const previous = new Set(existing?.lines.flatMap((l) => l.allocations.map((a) => a.requestLineId)) ?? []);

  const requestLines = new Map<string, RequestLineForAllocation>();
  for (const r of rows) {
    const label = `${displayNumber(r.request)} ligne ${r.lineNo}`;
    if (!(ALLOCATABLE_REQUEST_STATUSES as readonly string[]).includes(r.request.status)) {
      throw new BusinessError("ALLOCATION_INVALID", `${displayNumber(r.request)} n'est plus commandable (statut « ${r.request.status} »).`);
    }
    if (!previous.has(r.id)) {
      // D5 : acheteur assigné, Responsable, ou tout acheteur du périmètre si la DA n'est pas assignée.
      assertRequestTransition(
        { status: r.request.status, createdById: r.request.createdById, kind: r.request.kind, assignedBuyerId: r.request.assignedBuyerId, type: r.request.type },
        "createOrder",
        actor,
      );
    }
    requestLines.set(r.id, {
      id: r.id,
      itemId: r.itemId,
      unit: r.unit,
      need: r.approvedQty ?? r.quantity,
      allocatedElsewhere: elsewhere.get(r.id) ?? new Prisma.Decimal(0),
      label,
    });
  }
  const itemIds = lines.map((l) => l.itemId).filter((x): x is string => !!x);
  const items = new Map<string, ItemUnits>();
  for (const id of itemIds) {
    const it = itemsHint?.get(id) ?? (await tx.item.findUnique({ where: { id } }));
    if (it) items.set(id, it);
  }
  validateAllocations(lines, requestLines, items);
  // Besoin rattaché à chaque ligne, exprimé dans son unité de commande (pour l'avertissement « +x % par rapport aux DA »).
  for (const l of lines) {
    let sum = new Prisma.Decimal(0);
    const it = l.itemId ? items.get(l.itemId) : undefined;
    for (const a of l.allocations) {
      const unit = requestLines.get(a.requestLineId)!.unit;
      sum = sum.plus(it ? convertQty(a.qty, unit, l.unit, it) : a.qty);
    }
    allocated.set(l.lineNo, sum);
  }
  return allocated;
}
