import { expect, test, type Page } from "@playwright/test";
import { dismissTrialDialog, loginAs, logout, submitLogin, type E2ERole } from "../helpers/auth";

/** S0.1 / S0.2 – connexion par rôle, menus, accès refusé, verrouillage, utilisateur créé, mot de passe forcé. */

const ALL_ENTRIES = ["accueil", "achats", "import", "stock", "fournisseurs", "rapports", "parametres"];

const MENUS: Record<E2ERole, { role: string; visible: string[] }> = {
  SUPER_ADMIN: { role: "Super-administrateur", visible: ALL_ENTRIES },
  RESPONSABLE_ACHATS: { role: "Responsable Achats", visible: ALL_ENTRIES },
  ACHETEUR_LOCAL: {
    role: "Acheteur (local)",
    // LOT-03 (R14) : « Paramètres » est visible des acheteurs pour la saisie des taux de change.
    visible: ["accueil", "achats", "stock", "fournisseurs", "rapports", "parametres"],
  },
  ACHETEUR_IMPORT: {
    role: "Acheteur (import)",
    visible: ["accueil", "achats", "import", "stock", "fournisseurs", "rapports", "parametres"],
  },
  MAGASINIER: { role: "Magasinier", visible: ["accueil", "achats", "stock", "rapports"] },
};

/** Le menu est latéral (>= 1024 px) ou dans le tiroir (mobile) : on ouvre le tiroir si besoin. */
async function openedNav(page: Page) {
  const width = page.viewportSize()?.width ?? 1280;
  if (width >= 1024) await expect(page.getByTestId("sidebar")).toBeVisible();
  else await page.getByTestId("menu-toggle").click();
  return page.getByTestId("main-nav").filter({ visible: true });
}

async function createUserViaUi(page: Page, name: string, email: string): Promise<string> {
  await page.goto("/parametres/utilisateurs");
  await page.getByTestId("user-create").click();
  const dialog = page.getByTestId("user-form-dialog");
  await dialog.getByLabel("Nom complet").fill(name);
  await dialog.getByLabel("Adresse email").fill(email);
  await dialog.getByLabel("Rôle").selectOption("MAGASINIER");
  await page.getByTestId("user-form-submit").click();
  const pwd = page.getByTestId("temp-password-value");
  await expect(pwd).toBeVisible();
  const temporaryPassword = ((await pwd.textContent()) ?? "").trim();
  expect(temporaryPassword.length).toBeGreaterThanOrEqual(8);
  await page.getByTestId("temp-password-close").click();
  await expect(page.getByTestId(`user-row-${email}`)).toBeVisible();
  return temporaryPassword;
}

function uniqueEmail(prefix: string, project: string): string {
  return `e2e-${prefix}-${project}-${Date.now()}@richbond.test`;
}

test.describe("S0.1 – Connexion et menu par rôle", () => {
  for (const role of Object.keys(MENUS) as E2ERole[]) {
    test(`le rôle ${role} voit son propre menu`, async ({ page }) => {
      const { role: label, visible } = MENUS[role];
      await test.step(`Connexion en tant que ${label}`, async () => {
        await loginAs(page, role);
      });
      await test.step("Le menu ne montre que les entrées autorisées", async () => {
        const nav = await openedNav(page);
        for (const entry of ALL_ENTRIES) {
          const link = nav.getByTestId(`nav-${entry}`);
          if (visible.includes(entry)) await expect(link).toBeVisible();
          else await expect(link).toHaveCount(0);
        }
      });
      await test.step("Le rôle est affiché dans le menu utilisateur", async () => {
        await page.keyboard.press("Escape");
        await page.getByTestId("user-menu").click();
        await expect(page.getByTestId("menu-mon-compte")).toBeVisible();
        await page.keyboard.press("Escape");
        await page.goto("/mon-compte");
        await expect(page.getByTestId("compte-role")).toHaveText(label);
      });
      await test.step("Déconnexion : l'accès aux pages protégées est refermé", async () => {
        await logout(page);
        await page.goto("/accueil");
        await expect(page).toHaveURL(/\/connexion/);
      });
    });
  }

  test("un identifiant erroné est refusé avec un message clair", async ({ page }) => {
    await test.step("Saisie d'un mauvais mot de passe", async () => {
      await submitLogin(page, "responsable@richbond.test", "mauvais-mot-de-passe");
    });
    await test.step("Message d'erreur français, on reste sur la connexion", async () => {
      await expect(page.getByTestId("login-error")).toContainText("Email ou mot de passe incorrect.");
      await expect(page).toHaveURL(/\/connexion/);
    });
  });
});

test.describe("S0.1 – Accès direct à une URL interdite", () => {
  test("le magasinier est renvoyé sur /acces-refuse", async ({ page }) => {
    await test.step("Connexion magasinier", async () => {
      await loginAs(page, "MAGASINIER");
    });
    for (const url of ["/parametres/utilisateurs", "/parametres/journal", "/parametres"]) {
      await test.step(`Ouverture directe de ${url}`, async () => {
        await page.goto(url);
        await expect(page).toHaveURL(/\/acces-refuse/);
        await expect(page.getByTestId("acces-refuse")).toContainText("Accès refusé");
      });
    }
    await test.step("Le bouton ramène à l'accueil", async () => {
      await page.getByTestId("retour-accueil").click();
      await expect(page).toHaveURL(/\/accueil/);
    });
  });

  test("l'acheteur ne peut pas ouvrir la gestion des utilisateurs", async ({ page }) => {
    await loginAs(page, "ACHETEUR_LOCAL");
    await page.goto("/parametres/utilisateurs");
    await expect(page).toHaveURL(/\/acces-refuse/);
  });

  test("l'acheteur local ne peut pas ouvrir Import (périmètre)", async ({ page }) => {
    await loginAs(page, "ACHETEUR_LOCAL");
    await page.goto("/import");
    await expect(page).toHaveURL(/\/acces-refuse/);
  });

  test("sans session, une page protégée renvoie vers la connexion", async ({ page }) => {
    await page.goto("/parametres/utilisateurs");
    await expect(page).toHaveURL(/\/connexion/);
  });
});

test.describe("S0.2 – Gestion des comptes", () => {
  test("création d'un utilisateur tracée au journal, puis mot de passe changé de force", async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail("cree", testInfo.project.name);
    const name = `E2E Magasinier ${testInfo.project.name}`;
    let temporaryPassword = "";
    const newPassword = "Nouveau-Passw0rd!";

    await test.step("Le Responsable crée un utilisateur Magasinier", async () => {
      await loginAs(page, "RESPONSABLE_ACHATS");
      temporaryPassword = await createUserViaUi(page, name, email);
      await expect(page.getByTestId(`user-row-${email}`)).toContainText(name);
    });

    await test.step("Le journal trace la création sans exposer le mot de passe", async () => {
      await page.goto("/parametres/journal?action=USER_CREATE");
      const rows = page.getByTestId("journal-row");
      await expect(rows.first().getByTestId("journal-action")).toHaveText("Création d'un utilisateur");
      await expect(rows.first()).toContainText("Responsable Achats (démo)");
      await rows.first().getByTestId("audit-detail").click();
      const after = page.getByTestId("audit-after");
      await expect(after).toContainText(email);
      await expect(after).not.toContainText(temporaryPassword);
      await expect(page.getByTestId("audit-before")).toHaveText("–");
      await page.keyboard.press("Escape");
      await logout(page);
    });

    await test.step("Première connexion : redirection forcée vers Mon compte, sans menu", async () => {
      await submitLogin(page, email, temporaryPassword);
      await expect(page).toHaveURL(/\/mon-compte/);
      await dismissTrialDialog(page);
      await expect(page.getByTestId("premiere-connexion")).toContainText(
        "Vous devez définir votre mot de passe",
      );
      await expect(page.getByTestId("sidebar")).toHaveCount(0);
      await expect(page.getByTestId("menu-toggle")).toHaveCount(0);
    });

    await test.step("Toute autre page ramène à Mon compte tant que le mot de passe n'est pas changé", async () => {
      for (const url of ["/accueil", "/stock", "/parametres"]) {
        await page.goto(url);
        await expect(page).toHaveURL(/\/mon-compte/);
      }
    });

    await test.step("Un nouveau mot de passe trop court ou non confirmé est refusé", async () => {
      await page.locator("#currentPassword").fill(temporaryPassword);
      await page.locator("#newPassword").fill("court");
      await page.locator("#confirmPassword").fill("court");
      await page.getByTestId("password-submit").click();
      await expect(page).toHaveURL(/\/mon-compte/);
      await expect(page.getByTestId("premiere-connexion")).toBeVisible();
      await expect(page.getByText("8 caractères").first()).toBeVisible();
    });

    await test.step("Le changement valide ramène à l'accueil avec le menu Magasinier", async () => {
      await page.locator("#currentPassword").fill(temporaryPassword);
      await page.locator("#newPassword").fill(newPassword);
      await page.locator("#confirmPassword").fill(newPassword);
      await page.getByTestId("password-submit").click();
      await expect(page).toHaveURL(/\/accueil/);
      await dismissTrialDialog(page);
      const nav = await openedNav(page);
      await expect(nav.getByTestId("nav-stock")).toBeVisible();
      await expect(nav.getByTestId("nav-parametres")).toHaveCount(0);
      await page.keyboard.press("Escape");
      await logout(page);
    });

    await test.step("L'ancien mot de passe temporaire ne fonctionne plus, le nouveau oui", async () => {
      await submitLogin(page, email, temporaryPassword);
      await expect(page.getByTestId("login-error")).toBeVisible();
      await submitLogin(page, email, newPassword);
      await expect(page).toHaveURL(/\/accueil/);
      await dismissTrialDialog(page);
      await logout(page);
    });

    await test.step("Le journal montre le changement de mot de passe", async () => {
      await loginAs(page, "RESPONSABLE_ACHATS");
      await page.goto("/parametres/journal?action=PASSWORD_CHANGE");
      await expect(page.getByTestId("journal-row").first().getByTestId("journal-action")).toHaveText(
        "Changement de mot de passe",
      );
    });
  });

  test("verrouillage après 5 échecs sur un compte jetable, puis déverrouillage", async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail("verrou", testInfo.project.name);
    const name = `E2E Verrou ${testInfo.project.name}`;
    let temporaryPassword = "";

    await test.step("Le Responsable crée un compte jetable (jamais un compte du seed)", async () => {
      await loginAs(page, "RESPONSABLE_ACHATS");
      temporaryPassword = await createUserViaUi(page, name, email);
      await logout(page);
    });

    await test.step("5 mots de passe erronés consécutifs", async () => {
      for (let i = 1; i <= 5; i++) {
        await submitLogin(page, email, `erreur-${i}-xxxxxx`);
        await expect(page.getByTestId("login-error")).toBeVisible();
      }
    });

    await test.step("Le compte est verrouillé même avec le bon mot de passe", async () => {
      await submitLogin(page, email, temporaryPassword);
      await expect(page.getByTestId("login-error")).toContainText("Compte verrouillé");
      await expect(page).toHaveURL(/\/connexion/);
    });

    await test.step("Les comptes du seed ne sont pas affectés", async () => {
      await loginAs(page, "RESPONSABLE_ACHATS");
    });

    await test.step("Le verrouillage apparaît au journal et dans la liste", async () => {
      await page.goto("/parametres/journal?action=ACCOUNT_LOCKED");
      await expect(page.getByTestId("journal-row").first().getByTestId("journal-action")).toHaveText(
        "Compte verrouillé",
      );
      await page.goto("/parametres/utilisateurs");
      await expect(page.getByTestId(`user-row-${email}`)).toContainText("Verrouillé");
    });

    await test.step("Le Responsable déverrouille le compte", async () => {
      await page.getByTestId(`user-row-${email}`).getByTestId("user-unlock").click();
      await expect(page.getByTestId(`user-row-${email}`)).not.toContainText("Verrouillé");
      await logout(page);
    });

    await test.step("L'utilisateur peut de nouveau se connecter", async () => {
      await submitLogin(page, email, temporaryPassword);
      await expect(page).toHaveURL(/\/mon-compte/);
    });
  });
});
