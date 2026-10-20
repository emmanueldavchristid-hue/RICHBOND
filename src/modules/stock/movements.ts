import type { Prisma, StockDocumentType, StockMovement, StockMovementType } from "@/generated/prisma/client";
import { BusinessError } from "@/lib/errors";
import { Decimal, computeMovement, formatDecimal, toDecimal, type DecimalInput } from "./pmp";

/**
 * SEULE porte d'entrée du stock. Aucun autre fichier ne doit écrire `StockLevel` (test statique, LOT-07).
 * Chaque appel s'exécute dans la transaction de l'appelant (`tx`) : le document, ses mouvements et le niveau
 * de stock réussissent ou échouent ensemble.
 */

const ENTRY_ONLY: StockMovementType[] = ["ENTREE_RECEPTION"];
const EXIT_ONLY: StockMovementType[] = ["SORTIE", "RETOUR_FOURNISSEUR"];

export interface MovementInput {
  itemId: string;
  warehouseId: string;
  type: StockMovementType;
  /**
   * Quantité signée en unité de stock, non nulle, 3 décimales au plus.
   * ENTREE_RECEPTION : positive. SORTIE et RETOUR_FOURNISSEUR : négative. Autres types : positive ou négative.
   * Ignorée pour une contre-passation (voir `reversalOfId`).
   */
  quantity: DecimalInput;
  /**
   * Coût de l'entrée, FCFA par unité de stock. Obligatoire pour ENTREE_RECEPTION et pour l'entrée d'un TRANSFERT
   * (PMP du dépôt source). Facultatif pour un ajustement positif (défaut : PMP courant). Ignoré pour une sortie : PMP du moment.
   */
  unitCost?: DecimalInput;
  documentType: StockDocumentType;
  documentId?: string | null;
  /** Numéro lisible de la pièce (REC-…, SOR-…, TRF-…, AJU-…, RET-…). */
  documentRef: string;
  receiptLineId?: string | null;
  issueLineId?: string | null;
  /**
   * Contre-passation : identifiant du mouvement à annuler. Article, dépôt, type, quantité inverse, coût et valeur
   * sont repris de l'original ; un mouvement ne peut être contre-passé qu'une seule fois.
   */
  reversalOfId?: string | null;
  comment?: string | null;
  /** Date métier du mouvement. */
  occurredAt: Date;
  createdById: string;
}

export interface StockLevelSnapshot {
  quantity: Decimal;
  pmp: Decimal;
}

type Tx = Prisma.TransactionClient;

function key(m: { itemId: string; warehouseId: string }): string {
  return `${m.itemId}|${m.warehouseId}`;
}

/** Stock et PMP courants (0 / 0 si le couple n'a jamais bougé). Lecture seule, sans verrou. */
export async function getStockLevel(
  client: Pick<Tx, "stockLevel">,
  itemId: string,
  warehouseId: string,
): Promise<StockLevelSnapshot> {
  const level = await client.stockLevel.findUnique({ where: { itemId_warehouseId: { itemId, warehouseId } } });
  return { quantity: level ? new Decimal(level.quantity) : new Decimal(0), pmp: level ? new Decimal(level.pmp) : new Decimal(0) };
}

/** Applique un mouvement. Voir `applyMovements` pour plusieurs lignes d'un même document. */
export async function applyMovement(tx: Tx, input: MovementInput): Promise<StockMovement> {
  const [movement] = await applyMovements(tx, [input]);
  return movement;
}

/**
 * Applique plusieurs mouvements dans l'ordre fourni, après avoir verrouillé (SELECT ... FOR UPDATE) toutes les lignes
 * StockLevel concernées dans l'ordre (itemId, warehouseId) : pas d'interblocage entre documents concurrents.
 * Tout ou rien : la première erreur (ex. STOCK_INSUFFICIENT) annule la transaction de l'appelant.
 */
export async function applyMovements(tx: Tx, inputs: MovementInput[]): Promise<StockMovement[]> {
  if (inputs.length === 0) return [];

  // 1. Résolution des contre-passations (article et dépôt viennent de l'original).
  const originals = new Map<string, StockMovement>();
  const reversalIds = inputs.map((i) => i.reversalOfId).filter((id): id is string => !!id);
  if (reversalIds.length > 0) {
    const found = await tx.stockMovement.findMany({ where: { id: { in: reversalIds } } });
    for (const m of found) originals.set(m.id, m);
    const already = await tx.stockMovement.findMany({ where: { reversalOfId: { in: reversalIds } }, select: { reversalOfId: true } });
    if (already.length > 0) {
      throw new BusinessError("DEJA_CONTREPASSE", "Ce mouvement de stock a déjà été contre-passé.");
    }
    for (const id of reversalIds) {
      if (!originals.has(id)) throw new BusinessError("MOUVEMENT_INTROUVABLE", "Le mouvement à contre-passer est introuvable.");
    }
    if (new Set(reversalIds).size !== reversalIds.length) {
      throw new BusinessError("DEJA_CONTREPASSE", "Un même mouvement ne peut pas être contre-passé deux fois.");
    }
  }
  const resolved = inputs.map((input) => {
    const original = input.reversalOfId ? originals.get(input.reversalOfId)! : null;
    return {
      input,
      original,
      itemId: original ? original.itemId : input.itemId,
      warehouseId: original ? original.warehouseId : input.warehouseId,
      type: original ? original.type : input.type,
    };
  });

  // 2. Validation des entrées (signe, coût, article géré en stock).
  const itemIds = [...new Set(resolved.map((r) => r.itemId))];
  const warehouseIds = [...new Set(resolved.map((r) => r.warehouseId))];
  const [items, warehouses] = await Promise.all([
    tx.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, code: true, name: true, stockUnit: true, stocked: true } }),
    tx.warehouse.findMany({ where: { id: { in: warehouseIds } }, select: { id: true, name: true } }),
  ]);
  const itemById = new Map(items.map((i) => [i.id, i]));
  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));
  for (const r of resolved) {
    const item = itemById.get(r.itemId);
    if (!item) throw new BusinessError("ARTICLE_INTROUVABLE", "Article introuvable.");
    if (!warehouseById.has(r.warehouseId)) throw new BusinessError("DEPOT_INTROUVABLE", "Dépôt introuvable.");
    if (!item.stocked) {
      throw new BusinessError("ARTICLE_NON_STOCKE", `L'article ${item.code} n'est pas géré en stock.`);
    }
    if (r.original) continue;
    const q = toDecimal(r.input.quantity);
    if (q.isZero()) throw new BusinessError("QUANTITE_INVALIDE", "La quantité du mouvement ne peut pas être nulle.");
    if (ENTRY_ONLY.includes(r.type) && q.lt(0)) {
      throw new BusinessError("QUANTITE_INVALIDE", "Une entrée en stock doit avoir une quantité positive.");
    }
    if (EXIT_ONLY.includes(r.type) && q.gt(0)) {
      throw new BusinessError("QUANTITE_INVALIDE", "Une sortie de stock doit avoir une quantité négative.");
    }
    if (q.gt(0) && r.input.unitCost === undefined && (r.type === "ENTREE_RECEPTION" || r.type === "TRANSFERT")) {
      throw new BusinessError("COUT_INVALIDE", "Le coût unitaire de l'entrée est obligatoire.");
    }
  }

  // 3. Verrous : lignes créées si absentes, puis FOR UPDATE dans l'ordre (itemId, warehouseId).
  const pairs = [...new Map(resolved.map((r) => [key(r), { itemId: r.itemId, warehouseId: r.warehouseId }])).values()].sort(
    (a, b) => (a.itemId === b.itemId ? a.warehouseId.localeCompare(b.warehouseId) : a.itemId.localeCompare(b.itemId)),
  );
  await tx.stockLevel.createMany({ data: pairs, skipDuplicates: true });
  for (const p of pairs) {
    await tx.$queryRaw`SELECT id FROM stock_levels WHERE item_id = ${p.itemId} AND warehouse_id = ${p.warehouseId} FOR UPDATE`;
  }

  // 4. Application séquentielle.
  const created: StockMovement[] = [];
  for (const r of resolved) {
    const { input, original } = r;
    const level = await tx.stockLevel.findUniqueOrThrow({
      where: { itemId_warehouseId: { itemId: r.itemId, warehouseId: r.warehouseId } },
    });
    const quantity = original ? new Decimal(original.quantity).neg() : toDecimal(input.quantity);

    if (new Decimal(level.quantity).add(quantity).lt(0)) {
      throw insufficientStock(
        new Decimal(level.quantity),
        itemById.get(r.itemId)!.stockUnit,
        warehouseById.get(r.warehouseId)!.name,
        original !== null,
      );
    }

    const computed = computeMovement({
      stock: level.quantity,
      pmp: level.pmp,
      quantity,
      unitCost: input.unitCost,
      reversal: original ? { quantity: original.quantity, unitCost: original.unitCost, value: original.value } : undefined,
    });

    const movement = await tx.stockMovement.create({
      data: {
        itemId: r.itemId,
        warehouseId: r.warehouseId,
        type: r.type,
        quantity: computed.quantity,
        unitCost: computed.unitCost,
        value: computed.value,
        pmpBefore: computed.pmpBefore,
        pmpAfter: computed.pmpAfter,
        stockAfter: computed.stockAfter,
        documentType: input.documentType,
        documentId: input.documentId ?? null,
        documentRef: input.documentRef,
        receiptLineId: input.receiptLineId ?? original?.receiptLineId ?? null,
        issueLineId: input.issueLineId ?? original?.issueLineId ?? null,
        reversalOfId: original?.id ?? null,
        comment: input.comment ?? null,
        occurredAt: input.occurredAt,
        createdById: input.createdById,
      },
    });
    await tx.stockLevel.update({
      where: { itemId_warehouseId: { itemId: r.itemId, warehouseId: r.warehouseId } },
      data: { quantity: computed.stockAfter, pmp: computed.pmpAfter },
    });
    created.push(movement);
  }
  return created;
}

function insufficientStock(available: Decimal, unit: string, warehouseName: string, isReversal: boolean): BusinessError {
  const qty = formatDecimal(Decimal.max(available, new Decimal(0)));
  if (isReversal) {
    return new BusinessError(
      "STOCK_INSUFFICIENT",
      `Contre-passation impossible : le stock du dépôt ${warehouseName} est devenu insuffisant (${qty} ${unit} disponibles, le reste a déjà été sorti).`,
    );
  }
  return new BusinessError("STOCK_INSUFFICIENT", `Stock insuffisant : ${qty} ${unit} disponibles au dépôt ${warehouseName}.`);
}
