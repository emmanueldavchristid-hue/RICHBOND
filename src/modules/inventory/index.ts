/**
 * API publique du module inventaires (LOT-11, EX-32).
 *
 * SERVER ACTIONS (src/app/(app)/stock/inventaires/actions.ts) — toutes renvoient `ActionResult<T>` ; les Decimal sont
 * déjà des chaînes. Écriture = session + rôle + licence + Zod + audit.
 *
 *  Lecture
 *   listInventoryCountsAction({ status?, warehouseId? })      [inventory.view ou inventory.count] -> InventoryCountSummary[]
 *   getBlindSheetAction({ countId })                          [inventory.count]  -> BlindSheet   (AVEUGLE : jamais de théorique/PMP/valeur)
 *   getInventoryReviewAction({ countId })                     [inventory.view]   -> InventoryReview (écarts, valeurs, seuil, drapeaux)
 *   proposeInventorySelectionAction({ warehouseId, cap? })    [inventory.prepare] -> SelectionRow[] (liste tournante de la semaine)
 *   searchInventoryItemsAction({ warehouseId, q })            [inventory.prepare] -> { id, code, name, abcClass }[]
 *   getInventoryReliabilityAction({ warehouseId? })           [inventory.view]   -> { last, history[] }
 *  Écriture
 *   createInventoryCountAction({ warehouseId, kind: TOURNANT|COMPLET, itemIds?, plannedFor?, comment?, thresholdPct?, thresholdValue? })
 *                                                             [inventory.prepare] -> { id, number, lineCount }   (PREPARE)
 *   addInventoryLinesAction({ countId, itemIds })             [inventory.prepare] (PREPARE seulement)
 *   removeInventoryLineAction({ countId, lineId })            [inventory.prepare] (PREPARE seulement)
 *   openInventoryCountAction({ countId })                     [inventory.count]   PREPARE -> EN_COMPTAGE, fige théorique + PMP
 *   saveInventoryCountAction({ countId, lines:[{lineId, quantity}] })     [inventory.count]  sauvegarde auto, idempotente
 *   saveInventoryRecountAction({ countId, lines:[{lineId, quantity}] })   [inventory.count]  recomptage (remplace le 1er comptage)
 *        -> BlindSaveResult { saved, unchanged, recountLineIds[], progress:{counted,total} }
 *   submitInventoryCountAction({ countId })                   [inventory.count]   EN_COMPTAGE -> A_VALIDER
 *   requestInventoryRecountAction({ countId, lineIds, comment? })  [inventory.validate]  A_VALIDER -> EN_COMPTAGE
 *   validateInventoryCountAction({ countId, reasons:[{lineId, reason}] })  [inventory.validate]  A_VALIDER -> VALIDE, crée les ajustements
 *   cancelInventoryCountAction({ countId, reason })           [inventory.cancel]  PREPARE|EN_COMPTAGE|A_VALIDER -> ANNULE
 *
 * Codes d'erreur métier utiles à l'écran : RECOMPTAGE_REQUIS, COMPTAGE_INCOMPLET, COMPTAGE_PERIME, MOTIF_OBLIGATOIRE,
 * ARTICLE_DEJA_EN_INVENTAIRE, SELECTION_VIDE, STATUT_INVALIDE.
 *
 * Droits : Responsable = tout ; Magasinier = inventory.count (ouvrir, compter, recompter, soumettre) ;
 * Acheteur et Super-admin = inventory.view (lecture). Le Magasinier n'a pas inventory.view : il ne peut appeler ni
 * getInventoryReviewAction ni la liste des fiabilités.
 *
 * Composants client : importer `@/modules/inventory/types`, `rules` ou `schemas` (purs), jamais cet index.
 */
export {
  addInventoryLines,
  cancelInventoryCount,
  createInventoryCount,
  openInventoryCount,
  removeInventoryLine,
  requestInventoryRecount,
  saveInventoryCount,
  saveInventoryRecount,
  submitInventoryCount,
  validateInventoryCount,
  type BlindSaveResult,
  type InventoryActor,
} from "./service";
export {
  getBlindSheet,
  getInventoryReliability,
  getInventoryReview,
  listInventoryCounts,
  proposeInventorySelection,
  searchInventoryItems,
} from "./queries";
export * from "./rules";
export * from "./schemas";
export * from "./types";
