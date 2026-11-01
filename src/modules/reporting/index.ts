/**
 * API publique du module reporting (LOT-08 tableaux de bord, LOT-15 rapports). Lectures seules.
 * Composants client : importer `@/modules/reporting/types`, `kpi`, `period`, `report-types`, `report-defs`, `report-format`,
 * `report-period` (purs), jamais cet index (il tire Prisma).
 *
 * Tableaux de bord : dashboardFor(user, at?), responsibleDashboard(at?), buyerDashboard(user, at?), storekeeperDashboard(user, at?), ruptureRisks(at).
 * Rapports (LOT-15) : buildReport(user, kind, raw, at?) ; exportReport(user, kind, "pdf" | "xlsx", raw, ip?, at?) -> { bytes, fileName } ;
 *   reportAccess(user) ; reportFilterOptions().
 */
export * from "./types";
export * from "./kpi";
export * from "./period";
export * from "./report-types";
export * from "./report-defs";
export * from "./report-access";
export { buyerDashboard, dashboardFor, responsibleDashboard, ruptureRisks, storekeeperDashboard, type DashboardUser } from "./dashboard";
export { buildReport, isReportKind, type ReportUser } from "./reports";
export { exportReport, type ReportFormat } from "./report-export";
export { reportFilterOptions, type ReportFilterOptions } from "./report-options";
