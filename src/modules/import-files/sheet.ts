import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { BusinessError } from "@/lib/errors";
import { latestRate } from "@/modules/purchase-orders/internal";
import { Decimal } from "@/modules/stock/pmp";
import type { AllocationLine } from "./allocation";
import type { AllocationKeyCode, CostStatusCode, ImportModeCode, ImportStatusCode } from "./labels";
import { approachCoefficient, computeLandedCost, planReappraisal, toXof, type LandedCostInput, type ReappraisalLot } from "./landed-cost";

/**
 * Fiche de calcul du coût de revient import (LOT-12) : chargement des données du dossier puis calcul pur.
 * Partagée par la lecture (aperçu en direct), l'export et la clôture (qui la fige dans `ImportFile.closingSheet`).
 * Tous les nombres décimaux sont des chaînes (JSON sans perte).
 */
type Client = Prisma.TransactionClient;

export interface SheetLine {
  orderLineId: string;
  orderId: string;
  orderNumber: string;
  lineNo: number;
  itemId: string | null;
  itemCode: string | null;
  designation: string;
  stockUnit: string | null;
  stocked: boolean;
  warehouseId: string | null;
  /** RECU : quantités et valeurs de la réception ; COMMANDE : estimation sur le bon de commande. */
  source: "RECU" | "COMMANDE";
  qty: string;
  weightKg: string | null;
  volumeM3: string | null;
  goodsValueXof: number;
  allocatedXof: number;
  landedValueXof: number;
  unitGoodsCost: string;
  unitLandedCost: string;
  /** Coefficient propre à la ligne (coût dédouané / valeur). */
  coefficient: string | null;
  receiptLines: { id: string; acceptedStockQty: string; unitCostXof: string; warehouseId: string }[];
}

export interface SheetCost {
  id: string;
  typeCode: string;
  typeLabel: string;
  status: CostStatusCode;
  amount: string;
  currencyCode: string;
  rate: string;
  amountXof: number;
  vatRecoverable: boolean;
  allocationKey: AllocationKeyCode;
  keyUsed: AllocationKeyCode;
  /** Clé demandée non applicable (poids/volume manquant) : valeur utilisée. */
  fallback: boolean;
  excluded: boolean;
  payee: string | null;
  /** Part de chaque ligne (même ordre que `lines`). */
  allocations: number[];
}

export interface SheetReappraisal {
  itemId: string;
  itemCode: string;
  designation: string;
  warehouseId: string;
  warehouseName: string;
  receivedQty: string;
  stockQty: string;
  totalXof: number;
  appliedXof: number;
  /** Surcoût des quantités déjà sorties : exposé ici, jamais réécrit dans les sorties passées. */
  exposedXof: number;
  pmpBefore: string;
  pmpAfter: string;
}

export interface CostSheet {
  file: {
    id: string;
    number: string;
    status: ImportStatusCode;
    supplierName: string;
    supplierCountry: string;
    mode: ImportModeCode;
    incoterm: string | null;
    incotermPlace: string | null;
    loadingPort: string | null;
    transitaire: string | null;
    blNumber: string | null;
    containerNumber: string | null;
    customsDeclaration: string | null;
    customsRegime: string | null;
    orders: string[];
    closedAt: string | null;
  };
  lines: SheetLine[];
  costs: SheetCost[];
  totals: {
    goodsValueXof: number;
    costsXof: number;
    excludedXof: number;
    landedXof: number;
    coefficient: string | null;
    estimatedCostCount: number;
  };
  reappraisal: SheetReappraisal[];
  /** Avertissements affichés au-dessus de la fiche (taux manquant, poids absents...). */
  warnings: string[];
  /** Vrai pour la fiche figée à la clôture. */
  final: boolean;
  generatedAt: string;
}

const dec = (v: Prisma.Decimal | string | number) => new Decimal(String(v));

const FILE_INCLUDE = {
  supplier: { select: { name: true, country: true } },
  orders: {
    include: {
      order: {
        include: {
          lines: {
            orderBy: { lineNo: "asc" },
            include: {
              item: { select: { id: true, code: true, name: true, stockUnit: true, stocked: true } },
              receiptLines: { where: { receipt: { status: "VALIDEE" } }, include: { receipt: { select: { warehouseId: true } } } },
            },
          },
        },
      },
    },
  },
  costs: { include: { type: { select: { code: true, label: true, sortOrder: true } } }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.ImportFileInclude;

/** Tout ce dont le calcul a besoin ; `at` sert au dernier taux connu des BC sans taux figé. */
export async function computeCostSheet(tx: Client, fileId: string, at: Date): Promise<CostSheet> {
  const file = await tx.importFile.findUnique({ where: { id: fileId }, include: FILE_INCLUDE });
  if (!file) throw new BusinessError("NOT_FOUND", "Dossier import introuvable.");
  if (file.status === "CLOTURE" && file.closingSheet) return { ...(file.closingSheet as unknown as CostSheet), final: true };

  const warnings: string[] = [];
  const lines: Omit<SheetLine, "allocatedXof" | "landedValueXof" | "unitGoodsCost" | "unitLandedCost" | "coefficient">[] = [];
  const allocLines: AllocationLine[] = [];

  for (const link of [...file.orders].sort((a, b) => (a.order.number ?? "").localeCompare(b.order.number ?? ""))) {
    const po = link.order;
    const finished = po.status === "RECU" || po.status === "CLOTURE";
    let rate: Decimal | null = po.currencyCode === "XOF" ? dec(1) : po.exchangeRate ? dec(po.exchangeRate) : null;
    for (const l of po.lines) {
      const received = l.receiptLines;
      const receivedStock = received.reduce((a, r) => a.add(r.acceptedStockQty), dec(0));
      const receivedPurchase = received.reduce((a, r) => a.add(r.acceptedQty), dec(0));
      let source: "RECU" | "COMMANDE";
      let qty: Decimal;
      let value: number;
      let purchaseQty: Decimal;
      if (receivedStock.gt(0)) {
        source = "RECU";
        qty = receivedStock;
        purchaseQty = receivedPurchase;
        value = received.reduce((a, r) => a + toXof(r.acceptedStockQty, r.unitCostXof), 0);
      } else if (finished) {
        continue; // ligne soldée sans rien recevoir : rien n'arrive au magasin
      } else {
        source = "COMMANDE";
        qty = dec(l.stockQty ?? l.quantity);
        purchaseQty = dec(l.quantity);
        if (!rate) {
          const found = await latestRate(tx, po.currencyCode, at);
          rate = found ? dec(found.rate) : null;
        }
        if (!rate) {
          warnings.push(`Taux ${po.currencyCode} inconnu pour le bon ${po.number ?? ""} : valeur marchandise non estimée.`);
          value = 0;
        } else {
          value = toXof(l.netAmount, rate);
        }
      }
      const weight = l.unitWeightKg ? dec(l.unitWeightKg).mul(purchaseQty) : null;
      const volume = l.unitVolumeM3 ? dec(l.unitVolumeM3).mul(purchaseQty) : null;
      const designation = l.item?.name ?? l.freeDesignation ?? "Article hors catalogue";
      lines.push({
        orderLineId: l.id,
        orderId: po.id,
        orderNumber: po.number ?? "(sans numéro)",
        lineNo: l.lineNo,
        itemId: l.itemId,
        itemCode: l.item?.code ?? null,
        designation,
        stockUnit: l.item?.stockUnit ?? l.unit,
        stocked: !!l.item?.stocked,
        warehouseId: received[0]?.receipt.warehouseId ?? po.warehouseId,
        source,
        qty: qty.toString(),
        weightKg: weight?.toString() ?? null,
        volumeM3: volume?.toString() ?? null,
        goodsValueXof: value,
        receiptLines: received.map((r) => ({
          id: r.id,
          acceptedStockQty: r.acceptedStockQty.toString(),
          unitCostXof: r.unitCostXof.toString(),
          warehouseId: r.receipt.warehouseId,
        })),
      });
      allocLines.push({ id: l.id, valueXof: value, weightKg: weight, volumeM3: volume, qty });
    }
  }

  const costInputs: LandedCostInput[] = file.costs.map((c) => ({ id: c.id, amountXof: c.amountXof, vatRecoverable: c.vatRecoverable, key: c.allocationKey }));
  const landed = computeLandedCost(allocLines, costInputs);

  const sheetLines: SheetLine[] = lines.map((l, i) => {
    const r = landed.lines[i];
    return {
      ...l,
      allocatedXof: r.allocatedXof,
      landedValueXof: r.landedValueXof,
      unitGoodsCost: r.unitGoodsCost.toString(),
      unitLandedCost: r.unitLandedCost.toString(),
      coefficient: approachCoefficient(r.landedValueXof, r.goodsValueXof)?.toString() ?? null,
    };
  });
  const sheetCosts: SheetCost[] = file.costs.map((c, i) => {
    const b = landed.costs[i];
    return {
      id: c.id,
      typeCode: c.type.code,
      typeLabel: c.type.label,
      status: c.status,
      amount: c.amount.toString(),
      currencyCode: c.currencyCode,
      rate: c.rate.toString(),
      amountXof: c.amountXof,
      vatRecoverable: c.vatRecoverable,
      allocationKey: c.allocationKey,
      keyUsed: b.keyUsed,
      fallback: b.fallback,
      excluded: b.excluded,
      payee: c.payee,
      allocations: b.amounts,
    };
  });
  for (const c of sheetCosts) {
    if (c.fallback) warnings.push(`${c.typeLabel} : poids ou volume manquant sur au moins une ligne, répartition faite sur la valeur.`);
  }
  if (sheetLines.length === 0) warnings.push("Aucune marchandise : rattachez au moins un bon de commande import au dossier.");

  // Réajustement du PMP : un plan par couple article x dépôt, sur les lignes déjà reçues seulement.
  const groups = new Map<string, { line: SheetLine; warehouseId: string; lots: ReappraisalLot[] }>();
  for (const l of sheetLines) {
    if (l.source !== "RECU" || !l.itemId || !l.stocked) continue;
    for (const r of l.receiptLines) {
      const key = `${l.itemId}|${r.warehouseId}`;
      const g = groups.get(key) ?? { line: l, warehouseId: r.warehouseId, lots: [] };
      g.lots.push({ qty: r.acceptedStockQty, unitCostXof: r.unitCostXof, landedUnitCostXof: l.unitLandedCost });
      groups.set(key, g);
    }
  }
  const reappraisal: SheetReappraisal[] = [];
  if (groups.size > 0) {
    const levels = await tx.stockLevel.findMany({
      where: { OR: [...groups.values()].map((g) => ({ itemId: g.line.itemId!, warehouseId: g.warehouseId })) },
    });
    const warehouses = await tx.warehouse.findMany({ where: { id: { in: [...new Set([...groups.values()].map((g) => g.warehouseId))] } }, select: { id: true, name: true } });
    for (const g of groups.values()) {
      const level = levels.find((x) => x.itemId === g.line.itemId && x.warehouseId === g.warehouseId);
      const stock = { quantity: level?.quantity ?? 0, pmp: level?.pmp ?? 0 };
      const plan = planReappraisal(g.lots, stock);
      reappraisal.push({
        itemId: g.line.itemId!,
        itemCode: g.line.itemCode ?? "",
        designation: g.line.designation,
        warehouseId: g.warehouseId,
        warehouseName: warehouses.find((w) => w.id === g.warehouseId)?.name ?? "",
        receivedQty: plan.receivedQty.toString(),
        stockQty: dec(stock.quantity).toString(),
        totalXof: plan.totalXof,
        appliedXof: plan.appliedXof,
        exposedXof: plan.exposedXof,
        pmpBefore: plan.pmpBefore.toString(),
        pmpAfter: plan.pmpAfter.toString(),
      });
    }
  }

  return {
    file: {
      id: file.id,
      number: file.number,
      status: file.status,
      supplierName: file.supplier.name,
      supplierCountry: file.supplier.country,
      mode: file.mode,
      incoterm: file.incoterm,
      incotermPlace: file.incotermPlace,
      loadingPort: file.loadingPort,
      transitaire: file.transitaire,
      blNumber: file.blNumber,
      containerNumber: file.containerNumber,
      customsDeclaration: file.customsDeclaration,
      customsRegime: file.customsRegime,
      orders: file.orders.map((o) => o.order.number ?? "").filter(Boolean).sort(),
      closedAt: file.closedAt?.toISOString() ?? null,
    },
    lines: sheetLines,
    costs: sheetCosts,
    totals: {
      ...landed.totals,
      coefficient: landed.totals.coefficient?.toString() ?? null,
      estimatedCostCount: file.costs.filter((c) => c.status === "ESTIME" && !c.vatRecoverable).length,
    },
    reappraisal,
    warnings,
    final: false,
    generatedAt: at.toISOString(),
  };
}
