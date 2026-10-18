import { describe, expect, it } from "vitest";
import {
  ALL_ACTIONS,
  PERMISSIONS,
  SUPER_ADMIN_ACTIONS,
  can,
  requireAction,
  roleLabel,
  visibleNav,
  type Action,
  type PermissionUser,
} from "@/lib/permissions";

const SUPER: PermissionUser = { role: "SUPER_ADMIN" };
const RESP: PermissionUser = { role: "RESPONSABLE_ACHATS" };
const LOCAL: PermissionUser = { role: "ACHETEUR", purchaseScope: "LOCAL" };
const IMPORT: PermissionUser = { role: "ACHETEUR", purchaseScope: "IMPORT" };
const ALL: PermissionUser = { role: "ACHETEUR", purchaseScope: "ALL" };
const MAG: PermissionUser = { role: "MAGASINIER" };

const SENSITIVE: Action[] = [
  "purchaseRequest.approve",
  "purchaseOrder.approve",
  "invoice.approvePayment",
  "stock.issue",
  "inventory.validate",
  "settings.manage",
  "users.manage",
  "license.manage",
  "price.viewPurchase",
];

// [rôle, [super, resp, acheteur, magasinier]]
const EXPECTED: Record<string, [boolean, boolean, boolean, boolean]> = {
  "purchaseRequest.approve": [false, true, false, false],
  "purchaseOrder.approve": [false, true, false, false],
  "invoice.approvePayment": [false, true, false, false],
  "stock.issue": [false, true, false, true],
  "inventory.validate": [false, true, false, false],
  "settings.manage": [false, true, false, false],
  "users.manage": [true, true, false, false],
  "license.manage": [true, false, false, false],
  "price.viewPurchase": [true, true, true, false],
};

describe("matrice des permissions", () => {
  const roles = [SUPER, RESP, LOCAL, MAG];
  const names = ["SUPER_ADMIN", "RESPONSABLE_ACHATS", "ACHETEUR", "MAGASINIER"];
  it.each(SENSITIVE.flatMap((a) => roles.map((r, i) => [a, names[i], r, EXPECTED[a][i]] as const)))(
    "%s pour %s => %s",
    (action, _name, user, expected) => {
      expect(can(user, action as Action)).toBe(expected);
    },
  );

  it("le Responsable a tout sauf licence et maintenance", () => {
    const missing = ALL_ACTIONS.filter((a) => !can(RESP, a));
    expect(missing.sort()).toEqual(["license.manage", "maintenance.run"]);
  });

  it("l'acheteur ne valide ni DA ni BC ni paiement", () => {
    for (const a of ["purchaseRequest.approve", "purchaseOrder.approve", "invoice.approvePayment"] as Action[]) {
      expect(can(ALL, a)).toBe(false);
    }
    expect(can(LOCAL, "purchaseOrder.create")).toBe(true);
    expect(can(LOCAL, "purchaseOrder.send")).toBe(true);
  });

  it("le magasinier voit le PMP mais pas les prix d'achat", () => {
    expect(can(MAG, "price.viewPmp")).toBe(true);
    expect(can(MAG, "price.viewPurchase")).toBe(false);
    expect(can(MAG, "purchaseRequest.createReplenishment")).toBe(true);
    expect(can(MAG, "purchaseRequest.create")).toBe(false);
  });

  it("périmètre acheteur LOCAL / IMPORT / ALL", () => {
    expect(can(LOCAL, "purchaseOrder.create", { scope: "LOCAL" })).toBe(true);
    expect(can(LOCAL, "purchaseOrder.create", { scope: "IMPORT" })).toBe(false);
    expect(can(IMPORT, "purchaseOrder.create", { scope: "IMPORT" })).toBe(true);
    expect(can(IMPORT, "purchaseOrder.create", { scope: "LOCAL" })).toBe(false);
    expect(can(ALL, "purchaseOrder.create", { scope: "LOCAL" })).toBe(true);
    expect(can(ALL, "purchaseOrder.create", { scope: "IMPORT" })).toBe(true);
    expect(can({ role: "ACHETEUR" }, "purchaseOrder.create", { scope: "LOCAL" })).toBe(false);
    expect(can(RESP, "purchaseOrder.create", { scope: "IMPORT" })).toBe(true);
  });

  it("chaque action appartient à au moins un rôle", () => {
    for (const a of ALL_ACTIONS) {
      const owners = Object.values(PERMISSIONS).filter((s) => s.has(a));
      expect(owners.length, a).toBeGreaterThan(0);
    }
  });

  it("le super-admin n'a aucune action métier d'écriture", () => {
    const writes = SUPER_ADMIN_ACTIONS.filter(
      (a) => !a.endsWith(".view") && !a.startsWith("report.") && !a.startsWith("price."),
    );
    expect(writes.sort()).toEqual(["license.manage", "maintenance.run", "sage.sync", "users.manage"]);
  });

  it("requireAction lève FORBIDDEN en français", () => {
    expect(() => requireAction(MAG, "users.manage")).toThrow("Vous n'avez pas les droits pour cette action.");
    expect(() => requireAction(RESP, "users.manage")).not.toThrow();
  });
});

describe("menu par rôle", () => {
  const labels = (u: PermissionUser) => visibleNav(u).map((n) => n.label);
  it("Responsable : tout", () => {
    expect(labels(RESP)).toEqual(["Accueil", "Achats", "Import", "Stock", "Fournisseurs", "Rapports", "Paramètres"]);
  });
  it("Acheteur", () => {
    expect(labels(LOCAL)).toEqual(["Accueil", "Achats", "Import", "Stock", "Fournisseurs", "Rapports"]);
  });
  it("Magasinier : Accueil, Achats, Stock, Rapports", () => {
    expect(labels(MAG)).toEqual(["Accueil", "Achats", "Stock", "Rapports"]);
  });
  it("Super-admin : consultation + Paramètres", () => {
    expect(labels(SUPER)).toContain("Paramètres");
  });
});

describe("libellés de rôle", () => {
  it("affiche le périmètre de l'acheteur", () => {
    expect(roleLabel(LOCAL)).toBe("Acheteur (local)");
    expect(roleLabel(IMPORT)).toBe("Acheteur (import)");
    expect(roleLabel(RESP)).toBe("Responsable Achats");
  });
});
