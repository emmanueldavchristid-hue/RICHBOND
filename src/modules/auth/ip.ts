import "server-only";
import { headers } from "next/headers";

/** Adresse du client (x-forwarded-for), pour l'audit. */
export async function getClientIp(): Promise<string | null> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  return xff ? xff.split(",")[0].trim().slice(0, 64) : null;
}
