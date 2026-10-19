import { expect, type Page } from "@playwright/test";

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

export function seedPassword(): string {
  const p = process.env.SEED_DEFAULT_PASSWORD;
  if (!p) throw new Error("SEED_DEFAULT_PASSWORD absent de l'environnement de test.");
  return p;
}

/** Saisit les identifiants sur /connexion et soumet (sans rien vérifier). */
export async function submitLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/connexion");
  // Hydratation terminée avant de saisir : sinon un clic trop tôt envoie le formulaire en natif et vide les champs.
  await page.waitForLoadState("networkidle");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
}

/** Ferme la fenêtre « Version d'essai » si elle s'affiche (une fois par session). */
export async function dismissTrialDialog(page: Page): Promise<void> {
  const continuer = page.getByTestId("trial-continue");
  try {
    await continuer.waitFor({ state: "visible", timeout: 4000 });
    await continuer.click();
    await expect(page.getByTestId("trial-dialog")).toBeHidden();
  } catch {
    // Pas de fenêtre (licence active ou déjà vue).
  }
}

/** Connexion par rôle (comptes du seed) ; attend l'arrivée sur l'accueil. */
export async function loginAs(page: Page, role: E2ERole): Promise<void> {
  await submitLogin(page, SEED_EMAILS[role], seedPassword());
  await expect(page).toHaveURL(/\/accueil/);
  await dismissTrialDialog(page);
}

/** Déconnexion via le menu utilisateur. */
export async function logout(page: Page): Promise<void> {
  await page.getByTestId("user-menu").click();
  await page.getByTestId("menu-deconnexion").click();
  await expect(page).toHaveURL(/\/connexion/);
}
