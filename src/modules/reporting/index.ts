/**
 * API publique du module reporting (LOT-08, EX-60) : tableaux de bord d'accueil par rôle.
 * Lectures seules, calculs en requêtes agrégées. Composants client : importer `@/modules/reporting/types`,
 * `kpi` et `period` (purs), jamais cet index (il tire Prisma).
 *
 * Lectures : dashboardFor(user, at?) (aiguillage par rôle), responsibleDashboard(at?), buyerDashboard(user, at?),
 *            storekeeperDashboard(user, at?), ruptureRisks(at).
 */
export * from "./types";
export * from "./kpi";
export * from "./period";
export { buyerDashboard, dashboardFor, responsibleDashboard, ruptureRisks, storekeeperDashboard, type DashboardUser } from "./dashboard";
