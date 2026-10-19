import { BusinessError } from "@/lib/errors";
import { can, canViewOrder, type Action, type RequestActor } from "@/lib/permissions";
import type { PoStatus, PoType } from "./labels";

/**
 * Machine d'états des BC (fichier pur : aucune base, aucune horloge). Toute transition du service passe par
 * `assertTransition`. Statuts finaux : CLOTURE, REFUSE, ANNULE.
 *
 * Avenant (D16) : un BC validé/envoyé/confirmé dont rien n'a été reçu repasse en BROUILLON avec `version + 1` et
 * `resumeStatus` = statut d'origine. Refusé ou abandonné, il retrouve la version précédente et ce statut.
 */
export type PoAction =
  | "edit"
  | "submit"
  | "approve"
  | "reject"
  | "return"
  | "cancel"
  | "send"
  | "confirm"
  | "changePromisedDate"
  | "remind"
  | "startAmendment"
  | "abandonAmendment"
  | "close"
  | "comment"
  | "pdf"
  // Actions système (posées par la réception, LOT-06), jamais proposées en bouton
  | "markPartiallyReceived"
  | "markReceived"
  | "markReceptionReverted";

export type WorkflowUser = RequestActor;

export interface WorkflowOrder {
  status: PoStatus;
  createdById: string;
  type: PoType;
  /** 1 = BC d'origine ; > 1 = avenant. */
  version?: number;
  /** Statut à retrouver si l'avenant en cours est refusé ou abandonné. */
  resumeStatus?: PoStatus | null;
  /** Vrai si une quantité a déjà été reçue sur au moins une ligne. */
  hasReceipts?: boolean;
}

type Who =
  | "amender" // créateur (le Responsable aussi pour un avenant)
  | "creatorOrResponsable"
  | "responsable"
  | "approver" // droit purchaseOrder.approve
  | "scoped" // quiconque a le droit de rôle dans le périmètre du BC
  | "reader"
  | "system";

interface Rule {
  from: readonly PoStatus[];
  /** Statut d'arrivée ; null = inchangé. */
  to: PoStatus | null;
  who: Who;
}

const ALL: readonly PoStatus[] = ["BROUILLON", "A_VALIDER", "VALIDE", "ENVOYE", "CONFIRME", "PARTIELLEMENT_RECU", "RECU", "CLOTURE", "REFUSE", "ANNULE"];
const RECEIVABLE: readonly PoStatus[] = ["VALIDE", "ENVOYE", "CONFIRME", "PARTIELLEMENT_RECU"];

/** D2 : table unique des transitions. */
export const TRANSITIONS: Record<PoAction, readonly Rule[]> = {
  edit: [{ from: ["BROUILLON"], to: null, who: "amender" }],
  submit: [{ from: ["BROUILLON"], to: "A_VALIDER", who: "amender" }],
  approve: [{ from: ["A_VALIDER"], to: "VALIDE", who: "approver" }],
  reject: [{ from: ["A_VALIDER"], to: "REFUSE", who: "approver" }],
  return: [{ from: ["A_VALIDER"], to: "BROUILLON", who: "approver" }],
  cancel: [
    { from: ["BROUILLON", "A_VALIDER"], to: "ANNULE", who: "creatorOrResponsable" },
    { from: ["VALIDE", "ENVOYE", "CONFIRME"], to: "ANNULE", who: "responsable" },
  ],
  send: [{ from: ["VALIDE"], to: "ENVOYE", who: "creatorOrResponsable" }],
  confirm: [{ from: ["ENVOYE"], to: "CONFIRME", who: "creatorOrResponsable" }],
  changePromisedDate: [{ from: ["CONFIRME", "PARTIELLEMENT_RECU"], to: null, who: "creatorOrResponsable" }],
  remind: [{ from: ["ENVOYE", "CONFIRME", "PARTIELLEMENT_RECU"], to: null, who: "scoped" }],
  startAmendment: [{ from: ["VALIDE", "ENVOYE", "CONFIRME"], to: "BROUILLON", who: "creatorOrResponsable" }],
  abandonAmendment: [{ from: ["BROUILLON", "A_VALIDER"], to: "VALIDE", who: "creatorOrResponsable" }],
  close: [{ from: ["RECU"], to: "CLOTURE", who: "responsable" }],
  comment: [{ from: ALL, to: null, who: "reader" }],
  pdf: [{ from: ALL, to: null, who: "reader" }],
  markPartiallyReceived: [{ from: RECEIVABLE, to: "PARTIELLEMENT_RECU", who: "system" }],
  markReceived: [{ from: RECEIVABLE, to: "RECU", who: "system" }],
  markReceptionReverted: [{ from: ["PARTIELLEMENT_RECU", "RECU"], to: null, who: "system" }],
};

/** Actions proposées en bouton (hors actions système). */
export const USER_ACTIONS: readonly PoAction[] = [
  "edit",
  "submit",
  "approve",
  "reject",
  "return",
  "cancel",
  "send",
  "confirm",
  "changePromisedDate",
  "remind",
  "startAmendment",
  "abandonAmendment",
  "close",
  "comment",
  "pdf",
];

export type TransitionCheck =
  | { ok: true; to: PoStatus | null; autoApproved: boolean }
  | { ok: false; code: "FORBIDDEN" | "INVALID_STATUS" | "SELF_APPROVAL" | "HAS_RECEIPTS"; message: string };

const FORBIDDEN_MESSAGE = "Vous n'avez pas les droits pour cette action.";

const STATUS_MESSAGE: Partial<Record<PoAction, string>> = {
  edit: "Seul un bon de commande en brouillon peut être modifié.",
  submit: "Seul un bon de commande en brouillon peut être soumis.",
  approve: "Seul un bon de commande à valider peut être validé.",
  reject: "Seul un bon de commande à valider peut être refusé.",
  return: "Seul un bon de commande à valider peut être renvoyé pour correction.",
  cancel: "Ce bon de commande ne peut plus être annulé à ce stade.",
  send: "Seul un bon de commande validé peut être marqué comme envoyé.",
  confirm: "Seul un bon de commande envoyé peut être confirmé par le fournisseur.",
  changePromisedDate: "La date promise ne se change que sur un bon confirmé ou partiellement reçu.",
  remind: "On ne relance que sur un bon envoyé, confirmé ou partiellement reçu.",
  startAmendment: "Un avenant n'est possible que sur un bon validé, envoyé ou confirmé.",
  abandonAmendment: "Aucun avenant en cours sur ce bon de commande.",
  close: "Seul un bon de commande entièrement reçu peut être clôturé.",
};

/** Droit de rôle (et périmètre) requis pour l'action, indépendamment du BC concerné. */
function roleAllows(action: PoAction, po: WorkflowOrder, user: WorkflowUser): boolean {
  const scoped = (a: Action) => can(user, a, { scope: po.type });
  switch (action) {
    case "edit":
    case "submit":
    case "startAmendment":
    case "abandonAmendment":
      return scoped("purchaseOrder.create");
    case "approve":
    case "reject":
    case "return":
    case "close":
      return can(user, "purchaseOrder.approve");
    case "cancel":
      return scoped("purchaseOrder.cancel");
    case "send":
    case "confirm":
    case "changePromisedDate":
      return scoped("purchaseOrder.send");
    case "remind":
      return scoped("purchaseOrder.remind");
    case "comment":
      return can(user, "purchaseOrder.create") || can(user, "purchaseOrder.approve") || can(user, "purchaseOrder.send");
    case "pdf":
      return can(user, "purchaseOrder.view");
    default:
      return true; // actions système
  }
}

const isAmendment = (po: WorkflowOrder) => (po.version ?? 1) > 1;

/** Contrôle une transition sans lever d'erreur (utilisé par `assertTransition` et `availableActions`). */
export function checkTransition(po: WorkflowOrder, action: PoAction, user: WorkflowUser): TransitionCheck {
  const rules = TRANSITIONS[action];
  const system = rules.every((r) => r.who === "system");
  if (!system && !roleAllows(action, po, user)) return { ok: false, code: "FORBIDDEN", message: FORBIDDEN_MESSAGE };

  const rule = rules.find((r) => r.from.includes(po.status));
  if (!rule) {
    return { ok: false, code: "INVALID_STATUS", message: STATUS_MESSAGE[action] ?? "Cette action n'est pas possible dans le statut actuel du bon de commande." };
  }

  // Règles d'avenant : l'abandon n'existe que pour un avenant, l'annulation d'un avenant passe par l'abandon.
  if (action === "abandonAmendment" && !isAmendment(po)) {
    return { ok: false, code: "INVALID_STATUS", message: STATUS_MESSAGE.abandonAmendment! };
  }
  if (action === "cancel" && isAmendment(po) && (po.status === "BROUILLON" || po.status === "A_VALIDER")) {
    return { ok: false, code: "INVALID_STATUS", message: "Un avenant ne s'annule pas : abandonnez-le pour revenir à la version précédente." };
  }
  if ((action === "cancel" || action === "startAmendment") && po.hasReceipts) {
    return {
      ok: false,
      code: "HAS_RECEIPTS",
      message:
        action === "cancel"
          ? "Des quantités ont déjà été reçues : ce bon de commande ne peut plus être annulé."
          : "Des quantités ont déjà été reçues : un avenant n'est plus possible (créez un nouveau bon pour le solde).",
    };
  }

  const isCreator = po.createdById === user.id;
  const isResponsable = user.role === "RESPONSABLE_ACHATS";
  switch (rule.who) {
    case "amender":
      if (!isCreator && !(isResponsable && isAmendment(po))) {
        return { ok: false, code: "FORBIDDEN", message: "Seul le créateur du bon de commande peut le modifier ou le soumettre." };
      }
      break;
    case "creatorOrResponsable":
      if (!isCreator && !isResponsable) {
        return { ok: false, code: "FORBIDDEN", message: "Seul le créateur du bon de commande ou le Responsable Achats peut le faire." };
      }
      break;
    case "responsable":
      if (!isResponsable) {
        return {
          ok: false,
          code: "FORBIDDEN",
          message: action === "cancel" ? "Après validation, seul le Responsable Achats peut annuler un bon de commande." : "Seul le Responsable Achats peut le faire.",
        };
      }
      break;
    case "reader":
      if (!canViewOrder(user, po)) return { ok: false, code: "FORBIDDEN", message: FORBIDDEN_MESSAGE };
      break;
    case "approver":
    case "scoped":
    case "system":
      break;
  }

  // D3 : le Responsable est le seul valideur ; valider son propre BC est permis mais marqué « auto-validé ».
  let autoApproved = false;
  if (action === "approve" && isCreator) {
    if (!isResponsable) return { ok: false, code: "SELF_APPROVAL", message: "Vous ne pouvez pas valider votre propre bon de commande." };
    autoApproved = true;
  }

  // Un avenant refusé ou abandonné retrouve le statut d'origine ; un avenant validé repart « à renvoyer » (VALIDE).
  let to = rule.to;
  if ((action === "reject" || action === "abandonAmendment") && isAmendment(po)) to = po.resumeStatus ?? "VALIDE";
  return { ok: true, to, autoApproved };
}

/** Lève `BusinessError` (FORBIDDEN, INVALID_STATUS, SELF_APPROVAL, HAS_RECEIPTS) si la transition est interdite. */
export function assertTransition(po: WorkflowOrder, action: PoAction, user: WorkflowUser): { to: PoStatus | null; autoApproved: boolean } {
  const r = checkTransition(po, action, user);
  if (!r.ok) throw new BusinessError(r.code, r.message);
  return { to: r.to, autoApproved: r.autoApproved };
}

/** Boutons à afficher pour cet utilisateur sur ce BC. */
export function availableActions(po: WorkflowOrder, user: WorkflowUser): PoAction[] {
  return USER_ACTIONS.filter((a) => checkTransition(po, a, user).ok);
}

/** D3 : sous le seuil (> 0), la soumission vaut validation. Seuil 0 = tous les BC passent par le Responsable. */
export function isUnderApprovalThreshold(totalTtcXof: number | null, threshold: number): boolean {
  return threshold > 0 && totalTtcXof !== null && totalTtcXof <= threshold;
}

export interface ReceiptLine {
  quantity: { toString(): string } | string | number;
  receivedQty: { toString(): string } | string | number;
}

/** Statut de réception d'après les quantités reçues : RECU si toutes les lignes sont soldées, PARTIELLEMENT_RECU si au moins une reçue, sinon null. */
export function receivedStatusOf(lines: ReceiptLine[]): "PARTIELLEMENT_RECU" | "RECU" | null {
  if (lines.length === 0) return null;
  const qty = (v: ReceiptLine["quantity"]) => Number(String(v));
  if (lines.every((l) => qty(l.receivedQty) >= qty(l.quantity))) return "RECU";
  if (lines.some((l) => qty(l.receivedQty) > 0)) return "PARTIELLEMENT_RECU";
  return null;
}

/** Statut à retrouver quand toutes les réceptions sont annulées : CONFIRME, sinon ENVOYE, sinon VALIDE. */
export function statusBeforeReceipts(po: { confirmedAt?: Date | null; sentAt?: Date | null }): "CONFIRME" | "ENVOYE" | "VALIDE" {
  return po.confirmedAt ? "CONFIRME" : po.sentAt ? "ENVOYE" : "VALIDE";
}
