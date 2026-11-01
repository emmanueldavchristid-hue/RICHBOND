import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isBusinessError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { getClientIp } from "@/modules/auth/ip";
import { getCurrentUser } from "@/modules/auth/session";
import { exportCostSheetPdf, exportCostSheetXlsx } from "@/modules/import-files";
import { XLSX_MIME } from "@/lib/excel";
import { idSchema } from "@/modules/referentials/schemas";

const querySchema = z.object({ format: z.enum(["xlsx", "pdf"]).default("pdf") });

/** Fiche de calcul du coût de revient import (Excel ou PDF) : session, droit `importFile.view`, périmètre IMPORT. Lecture seule autorisée. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  if (user.mustChangePassword || !can(user, "importFile.view", { scope: "IMPORT" })) return new NextResponse(null, { status: 403 });
  const id = idSchema.safeParse((await ctx.params).id);
  const q = querySchema.safeParse({ format: req.nextUrl.searchParams.get("format") ?? undefined });
  if (!id.success || !q.success) return new NextResponse(null, { status: 400 });
  try {
    const ip = await getClientIp();
    const out = q.data.format === "xlsx" ? await exportCostSheetXlsx(user, { id: id.data }, ip) : await exportCostSheetPdf(user, { id: id.data }, ip);
    return new NextResponse(new Uint8Array(out.bytes), {
      headers: {
        "Content-Type": q.data.format === "xlsx" ? XLSX_MIME : "application/pdf",
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
