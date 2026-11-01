import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isBusinessError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/modules/auth/session";
import { readImportDocument } from "@/modules/import-files";
import { idSchema } from "@/modules/referentials/schemas";

const paramsSchema = z.object({ id: idSchema, docId: idSchema });

/** Pièce d'un dossier import : session + droit `importFile.view` au périmètre IMPORT (jamais servie depuis public/). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string; docId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  if (user.mustChangePassword || !can(user, "importFile.view", { scope: "IMPORT" })) return new NextResponse(null, { status: 403 });
  const params = paramsSchema.safeParse(await ctx.params);
  if (!params.success) return new NextResponse(null, { status: 400 });
  try {
    const file = await readImportDocument(user, params.data.id, params.data.docId);
    return new NextResponse(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.mime,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (isBusinessError(e)) return new NextResponse(null, { status: e.code === "FORBIDDEN" ? 403 : e.code === "VALIDATION" ? 400 : 404 });
    return new NextResponse(null, { status: 500 });
  }
}
