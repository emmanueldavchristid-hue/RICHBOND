import { NextResponse, type NextRequest } from "next/server";
import { isBusinessError } from "@/lib/errors";
import { XLSX_MIME } from "@/lib/excel";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/modules/auth/session";
import { importTypeSchema } from "@/modules/import/schemas";
import { buildTemplate, TEMPLATE_FILE_NAMES } from "@/modules/import/templates";

/** GET /parametres/import/modele?type=ARTICLES|FOURNISSEURS|ARTICLE_FOURNISSEUR|STOCK_INITIAL : modèle Excel vierge. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: "Votre session a expiré. Reconnectez-vous." }, { status: 401 });
  if (user.mustChangePassword || !can(user, "import.manage")) {
    return NextResponse.json({ code: "FORBIDDEN", message: "Vous n'avez pas les droits pour cette action." }, { status: 403 });
  }
  const type = importTypeSchema.safeParse(req.nextUrl.searchParams.get("type"));
  if (!type.success) return NextResponse.json({ code: "VALIDATION", message: "Type d'import inconnu." }, { status: 400 });
  try {
    const file = await buildTemplate(type.data);
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": XLSX_MIME,
        "Content-Disposition": `attachment; filename="${TEMPLATE_FILE_NAMES[type.data]}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (isBusinessError(e)) return NextResponse.json({ code: e.code, message: e.messageFr }, { status: 400 });
    return NextResponse.json({ code: "INTERNAL", message: "Une erreur technique est survenue." }, { status: 500 });
  }
}
