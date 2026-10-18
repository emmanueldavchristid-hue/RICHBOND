# Besoins – exigences numérotées

Source : cahier des charges RICHBOND (`docs/cahier-des-charges-RICHBOND.pdf`) + échanges avec Jason.
Le lot qui réalise chaque exigence est indiqué entre crochets.

## Problèmes actuels du client
Pas de tableau de bord ni de KPI · accès partagé et à distance difficile · numéros de BC désynchronisés ·
pas de suivi des commandes PDR import, des factures d'achat et du PMP · ruptures mal anticipées ·
peu de diversification des fournisseurs locaux.

## Accès
- EX-01 Connexion par compte individuel, mot de passe hashé, session sécurisée [LOT-01]
- EX-02 Rôles : Responsable Achats (illimité), 2 Acheteurs et Magasinier (limités), Super-admin technique [LOT-01]
- EX-03 Accès à distance via navigateur (HTTPS en production) [LOT-18]
- EX-04 Historique des actions sur tous les documents [LOT-01 socle, chaque lot alimente]
- EX-05 Période d'essai avec compte à rebours visible, lecture seule à l'échéance, activation par clé [LOT-02]

## Référentiels
- EX-10 Articles par catégorie : matières premières, intrants, PDR, fournitures, services [LOT-03]
- EX-11 ~150 fournisseurs, local / import [LOT-03]
- EX-12 Import initial Excel/CSV (ou export Sage) des articles, fournisseurs, stocks [LOT-09]

## Cycle d'achat
- EX-20 Demandes d'achat [LOT-04]
- EX-21 Workflow de validation [LOT-04, LOT-05]
- EX-22 Bons de commande à numérotation centralisée [LOT-05]
- EX-23 BC imprimable / PDF [LOT-05]
- EX-24 Bons de livraison / réceptions [LOT-06]
- EX-25 Suivi des factures d'achat [LOT-13]
- EX-26 Tableaux de comparaison des offres fournisseurs [LOT-10]

## Stock
- EX-30 Entrées / sorties de stock [LOT-06, LOT-07]
- EX-31 Seuils de réapprovisionnement et anticipation des ruptures [LOT-07]
- EX-32 Inventaires hebdomadaires dans l'application [LOT-11]
- EX-33 PMP [LOT-07]

## Import
- EX-40 Suivi des achats import (PDR import notamment) [LOT-12]
- EX-41 Calcul des frais d'approche [LOT-12]
- EX-42 Coût d'arrivée dédouané [LOT-12]

## Fournisseurs
- EX-50 Évaluation des fournisseurs [LOT-14]
- EX-51 Diversification des sources locales [LOT-14]

## Pilotage
- EX-60 Tableau de bord synthétique dès l'accueil [LOT-08]
- EX-61 KPI [LOT-08, LOT-15]
- EX-62 Rapports quotidiens : demandes, commandes, livraisons, entrées/sorties [LOT-15]
- EX-63 Rapports hebdomadaires et mensuels [LOT-15]
- EX-64 Alertes 2 fois par jour (8h et 15h) par notifications internes [LOT-16]

## Intégration
- EX-70 Intégration avec Sage 100 [LOT-17]
