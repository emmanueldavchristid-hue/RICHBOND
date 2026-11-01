import { expect, test } from "@playwright/test";
import { loginAs, logout } from "../helpers/auth";
import { setTestNow } from "../helpers/clock";
import { ready, t, title, norm } from "../helpers/da";
import { dbOne } from "../helpers/db";
import { resetLicense } from "../helpers/license";
import { fillReceipt, openReceiptForm, submitReceipt } from "../helpers/rec";

/**
 * S6 – Dossier import : frais réel, réception du BC, clôture, coût dédouané et coefficient (LOT-12, EX-40 à EX-42).
 * L'Acheteur import saisit le transport réel d'un dossier du seed, le Magasinier réceptionne le BC import du dossier,
 * l'Acheteur clôture (confirmation explicite car des frais restent estimés), puis lit le coût de revient.
 * L'Acheteur local n'a ni menu Import ni accès par l'adresse.
 * Le dossier du seed n'existe qu'une fois par exécution : scénario joué en desktop seulement.
 */

test.beforeEach(async ({ context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Dossier du seed unique : joué une seule fois (desktop).");
  await resetLicense(30);
  await setTestNow(context, null);
});
test.afterAll(async () => {
  await resetLicense(30);
});

const seeded = () =>
  dbOne<{ id: string; number: string; po_number: string; status: string; coefficient: string | null }>(
    `SELECT f.id, f.number, o.number AS po_number, f.status::text, f.coefficient::text
       FROM import_files f
       JOIN import_file_orders l ON l.file_id = f.id
       JOIN purchase_orders o ON o.id = l.order_id
      WHERE f.bl_number = 'BL-DEMO-0001'`,
  );

test("S6 – Dossier import : frais réel, réception, clôture avec frais estimés, coût dédouané ; l'Acheteur local n'y a pas accès", async ({
  page,
}) => {
  const file = await seeded();
  expect(file.status).toBe("OUVERT");

  await test.step("L'Acheteur import voit le dossier en retard dans la liste et l'ouvre", async () => {
    await loginAs(page, "ACHETEUR_IMPORT");
    await expect(t(page, "nav-import")).toBeVisible();
    await ready(page, "/import");
    await expect(title(page)).toHaveText("Dossiers import");
    await expect(t(page, "imp-late-counter")).toBeVisible();
    const row = t(page, `imp-row-${file.number}`);
    await expect(row).toBeVisible();
    await expect(row.getByTestId("imp-late-badge")).toBeVisible();
    await row.getByTestId("imp-link").click();
    await expect(page).toHaveURL(new RegExp(`/import/${file.id}`));
    await expect(title(page)).toHaveText(file.number);
    await expect(t(page, "imp-late-count")).toBeVisible();
  });

  await test.step("Clôture impossible tant que le BC n'est pas réceptionné (bouton désactivé, raison affichée)", async () => {
    await expect(t(page, "imp-close")).toBeDisabled();
    await expect(t(page, "imp-close-blockers")).toContainText("À réceptionner");
  });

  await test.step("Frais d'approche : le transport jusqu'à l'usine passe d'estimé à réel (120 000 FCFA)", async () => {
    await ready(page, `/import/${file.id}?onglet=frais`);
    await expect(t(page, "imp-estimated-warning")).toBeVisible();
    await expect(t(page, "imp-cost-TRANSPORT_USINE")).toHaveAttribute("data-status", "ESTIME");
    await t(page, "imp-cost-real-TRANSPORT_USINE").click();
    await expect(t(page, "imp-cost-dialog")).toBeVisible();
    await t(page, "imp-cost-amount").fill("120000");
    await t(page, "imp-cost-save").click();
    await expect(t(page, "imp-cost-TRANSPORT_USINE")).toHaveAttribute("data-status", "REEL");
    await expect(t(page, "imp-cost-TRANSPORT_USINE").getByTestId("imp-cost-xof")).toContainText("120");
    const c = await dbOne<{ status: string; amount_xof: number }>(
      `SELECT c.status::text, c.amount_xof FROM approach_costs c JOIN approach_cost_types ty ON ty.id = c.type_id WHERE c.file_id = $1 AND ty.code = 'TRANSPORT_USINE'`,
      [file.id],
    );
    expect([c.status, c.amount_xof]).toEqual(["REEL", 120000]);
    await logout(page);
  });

  await test.step("Le Magasinier n'a pas le menu Import et reçoit le BC du dossier", async () => {
    await loginAs(page, "MAGASINIER");
    await expect(t(page, "nav-import")).toHaveCount(0);
    await openReceiptForm(page, file.po_number);
    await fillReceipt(page, { bl: "BL-S6-0001" });
    await submitReceipt(page);
    await logout(page);
  });

  await test.step("L'Acheteur import clôture : confirmation explicite car des frais sont encore estimés", async () => {
    await loginAs(page, "ACHETEUR_IMPORT");
    await ready(page, `/import/${file.id}`);
    await expect(t(page, "imp-close")).toBeEnabled();
    await t(page, "imp-close").click();
    await expect(t(page, "imp-close-dialog")).toBeVisible();
    await expect(t(page, "imp-close-dialog-confirm")).toBeDisabled();
    await t(page, "imp-close-ack").check();
    await t(page, "imp-close-dialog-confirm").click();
    await expect(t(page, "imp-badges").getByTestId("status-CLOTURE")).toBeVisible();
    const done = await seeded();
    expect(done.status).toBe("CLOTURE");
    expect(Number(done.coefficient)).toBeGreaterThan(1);
  });

  await test.step("Coût de revient : coût dédouané et coefficient visibles, fiche définitive, exports proposés", async () => {
    const done = await seeded();
    await ready(page, `/import/${file.id}?onglet=cout`);
    await expect(t(page, "imp-sheet-final")).toBeVisible();
    const coef = norm(await t(page, "imp-kpi-coefficient-value").textContent());
    expect(coef).toMatch(/^1,\d+$/);
    expect(Math.abs(Number(coef.replace(",", ".")) - Number(done.coefficient))).toBeLessThan(0.0001);
    await expect(t(page, "imp-kpi-landed-value")).toContainText("FCFA");
    await expect(t(page, "imp-sheet-table")).toContainText("Roulement 6204-2RS");
    await expect(t(page, "imp-export-xlsx")).toHaveAttribute("href", `/api/import-files/${file.id}/fiche?format=xlsx`);
    await expect(t(page, "imp-export-pdf")).toHaveAttribute("href", `/api/import-files/${file.id}/fiche?format=pdf`);
    await expect(t(page, "imp-close")).toHaveCount(0);
    await ready(page, "/import");
    await expect(t(page, `imp-row-${file.number}`)).toContainText("Clôturé");
    await logout(page);
  });

  await test.step("L'Acheteur local n'a pas le menu Import et est refusé par l'adresse", async () => {
    await loginAs(page, "ACHETEUR_LOCAL");
    await expect(t(page, "nav-achats")).toBeVisible();
    await expect(t(page, "nav-import")).toHaveCount(0);
    await page.goto("/import");
    await expect(page).toHaveURL(/\/acces-refuse/);
    await page.goto(`/import/${file.id}`);
    await expect(page).toHaveURL(/\/acces-refuse/);
    await page.goto("/import/nouveau");
    await expect(page).toHaveURL(/\/acces-refuse/);
  });
});
