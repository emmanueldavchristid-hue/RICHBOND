/**
 * API publique du module stock (LOT-06 T1, LOT-07).
 * Règle : le stock ne change QUE par `applyMovement` / `applyMovements` (dans la transaction de l'appelant).
 * Les pages n'importent jamais Prisma ; elles passent par les services des modules.
 */
export {
  applyMovement,
  applyMovements,
  getStockLevel,
  type MovementInput,
  type StockLevelSnapshot,
} from "./movements";
export {
  computeMovement,
  movementValue,
  pmpAfterEntry,
  pmpAfterEntryReversal,
  roundCost,
  roundQty,
  type MovementComputation,
  type MovementComputationInput,
  type DecimalInput,
} from "./pmp";
