# Journal du projet

Le plus récent en haut. Format : date · lot · fait · décisions · suite.

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
