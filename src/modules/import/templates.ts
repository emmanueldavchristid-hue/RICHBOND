import ExcelJS from "exceljs";
import { IMPORT_FIELDS, IMPORT_TYPE_LABELS, type ImportType, type ImportSummary } from "./types";

const OUTCOME_LABELS: Record<string, string> = {
  CREE: "Créé",
  MIS_A_JOUR: "Mis à jour",
  INCHANGE: "Inchangé / ignoré",
  ERREUR: "Erreur (non importé)",
};

export const TEMPLATE_FILE_NAMES: Record<ImportType, string> = {
  ARTICLES: "modele_import_articles.xlsx",
  FOURNISSEURS: "modele_import_fournisseurs.xlsx",
  ARTICLE_FOURNISSEUR: "modele_import_article_fournisseur.xlsx",
  STOCK_INITIAL: "modele_import_stock_initial.xlsx",
};

/** Modèle téléchargeable : feuille 1 = en-têtes aux noms usuels de Sage (rien d'autre), feuille « Aide » = notice des colonnes. */
export async function buildTemplate(type: ImportType): Promise<Buffer> {
  const fields = IMPORT_FIELDS[type];
  const wb = new ExcelJS.Workbook();
  wb.creator = "RICHBOND Achats & Stocks";
  const ws = wb.addWorksheet(IMPORT_TYPE_LABELS[type].slice(0, 31));
  ws.columns = fields.map((f) => ({ header: f.aliases[0], width: Math.max(16, f.aliases[0].length + 4) }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  // Codes et quantités en texte/nombre libres : on évite que Excel transforme 00123 en 123.
  fields.forEach((f, i) => {
    if (/code|reference|ref/i.test(f.key)) ws.getColumn(i + 1).numFmt = "@";
  });

  const help = wb.addWorksheet("Aide");
  help.columns = [
    { header: "Colonne", width: 28 },
    { header: "Obligatoire", width: 14 },
    { header: "Explication", width: 80 },
    { header: "Autres noms reconnus", width: 60 },
  ];
  help.getRow(1).font = { bold: true };
  for (const f of fields)
    help.addRow([f.aliases[0], f.required ? "Oui" : "Non", f.help, f.aliases.slice(1).join(", ")]);
  help.addRow([]);
  help.addRow([
    "Importez la feuille « " +
      IMPORT_TYPE_LABELS[type] +
      " » : une ligne par enregistrement, à partir de la ligne 2.",
  ]);
  help.addRow(["Le ré-import d'un même fichier met à jour par code et ne crée pas de doublon."]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export interface ReportLineInput {
  line: number;
  ref: string;
  outcome: string;
  message: string;
}

/** Rapport d'import téléchargeable : résumé + une ligne par ligne du fichier. */
export async function buildImportReportWorkbook(
  summary: ImportSummary & { typeLabel?: string; at?: string },
  lines: ReportLineInput[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "RICHBOND Achats & Stocks";
  const sum = wb.addWorksheet("Résumé");
  sum.columns = [
    { header: "Information", width: 30 },
    { header: "Valeur", width: 50 },
  ];
  sum.getRow(1).font = { bold: true };
  sum.addRows([
    ["Type d'import", IMPORT_TYPE_LABELS[summary.type]],
    ["Fichier", summary.fileName],
    ["Date", summary.at ?? ""],
    ["Numéro de lot", summary.batchId],
    ["Lignes lues", summary.totalRows],
    ["Lignes valides", summary.okCount],
    ["Lignes en erreur (non importées)", summary.errorCount],
    ["Créés", summary.created],
    ["Mis à jour", summary.updated],
    ["Inchangés / ignorés", summary.unchanged],
  ]);
  const ws = wb.addWorksheet("Détail");
  ws.columns = [
    { header: "Ligne du fichier", width: 16 },
    { header: "Clé", width: 28 },
    { header: "Résultat", width: 22 },
    { header: "Détail", width: 100 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  for (const l of lines) ws.addRow([l.line, l.ref, OUTCOME_LABELS[l.outcome] ?? l.outcome, l.message]);
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 4 } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
