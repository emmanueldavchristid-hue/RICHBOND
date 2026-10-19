import type { Prisma } from "@/generated/prisma/client";
import { expectedDateColumn, isoDay } from "./day";
import type { FullOrder } from "./include";
import { computeTotals } from "./totals";

/**
 * Instantané d'une version de BC (JSON) : sert au PDF de toute version validée et à la restauration exacte quand un
 * avenant est refusé ou abandonné (D16). Les décimaux sont des chaînes.
 */
export interface SnapshotLine {
  lineNo: number;
  itemId: string | null;
  itemCode: string | null;
  designation: string;
  supplierRef: string | null;
  quantity: string;
  unit: string;
  stockQty: string | null;
  unitPrice: string;
  discountPct: string;
  vatRate: string;
  netAmount: string;
  lastPriceXof: number | null;
  priceDeltaPct: string | null;
  note: string | null;
  allocations: { requestLineId: string; qty: string }[];
}

export interface OrderSnapshot {
  schema: 1;
  orderId: string;
  number: string | null;
  version: number;
  type: "LOCAL" | "IMPORT";
  origin: "DA" | "DIRECT" | "OFFRE";
  directReason: string | null;
  /** Date du bon : jour de validation (yyyy-MM-dd) ; null pour un aperçu. */
  orderDate: string | null;
  supplier: {
    id: string;
    code: string;
    name: string;
    address: string | null;
    city: string | null;
    country: string;
    phone: string | null;
    email: string | null;
    contact: { name: string; phone: string | null; email: string | null } | null;
  };
  currencyCode: string;
  currencyDecimals: number;
  exchangeRate: string | null;
  rateDate: string | null;
  paymentTerm: string;
  paymentTermNote: string | null;
  incoterm: string | null;
  incotermPlace: string | null;
  warehouse: { id: string; code: string; name: string };
  deliveryAddress: string;
  requestedDate: string;
  supplierRef: string | null;
  notes: string | null;
  internalNote: string | null;
  createdByName: string;
  lines: SnapshotLine[];
  charges: { label: string; amount: string; vatRate: string }[];
  totals: {
    totalHt: string;
    totalVat: string;
    totalTtc: string;
    chargesTotal: string;
    totalHtXof: number | null;
    totalTtcXof: number | null;
    vat: { rate: number; base: string; vat: string }[];
  };
  approval: { approvedAt: string; approvedById: string; approvedByName: string; autoApproved: boolean; underThreshold: boolean } | null;
}

export function buildSnapshot(
  po: FullOrder,
  approval: { approvedAt: Date; approvedById: string; approvedByName: string; autoApproved: boolean; underThreshold: boolean } | null,
): OrderSnapshot {
  const totals = computeTotals(
    po.lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, discountPct: l.discountPct, vatRate: l.vatRate })),
    po.charges.map((c) => ({ amount: c.amount, vatRate: c.vatRate })),
    { currencyCode: po.currencyCode, decimals: po.currency.decimals, rate: po.exchangeRate },
  );
  const contact = po.supplier.contacts[0] ?? null;
  return {
    schema: 1,
    orderId: po.id,
    number: po.number,
    version: po.version,
    type: po.type,
    origin: po.origin,
    directReason: po.directReason,
    orderDate: approval ? approval.approvedAt.toISOString().slice(0, 10) : null,
    supplier: {
      id: po.supplier.id,
      code: po.supplier.code,
      name: po.supplier.name,
      address: po.supplier.address,
      city: po.supplier.city,
      country: po.supplier.country,
      phone: po.supplier.phone,
      email: po.supplier.email,
      contact: contact ? { name: contact.name, phone: contact.phone, email: contact.email } : null,
    },
    currencyCode: po.currencyCode,
    currencyDecimals: po.currency.decimals,
    exchangeRate: po.exchangeRate?.toString() ?? null,
    rateDate: po.rateDate ? isoDay(po.rateDate) : null,
    paymentTerm: po.paymentTerm,
    paymentTermNote: po.paymentTermNote,
    incoterm: po.incoterm,
    incotermPlace: po.incotermPlace,
    warehouse: { id: po.warehouse.id, code: po.warehouse.code, name: po.warehouse.name },
    deliveryAddress: po.deliveryAddress,
    requestedDate: isoDay(po.requestedDate),
    supplierRef: po.supplierRef,
    notes: po.notes,
    internalNote: po.internalNote,
    createdByName: po.createdBy.name,
    lines: po.lines.map((l) => ({
      lineNo: l.lineNo,
      itemId: l.itemId,
      itemCode: l.item?.code ?? null,
      designation: l.item?.name ?? l.freeDesignation ?? "",
      supplierRef: l.supplierRef,
      quantity: l.quantity.toString(),
      unit: l.unit,
      stockQty: l.stockQty?.toString() ?? null,
      unitPrice: l.unitPrice.toString(),
      discountPct: l.discountPct.toString(),
      vatRate: l.vatRate.toString(),
      netAmount: l.netAmount.toString(),
      lastPriceXof: l.lastPriceXof,
      priceDeltaPct: l.priceDeltaPct?.toString() ?? null,
      note: l.note,
      allocations: l.allocations.map((a) => ({ requestLineId: a.requestLineId, qty: a.qty.toString() })),
    })),
    charges: po.charges.map((c) => ({ label: c.label, amount: c.amount.toString(), vatRate: c.vatRate.toString() })),
    totals: {
      totalHt: totals.totalHt.toString(),
      totalVat: totals.totalVat.toString(),
      totalTtc: totals.totalTtc.toString(),
      chargesTotal: totals.chargesTotal.toString(),
      totalHtXof: totals.totalHtXof,
      totalTtcXof: totals.totalTtcXof,
      vat: totals.vat.map((v) => ({ rate: v.rate, base: v.base.toString(), vat: v.vat.toString() })),
    },
    approval: approval
      ? {
          approvedAt: approval.approvedAt.toISOString(),
          approvedById: approval.approvedById,
          approvedByName: approval.approvedByName,
          autoApproved: approval.autoApproved,
          underThreshold: approval.underThreshold,
        }
      : null,
  };
}

/**
 * Remet le BC dans l'état exact de la version `snap` (avenant refusé ou abandonné) : en-tête, lignes, allocations,
 * frais. Le statut, la version et les événements sont gérés par l'appelant.
 */
export async function restoreFromSnapshot(tx: Prisma.TransactionClient, orderId: string, snap: OrderSnapshot): Promise<void> {
  await tx.purchaseOrderLine.deleteMany({ where: { orderId } });
  await tx.purchaseOrderCharge.deleteMany({ where: { orderId } });
  const promisedDate = (await tx.purchaseOrder.findUniqueOrThrow({ where: { id: orderId }, select: { promisedDate: true } })).promisedDate;
  const requestedDate = new Date(`${snap.requestedDate}T00:00:00.000Z`);
  await tx.purchaseOrder.update({
    where: { id: orderId },
    data: {
      supplierId: snap.supplier.id,
      currencyCode: snap.currencyCode,
      exchangeRate: snap.exchangeRate,
      rateDate: snap.rateDate ? new Date(`${snap.rateDate}T00:00:00.000Z`) : null,
      paymentTerm: snap.paymentTerm as never,
      paymentTermNote: snap.paymentTermNote,
      incoterm: snap.incoterm as never,
      incotermPlace: snap.incotermPlace,
      warehouseId: snap.warehouse.id,
      deliveryAddress: snap.deliveryAddress,
      requestedDate,
      expectedDate: expectedDateColumn({ promisedDate, requestedDate }),
      supplierRef: snap.supplierRef,
      notes: snap.notes,
      internalNote: snap.internalNote,
      totalHt: snap.totals.totalHt,
      totalVat: snap.totals.totalVat,
      totalTtc: snap.totals.totalTtc,
      totalHtXof: snap.totals.totalHtXof,
      totalTtcXof: snap.totals.totalTtcXof,
    },
  });
  for (const l of snap.lines) {
    await tx.purchaseOrderLine.create({
      data: {
        orderId,
        lineNo: l.lineNo,
        itemId: l.itemId,
        freeDesignation: l.itemId ? null : l.designation,
        supplierRef: l.supplierRef,
        quantity: l.quantity,
        unit: l.unit,
        stockQty: l.stockQty,
        unitPrice: l.unitPrice,
        discountPct: l.discountPct,
        vatRate: l.vatRate,
        netAmount: l.netAmount,
        lastPriceXof: l.lastPriceXof,
        priceDeltaPct: l.priceDeltaPct,
        note: l.note,
        allocations: { create: l.allocations.map((a) => ({ requestLineId: a.requestLineId, qty: a.qty })) },
      },
    });
  }
  if (snap.charges.length > 0) {
    await tx.purchaseOrderCharge.createMany({
      data: snap.charges.map((c) => ({ orderId, label: c.label, amount: c.amount, vatRate: c.vatRate })),
    });
  }
}
