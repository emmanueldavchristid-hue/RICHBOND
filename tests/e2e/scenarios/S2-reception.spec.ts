import { expect, test } from "@playwright/test";
import { loginAs, logout } from "../helpers/auth";
import { setTestNow, simulatedAt } from "../helpers/clock";
import { auditCount, expectNotification, norm, ready, t, title, uniqueTag } from "../helpers/da";
import { dbOne, dbQuery } from "../helpers/db";
import { resetLicense, trialEndDay } from "../helpers/license";
import { confirmReason, expectReasonRequired, poById } from "../helpers/po";
import {
  createReceivableOrder,
  expectTouchHeight,
  fillReceipt,
  NC_NUMBER,
  ncOfReceipt,
  openReceiptForm,
  orderReceiptState,
  orderWarehouseId,
  receiptByNumber,
  receiptCount,
  receiptLines,
  receiptMovements,
  stockOf,
  submitReceipt,
} from "../helpers/rec";

/**
 * S2 – Réception partielle, refus, seconde réception, contre-passation, solde de reliquat, essai expiré (LOT-06, EX-24).
 * Joué en desktop et en tablette (projets Playwright) : les écrans magasin sont utilisés au doigt (champs >= 44 px).
 * Chaque scénario vérifie l'interface et l'effet métier en base (stock, PMP, statut du BC, NC, audit, notifications).
 */

const ITEM = "Toner imprimante"; // unité d'achat = unité de stock (coefficient 1) : les calculs de stock restent lisibles
const SUPPLIER = "FRS-00006";
const PRICE = 48750; // FCFA HT l'unité, volontairement atypique pour détecter toute fuite de prix vers le Magasinier
const QTY = 100;

/** PMP après une entrée (formule du cahier des charges), arrondi à 4 décimales. */
const pmpAfter = (s: number, p: number, q: number, c: number) =>
  s <= 0 ? c : Math.round(((s * p + q * c) / (s + q)) * 1e4) / 1e4;

test.beforeEach(async ({ context }) => {
  await resetLicense(30);
  await setTestNow(context, null);
});

test.afterAll(async () => {
  await resetLicense(30);
});

// ---------------------------------------------------------------------------------------------------
test("S2 (étapes 1 et 2) – BC de 100 : réception partielle avec refus (NC), seconde réception complète, BC reçu", async ({
  page,
}, testInfo) => {
  const tag = uniqueTag("S2A", testInfo.project.name);
  let poId = "";
  let poNumber = "";
  let whId = "";
  let stock0 = { qty: 0, pmp: 0 };
  let rec1 = "";
  let rec2 = "";
  let rec1Id = "";
  let nc = "";

  await test.step("Préambule : le Responsable passe un BC de 100 toners, l'envoie et le fournisseur confirme pour aujourd'hui", async () => {
    await loginAs(page, "RESPONSABLE_ACHATS");
    const po = await createReceivableOrder(page, {
      supplier: SUPPLIER,
      reason: `Réception partielle ${tag}`,
      lines: [{ search: ITEM, qty: String(QTY), price: String(PRICE) }],
    });
    poId = po.id;
    poNumber = po.number;
    whId = await orderWarehouseId(poId);
    stock0 = await stockOf(ITEM, whId);
    expect((await poById(poId)).status).toBe("CONFIRME");
    await logout(page);
  });

  await test.step("Étape 1 – Magasinier : le BC est dans « Attendues aujourd'hui », sans aucun prix à l'écran", async () => {
    await loginAs(page, "MAGASINIER");
    await ready(page, "/stock/receptions");
    await expect(title(page)).toHaveText("Réceptions");
    await t(page, "rec-search").fill(poNumber);
    const row = t(page, "rec-block-today").getByTestId(`rec-expected-${poNumber}`);
    await expect(row).toBeVisible();
    await expect(row).toContainText("1 ligne à recevoir");
    await expect(row).toContainText("Confirmé");
    expect(norm(await page.locator("main").innerText())).not.toMatch(/FCFA|XOF/);
  });

  await test.step("Étape 1 – Écran de saisie : restant dû pré-rempli, champs et boutons tactiles (>= 44 px), aucun prix, même dans le code de la page", async () => {
    await t(page, `rec-receive-${poNumber}`).click();
    await expect(t(page, "rec-form")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(title(page)).toHaveText(`Réception du ${poNumber}`);
    await expect(t(page, "rec-line-1")).toContainText(ITEM);
    await expect(t(page, "rec-line-1-due")).toContainText("Restant dû : 100");
    await expect(t(page, "rec-delivered-1")).toHaveValue("100");
    await expect(t(page, "rec-accepted-1")).toContainText("100");
    for (const id of [
      "rec-bl",
      "rec-date",
      "rec-warehouse",
      "rec-carrier",
      "rec-delivered-1",
      "rec-refused-1",
      "rec-lot-1",
      "rec-accept-all",
      "rec-submit",
    ]) {
      await expectTouchHeight(page, id);
    }
    const text = norm(await page.locator("main").innerText());
    expect(text).not.toMatch(/FCFA|XOF|Prix|Montant/);
    const html = await page.content();
    for (const leak of ["48750", "48 750", "4875000", "4 875 000", "unitPrice", "netAmount", "unitCost"])
      expect(html).not.toContain(leak);
  });

  await test.step("Étape 1 – Contrôles de saisie : N° de BL obligatoire, motif obligatoire pour un refus", async () => {
    await t(page, "rec-delivered-1").fill("60");
    await t(page, "rec-refused-1").fill("5");
    await expect(t(page, "rec-accepted-1")).toContainText("55");
    await expect(t(page, "rec-summary")).toContainText("avec refus");
    await t(page, "rec-submit").click();
    await expect(page.getByText("Le numéro du bon de livraison est obligatoire.")).toBeVisible();
    await expect(page.getByText("Choisissez le motif du refus.").first()).toBeVisible();
    await expect(t(page, "rec-confirm")).toHaveCount(0);
  });

  await test.step("Étape 1 – Réception 1 : 60 livrées, 55 acceptées, 5 refusées « Abîmé » ; confirmation puis fiche REC-AAAA-NNNNN", async () => {
    await fillReceipt(page, { bl: `BL-${tag}-1`, lines: { 1: { reason: "ABIME" } } });
    await t(page, "rec-comment").fill("5 cartons ouverts et abîmés");
    await t(page, "rec-submit").click();
    await expect(t(page, "rec-confirm")).toContainText("une non-conformité sera ouverte");
    await t(page, "rec-confirm-confirm").click();
    await expect(page).toHaveURL(/\/stock\/receptions\/(?!nouvelle)[^/?]+$/);
    await expect(title(page)).toHaveText(new RegExp(`^REC-${new Date().getFullYear()}-\\d{5}$`));
    await page.waitForLoadState("networkidle");
    rec1 = norm(await title(page).textContent());
  });

  await test.step("Étape 1 – Fiche réception : quantités, motif, bandeau de refus, à l'heure, toujours aucun prix", async () => {
    await expect(t(page, "rec-line-1-accepted")).toContainText("55");
    await expect(t(page, "rec-line-1-refused")).toContainText("5");
    await expect(t(page, "rec-line-1-refused")).toContainText("Abîmé");
    await expect(t(page, "rec-refusal-banner")).toContainText("1 non-conformité ouverte");
    await expect(t(page, "rec-badges")).toContainText("Livré à l'heure");
    await expect(t(page, "rec-badges")).not.toContainText("Bon soldé");
    await expect(t(page, "rec-info")).toContainText(poNumber);
    await expect(t(page, "rec-info")).toContainText(`BL-${tag}-1`);
    await expect(t(page, "rec-cancel")).toHaveCount(0); // le Magasinier ne contre-passe pas
    expect(norm(await page.locator("main").innerText())).not.toMatch(/FCFA|Coût|Valeur/);
    expect(await page.content()).not.toContain("unitCostXof");
  });

  await test.step("Effet métier 1 : réception, ligne, entrée de stock au bon coût, PMP, BC partiellement reçu, NC ouverte, audit", async () => {
    const rec = await receiptByNumber(rec1);
    rec1Id = rec.id;
    expect(rec.status).toBe("VALIDEE");
    expect(rec.order_id).toBe(poId);
    expect(rec.days_late).toBe(0);
    expect(rec.in_full).toBe(false);
    const lines = await receiptLines(rec.id);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ reason: "ABIME" });
    expect(
      [lines[0].delivered, lines[0].accepted, lines[0].refused, lines[0].accepted_stock].map(Number),
    ).toEqual([60, 55, 5, 55]);
    expect(Number(lines[0].unit_cost)).toBe(PRICE);
    const mv = await receiptMovements(rec.id);
    expect(mv).toHaveLength(1); // le refusé n'entre jamais en stock
    expect(mv[0].type).toBe("ENTREE_RECEPTION");
    expect(Number(mv[0].quantity)).toBe(55);
    expect(mv[0].value).toBe(55 * PRICE);
    const st = await stockOf(ITEM, whId);
    expect(st.qty).toBe(stock0.qty + 55);
    expect(st.pmp).toBeCloseTo(pmpAfter(stock0.qty, stock0.pmp, 55, PRICE), 2);
    const po = await poById(poId);
    expect(po.status).toBe("PARTIELLEMENT_RECU");
    const state = await orderReceiptState(poId);
    expect([Number(state[0].quantity), Number(state[0].received_qty), Number(state[0].closed_qty)]).toEqual([
      100, 55, 0,
    ]);
    const ncs = await ncOfReceipt(rec.id);
    expect(ncs).toHaveLength(1);
    expect(ncs[0].number).toMatch(NC_NUMBER);
    expect([Number(ncs[0].qty), ncs[0].reason, ncs[0].status, ncs[0].decision]).toEqual([
      5,
      "ABIME",
      "OUVERTE",
      null,
    ]);
    nc = ncs[0].number;
    expect(await auditCount(rec.id, "RECEIPT_CREATE")).toBe(1);
    expect(await auditCount(ncs[0].id, "NC_CREATE")).toBe(1);
  });

  await test.step("Étape 1 – Le BC reste attendu (statut « Partiellement reçu », restant dû 45) ; la réception figure dans les récentes avec « avec refus »", async () => {
    await ready(page, "/stock/receptions");
    await t(page, "rec-search").fill(poNumber);
    const row = t(page, `rec-expected-${poNumber}`);
    await expect(row).toBeVisible();
    await expect(row.getByTestId("status-PARTIELLEMENT_RECU")).toBeVisible();
    await ready(page, "/stock/receptions?onglet=recentes");
    const recent = t(page, `rec-row-${rec1}`);
    await expect(recent).toBeVisible();
    await expect(recent).toContainText(poNumber);
    await expect(recent).toContainText("avec refus");
  });

  await test.step("Étape 2 – Seconde réception : restant dû 45 ; 46 est bloqué (sur-livraison, accord du Responsable seul) ; 45 passe", async () => {
    await openReceiptForm(page, poNumber);
    await expect(t(page, "rec-line-1-due")).toContainText("Restant dû : 45");
    await expect(t(page, "rec-line-1-due")).toContainText("déjà reçu 55");
    await expect(t(page, "rec-delivered-1")).toHaveValue("45");
    await t(page, "rec-bl").fill(`BL-${tag}-2`);
    await t(page, "rec-delivered-1").fill("46");
    await expect(t(page, "rec-line-1-over")).toBeVisible();
    await expect(t(page, "rec-over-blocked")).toContainText("demandez l'accord du Responsable Achats");
    await t(page, "rec-submit").click();
    await expect(t(page, "rec-confirm")).toHaveCount(0);
    await t(page, "rec-delivered-1").fill("45");
    await expect(t(page, "rec-line-1-over")).toHaveCount(0);
    rec2 = await submitReceipt(page);
    expect(rec2).not.toBe(rec1);
  });

  await test.step("Étape 2 – BC soldé : badge « Bon soldé », stock total 100, PMP cohérent, BC « Reçu », plus attendu", async () => {
    await expect(t(page, "rec-badges")).toContainText("Bon soldé");
    await expect(t(page, "rec-refusal-banner")).toHaveCount(0);
    const rec = await receiptByNumber(rec2);
    expect(rec.in_full).toBe(true);
    const mv = await receiptMovements(rec.id);
    expect(mv).toHaveLength(1);
    expect(Number(mv[0].quantity)).toBe(45);
    const after1 = pmpAfter(stock0.qty, stock0.pmp, 55, PRICE);
    expect(Number(mv[0].pmp_before)).toBeCloseTo(after1, 2);
    const st = await stockOf(ITEM, whId);
    expect(st.qty).toBe(stock0.qty + 100);
    expect(st.pmp).toBeCloseTo(pmpAfter(stock0.qty + 55, after1, 45, PRICE), 2);
    expect((await poById(poId)).status).toBe("RECU");
    const state = await orderReceiptState(poId);
    expect([Number(state[0].received_qty), Number(state[0].closed_qty)]).toEqual([100, 0]);
    expect(await receiptCount(poId)).toBe(2);
    await ready(page, "/stock/receptions");
    await t(page, "rec-search").fill(poNumber);
    await expect(t(page, `rec-expected-${poNumber}`)).toHaveCount(0);
  });

  await test.step("Le Responsable est notifié du refus et voit les deux réceptions sur la fiche du BC « Reçu »", async () => {
    await logout(page);
    await loginAs(page, "RESPONSABLE_ACHATS");
    await expectNotification(page, `Non-conformité sur ${poNumber}`);
    await ready(page, `/achats/commandes/${poId}`);
    await expect(t(page, "status-RECU")).toBeVisible();
    await expect(t(page, "po-receipts")).toBeVisible();
    await expect(t(page, `po-receipt-${rec1}`)).toBeVisible();
    await expect(t(page, `po-receipt-${rec2}`)).toBeVisible();
    await expect(t(page, "po-receive")).toHaveCount(0);
    await expect(t(page, "rec-close-remainder")).toHaveCount(0);
  });

  await test.step("Non-conformité : l'acheteur local la voit « À décider », choisit « Remplacement » ; elle est clôturée et tracée", async () => {
    await logout(page);
    await loginAs(page, "ACHETEUR_LOCAL");
    await ready(page, "/stock/receptions/non-conformites");
    const row = t(page, `nc-row-${nc}`);
    await expect(row).toBeVisible();
    await expect(row).toContainText("Abîmé");
    await expect(row).toContainText("Ouverte");
    await expect(row.getByRole("link", { name: rec1 })).toBeVisible();
    await t(page, `nc-decide-${nc}`).click();
    await expect(t(page, "nc-decision-dialog")).toBeVisible();
    await expect(t(page, "nc-decision-confirm")).toBeDisabled(); // aucune décision choisie
    await t(page, "nc-decision-select").selectOption("REMPLACEMENT");
    await t(page, "nc-decision-comment").fill("Remplacement accordé par le fournisseur");
    await t(page, "nc-decision-confirm").click();
    await expect(t(page, "nc-decision-dialog")).toBeHidden();
    await expect(t(page, `nc-row-${nc}`)).toHaveCount(0); // sort de « À décider »
    await ready(page, "/stock/receptions/non-conformites?statut=cloturees");
    await expect(t(page, `nc-decision-${nc}`)).toContainText("Remplacement");
    const rows = await ncOfReceipt(rec1Id);
    expect([rows[0].status, rows[0].decision]).toEqual(["CLOTUREE", "REMPLACEMENT"]);
    expect(await auditCount(rows[0].id, "NC_DECIDE")).toBe(1);
    // L'acheteur consulte mais ne réceptionne pas : aucun bouton de réception.
    await ready(page, `/achats/commandes/${poId}`);
    await expect(t(page, "po-receive")).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------------------------------
test("S2 – Contre-passation par le Responsable (refusée si stock sorti), solde du reliquat, contre-passation refusée après solde", async ({
  page,
}, testInfo) => {
  const tag = uniqueTag("S2B", testInfo.project.name);
  let poId = "";
  let poNumber = "";
  let whId = "";
  let stock0 = { qty: 0, pmp: 0 };
  let rec1 = "";
  let rec2 = "";
  let rec1Id = "";
  let rec2Id = "";

  await test.step("Préambule : BC de 100 toners ; le Magasinier reçoit 55 (5 refusés), puis 40", async () => {
    await loginAs(page, "RESPONSABLE_ACHATS");
    const po = await createReceivableOrder(page, {
      supplier: SUPPLIER,
      reason: `Contre-passation ${tag}`,
      lines: [{ search: ITEM, qty: String(QTY), price: String(PRICE) }],
    });
    poId = po.id;
    poNumber = po.number;
    whId = await orderWarehouseId(poId);
    stock0 = await stockOf(ITEM, whId);
    await logout(page);

    await loginAs(page, "MAGASINIER");
    await openReceiptForm(page, poNumber);
    await fillReceipt(page, {
      bl: `BL-${tag}-1`,
      lines: { 1: { delivered: "60", refused: "5", reason: "NON_CONFORME" } },
    });
    rec1 = await submitReceipt(page);
    rec1Id = (await receiptByNumber(rec1)).id;
    await openReceiptForm(page, poNumber);
    await fillReceipt(page, { bl: `BL-${tag}-2`, lines: { 1: { delivered: "40" } } });
    rec2 = await submitReceipt(page);
    rec2Id = (await receiptByNumber(rec2)).id;
    expect((await stockOf(ITEM, whId)).qty).toBe(stock0.qty + 95);
    expect((await poById(poId)).status).toBe("PARTIELLEMENT_RECU"); // 5 restent dus
    expect(Number((await orderReceiptState(poId))[0].received_qty)).toBe(95);
  });

  await test.step("Le Magasinier et l'acheteur ne peuvent pas contre-passer (aucun bouton)", async () => {
    await ready(page, `/stock/receptions/${rec2Id}`);
    await expect(title(page)).toHaveText(rec2);
    await expect(t(page, "rec-cancel")).toHaveCount(0);
    await logout(page);
    await loginAs(page, "ACHETEUR_LOCAL");
    await ready(page, `/stock/receptions/${rec2Id}`);
    await expect(title(page)).toHaveText(rec2);
    await expect(t(page, "rec-cancel")).toHaveCount(0);
    await logout(page);
  });

  await test.step("Responsable : la contre-passation exige un motif ; elle est refusée si le stock a déjà été sorti", async () => {
    await loginAs(page, "RESPONSABLE_ACHATS");
    await ready(page, `/stock/receptions/${rec2Id}`);
    await expect(t(page, "rec-cancel")).toBeEnabled();
    // Arrangement : 30 unités « sorties » (écart simulé directement en base : l'écran de sortie arrive avec le LOT-07).
    const real = (await stockOf(ITEM, whId)).qty;
    await dbQuery(
      `UPDATE stock_levels SET quantity = 10 WHERE item_id = (SELECT id FROM items WHERE name = $1) AND warehouse_id = $2`,
      [ITEM, whId],
    );
    try {
      await t(page, "rec-cancel").click();
      await expectReasonRequired(page, "rec-cancel-dialog");
      await confirmReason(page, "rec-cancel-dialog", "Livraison saisie sur le mauvais BC");
      await expect(t(page, "rec-cancel-dialog")).toContainText(/Stock insuffisant|insuffisant/);
      expect((await receiptByNumber(rec2)).status).toBe("VALIDEE");
      expect(await receiptMovements(rec2Id)).toHaveLength(1);
      expect(Number((await orderReceiptState(poId))[0].received_qty)).toBe(95);
      expect(await auditCount(rec2Id, "RECEIPT_CANCEL")).toBe(0);
    } finally {
      await dbQuery(
        `UPDATE stock_levels SET quantity = $3 WHERE item_id = (SELECT id FROM items WHERE name = $1) AND warehouse_id = $2`,
        [ITEM, whId, real],
      );
    }
  });

  await test.step("Responsable : stock rétabli, la contre-passation de REC2 passe ; stock, PMP, quantités du BC et statut reviennent", async () => {
    await page.keyboard.press("Escape");
    await ready(page, `/stock/receptions/${rec2Id}`);
    await t(page, "rec-cancel").click();
    await confirmReason(page, "rec-cancel-dialog", "Livraison saisie sur le mauvais BC");
    await expect(t(page, "rec-cancel-banner")).toBeVisible();
    await expect(t(page, "rec-cancel-banner")).toContainText("Livraison saisie sur le mauvais BC");
    await expect(t(page, "rec-badges").getByTestId("status-ANNULEE")).toBeVisible();
    await expect(t(page, "rec-cancel")).toHaveCount(0);
    const rec = await receiptByNumber(rec2);
    expect(rec.status).toBe("ANNULEE");
    expect(rec.cancelled_reason).toBe("Livraison saisie sur le mauvais BC");
    const mv = await receiptMovements(rec2Id);
    expect(mv).toHaveLength(2);
    expect(Number(mv[1].quantity)).toBe(-40);
    expect(mv[1].reversal_of_id).not.toBeNull();
    expect(mv[1].value).toBe(-mv[0].value);
    const st = await stockOf(ITEM, whId);
    expect(st.qty).toBe(stock0.qty + 55);
    expect(st.pmp).toBeCloseTo(pmpAfter(stock0.qty, stock0.pmp, 55, PRICE), 1);
    expect((await poById(poId)).status).toBe("PARTIELLEMENT_RECU");
    expect(Number((await orderReceiptState(poId))[0].received_qty)).toBe(55);
    expect(await auditCount(rec2Id, "RECEIPT_CANCEL")).toBe(1);
  });

  await test.step("Fiche du BC : REC2 « Annulée », restant dû 45 ; l'acheteur peut solder le reliquat (motif obligatoire, quantités annoncées)", async () => {
    await logout(page);
    await loginAs(page, "ACHETEUR_LOCAL");
    await ready(page, `/achats/commandes/${poId}`);
    await expect(t(page, "status-PARTIELLEMENT_RECU")).toBeVisible();
    await expect(t(page, `po-receipt-${rec1}`)).toBeVisible();
    await expect(t(page, `po-receipt-${rec2}`)).toContainText("Annulée");
    await expect(t(page, "po-receive")).toHaveCount(0); // l'acheteur ne réceptionne pas
    await t(page, "rec-close-remainder").click();
    await expect(t(page, "rec-close-lines")).toContainText("45");
    await expectReasonRequired(page, "rec-close-dialog");
    await confirmReason(page, "rec-close-dialog", "Le fournisseur ne livrera plus le reste");
    await expect(t(page, "status-RECU")).toBeVisible();
    await expect(t(page, "rec-close-remainder")).toHaveCount(0);
  });

  await test.step("Effet métier du solde : quantité soldée 45, reçue 55, BC « Reçu », audit, plus attendu au magasin", async () => {
    const state = (await orderReceiptState(poId))[0];
    expect([Number(state.received_qty), Number(state.closed_qty)]).toEqual([55, 45]);
    expect((await poById(poId)).status).toBe("RECU");
    const n = await dbOne<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_logs WHERE entity_id = $1 AND action = 'PO_CLOSE_REMAINDER'`,
      [poId],
    );
    expect(Number(n.n)).toBe(1);
    expect((await stockOf(ITEM, whId)).qty).toBe(stock0.qty + 55); // solder ne touche pas au stock
    await ready(page, "/stock/receptions");
    await t(page, "rec-search").fill(poNumber);
    await expect(t(page, `rec-expected-${poNumber}`)).toHaveCount(0);
  });

  await test.step("Après le solde, la contre-passation de REC1 est refusée (reliquat soldé) ; rien ne change", async () => {
    await logout(page);
    await loginAs(page, "RESPONSABLE_ACHATS");
    await ready(page, `/stock/receptions/${rec1Id}`);
    await t(page, "rec-cancel").click();
    await confirmReason(page, "rec-cancel-dialog", "Tentative après solde du reliquat");
    await expect(t(page, "rec-cancel-dialog")).toContainText(/reliquat/i);
    expect((await receiptByNumber(rec1)).status).toBe("VALIDEE");
    expect((await stockOf(ITEM, whId)).qty).toBe(stock0.qty + 55);
    expect((await poById(poId)).status).toBe("RECU");
  });
});

// ---------------------------------------------------------------------------------------------------
test.describe("S2 – Essai expiré : consultation seulement", () => {
  test.afterEach(async () => {
    await resetLicense(30);
  });

  test("les réceptions se consultent ; saisie, contre-passation, décision de NC et solde sont grisés ; rien ne change en base", async ({
    page,
    context,
  }) => {
    // Réception partielle du seed (BL-DEMO-0002) : BC « Partiellement reçu », NC ouverte, une réception validée.
    const seed = await dbOne<{ id: string; number: string; order_id: string; order_number: string }>(
      `SELECT r.id, r.number, r.order_id, p.number AS order_number FROM receipts r JOIN purchase_orders p ON p.id = r.order_id
        WHERE r.delivery_note_ref = 'BL-DEMO-0002'`,
    );
    const nc = await dbOne<{ number: string }>(
      `SELECT number FROM non_conformities WHERE receipt_id = $1 AND status = 'OUVERTE'`,
      [seed.id],
    );
    const before = await receiptCount(seed.order_id);

    await test.step("Après la fin d'essai : le Magasinier se connecte, bandeau « lecture seule », écran Réceptions consultable", async () => {
      await setTestNow(context, simulatedAt(trialEndDay(30), -1, "08:00"));
      await loginAs(page, "MAGASINIER");
      await expect(t(page, "read-only-banner")).toBeVisible();
      await ready(page, "/stock/receptions?onglet=recentes");
      await expect(t(page, `rec-row-${seed.number}`)).toBeVisible();
    });

    await test.step("La saisie d'une réception est consultable mais « Valider la réception » est désactivé", async () => {
      await ready(page, `/stock/receptions/nouvelle?bc=${seed.order_id}`);
      await expect(t(page, "rec-form")).toBeVisible();
      await expect(t(page, "rec-submit")).toBeDisabled();
    });

    await test.step("Responsable : contre-passation, décision de NC et solde du reliquat sont désactivés", async () => {
      await logout(page);
      await loginAs(page, "RESPONSABLE_ACHATS");
      await ready(page, `/stock/receptions/${seed.id}`);
      await expect(title(page)).toHaveText(seed.number);
      await expect(t(page, "rec-cancel")).toBeDisabled();
      await ready(page, "/stock/receptions/non-conformites");
      await expect(t(page, `nc-decide-${nc.number}`)).toBeDisabled();
      await ready(page, `/achats/commandes/${seed.order_id}`);
      await expect(t(page, "rec-close-remainder")).toBeDisabled();
    });

    await test.step("Rien n'a changé en base : réception, NC ouverte, statut du BC", async () => {
      expect(await receiptCount(seed.order_id)).toBe(before);
      expect((await receiptByNumber(seed.number)).status).toBe("VALIDEE");
      expect((await ncOfReceipt(seed.id))[0].status).toBe("OUVERTE");
      expect((await poById(seed.order_id)).status).toBe("PARTIELLEMENT_RECU");
    });
  });
});
