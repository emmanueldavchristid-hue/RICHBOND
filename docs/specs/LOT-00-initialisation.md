# LOT-00 – Initialisation et outillage

## Objectif
Un projet qui démarre, se teste et se déploie proprement, avant la première ligne de métier.

## À faire
1. Vérifier les prérequis : `node -v` (LTS ≥ 20), `npm -v`, `git --version`, accès PostgreSQL via `DATABASE_URL` du `.env`.
   Si PostgreSQL ou `.env` manquent : l'écrire dans `docs/blocages.md` avec la marche à suivre, et continuer ce qui ne dépend pas de la base.
2. Créer l'application Next.js dans le dossier courant (TypeScript, App Router, `src/`, Tailwind, ESLint, alias `@/*`),
   **sans écraser** `CLAUDE.md`, `docs/`, `.claude/`, `README.md`, `.gitignore`, `.env.example`.
3. Installer : prisma, @prisma/client, next-auth (Auth.js), bcryptjs, zod, react-hook-form, @hookform/resolvers,
   @tanstack/react-table, recharts, date-fns, date-fns-tz, exceljs, @react-pdf/renderer, lucide-react ; shadcn/ui (button, input,
   select, dialog, alert-dialog, table, badge, card, tabs, dropdown-menu, sheet, toast/sonner, form, calendar, popover, tooltip).
   Dev : vitest, @vitest/coverage-v8, @playwright/test, tsx, prettier.
4. Scripts `package.json` : `dev`, `build`, `start`, `lint`, `typecheck` (`tsc --noEmit`), `test` (vitest run), `test:e2e` (playwright),
   `db:migrate`, `db:seed`, `db:reset`.
5. Prisma : `schema.prisma` avec `User`, `Counter`, `AuditLog`, `License` (les autres modèles viennent avec leur lot). Seed de base.
6. `src/lib/` : `db.ts` (client Prisma unique), `money.ts` (formatage FCFA, arrondis), `dates.ts` (fuseau Africa/Abidjan), `errors.ts` (`BusinessError`).
7. `src/modules/numbering/` : `nextNumber(key, year)` transactionnel + tests (concurrence : 20 appels parallèles → 20 numéros uniques consécutifs).
8. Playwright configuré avec `webServer` (`npm run dev`), base de test séparée (`DATABASE_URL_TEST`), helper de connexion par rôle.
9. GitHub Actions `.github/workflows/ci.yml` : install, lint, typecheck, tests unitaires.
10. `.env.example` complet et commenté.

## Critères d'acceptation
- [ ] `npm run dev` affiche une page d'accueil provisoire « RICHBOND – Achats & Stocks ».
- [ ] `npm run lint`, `npm run typecheck`, `npm test` passent.
- [ ] Test de numérotation concurrente vert.
- [ ] Un test Playwright « la page s'ouvre » passe.
- [ ] Les fichiers de cadrage existants sont intacts.
