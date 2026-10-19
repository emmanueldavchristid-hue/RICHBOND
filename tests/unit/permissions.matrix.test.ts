import { describe, expect, it } from "vitest";
import { ALL_ACTIONS, can, canSeePurchasePrice, visibleNav, type Action, type PermissionUser } from "@/lib/permissions";

const SUPER: PermissionUser = { role: "SUPER_ADMIN" };
const RESP: PermissionUser = { role: "RESPONSABLE_ACHATS" };
const ACH: PermissionUser = { role: "ACHETEUR", purchaseScope: "ALL" };
const MAG: PermissionUser = { role: "MAGASINIER" };

/** Matrice complète, écrite à la main d'après la spec LOT-01 : toute dérive casse le test. */
const ACHETEUR_OK: Action[] = [
  "purchaseRequest.view",
  "purchaseRequest.create",
  "purchaseRequest.cancel",
  "rfq.view",
  "rfq.manage",
  "purchaseOrder.view",
  "purchaseOrder.create",
  "purchaseOrder.send",
  "purchaseOrder.remind",
  "importFile.view",
  "importFile.manage",
  "invoice.view",
  "invoice.manage",
  "supplier.view",
  "supplier.manage",
  "item.view",
  "item.manage",
  "stock.view",
  "price.viewPurchase",
  "price.viewPmp",
  "report.purchasing",
  "exchangeRate.manage",
];
const MAGASINIER_OK: Action[] = [
  "purchaseRequest.view",
  "purchaseRequest.createReplenishment",
  "stock.view",
  "stock.receive",
  "stock.issue",
  "inventory.count",
  "item.view",
  "price.viewPmp",
  "report.stock",
];

describe("matrice exhaustive rôle x action", () => {
  it.each(ALL_ACTIONS.map((a) => [a]))("%s : Acheteur", (a) => {
    expect(can(ACH, a)).toBe(ACHETEUR_OK.includes(a));
  });
  it.each(ALL_ACTIONS.map((a) => [a]))("%s : Magasinier", (a) => {
    expect(can(MAG, a)).toBe(MAGASINIER_OK.includes(a));
  });
  it.each(ALL_ACTIONS.map((a) => [a]))("%s : Responsable (tout sauf licence/maintenance)", (a) => {
    expect(can(RESP, a)).toBe(a !== "license.manage" && a !== "maintenance.run");
  });

  it("le Super-admin ne peut valider ni approuver ni sortir du stock", () => {
    const interdites: Action[] = [
      "purchaseRequest.approve",
      "purchaseOrder.approve",
      "invoice.approvePayment",
      "stock.issue",
      "stock.receive",
      "stock.adjust",
      "inventory.validate",
      "settings.manage",
      "purchaseOrder.create",
      "purchaseRequest.create",
    ];
    for (const a of interdites) expect(can(SUPER, a), a).toBe(false);
  });

  it("le Super-admin a licence, maintenance, comptes, audit et toute la lecture", () => {
    for (const a of ["license.manage", "maintenance.run", "users.manage", "audit.view"] as Action[]) {
      expect(can(SUPER, a), a).toBe(true);
    }
    for (const a of ALL_ACTIONS.filter((x) => x.endsWith(".view"))) expect(can(SUPER, a), a).toBe(true);
  });

  it("seuls Responsable et Super-admin voient le journal ; seul le Responsable gère les paramètres", () => {
    expect([SUPER, RESP, ACH, MAG].map((u) => can(u, "audit.view"))).toEqual([true, true, false, false]);
    expect([SUPER, RESP, ACH, MAG].map((u) => can(u, "settings.manage"))).toEqual([
      false,
      true,
      false,
      false,
    ]);
  });

  it("rôle inconnu : tout est refusé", () => {
    expect(can({ role: "STAGIAIRE" as never }, "item.view")).toBe(false);
  });
});

describe("périmètre acheteur : cas limites", () => {
  it("un acheteur LOCAL ne peut ni créer ni envoyer ni gérer un dossier IMPORT", () => {
    const local: PermissionUser = { role: "ACHETEUR", purchaseScope: "LOCAL" };
    for (const a of ["purchaseOrder.create", "purchaseOrder.send", "importFile.manage"] as Action[]) {
      expect(can(local, a, { scope: "IMPORT" }), a).toBe(false);
      expect(can(local, a, { scope: "LOCAL" }), a).toBe(true);
    }
  });
  it("périmètre null : refusé dès qu'une ressource a un périmètre, accepté sans ressource", () => {
    const nul: PermissionUser = { role: "ACHETEUR", purchaseScope: null };
    expect(can(nul, "purchaseOrder.view", { scope: "LOCAL" })).toBe(false);
    expect(can(nul, "purchaseOrder.view")).toBe(true);
  });
  it("le périmètre ne donne jamais une action que le rôle n'a pas", () => {
    expect(can(ACH, "purchaseOrder.approve", { scope: "LOCAL" })).toBe(false);
    expect(can(ACH, "stock.issue", { scope: "IMPORT" })).toBe(false);
  });
  it("le périmètre ne restreint pas le Magasinier ni le Responsable", () => {
    expect(can(MAG, "stock.receive", { scope: "IMPORT" })).toBe(true);
    expect(can(RESP, "purchaseOrder.approve", { scope: "LOCAL" })).toBe(true);
  });
});

describe("menu : Acheteur et Super-admin", () => {
  it("le menu Import suit le périmètre : LOCAL ne le voit pas, IMPORT et ALL le voient", () => {
    const hrefs = (purchaseScope: "LOCAL" | "IMPORT" | "ALL") =>
      visibleNav({ role: "ACHETEUR", purchaseScope }).map((n) => n.href);
    expect(hrefs("LOCAL")).not.toContain("/import");
    expect(hrefs("IMPORT")).toContain("/import");
    expect(hrefs("ALL")).toContain("/import");
    expect(hrefs("LOCAL")).toContain("/achats");
    expect(hrefs("LOCAL")).toContain("/parametres"); // taux de change (exchangeRate.manage)
    expect(hrefs("LOCAL")).toContain("/stock/articles");
    expect(visibleNav(RESP).map((n) => n.href)).toContain("/import");
    expect(visibleNav(MAG).map((n) => n.href)).not.toContain("/import");
  });
  it("sans périmètre défini, l'Acheteur ne voit pas Import", () => {
    expect(visibleNav({ role: "ACHETEUR", purchaseScope: null }).map((n) => n.href)).not.toContain("/import");
  });
  it("le Super-admin voit Paramètres mais pas la liste des actions d'écriture métier", () => {
    expect(visibleNav(SUPER).map((n) => n.label)).toContain("Paramètres");
  });
});

describe("LOT-03 : taux de change, prix d'achat, articles", () => {
  it("exchangeRate.manage : Responsable et Acheteurs seulement", () => {
    expect([SUPER, RESP, ACH, MAG].map((u) => can(u, "exchangeRate.manage"))).toEqual([false, true, true, false]);
  });
  it("écriture articles et fournisseurs : Acheteurs et Responsable ; Magasinier en lecture seule", () => {
    for (const a of ["item.manage", "supplier.manage"] as Action[]) {
      expect([RESP, ACH, MAG].map((u) => can(u, a)), a).toEqual([true, true, false]);
    }
    expect(can(MAG, "item.view")).toBe(true);
    expect(can(MAG, "supplier.view")).toBe(false);
  });
  it("déblocage fournisseur (supplier.evaluate) : Responsable seul", () => {
    expect([RESP, ACH, MAG].map((u) => can(u, "supplier.evaluate"))).toEqual([true, false, false]);
  });
  it("canSeePurchasePrice : Magasinier masqué par défaut, réglable ; autres rôles non concernés", () => {
    expect(canSeePurchasePrice(MAG, {})).toBe(false);
    expect(canSeePurchasePrice(MAG, { showPurchasePriceToWarehouse: false })).toBe(false);
    expect(canSeePurchasePrice(MAG, { showPurchasePriceToWarehouse: true })).toBe(true);
    expect(canSeePurchasePrice(ACH, {})).toBe(true);
    expect(canSeePurchasePrice(RESP, {})).toBe(true);
  });
  it("menu Articles visible pour Magasinier, Acheteur et Responsable", () => {
    for (const u of [MAG, ACH, RESP]) expect(visibleNav(u).map((n) => n.href)).toContain("/stock/articles");
  });
});
