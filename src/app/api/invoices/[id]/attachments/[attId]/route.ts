import { NextResponse, type NextRequest } from "next/server";
import { can } from "@/lib/permissions";
import { isBusinessError } from "@/lib/errors";
import { getCurrentUser } from "@/modules/auth/session";
import { readInvoiceAttachment } from "@/modules/invoices/attachments";

/** Pièce jointe d'une facture : session + droit `invoice.view` (jamais servie depuis public/). Autorisé en lecture seule. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string; attId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  if (user.mustChangePassword || !can(user, "invoice.view")) return new NextResponse(null, { status: 403 });
  const { id, attId } = await ctx.params;
  try {
    const file = await readInvoiceAttachment(user, id, attId);
    return new NextResponse(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.mime,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (isBusinessError(e)) return new NextResponse(null, { status: e.code === "FORBIDDEN" ? 403 : 404 });
    return new NextResponse(null, { status: 500 });
  }
}
