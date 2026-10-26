import { NextResponse, type NextRequest } from "next/server";
import { isBusinessError } from "@/lib/errors";
import { XLSX_MIME } from "@/lib/excel";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/modules/auth/session";
import { getImportReport } from "@/modules/import/service";
import { buildImportReportWorkbook } from "@/modules/import/templates";

/** GET /parametres/import/rapport?batch=<id> : rapport Excel d'un import (lecture, autorisé en lecture seule). */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: "Votre session a expiré. Reconnectez-vous." }, { status: 401 });
  if (user.mustChangePassword || !can(user, "import.manage")) {
    return NextResponse.json({ code: "FORBIDDEN", message: "Vous n'avez pas les droits pour cette action." }, { status: 403 });
  }
  const batch = req.nextUrl.searchParams.get("batch");
  if (!batch || batch.length > 64) return NextResponse.json({ code: "VALIDATION", message: "Numéro de lot manquant." }, { status: 400 });
  try {
    const report = await getImportReport(batch);
    const file = await buildImportReportWorkbook(report.summary, report.lines);
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": XLSX_MIME,
        "Content-Disposition": `attachment; filename="rapport_import_${report.summary.type.toLowerCase()}_${batch.slice(0, 8)}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (isBusinessError(e)) return NextResponse.json({ code: e.code, message: e.messageFr }, { status: e.code === "NOT_FOUND" ? 404 : 400 });
    return NextResponse.json({ code: "INTERNAL", message: "Une erreur technique est survenue." }, { status: 500 });
  }
}
