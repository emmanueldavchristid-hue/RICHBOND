import type { InvoiceMatchCode, InvoiceStatusCode } from "./labels";

export interface InvoiceResult {
  id: string;
  number: string;
  status: InvoiceStatusCode;
  /** Statut des BC touchés après clôture éventuelle. */
  closedOrders: string[];
  reopenedOrders: string[];
  lineMatches: InvoiceMatchCode[];
}

export interface InvoiceRow {
  id: string;
  number: string;
  supplierInvoiceNo: string;
  supplierId: string;
  supplierName: string;
  status: InvoiceStatusCode;
  invoiceDate: Date;
  dueDate: Date;
  currencyCode: string;
  totalTtc: string;
  totalTtcXof: number | null;
  /** Jours de retard (> 0) si échéance dépassée et facture ouverte. */
  daysOverdue: number;
  orderNumbers: string[];
  gapLineCount: number;
}

export interface InvoiceLineView {
  id: string;
  lineNo: number;
  orderLineId: string;
  orderId: string;
  orderNumber: string;
  orderLineNo: number;
  designation: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  discountPct: string;
  vatRate: string;
  netAmount: string;
  match: InvoiceMatchCode | null;
  billableQty: string | null;
  poPrice: string | null;
  priceDeltaPct: string | null;
  qtyDelta: string | null;
}

export interface InvoiceDetail {
  id: string;
  number: string;
  supplierInvoiceNo: string;
  supplier: { id: string; code: string; name: string };
  status: InvoiceStatusCode;
  invoiceDate: Date;
  dueDate: Date;
  currencyCode: string;
  totalHt: string;
  totalVat: string;
  totalTtc: string;
  totalTtcXof: number | null;
  notes: string | null;
  litigeReason: string | null;
  cancelledReason: string | null;
  matchedAt: Date | null;
  payApprovedAt: Date | null;
  transmittedAt: Date | null;
  createdAt: Date;
  createdBy: { id: string; name: string };
  lines: InvoiceLineView[];
  orders: { id: string; number: string; status: string }[];
  receipts: { id: string; number: string; orderId: string; receivedAt: Date; deliveryNoteRef: string }[];
  attachments: { id: string; fileName: string; mimeType: string; size: number; createdAt: Date }[];
}

export interface InvoiceableLine {
  orderLineId: string;
  orderId: string;
  orderNumber: string;
  lineNo: number;
  designation: string;
  unit: string;
  billableQty: string;
  poPrice: string;
  discountPct: string;
  vatRate: string;
  currencyCode: string;
}

export interface DueScheduleItem {
  id: string;
  number: string;
  supplierInvoiceNo: string;
  supplierName: string;
  status: InvoiceStatusCode;
  dueDate: Date;
  totalTtc: string;
  totalTtcXof: number | null;
  currencyCode: string;
  daysOverdue: number;
}

export interface DueBucket {
  count: number;
  /** Somme des TTC connus en FCFA. */
  totalXof: number;
  /** Factures sans équivalent FCFA (taux inconnu), non comprises dans le total. */
  unknownXof: number;
  items: DueScheduleItem[];
}

export interface DueSchedule {
  todayIso: string;
  late: DueBucket;
  /** Échéance aujourd'hui et dans les 6 jours suivants. */
  week: DueBucket;
  /** Échéance d'aujourd'hui à la fin du mois (la semaine en fait partie). */
  month: DueBucket;
}

export interface InvoiceDiscrepancyRow {
  invoiceNumber: string;
  supplierInvoiceNo: string;
  supplier: string;
  invoiceDate: Date;
  dueDate: Date;
  status: InvoiceStatusCode;
  orderNumber: string;
  lineNo: number;
  designation: string;
  unit: string;
  match: InvoiceMatchCode;
  invoicedQty: number;
  billableQty: number | null;
  qtyDelta: number | null;
  invoicePrice: number;
  poPrice: number | null;
  priceDeltaPct: number | null;
  currencyCode: string;
}

export interface InvoiceExportRow {
  number: string;
  supplierInvoiceNo: string;
  supplier: string;
  status: InvoiceStatusCode;
  invoiceDate: Date;
  dueDate: Date;
  orderNumbers: string;
  currencyCode: string;
  totalHt: number;
  totalVat: number;
  totalTtc: number;
  totalTtcXof: number | null;
  createdBy: string;
}
