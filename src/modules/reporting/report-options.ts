import "server-only";
import { db } from "@/lib/db";

export interface ReportFilterOptions {
  buyers: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  warehouses: { id: string; name: string }[];
}

/** Listes des menus de filtres des rapports : acheteurs (Responsable et Acheteurs actifs), fournisseurs et dépôts actifs. */
export async function reportFilterOptions(): Promise<ReportFilterOptions> {
  const [buyers, suppliers, warehouses] = await Promise.all([
    db.user.findMany({ where: { active: true, role: { in: ["ACHETEUR", "RESPONSABLE_ACHATS"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.supplier.findMany({ where: { status: "ACTIF" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.warehouse.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return { buyers, suppliers, warehouses };
}
