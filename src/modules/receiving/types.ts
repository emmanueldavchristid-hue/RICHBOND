import type { PoStatus, PoType } from "@/modules/purchase-orders/labels";
import type { NonConformityDecisionCode, NonConformityStatusCode, ReceiptStatusCode, RefusalReasonCode } from "./labels";

/**
 * Formes renvoyées par les requêtes et les server actions de réception (LOT-06).
 * Quantités : chaînes décimales (3 décimales, unité indiquée). Montants FCFA : entiers. Dates : `Date`
 * (les « jours seuls » sont à minuit UTC : les afficher avec `formatDateOnly`). Fichier de types purs, importable côté client.
 *
 * Magasinier (sans le réglage `receipt.showPricesToStorekeeper`) : les champs de prix sont ABSENTS de l'objet
 * (jamais à 0), d'où les `?` ci-dessous. `pricesVisible` indique si l'on peut les afficher.
 */

export interface ExpectedOrder {
  orderId: string;
  /** BC-AAAA-NNNNN (avec « vN » pour un avenant). */
  number: string;
  supplierName: string;
  type: PoType;
  status: PoStatus;
  warehouseName: string;
  /** Date promise, sinon demandée. */
  expectedDate: Date;
  /** Jours de retard (0 si pas en retard). */
  daysLate: number;
  lineCount: number;
  /** Lignes ayant encore un restant dû. */
  openLineCount: number;
}

export interface ExpectedBlocks {
  /** Jour courant à Abidjan, `yyyy-MM-dd`. */
  todayIso: string;
  today: ExpectedOrder[];
  /** Après aujourd'hui et jusqu'à 7 jours. */
  thisWeek: ExpectedOrder[];
  late: ExpectedOrder[];
}

export interface RecentReceipt {
  id: string;
  number: string;
  status: ReceiptStatusCode;
  orderId: string;
  orderNumber: string;
  supplierName: string;
  warehouseName: string;
  deliveryNoteRef: string;
  receivedAt: Date;
  daysLate: number;
  inFull: boolean;
  lineCount: number;
  nonConformityCount: number;
  createdByName: string;
}

export interface ReceiptOrderLine {
  id: string;
  lineNo: number;
  itemId: string | null;
  itemCode: string | null;
  designation: string;
  supplierRef: string | null;
  /** Unité d'achat (celle du BC), dans laquelle les quantités sont saisies. */
  unit: string;
  stockUnit: string | null;
  /** Facteur unité d'achat -> unité de stock. */
  conversionFactor: string;
  quantity: string;
  receivedQty: string;
  closedQty: string;
  /** Restant dû : commandé - reçu - soldé. */
  remainingQty: string;
  /** Quantité maximale acceptable sans accord du Responsable (tolérance comprise). */
  maxAcceptableQty: string;
  // Prix : absents pour un Magasinier sans le réglage.
  unitPrice?: string;
  discountPct?: string;
  netAmount?: string;
}

export interface ReceiptOrderView {
  orderId: string;
  number: string;
  version: number;
  status: PoStatus;
  type: PoType;
  supplierId: string;
  supplierName: string;
  warehouseId: string;
  warehouseName: string;
  requestedDate: Date;
  promisedDate: Date | null;
  expectedDate: Date;
  /** Le BC peut-il être réceptionné maintenant ? */
  receivable: boolean;
  notReceivableReason: string | null;
  /** Tolérance de sur-livraison en % (réglage `receipt.overDeliveryPct`). */
  overDeliveryPct: number;
  /** L'utilisateur peut-il accorder une sur-livraison (Responsable) ? */
  canApproveOverDelivery: boolean;
  pricesVisible: boolean;
  currencyCode?: string;
  lines: ReceiptOrderLine[];
  /** Réceptions déjà enregistrées sur ce BC (annulées comprises), les plus récentes d'abord. */
  receipts: { id: string; number: string; status: ReceiptStatusCode; receivedAt: Date; deliveryNoteRef: string }[];
}

export interface ReceiptDetailLine {
  id: string;
  lineNo: number;
  itemCode: string | null;
  designation: string;
  unit: string;
  stockUnit: string | null;
  deliveredQty: string;
  acceptedQty: string;
  refusedQty: string;
  acceptedStockQty: string;
  refusalReason: RefusalReasonCode | null;
  lotNumber: string | null;
  /** FCFA par unité de stock (4 décimales) ; absent pour un Magasinier sans le réglage. */
  unitCostXof?: string;
  /** Valeur d'entrée en FCFA entiers ; absente pour un Magasinier sans le réglage. */
  valueXof?: number;
}

export interface ReceiptNonConformity {
  id: string;
  number: string;
  status: NonConformityStatusCode;
  decision: NonConformityDecisionCode | null;
  qty: string;
  reason: RefusalReasonCode;
  itemCode: string | null;
}

export interface ReceiptDetail {
  id: string;
  number: string;
  status: ReceiptStatusCode;
  orderId: string;
  orderNumber: string;
  orderStatus: PoStatus;
  supplierId: string;
  supplierName: string;
  warehouseName: string;
  deliveryNoteRef: string;
  receivedAt: Date;
  carrier: string | null;
  comment: string | null;
  referenceDate: Date;
  daysLate: number;
  inFull: boolean;
  overDeliveryApproved: boolean;
  overDeliveryReason: string | null;
  createdByName: string;
  createdAt: Date;
  cancelledAt: Date | null;
  cancelledByName: string | null;
  cancelledReason: string | null;
  pricesVisible: boolean;
  /** Valeur totale d'entrée FCFA ; absente pour un Magasinier sans le réglage. */
  totalValueXof?: number;
  /** L'utilisateur peut contre-passer (Responsable, réception validée). */
  canCancel: boolean;
  lines: ReceiptDetailLine[];
  nonConformities: ReceiptNonConformity[];
}

export interface NonConformityRow {
  id: string;
  number: string;
  status: NonConformityStatusCode;
  decision: NonConformityDecisionCode | null;
  createdAt: Date;
  supplierId: string;
  supplierName: string;
  orderId: string;
  orderNumber: string;
  receiptId: string;
  receiptNumber: string;
  itemCode: string | null;
  designation: string;
  unit: string;
  qty: string;
  reason: RefusalReasonCode;
  comment: string | null;
  decidedAt: Date | null;
  decidedByName: string | null;
  /** L'utilisateur peut décider (Responsable, Acheteur) et la NC est ouverte. */
  canDecide: boolean;
}

export interface CreateReceiptResult {
  id: string;
  number: string;
  orderId: string;
  orderStatus: PoStatus;
  daysLate: number;
  inFull: boolean;
  nonConformities: { id: string; number: string }[];
}

export interface CancelReceiptResult {
  id: string;
  number: string;
  orderStatus: PoStatus;
}

export interface CloseRemainderResult {
  orderId: string;
  orderStatus: PoStatus;
  closedLines: number;
}

export interface DecideNonConformityResult {
  id: string;
  number: string;
  decision: NonConformityDecisionCode;
  status: NonConformityStatusCode;
}

export interface SupplierReturnResult {
  id: string;
  number: string;
  orderId: string;
  orderStatus: PoStatus;
  totalValueXof: number;
}
