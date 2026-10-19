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
  BARCODE_EXISTS: "Ce code-barres est déjà utilisé par un autre article.",
  NCC_EXISTS: "Ce NCC est déjà utilisé par un autre fournisseur.",
  SUPPLIER_BLOCKED: "Ce fournisseur est bloqué.",
  ALREADY_BLOCKED: "Ce fournisseur est déjà bloqué.",
  NOT_BLOCKED: "Ce fournisseur n'est pas bloqué.",
  LINK_EXISTS: "Cet article est déjà lié à ce fournisseur.",
  MAIN_SUPPLIER_LINK: "Ce fournisseur est le fournisseur principal de l'article : choisissez-en un autre avant de le retirer.",
  CURRENCY_INVALID: "Devise inconnue ou désactivée.",
  CURRENCY_IN_USE: "Cette devise est utilisée par des fournisseurs actifs.",
  BASE_CURRENCY: "Le FCFA (XOF) est la devise de base : il ne se modifie pas.",
  RATE_EXISTS: "Un taux existe déjà pour cette devise à cette date. Modifiez-le.",
  RATE_FUTURE: "La date du taux ne peut pas être dans le futur.",
  RATE_MISSING: "Aucun taux de change disponible : saisissez-le dans Paramètres > Devises.",
  EUR_PARITY_CONFIRM: "Le taux EUR/FCFA est fixe (655,957). Confirmez pour enregistrer une valeur différente.",
  RATE_DEVIATION_CONFIRM: "Ce taux s'écarte de plus de 20 % du dernier taux connu. Confirmez pour l'enregistrer.",
  PURCHASE_UNIT_LOCKED: "L'unité d'achat ne peut plus changer : des prix fournisseurs sont exprimés dans l'unité actuelle.",
  WAREHOUSE_INVALID: "Dépôt inconnu ou désactivé.",
  WAREHOUSE_IN_USE: "Ce dépôt est le dépôt par défaut d'articles actifs.",
  PHOTO_INVALID: "Format non accepté : utilisez une image JPEG, PNG ou WebP.",
  PHOTO_TOO_LARGE: "La photo dépasse 2 Mo : réduisez-la avant de l'envoyer.",
  EXPORT_TOO_LARGE: "Trop de lignes à exporter : affinez les filtres.",
  CONVERSION_INVALID: "Le coefficient de conversion doit être strictement positif.",
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
