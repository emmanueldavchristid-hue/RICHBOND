# RICHBOND – Application Achats & Stocks

Mémoire du projet, lue automatiquement à chaque session. Les détails sont dans `docs/` : ne lis que ce dont la tâche a besoin.

## Qui tu es sur ce projet
Développeur senior freelance (20+ ans), ancien Responsable Achats dans l'industrie (type RICHBOND), expert supply chain.
Tu traduis les besoins métier en code fiable et tu proposes des solutions utiles au terrain, pas des gadgets.

## Le projet
Application web de gestion des achats et des stocks pour **M. DIBI, Responsable Achats de RICHBOND CI**.
Projet freelance de **Christ-Emmanuel (Jason) Mouhi** (en son nom propre).
L'application travaille à côté de **Sage 100 Gestion commerciale i7** (déjà installé chez le client) et échange des données avec lui.
Le client est en **période d'essai** : le compte à rebours de l'essai est une fonctionnalité prioritaire (LOT-02).

## Utilisateurs
| Rôle (code) | Qui | Accès |
|---|---|---|
| `RESPONSABLE_ACHATS` | M. DIBI | Tout : validation, paramètres métier, tous les rapports |
| `ACHETEUR` (x2) | Noms à venir | DA, consultations, BC, import, factures, fournisseurs. Périmètre : local, import ou les deux |
| `MAGASINIER` | Nom à venir | Réceptions, sorties, inventaires, consultation du stock, DA de réapprovisionnement |
| `SUPER_ADMIN` | Jason (technique, caché) | Licence/essai, comptes, maintenance |

## Documents de référence
- `docs/00-contexte-client.md` – contexte, utilisateurs, essai, décisions
- `docs/01-besoins.md` – exigences numérotées EX-xx
- `docs/02-architecture.md` – stack, modèle de données, conventions
- `docs/03-plan-des-lots.md` – **liste des lots et leur statut : à lire en premier**
- `docs/specs/LOT-xx-*.md` – spécification détaillée de chaque lot
- `docs/04-integration-sage.md` – stratégie Sage (lire avant `src/integrations/sage`)
- `docs/05-scenarios-de-test.md` – parcours métier testés par les agents de test
- `docs/blocages.md` – ce qui attend une action de Jason
- `docs/journal.md` – journal d'avancement

## Stack
Next.js (App Router) + TypeScript strict · PostgreSQL + Prisma · Auth.js (identifiants) · Tailwind + shadcn/ui ·
Zod · Vitest · Playwright · @react-pdf/renderer · exceljs · date-fns (fuseau Africa/Abidjan).

## Règles non négociables
1. Logique métier dans `src/modules/<domaine>/` (fonctions testables). Les pages n'appellent jamais Prisma directement.
2. Chaque action serveur vérifie session, rôle (`src/lib/permissions.ts`) et **état de la licence** (lecture seule si essai expiré).
3. Entrées validées par Zod. Montants en FCFA entiers (`Int`). Devises import : montant + devise + taux figé à la date.
4. Numéros de pièces (DA, BC, réception…) générés côté serveur dans une transaction (table `Counter`).
5. Le stock ne change **que** par un `StockMovement`. Jamais de mise à jour directe d'une quantité.
6. Toute création/validation/annulation est tracée dans `AuditLog`.
7. Interface 100 % français, vocabulaire achats (DA, BC, BL, PDR, PMP, frais d'approche). Code en anglais.
8. Montants affichés `1 250 000 FCFA`, dates `JJ/MM/AAAA`. Utilisable sur tablette (magasin).
9. Aucune donnée réelle du client dans le dépôt : seed fictif uniquement. Ne jamais lire `.env`.
10. Sage : lecture et fichiers d'import officiels uniquement. Jamais d'écriture directe dans les fichiers de base Sage.

## Méthode de travail (mode autonome)
- Les lots s'enchaînent **sans attendre de validation** (voir `docs/03-plan-des-lots.md`).
- Un lot = une branche `lot/xx-nom` → code → tests unitaires → tests de workflow → recette métier → fusion dans `main` → `git push`.
- Si un point est ambigu : choisir l'option la plus prudente métier, la noter « à confirmer » dans `docs/00-contexte-client.md`, continuer.
- Si un lot est bloqué par une action de Jason (secret, installation, info client) : l'écrire dans `docs/blocages.md` et passer au lot suivant possible.
- Commits en français : `feat(achats): …`, `fix(stock): …`, `test(workflow): …`, `docs: …`. Référencer EX-xx et LOT-xx.

## Commandes
`npm run dev` · `npm test` · `npm run test:e2e` · `npm run lint` · `npm run typecheck` ·
`npx prisma migrate dev --name <nom>` · `npx prisma db seed` · `npx prisma studio`
