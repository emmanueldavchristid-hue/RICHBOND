import { BusinessError } from "@/lib/errors";
import type { PoType } from "./labels";

/** Règles métier pures des BC (dates, conditions import, contrôles avant soumission). */

/** La date de livraison demandée ne peut pas être dans le passé (jour d'Abidjan, ISO `yyyy-MM-dd`). */
export function assertRequestedDateNotPast(requestedDate: string, today: string): void {
  if (requestedDate < today) {
    throw new BusinessError("REQUESTED_DATE_PAST", "La date de livraison demandée ne peut pas être dans le passé.");
  }
}

/** La date d'envoi (ou de relance) ne peut pas être dans le futur. */
export function assertNotFuture(day: string, today: string, label = "La date d'envoi"): void {
  if (day > today) throw new BusinessError("DATE_FUTURE", `${label} ne peut pas être dans le futur.`);
}

/** D18 : la date promise ne peut pas précéder la date du bon (jour de validation). */
export function assertPromisedDate(promisedDate: string, orderDate: string): void {
  if (promisedDate < orderDate) {
    throw new BusinessError("PROMISED_DATE_BEFORE_ORDER", "La date promise ne peut pas être antérieure à la date du bon de commande.");
  }
}

/** D11 : un BC import porte un incoterm et son lieu (ex. FOB Shanghai). Renvoie le message d'erreur, ou null. */
export function importTermsProblem(type: PoType, incoterm: string | null | undefined, place: string | null | undefined): string | null {
  if (type !== "IMPORT") return null;
  if (!incoterm) return "Un bon de commande import exige un incoterm (FOB, CIF…).";
  const p = (place ?? "").trim();
  if (p.length < 2 || p.length > 100) return "Un bon de commande import exige le lieu de l'incoterm (2 à 100 caractères, ex. Shanghai).";
  return null;
}

/** Nombre, chaîne numérique ou Decimal. */
export type NumLike = string | number | { toString(): string };

export interface SubmissionCheck {
  type: PoType;
  incoterm: string | null;
  incotermPlace: string | null;
  deliveryAddress: string;
  lines: { lineNo?: number; quantity: NumLike; unitPrice: NumLike }[];
}

/** Ce qui manque pour soumettre un BC (liste de messages ; vide = prêt). */
export function submissionProblems(o: SubmissionCheck): string[] {
  const problems: string[] = [];
  if (o.lines.length === 0) problems.push("Ajoutez au moins une ligne avant de soumettre le bon de commande.");
  o.lines.forEach((l, i) => {
    const n = l.lineNo ?? i + 1;
    if (Number(String(l.quantity)) <= 0) problems.push(`Ligne ${n} : la quantité doit être supérieure à 0.`);
    if (!(Number(String(l.unitPrice)) > 0)) problems.push(`Ligne ${n} : saisissez le prix unitaire.`);
  });
  const imp = importTermsProblem(o.type, o.incoterm, o.incotermPlace);
  if (imp) problems.push(imp);
  if (o.deliveryAddress.trim().length < 5) problems.push("Renseignez l'adresse de livraison (ou celle du dépôt dans Paramètres > Dépôts).");
  return problems;
}

/** Soumission impossible : lève la première anomalie (`NOT_SUBMITTABLE` ; `NO_LINES` sans ligne). */
export function assertSubmittable(o: SubmissionCheck): void {
  const problems = submissionProblems(o);
  if (problems.length === 0) return;
  throw new BusinessError(o.lines.length === 0 ? "NO_LINES" : "NOT_SUBMITTABLE", problems[0]);
}
