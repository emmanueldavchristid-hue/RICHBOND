import { BusinessError } from "@/lib/errors";
import { can, canViewRequest, type RequestActor } from "@/lib/permissions";
import type { PrKind, PrStatus } from "./labels";

/**
 * Machine d'états des DA (fichier pur : aucune base, aucune horloge).
 * Toute transition de statut du service passe par `assertTransition`.
 */
export type PrAction =
  | "edit"
  | "submit"
  | "approve"
  | "reject"
  | "return"
  | "cancel"
  | "assign"
  | "comment"
  | "attach"
  // Actions système (posées par les lots BC / consultation, jamais proposées en bouton)
  | "markInConsultation"
  | "markPartiallyOrdered"
  | "markOrdered";

export type WorkflowUser = RequestActor;

export interface WorkflowRequest {
  status: PrStatus;
  createdById: string;
  kind: PrKind;
}

type Who =
  | "creator" // créateur seul
  | "creatorOrResponsable"
  | "responsable" // Responsable Achats seul
  | "approver" // droit purchaseRequest.approve
  | "reader" // tout lecteur de la DA ayant un droit d'écriture DA
  | "system";

interface Rule {
  from: readonly PrStatus[];
  /** Statut d'arrivée ; null = le statut ne change pas. */
  to: PrStatus | null;
  who: Who;
}

const ALL: readonly PrStatus[] = [
  "BROUILLON",
  "SOUMISE",
  "A_COMPLETER",
  "VALIDEE",
  "REFUSEE",
  "EN_CONSULTATION",
  "PARTIELLEMENT_COMMANDEE",
  "COMMANDEE",
  "ANNULEE",
];
const OPEN_ORDERING: readonly PrStatus[] = ["VALIDEE", "EN_CONSULTATION", "PARTIELLEMENT_COMMANDEE"];

/** D2 : table unique des transitions. REFUSEE, ANNULEE et COMMANDEE sont finaux. */
export const TRANSITIONS: Record<PrAction, readonly Rule[]> = {
  edit: [{ from: ["BROUILLON", "A_COMPLETER"], to: null, who: "creatorOrResponsable" }],
  submit: [{ from: ["BROUILLON", "A_COMPLETER"], to: "SOUMISE", who: "creator" }],
  approve: [{ from: ["SOUMISE"], to: "VALIDEE", who: "approver" }],
  reject: [{ from: ["SOUMISE"], to: "REFUSEE", who: "approver" }],
  return: [{ from: ["SOUMISE"], to: "A_COMPLETER", who: "approver" }],
  cancel: [
    { from: ["BROUILLON", "SOUMISE", "A_COMPLETER"], to: "ANNULEE", who: "creatorOrResponsable" },
    { from: ["VALIDEE", "EN_CONSULTATION"], to: "ANNULEE", who: "responsable" },
  ],
  assign: [{ from: OPEN_ORDERING, to: null, who: "approver" }],
  comment: [{ from: ALL, to: null, who: "reader" }],
  attach: [{ from: ["BROUILLON", "A_COMPLETER", "SOUMISE"], to: null, who: "creatorOrResponsable" }],
  markInConsultation: [{ from: ["VALIDEE"], to: "EN_CONSULTATION", who: "system" }],
  markPartiallyOrdered: [{ from: OPEN_ORDERING, to: "PARTIELLEMENT_COMMANDEE", who: "system" }],
  markOrdered: [{ from: OPEN_ORDERING, to: "COMMANDEE", who: "system" }],
};

/** Actions proposées en bouton (hors actions système). */
export const USER_ACTIONS: readonly PrAction[] = [
  "edit",
  "submit",
  "approve",
  "reject",
  "return",
  "cancel",
  "assign",
  "comment",
  "attach",
];

export const FINAL_STATUSES: readonly PrStatus[] = ["REFUSEE", "ANNULEE", "COMMANDEE"];

export type TransitionCheck =
  | { ok: true; to: PrStatus | null; autoApproved: boolean }
  | { ok: false; code: "FORBIDDEN" | "INVALID_STATUS" | "SELF_APPROVAL"; message: string };

const STATUS_MESSAGE: Partial<Record<PrAction, string>> = {
  edit: "Seule une DA en brouillon ou à compléter peut être modifiée.",
  submit: "Seule une DA en brouillon ou à compléter peut être soumise.",
  approve: "Seule une DA à valider peut être validée.",
  reject: "Seule une DA à valider peut être refusée.",
  return: "Seule une DA à valider peut être renvoyée pour complément.",
  cancel: "Cette DA ne peut plus être annulée à ce stade.",
  assign: "L'acheteur ne se change que sur une DA validée, avant sa commande complète.",
  attach: "Les pièces jointes ne se modifient plus une fois la DA décidée.",
};

const FORBIDDEN_MESSAGE = "Vous n'avez pas les droits pour cette action.";

function hasWriteRight(user: WorkflowUser): boolean {
  return (
    can(user, "purchaseRequest.create") ||
    can(user, "purchaseRequest.createReplenishment") ||
    can(user, "purchaseRequest.approve")
  );
}

/** Droit minimal du rôle pour l'action, indépendamment de la DA concernée. */
function roleAllows(action: PrAction, user: WorkflowUser): boolean {
  switch (action) {
    case "edit":
    case "submit":
    case "attach":
      return can(user, "purchaseRequest.create") || can(user, "purchaseRequest.createReplenishment");
    case "approve":
    case "reject":
    case "return":
    case "assign":
      return can(user, "purchaseRequest.approve");
    case "cancel":
      return can(user, "purchaseRequest.cancel");
    case "comment":
      return hasWriteRight(user);
    default:
      return true; // actions système
  }
}

/** Contrôle une transition sans lever d'erreur (utilisé par `assertTransition` et `availableActions`). */
export function checkTransition(pr: WorkflowRequest, action: PrAction, user: WorkflowUser): TransitionCheck {
  const rules = TRANSITIONS[action];
  const system = rules.every((r) => r.who === "system");
  if (!system && !roleAllows(action, user)) return { ok: false, code: "FORBIDDEN", message: FORBIDDEN_MESSAGE };

  const rule = rules.find((r) => r.from.includes(pr.status));
  if (!rule) {
    return {
      ok: false,
      code: "INVALID_STATUS",
      message: STATUS_MESSAGE[action] ?? "Cette action n'est pas possible dans le statut actuel de la DA.",
    };
  }

  const isCreator = pr.createdById === user.id;
  const isResponsable = user.role === "RESPONSABLE_ACHATS";
  switch (rule.who) {
    case "creator":
      if (!isCreator) return { ok: false, code: "FORBIDDEN", message: "Seul le créateur de la DA peut la soumettre." };
      break;
    case "creatorOrResponsable":
      if (!isCreator && !isResponsable) {
        return { ok: false, code: "FORBIDDEN", message: "Seul le créateur de la DA ou le Responsable Achats peut le faire." };
      }
      break;
    case "responsable":
      if (!isResponsable) {
        return {
          ok: false,
          code: "FORBIDDEN",
          message: "Après validation, seul le Responsable Achats peut annuler une DA.",
        };
      }
      break;
    case "reader":
      if (!canViewRequest(user, pr)) return { ok: false, code: "FORBIDDEN", message: FORBIDDEN_MESSAGE };
      break;
    case "approver":
    case "system":
      break;
  }

  // D3 : on ne valide jamais sa propre DA, sauf le Responsable (seul valideur) : auto-validation tracée.
  let autoApproved = false;
  if (action === "approve" && isCreator) {
    if (!isResponsable) {
      return { ok: false, code: "SELF_APPROVAL", message: "Vous ne pouvez pas valider votre propre demande d'achat." };
    }
    autoApproved = true;
  }
  return { ok: true, to: rule.to, autoApproved };
}

/** Lève `BusinessError` (FORBIDDEN, INVALID_STATUS, SELF_APPROVAL) si la transition est interdite. */
export function assertTransition(
  pr: WorkflowRequest,
  action: PrAction,
  user: WorkflowUser,
): { to: PrStatus | null; autoApproved: boolean } {
  const r = checkTransition(pr, action, user);
  if (!r.ok) throw new BusinessError(r.code, r.message);
  return { to: r.to, autoApproved: r.autoApproved };
}

/** Boutons à afficher pour cet utilisateur sur cette DA. */
export function availableActions(pr: WorkflowRequest, user: WorkflowUser): PrAction[] {
  return USER_ACTIONS.filter((a) => checkTransition(pr, a, user).ok);
}
