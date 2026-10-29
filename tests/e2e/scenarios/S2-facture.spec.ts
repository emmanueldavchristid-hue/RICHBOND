import { expect, test, type Page } from "@playwright/test";
import { loginAs, logout } from "../helpers/auth";
import { setTestNow } from "../helpers/clock";
import { ready, t, title, norm, uniqueTag } from "../helpers/da";
import { dbOne, dbQuery } from "../helpers/db";
import { resetLicense } from "../helpers/license";
import { confirmReason, expectReasonRequired, supplierId } from "../helpers/po";
import { createReceivableOrder, fillReceipt, openReceiptForm, submitReceipt } from "../helpers/rec";

/**
 * S2 (suite) – De la réception à la facture : rapprochement 3 voies, doublon, bon à payer, export des écarts (LOT-13).
 * Le Responsable passe le BC, le Magasinier reçoit 100, l'acheteur saisit deux factures (conforme, puis prix +5 %),
 * le Responsable donne le bon à payer (motif obligatoire sur écart).
 */

const ITEM = "Toner imprimante";
const SUPPLIER = "FRS-00006";
const PRICE = 48750;
const FAC_NUMBER = /^FAC-\d{4}-\d{5}$/;

test.beforeEach(async ({ context }) => {
  await resetLicense(30);
  await setTestNow(context, null);
});
test.afterAll(async () => {
  await resetLicense(30);
});

const invoiceRow = (n: string) =>
  dbOne<{ id: string; status: string; pay_approved_by_id: string | null; total_ht: string; lines: string }>(
    `SELECT i.id, i.status::text, i.pay_approved_by_id, i.total_ht::text,
            (SELECT string_agg(l.match::text, ',' ORDER BY l.line_no) FROM supplier_invoice_lines l WHERE l.invoice_id = i.id) AS lines
       FROM supplier_invoices i WHERE i.number = $1`,
    [n],
  );

/** Ouvre le formulaire, choisit le fournisseur et ne garde cochée que la ligne du BC voulu. */
async function openInvoiceForm(page: Page, poNumber: string, invoiceNo: string) {
  await ready(page, "/achats/factures/nouvelle");
  await expect(t(page, "inv-form")).toBeVisible();
  await t(page, "inv-supplier").selectOption(await supplierId(SUPPLIER));
  const mine = t(page, `inv-line-${poNumber}-1`);
  await expect(mine).toBeVisible();
  const rows = page.locator('[data-testid^="inv-line-BC-"]');
  for (let i = 0; i < (await rows.count()); i++) {
    const row = rows.nth(i);
    if ((await row.getAttribute("data-testid")) !== `inv-line-${poNumber}-1`) await row.getByTestId("inv-line-check").uncheck();
  }
  await t(page, "inv-number").fill(invoiceNo);
}

async function submitInvoice(page: Page): Promise<string> {
  await t(page, "inv-submit").click();
  await expect(page).toHaveURL(/\/achats\/factures\/(?!nouvelle)[^/?]+$/);
  await expect(title(page)).toHaveText(FAC_NUMBER);
  await page.waitForLoadState("networkidle");
  return norm(await title(page).textContent());
}

test("S2 – Facture : conforme, écart de prix +5 %, doublon refusé, bon à payer réservé au Responsable, export des écarts", async ({
  page,
}, testInfo) => {
  const tag = uniqueTag("S2F", testInfo.project.name);
  const invNo1 = `F-${tag}-1`;
  const invNo2 = `F-${tag}-2`;
  let poNumber = "";
  let fac1 = "";
  let fac2 = "";

  await test.step("Préambule : BC de 100 toners, entièrement reçu par le Magasinier", async () => {
    await loginAs(page, "RESPONSABLE_ACHATS");
    const po = await createReceivableOrder(page, {
      supplier: SUPPLIER,
      reason: `Facture ${tag}`,
      lines: [{ search: ITEM, qty: "100", price: String(PRICE) }],
    });
    poNumber = po.number;
    await logout(page);
    await loginAs(page, "MAGASINIER");
    await openReceiptForm(page, poNumber);
    await fillReceipt(page, { bl: `BL-${tag}` });
    await submitReceipt(page);
    await logout(page);
  });

  await test.step("Facture 1 – l'acheteur choisit le fournisseur : la ligne est pré-remplie depuis la réception (100 reçus, prix du BC)", async () => {
    await loginAs(page, "ACHETEUR_LOCAL");
    await openInvoiceForm(page, poNumber, invNo1);
    const line = t(page, `inv-line-${poNumber}-1`);
    await expect(line).toContainText(ITEM);
    await expect(line.getByTestId("inv-line-qty")).toHaveValue("100");
    await expect(line.getByTestId("inv-line-price")).toHaveValue(String(PRICE));
  });

  await test.step("Facture 1 – on facture 50 au prix du BC : enregistrée, statut CONFORME, aucune ligne en écart", async () => {
    await t(page, `inv-line-${poNumber}-1`).getByTestId("inv-line-qty").fill("50");
    await expect(t(page, "inv-total-ht")).toContainText("2 437 500");
    fac1 = await submitInvoice(page);
    await expect(t(page, "inv-badges").getByTestId("status-CONFORME")).toBeVisible();
    await expect(t(page, "inv-gap-count")).toHaveCount(0);
    await expect(t(page, "inv-line-1")).toHaveAttribute("data-match", "CONFORME");
    await expect(t(page, "inv-actions")).not.toContainText("Bon à payer"); // l'acheteur ne le donne pas
    await expect(t(page, "inv-action-approve")).toHaveCount(0);
    const row = await invoiceRow(fac1);
    expect([row.status, row.lines, Number(row.total_ht)]).toEqual(["CONFORME", "CONFORME", 50 * PRICE]);
  });

  await test.step("Doublon – même fournisseur et même n° (casse et espaces différents) : refusé, rien n'est créé", async () => {
    await openInvoiceForm(page, poNumber, ` f-${tag.toLowerCase()}-1 `);
    await expect(t(page, `inv-line-${poNumber}-1`).getByTestId("inv-line-qty")).toHaveValue("50"); // il reste 50 à facturer
    await t(page, "inv-submit").click();
    await expect(t(page, "inv-duplicate-error")).toBeVisible();
    await expect(page).toHaveURL(/\/achats\/factures\/nouvelle/);
    const n = await dbOne<{ n: string }>(
      `SELECT count(*)::text AS n FROM supplier_invoices i JOIN suppliers s ON s.id = i.supplier_id WHERE s.code = $1 AND i.supplier_invoice_no ILIKE $2`,
      [SUPPLIER, `%${tag}-1`],
    );
    expect(Number(n.n)).toBe(1);
  });

  await test.step("Facture 2 – les 50 restants facturés à +5 % : statut ÉCART, ligne surlignée avec l'écart de prix", async () => {
    await t(page, "inv-number").fill(invNo2);
    await expect(t(page, `inv-line-${poNumber}-1`).getByTestId("inv-line-qty")).toHaveValue("50");
    await t(page, `inv-line-${poNumber}-1`).getByTestId("inv-line-price").fill(String(PRICE * 1.05));
    fac2 = await submitInvoice(page);
    expect(fac2).not.toBe(fac1);
    await expect(t(page, "inv-badges").getByTestId("status-ECART")).toBeVisible();
    await expect(t(page, "inv-gap-count")).toContainText("1 ligne en écart");
    await expect(t(page, "inv-line-1")).toHaveAttribute("data-match", "ECART_PRIX");
    await expect(t(page, "inv-line-1").getByTestId("inv-line-price")).toContainText("5");
    const row = await invoiceRow(fac2);
    expect([row.status, row.lines]).toEqual(["ECART", "ECART_PRIX"]);
    await expect(t(page, "inv-action-approve")).toHaveCount(0);
  });

  await test.step("L'écart est listé dans les factures ; l'acheteur ne peut pas donner le bon à payer (aucun bouton, aussi sur la facture conforme)", async () => {
    await ready(page, "/achats/factures");
    await expect(t(page, "inv-list")).toContainText(fac2);
    await ready(page, `/achats/factures/${(await invoiceRow(fac1)).id}`);
    await expect(t(page, "inv-action-approve")).toHaveCount(0);
    await logout(page);
  });

  await test.step("Le Responsable donne le bon à payer sur la facture conforme, sans motif", async () => {
    await loginAs(page, "RESPONSABLE_ACHATS");
    await ready(page, `/achats/factures/${(await invoiceRow(fac1)).id}`);
    await t(page, "inv-action-approve").click();
    await expect(t(page, "inv-approve-dialog")).toBeVisible();
    await t(page, "inv-approve-dialog-confirm").click();
    await expect(t(page, "inv-badges").getByTestId("status-BON_A_PAYER")).toBeVisible();
    const row = await invoiceRow(fac1);
    expect(row.status).toBe("BON_A_PAYER");
    expect(row.pay_approved_by_id).not.toBeNull();
  });

  await test.step("Sur la facture en écart, le motif de dérogation est obligatoire ; avec motif, le bon à payer est donné et tracé", async () => {
    const id = (await invoiceRow(fac2)).id;
    await ready(page, `/achats/factures/${id}`);
    await t(page, "inv-action-approve").click();
    await expectReasonRequired(page, "inv-derogation-dialog");
    expect((await invoiceRow(fac2)).status).toBe("ECART");
    await confirmReason(page, "inv-derogation-dialog", "Hausse acceptée par M. DIBI avec le fournisseur");
    await expect(t(page, "inv-badges").getByTestId("status-BON_A_PAYER")).toBeVisible();
    const row = await invoiceRow(fac2);
    expect(row.status).toBe("BON_A_PAYER");
    expect(row.pay_approved_by_id).not.toBeNull();
    const audit = await dbQuery(`SELECT 1 FROM audit_logs WHERE entity_id = $1`, [id]);
    expect(audit.length).toBeGreaterThanOrEqual(2); // création + bon à payer
  });

  await test.step("Export des écarts : le bouton télécharge un fichier Excel", async () => {
    await ready(page, "/achats/factures");
    const [download] = await Promise.all([page.waitForEvent("download"), t(page, "inv-export-gaps").click()]);
    expect(download.suggestedFilename()).toMatch(/^factures-ecarts_.*\.xlsx$/);
  });
});
