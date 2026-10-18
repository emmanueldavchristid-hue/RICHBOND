# Plan d'exécution – LOT-00 Initialisation et outillage

Branche : `lot/00-initialisation`. Contexte machine : Windows 11, Node 24, npm 11, PostgreSQL 18 (service `postgresql-x64-18`), `.env` présent (**ne jamais le lire ni l'afficher**).
Aucune exigence EX-xx (lot technique). Pas de métier : seulement le socle dont LOT-01 et LOT-02 dépendent.

## Choix techniques retenus (option prudente)
| # | Choix | Raison |
|---|---|---|
| T1 | Next.js dernière stable (App Router, `src/`, Turbopack par défaut) | Spec. Si Next ≥ 16 : `next lint` n'existe plus → script `lint` = `eslint .` |
| T2 | **Prisma 7** (générateur `prisma-client`, `prisma.config.ts`, adaptateur `@prisma/adapter-pg` + `pg`) | Plus de moteur binaire Rust → supprime le verrou Windows `EPERM … query_engine-windows.dll.node` quand `npm run dev` tourne. Si blocage majeur : repli Prisma 6.x figé, noté au journal |
| T3 | Client généré dans `src/generated/prisma` (ignoré par Git), import `@/generated/prisma/client` | Prisma 7 exige un `output` explicite |
| T4 | Auth.js = `next-auth@beta` (v5) installé, **non câblé** (LOT-01) | Évite du code d'auth à refaire |
| T5 | Tailwind v4 (pas de `tailwind.config.js`), shadcn/ui CLI `npx shadcn@latest`, toasts via **sonner** (`toast` est déprécié) | Versions actuelles |
| T6 | Compteur atomique par `INSERT … ON CONFLICT DO UPDATE … RETURNING` dans la transaction appelante | Pas de trou ni doublon sous concurrence, pas de retry de sérialisation |
| T7 | Tests d'intégration DB (numérotation) sur `DATABASE_URL_TEST` ; en CI : service `postgres:18` | Critère « 20 appels parallèles » exige une vraie base |
| T8 | Espace des milliers = espace insécable U+00A0 (Intl `fr-FR` produit U+202F → normalisé) | Affichage `1 250 000 FCFA` sans coupure de ligne, tests déterministes |

## Tâches ordonnées
| # | Tâche | Agent | Fichiers |
|---|---|---|---|
| 1 | Prérequis : `node -v`, `npm -v`, `git --version`, service PG démarré (`Get-Service postgresql-x64-18`). Vérifier l'accès base **sans lire `.env`** : `npx prisma migrate status` après l'étape 5. Créer les bases `richbond` et `richbond_test` si absentes via `"C:\Program Files\PostgreSQL\18\bin\psql.exe"` (psql souvent absent du PATH). Si identifiants inconnus → `docs/blocages.md`, continuer sans base | dev-backend | – |
| 2 | Scaffold **dans un dossier temporaire** (create-next-app refuse un dossier non vide) : `npx create-next-app@latest <scratchpad>/scaffold --ts --app --src-dir --tailwind --eslint --import-alias "@/*" --use-npm --no-git --yes`, puis copier à la racine **sauf** `README.md`, `.gitignore`, `node_modules`, `.git`. Fusionner manuellement le `.gitignore` (ajouter `/src/generated/`, `/playwright/.auth/`). Vérifier par `git diff --stat` que `CLAUDE.md`, `docs/`, `.claude/`, `README.md`, `.env.example`, `.gitattributes`, `installer.ps1` sont intacts. `npm install` à la racine | dev-backend | `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `src/app/*` |
| 3 | Dépendances : `prisma @prisma/client @prisma/adapter-pg pg dotenv next-auth@beta bcryptjs zod react-hook-form @hookform/resolvers @tanstack/react-table recharts date-fns date-fns-tz exceljs @react-pdf/renderer lucide-react` ; dev : `vitest @vitest/coverage-v8 vite-tsconfig-paths @playwright/test tsx prettier eslint-config-prettier cross-env @types/pg @types/bcryptjs` (si bcryptjs < 3). `npx playwright install chromium` | dev-backend | `package.json` |
| 4 | shadcn : `npx shadcn@latest init` (style par défaut, couleur neutre), puis `add button input select dialog alert-dialog table badge card tabs dropdown-menu sheet sonner form calendar popover tooltip label`. Si `form` est remplacé par `field` dans la version courante : ajouter les deux | dev-frontend | `components.json`, `src/components/ui/*`, `src/lib/utils.ts` |
| 5 | Prisma : `prisma.config.ts` (charge `dotenv/config`, schéma, `migrations.seed = "tsx prisma/seed.ts"`), `prisma/schema.prisma` (modèles ci-dessous), migration `npx prisma migrate dev --name init` | dev-backend | `prisma.config.ts`, `prisma/schema.prisma`, `prisma/migrations/*` |
| 6 | `src/lib/` : `db.ts`, `money.ts`, `dates.ts`, `errors.ts` (détail ci-dessous) | dev-backend | `src/lib/*.ts` |
| 7 | `src/modules/numbering/` : `index.ts` (`nextNumber`, `formatDocumentNumber`), `keys.ts` (préfixes et largeur H3) | dev-backend | `src/modules/numbering/*` |
| 8 | Seed fictif idempotent (`upsert`) | dev-backend | `prisma/seed.ts` |
| 9 | Page d'accueil provisoire « RICHBOND – Achats & Stocks » (FR, `lang="fr"`, métadonnées FR, Toaster sonner dans le layout) | dev-frontend | `src/app/layout.tsx`, `src/app/page.tsx` |
| 10 | Vitest : `vitest.config.ts` avec 2 projets `unit` (`tests/unit/**`, env node) et `integration` (`tests/integration/**`, `DATABASE_URL` forcé à `DATABASE_URL_TEST`, `fileParallelism: false`, `globalSetup` = `prisma migrate deploy` sur la base de test). Exclure `tests/e2e/**` | testeur-unitaire | `vitest.config.ts`, `tests/setup/*` |
| 11 | Tests unitaires + intégration (liste ci-dessous) | testeur-unitaire | `tests/unit/*`, `tests/integration/*` |
| 12 | Playwright : `playwright.config.ts` (charge dotenv, `baseURL http://localhost:3100`, `webServer: { command: "npm run dev -- -p 3100", env: { DATABASE_URL: process.env.DATABASE_URL_TEST }, reuseExistingServer: !process.env.CI, timeout: 120_000 }`, chromium + profil tablette `iPad (gen 7)` paysage), helper `tests/e2e/helpers/auth.ts` (`loginAs(page, role)` – identifiants du seed, corps `test.fixme` tant que LOT-01 n'existe pas), test `tests/e2e/accueil.spec.ts` | testeur-workflow | `playwright.config.ts`, `tests/e2e/*` |
| 13 | Scripts `package.json` + Prettier (`.prettierrc` : `endOfLine: "lf"`, `.prettierignore` : `src/generated`, `docs`) | dev-backend | `package.json`, `.prettierrc`, `.prettierignore` |
| 14 | CI `.github/workflows/ci.yml` : `ubuntu-latest`, Node 24, `npm ci`, service `postgres:18` (DB `richbond_test`), env `DATABASE_URL`/`DATABASE_URL_TEST` factices, `npx prisma generate`, `lint`, `typecheck`, `test` | dev-backend | `.github/workflows/ci.yml` |
| 15 | `.env.example` complet et commenté (sans valeurs réelles) : `DATABASE_URL`, `DATABASE_URL_TEST`, `AUTH_SECRET`, `AUTH_URL`, `CRON_SECRET`, `APP_TIMEZONE=Africa/Abidjan`, `SEED_DEFAULT_PASSWORD`, `LICENSE_PUBLIC_KEY` (LOT-02), `SAGE_*` (LOT-17, commentés). Écrire le fichier complet (il est hors lecture autorisée : le réécrire, ne pas tenter de le lire) | dev-backend | `.env.example` |
| 16 | Relecture (règles CLAUDE.md, aucun secret, aucun fichier de cadrage modifié), puis recette `docs/recette/LOT-00.md` (critères d'acceptation cochés) | relecteur, recette-metier | `docs/recette/LOT-00.md` |
| 17 | Fin de lot : statut « Terminé », journal, hypothèses, fusion `main`, `git push` | chef-de-projet | `docs/*` |

## Schéma Prisma (LOT-00 uniquement)
- `enum Role { SUPER_ADMIN RESPONSABLE_ACHATS ACHETEUR MAGASINIER }`, `enum PurchaseScope { LOCAL IMPORT ALL }`, `enum LicenseStatus { TRIAL ACTIVE EXPIRED }`.
- `User` : `id` cuid, `name`, `email` unique (stocké en minuscules), `passwordHash`, `role`, `purchaseScope?` (ACHETEUR seulement), `active` (défaut true), `lastLoginAt?`, `createdAt`, `updatedAt`.
- `Counter` : `key` String, `year` Int, `value` Int défaut 0, `updatedAt` ; `@@id([key, year])`.
- `AuditLog` : `id`, `userId?` (relation User, `onDelete: SetNull`), `action` String (`CREATE`, `VALIDATE`, `CANCEL`…), `entity` String, `entityId` String, `before Json?`, `after Json?`, `createdAt` ; `@@index([entity, entityId])`, `@@index([userId, createdAt])`, `@@index([createdAt])`.
- `License` : `id`, `status`, `trialStartsAt`, `trialEndsAt`, `licensedTo?`, `activatedAt?`, `keyFingerprint?`, `createdAt`, `updatedAt` (une seule ligne attendue ; garde-fou applicatif en LOT-02).
- `@@map` en snake_case pluriel (`users`, `counters`, `audit_logs`, `licenses`) pour faciliter les requêtes SQL brutes.

## `src/lib/` – règles
- `db.ts` : singleton `PrismaClient` avec `PrismaPg({ connectionString })`, mis en cache sur `globalThis` en dev (sinon « too many connections » au rechargement à chaud). Importé **uniquement** depuis `src/modules/**`, `prisma/seed.ts` et les tests.
- `money.ts` : `formatFcfa(n: number): string` → `1 250 000 FCFA` (U+00A0, négatifs `-1 250 FCFA`), refuse les non-entiers ; `roundFcfa(x)` arrondi au franc, demi vers l'infini (pas d'arrondi bancaire) ; `toFcfa(amount, rate)` (devise × taux → Int) via chaînes/Decimal, jamais de cumul en flottant ; `parseFcfa("1 250 000")`.
- `dates.ts` : `APP_TZ = "Africa/Abidjan"`, `formatDate(d)` → `JJ/MM/AAAA`, `formatDateTime(d)` → `JJ/MM/AAAA HH:mm`, `currentYear(now?)` (année dans le fuseau, sert à la numérotation), `startOfDayAbidjan`, `addBusinessDays` (lun-ven ; jours fériés CI hors périmètre, noté H8). Tout calcul côté serveur via `date-fns-tz` (`formatInTimeZone`, `toZonedTime`, `fromZonedTime`).
- `errors.ts` : `class BusinessError extends Error { code: string; messageFr: string }` + `isBusinessError()` + type `ActionResult<T> = { ok: true; data: T } | { ok: false; code; message }` (servira à toutes les server actions).

## `src/modules/numbering/` – règles
- `nextNumber(key: CounterKey, year: number, tx?: Prisma.TransactionClient): Promise<number>` : exécute
  `INSERT INTO counters (key, year, value, updated_at) VALUES ($1,$2,1,now()) ON CONFLICT (key, year) DO UPDATE SET value = counters.value + 1, updated_at = now() RETURNING value`
  avec le `tx` fourni (le numéro est consommé dans **la même transaction** que la pièce : rollback ⇒ pas de trou). Sans `tx`, ouvre sa propre transaction.
- `formatDocumentNumber(key, year, value)` : `DA-2026-00001` (largeur 5 pour DA/BC/REC/SOR, 4 pour INV/IMP – H3). `CounterKey` = union typée, valeurs validées par Zod.
- Remise à 1 chaque année (clé composite `key, year`).

## Tests
**Unitaires (`tests/unit/`)**
- `money.test.ts` : 0, 1 250 000, négatif, très grand montant (≤ 2^31-1 pour `Int`), refus décimal, arrondi 0,5, conversion EUR→FCFA à 655,957.
- `dates.test.ts` : format `JJ/MM/AAAA`, passage de minuit UTC, `currentYear` au 31/12 23:59 et 01/01 00:00, jours ouvrés sur un week-end.
- `errors.test.ts` : `BusinessError` conserve code et message FR, `instanceof` correct.
- `numbering.format.test.ts` : formats et largeurs H3, clé inconnue rejetée.

**Intégration (`tests/integration/`, base de test)**
- `numbering.concurrency.test.ts` : 20 `nextNumber("DA", 2026)` en `Promise.all` → 20 valeurs uniques, ensemble = {1..20} ; années séparées indépendantes ; transaction annulée ⇒ numéro non consommé. Remise à zéro de `counters` en `beforeEach` (`TRUNCATE`).
- `seed.test.ts` : seed exécuté 2 fois → pas de doublon.

**E2E (`tests/e2e/`)**
- `accueil.spec.ts` : la page `/` s'ouvre, titre « RICHBOND – Achats & Stocks » visible, `html[lang=fr]`, en desktop et tablette.

## Seed (fictif)
- 1 `SUPER_ADMIN` (`admin@exemple.ci`), 1 `RESPONSABLE_ACHATS` fictif (`resp.achats@exemple.ci`), 2 `ACHETEUR` (LOCAL, IMPORT), 1 `MAGASINIER` ; mot de passe = `SEED_DEFAULT_PASSWORD` (refus d'exécuter si absent en production), hash bcrypt coût 12.
- 1 `License` TRIAL : `trialStartsAt = maintenant`, `trialEndsAt = +30 jours` (cf. contexte client), créée seulement si aucune n'existe.
- Aucun compteur pré-rempli. Aucune donnée réelle RICHBOND.

## Scripts `package.json`
`dev` (`next dev`), `build` (`prisma generate && next build`), `start`, `lint` (`eslint .`), `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `test:unit` (`vitest run --project unit`), `test:e2e` (`playwright test`), `db:migrate` (`prisma migrate dev`), `db:seed` (`prisma db seed`), `db:reset` (`prisma migrate reset --force`), `postinstall` (`prisma generate`), `format` (`prettier --write .`).
`db:reset` ne doit viser que la base locale : afficher un avertissement dans le README.

## Pièges Windows / Next.js / Prisma
1. **create-next-app** refuse un dossier non vide → scaffold ailleurs puis copier ; ne jamais lancer `--force` à la racine.
2. **Fins de ligne** : `.gitattributes` impose LF ; Prettier `endOfLine: "lf"` sinon ESLint/Prettier signalent tous les fichiers sous Windows.
3. **Variables d'environnement dans les scripts** : `VAR=x cmd` ne marche pas sous PowerShell/cmd → `cross-env` ou config (Playwright `webServer.env`, Vitest `env`).
4. **Prisma 7 ne charge plus `.env` automatiquement** → `import "dotenv/config"` dans `prisma.config.ts`, `seed.ts`, `playwright.config.ts`, setup Vitest.
5. **Shadow database** de `migrate dev` : l'utilisateur PG doit avoir le droit `CREATEDB` ; sinon erreur P3014 → blocage à documenter.
6. **PostgreSQL 18** : vérifier que le port (5432 par défaut, parfois 5433 si plusieurs versions installées) correspond à `DATABASE_URL` ; message d'erreur P1001 = service arrêté ou mauvais port.
7. **Hot reload Next** : singleton Prisma sur `globalThis`, sinon épuisement des connexions.
8. **Client Prisma côté navigateur** : `db.ts` ne doit jamais être importé dans un composant `"use client"` ; ajouter `import "server-only"` dans `db.ts` (sauf pour le seed/tests : exposer `createPrismaClient()` sans `server-only` dans un fichier séparé si nécessaire).
9. **Vitest + alias `@/*`** : utiliser `vite-tsconfig-paths` ; l'environnement `node` pour la logique, pas `jsdom`.
10. **Tests DB en parallèle** : `fileParallelism: false` sur le projet `integration` pour éviter les `TRUNCATE` croisés.
11. **Playwright sous Windows** : premier `next dev` lent (compilation Turbopack) → `timeout` webServer 120 s ; port dédié 3100 pour ne pas tomber sur un `npm run dev` déjà ouvert avec la base de dev.
12. **Antivirus / OneDrive** : dossier `Documents` parfois synchronisé → verrous sur `node_modules`/`.next` ; en cas d'`EPERM`, arrêter `next dev` et relancer, noter au journal si récurrent.
13. **ESLint** : ignorer `src/generated/**`, `.next/**`, `playwright-report/**`, `coverage/**` dans `eslint.config.mjs`, sinon le lint échoue sur le code généré.
14. **Intl `fr-FR`** : séparateur U+202F selon la version d'ICU de Node → toujours normaliser dans `formatFcfa`.

## Hypothèses à ajouter dans `docs/00-contexte-client.md`
- H8 : jours ouvrés = lundi–vendredi, jours fériés ivoiriens non gérés à ce stade (à confirmer, utile pour les délais fournisseurs).
- H9 : comptes seed fictifs sur domaine `exemple.ci` ; les vrais comptes sont créés par le SUPER_ADMIN à l'installation (à confirmer).

## Ordre et parallélisation
1 → 2 → 3 → (4 ∥ 5) → 6 → 7 → 8 → (9 ∥ 10) → 11 → 12 → 13 → 14 → 15 → 16 → 17.
Commits : `chore(init): …` (2-4, 13-15), `feat(socle): …` (5-9), `test(socle): …` (10-12), `ci: …` (14). Référencer LOT-00.
