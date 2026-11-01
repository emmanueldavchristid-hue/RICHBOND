import "server-only";
import { db } from "@/lib/db";
import { now } from "@/lib/clock";
import { buildMultiWorkbook, sheet as sheetSpec, type ExcelColumn } from "@/lib/excel";
import { log } from "@/modules/audit";
import type { OrderActor } from "@/modules/purchase-orders/internal";
import { parseInput } from "@/modules/purchase-requests/parse";
import { getSettings } from "@/modules/settings";
import { ALLOCATION_KEY_LABELS, COST_STATUS_LABELS, IMPORT_MODE_LABELS } from "./labels";
import { fileIdSchema } from "./schemas";
import { assertImportAccess } from "./scope";
import { computeCostSheet, type CostSheet, type SheetCost, type SheetLine, type SheetReappraisal } from "./sheet";
import { renderCostSheetPdf } from "./pdf";

/**
 * Fiche de calcul du coût de revient import, exportable en Excel et en PDF (LOT-12, critère d'acceptation).
 * Excel : toutes les cellules texte passent par `sanitizeCell` (via `buildMultiWorkbook`) ; les montants restent des nombres.
 * Dossier clôturé : fiche figée à la clôture ; sinon fiche provisoire calculée sur les données actuelles.
 */
const MONEY = "#,##0";
const num = (s: string | null | undefined) => (s === null || s === undefined ? null : Number(s));

async function loadSheet(user: OrderActor, raw: unknown, ip: string | null | undefined, format: "XLSX" | "PDF", at: Date): Promise<CostSheet> {
  assertImportAccess(user, "importFile.view");
  const { id } = parseInput(fileIdSchema, raw);
  const sheet = await db.$transaction((tx) => computeCostSheet(tx, id, at));
  await db.$transaction((tx) => log(tx, { userId: user.id, action: "IMPORT_SHEET_EXPORT", entity: "ImportFile", entityId: id, after: { number: sheet.file.number, format, final: sheet.final }, ip }));
  return sheet;
}

export async function exportCostSheetXlsx(user: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<{ bytes: Buffer; fileName: string }> {
  const sheet = await loadSheet(user, raw, ip, "XLSX", at);
  const f = sheet.file;
  const summary: { label: string; value: string | number | null }[] = [
    { label: "Dossier", value: f.number },
    { label: "Fournisseur", value: `${f.supplierName} (${f.supplierCountry})` },
    { label: "Mode de transport", value: IMPORT_MODE_LABELS[f.mode] },
    { label: "Incoterm", value: [f.incoterm, f.incotermPlace].filter(Boolean).join(" ") || null },
    { label: "Bons de commande", value: f.orders.join(", ") || null },
    { label: "BL / LTA", value: f.blNumber },
    { label: "Conteneur", value: f.containerNumber },
    { label: "Déclaration en douane", value: f.customsDeclaration },
    { label: "Régime", value: f.customsRegime },
    { label: "Fiche", value: sheet.final ? "Définitive (dossier clôturé)" : "Provisoire (dossier ouvert)" },
    { label: "Valeur marchandise (FCFA)", value: sheet.totals.goodsValueXof },
    { label: "Frais d'approche intégrés (FCFA)", value: sheet.totals.costsXof },
    { label: "Frais récupérables hors coût (FCFA)", value: sheet.totals.excludedXof },
    { label: "Coût d'arrivée dédouané (FCFA)", value: sheet.totals.landedXof },
    { label: "Coefficient d'approche", value: num(sheet.totals.coefficient) },
    ...sheet.warnings.map((w) => ({ label: "Attention", value: w })),
  ];
  const lineCols: ExcelColumn<SheetLine>[] = [
    { header: "BC", width: 16, value: (l) => l.orderNumber },
    { header: "Ligne", width: 7, value: (l) => l.lineNo },
    { header: "Code article", width: 16, value: (l) => l.itemCode },
    { header: "Désignation", width: 36, value: (l) => l.designation },
    { header: "Base", width: 11, value: (l) => (l.source === "RECU" ? "Reçu" : "Commandé") },
    { header: "Quantité", width: 12, value: (l) => num(l.qty), format: "#,##0.###" },
    { header: "Unité", width: 8, value: (l) => l.stockUnit },
    { header: "Valeur marchandise (FCFA)", width: 22, value: (l) => l.goodsValueXof, format: MONEY },
    { header: "Frais répartis (FCFA)", width: 20, value: (l) => l.allocatedXof, format: MONEY },
    { header: "Coût dédouané (FCFA)", width: 20, value: (l) => l.landedValueXof, format: MONEY },
    { header: "Coût unitaire marchandise", width: 20, value: (l) => num(l.unitGoodsCost), format: "#,##0.00" },
    { header: "Coût unitaire dédouané", width: 20, value: (l) => num(l.unitLandedCost), format: "#,##0.00" },
    { header: "Coefficient", width: 12, value: (l) => num(l.coefficient), format: "0.0000" },
  ];
  const costCols: ExcelColumn<SheetCost>[] = [
    { header: "Frais", width: 34, value: (c) => c.typeLabel },
    { header: "Statut", width: 10, value: (c) => COST_STATUS_LABELS[c.status] },
    { header: "Montant", width: 16, value: (c) => num(c.amount), format: "#,##0.00" },
    { header: "Devise", width: 8, value: (c) => c.currencyCode },
    { header: "Taux figé (FCFA)", width: 14, value: (c) => num(c.rate), format: "#,##0.000000" },
    { header: "Équivalent FCFA", width: 16, value: (c) => c.amountXof, format: MONEY },
    { header: "Récupérable (exclu du coût)", width: 22, value: (c) => (c.vatRecoverable ? "Oui" : "Non") },
    { header: "Clé demandée", width: 14, value: (c) => ALLOCATION_KEY_LABELS[c.allocationKey] },
    { header: "Clé appliquée", width: 14, value: (c) => (c.excluded ? "Exclu" : ALLOCATION_KEY_LABELS[c.keyUsed]) },
    { header: "Fournisseur du frais", width: 26, value: (c) => c.payee },
  ];
  const pmpCols: ExcelColumn<SheetReappraisal>[] = [
    { header: "Code article", width: 16, value: (r) => r.itemCode },
    { header: "Désignation", width: 34, value: (r) => r.designation },
    { header: "Dépôt", width: 20, value: (r) => r.warehouseName },
    { header: "Quantité reçue", width: 14, value: (r) => num(r.receivedQty), format: "#,##0.###" },
    { header: "Stock actuel", width: 14, value: (r) => num(r.stockQty), format: "#,##0.###" },
    { header: "Surcoût total (FCFA)", width: 18, value: (r) => r.totalXof, format: MONEY },
    { header: "Ajouté au stock restant (FCFA)", width: 26, value: (r) => r.appliedXof, format: MONEY },
    { header: "Quantités déjà sorties, non réécrit (FCFA)", width: 34, value: (r) => r.exposedXof, format: MONEY },
    { header: "PMP avant", width: 14, value: (r) => num(r.pmpBefore), format: "#,##0.00" },
    { header: "PMP après", width: 14, value: (r) => num(r.pmpAfter), format: "#,##0.00" },
  ];
  const bytes = await buildMultiWorkbook([
    sheetSpec<(typeof summary)[number]>("Dossier", [{ header: "Rubrique", width: 38, value: (r) => r.label }, { header: "Valeur", width: 60, value: (r) => r.value, format: "#,##0.####" }], summary),
    sheetSpec("Marchandises", lineCols, sheet.lines),
    sheetSpec("Frais d'approche", costCols, sheet.costs),
    sheetSpec("Réajustement PMP", pmpCols, sheet.reappraisal),
  ]);
  return { bytes, fileName: `fiche-cout-revient-${f.number}.xlsx` };
}

export async function exportCostSheetPdf(user: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<{ bytes: Buffer; fileName: string }> {
  const sheet = await loadSheet(user, raw, ip, "PDF", at);
  const company = (await getSettings()).company.name;
  const bytes = await renderCostSheetPdf(sheet, company);
  return { bytes, fileName: `fiche-cout-revient-${sheet.file.number}.pdf` };
}
