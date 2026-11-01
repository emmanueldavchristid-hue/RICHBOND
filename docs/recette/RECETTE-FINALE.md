# Recette finale (campagne globale) – RICHBOND Achats & Stocks

Date : 01/11/2026 · Branche `lot/campagne-finale` · Recette par lecture du code, des specs et de la documentation.
Aucune exécution : base de test, Playwright et port 3100 laissés à l'autre agent. Les tests (1254 unitaires/intégration annoncés, scénarios S0 à S8) n'ont pas été rejoués ici.
Périmètre : LOT-00 à 09, 11, 12, 13, 15, 16, 18 (LOT-10, LOT-14 reportés ; LOT-17 Sage non démarré, traité en important car il touche le jour de la démo).

## Verdict : ACCEPTÉ AVEC RÉSERVES

Le parcours DA → BC → réception → stock (PMP) → facture → import → rapports est cohérent et solide sur le fond.
Ce que j'ai lu est de bonne facture : le stock ne bouge que par mouvement (verrous, contre-passation, PMP), la réception gère le partiel, le refus, la sur-livraison avec accord du Responsable, le reliquat et le retour ; le rapprochement de facture est ligne à ligne ; le Magasinier fait un comptage aveugle ; l'essai ne se contourne pas en production (`TEST_NOW` ignoré).
Aucun défaut de calcul ou de droit bloquant n'a été trouvé à la lecture. Les bloquants ci-dessous sont des risques de mise en service, pas des bugs de logique.

## Bloquants (à lever avant d'engager M. DIBI sur une mise en service)

### B1. Règle des codes articles/fournisseurs incompatible avec des codes Sage réels (H33, H51)
- Fichiers : `src/modules/referentials/codes.ts` (17 caractères, A-Z 0-9 . _ -, sans espace), `src/modules/import/validate.ts`.
- Constat : les codes Sage de type « ROUL 6205/2RS » ou « Vis M8 x 30 » sont refusés ligne par ligne. Une référence article Sage i7 peut faire 18 caractères, avec espaces et « / ». Le jour de l'import initial, une part importante du catalogue PDR risque d'être rejetée.
- Correctif proposé : (1) faire valider par M. DIBI un extrait réel anonymisé (déjà noté H51) ; (2) autoriser espace et « / » en stockage (conserver le code Sage tel quel, majuscules), limite 18 pour les articles ; (3) à défaut, proposer dans l'aperçu d'import un code corrigé et conserver le code Sage d'origine dans un champ « Réf. Sage ». Ne pas laisser ce point « à confirmer » au-delà de la démo : c'est le premier mur de la mise en service.

### B2. Alertes 8h / 15h : rien ne tourne sans planification serveur, et rien ne le signale
- Fichiers : `src/app/api/cron/alertes/route.ts`, `docs/deploiement.md`, `docs/blocages.md` ("Reste : planifier le cron sur le serveur du client").
- Constat : EX-64 repose sur un appel HTTP externe avec `CRON_SECRET`. Si la tâche n'est pas créée, l'application est muette sans que personne le voie, et l'argument « alertes 2 fois par jour » du cahier des charges tombe.
- Correctif proposé : (1) tâche planifiée créée et testée sur le serveur avant la démo (checklist de mise en service) ; (2) afficher dans Paramètres (SUPER_ADMIN / Responsable) « Dernier envoi des alertes : JJ/MM/AAAA hh:mm », en rouge si plus de 24 h ; (3) corriger `docs/deploiement.md` ligne 29, qui dit que la notification immédiate de rupture critique est « à brancher » alors que `alertCriticalStockouts` (`src/modules/stock/movements.ts`) le fait déjà.

### B3. Sauvegarde / restauration jamais rejouées
- Fichiers : `scripts/backup.ps1`, `scripts/backup.sh`, journal LOT-18 (« non rejoués »).
- Constat : une sauvegarde jamais restaurée n'est pas une sauvegarde. Les pièces jointes (`storage/`, photos, DA, factures, documents d'import) doivent aussi être incluses ; à vérifier.
- Correctif proposé : un test de restauration sur une base vierge avec contrôle du nombre de lignes et d'un document PDF joint, consigné dans `docs/deploiement.md`. À faire avant toute donnée réelle.

## Importants (à traiter avant ou juste après la démo)

### I1. Facture : aucun contrôle du total de la facture papier, aucune ligne de frais annexes
- Fichiers : `src/modules/invoices/schemas.ts`, `src/app/(app)/achats/factures/invoice-form.tsx`.
- Constat : l'acheteur saisit des lignes ; le total TTC est calculé (« montants indicatifs »). Il n'y a ni champ « Total TTC de la facture fournisseur » à comparer, ni ligne transport / emballage / frais divers (très fréquents sur les factures locales). Résultat : une facture qui ne tombe pas au centime avec le papier ne peut pas être saisie fidèlement, ou l'écart passe inaperçu.
- Correctif : champ facultatif « Total TTC facture » avec alerte si écart avec le total calculé au-delà de la tolérance ; type de ligne « frais annexes » sans rapprochement de quantité (visible dans l'échéancier).

### I2. Pas d'écran de modification d'une facture ni de l'en-tête d'un dossier import
- Fichiers : `src/app/(app)/achats/factures/[id]`, `src/app/(app)/import/[id]` (actions serveur prêtes selon les journaux LOT-12 et LOT-13).
- Constat : une faute de frappe (date, n° de facture, taux) oblige à annuler et ressaisir, ou est irrécupérable pour le dossier import (pays, incoterm, transitaire).
- Correctif : brancher les actions existantes sur un bouton « Modifier » (facture tant que non « Bon à payer » ; dossier tant que non clôturé).

### I3. Le PMP ne tient pas compte du prix réellement facturé
- Fichiers : `src/modules/receiving/rules.ts` (`entryUnitCost` : prix du BC), `src/modules/invoices/service.ts`.
- Constat : le coût d'entrée est celui du BC. Si la facture diffère du BC (écart de prix accepté en dérogation « Bon à payer »), le PMP reste faux et les rapports de valeur de stock et de rotation aussi. Seul l'import a un réajustement (REEVALUATION_COUT).
- Correctif : à la dérogation d'un écart de prix sur une ligne reçue, proposer un mouvement de réévaluation (réutiliser `REEVALUATION_COUT`, tracé) du stock restant, ou au minimum afficher l'écart cumulé de prix dans le rapport mensuel. À arbitrer avec M. DIBI (« conformité » ou « PMP exact » ?).

### I4. Absence d'intégration Sage (LOT-17) : rien n'est sortant
- Fichiers : `docs/04-integration-sage.md`, `src/app/api/export/[entity]/route.ts` (exports Excel articles, fournisseurs, DA, BC, factures, mouvements, stock).
- Constat : le client travaille à côté de Sage 100 : factures d'achat et réceptions doivent y être saisies. Aujourd'hui, ressaisie manuelle ; l'export « factures » existe mais n'est pas au format d'import Sage. EX-70 n'est pas livré.
- Correctif : annoncer clairement en démo « import initial par Excel, export au format Sage en LOT-17 ». Priorité LOT-17 : export des factures Bon à payer et des entrées de stock au format d'import officiel Sage (règle 10 : fichiers uniquement).

### I5. Recettes métier manquantes pour 10 lots (processus)
- Fichiers : `docs/recette/` ne contient que LOT-00, 01, 02, 03, 04, 09. Manquent LOT-05, 06, 07, 08, 11, 12, 13, 15, 16, 18.
- Constat : la « Définition de Terminé » (docs/03, point 4) exige un rapport de recette par lot. Le plan marque ces lots « Terminé » sans cette preuve.
- Correctif : soit rédiger de courts rapports, soit noter dans `docs/03-plan-des-lots.md` que cette recette globale remplace les recettes individuelles pour le marathon.

### I6. Menu « Rapports » vide pour le Magasinier
- Fichiers : `src/lib/permissions.ts` (le Magasinier a `report.stock`, donc le menu s'affiche), `src/app/(app)/rapports/page.tsx` (H62).
- Constat : un magasinier clique sur « Pilotage / Rapports » et ne trouve rien. Le rapport quotidien contient pourtant les entrées/sorties de stock, utiles au magasin (EX-62).
- Correctif : soit retirer le menu au Magasinier, soit lui donner le volet stock du rapport quotidien (mouvements, ruptures, sous seuil) sans montant.

### I7. Une seule instance : blocage de connexion en mémoire, horloge, cron
- Fichiers : modules `auth` (tentatives en mémoire), journal LOT-18.
- Constat : tout redémarrage du serveur remet les compteurs à zéro et une seconde instance les doublerait. Acceptable pour un site unique, à écrire explicitement dans `docs/deploiement.md` (« une seule instance Node »).
- Correctif : mention dans la doc de déploiement ; migration en base seulement si une montée en charge est prévue.

### I8. CSP et scripts de charge non vérifiés en navigateur
- Fichiers : `next.config.*`, journal LOT-18.
- Constat : une CSP trop stricte peut casser silencieusement le PDF, les photos ou l'impression en production alors que tout marche en dev.
- Correctif : un passage manuel du parcours complet sur une build de production (`npm run build && npm start`) avec la console ouverte, y compris sur la tablette du magasin.

## Mineurs / confort

- M1. Avenant de BC impossible après une première réception (`src/modules/purchase-orders/workflow.ts`). Cas réel : augmenter une quantité ou changer un prix sur un BC déjà partiellement livré oblige à créer un nouveau BC ; la date promise reste modifiable et le reliquat se solde. À expliquer dans le guide.
- M2. Cohérence H13 : le Magasinier est censé voir le PMP, mais le tableau de bord ne lui montre aucun champ monétaire (`src/modules/reporting/dashboard.ts`, ligne ~583). Confirmer le souhaitable avec M. DIBI ; la prudence actuelle est défendable.
- M3. Message de compte désactivé affiché même avec un mauvais mot de passe (H14) : fuite d'existence de compte, risque faible en interne.
- M4. Jours fériés ivoiriens non gérés (H8) : les délais et retards fournisseurs comptent les jours calendaires ; un retard « de 1 jour » un lendemain de fête peut agacer. À traiter avec un calendrier paramétrable.
- M5. Taux de service magasin approximatif (H59) : un indicateur affiché sans la mention « estimé » prête à confusion ; vérifier que l'infobulle est visible à l'écran et dans les exports.
- M6. Droits Acheteur local/import : périmètre des BC et exports « à confirmer » (journal LOT-18) ; à vérifier avec deux comptes d'acheteurs de périmètres différents sur export Excel des BC.
- M7. Dépôt de travail : fichiers non suivis (`scripts-fantome/`, `voir-la-demo.ps1`, `skills-lock.json`, `.claude/skills/...`) et dossiers `tests/e2e/_recette`, `_dbg` : à exclure ou supprimer avant livraison au client (règle 9, dépôt propre).
- M8. Inventaire : pas d'emplacement par article (liste triée par code) et périmètre du Magasinier non restreint par dépôt : à noter pour un magasin multi-zones.
- M9. Recomptage demandé à la main écrasé si le premier comptage est modifié (journal LOT-11) : message d'avertissement à ajouter.

## Couverture des exigences (lecture)

| Exigence | Verdict | Remarque |
|---|---|---|
| EX-01, 02, 04 Accès, rôles, audit | OK | Rôles et permissions centralisés, audit sur réception, annulation, retour, NC. |
| EX-03 Accès distant HTTPS | OK avec réserve | HSTS/CSP codés, à vérifier en production (I8). |
| EX-05 Essai / licence | OK | Horloge de test impossible en production, protection recul d'horloge. |
| EX-10, 11, 12 Référentiels et import | Réserve | Règle des codes (B1). |
| EX-20, 21, 22, 23 DA, validation, BC, PDF | OK | Workflow complet, numérotation serveur, avenants, relances. M1. |
| EX-24 Réceptions | OK | Partiel, refus, sur-livraison, reliquat, retour, contre-passation. |
| EX-25 Factures | Réserve | I1, I2, I3. |
| EX-26 Comparatif des offres | Reporté | Volontaire. |
| EX-30, 31, 32, 33 Stock, seuils, inventaires, PMP | OK | Mouvements uniques, comptage aveugle, alerte rupture critique immédiate. |
| EX-40, 41, 42 Import, approche, dédouané | OK | Répartition exacte, clôture avec réévaluation du PMP (H55). Édition de dossier : I2. |
| EX-50, 51 Évaluation fournisseurs | Reporté | Affiché « Non disponible », jamais inventé. |
| EX-60, 61, 62, 63 Tableau de bord, KPI, rapports | OK | I6 pour le Magasinier. |
| EX-64 Alertes 8h / 15h | Réserve | B2. |
| EX-70 Sage | Non livré | I4. |

## Ce qui manquerait à M. DIBI le jour de la démo

1. Un import de ses vrais codes Sage qui passe (B1) : sans cela, la démo reste sur des données fictives.
2. Une alerte qui arrive réellement à 8h et à 15h (B2) : à faire tourner la veille.
3. Une facture saisie à l'identique du papier (I1).
4. Une réponse nette sur Sage : ce qui part, dans quel format, quand (I4).

## Idées à forte valeur (au plus 3)

1. Export Sage des factures « Bon à payer » et des entrées de stock au format d'import officiel (LOT-17), avec journal des exports déjà transmis pour éviter les doubles saisies.
2. Page « Santé du système » pour le Responsable et le Super-admin : dernier envoi d'alertes, dernière sauvegarde, espace disque de `storage/`, état de la licence.
3. Réévaluation du PMP sur écart de prix de facture accepté (I3), qui fait de la valeur de stock un chiffre réellement fiable pour la direction.
