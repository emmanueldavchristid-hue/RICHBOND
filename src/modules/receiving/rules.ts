import { BusinessError } from "@/lib/errors";
import { diffDays } from "@/lib/dates";
import { Decimal, roundCost, roundQty, type DecimalInput } from "@/modules/stock/pmp";

/**
 * Règles métier pures des réceptions (LOT-06) : aucune base, aucune horloge (le jour courant est passé en argument).
 * Quantités saisies et comparées en unité d'achat du BC ; la conversion en unité de stock se fait par ligne.
 */

/** R2 : statuts de BC réceptionnables. Un BC « validé » non envoyé ne l'est pas. */
export const RECEIVABLE_ORDER_STATUSES = ["ENVOYE", "CONFIRME", "PARTIELLEMENT_RECU"] as const;

export function receivableProblem(status: string): { code: string; message: string } | null {
  if ((RECEIVABLE_ORDER_STATUSES as readonly string[]).includes(status)) return null;
  if (status === "VALIDE") return { code: "ORDER_NOT_SENT", message: "Le BC doit être marqué envoyé par l'acheteur avant d'être réceptionné." };
  if (status === "RECU" || status === "CLOTURE") return { code: "ORDER_NOT_RECEIVABLE", message: "Ce bon de commande est déjà entièrement reçu." };
  return { code: "ORDER_NOT_RECEIVABLE", message: "Ce bon de commande ne peut pas être réceptionné dans son statut actuel." };
}

export function assertReceivable(status: string): void {
  const p = receivableProblem(status);
  if (p) throw new BusinessError(p.code, p.message);
}

export interface QtyLine {
  quantity: DecimalInput;
  receivedQty: DecimalInput;
  closedQty?: DecimalInput;
}

const dec = (v: DecimalInput | undefined) => new Decimal(v === undefined ? 0 : String(v));

/** Restant dû d'une ligne de BC (unité d'achat) : commandé - reçu - soldé, jamais négatif. */
export function remainingQty(line: QtyLine): Decimal {
  return Decimal.max(dec(line.quantity).minus(dec(line.receivedQty)).minus(dec(line.closedQty)), new Decimal(0));
}

function allowedQty(line: QtyLine, tolerancePct: number): Decimal {
  return dec(line.quantity).minus(dec(line.closedQty)).mul(new Decimal(1).plus(new Decimal(String(tolerancePct)).div(100)));
}

/**
 * R4 : dépassement de la quantité commandée en tenant compte de la tolérance (%). Positif = sur-livraison.
 * excès = reçu + accepté - (commandé - soldé) x (1 + tolérance / 100). Tolérance 0 : excès = accepté - restant dû.
 */
export function overDeliveryExcess(line: QtyLine, accepted: DecimalInput, tolerancePct: number): Decimal {
  return roundQty(dec(line.receivedQty).plus(dec(accepted)).minus(allowedQty(line, tolerancePct)));
}

/** Quantité maximale acceptable sans accord du Responsable (unité d'achat). */
export function maxAcceptableQty(line: QtyLine, tolerancePct: number): Decimal {
  return roundQty(Decimal.max(allowedQty(line, tolerancePct).minus(dec(line.receivedQty)), new Decimal(0)));
}

/** R3 : livrée = acceptée + refusée. Renvoie le message d'erreur ou null. */
export function lineQuantityProblem(q: { delivered: DecimalInput; accepted: DecimalInput; refused: DecimalInput; refusalReason?: string | null }): string | null {
  const delivered = dec(q.delivered);
  const accepted = dec(q.accepted);
  const refused = dec(q.refused);
  if (delivered.lt(0) || accepted.lt(0) || refused.lt(0)) return "Les quantités ne peuvent pas être négatives.";
  if (!delivered.eq(accepted.plus(refused))) return "La quantité livrée doit être égale à la quantité acceptée plus la quantité refusée.";
  if (refused.gt(0) && !q.refusalReason) return "Indiquez le motif du refus.";
  return null;
}

/** Facteur unité d'achat -> unité de stock : celui du BC (quantité en stock / quantité commandée), sinon celui de l'article. */
export function stockFactor(line: { quantity: DecimalInput; stockQty?: DecimalInput | null }, itemFactor: DecimalInput | null | undefined): Decimal {
  const q = dec(line.quantity);
  if (line.stockQty !== null && line.stockQty !== undefined && q.gt(0)) {
    const f = dec(line.stockQty).div(q);
    if (f.gt(0)) return f;
  }
  const item = itemFactor === null || itemFactor === undefined ? new Decimal(1) : dec(itemFactor);
  return item.gt(0) ? item : new Decimal(1);
}

/** Quantité en unité d'achat -> unité de stock (3 décimales). */
export function toStock(qty: DecimalInput, factor: DecimalInput): Decimal {
  return roundQty(dec(qty).mul(dec(factor)));
}

/**
 * R5 : coût d'entrée en FCFA par unité de stock = montant net de ligne / quantité commandée x taux figé du BC / facteur.
 * Remise incluse, hors TVA, hors frais d'approche (LOT-12). 4 décimales.
 */
export function entryUnitCost(p: { netAmount: DecimalInput; quantity: DecimalInput; exchangeRate: DecimalInput | null | undefined; factor: DecimalInput }): Decimal {
  const q = dec(p.quantity);
  if (q.lte(0)) throw new BusinessError("QUANTITE_INVALIDE", "La quantité commandée de la ligne est invalide.");
  const rate = p.exchangeRate === null || p.exchangeRate === undefined ? new Decimal(1) : dec(p.exchangeRate);
  const factor = dec(p.factor);
  if (factor.lte(0)) throw new BusinessError("CONVERSION_INVALID", "Le coefficient de conversion doit être strictement positif.");
  return roundCost(dec(p.netAmount).div(q).mul(rate).div(factor));
}

/** R6 : la date de réception ne peut pas être dans le futur (jours `yyyy-MM-dd`, fuseau Abidjan). */
export function assertReceivedAtValid(receivedAt: string, today: string): void {
  if (receivedAt > today) throw new BusinessError("DATE_FUTURE", "La date de réception ne peut pas être dans le futur.");
}

/** R6 : jours de retard de la réception sur la date de référence (promesse initiale, sinon date demandée) ; 0 si à l'heure. */
export function receiptDaysLate(referenceDate: Date | string, receivedAt: Date | string): number {
  return Math.max(0, diffDays(referenceDate, receivedAt));
}

/** Vrai si, après cette réception, toutes les lignes sont soldées (reçu + soldé >= commandé). */
export function isOrderComplete(lines: (QtyLine & { id: string })[], acceptedByLine: Map<string, DecimalInput>): boolean {
  return lines.length > 0 && lines.every((l) => dec(l.receivedQty).plus(dec(acceptedByLine.get(l.id) ?? 0)).plus(dec(l.closedQty)).gte(dec(l.quantity)));
}
