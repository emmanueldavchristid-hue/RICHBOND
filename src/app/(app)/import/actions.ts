"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getNow } from "@/lib/clock";
import { BusinessError } from "@/lib/errors";
import { getClientIp } from "@/modules/auth/ip";
import { withAction } from "@/modules/auth/session";
import {
  addCost,
  addCostSchema,
  addImportDocument,
  cancelImportFile,
  cancelImportFileSchema,
  closeImportFile,
  closeImportFileSchema,
  coefficientDefaultSchema,
  costTypeSchema,
  createImportFile,
  createImportFileSchema,
  eligibleOrdersSchema,
  fileIdSchema,
  getCoefficientSuggestion,
  getImportFile,
  linkImportOrder,
  lineLogisticsSchema,
  listCoefficientHistory,
  listCostTypes,
  listEligibleOrders,
  listImportFiles,
  listImportFilesSchema,
  listLateMilestones,
  milestoneSchema,
  orderLinkSchema,
  refreshEstimates,
  removeCost,
  removeCostSchema,
  removeImportDocument,
  removeDocumentSchema,
  saveCostType,
  setCoefficientDefault,
  setLineLogistics,
  suggestionSchema,
  unlinkImportOrder,
  updateCost,
  updateCostSchema,
  updateImportFile,
  updateImportFileSchema,
  updateMilestone,
} from "@/modules/import-files";
import { idSchema } from "@/modules/referentials/schemas";

/**
 * Server actions du module Import (LOT-12). Toutes passent par `withAction` : session, droit, licence (écriture refusée
 * si l'essai est expiré), validation Zod ; le service re-contrôle le périmètre IMPORT (un Acheteur « local » est refusé
 * avec le code FORBIDDEN). Résultat : `ActionResult<T>` = { ok: true, data } | { ok: false, code, message }.
 * Dates au format "AAAA-MM-JJ" ; nombres décimaux renvoyés en chaînes.
 *
 * LECTURES (importFile.view)
 *  listImportFilesAction({ status?, milestone?, supplierId?, lateOnly?, search?, page?, pageSize? })
 *      -> { rows: ImportFileRow[], total, page, pageSize, lateCount }   (jalon courant et retard de chaque dossier)
 *  getImportFileAction({ id })                     -> ImportFileDetail (en-tête, jalons, BC, pièces, historique des
 *                                                     ajustements, fiche de calcul `sheet`, suggestion de coefficient, `closable`, `can`)
 *  listLateMilestonesAction({})                    -> LateMilestone[]  (alertes de retard)
 *  listEligibleOrdersAction({ supplierId })        -> BC import validés du fournisseur, non rattachés
 *  listCostTypesAction({})                         -> { types: CostTypeView[], defaultCoefficients }
 *  getCoefficientSuggestionAction({ supplierId, mode }) -> { coefficient, basis: FOURNISSEUR|ORIGINE|DEFAUT, samples }
 *  listCoefficientHistoryAction({ supplierId? })   -> historique des coefficients réels
 *
 * ÉCRITURES (importFile.manage, périmètre IMPORT)
 *  createImportFileAction({ supplierId, mode, orderIds?, incoterm?, incotermPlace?, loadingPort?, transitaire?, blNumber?,
 *      containerNumber?, customsDeclaration?, customsRegime?, notes? })  -> { id, number, status }   (IMP-AAAA-NNNN, 10 jalons, frais estimés)
 *  updateImportFileAction({ id, mode?, ...champs d'en-tête })
 *  linkImportOrderAction({ fileId, orderId }) / unlinkImportOrderAction({ fileId, orderId })
 *  cancelImportFileAction({ id, reason })
 *  updateMilestoneAction({ fileId, code, plannedDate?, actualDate?, note? })   (null efface une date)
 *  setLineLogisticsAction({ fileId, lines: [{ orderLineId, unitWeightKg|null, unitVolumeM3|null }] })
 *  addCostAction({ fileId, typeId, status?, amount, currencyCode, rate?, vatRecoverable?, allocationKey?, payee?, note? })
 *  updateCostAction({ costId, status? ("REEL" pour confirmer un estimé), amount?, currencyCode?, rate?, ..., reason? })
 *  removeCostAction({ costId, reason? })
 *  refreshEstimatesAction({ id })                  -> régénère les estimations automatiques
 *  addImportDocumentAction(FormData: fileId, type, file) / removeImportDocumentAction({ fileId, documentId })
 *
 * CLÔTURE (importFile.close : Responsable, ou Acheteur IMPORT / ALL)
 *  closeImportFileAction({ id, confirmEstimated? })  -> { coefficient, landedXof, goodsValueXof, costsXof, appliedXof, exposedXof, movements }
 *      Refus : BC non réceptionné (BC_NON_RECEPTIONNE) ; frais encore estimés sans confirmEstimated (FRAIS_ESTIMES).
 *
 * PARAMÉTRAGE (importCost.configure : Responsable seul)
 *  saveCostTypeAction({ id?, code, label, defaultKey?, vatRecoverableDefault?, sortOrder?, active? })
 *  setCoefficientDefaultAction({ mode, typeId, pctOfValue })
 *
 * Téléchargements (routes) : GET /api/import-files/[id]/fiche?format=xlsx|pdf ; GET /api/import-files/[id]/documents/[docId].
 */
const READ = { writable: false } as const;
const at = async () => (await getNow()).now;
const touch = (id?: string) => {
  revalidatePath("/import");
  if (id) revalidatePath(`/import/${id}`);
};

// ---------------------------------------------------------------- lectures
export const listImportFilesAction = withAction("importFile.view", listImportFilesSchema, async ({ user, input }) => listImportFiles(user, input, await at()), READ);
export const getImportFileAction = withAction("importFile.view", fileIdSchema, async ({ user, input }) => getImportFile(user, input, await at()), READ);
export const listLateMilestonesAction = withAction("importFile.view", z.object({}).default({}), async ({ user }) => listLateMilestones(user, await at()), READ);
export const listEligibleOrdersAction = withAction("importFile.view", eligibleOrdersSchema, ({ user, input }) => listEligibleOrders(user, input), READ);
export const listCostTypesAction = withAction("importFile.view", z.object({}).default({}), ({ user }) => listCostTypes(user), READ);
export const getCoefficientSuggestionAction = withAction("importFile.view", suggestionSchema, ({ user, input }) => getCoefficientSuggestion(user, input), READ);
export const listCoefficientHistoryAction = withAction("importFile.view", z.object({ supplierId: idSchema.optional() }).default({}), ({ user, input }) => listCoefficientHistory(user, input), READ);

// ---------------------------------------------------------------- écritures
export const createImportFileAction = withAction("importFile.manage", createImportFileSchema, async ({ user, input }) => {
  const r = await createImportFile(user, input, await getClientIp(), await at());
  touch(r.id);
  return r;
});

export const updateImportFileAction = withAction("importFile.manage", updateImportFileSchema, async ({ user, input }) => {
  const r = await updateImportFile(user, input, await getClientIp(), await at());
  touch(r.id);
  return r;
});

export const linkImportOrderAction = withAction("importFile.manage", orderLinkSchema, async ({ user, input }) => {
  const r = await linkImportOrder(user, input, await getClientIp(), await at());
  touch(r.id);
  return r;
});

export const unlinkImportOrderAction = withAction("importFile.manage", orderLinkSchema, async ({ user, input }) => {
  const r = await unlinkImportOrder(user, input, await getClientIp(), await at());
  touch(r.id);
  return r;
});

export const cancelImportFileAction = withAction("importFile.manage", cancelImportFileSchema, async ({ user, input }) => {
  const r = await cancelImportFile(user, input, await getClientIp(), await at());
  touch(r.id);
  return r;
});

export const updateMilestoneAction = withAction("importFile.manage", milestoneSchema, async ({ user, input }) => {
  const r = await updateMilestone(user, input, await getClientIp(), await at());
  touch(input.fileId);
  return r;
});

export const setLineLogisticsAction = withAction("importFile.manage", lineLogisticsSchema, async ({ user, input }) => {
  const r = await setLineLogistics(user, input, await getClientIp(), await at());
  touch(input.fileId);
  return r;
});

export const addCostAction = withAction("importFile.manage", addCostSchema, async ({ user, input }) => {
  const r = await addCost(user, input, await getClientIp(), await at());
  touch(input.fileId);
  return r;
});

export const updateCostAction = withAction("importFile.manage", updateCostSchema, async ({ user, input }) => {
  const r = await updateCost(user, input, await getClientIp(), await at());
  touch();
  revalidatePath("/import/[id]", "page");
  return r;
});

export const removeCostAction = withAction("importFile.manage", removeCostSchema, async ({ user, input }) => {
  const r = await removeCost(user, input, await getClientIp(), await at());
  touch();
  revalidatePath("/import/[id]", "page");
  return r;
});

export const refreshEstimatesAction = withAction("importFile.manage", fileIdSchema, async ({ user, input }) => {
  const r = await refreshEstimates(user, input, await getClientIp(), await at());
  touch(input.id);
  return r;
});

/** FormData : champs `fileId`, `type` (FACTURE_COMMERCIALE, PACKING_LIST, CONNAISSEMENT_LTA, CERTIFICAT_ORIGINE, DECLARATION_DOUANE, AUTRE) et `file`. */
export const addImportDocumentAction = withAction("importFile.manage", z.instanceof(FormData), async ({ user, input }) => {
  const fileId = idSchema.safeParse(input.get("fileId"));
  const file = input.get("file");
  if (!fileId.success) throw new BusinessError("VALIDATION", "Dossier manquant ou invalide.");
  if (!(file instanceof File)) throw new BusinessError("VALIDATION", "Aucun fichier sélectionné.");
  const r = await addImportDocument(user, { fileId: fileId.data, type: String(input.get("type") ?? ""), fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }, await getClientIp(), await at());
  touch(fileId.data);
  return r;
});

export const removeImportDocumentAction = withAction("importFile.manage", removeDocumentSchema, async ({ user, input }) => {
  const r = await removeImportDocument(user, input, await getClientIp(), await at());
  touch(input.fileId);
  return r;
});

// ---------------------------------------------------------------- clôture
/** Droit `importFile.close` : Responsable Achats, ou Acheteur dont le périmètre est import ou les deux. */
export const closeImportFileAction = withAction("importFile.close", closeImportFileSchema, async ({ user, input }) => {
  const r = await closeImportFile(user, input, await getClientIp(), await at());
  touch(r.id);
  revalidatePath("/stock");
  return r;
});

// ---------------------------------------------------------------- paramétrage (Responsable seul)
export const saveCostTypeAction = withAction("importCost.configure", costTypeSchema, async ({ user, input }) => {
  const r = await saveCostType(user, input, await getClientIp());
  touch();
  return r;
});

export const setCoefficientDefaultAction = withAction("importCost.configure", coefficientDefaultSchema, async ({ user, input }) => {
  const r = await setCoefficientDefault(user, input, await getClientIp(), await at());
  touch();
  return r;
});
