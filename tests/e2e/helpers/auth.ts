import { test, type Page } from "@playwright/test";

export type E2ERole =
  "SUPER_ADMIN" | "RESPONSABLE_ACHATS" | "ACHETEUR_LOCAL" | "ACHETEUR_IMPORT" | "MAGASINIER";

/** Comptes fictifs du seed (mot de passe : SEED_DEFAULT_PASSWORD). */
export const SEED_EMAILS: Record<E2ERole, string> = {
  SUPER_ADMIN: "admin@richbond.test",
  RESPONSABLE_ACHATS: "responsable@richbond.test",
  ACHETEUR_LOCAL: "acheteur.local@richbond.test",
  ACHETEUR_IMPORT: "acheteur.import@richbond.test",
  MAGASINIER: "magasinier@richbond.test",
};

/** Connexion par rôle. À implémenter avec LOT-01 (page /connexion). */
export async function loginAs(page: Page, role: E2ERole): Promise<void> {
  void page;
  void SEED_EMAILS[role];
  test.fixme(true, "loginAs sera implémenté avec LOT-01 (authentification).");
}
