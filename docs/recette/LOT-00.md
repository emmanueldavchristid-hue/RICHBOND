# Recette LOT-00 – Initialisation et outillage

- Date : 18/10/2026
- Branche : `lot/00-initialisation` (commit `31c6d59`), comparée à `main` (`4ca9796`, cadrage)
- Recetteur : agent recette métier (ancien Responsable Achats)
- Périmètre : critères d'acceptation de `docs/specs/LOT-00-initialisation.md`. Aucun fichier `.env*` n'a été lu.

## Verdict : **Accepté avec réserves**

Le socle démarre, se teste et passe tous les contrôles. Seule réserve : `.env.example` (fichier de cadrage) a été réécrit
au lieu d'être complété, avec un risque de perte de clés utiles à la licence d'essai (LOT-02). Le point est déjà inscrit
dans `docs/blocages.md` ; il doit être levé avant le LOT-02.

## Critères d'acceptation

| # | Critère | Résultat | Preuve |
|---|---|---|---|
| 1 | `npm run dev` affiche une page d'accueil provisoire « RICHBOND – Achats & Stocks » | OK | `src/app/page.tsx` : titre h1 « RICHBOND – Achats & Stocks » + « Application en cours d'initialisation. » ; `layout.tsx` : `lang="fr"`, titre d'onglet identique. Vérifié par Playwright sur serveur dev (port 3100). |
| 2 | `npm run lint`, `npm run typecheck`, `npm test` passent | OK | lint : 0 erreur ; typecheck (`next typegen && tsc --noEmit`) : OK ; `npm test` : 6 fichiers, 31 tests verts (unitaires + intégration sur `richbond_test`). Node v24.12.0. |
| 3 | Test de numérotation concurrente vert | OK | `tests/integration/numbering.concurrency.test.ts` : 4/4 verts. 20 appels parallèles → numéros 1 à 20, uniques et consécutifs ; clés/années indépendantes ; numéro non consommé si la transaction est annulée ; clé inconnue refusée. Incrément atomique `INSERT … ON CONFLICT DO UPDATE … RETURNING`. |
| 4 | Un test Playwright « la page s'ouvre » passe | OK | `tests/e2e/accueil.spec.ts` : 2/2 verts (projets `desktop` et `tablette` iPad paysage). |
| 5 | Les fichiers de cadrage existants sont intacts | OK avec réserve | `CLAUDE.md`, `README.md`, `.claude/`, `docs/specs`, autres `docs/` : aucun changement. `docs/00-contexte-client.md` : 2 lignes ajoutées (H8, H9), conforme à la méthode « à confirmer ». `.gitignore` : 2 lignes ajoutées (`/src/generated/`, `/playwright/.auth/`), sans suppression. **`.env.example` : 42 lignes modifiées (réécriture)**, voir anomalie I1. |

Points « À faire » hors critères, contrôlés pour information : dépendances demandées toutes présentes ; scripts `dev`, `build`,
`start`, `lint`, `typecheck`, `test`, `test:e2e`, `db:migrate`, `db:seed`, `db:reset` présents ; schéma Prisma limité à `User`,
`Counter`, `AuditLog`, `License` + migration `init` ; seed fictif (domaine `exemple.ci`) ; `src/lib/` (`db`, `money`, `dates`,
`errors`) présent ; Playwright avec `webServer` et base de test séparée ; CI GitHub Actions (install, generate, lint, typecheck, tests)
avec PostgreSQL de service.

## Anomalies

### Bloquant
Aucune.

### Important
- **I1 – `.env.example` réécrit au lieu d'être complété.** La spec dit « sans écraser `.env.example` ». Des clés de l'original
  (`TRIAL_END_DATE`, `TRIAL_DAYS`, `LICENSE_SECRET`, `TZ`, `SMTP_*` selon `docs/blocages.md`) ont pu disparaître. Elles conditionnent
  le compte à rebours d'essai (LOT-02, prioritaire pour le client) et les notifications. À faire par Jason :
  `git diff 4ca9796 -- .env.example` puis réintégrer les clés manquantes. À lever **avant** le démarrage du LOT-02.
- **I2 – Durée d'essai codée en dur dans le seed** (`prisma/seed.ts` : 30 jours à partir de la date du seed). Si le seed est relancé
  sur une base vide le jour de l'installation, la date de fin d'essai dépend du moment du seed et non de la date convenue avec le
  client. À reprendre au LOT-02 : date de fin lue depuis la configuration (`TRIAL_END_DATE` / `TRIAL_DAYS`) et tracée dans `AuditLog`.

### Confort
- C1 – Composant shadcn `form` remplacé par `field` (nouvelle génération shadcn). Sans impact, mais l'écart avec la spec mérite
  une ligne dans `docs/journal.md`.
- C2 – Mot de passe de repli `ChangeMe-dev-2026` dans le seed hors production : acceptable en dev, à ne jamais utiliser pour la démo.
- C3 – Avertissements Vitest (config chargée en CommonJS, plugin `vite-tsconfig-paths` devenu inutile) : bruit dans les journaux de test.
- C4 – Le helper `loginAs` est un `fixme` (normal : l'authentification arrive au LOT-01). À vérifier en recette LOT-01.
- C5 – La CI n'exécute pas les tests Playwright : conforme à la spec (unitaires seulement), à ajouter quand les parcours métier existeront.
- C6 – Modifications non commitées sur la branche (`docs/03-plan-des-lots.md`, `docs/blocages.md`, `docs/plans/`) : à committer avant fusion.

## Idées d'amélioration à forte valeur (lots suivants)
1. **Numéros de pièces lisibles par l'acheteur dès le LOT-01/03** : afficher partout le numéro formaté (`DA-2026-00001`) et utiliser
   `currentYear()` (fuseau Abidjan) pour le changement d'année au 1er janvier ; prévoir un test « 31/12 23:59 → 01/01 00:00 ».
2. **Bandeau d'essai visible dès la page d'accueil (LOT-02)** : « Période d'essai : J-12 (fin le JJ/MM/AAAA) », c'est la première
   chose que M. DIBI regardera à la démo.
3. **Jours fériés ivoiriens (hypothèse H8)** : les ajouter au calcul des jours ouvrés avant le suivi des délais fournisseurs, sinon les
   relances de BC en retard seront fausses autour de Tabaski, Pâques, 7 août, etc.
