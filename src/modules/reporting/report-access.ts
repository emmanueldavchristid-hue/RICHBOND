import { BusinessError } from "@/lib/errors";
import { can, type PermissionUser } from "@/lib/permissions";

/**
 * Droits sur les rapports (LOT-15) : fichier pur.
 * - Responsable (et Super-admin, en lecture) : tous les rapports, tous les périmètres.
 * - Acheteur : rapports achats limités à son périmètre (LOCAL ou IMPORT) ; « les deux » = sans limite ; sans périmètre = refusé.
 * - Magasinier : aucun rapport achats.
 * Les rapports sont des lectures : autorisés en essai expiré.
 */
export interface ReportAccess {
  allowed: boolean;
  /** Type de BC imposé (null = les deux). */
  scope: "LOCAL" | "IMPORT" | null;
}

export function reportAccess(user: PermissionUser): ReportAccess {
  const allowed = can(user, "report.all") || can(user, "report.purchasing");
  if (!allowed) return { allowed: false, scope: null };
  if (user.role === "ACHETEUR") {
    if (user.purchaseScope === "LOCAL" || user.purchaseScope === "IMPORT") return { allowed: true, scope: user.purchaseScope };
    if (user.purchaseScope === "ALL") return { allowed: true, scope: null };
    return { allowed: false, scope: null };
  }
  return { allowed: true, scope: null };
}

export function assertReportAccess(user: PermissionUser): ReportAccess {
  const access = reportAccess(user);
  if (!access.allowed) throw new BusinessError("FORBIDDEN", "Vous n'avez pas les droits pour cette action.");
  return access;
}
