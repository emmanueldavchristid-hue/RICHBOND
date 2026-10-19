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
  ITEM_CREATE: "Création d'un article",
  ITEM_UPDATE: "Modification d'un article",
  ITEM_STATUS: "Changement de statut d'un article",
  ITEM_CODE_CHANGE: "Changement du code d'un article",
  ITEM_PHOTO: "Photo d'un article",
  ITEM_SUPPLIER_LINK: "Fournisseur lié à un article",
  ITEM_SUPPLIER_UPDATE: "Modification article-fournisseur",
  ITEM_SUPPLIER_DEACTIVATE: "Fournisseur retiré d'un article",
  SUPPLIER_CREATE: "Création d'un fournisseur",
  SUPPLIER_UPDATE: "Modification d'un fournisseur",
  SUPPLIER_CODE_CHANGE: "Changement du code d'un fournisseur",
  SUPPLIER_BLOCK: "Blocage d'un fournisseur",
  SUPPLIER_UNBLOCK: "Déblocage d'un fournisseur",
  SUPPLIER_STATUS: "Changement de statut d'un fournisseur",
  SUPPLIER_CONTACT_CREATE: "Ajout d'un contact fournisseur",
  SUPPLIER_CONTACT_UPDATE: "Modification d'un contact fournisseur",
  SUPPLIER_CONTACT_ACTIVE: "Activation d'un contact fournisseur",
  WAREHOUSE_CREATE: "Création d'un dépôt",
  WAREHOUSE_UPDATE: "Modification d'un dépôt",
  WAREHOUSE_ACTIVE: "Activation d'un dépôt",
  DEPARTMENT_CREATE: "Création d'un service",
  DEPARTMENT_UPDATE: "Modification d'un service",
  DEPARTMENT_ACTIVE: "Activation d'un service",
  CURRENCY_CREATE: "Création d'une devise",
  CURRENCY_UPDATE: "Modification d'une devise",
  CURRENCY_ACTIVE: "Activation d'une devise",
  EXCHANGE_RATE_CREATE: "Saisie d'un taux de change",
  EXCHANGE_RATE_UPDATE: "Modification d'un taux de change",
  SETTING_UPDATE: "Modification d'un réglage",
};

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  User: "Utilisateur",
  License: "Licence",
  Item: "Article",
  ItemSupplier: "Article-fournisseur",
  Supplier: "Fournisseur",
  SupplierContact: "Contact fournisseur",
  Warehouse: "Dépôt",
  Department: "Service",
  Currency: "Devise",
  ExchangeRate: "Taux de change",
  Setting: "Réglage",
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

export function auditEntityLabel(entity: string): string {
  return AUDIT_ENTITY_LABELS[entity] ?? entity;
}
