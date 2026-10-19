# Plan court – LOT-08 Tableau de bord d'accueil par rôle (DÉMO EXPRESS)

Branche `lot/08-tableau-de-bord`. Spec `docs/specs/LOT-08-tableau-de-bord.md`. Dépend de LOT-05 (BC, `isLate`, `needsReminder`, `ReminderDialog`, pastilles d'accueil), LOT-06 (`Receipt.daysLate/inFull`, `NonConformity`), LOT-07 (`StockLevel`, `StockMovement`, `itemForecast`, ABC).
**Pas de migration** (sauf index manquant révélé par la mesure de performance). `docs/demo-1.md` est écrit à l'étape « Finalisation démo », pas dans ce lot.

## Décisions prudentes (hypothèses H83–H87, « à confirmer »)
| # | Décision |
|---|---|
| T1 | Mois = mois calendaire Abidjan ; comparaison au mois précédent **à date équivalente** (1er → même jour) pour ne pas afficher une fausse baisse en début de mois. |
| T2 | Montant commandé = Σ `totalHtXof` des BC validés dans le mois (date `approvedAt`), hors annulés. Délai DA → BC = moyenne (`PO.approvedAt` − `PR.approvedAt`) via allocations ; BC → réception = moyenne (1re réception − `PO.approvedAt`) ; à temps = réceptions `daysLate ≤ 0` / réceptions du mois (hors annulées). |
| T3 | Valeur du stock = Σ `quantity × pmp` ; valeur fin du mois précédent = valeur actuelle − Σ `value` des mouvements depuis le 1er (pas d'instantané stocké). Ruptures = articles stockés dont un mouvement du mois a laissé `stockAfter = 0`. |
| T4 | Risques de rupture = articles classe A **ou** criticité `CRITIQUE`, conso > 0, et date de rupture < prochaine livraison attendue (ou aucune livraison prévue). Même fonction que `/stock/reappro` (`itemForecast`). |
| T5 | Cartes sans donnée encore disponible (dossiers import LOT-12, inventaire LOT-11) : **non affichées**, pas de carte vide ni de faux chiffre. |
| T6 | Chaque carte = lien vers la liste filtrée existante (query string). Magasinier : aucun montant (inchangé H13). Chiffres « 0 » affichés en ton neutre, pas en rouge. |

## Tâches
| # | Tâche | Agent | Fichiers |
|---|---|---|---|
| 1 | Pures : `period.ts` (bornes mois / mois précédent T1, 12 mois), `kpi.ts` (variations %, moyennes, taux sur agrégats), formats | dev-backend | `src/modules/reporting/{period,kpi}.ts` |
| 2 | Requêtes agrégées (`groupBy`, `$queryRaw` paramétré, aucune liste complète) : `responsibleDashboard(now)` (cartes à traiter, KPI T2–T3, achats/mois local vs import, top 10 fournisseurs 12 mois, valeur stock par catégorie, risques T4), `buyerDashboard(user, now)` (DA assignées, BC `VALIDE` à envoyer, BC en retard / à relancer), `storekeeperDashboard(user, now)` (réceptions attendues aujourd'hui / semaine, articles sous le point de commande, 10 dernières sorties) | dev-backend | `src/modules/reporting/{queries,dashboard,index}.ts` |
| 3 | Permission `dashboard.view` par rôle (lecture, autorisée en essai expiré) ; seed : compléter l'historique 6 mois (BC validés et reçus répartis sur 6 mois, quelques retards, 2 NC) **via les services** | dev-backend | `src/lib/permissions.ts`, `prisma/seed/history.ts` |
| 4 | `/accueil` : aiguillage par rôle (remplace les pastilles LOT-05 en les intégrant) ; composants `KpiCard` (valeur, variation ▲▼ colorée selon le sens métier), `ActionCard` cliquable, graphiques Recharts (`PurchasesByMonthChart` empilé local/import, `TopSuppliersChart`, `StockByCategoryChart`), `RuptureRiskTable` ; bouton « Relancer » direct (`ReminderDialog` existant) ; `loading.tsx` squelettes ; tablette | dev-frontend | `src/app/(app)/accueil/**`, `src/components/dashboard/*` |
| 5 | Tests critiques | testeur-unitaire | `tests/unit/reporting.*.test.ts`, `tests/integration/dashboard.test.ts` |
| 6 | Scénario : chaque rôle voit son tableau ; S3 étape 2 (risque visible) ; clic carte → liste filtrée | testeur-workflow | `tests/e2e/scenarios/S-dashboard.spec.ts` |

Ordre : **1 → 2 (dev-backend) ∥ 4 (dev-frontend)** dès le départ, sur des types `ResponsibleDashboard`, `BuyerDashboard`, `StorekeeperDashboard` définis en premier dans `src/modules/reporting/types.ts` ; 3 ; 5 au fil de l'eau ; 6 ; mesure < 2 s avec le seed ; lint + typecheck ; fusion.

## Tests critiques
KPI sur jeu connu (montant, nombre, délais, taux à temps, variation à date équivalente, mois vide → « – » sans division par zéro) ; valeur stock fin de mois précédent (T3) ; risques de rupture (A/critique seulement, livraison prévue avant rupture = pas de risque) ; fuseau Abidjan au changement de mois (`TEST_NOW` 31/10 23:59) ; Magasinier : aucun champ montant dans la réponse ; acheteur ne voit que ses DA assignées / ses BC.
