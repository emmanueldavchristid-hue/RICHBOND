import { expect, test } from "@playwright/test";
import { loginAs, logout } from "../helpers/auth";
import { setTestNow } from "../helpers/clock";
import {
  auditCount,
  dayOffset,
  emailOf,
  expectNotification,
  fillNewPr,
  norm,
  notificationsFor,
  openPr,
  prEvents,
  prLines,
  prRow,
  ready,
  submitForm,
  t,
  title,
  uniqueTag,
} from "../helpers/da";
import { dbOne } from "../helpers/db";
import { resetLicense } from "../helpers/license";

/**
 * S1 – Achat local standard, étapes 1 et 2 + notification de l'étape 3 (LOT-04, EX-20).
 * Joué en desktop et en tablette (projets Playwright) ; l'écran magasin est donc vérifié en viewport tablette.
 */

test.beforeEach(async ({ context }) => {
  await resetLicense(30);
  await setTestNow(context, null);
});

test("S1 – DA du magasinier, validation du Responsable avec quantité réduite, notification de l'acheteur local", async ({
  page,
}, testInfo) => {
  const tag = uniqueTag("S1", testInfo.project.name);
  const reason = `Fourniture de bureau du trimestre ${tag}`;
  let number = "";

  await test.step("Magasinier : crée une DA « fourniture de bureau » (Administration, 2 lignes, Normale), sans voir de prix", async () => {
    await loginAs(page, "MAGASINIER");
    await fillNewPr(page, {
      department: "Administration",
      reason,
      neededBy: dayOffset(7),
      lines: [
        { search: "Rame papier A4", qty: "10" },
        { search: "Toner imprimante", qty: "2" },
      ],
    });
    // H29 : le magasinier ne voit ni prix estimé ni total, et ne peut pas saisir une désignation libre.
    await expect(t(page, "pr-line-1-price")).toHaveCount(0);
    await expect(t(page, "pr-total")).toHaveCount(0);
    await expect(t(page, "pr-add-free")).toHaveCount(0);
    await expect(t(page, "pr-urgency-NORMALE")).toBeChecked();
  });

  await test.step("Magasinier : soumet la DA ; un numéro DA-AAAA-NNNNN est attribué, statut « À valider »", async () => {
    number = await submitForm(page);
    await expect(t(page, "status-SOUMISE")).toHaveText("À valider");
    await expect(t(page, "urgency-NORMALE")).toBeVisible();
    await expect(t(page, "pr-info")).toContainText("Administration");
    await expect(t(page, "pr-lines").getByTestId("pr-line-1")).toContainText("Rame papier A4");
    await expect(t(page, "pr-lines").getByTestId("pr-line-2")).toContainText("Toner imprimante");
    await expect(t(page, "pr-timeline").getByTestId("pr-event-SUBMITTED")).toBeVisible();

    const pr = await prRow(number);
    expect(pr.status).toBe("SOUMISE");
    expect(pr.kind).toBe("REAPPRO");
    expect(pr.type).toBe("A_DEFINIR");
    expect(pr.priority).toBe(2);
    expect(await emailOf(pr.created_by_id)).toBe("magasinier@richbond.test");
    expect((await prLines(number)).map((l) => l.name)).toEqual(["Rame papier A4", "Toner imprimante"]);
    expect(await auditCount(pr.id, "PR_SUBMIT")).toBe(1);
  });

  await test.step("Responsable : notifié, voit la DA dans « À valider »", async () => {
    await logout(page);
    await loginAs(page, "RESPONSABLE_ACHATS");
    await expectNotification(page, `${number} à valider`);
    const notifs = await notificationsFor("responsable@richbond.test", number);
    expect(notifs).toHaveLength(1);
    expect(notifs[0].severity).toBe("INFO");

    await ready(page, `/achats/demandes?onglet=a-valider&q=${tag}`);
    await expect(t(page, "pr-tab-a-valider")).toHaveAttribute("aria-selected", "true");
    await expect(t(page, "pr-tab-a-valider-count")).toBeVisible();
    const row = t(page, `pr-row-${number}`);
    await expect(row).toBeVisible();
    await expect(row.getByTestId("status-SOUMISE")).toHaveText("À valider");
    await expect(row).toContainText("Administration");
  });

  await test.step("Responsable : ouvre la DA, réduit la quantité du toner de 2 à 1, choisit le type Local et valide", async () => {
    await t(page, `pr-row-${number}`).getByTestId("pr-link").click();
    await expect(title(page)).toHaveText(number);
    await page.waitForLoadState("networkidle");
    await t(page, "pr-action-approve").click();
    await expect(t(page, "pr-approve-dialog")).toBeVisible();
    // Une DA « À définir » exige le choix du type avant l'assignation.
    await t(page, "pr-approve-type").selectOption("LOCAL");
    await t(page, "pr-approve-qty-2").fill("1");
    await t(page, "pr-approve-confirm").click();
    await expect(t(page, "status-VALIDEE")).toHaveText("Validée");
  });

  await test.step("Effet métier : quantité validée, événement QTY_CHANGED, acheteur local assigné, audit", async () => {
    await expect(t(page, "pr-line-2-approved")).toContainText("modifié");
    await expect(t(page, "pr-line-1-approved")).not.toContainText("modifié");
    await expect(t(page, "pr-buyer")).toContainText("Acheteur Local");
    await expect(t(page, "pr-timeline").getByTestId("pr-event-APPROVED")).toBeVisible();
    await expect(t(page, "pr-timeline").getByTestId("pr-event-QTY_CHANGED")).toBeVisible();

    const pr = await prRow(number);
    expect(pr.status).toBe("VALIDEE");
    expect(pr.type).toBe("LOCAL");
    expect(await emailOf(pr.approved_by_id)).toBe("responsable@richbond.test");
    expect(await emailOf(pr.assigned_buyer_id)).toBe("acheteur.local@richbond.test");
    const lines = await prLines(number);
    expect(lines.map((l) => [Number(l.quantity), Number(l.approved_qty)])).toEqual([
      [10, 10],
      [2, 1],
    ]);
    const types = (await prEvents(number)).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(["CREATED", "SUBMITTED", "QTY_CHANGED", "APPROVED"]));
    expect(await auditCount(pr.id, "PR_APPROVE")).toBe(1);
    expect(await auditCount(pr.id, "PR_QTY_CHANGE")).toBeGreaterThanOrEqual(1);
    const qty = await dbOne<{ payload: { before?: unknown; after?: unknown } | null }>(
      `SELECT e.payload FROM purchase_request_events e JOIN purchase_requests p ON p.id = e.request_id WHERE p.number = $1 AND e.type = 'QTY_CHANGED'`,
      [number],
    );
    expect(JSON.stringify(qty.payload)).toContain("1");
  });

  await test.step("Acheteur local : notifié, retrouve la DA dans « Assignées à moi » (étape 3 : BC possible ensuite)", async () => {
    await logout(page);
    await loginAs(page, "ACHETEUR_LOCAL");
    await expectNotification(page, `${number} validée et assignée à vous`);
    const notifs = await notificationsFor("acheteur.local@richbond.test", number);
    expect(notifs.map((n) => n.type)).toContain("PR_ASSIGNED");

    await ready(page, `/achats/demandes?onglet=assignees&q=${tag}`);
    await expect(t(page, "pr-tab-assignees")).toHaveAttribute("aria-selected", "true");
    const row = t(page, `pr-row-${number}`);
    await expect(row).toBeVisible();
    await expect(row.getByTestId("status-VALIDEE")).toHaveText("Validée");
    // Un acheteur ne valide jamais : ni onglet « À valider », ni bouton de validation sur la fiche.
    await expect(t(page, "pr-tab-a-valider")).toHaveCount(0);
    await openPr(page, number, "assignees");
    await expect(t(page, "pr-action-approve")).toHaveCount(0);
    expect(norm(await t(page, "pr-line-2-approved").textContent())).toContain("1");
  });
});
