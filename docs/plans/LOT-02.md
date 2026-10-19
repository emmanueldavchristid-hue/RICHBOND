# Plan d'exécution – LOT-02 Période d'essai, compte à rebours, licence

Branche : `lot/02-periode-essai`. Exigence : EX-05. Dépend de LOT-01 (`withAction`, `requireWritable` minimal A8/A9, `TrialBadgeSlot`, `License`, `license.manage` réservé SUPER_ADMIN, audit).
**Ne jamais lire `.env*`.** `TRIAL_END_DATE`, `TRIAL_DAYS`, `LICENSE_SECRET` sont peut-être absentes de `.env.example` (cf. `docs/blocages.md`) : valeurs par défaut sûres ci-dessous ; les clés sont ajoutées en fin de `.env.example` sans le lire (tâche 11), Jason dédoublonne (blocage).

## Choix retenus (option prudente)
| # | Choix | Raison |
|---|---|---|
| B1 | Statut **calculé** à la lecture : `ACTIVE` si stocké ACTIVE ; sinon `TRIAL` si `now < trialEndsAt` (strict), sinon `EXPIRED`. On ne persiste pas EXPIRED automatiquement | Prolongation simple ; `TEST_NOW` ne pollue pas la base ; corrige `>=` actuel de `isWritable` |
| B2 | Horloge unique `src/lib/clock.ts` `now()` : `TEST_NOW` (env) ou cookie `rb-test-now` (ISO) pris en compte **uniquement si** `NODE_ENV !== "production"` **et** `ALLOW_TEST_NOW === "1"` ; sinon `new Date()`. En production, présence de `TEST_NOW` → avertissement console unique, ignoré. Valeur invalide → ignorée | Spec `TEST_NOW` réservé aux tests, jamais en production |
| B3 | Anti-recul d'horloge : champ `lastSeenAt` ; `effectiveNow = max(now, lastSeenAt)` ; `lastSeenAt` mis à jour au plus 1 fois/heure, **jamais** quand l'heure vient de `TEST_NOW` | Serveur sur site client : reculer l'heure ne doit pas prolonger l'essai |
| B4 | Singleton : colonne `singleton Boolean? @unique @default(true)` ; `ensureLicense()` = `upsert` idempotent (sûr en concurrence), appelée paresseusement par `getLicenseState()` et par le seed | « une seule ligne », premier démarrage sans script |
| B5 | Fin d'essai : `TRIAL_END_DATE` (`AAAA-MM-JJ`) → 23:59:59.999 Abidjan ; sinon aujourd'hui (Abidjan) + `TRIAL_DAYS` (entier 1–365, défaut 30) à 23:59:59.999. Valeur invalide → défaut + avertissement. Appliqué **à la création seulement** (changer l'env ensuite n'a aucun effet : passer par « Prolonger ») | Pas de prolongation silencieuse par l'env |
| B6 | Clé : `RB-` + base32 RFC 4648 sans `=` de HMAC-SHA256(`LICENSE_SECRET`, `licensedTo.trim()+"\|ACTIVE"`), **20 caractères** en 4 groupes de 5 (`RB-XXXXX-XXXXX-XXXXX-XXXXX`, 100 bits). Saisie normalisée (majuscules, espaces retirés, tirets optionnels). Comparaison `timingSafeEqual`. Stocké : `keyFingerprint = sha256(clé normalisée)` hex | Spec ; jamais la clé ni le secret en base/audit |
| B7 | `LICENSE_SECRET` ≥ 32 caractères **obligatoire hors test**. Absent en production → l'app fonctionne (essai), mais l'activation renvoie « Activation impossible : clé serveur non configurée. Contactez Christ-Emmanuel Mouhi. ». En dev/test seulement : secret de repli constant `dev-only-…` + avertissement | Ne pas bloquer le démarrage chez le client ; jamais de secret par défaut en production |
| B8 | Activation : 5 échecs / 15 min max (compteur sur l'audit `LICENSE_ACTIVATION_FAILED`) → « Trop de tentatives, réessayez dans 15 min » | Limiter la force brute |
| B9 | Prolonger : nouvelle date (jour) > aujourd'hui Abidjan, fin 23:59 ; autorisé si statut TRIAL ou EXPIRED (stocké → TRIAL) ; masqué si ACTIVE. Raccourcir autorisé avec confirmation | Spec ; Jason maîtrise la date |
| B10 | Exemptés de `requireWritable` (A9 maintenu) : `/mon-compte` (mot de passe), actions SUPER_ADMIN sur comptes et licence. Le Responsable, lui, ne peut plus créer d'utilisateur à l'expiration | Activation toujours possible |
| B11 | Fenêtre : affichée à la 1re page après connexion pour **tous les rôles**, une fois par session (clé `localStorage` `rb-trial-seen:<userId>:<iat JWT>`) ; jours de rappel (`daysLeft` ∈ {7,3,1,0}) : réaffichée aussi si la session franchit minuit vers un jour de rappel (clé suffixée du jour). Après expiration : fenêtre explicative à chaque connexion | Interprétation « une fois/session » + rappels |
| B12 | `daysLeft` = jours calendaires Abidjan entre aujourd'hui et le jour de fin (0 = dernier jour). Badge : neutre > 7, orange ≤ 7, rouge ≤ 2 ; dernier jour : « Essai : se termine dans 5 h 12 min » | Lisible terrain |
| B13 | Compte à rebours client : le serveur fournit `trialEndsAt` + `serverNow` ; le client calcule un décalage et tique toutes les 60 s ; à 0 → `router.refresh()`. L'horloge du navigateur n'est jamais une référence absolue | Spec « heure serveur » |

## Schéma Prisma (migration `license_singleton`)
`License` ajoute : `singleton Boolean? @unique @default(true)` (nullable), `lastSeenAt DateTime? @map("last_seen_at")`. Pas d'autre table. Migration SQL : la ligne la plus récente reçoit `singleton=true`, les éventuelles autres `NULL` (**aucune suppression**).

## Tâches ordonnées
| # | Tâche | Agent | Fichiers |
|---|---|---|---|
| 1 | Schéma + migration `npx prisma migrate dev --name license_singleton` (SQL manuel pour la ligne existante, cf. ci-dessus) | dev-backend | `prisma/schema.prisma`, `prisma/migrations/*` |
| 2 | Horloge B2 : `now()`, `isTestClock()` ; lecture cookie via `cookies()` uniquement si autorisé. Remplacer `new Date()` des gardes licence par `now()` | dev-backend | `src/lib/clock.ts` |
| 3 | Fonctions **pures** : `computeLicenseState(license, now)` → `{ status, trialEndsAt, msLeft, daysLeft, tone: "neutral"\|"warning"\|"danger"\|null, isReminderDay, writable, licensedTo, activatedAt }` ; `computeTrialEnd(env, now)` (B5) ; `formatCountdown(ms)` → `12 j 05 h 32 min` ; `formatBadge(state)` ; `trialProgress(start,end,now)` (0–100) | dev-backend | `src/modules/licensing/state.ts` |
| 4 | Clé B6/B7 **sans `server-only`** (importée par le script) : `generateLicenseKey(secret, licensedTo)`, `normalizeKey`, `verifyLicenseKey(secret, licensedTo, input)`, `fingerprint(key)`, `getLicenseSecret()` (règles B7) | dev-backend | `src/modules/licensing/key.ts` |
| 5 | Service : `ensureLicense(tx?)` (B4/B5, audit `LICENSE_INIT` userId null), `getLicenseState()` (B1/B3), `extendTrial(user, date)` (B9, audit before/after `LICENSE_TRIAL_EXTEND`), `activateLicense(user, licensedTo, key)` (B6–B8 ; succès : status ACTIVE, `licensedTo`, `activatedAt`, `keyFingerprint`, audit `LICENSE_ACTIVATE` sans la clé ; échec : `BusinessError("LICENSE_KEY_INVALID","Clé de licence invalide.")`, statut inchangé, audit `LICENSE_ACTIVATION_FAILED`). Transactions + `audit.log` | dev-backend | `src/modules/licensing/{service,index}.ts` |
| 6 | Garde complète : `isWritable` → délègue à `computeLicenseState` (strict `<`) ; `requireWritable()` utilise `getLicenseState()` + `now()` ; message exact : « Période d'essai terminée : l'application est en consultation seule. Contactez Christ-Emmanuel Mouhi pour l'activer. » (code `LICENSE_READ_ONLY`) ; `isWritableNow()` pour l'UI. Licence absente → `ensureLicense()` puis calcul (plus de refus « null ») | dev-backend | `src/modules/licensing/guard.ts` |
| 7 | Server actions `/parametres/licence` : `extendTrialAction`, `activateLicenseAction` via `withAction("license.manage", schemaZod, fn, { writable: false })` ; Zod : date `AAAA-MM-JJ`, `licensedTo` 2–100 car. (défaut « RICHBOND CI »), clé 10–40 car. | dev-backend | `src/app/(app)/parametres/licence/actions.ts` |
| 8 | Libellés audit FR (`LICENSE_INIT` « Initialisation de l'essai », `LICENSE_TRIAL_EXTEND` « Prolongation de l'essai », `LICENSE_ACTIVATE` « Activation de la licence », `LICENSE_ACTIVATION_FAILED` « Échec d'activation ») ; `redactSecrets` retire aussi `key`, `licenseKey` | dev-backend | `src/lib/audit-labels.ts`, `src/modules/audit/redact.ts` |
| 9 | Script `npm run license:generate -- "RICHBOND CI"` → `tsx scripts/license-generate.ts` : lit `process.env.LICENSE_SECRET` (refus si absent ou < 32 car., pas de repli), affiche la clé seule ; aucun accès DB. Script `license:secret` optionnel : imprime `randomBytes(32).toString("base64url")` | dev-backend | `scripts/license-generate.ts`, `package.json` |
| 10 | Seed : remplacer la création licence par `ensureLicense()` (B5) ; e2e : `webServer.env` ajoute `ALLOW_TEST_NOW=1`, `LICENSE_SECRET=<valeur test 32+ car. en dur dans playwright.config, fictive>` ; helpers e2e `setTestNow(context, iso)` (cookie), `resetLicense()` (DB test : TRIAL, fin J+30) | dev-backend | `prisma/seed.ts`, `playwright.config.ts`, `tests/e2e/helpers/{clock,license}.ts` |
| 11 | Ajouter dans `.env.example` **sans le lire** (ajout en fin via `>>`) : `# TRIAL_END_DATE=AAAA-MM-JJ`, `TRIAL_DAYS=30`, `LICENSE_SECRET=` (vide), `# ALLOW_TEST_NOW=` (commentaire « tests uniquement, jamais en production ») ; documenter dans `README.md` | dev-backend | `.env.example`, `README.md` |
| 12 | Contexte licence : `layout (app)` charge `getLicenseState()` (serveur) et fournit `LicenseProvider` (`state`, `serverNow`, `writable`, `readOnlyMessage`) ; hook `useLicense()` | dev-frontend | `src/components/license/license-provider.tsx`, `src/app/(app)/layout.tsx` |
| 13 | `TrialBadgeSlot` → `TrialBadge` : « Essai : 12 j restants », couleurs B12 (`data-tone` pour les tests), cliquable → rouvre la fenêtre ; rien si ACTIVE ; « Consultation seule » rouge si EXPIRED | dev-frontend | `src/components/layout/trial-badge-slot.tsx`, `src/components/license/trial-badge.tsx` |
| 14 | `TrialDialog` (shadcn Dialog) : titre « Version d'essai », compte à rebours géant `12 j 05 h 32 min` (B13), « La version d'essai se termine le vendredi 20 novembre 2026 » (date en toutes lettres, locale fr, Abidjan), barre de progression jours écoulés, texte spec, bouton « Continuer » ; logique d'affichage B11 ; variante expirée « Période d'essai terminée » + consignes (consultation, impressions, exports possibles ; contacter Christ-Emmanuel Mouhi) | dev-frontend | `src/components/license/trial-dialog.tsx` |
| 15 | Bandeau rouge fixe `ReadOnlyBanner` « Période d'essai terminée – consultation seule » (haut de page, ne masque pas le contenu, `role="alert"`) | dev-frontend | `src/components/license/read-only-banner.tsx` |
| 16 | `WriteGuard` / `<WriteButton>` : si `!writable`, bouton `disabled` + infobulle (Tooltip, aussi au toucher sur tablette) avec le message de lecture seule. Appliquer aux boutons d'écriture existants (`/parametres/utilisateurs` pour le Responsable). Exemptés B10 non grisés. Convention notée pour les lots suivants | dev-frontend | `src/components/license/write-button.tsx`, `src/app/(app)/parametres/utilisateurs/*` |
| 17 | `/parametres/licence` (`requirePageAction("license.manage")`, entrée menu SUPER_ADMIN) : état (statut FR, début, fin, jours restants) ; formulaire « Prolonger l'essai » (date, confirmation si raccourcissement) ; formulaire « Activer la licence » (bénéficiaire prérempli « RICHBOND CI », clé, erreurs lisibles) ; si ACTIVE : « Licence active – RICHBOND CI – activée le JJ/MM/AAAA » seul | dev-frontend | `src/app/(app)/parametres/licence/{page,extend-form,activate-form}.tsx`, `src/components/layout/nav-items.ts` |
| 18 | Tests unitaires + intégration (ci-dessous) | testeur-unitaire | `tests/unit/*`, `tests/integration/*` |
| 19 | Tests workflow S0-1 (fenêtre/badge), S0-3, S0-4 | testeur-workflow | `tests/e2e/scenarios/S0-2-essai.spec.ts` |
| 20 | Relecture : aucun `new Date()` dans les décisions de licence (tout via `now()`), `TEST_NOW` inopérant si `NODE_ENV=production`, ni clé ni secret dans logs/audit/réponses, toute action d'écriture via `withAction` (ou `requireWritable` explicite), aucune suppression/masquage de données à l'expiration | relecteur | – |
| 21 | Recette `docs/recette/LOT-02.md` | recette-metier | `docs/recette/LOT-02.md` |
| 22 | Fin de lot : plan des lots « Terminé », journal, hypothèses H15–H19, blocage env mis à jour, fusion `main`, `git push` | chef-de-projet | `docs/*` |

## Tests
**Unitaires** (`tests/unit/`)
- `licensing.state.test.ts` : TRIAL/EXPIRED à la borne (23:59:59.999 → TRIAL, +1 ms → EXPIRED) ; ACTIVE ignore les dates ; stocké EXPIRED mais fin future (après prolongation) → TRIAL ; `daysLeft` 0 le dernier jour, 7/3/1 = rappel ; tons 8→neutre, 7→orange, 2→rouge ; `formatCountdown` (0 min, 59 min, 12 j 05 h 32 min, négatif → 0) ; `computeTrialEnd` (TRIAL_END_DATE valide / invalide / passée, TRIAL_DAYS absent, `abc`, 0, 400) ; calcul indépendant de `process.env.TZ` (exécuter avec `TZ=Europe/Paris`) ; anti-recul B3.
- `licensing.key.test.ts` : format `RB-XXXXX-XXXXX-XXXXX-XXXXX`, déterministe, normalisation (minuscules, espaces, sans tirets), mauvais secret / mauvais bénéficiaire → invalide ; `getLicenseSecret` : production sans secret → null, secret < 32 → null, test → repli.
- `clock.test.ts` : `TEST_NOW` ignoré si `NODE_ENV=production` ou sans `ALLOW_TEST_NOW=1` ; ISO invalide ignoré.

**Intégration** (`tests/integration/licensing.test.ts`, étend `guard.test.ts`)
- `ensureLicense` ×10 en parallèle → 1 seule ligne, 1 seul audit `LICENSE_INIT`.
- Expiré : `withAction("purchaseRequest.create", …)` → `LICENSE_READ_ONLY` + message exact ; action de lecture/export `writable:false` → OK ; `mon-compte` et actions licence SUPER_ADMIN → OK ; nombre de lignes User/AuditLog inchangé avant/après expiration.
- Clé valide → ACTIVE, `keyFingerprint` = sha256, audit sans clé ; clé invalide → erreur, statut et empreinte inchangés, audit échec ; 6e échec → trop de tentatives.
- Prolongation : date passée refusée ; EXPIRED → TRIAL ; audit before/after ; RESPONSABLE/ACHETEUR/MAGASINIER → `FORBIDDEN`.

**Workflow** (`S0-2-essai.spec.ts`, desktop + tablette, `resetLicense()` avant chaque test)
- S0-1 : chaque rôle → fenêtre à la connexion, « Continuer », pas de réaffichage en naviguant, badge clic → réouverture.
- Badge selon `TEST_NOW` (cookie) : J-20 neutre, J-5 orange + fenêtre auto, J-1 rouge, dernier jour heures affichées.
- S0-3 : `TEST_NOW` après la fin → connexion OK, bandeau rouge, fenêtre expirée, bouton « Créer un utilisateur » (Responsable) désactivé avec infobulle, appel direct refusé ; journal d'audit consultable (lecture). La création de DA réelle sera rejouée en LOT-04 (scénario S1 sous expiration).
- S0-4 : Super-admin saisit une clé invalide → message, puis la clé générée par `generateLicenseKey(secret test)` → « Licence active – RICHBOND CI – activée le … », badge et bandeau disparus pour le Responsable, écriture de nouveau possible.

## Seed
Licence via `ensureLicense()` uniquement (TRIAL, fin selon B5). Aucune clé, aucun secret dans le dépôt hors valeur fictive de test dans `playwright.config.ts` (marquée « TEST UNIQUEMENT »).

## Ambiguïtés → hypothèses (à ajouter dans `docs/00-contexte-client.md`)
H15 statut calculé, non persisté (B1) · H16 anti-recul d'horloge (B3) · H17 fenêtre à chaque connexion pour tous les rôles + rappels (B11) · H18 clé 20 caractères, limite 5 essais/15 min (B6, B8) · H19 l'activation est définitive (pas de révocation dans l'app ; nouvelle clé si changement de bénéficiaire).
