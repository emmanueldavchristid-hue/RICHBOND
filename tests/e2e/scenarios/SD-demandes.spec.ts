import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { loginAs, logout } from "../helpers/auth";
import { setTestNow, simulatedAt } from "../helpers/clock";
import {
  auditCount,
  closeBell,
  createAndSubmitPr,
  dayOffset,
  emailOf,
  expectNotification,
  fillNewPr,
  norm,
  notificationsFor,
  openPr,
  prEvents,
  prRow,
  ready,
  submitForm,
  t,
  title,
  uniqueTag,
} from "../helpers/da";
import { dbOne, dbQuery } from "../helpers/db";
import { resetLicense, trialEndDay } from "../helpers/license";

/**
 * SD1 à SD5 (LOT-04, EX-20) – Cas particuliers des demandes d'achat : arrêt de production, refus et complément,
 * doublon, validation groupée, essai expiré. Joués en desktop et en tablette (projets Playwright).
 */

test.beforeEach(async ({ context }) => {
  await resetLicense(30);
  await setTestNow(context, null);
});

test.afterAll(async () => {
  await resetLicense(30);
});

// ---------------------------------------------------------------------------------------------------
test("SD1 – Arrêt de production : en tête de liste, bandeau rouge et notification critique chez le Responsable", async ({
  page,
}, testInfo) => {
  const tag = uniqueTag("SD1", testInfo.project.name);
  const reason = `Ligne mousse continue arrêtée – roulement 6308 ${tag}`;
  let number = "";

  await test.step("Acheteur local : crée une DA « Arrêt de production » ; la date de besoin passe à aujourd'hui", async () => {
    await loginAs(page, "ACHETEUR_LOCAL");
    await fillNewPr(page, {
      department: "Maintenance",
      urgency: "ARRET_PRODUCTION",
      type: "LOCAL",
      reason,
      lines: [{ search: "Roulement 6308", qty: "2", price: "38000" }],
    });
    await expect(t(page, "pr-needed-by")).toHaveValue(dayOffset(0));
  });

  await test.step("Acheteur local : soumet ; la fiche affiche l'alerte rouge et la priorité 0 est enregistrée", async () => {
    number = await submitForm(page);
    await expect(t(page, "status-SOUMISE")).toHaveText("À valider");
    await expect(t(page, "urgency-ARRET_PRODUCTION")).toBeVisible();
    await expect(t(page, "pr-stop-banner")).toContainText("Arrêt de production");
    const pr = await prRow(number);
    expect(pr.urgency).toBe("ARRET_PRODUCTION");
    expect(pr.priority).toBe(0);
    expect(pr.status).toBe("SOUMISE");
  });

  await test.step("Responsable : bandeau rouge persistant en tête de toutes les pages et notification critique", async () => {
    await logout(page);
    await loginAs(page, "RESPONSABLE_ACHATS");
    const banner = t(page, "critical-banner");
    await expect(banner).toBeVisible();
    const mine = t(page, "critical-banner-item").filter({ hasText: number });
    await expect(mine).toContainText(`Arrêt de production : ${number} à valider`);
    await expect(mine).toContainText("Maintenance");
    // Persistant : toujours présent après navigation vers une autre page.
    await ready(page, "/stock/articles");
    await expect(t(page, "critical-banner-item").filter({ hasText: number })).toBeVisible();

    await expectNotification(page, `Arrêt de production : ${number} à valider`);
    const notifs = await notificationsFor("responsable@richbond.test", number);
    expect(notifs).toHaveLength(1);
    expect(notifs[0].severity).toBe("CRITIQUE");
    await closeBell(page);
  });

  await test.step("Responsable : la DA est en tête de la liste « À valider », ligne surlignée, devant les urgentes et normales", async () => {
    await ready(page, "/achats/demandes?onglet=a-valider");
    const rows = page.locator('tr[data-testid^="pr-row-"]');
    await expect(t(page, `pr-row-${number}`)).toBeVisible();
    const flags = await rows.evaluateAll((trs) =>
      trs.map((tr) => ({
        id: tr.getAttribute("data-testid"),
        stop: !!tr.querySelector('[data-testid="urgency-ARRET_PRODUCTION"]'),
        red: tr.className.includes("bg-red-50"),
      })),
    );
    expect(flags.length).toBeGreaterThan(1);
    const firstNonStop = flags.findIndex((f) => !f.stop);
    // Tous les arrêts de production forment le début de la liste ; au moins une autre DA (urgente/normale) suit.
    expect(firstNonStop).toBeGreaterThan(0);
    expect(flags.slice(firstNonStop).every((f) => !f.stop)).toBe(true);
    const mine = flags.findIndex((f) => f.id === `pr-row-${number}`);
    expect(mine).toBeGreaterThanOrEqual(0);
    expect(mine).toBeLessThan(firstNonStop);
    expect(flags[mine].red).toBe(true);
  });

  await test.step("Responsable : trier par date de besoin ne fait pas descendre l'arrêt de production", async () => {
    await ready(page, "/achats/demandes?onglet=a-valider&tri=neededBy&ordre=desc");
    const first = await page
      .locator('tr[data-testid^="pr-row-"]')
      .first()
      .getByTestId("urgency-ARRET_PRODUCTION")
      .count();
    expect(first).toBe(1);
  });

  await test.step("Responsable : ouvre la DA depuis le bandeau et la valide ; le bandeau de cette DA disparaît", async () => {
    await ready(page, "/accueil");
    await t(page, "critical-banner-item")
      .filter({ hasText: number })
      .getByTestId("critical-banner-link")
      .click();
    await expect(title(page)).toHaveText(number);
    await page.waitForLoadState("networkidle");
    await t(page, "pr-action-approve").click();
    await t(page, "pr-approve-confirm").click();
    await expect(t(page, "status-VALIDEE")).toHaveText("Validée");
    await expect(t(page, "pr-stop-banner")).toHaveCount(0);
    await expect(t(page, "critical-banner-item").filter({ hasText: number })).toHaveCount(0);
    expect((await prRow(number)).status).toBe("VALIDEE");
  });

  await test.step("Acheteur local : la DA validée lui est assignée avec une notification critique", async () => {
    await logout(page);
    await loginAs(page, "ACHETEUR_LOCAL");
    await expectNotification(page, `${number} validée et assignée à vous`);
    const n = (await notificationsFor("acheteur.local@richbond.test", number)).find(
      (x) => x.type === "PR_ASSIGNED",
    );
    expect(n?.severity).toBe("CRITIQUE");
  });
});

// ---------------------------------------------------------------------------------------------------
test("SD2 – Retour « à compléter », correction et resoumission (même numéro), puis refus avec motif", async ({
  page,
}, testInfo) => {
  const tag = uniqueTag("SD2", testInfo.project.name);
  const reason = `Capteur laser de positionnement ${tag}`;
  const complement = "Précisez le modèle du capteur et la machine concernée.";
  const motifRefus = "Un capteur équivalent est déjà en stock : utilisez-le d'abord.";
  let number = "";

  await test.step("Acheteur import : crée et soumet une DA (désignation libre, Import)", async () => {
    await loginAs(page, "ACHETEUR_IMPORT");
    number = await createAndSubmitPr(page, {
      department: "Production",
      type: "IMPORT",
      neededBy: dayOffset(30),
      reason,
      lines: [{ free: `Capteur laser de positionnement ${tag}`, qty: "1", price: "450000" }],
    });
    expect((await prRow(number)).status).toBe("SOUMISE");
  });

  await test.step("Responsable : « Renvoyer à compléter » exige un commentaire, puis renvoie la DA", async () => {
    await logout(page);
    await loginAs(page, "RESPONSABLE_ACHATS");
    await openPr(page, number);
    await t(page, "pr-action-return").click();
    await t(page, "pr-return-dialog-confirm").click();
    await expect(t(page, "pr-return-dialog")).toContainText("obligatoire");
    expect((await prRow(number)).status).toBe("SOUMISE");
    await t(page, "pr-return-dialog-text").fill(complement);
    await t(page, "pr-return-dialog-confirm").click();
    await expect(t(page, "status-A_COMPLETER")).toHaveText("À compléter");
    await expect(t(page, "pr-return-banner")).toContainText(complement);
    await expect(t(page, "pr-event-RETURNED")).toContainText(complement);
  });

  await test.step("Acheteur import : notifié, ouvre la DA depuis la cloche, lit le commentaire", async () => {
    await logout(page);
    await loginAs(page, "ACHETEUR_IMPORT");
    await expectNotification(page, `${number} renvoyée pour complément`);
    const notifs = await notificationsFor("acheteur.import@richbond.test", number);
    expect(notifs.map((n) => n.type)).toContain("PR_RETURNED");
    await t(page, "notification-item")
      .filter({ hasText: `${number} renvoyée pour complément` })
      .first()
      .click();
    await expect(title(page)).toHaveText(number);
    await expect(t(page, "pr-return-banner")).toContainText(complement);
  });

  await test.step("Acheteur import : corrige (motif, quantité) et resoumet : le numéro ne change pas", async () => {
    await page.waitForLoadState("networkidle");
    await t(page, "pr-action-edit").click();
    await expect(t(page, "pr-form")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await t(page, "pr-reason").fill(`${reason} – modèle LK-500 pour la découpeuse n°2`);
    await t(page, "pr-line-1-qty").fill("2");
    await t(page, "pr-submit").click();
    await t(page, "pr-submit-dialog-confirm").click();
    await expect(title(page)).toHaveText(number);
    await expect(t(page, "status-SOUMISE")).toHaveText("À valider");
    await expect(t(page, "pr-reason")).toContainText("LK-500");
    await expect(t(page, "pr-event-RESUBMITTED")).toBeVisible();

    const same = await dbOne<{ n: string }>(
      `SELECT count(*)::text AS n FROM purchase_requests WHERE reason LIKE $1`,
      [`%${tag}%`],
    );
    expect(Number(same.n)).toBe(1);
    const pr = await prRow(number);
    expect(pr.status).toBe("SOUMISE");
    const types = (await prEvents(number)).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(["SUBMITTED", "RETURNED", "RESUBMITTED"]));
  });

  await test.step("Responsable : refuse avec un motif obligatoire (5 caractères minimum)", async () => {
    await logout(page);
    await loginAs(page, "RESPONSABLE_ACHATS");
    await expectNotification(page, new RegExp(`${number} à valider`));
    await closeBell(page);
    await openPr(page, number);
    await expect(t(page, "status-SOUMISE")).toBeVisible();
    await t(page, "pr-action-reject").click();
    await t(page, "pr-reject-dialog-text").fill("non");
    await t(page, "pr-reject-dialog-confirm").click();
    await expect(t(page, "pr-reject-dialog")).toContainText("obligatoire");
    expect((await prRow(number)).status).toBe("SOUMISE");
    await t(page, "pr-reject-dialog-text").fill(motifRefus);
    await t(page, "pr-reject-dialog-confirm").click();
    await expect(t(page, "status-REFUSEE")).toHaveText("Refusée");
    await expect(t(page, "pr-reject-banner")).toContainText(motifRefus);
    const pr = await prRow(number);
    expect(pr.status).toBe("REFUSEE");
    expect(pr.rejected_reason).toBe(motifRefus);
    expect(await auditCount(pr.id, "PR_REJECT")).toBe(1);
  });

  await test.step("Acheteur import : notifié du refus, motif visible, DA définitivement fermée", async () => {
    await logout(page);
    await loginAs(page, "ACHETEUR_IMPORT");
    await expectNotification(page, `${number} refusée`);
    await closeBell(page);
    await openPr(page, number);
    await expect(t(page, "status-REFUSEE")).toBeVisible();
    await expect(t(page, "pr-reject-banner")).toContainText(motifRefus);
    for (const a of ["pr-action-edit", "pr-action-submit", "pr-action-approve", "pr-action-reject"]) {
      await expect(t(page, a)).toHaveCount(0);
    }
    const types = (await prEvents(number)).map((e) => e.type);
    expect(types.at(-1)).toBe("REJECTED");
  });
});

// ---------------------------------------------------------------------------------------------------
test("SD3 – Doublon : une 2e DA sur le même article affiche un avertissement non bloquant", async ({
  page,
}, testInfo) => {
  const tag = uniqueTag("SD3", testInfo.project.name);
  const needed = dayOffset(10);
  const shortDate = `${needed.slice(8, 10)}/${needed.slice(5, 7)}`;
  let first = "";
  let second = "";

  await test.step("Acheteur local : soumet une première DA de 5 « Cutter de découpe »", async () => {
    await loginAs(page, "ACHETEUR_LOCAL");
    first = await createAndSubmitPr(page, {
      department: "Logistique",
      type: "LOCAL",
      neededBy: needed,
      reason: `Cutters pour le conditionnement ${tag}`,
      lines: [{ search: "Cutter de découpe", qty: "5" }],
    });
    expect((await prRow(first)).status).toBe("SOUMISE");
  });

  await test.step("Acheteur import : saisit une 2e DA avec le même article ; l'avertissement apparaît avant l'envoi", async () => {
    await logout(page);
    await loginAs(page, "ACHETEUR_IMPORT");
    await fillNewPr(page, {
      department: "Logistique",
      type: "LOCAL",
      neededBy: dayOffset(20),
      reason: `Cutters pour l'expédition ${tag}`,
      lines: [{ search: "Cutter de découpe", qty: "3" }],
    });
    const warn = t(page, "pr-line-1-duplicate");
    await expect(warn).toBeVisible();
    const msg = warn.getByTestId("pr-line-1-duplicate-message").filter({ hasText: first });
    await expect(msg).toContainText(`Déjà demandé : ${first}`);
    await expect(msg).toContainText("5");
    await expect(msg).toContainText(`besoin le ${shortDate}`);
    await expect(warn).toContainText("ne bloque rien");
  });

  await test.step("L'avertissement ne bloque pas : la DA est soumise", async () => {
    second = await submitForm(page);
    expect(second).not.toBe(first);
    expect((await prRow(second)).status).toBe("SOUMISE");
  });

  await test.step("Responsable : le rappel du doublon s'affiche aussi sur la fiche, au moment de valider", async () => {
    await logout(page);
    await loginAs(page, "RESPONSABLE_ACHATS");
    await openPr(page, second);
    const reminder = t(page, "pr-duplicates");
    await expect(reminder).toBeVisible();
    await expect(reminder.getByTestId("pr-duplicates-message").filter({ hasText: first })).toContainText(
      `Déjà demandé : ${first}`,
    );
    // La DA elle-même n'est pas son propre doublon.
    await expect(reminder.getByTestId("pr-duplicates-message").filter({ hasText: second })).toHaveCount(0);
  });

  await test.step("Une DA annulée ne compte plus comme doublon", async () => {
    await openPr(page, first);
    await t(page, "pr-action-cancel").click();
    await t(page, "pr-cancel-dialog-text").fill("Doublon avec une autre demande.");
    await t(page, "pr-cancel-dialog-confirm").click();
    await expect(t(page, "status-ANNULEE")).toHaveText("Annulée");
    await openPr(page, second);
    await expect(
      t(page, "pr-duplicates").getByTestId("pr-duplicates-message").filter({ hasText: first }),
    ).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------------------------------
test("SD4 – Validation groupée de 3 DA par le Responsable sur tablette", async ({ page }, testInfo) => {
  const tag = uniqueTag("SD4", testInfo.project.name);
  const numbers: string[] = [];

  await test.step("Acheteur local : soumet 3 DA locales (désignations libres)", async () => {
    await loginAs(page, "ACHETEUR_LOCAL");
    for (const i of [1, 2, 3]) {
      numbers.push(
        await createAndSubmitPr(page, {
          department: "Production",
          type: "LOCAL",
          neededBy: dayOffset(10 + i),
          reason: `Lot de fournitures n°${i} ${tag}`,
          lines: [{ free: `Fourniture diverse ${i} ${tag}`, qty: String(i), price: "1000" }],
        }),
      );
    }
    expect(new Set(numbers).size).toBe(3);
  });

  await test.step("Responsable : les 3 DA sont dans « À valider », il les coche", async () => {
    await logout(page);
    await loginAs(page, "RESPONSABLE_ACHATS");
    await ready(page, `/achats/demandes?onglet=a-valider&q=${tag}`);
    for (const n of numbers) await expect(t(page, `pr-row-${n}`)).toBeVisible();
    await expect(page.locator('tr[data-testid^="pr-row-"]')).toHaveCount(3);
    await expect(t(page, "pr-bulk-approve")).toHaveCount(0);
    for (const n of numbers) await t(page, `pr-select-${n}`).check();
    await expect(t(page, "pr-bulk-approve")).toContainText("Valider la sélection (3)");
  });

  await test.step("Récapitulatif puis confirmation : « 3 validées, 0 écartée »", async () => {
    await t(page, "pr-bulk-approve").click();
    await expect(t(page, "pr-bulk-dialog")).toBeVisible();
    for (const n of numbers) await expect(t(page, "pr-bulk-list")).toContainText(n);
    await expect(t(page, "pr-bulk-skipped")).toHaveCount(0);
    await t(page, "pr-bulk-confirm").click();
    await expect(t(page, "pr-bulk-report")).toBeVisible();
    await expect(t(page, "pr-bulk-summary")).toHaveText("3 validées, 0 écartée par le contrôle.");
    for (const n of numbers) await expect(t(page, `pr-bulk-result-${n}`)).toContainText("Validée");
    await t(page, "pr-bulk-report-close").click();
    await expect(t(page, "pr-bulk-report")).toBeHidden();
  });

  await test.step("Effet métier : les 3 DA sont validées, assignées à l'acheteur local, tracées et notifiées", async () => {
    for (const n of numbers) {
      const pr = await prRow(n);
      expect(pr.status).toBe("VALIDEE");
      expect(await emailOf(pr.approved_by_id)).toBe("responsable@richbond.test");
      expect(await emailOf(pr.assigned_buyer_id)).toBe("acheteur.local@richbond.test");
      expect(await auditCount(pr.id, "PR_APPROVE")).toBe(1);
      expect((await prEvents(n)).map((e) => e.type)).toContain("APPROVED");
      const notifs = await notificationsFor("acheteur.local@richbond.test", n);
      expect(notifs.map((x) => x.type)).toContain("PR_ASSIGNED");
    }
    // La liste « À valider » ne contient plus ces DA.
    await ready(page, `/achats/demandes?onglet=a-valider&q=${tag}`);
    await expect(page.locator('tr[data-testid^="pr-row-"]')).toHaveCount(0);
    await ready(page, `/achats/demandes?onglet=toutes&q=${tag}`);
    await expect(page.locator('tr[data-testid^="pr-row-"] [data-testid="status-VALIDEE"]')).toHaveCount(3);
  });

  await test.step("Acheteur local : retrouve les 3 DA dans « Assignées à moi »", async () => {
    await logout(page);
    await loginAs(page, "ACHETEUR_LOCAL");
    await ready(page, `/achats/demandes?onglet=assignees&q=${tag}`);
    for (const n of numbers) await expect(t(page, `pr-row-${n}`)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------------------------------
test.describe("SD5 – Essai expiré : consultation et export seulement", () => {
  test.afterEach(async () => {
    await resetLicense(30);
  });

  test("liste, fiche et export OK ; création, validation et refus grisés ; marquer lu autorisé", async ({
    page,
    context,
  }, testInfo) => {
    const tag = uniqueTag("SD5", testInfo.project.name);
    let number = "";

    await test.step("Avant l'expiration : l'acheteur local soumet une DA (le Responsable reçoit une notification)", async () => {
      await loginAs(page, "ACHETEUR_LOCAL");
      number = await createAndSubmitPr(page, {
        department: "Administration",
        type: "LOCAL",
        neededBy: dayOffset(8),
        reason: `Classeurs et chemises ${tag}`,
        lines: [{ free: `Classeurs à levier ${tag}`, qty: "20" }],
      });
      await logout(page);
    });

    await test.step("Heure simulée après la fin d'essai : connexion OK, bandeau rouge « lecture seule »", async () => {
      await setTestNow(context, simulatedAt(trialEndDay(30), -1, "08:00"));
      await loginAs(page, "RESPONSABLE_ACHATS");
      await expect(t(page, "read-only-banner")).toBeVisible();
    });

    await test.step("Liste des DA consultable ; « Nouvelle DA » grisé avec infobulle", async () => {
      await ready(page, `/achats/demandes?onglet=toutes&q=${tag}`);
      await expect(t(page, `pr-row-${number}`)).toBeVisible();
      await expect(t(page, "pr-create")).toBeDisabled();
      await expect(t(page, "write-disabled-hint").first()).toBeVisible();
    });

    await test.step("Export Excel des DA autorisé en lecture seule", async () => {
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        t(page, "pr-list-export").click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/^demandes_\d{8}\.xlsx$/);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile((await download.path())!);
      const ws = wb.worksheets[0];
      let found = false;
      ws.eachRow((row) => {
        if (row.values && (row.values as unknown[]).some((v) => String(v ?? "") === number)) found = true;
      });
      expect(found).toBe(true);
    });

    await test.step("Fiche d'une DA consultable ; Valider et Refuser grisés", async () => {
      await openPr(page, number);
      await expect(t(page, "status-SOUMISE")).toBeVisible();
      await expect(t(page, "pr-lines")).toContainText("Classeurs à levier");
      await expect(t(page, "pr-action-approve")).toBeDisabled();
      await expect(t(page, "pr-action-reject")).toBeDisabled();
      await expect(t(page, "pr-action-return")).toBeDisabled();
      expect((await prRow(number)).status).toBe("SOUMISE");
    });

    await test.step("Marquer une notification comme lue reste autorisé", async () => {
      await expectNotification(page, `${number} à valider`);
      await expect(t(page, "notifications-count")).toBeVisible();
      await t(page, "notifications-mark-all").click();
      await expect(t(page, "notifications-count")).toHaveCount(0);
      const notifs = await notificationsFor("responsable@richbond.test", number);
      expect(notifs.length).toBeGreaterThan(0);
      expect(notifs.every((n) => n.read_at !== null)).toBe(true);
      const unread = await dbQuery(
        `SELECT 1 FROM notifications n JOIN users u ON u.id = n.recipient_id WHERE u.email = 'responsable@richbond.test' AND n.read_at IS NULL`,
      );
      expect(unread).toHaveLength(0);
    });

    await test.step("L'export reste servi par l'API en lecture seule (200) et les données sont intactes", async () => {
      const res = await page.request.get(`/api/export/demandes?onglet=toutes&q=${tag}`);
      expect(res.status()).toBe(200);
      expect(norm(String(res.headers()["content-type"]))).toContain("spreadsheetml");
    });
  });
});
