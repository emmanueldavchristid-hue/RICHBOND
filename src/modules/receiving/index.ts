/**
 * API publique du module réceptions (LOT-06).
 * Composants client : importer `@/modules/receiving/labels` et `@/modules/receiving/types` (purs), jamais cet index
 * (il tire les services, réservés au serveur).
 *
 * Lectures : listExpected(user, input, now), listRecent(user, input), getOrderForReceipt(user, orderId),
 *            getReceipt(user, id), listNonConformities(user, input).
 * Écritures : createReceipt, cancelReceipt, closeRemainder, decideNonConformity, createSupplierReturn (actor, raw, ip, at).
 */
export * from "./labels";
export * from "./rules";
export * from "./schemas";
export * from "./types";
export * from "./queries";
export * from "./service";
