import { NextResponse, type NextRequest } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import { getNow } from "@/lib/clock";
import { APP_TZ } from "@/lib/dates";
import { buildMultiWorkbook, XLSX_MIME } from "@/lib/excel";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/modules/auth/session";
import { collectFullExport, auditFullExport } from "@/modules/data-export";

/**
 * GET /api/export-complet : export Excel de toutes les données (LOT-18, réversibilité).
 * Réservé à `data.export` (Responsable Achats). Autorisé en lecture seule (essai expiré) : on doit toujours pouvoir récupérer ses données.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json(
      { code: "UNAUTHENTICATED", message: "Votre session a expiré. Reconnectez-vous." },
      { status: 401 },
    );
  if (user.mustChangePassword) {
    return NextResponse.json(
      { code: "PASSWORD_CHANGE_REQUIRED", message: "Définissez d'abord votre mot de passe." },
      { status: 403 },
    );
  }
  if (!can(user, "data.export")) {
    return NextResponse.json(
      { code: "FORBIDDEN", message: "Vous n'avez pas les droits pour cette action." },
      { status: 403 },
    );
  }
  try {
    const sheets = await collectFullExport();
    const file = await buildMultiWorkbook(sheets);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim().slice(0, 64) ?? null;
    await auditFullExport(user.id, sheets, ip);
    const stamp = formatInTimeZone((await getNow()).now, APP_TZ, "yyyyMMdd");
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": XLSX_MIME,
        "Content-Disposition": `attachment; filename="export-complet_${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { code: "INTERNAL", message: "Une erreur technique est survenue." },
      { status: 500 },
    );
  }
}
