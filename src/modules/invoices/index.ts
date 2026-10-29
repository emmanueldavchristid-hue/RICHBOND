/**
 * API publique du module factures fournisseurs (LOT-13).
 * Composants client : importer `@/modules/invoices/labels`, `@/modules/invoices/rules` et `@/modules/invoices/types` (purs),
 * jamais cet index (il tire les services, réservés au serveur).
 *
 * Lectures : listInvoices, getInvoice, listInvoiceableReceipts, dueSchedule, invoiceCounters, invoiceDiscrepancyRows, exportInvoices.
 * Écritures : createInvoice, updateInvoice, rematchInvoice, approvePayment, markTransmitted, markLitige, resolveLitige,
 *             cancelInvoice, addInvoiceAttachment, removeInvoiceAttachment (actor, raw, ip, at).
 */
export * from "./labels";
export * from "./rules";
export * from "./schemas";
export * from "./types";
export * from "./queries";
export * from "./service";
export * from "./attachments";
