# Mode EXPRESS – démo très belle demain, puis application complète au plus vite

Priorités, dans l'ordre : 1) beau, 2) solide, 3) rapide.
Le système de design est dans **`DESIGN.md`** (racine) : le lire avant tout travail d'interface. Utiliser aussi le skill
`design-taste-frontend` (réglages VARIANCE 3 / MOTION 3 / DENSITY 7) et la revue `web-design-guidelines` s'ils sont installés.

## Ordre de travail (sans attendre de validation)
1. **Terminer LOT-05** (scénarios du lot, corrections, fusion).
2. **LOT-D partie 1 – Fondations du design** (`docs/specs/LOT-D-design.md` + `DESIGN.md`) :
   polices (corriger le texte qui s'affiche en police à empattements), tokens clair/sombre, menu latéral, en-tête, bandeau d'alerte,
   composants partagés (badges, tableaux, filtres, onglets, cartes KPI, états vides, squelettes, fenêtre d'essai, connexion),
   puis application à **toutes les pages existantes**. Boucle de contrôle visuel par captures (DESIGN.md §7).
3. **LOT-06 Réceptions**, **LOT-07 Stock**, **LOT-08 Tableau de bord** en mode allégé, écrans construits directement avec les composants du design.
4. **Finalisation démo** : seed riche et réaliste (6 mois d'historique), non-régression complète, une recette métier globale,
   une relecture sécurité, corrections, captures finales dans `docs/captures/`, `docs/demo-1.md`, fusion, push.
   Écris-moi le compte rendu « DÉMO PRÊTE » puis **continue sans t'arrêter**.
5. **Suite de l'application** : LOT-09 à LOT-18 dans l'ordre du plan, même mode allégé, même design.
   Recette métier et relecture globales **tous les 3 lots** (après 11, 14, 17) et complètes au LOT-18.

## Mode allégé (vitesse et économie de quota)
- Plan court de `chef-de-projet` (1 page : tâches et fichiers).
- `dev-backend` et `dev-frontend` **en parallèle** dès que le schéma Prisma du lot est posé.
- Tests unitaires sur les règles critiques uniquement ; Playwright : seulement le scénario du lot (suite complète aux étapes de recette).
- Sous-agents en modèle **sonnet**, sauf `chef-de-projet` (opus, plan court).
- Ne lire que les fichiers utiles.

## Non négociable
Droits vérifiés côté serveur, garde de licence, stock uniquement par mouvements, numérotation transactionnelle,
aucune donnée réelle, lint + typecheck verts avant chaque fusion, conformité à `DESIGN.md`.

## Si interruption
Relire ce fichier, `docs/03-plan-des-lots.md`, `git status`, `git log --oneline -10`, et reprendre à l'étape en cours.
