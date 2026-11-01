import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { XLSX_MIME } from "@/lib/excel";
import { isBusinessError } from "@/lib/errors";
import { getClientIp } from "@/modules/auth/ip";
import { getCurrentUser } from "@/modules/auth/session";
import { exportReport, isReportKind, reportAccess } from "@/modules/reporting";

const formatSchema = z.enum(["pdf", "xlsx"]).default("pdf");
const PARAMS = ["date", "month", "category", "buyerId", "supplierId", "warehouseId"] as const;

/**
 * Export d'un rapport (quotidien, hebdomadaire, mensuel) en PDF ou Excel : session, droit `report.*`, périmètre de l'Acheteur.
 * Lecture seule : autorisée quand l'essai est expiré.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ kind: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  if (user.mustChangePassword || !reportAccess(user).allowed) return new NextResponse(null, { status: 403 });
  const { kind } = await ctx.params;
  const format = formatSchema.safeParse(req.nextUrl.searchParams.get("format") ?? undefined);
  if (!isReportKind(kind) || !format.success) return new NextResponse(null, { status: 404 });
  const raw: Record<string, string> = {};
  for (const k of PARAMS) {
    const v = req.nextUrl.searchParams.get(k);
    if (v) raw[k] = v;
  }
  try {
    const out = await exportReport(user, kind, format.data, raw, await getClientIp());
    return new NextResponse(new Uint8Array(out.bytes), {
      headers: {
        "Content-Type": format.data === "xlsx" ? XLSX_MIME : "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(out.fileName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (isBusinessError(e)) return new NextResponse(null, { status: e.code === "FORBIDDEN" ? 403 : e.code === "VALIDATION" ? 400 : 404 });
    return new NextResponse(null, { status: 500 });
  }
}
