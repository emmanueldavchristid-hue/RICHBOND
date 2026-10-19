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
import { exportSuppliers } from "@/modules/suppliers";

/**
 * GET /api/export/articles | /api/export/fournisseurs : mêmes filtres que la liste (query string).
 * Autorisé en lecture seule (essai expiré) : pas de contrôle d'écriture.
 * Les exports ne contiennent aucune colonne de prix d'achat (R15/R18).
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
