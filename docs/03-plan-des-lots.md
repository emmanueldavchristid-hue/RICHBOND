# Plan des lots

Les lots s'exécutent **dans l'ordre, sans attendre de validation**. Mettre à jour la colonne Statut à chaque fin de lot :
`À faire` → `En cours` → `Terminé` (ou `Bloqué` avec renvoi vers `docs/blocages.md`).
Pour reprendre après une interruption (limite d'usage, coupure) : relire ce tableau et repartir du premier lot non terminé.

| Lot | Nom | Exigences | Statut |
|---|---|---|---|
| LOT-00 | Initialisation et outillage | – | Terminé |
| LOT-01 | Authentification, rôles, utilisateurs, journal d'audit, mise en page | EX-01, 02, 04 | Terminé |
| LOT-02 | Période d'essai, compte à rebours, licence | EX-05 | Terminé |
| LOT-03 | Référentiels : articles, fournisseurs, dépôts, services, devises | EX-10, 11 | Terminé |
| LOT-04 | Demandes d'achat et workflow de validation | EX-20, 21 | Terminé |
| LOT-05 | Bons de commande, PDF, suivi des délais et relances | EX-21, 22, 23 | Terminé |
| LOT-06 | Réceptions, contrôle, non-conformités, retours | EX-24, 30 | À faire |
| LOT-07 | Stock : mouvements, sorties, PMP, seuils, prévision de rupture, réappro | EX-30, 31, 33 | À faire |
| LOT-08 | Tableau de bord d'accueil par rôle | EX-60, 61 | À faire |
| **Jalon** | **DÉMO 1 au client** (parcours complet DA → stock + tableau de bord) | | |
| LOT-09 | Import Excel/CSV des données initiales | EX-12 | À faire |
| LOT-10 | Consultations et comparatif des offres | EX-26 | À faire |
| LOT-11 | Inventaires hebdomadaires (mode tablette) | EX-32 | À faire |
| LOT-12 | Achats import, frais d'approche, coût d'arrivée dédouané | EX-40, 41, 42 | À faire |
| LOT-13 | Factures fournisseurs et rapprochement BC / réception / facture | EX-25 | À faire |
| LOT-14 | Évaluation et panel fournisseurs | EX-50, 51 | À faire |
| LOT-15 | KPI avancés et rapports quotidiens / hebdo / mensuels | EX-61, 62, 63 | À faire |
| LOT-16 | Alertes 8h / 15h et centre de notifications | EX-64 | À faire |
| LOT-17 | Intégration Sage 100 | EX-70 | À faire |
| LOT-18 | Durcissement, sauvegardes, guide utilisateur, déploiement | EX-03 | À faire |

## Définition de « Terminé » pour un lot
1. Tous les critères d'acceptation de la spec sont vérifiés.
2. `npm run lint`, `npm run typecheck`, `npm test` passent.
3. Les scénarios de workflow du lot (`docs/05-scenarios-de-test.md`) passent dans Playwright.
4. Rapport de recette métier écrit dans `docs/recette/LOT-xx.md` (aucun point bloquant ouvert).
5. Seed mis à jour pour que la démo montre la fonctionnalité.
6. Branche fusionnée dans `main`, poussée sur GitHub, journal mis à jour.
