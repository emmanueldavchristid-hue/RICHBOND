import { NextResponse, type NextRequest } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import { APP_TZ } from "@/lib/dates";
import { isBusinessError } from "@/lib/errors";
import { buildWorkbook, XLSX_MIME, type ExcelColumn } from "@/lib/excel";
import { can } from "@/lib/permissions";
import { getNow } from "@/lib/clock";
import { getCurrentUser } from "@/modules/auth/session";
import { exportItems } from "@/modules/items";
import {
  CRITICALITY_LABELS,
  ITEM_CATEGORY_LABELS,
  ITEM_STATUS_LABELS,
  PAYMENT_TERM_LABELS,
  SUPPLIER_STATUS_LABELS,
  SUPPLIER_TYPE_LABELS,
} from "@/modules/referentials/labels";
import { exportRequests } from "@/modules/purchase-requests/queries";
import {
  PR_KIND_LABELS,
  PR_STATUS_LABELS,
  PR_TYPE_LABELS,
  PR_URGENCY_LABELS,
} from "@/modules/purchase-requests/labels";
import { exportOrders } from "@/modules/purchase-orders/queries";
import { PO_STATUS_LABELS, PO_TYPE_LABELS } from "@/modules/purchase-orders/labels";
import { viewerCanSeePrices } from "@/modules/settings";
import { exportMovements, exportStock, MOVEMENT_TYPE_LABELS, STOCK_SITUATION_LABELS } from "@/modules/stock";
import { exportSuppliers } from "@/modules/suppliers";

/**
 * GET /api/export/articles | /fournisseurs | /demandes | /commandes | /mouvements | /stock : mêmes filtres que la liste (query string).
 * Autorisé en lecture seule (essai expiré) : pas de contrôle d'écriture.
 * Articles et fournisseurs : aucune colonne de prix d'achat (R15/R18). Demandes : prix estimés (FCFA) inclus
 * uniquement si l'utilisateur a le droit de voir les prix (le Magasinier ne les reçoit pas, sauf réglage explicite).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ entity: string }> }) {
  const { entity } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: "Votre session a expiré. Reconnectez-vous." }, { status: 401 });
  if (user.mustChangePassword) {
    return NextResponse.json({ code: "PASSWORD_CHANGE_REQUIRED", message: "Définissez d'abord votre mot de passe." }, { status: 403 });
  }
  const filters = Object.fromEntries(req.nextUrl.searchParams.entries());
  const stamp = formatInTimeZone((await getNow()).now, APP_TZ, "yyyyMMdd");
  try {
    let file: Buffer;
    let name: string;
    if (entity === "articles") {
      if (!can(user, "item.view")) return forbidden();
      const rows = await exportItems(filters);
      type R = (typeof rows)[number];
      const cols: ExcelColumn<R>[] = [
        { header: "Code", width: 16, value: (r) => r.code },
        { header: "Désignation", width: 40, value: (r) => r.name },
        { header: "Catégorie", value: (r) => ITEM_CATEGORY_LABELS[r.category] },
        { header: "Famille", value: (r) => r.family },
        { header: "Unité de stock", value: (r) => r.stockUnit },
        { header: "Unité d'achat", value: (r) => r.purchaseUnit },
        { header: "Coefficient", format: "0.000", value: (r) => Number(r.conversionFactor) },
        { header: "Stocké", value: (r) => (r.stocked ? "Oui" : "Non") },
        { header: "Criticité", value: (r) => CRITICALITY_LABELS[r.criticality] },
        { header: "Statut", value: (r) => ITEM_STATUS_LABELS[r.status] },
        { header: "Équipement", width: 28, value: (r) => r.equipment },
        { header: "Dépôt par défaut", value: (r) => r.defaultWarehouse?.name },
        { header: "Stock de sécurité (unité de stock)", format: "0.###", value: (r) => (r.safetyStock ? Number(r.safetyStock) : null) },
        { header: "Point de commande (unité de stock)", format: "0.###", value: (r) => (r.reorderPoint ? Number(r.reorderPoint) : null) },
        { header: "Délai (jours)", value: (r) => r.leadTimeDays },
        { header: "Fournisseur principal", width: 30, value: (r) => r.mainSupplier?.name },
        { header: "Code-barres", value: (r) => r.barcode },
      ];
      file = await buildWorkbook("Articles", cols, rows);
      name = `articles_${stamp}.xlsx`;
    } else if (entity === "fournisseurs") {
      if (!can(user, "supplier.view")) return forbidden();
      const rows = await exportSuppliers(filters);
      type R = (typeof rows)[number];
      const cols: ExcelColumn<R>[] = [
        { header: "Code", width: 16, value: (r) => r.code },
        { header: "Raison sociale", width: 40, value: (r) => r.name },
        { header: "Type", value: (r) => SUPPLIER_TYPE_LABELS[r.type] },
        { header: "Pays", value: (r) => r.country },
        { header: "Ville", value: (r) => r.city },
        { header: "Adresse", width: 36, value: (r) => r.address },
        { header: "Téléphone général", value: (r) => r.phone },
        { header: "Email général", width: 28, value: (r) => r.email },
        { header: "Devise", value: (r) => r.currencyCode },
        { header: "NCC", value: (r) => r.ncc },
        { header: "RCCM", value: (r) => r.rccm },
        { header: "Paiement", value: (r) => PAYMENT_TERM_LABELS[r.paymentTerm] },
        { header: "Incoterm", value: (r) => r.incoterm },
        { header: "Délai (jours)", value: (r) => r.leadTimeDays },
        { header: "Catégories", width: 30, value: (r) => r.categories.map((c) => ITEM_CATEGORY_LABELS[c]).join(", ") },
        { header: "Statut", value: (r) => SUPPLIER_STATUS_LABELS[r.status] },
        { header: "Contact principal", value: (r) => r.contacts[0]?.name },
        { header: "Téléphone du contact", value: (r) => r.contacts[0]?.phone },
        { header: "Email du contact", width: 28, value: (r) => r.contacts[0]?.email },
      ];
      file = await buildWorkbook("Fournisseurs", cols, rows);
      name = `fournisseurs_${stamp}.xlsx`;
    } else if (entity === "demandes") {
      if (!can(user, "purchaseRequest.view")) return forbidden();
      const showPrices = await viewerCanSeePrices(user);
      const rows = await exportRequests(user, filters, { showPrices });
      type R = (typeof rows)[number];
      const cols: ExcelColumn<R>[] = [
        { header: "N° DA", width: 18, value: (r) => r.number },
        { header: "Statut", width: 18, value: (r) => PR_STATUS_LABELS[r.status] },
        { header: "Urgence", width: 18, value: (r) => PR_URGENCY_LABELS[r.urgency] },
        { header: "Type", value: (r) => PR_TYPE_LABELS[r.type] },
        { header: "Nature", width: 20, value: (r) => PR_KIND_LABELS[r.kind] },
        { header: "Service", width: 20, value: (r) => r.department },
        { header: "Demandeur", width: 22, value: (r) => r.requesterName },
        { header: "Motif", width: 40, value: (r) => r.reason },
        { header: "Date de besoin", value: (r) => r.neededBy },
        { header: "Créée par", width: 22, value: (r) => r.createdBy },
        { header: "Acheteur assigné", width: 22, value: (r) => r.assignedBuyer },
        { header: "Ligne", value: (r) => r.lineNo },
        { header: "Code article", value: (r) => r.itemCode },
        { header: "Désignation", width: 40, value: (r) => r.designation },
        { header: "Quantité demandée", format: "0.###", value: (r) => r.quantity },
        { header: "Quantité validée", format: "0.###", value: (r) => r.approvedQty },
        { header: "Unité", value: (r) => r.unit },
        ...(showPrices
          ? ([
              { header: "Prix estimé unitaire (FCFA)", format: "#,##0", value: (r) => r.unitPrice },
              { header: "Montant ligne (FCFA)", format: "#,##0", value: (r) => r.lineTotal },
              { header: "Total estimé DA (FCFA)", format: "#,##0", value: (r) => r.estimatedTotal },
            ] satisfies ExcelColumn<R>[])
          : []),
      ];
      file = await buildWorkbook("Demandes d'achat", cols, rows);
      name = `demandes_${stamp}.xlsx`;
    } else if (entity === "commandes") {
      // LOT-05 (D30) : une ligne par ligne de BC, mêmes filtres que la liste. Le Magasinier n'a aucun accès aux BC.
      if (!can(user, "purchaseOrder.view")) return forbidden();
      const rows = await exportOrders(user, filters, (await getNow()).now);
      type R = (typeof rows)[number];
      const cols: ExcelColumn<R>[] = [
        { header: "N° BC", width: 20, value: (r) => r.number },
        { header: "Version", value: (r) => r.version },
        { header: "Statut", width: 20, value: (r) => PO_STATUS_LABELS[r.status] },
        { header: "Type", value: (r) => PO_TYPE_LABELS[r.type] },
        { header: "Code fournisseur", value: (r) => r.supplierCode },
        { header: "Fournisseur", width: 32, value: (r) => r.supplier },
        { header: "Créé par", width: 22, value: (r) => r.createdBy },
        { header: "Ligne", value: (r) => r.lineNo },
        { header: "Code article", value: (r) => r.itemCode },
        { header: "Désignation", width: 40, value: (r) => r.designation },
        { header: "Quantité commandée", format: "0.###", value: (r) => r.quantity },
        { header: "Quantité reçue", format: "0.###", value: (r) => r.receivedQty },
        { header: "Reste à recevoir", format: "0.###", value: (r) => r.remainingQty },
        { header: "Unité", value: (r) => r.unit },
        { header: "Prix unitaire", format: "#,##0.00", value: (r) => r.unitPrice },
        { header: "Remise (%)", format: "0.##", value: (r) => r.discountPct },
        { header: "Devise", value: (r) => r.currency },
        { header: "Montant ligne (devise)", format: "#,##0.00", value: (r) => r.netAmount },
        { header: "Montant ligne (FCFA)", format: "#,##0", value: (r) => r.netAmountXof },
        { header: "Total TTC du BC (FCFA)", format: "#,##0", value: (r) => r.totalTtcXof },
        { header: "Date demandée", value: (r) => r.requestedDate },
        { header: "Date promise", value: (r) => r.promisedDate },
        { header: "Date attendue", value: (r) => r.expectedDate },
        { header: "Jours de retard", value: (r) => r.daysLate },
      ];
      file = await buildWorkbook("Bons de commande", cols, rows);
      name = `commandes_${stamp}.xlsx`;
    } else if (entity === "mouvements") {
      // LOT-07 : journal des mouvements, mêmes filtres que l'écran. Coûts masqués selon le droit de voir les prix.
      if (!can(user, "stock.view")) return forbidden();
      const rows = await exportMovements(user, filters);
      type R = (typeof rows)[number];
      const cols: ExcelColumn<R>[] = [
        { header: "Date", value: (r) => r.occurredAt },
        { header: "Type", value: (r) => MOVEMENT_TYPE_LABELS[r.type] },
        { header: "Pièce", width: 20, value: (r) => r.documentRef },
        { header: "Code article", width: 16, value: (r) => r.itemCode },
        { header: "Désignation", width: 40, value: (r) => r.itemName },
        { header: "Dépôt", width: 20, value: (r) => r.warehouseName },
        { header: "Quantité (signée)", format: "0.###", value: (r) => Number(r.quantity) },
        { header: "Unité", value: (r) => r.stockUnit },
        { header: "Stock après", format: "0.###", value: (r) => Number(r.stockAfter) },
        { header: "Service", width: 20, value: (r) => r.departmentName },
        { header: "Coût unitaire (FCFA)", format: "#,##0.00", value: (r) => (r.unitCost === undefined ? null : Number(r.unitCost)) },
        { header: "Valeur (FCFA)", format: "#,##0", value: (r) => r.value },
        { header: "Commentaire", width: 36, value: (r) => r.comment },
        { header: "Saisi par", width: 22, value: (r) => r.createdByName },
      ];
      file = await buildWorkbook("Mouvements", cols, rows);
      name = `mouvements_${stamp}.xlsx`;
    } else if (entity === "stock") {
      // LOT-07 : stock par article (mêmes filtres que /stock/articles).
      if (!can(user, "stock.view")) return forbidden();
      const rows = await exportStock(user, filters, (await getNow()).now);
      type R = (typeof rows)[number];
      const cols: ExcelColumn<R>[] = [
        { header: "Code", width: 16, value: (r) => r.code },
        { header: "Désignation", width: 40, value: (r) => r.name },
        { header: "Catégorie", value: (r) => ITEM_CATEGORY_LABELS[r.category as keyof typeof ITEM_CATEGORY_LABELS] ?? r.category },
        { header: "Criticité", value: (r) => CRITICALITY_LABELS[r.criticality as keyof typeof CRITICALITY_LABELS] ?? r.criticality },
        { header: "Famille", value: (r) => r.family },
        { header: "Équipement", value: (r) => r.equipment },
        { header: "Statut", value: (r) => ITEM_STATUS_LABELS[r.status as keyof typeof ITEM_STATUS_LABELS] ?? r.status },
        { header: "Classe ABC", value: (r) => r.abcClass },
        { header: "Unité de stock", value: (r) => r.stockUnit },
        { header: "Stock", format: "0.###", value: (r) => Number(r.onHand) },
        { header: "En commande", format: "0.###", value: (r) => Number(r.onOrder) },
        { header: "PMP (FCFA)", format: "#,##0.00", value: (r) => r.pmp },
        { header: "Valeur (FCFA)", format: "#,##0", value: (r) => r.value },
        { header: "Point de commande", format: "0.###", value: (r) => (r.reorderPoint === null ? null : Number(r.reorderPoint)) },
        { header: "Délai (jours)", value: (r) => r.leadTimeDays },
        { header: "Couverture (jours)", format: "0.0", value: (r) => r.coverageDays },
        { header: "Rupture prévue", value: (r) => r.stockoutDate },
        { header: "Situation", value: (r) => (r.belowReorderPoint ? STOCK_SITUATION_LABELS.SOUS_POINT : r.dormant ? STOCK_SITUATION_LABELS.DORMANT : r.severity ? STOCK_SITUATION_LABELS[r.severity] : "") },
      ];
      file = await buildWorkbook("Stock", cols, rows);
      name = `stock_${stamp}.xlsx`;
    } else {
      return NextResponse.json({ code: "NOT_FOUND", message: "Export inconnu." }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": XLSX_MIME,
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (isBusinessError(e)) {
      const status = e.code === "EXPORT_TOO_LARGE" ? 422 : 400;
      return NextResponse.json({ code: e.code, message: e.messageFr }, { status });
    }
    if (e && typeof e === "object" && "issues" in e) {
      return NextResponse.json({ code: "VALIDATION", message: "Filtres invalides." }, { status: 400 });
    }
    return NextResponse.json({ code: "INTERNAL", message: "Une erreur technique est survenue." }, { status: 500 });
  }
}

function forbidden() {
  return NextResponse.json({ code: "FORBIDDEN", message: "Vous n'avez pas les droits pour cette action." }, { status: 403 });
}
