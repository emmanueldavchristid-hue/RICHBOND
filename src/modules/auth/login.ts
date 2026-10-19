import "server-only";
import { db } from "@/lib/db";
import { log } from "@/modules/audit";
import { AUTH_MESSAGES } from "./authenticate";

/** Message FR selon le code d'erreur Auth.js (INVALID par défaut, sans révéler si l'email existe). */
export async function loginErrorMessage(code: string | undefined, email: string): Promise<string> {
  if (code === "DISABLED") return AUTH_MESSAGES.DISABLED;
  if (code === "LOCKED") {
    const u = await db.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { lockedUntil: true },
    });
    if (u?.lockedUntil) return AUTH_MESSAGES.lockedUntil(u.lockedUntil);
    return "Compte verrouillé, réessayez dans quelques minutes.";
  }
  return AUTH_MESSAGES.INVALID;
}

/** Évite les redirections ouvertes : chemin interne uniquement. */
export function safeRedirect(retour: string | null | undefined): string {
  const fallback = "/accueil";
  if (!retour || !retour.startsWith("/") || retour.startsWith("//")) return fallback;
  if (retour.includes("\\") || /[\x00-\x1f\x7f]/.test(retour)) return fallback;
  try {
    // Rejette aussi les caractères de contrôle encodés (%09, %0a…).
    if (/[\x00-\x1f\x7f]/.test(decodeURIComponent(retour))) return fallback;
    if (new URL(retour, "http://x").origin !== "http://x") return fallback;
  } catch {
    return fallback;
  }
  return retour;
}

export async function recordLogout(userId: string, ip: string | null): Promise<void> {
  await db.$transaction((tx) =>
    log(tx, { userId, action: "LOGOUT", entity: "User", entityId: userId, ip }),
  );
}
