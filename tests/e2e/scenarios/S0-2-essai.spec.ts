import { expect, test, type Page } from "@playwright/test";
import { dismissTrialDialog, loginAs, logout, submitLogin, SEED_EMAILS, seedPassword } from "../helpers/auth";
import { setTestNow, simulatedAt } from "../helpers/clock";
import { countRows, E2E_LICENSE_SECRET, resetLicense, trialEndDay, userExists } from "../helpers/license";
import { generateLicenseKey } from "../../../src/modules/licensing/key";

/**
 * S0.2 (LOT-02, EX-05) – Période d'essai : fenêtre, badge, rappels, expiration en lecture seule,
 * activation par clé, prolongation tracée. Exécuté en desktop et en tablette (projets Playwright).
 */

const READ_ONLY_MESSAGE =
  "Période d'essai terminée : l'application est en consultation seule. Contactez Christ-Emmanuel Mouhi pour l'activer.";

let endDay = trialEndDay(30);

test.beforeEach(async ({ context }) => {
  await resetLicense(30);
  endDay = trialEndDay(30);
  await setTestNow(context, null);
});

test.afterAll(async () => {
  await resetLicense(30);
});

/** Connexion sans fermer la fenêtre d'essai. */
async function loginKeepingDialog(page: Page, email: string) {
  await submitLogin(page, email, seedPassword());
  await expect(page).toHaveURL(/\/accueil|\/mon-compte/);
}

async function expectBadge(page: Page, tone: "neutral" | "warning" | "danger", text: RegExp | string) {
  const badge = page.getByTestId("trial-badge");
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute("data-tone", tone);
  await expect(badge).toContainText(text);
}

test.describe("S0.2 – Fenêtre « Version d'essai » à la connexion", () => {
  test("chaque rôle voit la fenêtre une seule fois par session, le badge la rouvre", async ({ page, context }) => {
    await setTestNow(context, simulatedAt(endDay, 12)); // J-12 : pas un jour de rappel
    for (const email of Object.values(SEED_EMAILS)) {
      await test.step(`Connexion ${email} : la fenêtre s'affiche`, async () => {
        await loginKeepingDialog(page, email);
        const dialog = page.getByTestId("trial-dialog");
        await expect(dialog).toBeVisible();
        await expect(page.getByTestId("trial-dialog-title")).toHaveText("Version d'essai");
        await expect(page.getByTestId("trial-dialog-text")).toContainText("Merci de tester l'application RICHBOND Achats & Stocks");
        await expect(page.getByTestId("trial-end-date")).toContainText(/\d{4}/);
        await expect(page.getByTestId("trial-countdown")).toContainText(/^12 j \d{2} h \d{2} min$/);
        await expect(page.getByTestId("trial-progress")).toBeVisible();
      });
      await test.step("« Continuer » ferme la fenêtre, pas de réaffichage en naviguant", async () => {
        await page.getByTestId("trial-continue").click();
        await expect(page.getByTestId("trial-dialog")).toBeHidden();
        await page.goto("/stock");
        await expect(page.getByTestId("trial-badge")).toBeVisible();
        await expect(page.getByTestId("trial-dialog")).toBeHidden();
      });
      await test.step("Le badge rouvre la fenêtre", async () => {
        await page.getByTestId("trial-badge").click();
        await expect(page.getByTestId("trial-dialog")).toBeVisible();
        await page.getByTestId("trial-continue").click();
        await expect(page.getByTestId("trial-dialog")).toBeHidden();
      });
      await logout(page);
    }
  });

  test("la date de fin est affichée en toutes lettres (jour de la semaine, mois)", async ({ page, context }) => {
    await setTestNow(context, simulatedAt(endDay, 12));
    await loginKeepingDialog(page, SEED_EMAILS.RESPONSABLE_ACHATS);
    await expect(page.getByTestId("trial-end-date")).toHaveText(
      /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) \d{1,2} [a-zéûô]+ \d{4}$/,
    );
  });
});

test.describe("S0.2 – Badge selon la date simulée (cookie rb-test-now)", () => {
  const cases: { label: string; days: number; time?: string; tone: "neutral" | "warning" | "danger"; text: RegExp }[] = [
    { label: "J-30", days: 30, tone: "neutral", text: /Essai : 30 j restants/ },
    { label: "J-8", days: 8, tone: "neutral", text: /Essai : 8 j restants/ },
    { label: "J-7", days: 7, tone: "warning", text: /Essai : 7 j restants/ },
    { label: "J-3", days: 3, tone: "warning", text: /Essai : 3 j restants/ },
    { label: "J-2", days: 2, tone: "danger", text: /Essai : 2 j restants/ },
    { label: "J-1", days: 1, tone: "danger", text: /Essai : 1 j restant$/ },
    { label: "dernier jour 18:00 (heures restantes)", days: 0, time: "18:00", tone: "danger", text: /se termine dans 5 h 59 min/ },
  ];
  for (const c of cases) {
    test(`${c.label} : badge ${c.tone}`, async ({ page, context }) => {
      await test.step(`Heure serveur simulée à ${c.label}`, async () => {
        await setTestNow(context, simulatedAt(endDay, c.days, c.time ?? "10:00"));
        await loginKeepingDialog(page, SEED_EMAILS.RESPONSABLE_ACHATS);
        await dismissTrialDialog(page);
      });
      await test.step("Couleur et texte du badge", async () => {
        await expectBadge(page, c.tone, c.text);
      });
      await test.step("Aucun bandeau de lecture seule tant que l'essai court", async () => {
        await expect(page.getByTestId("read-only-banner")).toHaveCount(0);
      });
    });
  }

  test("le cookie rb-test-now est lu côté serveur (HTML rendu par le serveur, sans JavaScript)", async ({ page, context }) => {
    await test.step("Connexion à l'heure réelle : badge à 30 j", async () => {
      await loginAs(page, "RESPONSABLE_ACHATS");
      const html = await (await page.request.get("/accueil")).text();
      expect(html).toContain("Essai : 30 j restants");
    });
    await test.step("Cookie J-5 : le HTML serveur change", async () => {
      await setTestNow(context, simulatedAt(endDay, 5));
      const html = await (await page.request.get("/accueil")).text();
      expect(html).toContain("Essai : 5 j restants");
      expect(html).toContain('data-tone="warning"');
    });
    await test.step("Cookie après la fin : le serveur rend le bandeau de lecture seule", async () => {
      await setTestNow(context, simulatedAt(endDay, -1, "08:00"));
      const html = await (await page.request.get("/accueil")).text();
      expect(html).toContain("Période d&#x27;essai terminée – consultation seule");
    });
    await test.step("Cookie invalide : ignoré, heure réelle", async () => {
      await setTestNow(context, "pas-une-date");
      const html = await (await page.request.get("/accueil")).text();
      expect(html).toContain("Essai : 30 j restants");
    });
  });
});

test.describe("S0.2 – Rappels J-7, J-3, J-1 et dernier jour", () => {
  test("la fenêtre se réaffiche automatiquement les jours de rappel, une seule fois par jour", async ({ page, context }) => {
    await test.step("Connexion à J-9 : première fenêtre, fermée", async () => {
      await setTestNow(context, simulatedAt(endDay, 9));
      await loginKeepingDialog(page, SEED_EMAILS.RESPONSABLE_ACHATS);
      await expect(page.getByTestId("trial-dialog")).toBeVisible();
      await page.getByTestId("trial-continue").click();
      await expect(page.getByTestId("trial-dialog")).toBeHidden();
    });
    const jours: { days: number; time?: string; label: string }[] = [
      { days: 7, label: "J-7" },
      { days: 3, label: "J-3" },
      { days: 1, label: "J-1" },
      { days: 0, time: "09:00", label: "dernier jour" },
    ];
    for (const j of jours) {
      await test.step(`Même session, passage à ${j.label} : la fenêtre se réaffiche`, async () => {
        await setTestNow(context, simulatedAt(endDay, j.days, j.time ?? "10:00"));
        await page.goto("/accueil");
        await expect(page.getByTestId("trial-dialog")).toBeVisible();
        await page.getByTestId("trial-continue").click();
        await expect(page.getByTestId("trial-dialog")).toBeHidden();
      });
      await test.step(`${j.label} : pas de second affichage le même jour`, async () => {
        await page.goto("/stock");
        await expect(page.getByTestId("trial-badge")).toBeVisible();
        await expect(page.getByTestId("trial-dialog")).toBeHidden();
      });
    }
    await test.step("Un jour sans rappel (J-5) : pas de réaffichage", async () => {
      await setTestNow(context, simulatedAt(endDay, 5));
      await page.goto("/accueil");
      await expect(page.getByTestId("trial-badge")).toHaveAttribute("data-tone", "warning");
      await expect(page.getByTestId("trial-dialog")).toBeHidden();
    });
  });

  test("le dernier jour, la fenêtre s'affiche à chaque connexion avec les heures restantes", async ({ page, context }) => {
    await setTestNow(context, simulatedAt(endDay, 0, "20:00"));
    for (let i = 0; i < 2; i++) {
      await test.step(`Connexion n°${i + 1} le dernier jour`, async () => {
        await loginKeepingDialog(page, SEED_EMAILS.RESPONSABLE_ACHATS);
        await expect(page.getByTestId("trial-dialog")).toBeVisible();
        await expect(page.getByTestId("trial-countdown")).toHaveText("3 h 59 min");
        await page.getByTestId("trial-continue").click();
        await logout(page);
      });
    }
  });
});

test.describe("S0.2 – Expiration : consultation seule", () => {
  test("connexion OK, bandeau rouge, fenêtre explicative, boutons désactivés, écriture serveur refusée, rien de supprimé", async ({
    page,
    context,
  }, testInfo) => {
    const avant = await countRows();
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};
    let capturedBody = "";
    const email = `e2e-essai-${testInfo.project.name}-${Date.now()}@richbond.test`;
    const emailRefuse = `e2e-refuse-${testInfo.project.name}-${Date.now()}@richbond.test`;

    await test.step("Avant l'échéance : le Responsable crée un utilisateur (action serveur réelle capturée)", async () => {
      await loginAs(page, "RESPONSABLE_ACHATS");
      await page.goto("/parametres/utilisateurs");
      await page.waitForLoadState("networkidle"); // hydratation avant saisie
      await page.getByTestId("user-create").click();
      const dialog = page.getByTestId("user-form-dialog");
      await dialog.getByLabel("Nom complet").fill("E2E Essai");
      await dialog.getByLabel("Adresse email").fill(email);
      await dialog.getByLabel("Rôle").selectOption("MAGASINIER");
      page.on("request", (r) => {
        if (r.method() === "POST" && r.headers()["next-action"] && (r.postData() ?? "").includes(email)) {
          capturedUrl = r.url();
          capturedHeaders = r.headers();
          capturedBody = r.postData() ?? "";
        }
      });
      await page.getByTestId("user-form-submit").click();
      await expect(page.getByTestId("temp-password-value")).toBeVisible();
      await page.getByTestId("temp-password-close").click();
      expect(capturedBody).toContain(email);
      expect(await userExists(email)).toBe(true);
      await logout(page);
    });

    await test.step("Heure simulée après la fin de l'essai : la connexion reste possible", async () => {
      await setTestNow(context, simulatedAt(endDay, -1, "08:00"));
      await loginKeepingDialog(page, SEED_EMAILS.RESPONSABLE_ACHATS);
    });

    await test.step("Fenêtre explicative « Période d'essai terminée » à la connexion", async () => {
      await expect(page.getByTestId("trial-dialog")).toBeVisible();
      await expect(page.getByTestId("trial-dialog-title")).toHaveText("Période d'essai terminée");
      await expect(page.getByTestId("trial-expired-help")).toContainText("aucune donnée n'a été supprimée");
      await expect(page.getByTestId("trial-expired-help")).toContainText("Christ-Emmanuel Mouhi");
      await page.getByTestId("trial-continue").click();
      await expect(page.getByTestId("trial-dialog")).toBeHidden();
    });

    await test.step("Bandeau rouge fixe et badge « Consultation seule »", async () => {
      const banner = page.getByTestId("read-only-banner");
      await expect(banner).toBeVisible();
      await expect(banner).toContainText("Période d'essai terminée – consultation seule");
      await expect(page.getByTestId("trial-badge")).toHaveAttribute("data-tone", "danger");
      await expect(page.getByTestId("trial-badge")).toContainText("Consultation seule");
    });

    await test.step("Consultation : liste des utilisateurs et journal restent lisibles", async () => {
      await page.goto("/parametres/utilisateurs");
      await expect(page.getByTestId(`user-row-${email}`)).toBeVisible();
      await expect(page.getByTestId("read-only-banner")).toBeVisible();
      await page.goto("/parametres/journal");
      await expect(page.getByTestId("journal-row").first()).toBeVisible();
    });

    await test.step("Les boutons d'écriture sont désactivés avec infobulle", async () => {
      await page.goto("/parametres/utilisateurs");
      const create = page.getByTestId("user-create");
      await expect(create).toBeDisabled();
      const hint = page.getByTestId("write-disabled-hint").first();
      await page.waitForLoadState("networkidle"); // hydratation avant survol
      await expect(async () => {
        if (testInfo.project.name === "tablette") await hint.tap(); // toucher sur tablette
        else await hint.hover();
        await expect(page.getByTestId("write-disabled-tooltip")).toContainText(READ_ONLY_MESSAGE, { timeout: 1500 });
      }).toPass({ timeout: 10_000 });
    });

    await test.step("Appel direct de l'action serveur d'écriture : refusé, rien créé", async () => {
      expect(capturedUrl).not.toBe("");
      const headers: Record<string, string> = {};
      for (const k of ["next-action", "content-type", "next-router-state-tree", "accept"]) {
        if (capturedHeaders[k]) headers[k] = capturedHeaders[k];
      }
      const res = await page.request.post(capturedUrl, {
        headers,
        data: capturedBody.split(email).join(emailRefuse),
      });
      const text = await res.text();
      expect(text).toContain("Période d'essai terminée");
      expect(text).toContain("consultation seule");
      expect(await userExists(emailRefuse)).toBe(false);
    });

    await test.step("Aucune donnée supprimée ni masquée", async () => {
      const apres = await countRows();
      expect(apres.users).toBeGreaterThanOrEqual(avant.users + 1);
      expect(apres.auditLogs).toBeGreaterThanOrEqual(avant.auditLogs);
      await page.goto("/parametres/utilisateurs");
      for (const e of Object.values(SEED_EMAILS)) {
        if (e !== SEED_EMAILS.SUPER_ADMIN) await expect(page.getByTestId(`user-row-${e}`)).toBeVisible();
      }
    });

    await test.step("Le Magasinier se connecte et consulte le stock en lecture seule", async () => {
      await logout(page);
      await loginKeepingDialog(page, SEED_EMAILS.MAGASINIER);
      await expect(page.getByTestId("trial-dialog")).toBeVisible();
      await page.getByTestId("trial-continue").click();
      await page.goto("/stock");
      await expect(page.getByTestId("page-title")).toBeVisible();
      await expect(page.getByTestId("read-only-banner")).toBeVisible();
    });
  });

  test("à la seconde exacte de la fin : encore en essai, 1 ms après : lecture seule", async ({ page, context }) => {
    await setTestNow(context, `${endDay}T23:59:59.000Z`);
    await loginKeepingDialog(page, SEED_EMAILS.RESPONSABLE_ACHATS);
    await dismissTrialDialog(page);
    await expect(page.getByTestId("read-only-banner")).toHaveCount(0);
    await setTestNow(context, new Date(new Date(`${endDay}T23:59:59.999Z`).getTime() + 1).toISOString());
    await page.goto("/accueil");
    await expect(page.getByTestId("read-only-banner")).toBeVisible();
  });
});

test.describe("S0.2 – Activation et prolongation par le Super-admin", () => {
  test("clé invalide refusée, clé valide active la licence, tout disparaît pour les utilisateurs", async ({ page, context }) => {
    await test.step("Essai expiré : le Super-admin ouvre la page Licence (activation exemptée de la garde)", async () => {
      await setTestNow(context, simulatedAt(endDay, -1, "08:00"));
      await loginAs(page, "SUPER_ADMIN");
      await page.goto("/parametres/licence");
      await page.waitForLoadState("networkidle");
      await expect(page.getByTestId("licence-statut")).toBeVisible();
      await expect(page.getByTestId("licence-restant")).toContainText("Terminé");
    });

    await test.step("Clé invalide : message d'erreur, statut inchangé", async () => {
      await page.getByTestId("activate-key").fill("RB-AAAAA-BBBBB-CCCCC-DDDDD");
      await page.getByTestId("activate-submit").click();
      await page.getByTestId("activate-confirm").getByRole("button", { name: "Activer" }).click();
      await expect(page.getByTestId("activate-error")).toContainText("Clé de licence invalide");
      await expect(page.getByTestId("licence-active")).toHaveCount(0);
      await expect(page.getByTestId("licence-restant")).toContainText("Terminé");
    });

    await test.step("L'échec est tracé au journal", async () => {
      await page.goto("/parametres/journal?action=LICENSE_ACTIVATION_FAILED");
      await expect(page.getByTestId("journal-row").first().getByTestId("journal-action")).toHaveText("Échec d'activation");
    });

    await test.step("Clé valide (générée avec le secret de test) : licence active", async () => {
      const key = generateLicenseKey(E2E_LICENSE_SECRET, "RICHBOND CI");
      expect(key).toMatch(/^RB-[A-Z2-7]{5}(-[A-Z2-7]{5}){3}$/);
      await page.goto("/parametres/licence");
      await page.waitForLoadState("networkidle");
      await page.getByTestId("activate-key").fill(key);
      await page.getByTestId("activate-submit").click();
      await page.getByTestId("activate-confirm").getByRole("button", { name: "Activer" }).click();
      await expect(page.getByTestId("licence-active")).toContainText("Licence active – RICHBOND CI – activée le");
      await expect(page.getByTestId("licence-active")).toContainText(/\d{2}\/\d{2}\/\d{4}/);
    });

    await test.step("Le journal trace l'activation sans exposer la clé", async () => {
      await page.goto("/parametres/journal?action=LICENSE_ACTIVATE");
      const row = page.getByTestId("journal-row").first();
      await expect(row.getByTestId("journal-action")).toHaveText("Activation de la licence");
      await row.getByTestId("audit-detail").click();
      const key = generateLicenseKey(E2E_LICENSE_SECRET, "RICHBOND CI");
      await expect(page.getByTestId("audit-after")).not.toContainText(key);
      await page.keyboard.press("Escape");
    });

    await test.step("Le Responsable (même horloge expirée) : plus de badge, de fenêtre ni de bandeau, écriture possible", async () => {
      await logout(page);
      await submitLogin(page, SEED_EMAILS.RESPONSABLE_ACHATS, seedPassword());
      await expect(page).toHaveURL(/\/accueil/);
      await expect(page.getByTestId("trial-dialog")).toHaveCount(0);
      await expect(page.getByTestId("trial-badge")).toHaveCount(0);
      await expect(page.getByTestId("read-only-banner")).toHaveCount(0);
      await page.goto("/parametres/utilisateurs");
      await expect(page.getByTestId("user-create")).toBeEnabled();
    });
  });

  test("seul le Super-admin accède à la licence", async ({ page }) => {
    await loginAs(page, "RESPONSABLE_ACHATS");
    await page.goto("/parametres/licence");
    await expect(page).toHaveURL(/\/acces-refuse/);
  });

  test("prolongation de l'essai : tracée au journal (avant/après), le statut repasse en essai", async ({ page, context }) => {
    const newDay = new Date(new Date(`${endDay}T00:00:00Z`).getTime() + 15 * 86_400_000).toISOString().slice(0, 10);
    await test.step("Essai expiré, le Super-admin prolonge de 15 jours", async () => {
      await setTestNow(context, simulatedAt(endDay, -1, "08:00"));
      await loginAs(page, "SUPER_ADMIN");
      await page.goto("/parametres/licence");
      await page.waitForLoadState("networkidle"); // hydratation avant saisie
      await page.getByTestId("extend-date").fill(newDay);
      await page.getByTestId("extend-submit").click();
      await expect(page.getByTestId("licence-restant")).not.toContainText("Terminé");
      await expect(page.getByTestId("licence-restant")).toContainText(/14 j/);
    });
    await test.step("Plus de bandeau de lecture seule", async () => {
      await page.goto("/accueil");
      await expect(page.getByTestId("read-only-banner")).toHaveCount(0);
      await expect(page.getByTestId("trial-badge")).toHaveAttribute("data-tone", "neutral");
    });
    await test.step("Le journal trace la prolongation avec l'ancienne et la nouvelle valeur", async () => {
      await page.goto("/parametres/journal?action=LICENSE_TRIAL_EXTEND");
      const row = page.getByTestId("journal-row").first();
      await expect(row.getByTestId("journal-action")).toHaveText("Prolongation de l'essai");
      await row.getByTestId("audit-detail").click();
      await expect(page.getByTestId("audit-before")).not.toHaveText("–");
      await expect(page.getByTestId("audit-after")).toContainText(newDay);
    });
  });

  test("une date passée est refusée à la prolongation", async ({ page }) => {
    await loginAs(page, "SUPER_ADMIN");
    await page.goto("/parametres/licence");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("extend-date").evaluate((el: HTMLInputElement) => el.removeAttribute("min"));
    await page.getByTestId("extend-date").fill("2020-01-01");
    await page.getByTestId("extend-submit").click();
    await expect(page.getByTestId("extend-error")).toBeVisible();
  });
});
