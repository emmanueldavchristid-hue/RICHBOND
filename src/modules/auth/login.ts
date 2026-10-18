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
  if (retour && retour.startsWith("/") && !retour.startsWith("//") && !retour.includes("\\")) return retour;
  return "/accueil";
}

export async function recordLogout(userId: string, ip: string | null): Promise<void> {
  await db.$transaction((tx) =>
    log(tx, { userId, action: "LOGOUT", entity: "User", entityId: userId, ip }),
  );
}
