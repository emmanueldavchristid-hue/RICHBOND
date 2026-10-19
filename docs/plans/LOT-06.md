# Plan court – LOT-06 Réceptions, non-conformités, retours (DÉMO EXPRESS)

Branche `lot/06-receptions`. Spec `docs/specs/LOT-06-receptions.md`. Dépend de LOT-05 (`refreshReceivedStatus(tx, orderId, actor)`, `receivedStatusOf`, `PurchaseOrderLine.receivedQty/stockQty`, `expectedDate`, `firstPromisedDate`, `open-orders.ts`, `nextNumber`, `audit.log`, `withAction`, `requireWritable`).
**Schéma commun 06+07 posé ici en une seule migration `receptions_stock`** (voir LOT-07 pour les modèles stock). Ne jamais lire `.env*`.

## Décisions prudentes (hypothèses H67–H74, « à confirmer »)
| # | Décision |
|---|---|
| R1 | Réception **en une étape** (pas de brouillon) : « Valider la réception » + confirmation ; numéro `REC-AAAA-00001` via `nextNumber("REC")` dans la transaction. Statuts `VALIDEE`, `ANNULEE`. |
| R2 | BC réceptionnable : `ENVOYE`, `CONFIRME`, `PARTIELLEMENT_RECU`, hors avenant en cours. BC `VALIDE` non envoyé → refus « Le BC doit être marqué envoyé par l'acheteur ». |
| R3 | Quantités saisies en **unité d'achat** (celle du BC), converties en unité de stock (`conversionFactor`). `livrée = acceptée + refusée` (Zod + CHECK). Seule l'**acceptée** incrémente `receivedQty` ; le refusé reste dû (remplacement possible). |
| R4 | Sur-livraison : `Σ acceptée > (commandé − soldé) × (1 + receipt.overDeliveryPct/100)` (défaut 0) → `OVER_DELIVERY`. Le Responsable peut forcer (case « Accord Responsable » + motif, `receipt.approveOverDelivery`), tracé. |
| R5 | Coût d'entrée FCFA par unité de stock = `netAmount / quantity × exchangeRate(figé BC) / conversionFactor` (remise incluse, hors TVA, **hors frais** : frais d'approche au LOT-12). Coûts unitaires `Decimal(14,4)` FCFA, valeurs `Int` arrondies. |
| R6 | Date de réception ≤ aujourd'hui (Abidjan). Ponctualité mémorisée : `referenceDate = firstPromisedDate ?? requestedDate`, `daysLate`, `inFull` (BC soldé après cette réception). |
| R7 | Contre-passation (Responsable, motif) : mouvements inverses `reversalOfId`, `receivedQty` décrémenté, `refreshReceivedStatus`. Refusée si le stock du dépôt est devenu insuffisant (`STOCK_INSUFFICIENT`, « 12 U déjà sorties »). |
| R8 | Solde de reliquat : `PurchaseOrderLine.closedQty` + `closedReason`, BC `PARTIELLEMENT_RECU` seulement, acheteur du périmètre ou Responsable. **Modifier `receivedStatusOf`** : `receivedQty + closedQty ≥ quantity` ⇒ `RECU` ; `open-orders.ts` : restant = quantité − reçue − soldée. |
| R9 | Refus ⇒ `NonConformity` `NC-AAAA-00001` (statut `OUVERTE`) créée automatiquement ; décision (`RETOUR`, `AVOIR`, `REMPLACEMENT`) prise ensuite par acheteur/Responsable → `CLOTUREE`. |
| R10 | Bon de retour `RET-AAAA-00001` **uniquement pour marchandise entrée en stock** : sortie `RETOUR_FOURNISSEUR` au PMP du moment, décrémente `receivedQty` (le BC se rouvre). Refusé à la livraison = pas de mouvement. **Priorité P2** : si le temps manque, reporté après la démo (noté au journal). |
| R11 | Magasinier sans prix ni montants (réglage `receipt.showPricesToStorekeeper`, défaut `false`) ; il lit les BC via des requêtes `receiving` dédiées sans champ prix. Photo de ligne : **hors démo**. |

## Schéma (migration unique `receptions_stock`, avec LOT-07)
Enums `ReceiptStatus`, `RefusalReason` (`ABIME, NON_CONFORME, ERREUR_REFERENCE, HORS_DELAI, AUTRE`), `NonConformityDecision`, `NonConformityStatus`.
`Receipt` (number @unique, status, orderId, supplierId, warehouseId, deliveryNoteRef, receivedAt @db.Date, carrier?, comment?, referenceDate, daysLate Int, inFull Bool, overDeliveryApprovedById?, overDeliveryReason?, createdById, cancelledAt/ById/Reason ; index `[orderId]`, `[receivedAt]`, `[supplierId, receivedAt]`) · `ReceiptLine` (receiptId, orderLineId, itemId?, deliveredQty, acceptedQty, refusedQty, acceptedStockQty, refusalReason?, lotNumber?, unitCostXof Decimal(14,4)) · `NonConformity` (number, supplierId, orderId, receiptId, receiptLineId, itemId?, qty, reason, decision?, status, comment?, decidedById?, decidedAt?) · `SupplierReturn` + `SupplierReturnLine` (P2) · `PurchaseOrderLine.closedQty Decimal(14,3) @default(0)`, `closedReason?`.

## Tâches (après la tâche 0 de schéma)
| # | Tâche | Agent | Fichiers |
|---|---|---|---|
| 0 | Schéma 06+07 + migration + CHECK SQL (`stock_levels.quantity >= 0`, `delivered = accepted + refused`) | dev-backend | `prisma/schema.prisma`, `prisma/migrations/*` |
| 1 | Cœur stock d'abord (partagé avec LOT-07) : `applyMovement` + `pmp.ts` (voir LOT-07 T1) | dev-backend | `src/modules/stock/{movements,pmp}.ts` |
| 2 | Pures : `receiving/rules.ts` (R2–R4, R6, conversion, coût R5), `schemas.ts`, libellés ; `receivedStatusOf` + reliquat (R8) | dev-backend | `src/modules/receiving/*`, `src/modules/purchase-orders/{workflow,open-orders}.ts` |
| 3 | Service : `listExpected(user, now)` (aujourd'hui / semaine / en retard), `listRecent`, `getOrderForReceipt(orderId, user)` (sans prix si magasinier), `createReceipt` (verrou BC, mouvements, `receivedQty`, NC, `refreshReceivedStatus`, audit `RECEIPT_CREATE`), `cancelReceipt` (R7), `closeRemainder` (R8), `decideNonConformity`, `createSupplierReturn` (P2) | dev-backend | `src/modules/receiving/{service,queries,index}.ts` |
| 4 | Permissions `receipt.cancel`, `receipt.approveOverDelivery`, `nonConformity.decide`, `purchaseOrder.closeRemainder` ; réglages `receipt.*` ; server actions `withAction` | dev-backend | `src/lib/permissions.ts`, `src/modules/settings/keys.ts`, `src/app/(app)/stock/receptions/actions.ts` |
| 5 | Seed : réceptions des BC « reçus » du seed LOT-05 + 1 partielle avec NC ouverte (via le service) | dev-backend | `prisma/seed/receipts.ts` |
| 6 | `/stock/receptions` (3 blocs + recherche n° BC / fournisseur), saisie tablette `/stock/receptions/nouvelle?bc=` (champs ≥ 44 px, restant dû pré-rempli, « Tout accepter », motif si refus), fiche réception (contre-passation Responsable), bloc « Réceptions » + « Solder le reliquat » sur la fiche BC, liste NC simple `/stock/receptions/non-conformites` | dev-frontend | `src/app/(app)/stock/receptions/**`, `src/components/receiving/*`, `src/app/(app)/achats/commandes/[id]/*` |
| 7 | Tests critiques ci-dessous | testeur-unitaire | `tests/unit/receiving.*.test.ts`, `tests/integration/receipts.test.ts` |
| 8 | S1 étape 6 + S2 étapes 1–2 (Playwright, scénario du lot seulement) | testeur-workflow | `tests/e2e/scenarios/S2-reception.spec.ts` |

Ordre : **0 → 1** (bloquant), puis **2–5 (dev-backend) ∥ 6 (dev-frontend)** sur les signatures ci-dessus ; 7 au fil de l'eau ; 8 ; lint + typecheck ; fusion.

## Tests critiques
Partielle puis complète (statut BC `PARTIELLEMENT_RECU` → `RECU`, stock et PMP cohérents) ; sur-livraison refusée (0 %) et forcée par le Responsable ; refus partiel → NC + reste dû ; contre-passation → stock, `receivedQty`, statut BC revenus, refusée si stock sorti ; reliquat soldé → `RECU` ; magasinier : aucun prix dans la réponse ; acheteur ne contre-passe pas ; essai expiré → `LICENSE_READ_ONLY` ; 2 réceptions parallèles du même BC → pas de dépassement.
