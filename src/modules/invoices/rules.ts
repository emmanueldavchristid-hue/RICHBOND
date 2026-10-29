import { Prisma } from "@/generated/prisma/client";

/**
 * Règles pures des factures fournisseurs (LOT-13) : échéance, rapprochement ligne à ligne, statut de la facture,
 * clôture du BC. Aucune base, aucune horloge. Décimal exact, jamais de float pour les quantités et les prix.
 */
export type PaymentTermCode = "COMPTANT" | "J30" | "J45" | "J60" | "J90" | "FIN_DE_MOIS_30" | "AUTRE";
export type LineMatchCode = "CONFORME" | "ECART_PRIX" | "ECART_QTE" | "ECART_PRIX_QTE";
export type InvoiceMatchStatus = "CONFORME" | "ECART";

type Num = number | string | Prisma.Decimal;
const D = (v: Num) => new Prisma.Decimal(String(v));
const DAY_MS = 86_400_000;

const toIso = (d: Date | string): string => (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10));
const addDaysIso = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00.000Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** Jours d'un paiement « AUTRE » lu dans la précision (« 15 jours », « 20j »), 30 par défaut. */
export function otherTermDays(note?: string | null): number {
  const m = note?.match(/(\d{1,3})\s*(?:j\b|jours?\b)/i);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 30;
}

/**
 * Date d'échéance (yyyy-MM-dd) depuis la date de facture (jour calendaire d'Abidjan, sans heure).
 * COMPTANT = jour même ; Jxx = + xx jours ; FIN_DE_MOIS_30 = fin du mois de la facture + 30 jours ; AUTRE = + jours de la précision (30 par défaut).
 */
export function computeDueDate(invoiceDate: Date | string, term: PaymentTermCode, note?: string | null): string {
  const iso = toIso(invoiceDate);
  switch (term) {
    case "COMPTANT":
      return iso;
    case "J30":
      return addDaysIso(iso, 30);
    case "J45":
      return addDaysIso(iso, 45);
    case "J60":
      return addDaysIso(iso, 60);
    case "J90":
      return addDaysIso(iso, 90);
    case "FIN_DE_MOIS_30": {
      const [y, m] = iso.split("-").map(Number);
      const endOfMonth = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      return addDaysIso(endOfMonth, 30);
    }
    default:
      return addDaysIso(iso, otherTermDays(note));
  }
}

export interface Tolerances {
  /** % (défaut 1). */
  pricePct: number;
  /** Unités d'achat (défaut 0). */
  qty: number;
}
export const DEFAULT_TOLERANCES: Tolerances = { pricePct: 1, qty: 0 };

export interface MatchLineInput {
  invoicedQty: Num;
  /** Prix unitaire facturé, net de remise de la facture. */
  invoicePrice: Num;
  /** Prix unitaire du BC net de remise. */
  poPrice: Num;
  /** Quantité reçue ACCEPTÉE de la ligne de BC (réceptions validées non annulées). */
  receivedAcceptedQty: Num;
  /** Quantité déjà facturée par d'autres factures non annulées. */
  alreadyInvoicedElsewhere: Num;
}

export interface MatchLineResult {
  match: LineMatchCode;
  /** (prix facturé - prix BC) / prix BC, en % arrondi à 2 décimales. */
  priceDeltaPct: number;
  /** Quantité facturée - quantité facturable (reçue acceptée - déjà facturée ailleurs), 3 décimales. */
  qtyDelta: number;
  /** Quantité facturable (peut être négative si sur-facturé ailleurs ; jamais affichée en dessous de 0). */
  billableQty: number;
}

/** Facturation partielle (facturé < facturable) = conforme. Écart quantité seulement si facturé > facturable + tolérance. */
export function matchLine(input: MatchLineInput, tol: Tolerances = DEFAULT_TOLERANCES): MatchLineResult {
  const invoiced = D(input.invoicedQty);
  const billable = D(input.receivedAcceptedQty).minus(D(input.alreadyInvoicedElsewhere));
  const qtyDelta = invoiced.minus(billable);
  const qtyGap = invoiced.gt(billable.plus(D(tol.qty)));

  const po = D(input.poPrice);
  const inv = D(input.invoicePrice);
  let pct: Prisma.Decimal;
  if (po.isZero()) pct = inv.isZero() ? new Prisma.Decimal(0) : new Prisma.Decimal(100);
  else pct = inv.minus(po).div(po).mul(100);
  const priceGap = pct.abs().gt(D(tol.pricePct));

  const match: LineMatchCode = priceGap && qtyGap ? "ECART_PRIX_QTE" : priceGap ? "ECART_PRIX" : qtyGap ? "ECART_QTE" : "CONFORME";
  return {
    match,
    priceDeltaPct: pct.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber(),
    qtyDelta: qtyDelta.toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP).toNumber(),
    billableQty: Prisma.Decimal.max(billable, 0).toDecimalPlaces(3).toNumber(),
  };
}

/** CONFORME si toutes les lignes sont conformes, sinon ECART (une facture sans ligne n'est jamais conforme). */
export function invoiceStatusFromLines(matches: readonly LineMatchCode[]): InvoiceMatchStatus {
  return matches.length > 0 && matches.every((m) => m === "CONFORME") ? "CONFORME" : "ECART";
}

export interface ClosableLine {
  quantity: Num;
  receivedQty: Num;
  closedQty: Num;
  invoicedQty: Num;
}

/** Un BC se clôture quand toutes ses lignes sont reçues ou soldées ET que tout ce qui a été reçu est facturé. */
export function isOrderFullyInvoiced(lines: readonly ClosableLine[]): boolean {
  if (lines.length === 0) return false;
  return lines.every((l) => {
    const received = D(l.receivedQty);
    const complete = received.plus(D(l.closedQty)).gte(D(l.quantity));
    return complete && D(l.invoicedQty).gte(received);
  });
}

/** Normalisation du n° de facture fournisseur : espaces retirés, majuscules (clé d'unicité par fournisseur). */
export function normalizeSupplierInvoiceNo(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/** BC sur lesquels une facture est possible : quelque chose a été reçu. */
export const INVOICEABLE_ORDER_STATUSES = ["PARTIELLEMENT_RECU", "RECU", "CLOTURE"] as const;

/** Statuts d'une facture encore ouverte pour l'échéancier (ni transmise, ni annulée). */
export const OPEN_INVOICE_STATUSES = ["SAISIE", "CONFORME", "ECART", "BON_A_PAYER", "LITIGE"] as const;
