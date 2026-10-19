import { NextResponse } from "next/server";
import { getCurrentUser } from "@/modules/auth/session";
import { readLogo } from "@/modules/settings/branding";

/** Logo de la société : session obligatoire (jamais servi depuis public/). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  if (user.mustChangePassword) return new NextResponse(null, { status: 403 });
  const logo = await readLogo();
  if (!logo) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(logo.bytes), {
    headers: {
      "Content-Type": logo.mime,
      "Cache-Control": "private, no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
