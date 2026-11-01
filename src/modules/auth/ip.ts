import "server-only";
import { headers } from "next/headers";
import { clientIpFromHeader } from "./client-ip";

/** Adresse du client pour l'audit. X-Forwarded-For n'est lu que si TRUST_PROXY=1. */
export async function getClientIp(): Promise<string | null> {
  const h = await headers();
  return clientIpFromHeader(h.get("x-forwarded-for"));
}
