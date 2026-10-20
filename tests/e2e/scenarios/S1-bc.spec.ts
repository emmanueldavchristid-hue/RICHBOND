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
  prRow,
  ready,
  submitForm,
  t,
  title,
  uniqueTag,
} from "../helpers/da";
import { dbOne } from "../helpers/db";
import { resetLicense } from "../helpers/license";
import {
  approveFromPage,
  BC_NUMBER,
  confirmFromPage,
  downloadPdf,
  idFromUrl,
  poAllocations,
  poAuditCount,
  poById,
  poEvents,
  poLines,
  sendFromPage,
} from "../helpers/po";
import { fillReceipt, orderReceiptState, orderWarehouseId, receiptByNumber, receiptMovements, stockOf, submitReceipt } from "../helpers/rec";

/**
 * S1 étendu – étapes 3 à 6 (LOT-05, EX-21 ; LOT-06, EX-24) : de la DA validée au BC envoyé, confirmé puis réceptionné en totalité.
 * Joué en desktop et en tablette (projets Playwright). Les étapes 1 et 2 sont rejouées rapidement pour partir d'une DA neuve.
 */

test.beforeEach(async ({ context }) => {
  await resetLicense(30);
  await setTestNow(context, null);
});

test("S1 (étapes 3 à 5) – DA validée, BC créé et soumis, validé avec numéro et PDF, envoyé, confirmé", async ({
  page,
}, testInfo) => {
  const tag = uniqueTag("S1BC", testInfo.project.name);
  let da = "";
  let draftLabel = "";
  let poId = "";
  let poNumber = "";
  const promised = dayOffset(10);
  // Le prix du toner dépend du dernier prix connu (l'historique évolue d'une exécution à l'autre) : +30 % pour déclencher l'alerte.
  const last = await dbOne<{ price: string }>(
    `SELECT h.price::text FROM item_price_history h JOIN items i ON i.id = h.item_id WHERE i.name = 'Toner imprimante' ORDER BY h.date DESC, h.created_at DESC LIMIT 1`,
  );
  const tonerPrice = Math.round(Number(last.price) * 1.3);
  const ht = 155000 + tonerPrice;
  const ttc = Math.round(ht * 1.18);
  const spaced = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

  await test.step("Préambule (étapes 1 et 2) : le Magasinier soumet la DA, le Responsable la valide (type Local, toner réduit à 1)", async () => {
    await loginAs(page, "MAGASINIER");
    await fillNewPr(page, {
      department: "Administration",
      reason: `Fourniture de bureau ${tag}`,
      neededBy: dayOffset(7),
      lines: [
        { search: "Rame papier A4", qty: "10" },
        { search: "Toner imprimante", qty: "2" },
      ],
    });
    da = await submitForm(page);
    await logout(page);
    await loginAs(page, "RESPONSABLE_ACHATS");
    await openPr(page, da, "a-valider");
    await t(page, "pr-action-approve").click();
    await t(page, "pr-approve-type").selectOption("LOCAL");
    await t(page, "pr-approve-qty-2").fill("1");
    await t(page, "pr-approve-confirm").click();
    await expect(t(page, "status-VALIDEE")).toBeVisible();
  });

  await test.step("Étape 3 – Acheteur local : ouvre la DA assignée, aucun BC lié, « Créer le BC » disponible", async () => {
    await logout(page);
    await loginAs(page, "ACHETEUR_LOCAL");
    await expectNotification(page, `${da} validée et assignée à vous`);
    await openPr(page, da, "assignees");
    await expect(t(page, "pr-linked-orders")).toHaveCount(0);
    await expect(t(page, "pr-action-create-order")).toBeEnabled();
  });

  await test.step("Étape 3 – Écran « À commander » : lignes pré-cochées, fournisseur principal proposé, brouillon créé", async () => {
    await t(page, "pr-action-create-order").click();
    await expect(page).toHaveURL(/\/achats\/commandes\/nouvelle\?da=/);
    await page.waitForLoadState("networkidle");
    const group = t(page, "to-order-group-FRS-00006");
    await expect(group).toContainText("PAPETERIE MODERNE ABIDJAN");
    await expect(group.locator('[data-testid^="to-order-line-"]')).toHaveCount(2);
    for (const box of await group.getByTestId("to-order-check").all()) await expect(box).toBeChecked();
    await expect(group.getByTestId("to-order-create")).toContainText("Créer le BC (2)");
    await group.getByTestId("to-order-create").click();
    await expect(page).toHaveURL(/\/achats\/commandes\/[^/]+\/modifier/);
    await page.waitForLoadState("networkidle");
    poId = /\/achats\/commandes\/([^/]+)\/modifier/.exec(page.url())![1];
  });

  await test.step("Étape 3 – Formulaire : lignes issues de la DA (rame en cartons, toner 1), allocations visibles, prix saisis, soumission", async () => {
    await expect(t(page, "po-form")).toBeVisible();
    await expect(t(page, "po-supplier")).toContainText("PAPETERIE MODERNE ABIDJAN");
    await expect(t(page, "po-form-line-1")).toContainText("Rame papier A4");
    await expect(t(page, "po-form-line-1-allocations")).toContainText(da);
    await expect(t(page, "po-form-line-2")).toContainText("Toner imprimante");
    await expect(t(page, "po-form-qty-1")).toHaveValue("10"); // la DA est en cartons (unité d'achat)
    await expect(t(page, "po-form-qty-2")).toHaveValue("1"); // validé à 1, pas 2
    await expect(t(page, "po-address")).not.toHaveValue("");
    await t(page, "po-form-price-1").fill("15500");
    await t(page, "po-form-price-2").fill(String(tonerPrice)); // +30 % vs le dernier prix connu
    await expect(t(page, "po-form-net-1")).toContainText("155 000");
    await expect(t(page, "order-total-ttc")).toContainText(spaced(ttc));
    await t(page, "po-form-submit").click();
    await t(page, "po-form-submit-dialog-confirm").click();
    await expect(t(page, "status-A_VALIDER")).toBeVisible();
    draftLabel = norm(await title(page).textContent());
    expect(draftLabel).toMatch(/^BC-BROUILLON-/);
    await expect(t(page, "po-unvalidated-banner")).toBeVisible();
    expect(idFromUrl(page)).toBe(poId);
  });

  await test.step("Effet métier : BC « À valider » sans numéro, 2 lignes, allocations sur la DA, DA toujours « Validée »", async () => {
    const po = await poById(poId);
    expect(po.status).toBe("A_VALIDER");
    expect(po.number).toBeNull();
    expect(po.version).toBe(1);
    expect(po.origin).toBe("DA");
    expect(Number(po.total_ttc)).toBe(ttc);
    expect(await emailOf(po.created_by_id)).toBe("acheteur.local@richbond.test");
    const lines = await poLines(poId);
    expect(lines.map((l) => [l.name, Number(l.quantity), Number(l.net_amount)])).toEqual([
      ["Rame papier A4", 10, 155000],
      ["Toner imprimante", 1, tonerPrice],
    ]);
    expect(await poAllocations(poId)).toHaveLength(2);
    expect((await prRow(da)).status).toBe("VALIDEE");
    expect(await poAuditCount(poId, "PO_SUBMIT")).toBe(1);
    expect((await poEvents(poId)).map((e) => e.type)).toEqual(
      expect.arrayContaining(["CREATED", "SUBMITTED"]),
    );
  });

  await test.step("Étape 3 – La DA affiche le BC en préparation dans « Commandes liées »", async () => {
    await openPr(page, da, "assignees");
    await expect(t(page, "pr-linked-orders")).toContainText(draftLabel);
    await expect(t(page, "pr-linked-orders")).toContainText("À valider");
  });

  await test.step("Étape 4 – Responsable : notifié, pastille d'accueil « BC à valider », onglet « À valider », alerte de prix visible", async () => {
    await logout(page);
    await loginAs(page, "RESPONSABLE_ACHATS");
    await expectNotification(page, `${draftLabel} à valider`);
    await expect(t(page, "accueil-bc-a-valider")).toContainText(/BC à valider : \d+/);
    await ready(page, `/achats/commandes?onglet=a-valider&q=${draftLabel}`);
    await expect(t(page, "po-tab-a-valider")).toHaveAttribute("aria-selected", "true");
    const row = t(page, `po-row-${draftLabel}`);
    await expect(row).toBeVisible();
    await row.getByTestId("po-link").click();
    await expect(title(page)).toHaveText(draftLabel);
    await page.waitForLoadState("networkidle");
    await expect(t(page, "po-alerts")).toBeVisible();
    await expect(t(page, "po-alert-PRICE").first()).toContainText("+30");
    await expect(t(page, "order-total-ht")).toContainText(spaced(ht));
    await expect(t(page, "order-total-ttc")).toContainText(spaced(ttc));
  });

  await test.step("Étape 4 – PDF d'aperçu avant validation : filigrane « NON VALIDÉ », aucun numéro officiel", async () => {
    const pdf = await downloadPdf(page, poId);
    expect(pdf.status).toBe(200);
    expect(pdf.type).toContain("application/pdf");
    expect(pdf.text).toContain("NON VALIDÉ");
    expect(pdf.text).not.toMatch(BC_NUMBER);
  });

  await test.step("Étape 4 – Le Responsable valide : numéro BC-AAAA-NNNNN attribué, statut « Validé », DA « Commandée »", async () => {
    poNumber = await approveFromPage(page);
    expect(poNumber).toMatch(new RegExp(`^BC-${new Date().getFullYear()}-\\d{5}$`));
    await expect(t(page, "po-approved-by")).toContainText("Responsable");
    await expect(t(page, "po-version-1")).toBeVisible();
    await expect(t(page, "po-timeline").getByTestId("po-event-APPROVED")).toBeVisible();
    await expect(t(page, "po-unvalidated-banner")).toHaveCount(0);
    await expect(t(page, "po-sources")).toContainText(da);

    const po = await poById(poId);
    expect(po.status).toBe("VALIDE");
    expect(po.number).toBe(poNumber);
    expect(await emailOf(po.approved_by_id)).toBe("responsable@richbond.test");
    expect(await poAuditCount(poId, "PO_APPROVE")).toBe(1);
    const same = await dbOne<{ n: string }>(
      `SELECT count(*)::text AS n FROM purchase_orders WHERE number = $1`,
      [poNumber],
    );
    expect(same.n).toBe("1");
    expect((await prRow(da)).status).toBe("COMMANDEE");
    const hist = await dbOne<{ n: string }>(
      `SELECT count(*)::text AS n FROM item_price_history WHERE source_ref = $1`,
      [poNumber],
    );
    expect(Number(hist.n)).toBeGreaterThanOrEqual(2);
  });

  await test.step("Étape 4 – PDF téléchargeable : nom BC-AAAA-NNNNN-v1.pdf, contient le numéro, le fournisseur et le total TTC", async () => {
    const pdf = await downloadPdf(page, poId);
    expect(pdf.status).toBe(200);
    expect(pdf.disposition).toContain(`${poNumber}-v1.pdf`);
    expect(pdf.text).toContain(poNumber);
    expect(pdf.text).toContain("PAPETERIE MODERNE ABIDJAN");
    expect(pdf.text).toContain(spaced(ttc));
    expect(pdf.text).not.toContain("NON VALIDÉ");
    await expect(t(page, "po-action-pdf")).toContainText("Télécharger le PDF");
    const v1 = await downloadPdf(page, poId, 1);
    expect(v1.text).toContain(poNumber);
  });

  await test.step("Étape 4 – L'acheteur est notifié de la validation ; la DA est « Commandée » et cite le BC", async () => {
    await logout(page);
    await loginAs(page, "ACHETEUR_LOCAL");
    await expectNotification(page, `${poNumber} validé`);
    // D27 : le créateur de la DA (Magasinier) est prévenu que sa demande est commandée.
    expect((await notificationsFor("magasinier@richbond.test", da)).map((n) => n.title).join("|")).toContain(
      `commandée : ${poNumber}`,
    );
    await openPr(page, da, "assignees");
    await expect(t(page, "status-COMMANDEE")).toBeVisible();
    await expect(t(page, "pr-linked-orders")).toContainText(poNumber);
    await expect(t(page, "pr-action-create-order")).toHaveCount(0);
  });

  await test.step("Étape 5 – L'acheteur marque le BC envoyé par WhatsApp (PDF et texte d'accompagnement proposés)", async () => {
    await ready(page, `/achats/commandes/${poId}`);
    await expect(t(page, "po-action-submit")).toHaveCount(0);
    await expect(t(page, "po-action-approve")).toHaveCount(0);
    await t(page, "po-action-send").click();
    await expect(t(page, "po-send-dialog")).toBeVisible();
    await expect(t(page, "po-send-pdf")).toBeVisible();
    await expect(t(page, "po-send-text-text")).toContainText(poNumber);
    await t(page, "po-send-cancel").click();
    await sendFromPage(page, "WHATSAPP");
    await expect(t(page, "po-sent")).toContainText("WhatsApp");
    const po = await poById(poId);
    expect(po.status).toBe("ENVOYE");
    expect(po.sent_channel).toBe("WHATSAPP");
    expect(await poAuditCount(poId, "PO_SEND")).toBe(1);
  });

  await test.step("Étape 5 – Confirmation du fournisseur : la date promise est obligatoire", async () => {
    await t(page, "po-action-confirm").click();
    await t(page, "po-confirm-dialog-confirm").click(); // sans date : refusé
    await expect(t(page, "po-confirm-dialog-error")).toBeVisible();
    await t(page, "po-confirm-dialog-cancel").click();
    await confirmFromPage(page, promised, "PROFORMA-" + tag);
    await expect(t(page, "po-promised")).toContainText(promised.split("-").reverse().join("/"));
    const po = await poById(poId);
    expect(po.status).toBe("CONFIRME");
    expect(po.promised_date?.toISOString().slice(0, 10)).toBe(promised);
    expect(po.first_promised_date?.toISOString().slice(0, 10)).toBe(promised);
    expect(po.expected_date.toISOString().slice(0, 10)).toBe(promised);
    expect(await poAuditCount(poId, "PO_CONFIRM")).toBe(1);
    expect((await poEvents(poId)).map((e) => e.type)).toEqual(
      expect.arrayContaining(["CREATED", "SUBMITTED", "APPROVED", "SENT", "CONFIRMED"]),
    );
  });

  await test.step("Suivi : le BC confirmé est dans « En cours », pas en retard ; un acheteur ne valide jamais", async () => {
    await ready(page, `/achats/commandes?onglet=en-cours&q=${poNumber}`);
    const row = t(page, `po-row-${poNumber}`);
    await expect(row).toBeVisible();
    await expect(row.getByTestId("status-CONFIRME")).toBeVisible();
    await expect(row.getByTestId("late-badge")).toHaveCount(0);
    await ready(page, `/achats/commandes/${poId}`);
    await expect(t(page, "po-action-approve")).toHaveCount(0);
    expect(await auditCount((await prRow(da)).id, "PR_APPROVE")).toBe(1);
  });

  // ---- Étape 6 (LOT-06, EX-24) : réception de la totalité par le Magasinier ----
  const pmpAfter = (s: number, p: number, q: number, c: number) => (s <= 0 ? c : Math.round(((s * p + q * c) / (s + q)) * 1e4) / 1e4);
  const stockBefore: Record<string, { qty: number; pmp: number }> = {};
  let whId = "";
  let rec = "";

  await test.step("Étape 6 – Magasinier : écran de réception du BC, quantités pré-remplies (rame 10 cartons, toner 1), aucun prix", async () => {
    whId = await orderWarehouseId(poId);
    stockBefore["Rame papier A4"] = await stockOf("Rame papier A4", whId);
    stockBefore["Toner imprimante"] = await stockOf("Toner imprimante", whId);
    await logout(page);
    await loginAs(page, "MAGASINIER");
    // Le BC est promis à J+10 : hors de la semaine affichée par « Livraisons attendues », on ouvre la saisie par son lien.
    await ready(page, `/stock/receptions/nouvelle?bc=${poId}`);
    await expect(t(page, "rec-form")).toBeVisible();
    await expect(title(page)).toHaveText(`Réception du ${poNumber}`);
    await expect(t(page, "rec-line-1-due")).toContainText("Restant dû : 10");
    await expect(t(page, "rec-line-2-due")).toContainText("Restant dû : 1");
    expect(norm(await page.locator("main").innerText())).not.toMatch(/FCFA|XOF/);
  });

  await test.step("Étape 6 – « Tout accepter », N° de bon de livraison, validation : fiche REC-AAAA-NNNNN, BC soldé", async () => {
    await t(page, "rec-accept-all").click();
    await fillReceipt(page, { bl: `BL-${tag}` });
    rec = await submitReceipt(page);
    await expect(t(page, "rec-badges")).toContainText("Bon soldé");
    await expect(t(page, "rec-refusal-banner")).toHaveCount(0);
    await expect(t(page, "rec-line-1-accepted")).toContainText("10");
    await expect(t(page, "rec-line-2-accepted")).toContainText("1");
  });

  await test.step("Étape 6 – Effet métier : stock augmenté (rame : 10 cartons = 50 U), PMP mis à jour, BC « Reçu », audit", async () => {
    const r = await receiptByNumber(rec);
    expect(r.order_id).toBe(poId);
    expect(r.in_full).toBe(true);
    const st = {
      rame: await stockOf("Rame papier A4", whId),
      toner: await stockOf("Toner imprimante", whId),
    };
    const b = stockBefore;
    expect(st.rame.qty).toBe(b["Rame papier A4"].qty + 50);
    expect(st.rame.pmp).toBeCloseTo(pmpAfter(b["Rame papier A4"].qty, b["Rame papier A4"].pmp, 50, 3100), 2);
    expect(st.toner.qty).toBe(b["Toner imprimante"].qty + 1);
    expect(st.toner.pmp).toBeCloseTo(pmpAfter(b["Toner imprimante"].qty, b["Toner imprimante"].pmp, 1, tonerPrice), 2);
    const mv = await receiptMovements(r.id);
    expect(mv.map((m) => [m.type, Number(m.quantity)]).sort()).toEqual([["ENTREE_RECEPTION", 1], ["ENTREE_RECEPTION", 50]]);
    const po = await poById(poId);
    expect(po.status).toBe("RECU");
    expect((await orderReceiptState(poId)).map((l) => [Number(l.quantity), Number(l.received_qty)])).toEqual([[10, 10], [1, 1]]);
    expect(await auditCount(r.id, "RECEIPT_CREATE")).toBe(1);
  });

  await test.step("Étape 6 – L'acheteur voit le BC « Reçu » et la réception sur la fiche ; plus rien à réceptionner", async () => {
    await logout(page);
    await loginAs(page, "ACHETEUR_LOCAL");
    await ready(page, `/achats/commandes/${poId}`);
    await expect(t(page, "status-RECU")).toBeVisible();
    await expect(t(page, `po-receipt-${rec}`)).toBeVisible();
    await expect(t(page, "po-receive")).toHaveCount(0);
  });
});
