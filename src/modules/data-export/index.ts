import "server-only";
import { db } from "@/lib/db";
import { sheet, type ExcelColumn, type SheetSpec } from "@/lib/excel";
import { log } from "@/modules/audit";

/**
 * Export complet des données (LOT-18, réversibilité) : une feuille par entité principale.
 * Réservé à l'action `data.export` (Responsable). Aucun hash de mot de passe ni coordonnée bancaire n'est exporté.
 * Les cellules texte passent par `sanitizeCell` (via buildMultiWorkbook).
 */
const n = (v: { toString(): string } | null | undefined) =>
  v === null || v === undefined ? null : Number(v.toString());

export async function collectFullExport(): Promise<SheetSpec[]> {
  const items = await db.item.findMany({
    orderBy: { code: "asc" },
    include: { defaultWarehouse: true, mainSupplier: true },
  });
  const suppliers = await db.supplier.findMany({
    orderBy: { code: "asc" },
    include: { contacts: { take: 1 } },
  });
  const requests = await db.purchaseRequest.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      department: true,
      createdBy: true,
      lines: { include: { item: true }, orderBy: { lineNo: "asc" } },
    },
  });
  const orders = await db.purchaseOrder.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      supplier: true,
      createdBy: true,
      warehouse: true,
      lines: { include: { item: true }, orderBy: { lineNo: "asc" } },
    },
  });
  const receipts = await db.receipt.findMany({
    orderBy: { number: "asc" },
    include: { order: true, supplier: true, warehouse: true, createdBy: true },
  });
  const invoices = await db.supplierInvoice.findMany({
    orderBy: { number: "asc" },
    include: { supplier: true, createdBy: true },
  });
  const movements = await db.stockMovement.findMany({
    orderBy: { occurredAt: "asc" },
    include: { item: true, warehouse: true, createdBy: true },
  });
  const levels = await db.stockLevel.findMany({
    include: { item: true, warehouse: true },
    orderBy: { item: { code: "asc" } },
  });
  const issues = await db.stockIssue.findMany({
    orderBy: { number: "asc" },
    include: { warehouse: true, department: true, createdBy: true },
  });
  const inventories = await db.inventoryCount.findMany({
    orderBy: { number: "asc" },
    include: { warehouse: true },
  });
  const warehouses = await db.warehouse.findMany({ orderBy: { code: "asc" } });
  const users = await db.user.findMany({ orderBy: { email: "asc" } });

  type Item = (typeof items)[number];
  type Sup = (typeof suppliers)[number];
  type PR = (typeof requests)[number];
  type PRL = { pr: PR; l: PR["lines"][number] };
  type PO = (typeof orders)[number];
  type POL = { po: PO; l: PO["lines"][number] };
  type Rec = (typeof receipts)[number];
  type Inv = (typeof invoices)[number];
  type Mov = (typeof movements)[number];
  type Lvl = (typeof levels)[number];
  type Iss = (typeof issues)[number];
  type Cnt = (typeof inventories)[number];
  type Wh = (typeof warehouses)[number];
  type Usr = (typeof users)[number];

  const itemCols: ExcelColumn<Item>[] = [
    { header: "Code", value: (r) => r.code },
    { header: "Désignation", width: 40, value: (r) => r.name },
    { header: "Catégorie", value: (r) => r.category },
    { header: "Famille", value: (r) => r.family },
    { header: "Unité de stock", value: (r) => r.stockUnit },
    { header: "Unité d'achat", value: (r) => r.purchaseUnit },
    { header: "Coefficient", value: (r) => n(r.conversionFactor) },
    { header: "Stocké", value: (r) => (r.stocked ? "Oui" : "Non") },
    { header: "Criticité", value: (r) => r.criticality },
    { header: "Classe ABC", value: (r) => r.abcClass },
    { header: "Statut", value: (r) => r.status },
    { header: "Équipement", value: (r) => r.equipment },
    { header: "Dépôt par défaut", value: (r) => r.defaultWarehouse?.name },
    { header: "Stock de sécurité", value: (r) => n(r.safetyStock) },
    { header: "Point de commande", value: (r) => n(r.reorderPoint) },
    { header: "Délai (jours)", value: (r) => r.leadTimeDays },
    { header: "Fournisseur principal", value: (r) => r.mainSupplier?.name },
    { header: "Code-barres", value: (r) => r.barcode },
    { header: "Notes", value: (r) => r.notes },
    { header: "Créé le", value: (r) => r.createdAt },
  ];
  const supCols: ExcelColumn<Sup>[] = [
    { header: "Code", value: (r) => r.code },
    { header: "Raison sociale", width: 36, value: (r) => r.name },
    { header: "Type", value: (r) => r.type },
    { header: "Pays", value: (r) => r.country },
    { header: "Ville", value: (r) => r.city },
    { header: "Adresse", value: (r) => r.address },
    { header: "Téléphone", value: (r) => r.phone },
    { header: "Email", value: (r) => r.email },
    { header: "Devise", value: (r) => r.currencyCode },
    { header: "NCC", value: (r) => r.ncc },
    { header: "RCCM", value: (r) => r.rccm },
    { header: "Paiement", value: (r) => r.paymentTerm },
    { header: "Incoterm", value: (r) => r.incoterm },
    { header: "Délai (jours)", value: (r) => r.leadTimeDays },
    { header: "Statut", value: (r) => r.status },
    { header: "Contact", value: (r) => r.contacts[0]?.name },
    { header: "Notes", value: (r) => r.notes },
  ];
  const prCols: ExcelColumn<PR>[] = [
    { header: "N° DA", value: (r) => r.number },
    { header: "Statut", value: (r) => r.status },
    { header: "Urgence", value: (r) => r.urgency },
    { header: "Type", value: (r) => r.type },
    { header: "Service", value: (r) => r.department.name },
    { header: "Demandeur", value: (r) => r.requesterName },
    { header: "Motif", width: 40, value: (r) => r.reason },
    { header: "Date de besoin", value: (r) => r.neededBy },
    { header: "Total estimé (FCFA)", format: "#,##0", value: (r) => r.estimatedTotal },
    { header: "Créée par", value: (r) => r.createdBy.name },
    { header: "Soumise le", value: (r) => r.submittedAt },
    { header: "Validée le", value: (r) => r.approvedAt },
  ];
  const prlCols: ExcelColumn<PRL>[] = [
    { header: "N° DA", value: (r) => r.pr.number },
    { header: "Ligne", value: (r) => r.l.lineNo },
    { header: "Code article", value: (r) => r.l.item?.code },
    { header: "Désignation", width: 40, value: (r) => r.l.item?.name ?? r.l.freeDesignation },
    { header: "Quantité", value: (r) => n(r.l.quantity) },
    { header: "Quantité validée", value: (r) => n(r.l.approvedQty) },
    { header: "Unité", value: (r) => r.l.unit },
    { header: "Prix estimé unitaire (FCFA)", format: "#,##0", value: (r) => r.l.estimatedUnitPrice },
  ];
  const poCols: ExcelColumn<PO>[] = [
    { header: "N° BC", value: (r) => r.number },
    { header: "Version", value: (r) => r.version },
    { header: "Statut", value: (r) => r.status },
    { header: "Type", value: (r) => r.type },
    { header: "Fournisseur", width: 32, value: (r) => r.supplier.name },
    { header: "Devise", value: (r) => r.currencyCode },
    { header: "Taux (FCFA)", value: (r) => n(r.exchangeRate) },
    { header: "Paiement", value: (r) => r.paymentTerm },
    { header: "Incoterm", value: (r) => r.incoterm },
    { header: "Dépôt", value: (r) => r.warehouse.name },
    { header: "Date demandée", value: (r) => r.requestedDate },
    { header: "Date promise", value: (r) => r.promisedDate },
    { header: "Total HT", format: "#,##0.00", value: (r) => n(r.totalHt) },
    { header: "Total TVA", format: "#,##0.00", value: (r) => n(r.totalVat) },
    { header: "Total TTC", format: "#,##0.00", value: (r) => n(r.totalTtc) },
    { header: "Total TTC (FCFA)", format: "#,##0", value: (r) => r.totalTtcXof },
    { header: "Créé par", value: (r) => r.createdBy.name },
    { header: "Notes", value: (r) => r.notes },
  ];
  const polCols: ExcelColumn<POL>[] = [
    { header: "N° BC", value: (r) => r.po.number },
    { header: "Ligne", value: (r) => r.l.lineNo },
    { header: "Code article", value: (r) => r.l.item?.code },
    { header: "Désignation", width: 40, value: (r) => r.l.item?.name ?? r.l.freeDesignation },
    { header: "Quantité", value: (r) => n(r.l.quantity) },
    { header: "Reçue", value: (r) => n(r.l.receivedQty) },
    { header: "Facturée", value: (r) => n(r.l.invoicedQty) },
    { header: "Unité", value: (r) => r.l.unit },
    { header: "Prix unitaire", format: "#,##0.00", value: (r) => n(r.l.unitPrice) },
    { header: "Remise (%)", value: (r) => n(r.l.discountPct) },
    { header: "TVA (%)", value: (r) => n(r.l.vatRate) },
    { header: "Montant net", format: "#,##0.00", value: (r) => n(r.l.netAmount) },
  ];
  const recCols: ExcelColumn<Rec>[] = [
    { header: "N° réception", value: (r) => r.number },
    { header: "Statut", value: (r) => r.status },
    { header: "N° BC", value: (r) => r.order.number },
    { header: "Fournisseur", value: (r) => r.supplier.name },
    { header: "Dépôt", value: (r) => r.warehouse.name },
    { header: "N° BL", value: (r) => r.deliveryNoteRef },
    { header: "Date de réception", value: (r) => r.receivedAt },
    { header: "Jours de retard", value: (r) => r.daysLate },
    { header: "Complète", value: (r) => (r.inFull ? "Oui" : "Non") },
    { header: "Commentaire", value: (r) => r.comment },
    { header: "Saisie par", value: (r) => r.createdBy.name },
  ];
  const invCols: ExcelColumn<Inv>[] = [
    { header: "N° interne", value: (r) => r.number },
    { header: "N° facture fournisseur", value: (r) => r.supplierInvoiceNo },
    { header: "Fournisseur", value: (r) => r.supplier.name },
    { header: "Statut", value: (r) => r.status },
    { header: "Date de facture", value: (r) => r.invoiceDate },
    { header: "Échéance", value: (r) => r.dueDate },
    { header: "Devise", value: (r) => r.currencyCode },
    { header: "Total HT", format: "#,##0.00", value: (r) => n(r.totalHt) },
    { header: "TVA", format: "#,##0.00", value: (r) => n(r.totalVat) },
    { header: "Total TTC", format: "#,##0.00", value: (r) => n(r.totalTtc) },
    { header: "Total TTC (FCFA)", format: "#,##0", value: (r) => r.totalTtcXof },
    { header: "Notes", value: (r) => r.notes },
    { header: "Saisie par", value: (r) => r.createdBy.name },
  ];
  const movCols: ExcelColumn<Mov>[] = [
    { header: "Date", value: (r) => r.occurredAt },
    { header: "Type", value: (r) => r.type },
    { header: "Pièce", value: (r) => r.documentRef },
    { header: "Code article", value: (r) => r.item.code },
    { header: "Désignation", width: 36, value: (r) => r.item.name },
    { header: "Dépôt", value: (r) => r.warehouse.name },
    { header: "Quantité (signée)", value: (r) => n(r.quantity) },
    { header: "Coût unitaire (FCFA)", value: (r) => n(r.unitCost) },
    { header: "Valeur (FCFA)", format: "#,##0", value: (r) => r.value },
    { header: "Stock après", value: (r) => n(r.stockAfter) },
    { header: "Commentaire", value: (r) => r.comment },
    { header: "Saisi par", value: (r) => r.createdBy.name },
  ];
  const lvlCols: ExcelColumn<Lvl>[] = [
    { header: "Code article", value: (r) => r.item.code },
    { header: "Désignation", width: 36, value: (r) => r.item.name },
    { header: "Dépôt", value: (r) => r.warehouse.name },
    { header: "Quantité", value: (r) => n(r.quantity) },
    { header: "PMP (FCFA)", format: "#,##0.00", value: (r) => n(r.pmp) },
    {
      header: "Valeur (FCFA)",
      format: "#,##0",
      value: (r) => Math.round(Number(r.quantity.toString()) * Number(r.pmp.toString())),
    },
  ];
  const issCols: ExcelColumn<Iss>[] = [
    { header: "N° sortie", value: (r) => r.number },
    { header: "Statut", value: (r) => r.status },
    { header: "Dépôt", value: (r) => r.warehouse.name },
    { header: "Service", value: (r) => r.department.name },
    { header: "Demandeur", value: (r) => r.requesterName },
    { header: "Motif", value: (r) => r.reason },
    { header: "Équipement", value: (r) => r.equipment },
    { header: "Date", value: (r) => r.issuedAt },
    { header: "Saisie par", value: (r) => r.createdBy.name },
  ];
  const cntCols: ExcelColumn<Cnt>[] = [
    { header: "N° inventaire", value: (r) => r.number },
    { header: "Statut", value: (r) => r.status },
    { header: "Type", value: (r) => r.kind },
    { header: "Dépôt", value: (r) => r.warehouse.name },
    { header: "Prévu le", value: (r) => r.plannedFor },
    { header: "Validé le", value: (r) => r.validatedAt },
    { header: "Fiabilité (%)", value: (r) => n(r.reliabilityPct) },
    { header: "Commentaire", value: (r) => r.comment },
  ];
  const whCols: ExcelColumn<Wh>[] = [
    { header: "Code", value: (r) => r.code },
    { header: "Nom", value: (r) => r.name },
    { header: "Adresse", value: (r) => r.address },
    { header: "Actif", value: (r) => (r.active ? "Oui" : "Non") },
  ];
  const userCols: ExcelColumn<Usr>[] = [
    { header: "Nom", value: (r) => r.name },
    { header: "Email", value: (r) => r.email },
    { header: "Rôle", value: (r) => r.role },
    { header: "Périmètre", value: (r) => r.purchaseScope },
    { header: "Actif", value: (r) => (r.active ? "Oui" : "Non") },
    { header: "Dernière connexion", value: (r) => r.lastLoginAt },
  ];

  return [
    sheet("Articles", itemCols, items),
    sheet("Fournisseurs", supCols, suppliers),
    sheet("Demandes d'achat", prCols, requests),
    sheet(
      "Lignes de DA",
      prlCols,
      requests.flatMap((pr) => pr.lines.map((l) => ({ pr, l }))),
    ),
    sheet("Bons de commande", poCols, orders),
    sheet(
      "Lignes de BC",
      polCols,
      orders.flatMap((po) => po.lines.map((l) => ({ po, l }))),
    ),
    sheet("Réceptions", recCols, receipts),
    sheet("Factures", invCols, invoices),
    sheet("Mouvements de stock", movCols, movements),
    sheet("Stock actuel", lvlCols, levels),
    sheet("Sorties de stock", issCols, issues),
    sheet("Inventaires", cntCols, inventories),
    sheet("Dépôts", whCols, warehouses),
    sheet("Utilisateurs", userCols, users),
  ];
}

/** Trace l'export (donnée sensible) dans le journal. */
export async function auditFullExport(userId: string, sheets: SheetSpec[], ip: string | null): Promise<void> {
  await db.$transaction((tx) =>
    log(tx, {
      userId,
      action: "DATA_EXPORT",
      entity: "Export",
      entityId: "full",
      after: Object.fromEntries(sheets.map((s) => [s.name, s.rows.length])),
      ip,
    }),
  );
}
