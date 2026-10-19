import { describe, expect, it } from "vitest";
import { canEditOrder, canViewOrder } from "@/lib/permissions";
import { PO_FINAL_STATUSES, PO_STATUSES, displayOrderNumber, orderPdfFileName, type PoStatus } from "@/modules/purchase-orders/labels";
import {
  TRANSITIONS,
  USER_ACTIONS,
  assertTransition,
  availableActions,
  checkTransition,
  isUnderApprovalThreshold,
  receivedStatusOf,
  statusBeforeReceipts,
  type PoAction,
  type WorkflowOrder,
  type WorkflowUser,
} from "@/modules/purchase-orders/workflow";

const RESP: WorkflowUser = { id: "r1", role: "RESPONSABLE_ACHATS" };
const ACH: WorkflowUser = { id: "a1", role: "ACHETEUR", purchaseScope: "ALL" };
const ACH_LOCAL: WorkflowUser = { id: "a2", role: "ACHETEUR", purchaseScope: "LOCAL" };
const MAG: WorkflowUser = { id: "m1", role: "MAGASINIER" };
const SUPER: WorkflowUser = { id: "s1", role: "SUPER_ADMIN" };

const po = (status: PoStatus, over: Partial<WorkflowOrder> = {}): WorkflowOrder => ({ status, createdById: "a1", type: "LOCAL", version: 1, ...over });

describe("transitions autorisées (statut x action)", () => {
  it.each([
    ["BROUILLON", "submit", ACH, "A_VALIDER"],
    ["A_VALIDER", "approve", RESP, "VALIDE"],
    ["A_VALIDER", "reject", RESP, "REFUSE"],
    ["A_VALIDER", "return", RESP, "BROUILLON"],
    ["BROUILLON", "cancel", ACH, "ANNULE"],
    ["A_VALIDER", "cancel", ACH, "ANNULE"],
    ["BROUILLON", "cancel", RESP, "ANNULE"],
    ["VALIDE", "cancel", RESP, "ANNULE"],
    ["ENVOYE", "cancel", RESP, "ANNULE"],
    ["CONFIRME", "cancel", RESP, "ANNULE"],
    ["VALIDE", "send", ACH, "ENVOYE"],
    ["VALIDE", "send", RESP, "ENVOYE"],
    ["ENVOYE", "confirm", ACH, "CONFIRME"],
    ["VALIDE", "startAmendment", ACH, "BROUILLON"],
    ["ENVOYE", "startAmendment", RESP, "BROUILLON"],
    ["CONFIRME", "startAmendment", ACH, "BROUILLON"],
    ["RECU", "close", RESP, "CLOTURE"],
  ] as const)("%s + %s par %s -> %s", (status, action, user, to) => {
    expect(checkTransition(po(status), action, user)).toMatchObject({ ok: true, to });
  });

  it("actions sans changement de statut : modification, report de date, relance, commentaire, PDF", () => {
    expect(checkTransition(po("BROUILLON"), "edit", ACH)).toMatchObject({ ok: true, to: null });
    for (const s of ["CONFIRME", "PARTIELLEMENT_RECU"] as const) {
      expect(checkTransition(po(s), "changePromisedDate", ACH)).toMatchObject({ ok: true, to: null });
    }
    for (const s of ["ENVOYE", "CONFIRME", "PARTIELLEMENT_RECU"] as const) {
      expect(checkTransition(po(s), "remind", ACH)).toMatchObject({ ok: true, to: null });
    }
    for (const s of PO_STATUSES) {
      // Le brouillon d'autrui reste invisible, donc sans PDF.
      expect(checkTransition(po(s), "pdf", RESP).ok, `pdf ${s}`).toBe(s !== "BROUILLON");
    }
    expect(checkTransition(po("BROUILLON", { createdById: "r1" }), "pdf", RESP).ok).toBe(true);
  });

  it("la réception pose RECU / PARTIELLEMENT_RECU (actions système)", () => {
    expect(checkTransition(po("CONFIRME"), "markPartiallyReceived", RESP)).toMatchObject({ ok: true, to: "PARTIELLEMENT_RECU" });
    expect(checkTransition(po("PARTIELLEMENT_RECU"), "markReceived", RESP)).toMatchObject({ ok: true, to: "RECU" });
    expect(checkTransition(po("VALIDE"), "markReceived", RESP)).toMatchObject({ ok: true, to: "RECU" });
    expect(checkTransition(po("RECU"), "markReceptionReverted", RESP).ok).toBe(true);
    for (const s of ["BROUILLON", "A_VALIDER", "CLOTURE", "REFUSE", "ANNULE"] as const) {
      expect(checkTransition(po(s), "markReceived", RESP).ok, s).toBe(false);
    }
  });
});

describe("matrice exhaustive statut x action x rôle (BC créé par a1, local)", () => {
  const EXPECTED: Record<PoStatus, Record<"RESP" | "ACH" | "ACH2" | "MAG" | "SUPER", PoAction[]>> = {
    // Brouillon d'autrui invisible : ni commentaire ni PDF pour un non-auteur.
    BROUILLON: { RESP: ["cancel"], ACH: ["edit", "submit", "cancel", "comment", "pdf"], ACH2: [], MAG: [], SUPER: [] },
    A_VALIDER: { RESP: ["approve", "reject", "return", "cancel", "comment", "pdf"], ACH: ["cancel", "comment", "pdf"], ACH2: ["comment", "pdf"], MAG: [], SUPER: ["pdf"] },
    VALIDE: { RESP: ["cancel", "send", "startAmendment", "comment", "pdf"], ACH: ["send", "startAmendment", "comment", "pdf"], ACH2: ["comment", "pdf"], MAG: [], SUPER: ["pdf"] },
    ENVOYE: { RESP: ["cancel", "confirm", "remind", "startAmendment", "comment", "pdf"], ACH: ["confirm", "remind", "startAmendment", "comment", "pdf"], ACH2: ["remind", "comment", "pdf"], MAG: [], SUPER: ["pdf"] },
    CONFIRME: { RESP: ["cancel", "changePromisedDate", "remind", "startAmendment", "comment", "pdf"], ACH: ["changePromisedDate", "remind", "startAmendment", "comment", "pdf"], ACH2: ["remind", "comment", "pdf"], MAG: [], SUPER: ["pdf"] },
    PARTIELLEMENT_RECU: { RESP: ["changePromisedDate", "remind", "comment", "pdf"], ACH: ["changePromisedDate", "remind", "comment", "pdf"], ACH2: ["remind", "comment", "pdf"], MAG: [], SUPER: ["pdf"] },
    RECU: { RESP: ["close", "comment", "pdf"], ACH: ["comment", "pdf"], ACH2: ["comment", "pdf"], MAG: [], SUPER: ["pdf"] },
    CLOTURE: { RESP: ["comment", "pdf"], ACH: ["comment", "pdf"], ACH2: ["comment", "pdf"], MAG: [], SUPER: ["pdf"] },
    REFUSE: { RESP: ["comment", "pdf"], ACH: ["comment", "pdf"], ACH2: ["comment", "pdf"], MAG: [], SUPER: ["pdf"] },
    ANNULE: { RESP: ["comment", "pdf"], ACH: ["comment", "pdf"], ACH2: ["comment", "pdf"], MAG: [], SUPER: ["pdf"] },
  };
  const users = { RESP, ACH, ACH2: ACH_LOCAL, MAG, SUPER } as const;
  for (const status of PO_STATUSES) {
    for (const [name, user] of Object.entries(users)) {
      it(`${status} / ${name}`, () => {
        const got = availableActions(po(status), user);
        expect([...got].sort()).toEqual([...EXPECTED[status][name as keyof typeof users]].sort());
      });
    }
  }
});

describe("contrôle interne", () => {
  it("un acheteur ne valide jamais, même son propre BC ; le Responsable seul valide", () => {
    expect(checkTransition(po("A_VALIDER"), "approve", ACH)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(checkTransition(po("A_VALIDER"), "reject", ACH)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(checkTransition(po("A_VALIDER"), "return", ACH)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(() => assertTransition(po("A_VALIDER"), "approve", MAG)).toThrowError(/droits/);
  });

  it("auto-validation du Responsable : permise et marquée", () => {
    expect(assertTransition(po("A_VALIDER", { createdById: "r1" }), "approve", RESP)).toEqual({ to: "VALIDE", autoApproved: true });
    expect(assertTransition(po("A_VALIDER", { createdById: "a1" }), "approve", RESP)).toEqual({ to: "VALIDE", autoApproved: false });
  });

  it("annulation après validation : Responsable seul, même pour le créateur", () => {
    for (const s of ["VALIDE", "ENVOYE", "CONFIRME"] as const) {
      expect(checkTransition(po(s), "cancel", ACH)).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect(checkTransition(po(s), "cancel", RESP).ok).toBe(true);
    }
  });

  it("annulation interdite dès qu'une quantité a été reçue, avenant aussi", () => {
    expect(checkTransition(po("CONFIRME", { hasReceipts: true }), "cancel", RESP)).toMatchObject({ ok: false, code: "HAS_RECEIPTS" });
    expect(checkTransition(po("CONFIRME", { hasReceipts: true }), "startAmendment", RESP)).toMatchObject({ ok: false, code: "HAS_RECEIPTS" });
    expect(checkTransition(po("PARTIELLEMENT_RECU"), "cancel", RESP)).toMatchObject({ ok: false, code: "INVALID_STATUS" });
    expect(checkTransition(po("PARTIELLEMENT_RECU"), "startAmendment", RESP)).toMatchObject({ ok: false, code: "INVALID_STATUS" });
  });

  it("l'acheteur annule seulement ses BC non validés, dans son périmètre", () => {
    expect(checkTransition(po("A_VALIDER"), "cancel", ACH).ok).toBe(true);
    expect(checkTransition(po("A_VALIDER", { createdById: "a9" }), "cancel", ACH)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(checkTransition(po("A_VALIDER", { type: "IMPORT" }), "cancel", ACH_LOCAL)).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("périmètre : l'acheteur local ne touche pas à un BC import (envoi, relance, avenant)", () => {
    const imp = (s: PoStatus) => po(s, { type: "IMPORT", createdById: "a2" });
    expect(checkTransition(imp("VALIDE"), "send", ACH_LOCAL)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(checkTransition(imp("ENVOYE"), "remind", ACH_LOCAL)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(checkTransition(imp("VALIDE"), "startAmendment", ACH_LOCAL)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(checkTransition(imp("BROUILLON"), "submit", ACH_LOCAL)).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("relance : créateur, autre acheteur du périmètre, Responsable ; envoi/confirmation : créateur ou Responsable", () => {
    const other = { ...ACH, id: "a7" };
    expect(checkTransition(po("ENVOYE"), "remind", other).ok).toBe(true);
    expect(checkTransition(po("ENVOYE"), "confirm", other)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(checkTransition(po("VALIDE"), "send", other)).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("seul le créateur soumet ou modifie un BC (pas le Responsable pour le brouillon d'un autre)", () => {
    expect(checkTransition(po("BROUILLON"), "submit", RESP)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(checkTransition(po("BROUILLON"), "edit", RESP)).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("clôture : Responsable seul, depuis RECU seulement", () => {
    expect(checkTransition(po("RECU"), "close", ACH)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(checkTransition(po("PARTIELLEMENT_RECU"), "close", RESP)).toMatchObject({ ok: false, code: "INVALID_STATUS" });
  });

  it("états finaux immuables : aucune transition ni modification", () => {
    for (const status of PO_FINAL_STATUSES) {
      for (const user of [RESP, ACH, MAG]) {
        for (const action of USER_ACTIONS.filter((a) => a !== "comment" && a !== "pdf")) {
          expect(checkTransition(po(status), action, user).ok, `${status}/${action}`).toBe(false);
        }
      }
      for (const action of ["markPartiallyReceived", "markReceived", "markReceptionReverted"] as const) {
        expect(checkTransition(po(status), action, RESP).ok).toBe(false);
      }
    }
    for (const rules of Object.values(TRANSITIONS)) {
      for (const rule of rules) {
        if (rule.to === null) continue;
        for (const final of PO_FINAL_STATUSES) expect(rule.from).not.toContain(final);
      }
    }
  });

  it("le Magasinier n'a aucune action sur un BC (aucun accès avant le LOT-06)", () => {
    for (const s of PO_STATUSES) expect(availableActions(po(s, { createdById: "m1" }), MAG)).toEqual([]);
  });
});

describe("avenant (D16)", () => {
  const amend = (status: PoStatus, resume: PoStatus = "ENVOYE") => po(status, { version: 2, resumeStatus: resume });

  it("seul un avenant s'abandonne ; il retrouve son statut d'origine", () => {
    expect(checkTransition(po("BROUILLON"), "abandonAmendment", ACH)).toMatchObject({ ok: false, code: "INVALID_STATUS" });
    expect(checkTransition(amend("BROUILLON", "CONFIRME"), "abandonAmendment", ACH)).toMatchObject({ ok: true, to: "CONFIRME" });
    expect(checkTransition(amend("A_VALIDER", "VALIDE"), "abandonAmendment", RESP)).toMatchObject({ ok: true, to: "VALIDE" });
  });

  it("un avenant refusé retrouve le statut d'origine (pas REFUSE) ; validé il repart VALIDE", () => {
    expect(checkTransition(amend("A_VALIDER", "ENVOYE"), "reject", RESP)).toMatchObject({ ok: true, to: "ENVOYE" });
    expect(checkTransition(amend("A_VALIDER", "ENVOYE"), "approve", RESP)).toMatchObject({ ok: true, to: "VALIDE" });
  });

  it("un avenant ne s'annule pas : il s'abandonne", () => {
    expect(checkTransition(amend("BROUILLON"), "cancel", ACH)).toMatchObject({ ok: false, code: "INVALID_STATUS" });
    expect(checkTransition(amend("A_VALIDER"), "cancel", RESP)).toMatchObject({ ok: false, code: "INVALID_STATUS" });
  });

  it("le Responsable peut modifier, soumettre ou abandonner l'avenant d'un acheteur", () => {
    expect(checkTransition(amend("BROUILLON"), "edit", RESP).ok).toBe(true);
    expect(checkTransition(amend("BROUILLON"), "submit", RESP).ok).toBe(true);
    expect(checkTransition(amend("BROUILLON"), "abandonAmendment", RESP).ok).toBe(true);
  });
});

describe("règles pures complémentaires", () => {
  it("seuil de validation (D3) : 0 = désactivé, sinon inclusif ; sans montant FCFA, jamais", () => {
    expect(isUnderApprovalThreshold(500_000, 0)).toBe(false);
    expect(isUnderApprovalThreshold(500_000, 500_000)).toBe(true);
    expect(isUnderApprovalThreshold(500_001, 500_000)).toBe(false);
    expect(isUnderApprovalThreshold(null, 500_000)).toBe(false);
  });

  it("statut de réception d'après les quantités reçues", () => {
    expect(receivedStatusOf([])).toBeNull();
    expect(receivedStatusOf([{ quantity: "10", receivedQty: "0" }])).toBeNull();
    expect(receivedStatusOf([{ quantity: "10", receivedQty: "4" }, { quantity: 5, receivedQty: 5 }])).toBe("PARTIELLEMENT_RECU");
    expect(receivedStatusOf([{ quantity: "10", receivedQty: "10" }, { quantity: 5, receivedQty: 7 }])).toBe("RECU");
  });

  it("statut avant réception : CONFIRME, ENVOYE ou VALIDE", () => {
    expect(statusBeforeReceipts({ confirmedAt: new Date(), sentAt: new Date() })).toBe("CONFIRME");
    expect(statusBeforeReceipts({ sentAt: new Date() })).toBe("ENVOYE");
    expect(statusBeforeReceipts({})).toBe("VALIDE");
  });

  it("numéro affiché et nom de fichier PDF", () => {
    expect(displayOrderNumber({ id: "clxxxxabc123", number: null })).toBe("BC-BROUILLON-ABC123");
    expect(displayOrderNumber({ id: "x", number: "BC-2026-00042", version: 1 })).toBe("BC-2026-00042");
    expect(displayOrderNumber({ id: "x", number: "BC-2026-00042", version: 2 })).toBe("BC-2026-00042 v2");
    expect(orderPdfFileName({ id: "x", number: "BC-2026-00042", version: 2 })).toBe("BC-2026-00042-v2.pdf");
    expect(orderPdfFileName({ id: "clxxxxabc123", number: null })).toBe("BC-brouillon-ABC123.pdf");
  });
});

describe("visibilité et modification (permissions)", () => {
  const ref = (status: string, over: Record<string, unknown> = {}) => ({ createdById: "a1", type: "LOCAL" as const, status, version: 1, ...over });

  it("le Magasinier ne voit aucun BC ; le Super-admin voit tout sauf les brouillons d'autrui", () => {
    expect(canViewOrder(MAG, ref("VALIDE"))).toBe(false);
    expect(canViewOrder(SUPER, ref("VALIDE"))).toBe(true);
    expect(canViewOrder(SUPER, ref("BROUILLON"))).toBe(false);
  });

  it("les acheteurs voient tous les BC (H26) ; un brouillon reste privé, sauf l'avenant pour le Responsable", () => {
    expect(canViewOrder(ACH_LOCAL, ref("VALIDE", { type: "IMPORT" }))).toBe(true);
    expect(canViewOrder(ACH_LOCAL, ref("BROUILLON"))).toBe(false);
    expect(canViewOrder(ACH, ref("BROUILLON"))).toBe(true);
    expect(canViewOrder(RESP, ref("BROUILLON"))).toBe(false);
    expect(canViewOrder(RESP, ref("BROUILLON", { version: 2 }))).toBe(true);
    expect(canViewOrder(ACH_LOCAL, ref("BROUILLON", { version: 2 }))).toBe(false);
  });

  it("modification : brouillon, créateur dans son périmètre (Responsable pour un avenant)", () => {
    expect(canEditOrder(ACH, ref("BROUILLON"))).toBe(true);
    expect(canEditOrder(ACH, ref("A_VALIDER"))).toBe(false);
    expect(canEditOrder({ ...ACH_LOCAL, id: "a1" }, ref("BROUILLON", { type: "IMPORT" }))).toBe(false);
    expect(canEditOrder(RESP, ref("BROUILLON"))).toBe(false);
    expect(canEditOrder(RESP, ref("BROUILLON", { version: 2 }))).toBe(true);
    expect(canEditOrder(MAG, ref("BROUILLON", { createdById: "m1" }))).toBe(false);
  });
});
