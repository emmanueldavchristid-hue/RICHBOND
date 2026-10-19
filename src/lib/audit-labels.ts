/** Libellés français du journal d'activité (fichier pur, utilisable côté client). */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  USER_CREATE: "Création d'un utilisateur",
  USER_UPDATE: "Modification d'un utilisateur",
  USER_DEACTIVATE: "Désactivation d'un utilisateur",
  USER_REACTIVATE: "Réactivation d'un utilisateur",
  USER_UNLOCK: "Déverrouillage d'un compte",
  USER_PASSWORD_RESET: "Réinitialisation de mot de passe",
  PASSWORD_CHANGE: "Changement de mot de passe",
  LOGIN_SUCCESS: "Connexion réussie",
  LOGIN_FAILED: "Échec de connexion",
  ACCOUNT_LOCKED: "Compte verrouillé",
  LOGOUT: "Déconnexion",
  LICENSE_INIT: "Initialisation de l'essai",
  LICENSE_TRIAL_EXTEND: "Prolongation de l'essai",
  LICENSE_ACTIVATE: "Activation de la licence",
  LICENSE_ACTIVATION_FAILED: "Échec d'activation",
};

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  User: "Utilisateur",
  License: "Licence",
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

export function auditEntityLabel(entity: string): string {
  return AUDIT_ENTITY_LABELS[entity] ?? entity;
}
