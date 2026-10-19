import { NextResponse, type NextRequest } from "next/server";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/modules/auth/session";
import { readItemPhoto } from "@/modules/items";

export const dynamic = "force-dynamic";

/** Photo d'un article : session + `item.view` (jamais servie depuis public/). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  if (user.mustChangePassword || !can(user, "item.view")) return new NextResponse(null, { status: 403 });
  const { id } = await ctx.params;
  const photo = await readItemPhoto(id);
  if (!photo) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(photo.bytes), {
    headers: {
      "Content-Type": photo.mime,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
