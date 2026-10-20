# Journal du projet

Le plus récent en haut. Format : date · lot · fait · décisions · suite.

## 2026-10-20 · LOT-D partie 1 · Fondations du design
- Fait : Inter/JetBrains Mono (bug serif corrigé), tokens clair/sombre, menu latéral, en-tête, recherche Ctrl+K, composants partagés (DataTable, KpiCard, StatusStepper, Timeline, EmptyState, Skeleton), connexion, fenêtre d'essai, toutes les pages existantes. Captures dans docs/captures/.
- Reste (LOT-D partie 2) : revue web-design-guidelines, formulaires en profondeur, graphiques, PDF du BC, raccourci N, barre d'actions groupées flottante.

## 2026-10-20 · LOT-06 · Réceptions
- Fait : schéma commun réceptions + stock (migration receptions_stock, CHECK SQL), cœur stock applyMovement/PMP, réception contre BC (partielle, refus → non-conformité, sur-livraison avec accord Responsable, contre-passation, solde de reliquat, retour fournisseur côté serveur), écrans tablette, Magasinier sans prix. 999 tests, e2e S0/S1/S2 verts (desktop + S2 tablette).
- Décisions à confirmer (H67 à H74, docs/plans/LOT-06.md) : reliquat soldé jamais rouvert automatiquement ; tolérance de sur-livraison sur (commandé − soldé) ; livraison anticipée (> 7 jours) invisible dans « Attendues » (option : bloc « Plus tard »).
- Reste : écran du retour fournisseur ; la migration a été complétée à la main sur la base de dev (checksum) : vérifier avec migrate reset à la finalisation.

## 2026-10-19 · LOT-05 · Bons de commande
- Fait : BC (brouillon, validation avec numéro, envoi, confirmation avec date promise, relance, avenant, annulation, clôture), PDF à la demande, écran « À commander » regroupé par fournisseur, retour de statut des DA, pastilles d'accueil, paramètres société/logo/règles BC, adresse des dépôts. 917 tests, 104 e2e (S1 étendu, SC1 à SC6, desktop + tablette).
- Décisions : H51 à H66 (à confirmer) dans docs/plans/LOT-05.md. Mode express : recette métier du lot reportée à la recette globale (étape finalisation démo).
- Réserves : BC import USD, rejet/renvoi, clôture et seuil d'auto-validation couverts en intégration seulement ; validation de formulaire BC côté serveur (message général).
- Suite : LOT-D partie 1 (design), puis LOT-06, 07, 08.

## 2026-10-19 · LOT-04 · Demandes d'achat et validation
- Fait : DA (brouillon, soumission, à compléter, validation à quantités réductibles, refus, annulation), numérotation à la soumission, DA de réapprovisionnement Magasinier, pièces jointes, avertissement de doublon, assignation à l'acheteur du bon périmètre, validation groupée, chronologie (PurchaseRequestEvent), cloche de notifications (Notification), bandeau rouge arrêt de production, seuil de validation en réglage, export. 653 tests, 90 e2e (S1, SD1-SD5 desktop + tablette).
- Décisions : H37 à H50 (à confirmer), dont auto-validation du Responsable, brouillon d'autrui invisible même au Responsable, priorité remise à normale à la clôture. Relecture corrigée (plafond INTEGER, doublons anonymisés, approveMany, QTY_CHANGED). Recette « accepté avec réserves » (docs/recette/LOT-04.md).
- Réserves : le Responsable peut encore modifier/annuler/joindre sur un brouillon d'autrui par id (à confirmer) ; DA closes en base avec priorité 0 non migrées ; C2 augmentation de quantité à la validation à confirmer avec M. DIBI ; bandeau rouge rafraîchi seulement à la navigation.
- Idées : alerte acheteur dès la soumission d'un arrêt de production ; ancienneté des DA ; bouton « Créer le BC » + relance 48 h (LOT-05).
- Suite : LOT-05 (bons de commande).

## 2026-10-19 · LOT-03 · Référentiels
- Fait : articles (fiche à onglets, photo, conversion unité achat/stock, criticité), fournisseurs (contacts, blocage avec motif, coordonnées), dépôts, services, devises et taux datés, réglage prix magasinier, DataTable partagé (URL, cartes tablette, export Excel), seed fictif (40 articles, 25 fournisseurs). 461 tests, 78 e2e.
- Décisions : prix et MOQ exprimés par unité d'achat ; verrou SELECT FOR UPDATE + expectedUpdatedAt ; code refusé s'il dépasse 17 car. ; écart de taux >20 %% à confirmer. H22 à H36 (à confirmer, dont format du code sur export Sage réel). Recette « accepté avec réserves » (docs/recette/LOT-03.md).
- Réserve : SR4 fournisseurs/tablette a échoué 2 fois en suite complète puis passé ; cause probable = course dans le test (corrigé), non observée en échec. À surveiller.
- Suite : LOT-04 (demandes d'achat).

## 2026-10-19 · LOT-02 · Période d'essai et licence
- Fait : statut calculé côté serveur (borne stricte, 23:59 Abidjan), badge et fenêtre de compte à rebours, rappels J-7/J-3/J-1/dernier jour, bandeau et consultation seule après échéance, page /parametres/licence (activation par clé HMAC, prolongation), script license:generate. 324 tests, 62 e2e.
- Décisions : TEST_NOW réservé aux tests ; nom du bénéficiaire normalisé avant HMAC ; contact affiché via CONTACT_EMAIL/CONTACT_PHONE. H15 à H21 (H20, H21 à confirmer). Recette « accepté avec réserves » (docs/recette/LOT-02.md).
- À rejouer au LOT-04 : DA refusée / export possible à l'expiration. Jason : définir LICENSE_SECRET, TRIAL_*, CONTACT_* (docs/blocages.md) ; supprimer tests/e2e/_dbg et _recette.
- Suite : LOT-03.

## 2026-10-19 · LOT-01 · Authentification et rôles
- Fait : connexion Auth.js (JWT 8 h), matrice de permissions (41 actions), verrouillage 5 échecs/15 min atomique, audit, utilisateurs, mon compte, journal, mise en page par rôle. 282 tests unitaires/intégration, 26 e2e.
- Décisions : comptes seed @richbond.test ; Import filtré par périmètre acheteur ; actions de comptes autorisées en essai expiré pour le Super-admin (A9) ; recette « accepté avec réserves » (docs/recette/LOT-01.md). H10 à H14 ajoutées.
- Suite : LOT-02 (essai, compte à rebours, licence).

## 2026-10-18 · LOT-00 · Initialisation
- Fait : Next.js 16, Tailwind 4, shadcn, Prisma 7 (User, Counter, AuditLog, License), src/lib, numérotation transactionnelle (tx obligatoire), seed fictif, Vitest (32 tests), Playwright (2), CI GitHub Actions.
- Décisions : Prisma figé à 7.10.1 ; seed sans mot de passe en dur (SEED_DEFAULT_PASSWORD obligatoire) ; recette « accepté avec réserves » (docs/recette/LOT-00.md).
- À faire par Jason : vérifier .env.example (clés TRIAL_*, LICENSE_SECRET, SMTP_*, SEED_DEFAULT_PASSWORD) — voir docs/blocages.md. Essai fixé à 30 jours au seed, à reprendre au LOT-02.
- Suite : LOT-01.

## 2026-10-18 · Cadrage
- Dossier projet créé : contexte client, 19 lots spécifiés, scénarios de test, agents IA de développement et de test, guide Sage.
- Utilisateurs : Responsable Achats (M. DIBI), 2 acheteurs, 1 magasinier ; noms à saisir plus tard.
- Période d'essai accordée au client : compte à rebours prioritaire (LOT-02).
- Suite : LOT-00.

## Relecture LOT-04 (corrections)
- Corrigés : montants plafonnés à 2 147 483 647 (schéma + totals), brouillon d'autrui invisible (canViewRequest), doublons anonymisés pour le Magasinier, approveMany INTERNAL, checkDuplicates dans le module, plafond d'export sur les lignes, commentaire d'en-tête export, payload QTY_CHANGED (code + désignation), date de notification via `formatDateOnly`.
- Restent à traiter (points 9, 12, 13, 14, non triviaux ou non précisés) : le Responsable peut encore modifier/annuler/joindre sur le brouillon d'autrui par identifiant (la lecture est interdite) ; à confirmer.
