import { NextResponse, type NextRequest } from "next/server";
import { isBusinessError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/modules/auth/session";
import { getOrderPdfSource } from "@/modules/purchase-orders/queries";
import { loadBranding, renderOrderPdf } from "@/modules/purchase-orders/pdf/render";
import { pdfQuerySchema } from "@/modules/purchase-orders/schemas";

/**
 * GET /api/purchase-orders/[id]/pdf?v=<n> : PDF d'un bon de commande. Session + `purchaseOrder.view` ;
 * autorisé en lecture seule (essai expiré). Sans `v` : version courante (aperçu filigrané si non validée).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: "Votre session a expiré. Reconnectez-vous." }, { status: 401 });
  if (user.mustChangePassword) return NextResponse.json({ code: "PASSWORD_CHANGE_REQUIRED", message: "Définissez d'abord votre mot de passe." }, { status: 403 });
  if (!can(user, "purchaseOrder.view")) return NextResponse.json({ code: "FORBIDDEN", message: "Vous n'avez pas les droits pour cette action." }, { status: 403 });
  const { id } = await ctx.params;
  const q = pdfQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
  if (!q.success) return NextResponse.json({ code: "VALIDATION", message: "Version invalide." }, { status: 400 });
  try {
    const src = await getOrderPdfSource(user, id, q.data.v);
    const { company, logo } = await loadBranding();
    const bytes = await renderOrderPdf(src.snapshot, { company, logo, preview: src.preview });
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${src.fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (isBusinessError(e)) {
      const status = e.code === "NOT_FOUND" ? 404 : e.code === "FORBIDDEN" ? 403 : 400;
      return NextResponse.json({ code: e.code, message: e.messageFr }, { status });
    }
    return NextResponse.json({ code: "INTERNAL", message: "Une erreur technique est survenue." }, { status: 500 });
  }
}
