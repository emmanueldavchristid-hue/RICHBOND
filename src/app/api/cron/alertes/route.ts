import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runAlertDigest, slotFor, type DigestSlot } from "@/modules/notifications/digest";
import { now } from "@/lib/clock";


/** Comparaison à temps constant (longueurs différentes : refus sans fuite exploitable). */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function handle(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET non configuré." }, { status: 503 });
  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!provided || !secretMatches(provided, secret)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  const param = req.nextUrl.searchParams.get("slot");
  const slot: DigestSlot = param === "MATIN" || param === "APRES_MIDI" ? param : slotFor(now());
  try {
    const result = await runAlertDigest(slot, now());
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("cron alertes", e);
    return NextResponse.json({ error: "Échec de l'envoi des alertes." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
