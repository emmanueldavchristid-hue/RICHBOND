import "server-only";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/errors";

/** Pure : l'état de licence autorise-t-il l'écriture ? */
export function isWritable(
  license: { status: "TRIAL" | "ACTIVE" | "EXPIRED"; trialEndsAt: Date } | null,
  now: Date,
): boolean {
  if (!license) return false;
  if (license.status === "ACTIVE") return true;
  if (license.status === "EXPIRED") return false;
  return license.trialEndsAt >= now;
}

/** Version non bloquante pour l'interface : boutons d'écriture désactivés si faux. */
export async function isWritableNow(now: Date = new Date()): Promise<boolean> {
  const license = await db.license.findFirst({ orderBy: { createdAt: "desc" } });
  return isWritable(license, now);
}

/** Refuse toute écriture si l'essai est expiré (enrichi en LOT-02). */
export async function requireWritable(now: Date = new Date()): Promise<void> {
  const license = await db.license.findFirst({ orderBy: { createdAt: "desc" } });
  if (!isWritable(license, now)) {
    throw new BusinessError(
      "LICENSE_READ_ONLY",
      "La période d'essai est terminée : l'application est en lecture seule.",
    );
  }
}
