import { expect, test } from "@playwright/test";
import { loginAs, logout } from "../helpers/auth";
import { setTestNow, simulatedAt } from "../helpers/clock";
import {
  createValidatedLocalPr,
  dayOffset,
  expectNotification,
  norm,
  notificationsFor,
  openPr,
  prRow,
  ready,
  t,
  title,
  uniqueTag,
} from "../helpers/da";
import { dbOne, dbQuery } from "../helpers/db";
import { resetLicense, trialEndDay } from "../helpers/license";
import {
  approveFromPage,
  BC_NUMBER,
  confirmFromPage,
  confirmReason,
  createDirectOrder,
  createDraftFromPr,
  createValidatedDirectOrder,
  expectReasonRequired,
  downloadPdf,
  fillPricesAndSubmit,
  idFromUrl,
  poAllocations,
  poAuditCount,
  poById,
  poEvents,
  poLines,
  sendFromPage,
  setSupplierStatus,
} from "../helpers/po";

/**
 * SC1 à SC7 (LOT-05, EX-21) – Cas particuliers des bons de commande : fournisseur bloqué, regroupement de DA et
 * annulation, relance d'un BC en retard (TEST_NOW), avenant, Magasinier sans accès, essai expiré.
 * Joués en desktop et en tablette (projets Playwright). Chaque scénario vérifie l'interface et l'effet en base.
 */

const loginFor = (page: Parameters<typeof loginAs>[0]) => (role: "ACHETEUR_LOCAL" | "RESPONSABLE_ACHATS") =>
  loginAs(page, role);
const logoutFor = (page: Parameters<typeof logout>[0]) => () => logout(page);
const DAY = 86_400_000;
const dmy = (iso: string) => iso.split("-").reverse().join("/");

test.beforeEach(async ({ context }) => {
  await resetLicense(30);
  await setTestNow(context, null);
});

test.afterEach(async () => {
  await setSupplierStatus("FRS-00006", "ACTIF");
});

test.afterAll(async () => {
  await resetLicense(30);
  await setSupplierStatus("FRS-00006", "ACTIF");
});

// ---------------------------------------------------------------------------------------------------
test("SC1 – Fournisseur bloqué : aucun BC possible (écran À commander, formulaire, validation)", async ({
  page,
}, testInfo) => {
  const tag = uniqueTag("SC1", testInfo.project.name);
  let da = "";
  let poId = "";

  await test.step("Préambule : DA locale (rame de papier) validée par le Responsable", async () => {
    da = await createValidatedLocalPr(
      page,
      { reason: `Papier ${tag}`, lines: [{ search: "Rame papier A4", qty: "3" }] },
      loginFor(page),
      logoutFor(page),
    );
  });

  await test.step("Le fournisseur principal est bloqué : « À commander » l'indique et le bouton « Créer le BC » est désactivé", async () => {
    await setSupplierStatus("FRS-00006", "BLOQUE");
    await loginAs(page, "ACHETEUR_LOCAL");
    await ready(page, "/achats/commandes/a-commander");
    const group = t(page, "to-order-group-FRS-00006");
    await expect(group).toBeVisible();
    await expect(group.getByTestId("to-order-blocked")).toContainText("bloqué");
    await expect(group.getByTestId("to-order-create")).toBeDisabled();
  });

  await test.step("Le formulaire ne propose pas le fournisseur bloqué", async () => {
    await ready(page, "/achats/commandes/nouvelle");
    await expect(t(page, "po-form")).toBeVisible();
    await expect(t(page, "po-supplier").locator("option", { hasText: "FRS-00006" })).toHaveCount(0);
    await expect(t(page, "po-supplier").locator("option", { hasText: "FRS-00007" })).toHaveCount(1);
  });

  await test.step("Débloqué, le BC est créé et soumis ; bloqué à nouveau entre-temps, la validation du Responsable est refusée", async () => {
    await setSupplierStatus("FRS-00006", "ACTIF");
    await openPr(page, da, "assignees");
    await createDraftFromPr(page, "FRS-00006");
    await fillPricesAndSubmit(page, { 1: "15500" });
    poId = idFromUrl(page);
    await setSupplierStatus("FRS-00006", "BLOQUE");
    await logout(page);
    await loginAs(page, "RESPONSABLE_ACHATS");
    await ready(page, `/achats/commandes/${poId}`);
    await t(page, "po-action-approve").click();
    await t(page, "po-approve-confirm").click();
    await expect(page.getByText(/est bloqué : aucun bon de commande possible/).first()).toBeVisible();
  });

  await test.step("Effet métier : le BC reste « À valider », sans numéro ; la DA n'est pas commandée", async () => {
    const po = await poById(poId);
    expect(po.status).toBe("A_VALIDER");
    expect(po.number).toBeNull();
    expect((await poEvents(poId)).map((e) => e.type)).not.toContain("APPROVED");
    expect(await poAuditCount(poId, "PO_APPROVE")).toBe(0);
    expect((await prRow(da)).status).toBe("VALIDEE");
  });
});

// ---------------------------------------------------------------------------------------------------
test("SC2 – Regroupement de 2 DA sur un BC, commande partielle, puis annulation : les DA sont rouvertes", async ({
  page,
}, testInfo) => {
  const tag = uniqueTag("SC2", testInfo.project.name);
  let daA = "";
  let daB = "";
  let poId = "";
  let poNumber = "";

  await test.step("Préambule : deux DA locales de rame de papier (10 et 6 cartons) validées", async () => {
    const mk = (qty: string, label: string) =>
      createValidatedLocalPr(
        page,
        { reason: `Papier ${label} ${tag}`, lines: [{ search: "Rame papier A4", qty }] },
        loginFor(page),
        logoutFor(page),
      );
    daA = await mk("10", "A");
    daB = await mk("6", "B");
  });

  await test.step("Acheteur local : « À commander » regroupe les deux DA chez le même fournisseur ; commande partielle de la DA B (2 sur 6)", async () => {
    await loginAs(page, "ACHETEUR_LOCAL");
    await ready(page, "/achats/commandes/a-commander");
    const group = t(page, "to-order-group-FRS-00006");
    const lineA = group.locator(`[data-testid^="to-order-line-${daA}-"]`);
    const lineB = group.locator(`[data-testid^="to-order-line-${daB}-"]`);
    await expect(lineA).toBeVisible();
    await expect(lineB).toBeVisible();
    await lineA.getByTestId("to-order-check").check();
    await lineB.getByTestId("to-order-check").check();
    await lineB.getByTestId("to-order-qty").fill("2");
    await group.getByTestId("to-order-create").click();
    await expect(page).toHaveURL(/\/achats\/commandes\/[^/]+\/modifier/);
    await page.waitForLoadState("networkidle");
    poId = /\/achats\/commandes\/([^/]+)\/modifier/.exec(page.url())![1];
  });

  await test.step("Formulaire : une seule ligne « Rame papier A4 » de 12 cartons rattachée aux deux DA ; soumission", async () => {
    await expect(
      t(page, "po-form-lines").locator('[data-testid^="po-form-line-"][data-testid$="allocations"]'),
    ).toHaveCount(1);
    await expect(t(page, "po-form-line-1")).toContainText("Rame papier A4");
    await expect(t(page, "po-form-line-1-allocations")).toContainText(daA);
    await expect(t(page, "po-form-line-1-allocations")).toContainText(daB);
    await expect(t(page, "po-form-qty-1")).toHaveValue("12");
    await fillPricesAndSubmit(page, { 1: "15500" });
    const allocs = await poAllocations(poId);
    expect(allocs.map((a) => [a.request_number, Number(a.qty)])).toEqual(
      [
        [daA, 10],
        [daB, 2],
      ].sort((x, y) => String(x[0]).localeCompare(String(y[0]))),
    );
  });

  await test.step("Responsable : valide ; DA A « Commandée », DA B « Partiellement commandée » (2 commandés, 4 restants)", async () => {
    await logout(page);
    await loginAs(page, "RESPONSABLE_ACHATS");
    await ready(page, `/achats/commandes/${poId}`);
    poNumber = await approveFromPage(page);
    expect(poNumber).toMatch(BC_NUMBER);
    expect((await prRow(daA)).status).toBe("COMMANDEE");
    expect((await prRow(daB)).status).toBe("PARTIELLEMENT_COMMANDEE");
    await openPr(page, daB, "toutes");
    await expect(t(page, "status-PARTIELLEMENT_COMMANDEE")).toBeVisible();
    await expect(t(page, "pr-linked-orders")).toContainText(poNumber);
    await expect(t(page, "allocation-cell").first()).toContainText("2");
    await expect(t(page, "allocation-cell").first()).toContainText("4");
  });

  await test.step("Responsable : annule le BC validé (motif obligatoire) ; les deux DA redeviennent « Validée » et l'acheteur est prévenu", async () => {
    await ready(page, `/achats/commandes/${poId}`);
    await t(page, "po-action-cancel").click();
    await expect(t(page, "po-cancel-dialog")).toBeVisible();
    await expectReasonRequired(page, "po-cancel-dialog");
    await confirmReason(page, "po-cancel-dialog", "Le fournisseur ne livre plus ce papier (test).");
    await expect(t(page, "status-ANNULE")).toBeVisible();
    await expect(t(page, "po-cancel-banner")).toContainText("ne livre plus");
    expect((await poById(poId)).status).toBe("ANNULE");
    expect((await poById(poId)).number).toBe(poNumber); // le numéro n'est jamais réattribué
    expect((await prRow(daA)).status).toBe("VALIDEE");
    expect((await prRow(daB)).status).toBe("VALIDEE");
    expect(await poAuditCount(poId, "PO_CANCEL")).toBe(1);
    expect(
      (await notificationsFor("acheteur.local@richbond.test", daA)).map((n) => n.title).join("|"),
    ).toContain(`rouverte : ${poNumber} annulé`);
    await logout(page);
    await loginAs(page, "ACHETEUR_LOCAL");
    await expectNotification(page, `${daA} rouverte`);
  });
});

// ---------------------------------------------------------------------------------------------------
test("SC3 – BC en retard (TEST_NOW) : onglet « En retard », relance enregistrée, texte copié", async ({
  page,
  context,
}, testInfo) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const tag = uniqueTag("SC3", testInfo.project.name);
  let poId = "";
  let poNumber = "";
  const promised = dayOffset(2);
  const later = new Date(Date.now() + 6 * DAY).toISOString().slice(0, 10) + "T10:00:00.000Z";

  await test.step("Préambule : le Responsable passe une commande directe, la valide, l'envoie par e-mail et le fournisseur confirme à J+2", async () => {
    await loginAs(page, "RESPONSABLE_ACHATS");
    const o = await createValidatedDirectOrder(page, {
      supplier: "FRS-00006",
      reason: `Papier du trimestre ${tag}`,
      lines: [{ search: "Rame papier A4", qty: "5", price: "15500" }],
    });
    poId = o.id;
    poNumber = o.number;
    await sendFromPage(page, "EMAIL");
    await confirmFromPage(page, promised);
    expect((await poById(poId)).status).toBe("CONFIRME");
    await ready(page, `/achats/commandes?onglet=en-retard&q=${poNumber}`);
    await expect(t(page, `po-row-${poNumber}`)).toHaveCount(0); // pas encore en retard
  });

  await test.step("Le temps passe (J+6) : le BC est en retard de 4 jours dans l'onglet « En retard » et sur sa fiche", async () => {
    await setTestNow(context, later);
    await ready(page, `/achats/commandes?onglet=en-retard&q=${poNumber}`);
    const row = t(page, `po-row-${poNumber}`);
    await expect(row).toBeVisible();
    await expect(row.getByTestId("late-badge")).toContainText("En retard de 4 j");
    await expect(row).toContainText(dmy(promised));
    await expect(t(page, "po-tab-en-retard-count")).toBeVisible();
    await ready(page, "/accueil");
    await expect(t(page, "accueil-bc-en-retard")).toContainText(/BC en retard/);
    await ready(page, `/achats/commandes/${poId}`);
    await expect(t(page, "po-late-banner")).toContainText("retard de 4 jours");
    await expect(t(page, "po-late-banner")).toContainText(dmy(promised));
    await expect(t(page, "remind-badge")).toBeVisible();
  });

  await test.step("Acheteur local : relance le fournisseur par WhatsApp ; le texte prêt à copier cite le BC, la quantité restante et le retard", async () => {
    await logout(page);
    await loginAs(page, "ACHETEUR_LOCAL");
    await ready(page, `/achats/commandes?onglet=en-cours&relance=1&q=${poNumber}`);
    await expect(t(page, `po-row-${poNumber}`).getByTestId("remind-badge")).toBeVisible();
    await ready(page, `/achats/commandes/${poId}`);
    await t(page, "po-action-remind").click();
    await expect(t(page, "po-remind-dialog")).toBeVisible();
    const text = t(page, "po-remind-text-text");
    await expect(text).toContainText(poNumber);
    await expect(text).toContainText(/retard/i);
    await expect(text).toContainText("Rame papier A4");
    await expect(text).toContainText("5");
    await t(page, "po-remind-confirm").click(); // moyen non choisi : refusé
    await expect(t(page, "po-remind-error")).toBeVisible();
    await t(page, "po-remind-text-copy").click();
    await expect(page.getByText("Texte copié.").first()).toBeVisible();
    const clip = norm(await page.evaluate(() => navigator.clipboard.readText()));
    expect(clip).toContain(poNumber);
    await t(page, "po-remind-channel").selectOption("WHATSAPP");
    await t(page, "po-remind-comment").fill(`Promesse de livraison sous 48 h ${tag}`);
    await t(page, "po-remind-confirm").click();
    await expect(t(page, "po-remind-dialog")).toBeHidden();
  });

  await test.step("Effet métier : relance tracée (compteur, événement, audit) ; l'indicateur « À relancer » disparaît ; le BC reste en retard", async () => {
    await expect(t(page, "po-reminders")).toContainText("1");
    await expect(t(page, "remind-badge")).toHaveCount(0);
    await expect(t(page, "late-badge")).toBeVisible();
    await expect(t(page, "po-timeline").getByTestId("po-event-REMINDED")).toBeVisible();
    const po = await poById(poId);
    expect(po.reminder_count).toBe(1);
    expect(po.last_reminded_at).not.toBeNull();
    expect(po.status).toBe("CONFIRME");
    const ev = (await poEvents(poId)).find((e) => e.type === "REMINDED");
    expect(JSON.stringify(ev)).toContain("WHATSAPP");
    expect(await poAuditCount(poId, "PO_REMIND")).toBe(1);
  });

  await test.step("Le fournisseur reporte la date promise : motif obligatoire, 1er délai conservé, glissement compté", async () => {
    await logout(page);
    await loginAs(page, "RESPONSABLE_ACHATS");
    await ready(page, `/achats/commandes/${poId}`);
    const newDate = new Date(Date.now() + 9 * DAY).toISOString().slice(0, 10);
    await t(page, "po-action-promise").click();
    await t(page, "po-promise-dialog-date").fill(newDate);
    await t(page, "po-promise-dialog-confirm").click(); // sans motif : refusé
    await expect(t(page, "po-promise-dialog-error")).toBeVisible();
    await t(page, "po-promise-dialog-reason").fill("Retard de production chez le fournisseur");
    await t(page, "po-promise-dialog-confirm").click();
    await expect(t(page, "po-promised")).toContainText(dmy(newDate));
    await expect(t(page, "po-promised")).toContainText("Reportée 1 fois");
    const po = await poById(poId);
    expect(po.promised_date_changes).toBe(1);
    expect(po.promised_date?.toISOString().slice(0, 10)).toBe(newDate);
    expect(po.first_promised_date?.toISOString().slice(0, 10)).toBe(promised);
    expect((await poEvents(poId)).map((e) => e.type)).toContain("PROMISED_DATE_CHANGED");
    // Plus en retard : la nouvelle date promise est dans le futur.
    await ready(page, `/achats/commandes?onglet=en-retard&q=${poNumber}`);
    await expect(t(page, `po-row-${poNumber}`)).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------------------------------
test("SC4 – Avenant : version 2 avec même numéro, revalidation, PDF v1 et v2 ; avenant abandonné = version précédente restaurée", async ({
  page,
}, testInfo) => {
  const tag = uniqueTag("SC4", testInfo.project.name);
  let poId = "";
  let poNumber = "";

  await test.step("Préambule : BC de 5 cartons de rame validé et envoyé", async () => {
    await loginAs(page, "RESPONSABLE_ACHATS");
    const o = await createValidatedDirectOrder(page, {
      supplier: "FRS-00006",
      reason: `Papier avenant ${tag}`,
      lines: [{ search: "Rame papier A4", qty: "5", price: "15500" }],
    });
    poId = o.id;
    poNumber = o.number;
    await sendFromPage(page, "EMAIL");
  });

  await test.step("Avenant : motif obligatoire, le BC repasse en brouillon version 2 avec le même numéro", async () => {
    await t(page, "po-action-amend").click();
    await expect(t(page, "po-amend-dialog")).toBeVisible();
    await expectReasonRequired(page, "po-amend-dialog");
    await confirmReason(page, "po-amend-dialog", "Le service demande 8 cartons au lieu de 5.");
    await expect(page).toHaveURL(/\/achats\/commandes\/[^/]+\/modifier/);
    await page.waitForLoadState("networkidle");
    await expect(t(page, "po-form-amendment")).toBeVisible();
    await expect(t(page, "po-supplier")).toBeDisabled(); // le fournisseur ne change pas dans un avenant
    const po = await poById(poId);
    expect(po.version).toBe(2);
    expect(po.status).toBe("BROUILLON");
    expect(po.number).toBe(poNumber);
  });

  await test.step("Quantité portée à 8, soumission puis validation : « Validé » en version 2, même numéro", async () => {
    await t(page, "po-form-qty-1").fill("8");
    await t(page, "po-form-submit").click();
    await t(page, "po-form-submit-dialog-confirm").click();
    await expect(t(page, "status-A_VALIDER")).toBeVisible();
    await expect(t(page, "po-amendment-banner")).toContainText("version 2");
    await page.waitForLoadState("networkidle");
    await approveFromPage(page);
    await expect(title(page)).toContainText(poNumber);
    await expect(title(page)).toContainText("v2");
    await expect(t(page, "po-version-1")).toBeVisible();
    await expect(t(page, "po-version-2")).toBeVisible();
    const po = await poById(poId);
    expect(po.version).toBe(2);
    expect(po.status).toBe("VALIDE"); // à renvoyer au fournisseur
    expect(po.number).toBe(poNumber);
    expect(Number((await poLines(poId))[0].quantity)).toBe(8);
    expect(await poAuditCount(poId, "PO_AMEND_START")).toBe(1);
  });

  await test.step("PDF : la version 1 garde 5 cartons, la version 2 en porte 8 ; même numéro, noms de fichiers -v1 et -v2", async () => {
    const v1 = await downloadPdf(page, poId, 1);
    const v2 = await downloadPdf(page, poId, 2);
    expect(v1.status).toBe(200);
    expect(v2.status).toBe(200);
    expect(v1.disposition).toContain(`${poNumber}-v1.pdf`);
    expect(v2.disposition).toContain(`${poNumber}-v2.pdf`);
    expect(v1.text).toContain(poNumber);
    expect(v2.text).toContain(poNumber);
    expect(v1.text).toContain("77 500"); // 5 x 15 500
    expect(v1.text).not.toContain("124 000");
    expect(v2.text).toContain("124 000"); // 8 x 15 500
  });

  await test.step("Second avenant puis abandon : le BC retrouve exactement la version 2 validée", async () => {
    await t(page, "po-action-amend").click();
    await confirmReason(page, "po-amend-dialog", "Essai d'un troisième changement.");
    await page.waitForLoadState("networkidle");
    await t(page, "po-form-qty-1").fill("20");
    await t(page, "po-form-save").click();
    await expect(t(page, "status-BROUILLON")).toBeVisible();
    await expect(t(page, "po-amendment-banner")).toContainText("version 3");
    await page.waitForLoadState("networkidle");
    await t(page, "po-action-abandon").click();
    await t(page, "po-abandon-dialog-confirm").click();
    await expect(t(page, "status-VALIDE")).toBeVisible();
    await expect(title(page)).toContainText("v2");
    const po = await poById(poId);
    expect(po.version).toBe(2);
    expect(po.status).toBe("VALIDE");
    expect(Number((await poLines(poId))[0].quantity)).toBe(8);
    expect((await poEvents(poId)).map((e) => e.type)).toContain("AMENDMENT_ABANDONED");
  });
});

// ---------------------------------------------------------------------------------------------------
test("SC5 – Magasinier : aucun accès aux bons de commande (menu, pages, PDF, export, accueil)", async ({
  page,
}, testInfo) => {
  const tag = uniqueTag("SC5", testInfo.project.name);
  let poId = "";

  await test.step("Préambule : un BC validé existe", async () => {
    await loginAs(page, "RESPONSABLE_ACHATS");
    poId = (
      await createValidatedDirectOrder(page, {
        supplier: "FRS-00006",
        reason: `Papier accès ${tag}`,
        lines: [{ search: "Rame papier A4", qty: "1", price: "15500" }],
      })
    ).id;
    await logout(page);
  });

  await test.step("Magasinier (tablette ou bureau) : ni lien de menu, ni pastille d'accueil", async () => {
    await loginAs(page, "MAGASINIER");
    await expect(page.locator('a[href="/achats/commandes"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="accueil-bc"]')).toHaveCount(0);
  });

  await test.step("Liste, fiche, « À commander » et « Nouveau BC » : accès refusé", async () => {
    for (const url of [
      "/achats/commandes",
      `/achats/commandes/${poId}`,
      "/achats/commandes/a-commander",
      "/achats/commandes/nouvelle",
    ]) {
      await page.goto(url);
      await expect(page).toHaveURL(/\/acces-refuse/);
    }
  });

  await test.step("PDF et export Excel des BC : 403", async () => {
    expect((await page.request.get(`/api/purchase-orders/${poId}/pdf`)).status()).toBe(403);
    expect((await page.request.get("/api/export/commandes")).status()).toBe(403);
  });

  await test.step("Sur sa propre DA le Magasinier n'a ni bouton « Créer le BC » ni détail des commandes", async () => {
    const da = await dbOne<{ id: string }>(
      `SELECT p.id FROM purchase_requests p JOIN users u ON u.id = p.created_by_id WHERE u.email = 'magasinier@richbond.test' ORDER BY p.created_at LIMIT 1`,
    );
    await ready(page, `/achats/demandes/${da.id}`);
    await expect(t(page, "pr-action-create-order")).toHaveCount(0);
    await expect(page.locator('a[href^="/achats/commandes/"]')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------------------------------
test.describe("SC6 – Essai expiré : consultation, PDF et export seulement", () => {
  test.afterEach(async () => {
    await resetLicense(30);
  });

  test("liste, fiche, PDF et export OK ; création, validation, envoi et relance grisés", async ({
    page,
    context,
  }, testInfo) => {
    const tag = uniqueTag("SC6", testInfo.project.name);
    let draftId = "";
    let sentId = "";
    let sentNumber = "";

    await test.step("Avant l'expiration : un BC validé et envoyé, un BC « À valider »", async () => {
      await loginAs(page, "RESPONSABLE_ACHATS");
      const o = await createValidatedDirectOrder(page, {
        supplier: "FRS-00006",
        reason: `Papier licence ${tag}`,
        lines: [{ search: "Rame papier A4", qty: "2", price: "15500" }],
      });
      sentId = o.id;
      sentNumber = o.number;
      await sendFromPage(page, "EMAIL");
      draftId = await createDirectOrder(page, {
        supplier: "FRS-00006",
        reason: `Papier à valider ${tag}`,
        lines: [{ search: "Rame papier A4", qty: "3", price: "15500" }],
      });
      await logout(page);
    });

    await test.step("Après la fin d'essai : connexion OK, bandeau « lecture seule », liste et fiche consultables", async () => {
      await setTestNow(context, simulatedAt(trialEndDay(30), -1, "08:00"));
      await loginAs(page, "RESPONSABLE_ACHATS");
      await expect(t(page, "read-only-banner")).toBeVisible();
      await ready(page, `/achats/commandes?onglet=tous&q=${sentNumber}`);
      await expect(t(page, `po-row-${sentNumber}`)).toBeVisible();
      await expect(t(page, "po-create")).toBeDisabled();
      await ready(page, `/achats/commandes/${sentId}`);
      await expect(title(page)).toHaveText(sentNumber);
      await expect(t(page, "po-action-confirm")).toBeDisabled();
      await expect(t(page, "po-action-amend")).toBeDisabled();
      await expect(t(page, "po-comment-send")).toBeDisabled();
      await expect(t(page, "po-action-pdf")).toBeVisible();
    });

    await test.step("Le BC « À valider » ne peut être ni validé, ni refusé, ni modifié", async () => {
      await ready(page, `/achats/commandes/${draftId}`);
      await expect(t(page, "po-action-approve")).toBeDisabled();
      await expect(t(page, "po-action-reject")).toBeDisabled();
      await expect(t(page, "po-action-return")).toBeDisabled();
    });

    await test.step("PDF et export Excel des BC restent servis (200) ; rien n'a changé en base", async () => {
      const pdf = await downloadPdf(page, sentId);
      expect(pdf.status).toBe(200);
      expect(pdf.text).toContain(sentNumber);
      const xlsx = await page.request.get("/api/export/commandes");
      expect(xlsx.status()).toBe(200);
      expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
      expect((await poById(draftId)).status).toBe("A_VALIDER");
      expect((await poById(draftId)).number).toBeNull();
      expect((await poById(sentId)).status).toBe("ENVOYE");
    });

    await test.step("Acheteur local : la relance est désactivée en lecture seule", async () => {
      await logout(page);
      await loginAs(page, "ACHETEUR_LOCAL");
      await ready(page, `/achats/commandes/${sentId}`);
      await expect(t(page, "po-action-remind")).toBeDisabled();
      const n = await dbQuery(
        `SELECT 1 FROM purchase_order_events WHERE order_id = $1 AND type = 'REMINDED'`,
        [sentId],
      );
      expect(n).toHaveLength(0);
    });
  });
});
