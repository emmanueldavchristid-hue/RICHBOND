import { describe, expect, it } from "vitest";
import { PR_STATUSES, type PrStatus } from "@/modules/purchase-requests/labels";
import {
  FINAL_STATUSES,
  TRANSITIONS,
  USER_ACTIONS,
  assertTransition,
  availableActions,
  checkTransition,
  type PrAction,
  type WorkflowUser,
} from "@/modules/purchase-requests/workflow";

const RESP: WorkflowUser = { id: "r1", role: "RESPONSABLE_ACHATS" };
const ACH: WorkflowUser = { id: "a1", role: "ACHETEUR", purchaseScope: "ALL" };
const ACH2: WorkflowUser = { id: "a2", role: "ACHETEUR", purchaseScope: "LOCAL" };
const MAG: WorkflowUser = { id: "m1", role: "MAGASINIER" };
const SUPER: WorkflowUser = { id: "s1", role: "SUPER_ADMIN" };

const pr = (status: PrStatus, createdById = "a1", kind: "STANDARD" | "REAPPRO" = "STANDARD") => ({ status, createdById, kind });

describe("transitions autorisées (statut x action)", () => {
  it.each([
    ["BROUILLON", "submit", ACH, "SOUMISE"],
    ["A_COMPLETER", "submit", ACH, "SOUMISE"],
    ["SOUMISE", "approve", RESP, "VALIDEE"],
    ["SOUMISE", "reject", RESP, "REFUSEE"],
    ["SOUMISE", "return", RESP, "A_COMPLETER"],
    ["BROUILLON", "cancel", ACH, "ANNULEE"],
    ["SOUMISE", "cancel", ACH, "ANNULEE"],
    ["A_COMPLETER", "cancel", ACH, "ANNULEE"],
    ["BROUILLON", "cancel", RESP, "ANNULEE"],
    ["VALIDEE", "cancel", RESP, "ANNULEE"],
    ["EN_CONSULTATION", "cancel", RESP, "ANNULEE"],
  ] as const)("%s + %s par %s -> %s", (status, action, user, to) => {
    const r = checkTransition(pr(status), action, user);
    expect(r).toMatchObject({ ok: true, to });
  });

  it("modification : brouillon et à compléter, par le créateur ou le Responsable, sans changer de statut", () => {
    for (const status of ["BROUILLON", "A_COMPLETER"] as const) {
      expect(checkTransition(pr(status), "edit", ACH)).toMatchObject({ ok: true, to: null });
      expect(checkTransition(pr(status), "edit", RESP)).toMatchObject({ ok: true, to: null });
    }
  });

  it("assignation : DA validée jusqu'à la commande partielle, Responsable seul", () => {
    for (const status of ["VALIDEE", "EN_CONSULTATION", "PARTIELLEMENT_COMMANDEE"] as const) {
      expect(checkTransition(pr(status), "assign", RESP)).toMatchObject({ ok: true, to: null });
    }
  });

  it("statuts posés par les lots BC / consultation (actions système)", () => {
    expect(checkTransition(pr("VALIDEE"), "markInConsultation", RESP)).toMatchObject({ ok: true, to: "EN_CONSULTATION" });
    expect(checkTransition(pr("EN_CONSULTATION"), "markOrdered", RESP)).toMatchObject({ ok: true, to: "COMMANDEE" });
    expect(checkTransition(pr("VALIDEE"), "markPartiallyOrdered", RESP)).toMatchObject({ ok: true, to: "PARTIELLEMENT_COMMANDEE" });
    expect(checkTransition(pr("PARTIELLEMENT_COMMANDEE"), "markOrdered", RESP)).toMatchObject({ ok: true, to: "COMMANDEE" });
    expect(checkTransition(pr("SOUMISE"), "markOrdered", RESP).ok).toBe(false);
    expect(checkTransition(pr("BROUILLON"), "markInConsultation", RESP).ok).toBe(false);
  });
});

describe("matrice exhaustive statut x action x rôle", () => {
  // Attendu écrit à la main : pour chaque statut, les actions utilisateur permises par rôle (DA créée par l'acheteur a1).
  const EXPECTED: Record<PrStatus, { RESP: PrAction[]; ACH: PrAction[]; ACH2: PrAction[]; MAG: PrAction[]; SUPER: PrAction[] }> = {
    // Brouillon d'autrui invisible (relecture LOT-04) : ni commentaire ni lecture pour un non-auteur.
    BROUILLON: {
      RESP: ["edit", "cancel", "attach"],
      ACH: ["edit", "submit", "cancel", "comment", "attach"],
      ACH2: [],
      MAG: [],
      SUPER: [],
    },
    SOUMISE: {
      RESP: ["approve", "reject", "return", "cancel", "comment", "attach"],
      ACH: ["cancel", "comment", "attach"],
      ACH2: ["comment"],
      MAG: [],
      SUPER: [],
    },
    A_COMPLETER: {
      RESP: ["edit", "cancel", "comment", "attach"],
      ACH: ["edit", "submit", "cancel", "comment", "attach"],
      ACH2: ["comment"],
      MAG: [],
      SUPER: [],
    },
    VALIDEE: { RESP: ["cancel", "assign", "comment"], ACH: ["comment"], ACH2: ["comment"], MAG: [], SUPER: [] },
    REFUSEE: { RESP: ["comment"], ACH: ["comment"], ACH2: ["comment"], MAG: [], SUPER: [] },
    EN_CONSULTATION: { RESP: ["cancel", "assign", "comment"], ACH: ["comment"], ACH2: ["comment"], MAG: [], SUPER: [] },
    PARTIELLEMENT_COMMANDEE: { RESP: ["assign", "comment"], ACH: ["comment"], ACH2: ["comment"], MAG: [], SUPER: [] },
    COMMANDEE: { RESP: ["comment"], ACH: ["comment"], ACH2: ["comment"], MAG: [], SUPER: [] },
    ANNULEE: { RESP: ["comment"], ACH: ["comment"], ACH2: ["comment"], MAG: [], SUPER: [] },
  };
  const users = { RESP, ACH, ACH2, MAG, SUPER } as const;

  for (const status of PR_STATUSES) {
    for (const [name, user] of Object.entries(users)) {
      it(`${status} / ${name}`, () => {
        const got = availableActions(pr(status), user);
        expect([...got].sort()).toEqual([...EXPECTED[status][name as keyof typeof users]].sort());
      });
    }
  }
});

describe("règles de contrôle interne", () => {
  it("le Magasinier ne peut jamais valider, refuser ni renvoyer", () => {
    for (const action of ["approve", "reject", "return"] as const) {
      expect(checkTransition(pr("SOUMISE", "m1", "REAPPRO"), action, MAG)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    }
  });

  it("un acheteur ne valide pas, même sa propre DA", () => {
    expect(checkTransition(pr("SOUMISE", "a1"), "approve", ACH)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(() => assertTransition(pr("SOUMISE", "a1"), "approve", ACH)).toThrowError(/droits/);
  });

  it("le Responsable peut valider sa propre DA : auto-validation marquée", () => {
    expect(assertTransition(pr("SOUMISE", "r1"), "approve", RESP)).toEqual({ to: "VALIDEE", autoApproved: true });
    expect(assertTransition(pr("SOUMISE", "a1"), "approve", RESP)).toEqual({ to: "VALIDEE", autoApproved: false });
  });

  it("annulation après validation : Responsable seul, même pour le créateur", () => {
    for (const status of ["VALIDEE", "EN_CONSULTATION"] as const) {
      const r = checkTransition(pr(status, "a1"), "cancel", ACH);
      expect(r).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect(checkTransition(pr(status, "a1"), "cancel", RESP).ok).toBe(true);
    }
    // une DA en cours de commande ne s'annule plus
    expect(checkTransition(pr("PARTIELLEMENT_COMMANDEE"), "cancel", RESP)).toMatchObject({ ok: false, code: "INVALID_STATUS" });
    expect(checkTransition(pr("COMMANDEE"), "cancel", RESP)).toMatchObject({ ok: false, code: "INVALID_STATUS" });
  });

  it("le Magasinier annule ses propres DA non validées, pas celles des autres ni après validation", () => {
    expect(checkTransition(pr("SOUMISE", "m1", "REAPPRO"), "cancel", MAG).ok).toBe(true);
    expect(checkTransition(pr("BROUILLON", "m1", "REAPPRO"), "cancel", MAG).ok).toBe(true);
    expect(checkTransition(pr("SOUMISE", "m2", "REAPPRO"), "cancel", MAG)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(checkTransition(pr("VALIDEE", "m1", "REAPPRO"), "cancel", MAG)).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("seul le créateur soumet (pas même le Responsable pour la DA d'un autre)", () => {
    expect(checkTransition(pr("BROUILLON", "a1"), "submit", ACH2)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(checkTransition(pr("BROUILLON", "a1"), "submit", RESP)).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("états finaux immuables : aucune transition de statut ni modification", () => {
    for (const status of FINAL_STATUSES) {
      for (const user of [RESP, ACH, MAG]) {
        for (const action of USER_ACTIONS.filter((a) => a !== "comment")) {
          expect(checkTransition(pr(status), action, user).ok, `${status}/${action}`).toBe(false);
        }
      }
      for (const action of ["markInConsultation", "markPartiallyOrdered", "markOrdered"] as const) {
        expect(checkTransition(pr(status), action, RESP).ok).toBe(false);
      }
    }
  });

  it("aucune règle ne sort d'un état final", () => {
    for (const rules of Object.values(TRANSITIONS)) {
      for (const rule of rules) {
        if (rule.to === null) continue;
        for (const final of FINAL_STATUSES) expect(rule.from).not.toContain(final);
      }
    }
  });

  it("A_COMPLETER -> SOUMISE est autorisée (le numéro est conservé par le service)", () => {
    expect(assertTransition(pr("A_COMPLETER", "a1"), "submit", ACH)).toMatchObject({ to: "SOUMISE" });
  });

  it("DA déjà décidée : statut invalide (et non droit manquant)", () => {
    expect(checkTransition(pr("VALIDEE"), "approve", RESP)).toMatchObject({ ok: false, code: "INVALID_STATUS" });
    expect(checkTransition(pr("REFUSEE"), "reject", RESP)).toMatchObject({ ok: false, code: "INVALID_STATUS" });
    expect(() => assertTransition(pr("BROUILLON"), "approve", RESP)).toThrowError(/à valider/);
  });

  it("le Super-admin ne peut rien faire sur les DA", () => {
    for (const status of PR_STATUSES) expect(availableActions(pr(status), SUPER)).toEqual([]);
  });

  it("commentaire : le Magasinier ne commente que les DA qu'il peut voir (siennes ou réappro)", () => {
    expect(checkTransition(pr("SOUMISE", "a1", "STANDARD"), "comment", MAG)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(checkTransition(pr("SOUMISE", "m2", "REAPPRO"), "comment", MAG).ok).toBe(true);
  });
});
