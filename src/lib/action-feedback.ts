import { toast } from "sonner";
import type { ActionResult } from "@/lib/errors";

/** Messages de secours en français si le serveur ne renvoie pas de texte exploitable. */
export const ERROR_MESSAGES: Record<string, string> = {
  CONFLICT: "Cette fiche a été modifiée par un autre utilisateur. Rechargez la page.",
  FORBIDDEN: "Vous n'avez pas les droits pour cette action.",
  UNAUTHENTICATED: "Votre session a expiré. Reconnectez-vous.",
  LICENSE_READ_ONLY: "La période d'essai est terminée : l'application est en lecture seule.",
  VALIDATION: "Les données saisies sont invalides.",
  NOT_FOUND: "Élément introuvable. Il a peut-être été supprimé ou modifié.",
  CODE_EXISTS: "Ce code existe déjà.",
  INTERNAL: "Une erreur technique est survenue. Réessayez ou contactez l'administrateur.",
};

export type ActionFailure = Extract<ActionResult<unknown>, { ok: false }>;

export function errorMessage(f: ActionFailure): string {
  return f.message?.trim() || ERROR_MESSAGES[f.code] || ERROR_MESSAGES.INTERNAL;
}

/**
 * Affiche l'erreur en toast. CONFLICT : propose de recharger la fiche ;
 * UNAUTHENTICATED : propose de se reconnecter.
 */
export function notifyError(f: ActionFailure, handlers: { reload?: () => void; login?: () => void } = {}): void {
  const message = errorMessage(f);
  if (f.code === "CONFLICT" && handlers.reload) {
    toast.error(message, { duration: 12_000, action: { label: "Recharger", onClick: handlers.reload } });
    return;
  }
  if (f.code === "UNAUTHENTICATED" && handlers.login) {
    toast.error(message, { duration: 12_000, action: { label: "Se reconnecter", onClick: handlers.login } });
    return;
  }
  toast.error(message);
}
