import "server-only";
import { db } from "@/lib/db";
import { now as clockNow } from "@/lib/clock";
import { log } from "@/modules/audit";
import { assertReportAccess } from "./report-access";
import { buildReportWorkbook } from "./report-excel";
import { renderReportPdf } from "./report-pdf";
import type { ReportKind } from "./report-types";
import { buildReport, type ReportUser } from "./reports";

export type ReportFormat = "pdf" | "xlsx";

/**
 * Export d'un rapport en PDF ou Excel (LOT-15). Même contrôle d'accès et mêmes données que l'écran ;
 * l'export est tracé dans le journal d'activité (format, période, filtres). Lecture seule : autorisé en essai expiré.
 */
export async function exportReport(
  user: ReportUser,
  kind: ReportKind,
  format: ReportFormat,
  raw: unknown,
  ip?: string | null,
  at: Date = clockNow(),
): Promise<{ bytes: Buffer; fileName: string }> {
  assertReportAccess(user);
  const report = await buildReport(user, kind, raw, at);
  const bytes = format === "pdf" ? await renderReportPdf(report) : await buildReportWorkbook(report);
  await db.$transaction((tx) =>
    log(tx, {
      userId: user.id,
      action: "REPORT_EXPORT",
      entity: "Report",
      entityId: `${kind}:${report.from}`,
      after: { kind, format, from: report.from, to: report.to, filters: report.filters },
      ip,
    }),
  );
  const stamp = kind === "mensuel" ? report.from.slice(0, 7) : report.from;
  return { bytes, fileName: `rapport-${kind}-${stamp}.${format}` };
}
