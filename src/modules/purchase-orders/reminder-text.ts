import { formatDateOnly } from "@/lib/dates";
import { formatQty } from "@/lib/money";

/** D20 : texte de relance en français, prêt à coller dans un e-mail ou un message WhatsApp (fichier pur). */
export interface ReminderLine {
  /** « CODE – désignation » ou désignation libre. */
  designation: string;
  /** Quantité restant à recevoir. */
  remainingQty: string | number;
  unit: string;
}

export interface ReminderInput {
  /** « BC-2026-00042 » (ou « BC-2026-00042 v2 »). */
  orderNumber: string;
  /** Date du bon (validation). */
  orderDate: Date;
  contactName?: string | null;
  /** Date de livraison attendue (promise, sinon demandée). */
  expectedDate: Date;
  daysLate: number;
  lines: ReminderLine[];
  buyerName: string;
  companyName: string;
}

export function reminderText(i: ReminderInput): string {
  const greeting = i.contactName ? `Bonjour ${i.contactName},` : "Bonjour,";
  const expected = formatDateOnly(i.expectedDate);
  const status =
    i.daysLate > 0
      ? `La livraison était attendue le ${expected}, soit ${i.daysLate} jour${i.daysLate > 1 ? "s" : ""} de retard.`
      : `La livraison est attendue le ${expected}.`;
  const lines = i.lines
    .filter((l) => Number(l.remainingQty) > 0)
    .map((l) => `- ${l.designation} : ${formatQty(l.remainingQty)} ${l.unit}`);
  return [
    greeting,
    "",
    `Nous revenons vers vous au sujet de notre bon de commande ${i.orderNumber} du ${formatDateOnly(i.orderDate)}.`,
    status,
    ...(lines.length ? ["", "Reste à livrer :", ...lines] : []),
    "",
    "Pouvez-vous nous confirmer la date de livraison ? Merci d'avance.",
    "",
    "Cordialement,",
    i.buyerName,
    i.companyName,
  ].join("\n");
}

/** Numéro WhatsApp international sans « + » ni séparateurs (Côte d'Ivoire : indicatif 225 ajouté aux numéros locaux de 10 chiffres) ; null si inexploitable. */
export function whatsappNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (/^\d{10}$/.test(digits)) digits = `225${digits}`;
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

/** Lien `wa.me` avec le texte pré-rempli ; null sans numéro exploitable. */
export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const n = whatsappNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}

/** Lien `mailto:` avec objet et corps pré-remplis ; null sans adresse. */
export function mailtoLink(email: string | null | undefined, subject: string, text: string): string | null {
  if (!email) return null;
  return `mailto:${encodeURIComponent(email).replace(/%40/g, "@")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
}

export interface SendTextInput {
  orderNumber: string;
  contactName?: string | null;
  /** Date de livraison demandée. */
  requestedDate: Date;
  buyerName: string;
  companyName: string;
}

/** D17 : texte d'accompagnement de l'envoi du PDF au fournisseur (copiable ; aucun envoi réel avant LOT-16). */
export function sendText(i: SendTextInput): string {
  return [
    i.contactName ? `Bonjour ${i.contactName},` : "Bonjour,",
    "",
    `Veuillez trouver ci-joint notre bon de commande ${i.orderNumber}.`,
    `Livraison demandée le ${formatDateOnly(i.requestedDate)}.`,
    "",
    "Merci de nous confirmer la bonne réception de ce bon et la date de livraison prévue.",
    "",
    "Cordialement,",
    i.buyerName,
    i.companyName,
  ].join("\n");
}
