# Campagne E2E finale – Playwright (branche lot/campagne-finale)

Fichiers joués un par un, base de test réinitialisée et seedée par le `globalSetup`, port 3100.
Date du jour de la campagne : 01/11/2026.

| Fichier | Tests | desktop | tablette |
|---|---|---|---|
| S0-1-acces-et-roles | 12 | passé | passé |
| S0-2-essai | 18 | passé | passé |
| S1-bc | 1 | passé | passé |
| S1-da | 1 | passé | passé |
| S2-facture | 1 | passé | passé |
| S2-reception | 3 | passé | passé |
| S3-reappro | 2 | passé | passé |
| S5-inventaire | 1 | passé | passé |
| S6-dossier-import | 1 | passé | non joué (desktop seulement) |
| S7-alertes | 2 | passé | passé |
| S8-rapports | 1 | passé | ignoré (parcours desktop seulement, `test.skip` voulu) |
| SC-commandes | 6 | passé | passé |
| S-dashboard | 4 | passé (après correction) | passé (après correction) |
| SD-demandes | 5 | passé | passé |
| S-import | 3 | passé | passé |
| SR-referentiels | 8 | passé | passé |

## Échec rencontré et corrigé

- S-dashboard, scénario Responsable, étape « KPI du mois » : la carte « Livraisons à temps » affichait `–` au lieu d'un `%`.
  Cause : test dépendant de la date réelle. Le 01/11/2026 le mois courant n'a aucune réception validée (les données du seed
  sont en mai-octobre), donc le taux est correctement indéfini. Défaut du test, pas de l'application.
  Correction : le test simule désormais (`TEST_NOW`) la date de la dernière réception validée avant de se connecter ; l'assertion `%` est inchangée.

## Échecs restants

Aucun.

Remarque : `tests/e2e/scenarios/S8-rapports.spec.ts` et `tests/unit/reporting.reports.test.ts` avaient des modifications non commitées
(hors de cette campagne) ; S8 a été joué avec ces modifications.
