# Plan court – LOT-07 Stock : mouvements, sorties, PMP, prévision, réappro (DÉMO EXPRESS)

Branche `lot/07-stock` (depuis `main` après fusion LOT-06). Spec `docs/specs/LOT-07-stock.md`.
**Schéma déjà posé au LOT-06** (migration unique `receptions_stock`) ; `applyMovement` et `pmp.ts` déjà écrits (LOT-06 T1). Ce lot n'ajoute une migration que si un oubli est constaté.

## Décisions prudentes (hypothèses H75–H82, « à confirmer »)
| # | Décision |
|---|---|
| K1 | **Une seule porte** : `applyMovement(tx, input)` est la seule fonction qui écrit `StockLevel` ; verrou `SELECT … FOR UPDATE` sur la ligne (créée si absente), plusieurs articles verrouillés dans l'ordre (itemId, warehouseId) ; CHECK SQL `quantity >= 0` en dernier rempart. |
| K2 | PMP **par article × dépôt** (archi) ; valeur d'un article = Σ dépôts. Entrée : `PMP = (S×P + q×c)/(S+q)`, si `S ≤ 0` → `c`. Sortie / retour / transfert sortant au PMP courant (PMP inchangé). Transfert entrant = entrée au PMP source. Contre-passation d'entrée : `(S×P − q×c)/(S−q)` si `S−q > 0` et résultat > 0, sinon PMP conservé. Arrondi 4 décimales ; valeur mouvement `Int` arrondie. |
| K3 | `StockMovement` mémorise `pmpBefore`, `pmpAfter`, `stockAfter` (fiche de stock et solde progressif sans recalcul). `occurredAt` = date métier. |
| K4 | Bon de sortie `SOR-AAAA-00001` (Magasinier, Responsable) : service, demandeur (texte), motif, machine (`equipment`, obligatoire si PDR), lignes ; tout ou rien si stock insuffisant, message « Stock insuffisant : 4 U disponibles au dépôt Principal ». Contre-passation par le Responsable (motif). |
| K5 | Transfert : 2 mouvements `TRANSFERT` (−/+) liés par `documentRef` `TRF-AAAA-00001` ; Magasinier et Responsable. Ajustement `AJUSTEMENT` (`AJU-AAAA-00001`) : Responsable seul, motif obligatoire, coût = PMP. |
| K6 | Consommation = Σ sorties `SORTIE` nettes de contre-passations sur `stock.consumptionWindowDays` (90) jours / 90, tous dépôts. Couverture = stock / conso (∞ si conso nulle, affiché « – »). Position = stock + reste à recevoir des BC ouverts (unité de stock). Délai = `Item.leadTimeDays ?? ItemSupplier(principal).leadTimeDays ?? stock.defaultLeadTimeDays (30)`. |
| K7 | Suggestions affichées, **jamais appliquées automatiquement** : le Responsable clique « Appliquer les valeurs suggérées » (audit). Point de commande effectif = valeur saisie, sinon suggérée. |
| K8 | Réappro : quantité suggérée en unité de stock, puis convertie et arrondie **à l'unité d'achat supérieure**, au moins le minimum de commande du fournisseur principal. Article déjà couvert par une DA ouverte non commandée : signalé « DA-… en cours », non coché par défaut. « Créer les DA » : une DA `REAPPRO` par type (local/import, d'après le fournisseur principal), statut `SOUMISE`, via le service DA existant. |
| K9 | ABC calculé à la demande (« Recalculer », Responsable) sur 12 mois de valeur sortie ; sans consommation = C ; planification mensuelle au LOT-16. Dormant = stock > 0 et aucun mouvement depuis 180 jours. |

## Schéma (rappel, dans la migration `receptions_stock`)
Enum `StockMovementType` (`ENTREE_RECEPTION, SORTIE, RETOUR_FOURNISSEUR, TRANSFERT, AJUSTEMENT, AJUSTEMENT_INVENTAIRE`).
`StockLevel` (itemId, warehouseId, quantity Decimal(14,3), pmp Decimal(14,4) FCFA, updatedAt ; `@@unique([itemId, warehouseId])`) · `StockMovement` (itemId, warehouseId, type, quantity signée (unité de stock), unitCost Decimal(14,4), value Int signée, pmpBefore, pmpAfter, stockAfter, documentType, documentId?, documentRef, receiptLineId?, issueLineId?, reversalOfId? @unique, comment?, occurredAt, createdById ; index `[itemId, occurredAt]`, `[warehouseId, occurredAt]`, `[type, occurredAt]`, `[documentType, documentId]`) · `StockIssue` (number, status `VALIDEE|ANNULEE`, warehouseId, departmentId, requesterName, reason, equipment?, issuedAt, createdById, cancelled*) + `StockIssueLine` (itemId, quantity, unitCost, value) · `Item.abcComputedAt DateTime?`.

## Tâches
| # | Tâche | Agent | Fichiers |
|---|---|---|---|
| 1 | (fait au LOT-06) `applyMovement`, `pmp.ts` ; vérifier les cas K2 | dev-backend | `src/modules/stock/{movements,pmp}.ts` |
| 2 | Pures : `forecast.ts` (conso, couverture, date de rupture, point de commande et stock de sécurité suggérés K6), `reorder.ts` (K8), `abc.ts` (K9), `schemas.ts` | dev-backend | `src/modules/stock/*` |
| 3 | Service : `createIssue`, `cancelIssue`, `transfer`, `adjust`, `listMovements(filtres)`, `itemLedger(itemId)`, `listStock(filtres)` (stock, PMP, valeur, couverture, date de rupture — agrégats SQL), `listReorder(user)`, `createReorderRequests(itemIds, user)`, `applySuggestedThresholds`, `recomputeAbc`, `itemForecast(itemId)` (exporté pour LOT-08) | dev-backend | `src/modules/stock/{service,queries,index}.ts` |
| 4 | Permissions `stock.transfer` (Mag., Resp.), `stock.reorder` (Mag., Ach., Resp.), `stock.thresholds` (Resp.) ; réglages `stock.*` ; actions ; export Excel `mouvements`, `stock` | dev-backend | `src/lib/permissions.ts`, `src/modules/settings/keys.ts`, `src/app/(app)/stock/*/actions.ts`, `src/app/api/export/[entity]/route.ts` |
| 5 | Seed : 6 mois de sorties régulières **via `applyMovement`**, 1 article critique proche du point de commande (S3), 2 dormants, ABC calculé | dev-backend | `prisma/seed/stock.ts` |
| 6 | `/stock/articles` enrichi (stock, PMP, valeur, couverture avec couleur rouge < délai / orange < 2× délai / vert, date de rupture), fiche article : onglet « Fiche de stock » ; `/stock/mouvements` ; `/stock/sorties` (+ nouvelle, tablette) ; transfert / ajustement (dialogues) ; `/stock/reappro` (cases, quantité modifiable, « Créer les DA ») | dev-frontend | `src/app/(app)/stock/**`, `src/components/stock/*` |
| 7 | Tests critiques | testeur-unitaire | `tests/unit/stock.*.test.ts`, `tests/integration/stock.test.ts` |
| 8 | Scénario S3 (Playwright) | testeur-workflow | `tests/e2e/scenarios/S3-reappro.spec.ts` |

Ordre : **2 → 3 (dev-backend) ∥ 6 (dev-frontend)** dès le début du lot (schéma déjà là) ; 4, 5 ; 7 au fil de l'eau ; 8 ; lint + typecheck ; fusion.

## Tests critiques
PMP : nominal, stock nul, stock négatif impossible, contre-passation, arrondis (1/3), transfert ; sortie au-delà du stock refusée sans aucun mouvement écrit ; 2 sorties parallèles sur le dernier stock → 1 succès ; **test statique** : aucun fichier hors `src/modules/stock/movements.ts` ne contient `stockLevel.(create|update|upsert|delete)` ni SQL sur `stock_levels` ; couverture / date de rupture / point de commande / ABC sur jeu connu ; réappro → DA `SOUMISE` par type avec quantité arrondie au minimum ; Magasinier ne peut pas ajuster ; essai expiré → écriture refusée.
