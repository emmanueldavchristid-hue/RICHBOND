/**
 * API publique du module stock (LOT-06 T1, LOT-07).
 * Règle : le stock ne change QUE par `applyMovement` / `applyMovements` (dans la transaction de l'appelant).
 * Les pages n'importent jamais Prisma ; elles passent par les services des modules.
 *
 * Composants client : importer `@/modules/stock/labels`, `@/modules/stock/types` (et au besoin `forecast`, `reorder`,
 * `abc`, `schemas`, purs), jamais cet index (il tire les services, réservés au serveur).
 *
 * Lectures : listStock(user, filtres), listMovements(user, filtres), itemLedger(user, {itemId}), listIssues, getIssue,
 *            searchIssueItems, listReorder(user), exportStock, exportMovements, itemForecast(itemId, at?) (LOT-08).
 * Écritures (actor, raw, ip, at) : createIssue, cancelIssue, transfer, adjust, createReorderRequests,
 *            applySuggestedThresholds, recomputeAbc.
 */
export {
  applyMovement,
  applyMovements,
  getStockLevel,
  lockStockLevels,
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
export * from "./labels";
export * from "./types";
export * from "./forecast";
export * from "./reorder";
export * from "./abc";
export * from "./schemas";
export { itemForecast } from "./stats";
export {
  documentHref,
  exportMovements,
  exportStock,
  getIssue,
  itemLedger,
  listIssues,
  listMovements,
  listReorder,
  listStock,
  searchIssueItems,
} from "./queries";
export {
  adjust,
  applySuggestedThresholds,
  assertIssuedAtValid,
  cancelIssue,
  createIssue,
  createReorderRequests,
  recomputeAbc,
  transfer,
  type StockActor,
} from "./service";
