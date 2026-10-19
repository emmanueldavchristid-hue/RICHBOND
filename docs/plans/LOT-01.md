# Plan d'exécution – LOT-01 Authentification, rôles, utilisateurs, audit, mise en page

Branche : `lot/01-auth-roles`. Exigences : EX-01, EX-02, EX-04. Dépend de LOT-00 (User, AuditLog, License, `lib/errors`, `lib/db`, Playwright).
Socle existant : `next-auth@5 beta`, `bcryptjs`, Next 16 (le `middleware.ts` s'appelle désormais **`src/proxy.ts`**), Prisma 7 (`@/generated/prisma/client`). **Ne jamais lire `.env*`.**

## Choix retenus (option prudente)
| # | Choix | Raison |
|---|---|---|
| A1 | Auth.js v5, provider Credentials, session **JWT 8 h** (`maxAge`), `updateAge` 1 h | Spec archi « JWT courtes » ; journée de travail |
| A2 | À chaque requête protégée, `getCurrentUser()` relit l'utilisateur en base (actif, rôle, `sessionVersion`) | Désactivation / changement de rôle effectifs immédiatement malgré le JWT ; 5 utilisateurs = coût nul |
| A3 | `sessionVersion Int` incrémenté à la désactivation, au changement de rôle et à la réinitialisation du mot de passe → JWT antérieurs rejetés | Pas de table de sessions |
| A4 | Verrouillage : 5 échecs consécutifs → `lockedUntil = now + 15 min` ; remise à 0 au succès ; message générique « Email ou mot de passe incorrect » sauf compte verrouillé (« Compte verrouillé, réessayez après HH:mm ») et désactivé (« Compte désactivé, contactez le Responsable Achats ») | Spec ; pas d'énumération d'emails inconnus |
| A5 | Email normalisé `trim().toLowerCase()` à l'écriture et à la connexion | Unicité fiable |
| A6 | `mustChangePassword` : `true` à la création et à la réinitialisation ; le `proxy`/layout redirige vers `/mon-compte?premiere=1` tant que non changé ; toutes les autres actions refusées | Spec |
| A7 | Réinitialisation : mot de passe temporaire généré serveur (12 car., affiché **une seule fois** au Responsable), jamais stocké en clair, jamais dans l'audit | Pas d'envoi d'email à ce stade |
| A8 | `requireWritable()` minimal posé dès LOT-01 dans `src/modules/licensing/guard.ts` (lit `License` : EXPIRED ou `trialEndsAt < now` → `BusinessError("LICENSE_READ_ONLY")`), enrichi en LOT-02 | Règle 2 applicable dès maintenant |
| A9 | Exemptés de `requireWritable` : changement de son propre mot de passe, actions `SUPER_ADMIN` sur comptes et licence | Ne pas bloquer l'accès ni l'activation |
| A10 | Rôle `SUPER_ADMIN` non créable/modifiable par le Responsable ; comptes super-admin masqués de sa liste et du journal filtré par défaut | « technique, caché » (CLAUDE.md) |
| A11 | On ne peut ni se désactiver soi-même ni désactiver le dernier `RESPONSABLE_ACHATS` actif | Éviter de perdre l'accès |
| A12 | Prix d'achat pour le Magasinier : action `price.viewPurchase` refusée, `price.viewPmp` autorisée ; le réglage (paramètre) sera stocké en LOT-03 (`/parametres`) ; LOT-01 lit une constante par défaut | « réglable » sans créer de table de paramètres prématurée |

## Schéma Prisma (migration `auth_lockout`)
`User` ajoute : `failedLoginCount Int @default(0)`, `lockedUntil DateTime?`, `mustChangePassword Boolean @default(true)`, `passwordChangedAt DateTime?`, `sessionVersion Int @default(0)`, `deactivatedAt DateTime?`, `createdById String?` (relation `User`). Index `@@index([role, active])`.
`AuditLog` : ajouter `ip String?` (facultatif, adresse issue de `x-forwarded-for`). Pas de nouvelle table. Les actions d'audit restent des chaînes typées par union TS (`USER_CREATE`, `USER_UPDATE`, `USER_DEACTIVATE`, `USER_REACTIVATE`, `USER_PASSWORD_RESET`, `PASSWORD_CHANGE`, `LOGIN_SUCCESS`, `LOGIN_FAILED`, `ACCOUNT_LOCKED`, `LOGOUT`).

## Tâches ordonnées
| # | Tâche | Agent | Fichiers |
|---|---|---|---|
| 1 | Schéma + migration `npx prisma migrate dev --name auth_lockout` ; les comptes seed existants passent `mustChangePassword=false` via le seed (pas via la migration) | dev-backend | `prisma/schema.prisma`, `prisma/migrations/*` |
| 2 | Matrice `src/lib/permissions.ts` : type `Action` (union exhaustive, cf. ci-dessous), `PERMISSIONS: Record<Role, ReadonlySet<Action>>`, `can(user, action, resource?)` (resource = `{ scope?: "LOCAL"\|"IMPORT" }` → acheteur LOCAL refusé sur IMPORT et inversement), `requireAction(user, action, resource?)` → `BusinessError("FORBIDDEN","Vous n'avez pas les droits pour cette action.")`. Fichier **pur** (pas de Prisma), importable côté client pour filtrer le menu | dev-backend | `src/lib/permissions.ts` |
| 3 | Audit : `src/modules/audit/log.ts` `log(tx, { userId, action, entity, entityId, before?, after? })` (écrit dans la **même transaction** que l'opération ; `before/after` passés par `redactSecrets()` qui retire `passwordHash`, `password*`) ; `list(filters)` : utilisateur, action, entité, période (fuseau Abidjan), pagination 50 | dev-backend | `src/modules/audit/{log,list,redact,index}.ts` |
| 4 | Mots de passe : `src/modules/auth/password.ts` (`hashPassword` bcrypt 12, `verifyPassword`, `generateTemporaryPassword`, schéma Zod `passwordSchema` : ≥ 8 car., ≠ email, ≤ 72 octets limite bcrypt) | dev-backend | `src/modules/auth/password.ts`, `src/modules/auth/schemas.ts` |
| 5 | Connexion : `src/modules/auth/authenticate.ts` `authenticate(email, password, now)` → `{ ok, user } \| { ok:false, reason: INVALID\|LOCKED\|DISABLED, lockedUntil? }` ; incrément atomique `failedLoginCount` (`update … increment`), verrou au 5e, audit `LOGIN_FAILED`/`ACCOUNT_LOCKED`/`LOGIN_SUCCESS`, `lastLoginAt`. Comparaison bcrypt exécutée même si email inconnu (hash factice) → temps constant. `now` injectable pour les tests | dev-backend | `src/modules/auth/authenticate.ts` |
| 6 | Auth.js : `src/lib/auth.ts` (`NextAuth({ providers:[Credentials], session:{strategy:"jwt",maxAge:8h}, pages:{signIn:"/connexion"}, callbacks jwt/session : id, role, purchaseScope, sessionVersion, mustChangePassword })`, `src/app/api/auth/[...nextauth]/route.ts`, augmentation de types `src/types/next-auth.d.ts`. `AUTH_SECRET` lu par Auth.js (déjà dans `.env.example`) ; `trustHost: true` (hébergement local/LAN) | dev-backend | `src/lib/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/types/next-auth.d.ts` |
| 7 | Garde serveur `src/modules/auth/session.ts` : `getCurrentUser()` (relit DB, rejette inactif ou `sessionVersion` différent → `null`), `requireUser()`, `requirePageAction(action)` (page : `redirect("/acces-refuse")`), `withAction(action, schema, fn, { writable })` : session → mustChangePassword → `requireAction` → `requireWritable` (sauf A9) → Zod → fn → `ActionResult` via `toActionError` | dev-backend | `src/modules/auth/session.ts`, `src/modules/licensing/guard.ts` |
| 8 | `src/proxy.ts` : non connecté → `/connexion?retour=…` (sauf `/connexion`, `/api/auth`, assets) ; connecté sur `/connexion` → `/accueil`. Contrôle de rôle par préfixe **en plus** (pas à la place) des gardes de page | dev-backend | `src/proxy.ts` |
| 9 | Module utilisateurs `src/modules/users/` : `createUser`, `updateUser` (nom, email, rôle, périmètre ; `purchaseScope` obligatoire si ACHETEUR, `null` sinon), `resetPassword` (A7), `deactivateUser`/`reactivateUser` (A3, A11), `changeOwnPassword` (vérifie l'ancien, refuse identique), `listUsers` (recherche, filtre rôle/actif). Email déjà pris → `BusinessError("EMAIL_TAKEN")`. Aucun `delete`. Chaque écriture : transaction + `audit.log` | dev-backend | `src/modules/users/*.ts` |
| 10 | Server actions : `src/app/(app)/parametres/utilisateurs/actions.ts` (`users.manage`), `src/app/(app)/mon-compte/actions.ts` (connecté, exempt licence), `src/app/(auth)/connexion/actions.ts` (`signIn` + mapping des raisons en messages FR), déconnexion (audit `LOGOUT`) | dev-backend | fichiers cités |
| 11 | Seed : comptes fictifs `@richbond.test` (cf. Seed), `mustChangePassword=false`, compteurs d'échec remis à 0, mot de passe = `SEED_DEFAULT_PASSWORD` (inchangé, pas en dur) ; README : section « Comptes de démonstration » (emails + « mot de passe = valeur de `SEED_DEFAULT_PASSWORD` ») ; mettre à jour `tests/e2e/helpers/auth.ts` (`SEED_EMAILS`) | dev-backend | `prisma/seed.ts`, `README.md`, `tests/e2e/helpers/auth.ts` |
| 12 | `/connexion` : groupe `(auth)`, carte centrée, logo texte « RICHBOND », sous-titre « Achats & Stocks », email, mot de passe (bouton afficher), bouton « Se connecter » avec état en cours, erreur dans une alerte rouge lisible ; champs ≥ 44 px (tablette) ; `autocomplete` corrects | dev-frontend | `src/app/(auth)/connexion/{page,login-form}.tsx`, `src/app/(auth)/layout.tsx` |
| 13 | Layout protégé `(app)` : `src/components/layout/{app-sidebar,app-header,nav-items,user-menu}.tsx`. `nav-items.ts` = config unique (libellé, href, icône lucide, `action` requise) filtrée par `can()` : Accueil, Achats, Import, Stock, Fournisseurs, Rapports, Paramètres. En-tête : nom, rôle en français (`Responsable Achats`, `Acheteur (local)`…), cloche (popover « Aucune notification »), emplacement `<TrialBadgeSlot />` vide (LOT-02), menu utilisateur (Mon compte, Se déconnecter). Menu latéral repliable en `Sheet` sous 1024 px. Rubriques sans page encore : page « Bientôt disponible » commune | dev-frontend | `src/app/(app)/layout.tsx`, `src/components/layout/*`, `src/app/(app)/accueil/page.tsx` |
| 14 | `/acces-refuse` : message « Accès refusé – vous n'avez pas les droits pour cette page », bouton « Retour à l'accueil », code HTTP 403 si possible (`forbidden()` de Next si activé, sinon page simple) ; `/` redirige vers `/accueil` (remplace la page provisoire LOT-00 ; adapter `tests/e2e/accueil.spec.ts`) | dev-frontend | `src/app/(app)/acces-refuse/page.tsx`, `src/app/page.tsx` |
| 15 | `/parametres/utilisateurs` : tableau (nom, email, rôle, périmètre, statut Actif/Désactivé, dernière connexion `JJ/MM/AAAA HH:mm`), recherche + filtre rôle/statut ; dialogues Créer / Modifier (react-hook-form + Zod partagé, champ Périmètre visible seulement si Acheteur) ; « Réinitialiser le mot de passe » → dialogue affichant le mot de passe temporaire une fois avec bouton copier ; « Désactiver » via `ConfirmDialog` ; badge « Verrouillé jusqu'à HH:mm » + action « Déverrouiller » | dev-frontend | `src/app/(app)/parametres/utilisateurs/*`, `src/components/{status-badge,confirm-dialog}.tsx` |
| 16 | `/mon-compte` : infos (nom, email, rôle) + formulaire ancien / nouveau / confirmation ; mode `premiere=1` : bandeau « Vous devez définir votre mot de passe » et menu masqué ; succès → toast + redirection `/accueil` | dev-frontend | `src/app/(app)/mon-compte/*` |
| 17 | `/parametres/journal` (`audit.view`) : tableau date, utilisateur, action (libellé FR), entité, n° ; filtres période / utilisateur / action / entité ; détail avant/après en dialogue (JSON lisible) | dev-frontend | `src/app/(app)/parametres/journal/*` |
| 18 | Tests unitaires (ci-dessous) | testeur-unitaire | `tests/unit/*`, `tests/integration/*` |
| 19 | Tests workflow S0 (partie LOT-01) + `loginAs` réel | testeur-workflow | `tests/e2e/*` |
| 20 | Relecture : aucune page n'importe `@/lib/db`, toute action passe par `withAction`, aucun secret/mot de passe en clair dans logs/audit, textes FR | relecteur | – |
| 21 | Recette `docs/recette/LOT-01.md` (critères d'acceptation) | recette-metier | `docs/recette/LOT-01.md` |
| 22 | Fin de lot : plan des lots « Terminé », journal, hypothèses H10–H13, fusion `main`, `git push` | chef-de-projet | `docs/*` |

## Matrice (actions nommées, LOT-01 pose la liste complète utilisée par les lots suivants)
`purchaseRequest.{view,create,createReplenishment,approve,cancel}` · `rfq.{view,manage}` · `purchaseOrder.{view,create,send,remind,approve,cancel}` · `importFile.{view,manage}` · `invoice.{view,manage,approvePayment}` · `supplier.{view,manage,evaluate}` · `item.{view,manage}` · `stock.{view,receive,issue,adjust}` · `inventory.{count,validate}` · `price.{viewPurchase,viewPmp}` · `report.{purchasing,stock,all}` · `users.manage` · `audit.view` · `settings.manage` · `license.manage` · `maintenance.run` · `sage.sync`.
- RESPONSABLE_ACHATS : tout sauf `license.manage`, `maintenance.run`.
- ACHETEUR : DA (view, create, cancel des siennes), rfq, BC (view, create, send, remind – **pas** approve), importFile, invoice (view, manage – pas approvePayment), supplier (view, manage), item (view, manage), stock.view, price.*, report.purchasing. Périmètre LOCAL/IMPORT appliqué via `resource.scope`.
- MAGASINIER : purchaseRequest (view, createReplenishment), stock (view, receive, issue), inventory.count, item.view, price.viewPmp, report.stock.
- SUPER_ADMIN : users.manage, license.manage, maintenance.run, audit.view, sage.sync et toutes les actions `*.view`/`report.*` ; **aucune** action métier d'écriture (approve, create, issue…).
Menu : Achats (`purchaseRequest.view`), Import (`importFile.view`), Stock (`stock.view`), Fournisseurs (`supplier.view`), Rapports (`report.*`), Paramètres (`users.manage` ou `settings.manage`). → Magasinier : Accueil, Achats (DA), Stock, Rapports.

## Tests
**Unitaires (`tests/unit/`)**
- `permissions.test.ts` : tableau exhaustif `it.each` rôle × action sensible (`purchaseRequest.approve`, `purchaseOrder.approve`, `invoice.approvePayment`, `stock.issue`, `inventory.validate`, `settings.manage`, `users.manage`, `license.manage`, `price.viewPurchase`) avec valeur attendue ; périmètre acheteur LOCAL vs IMPORT vs ALL ; chaque `Action` déclarée appartient à au moins un rôle ; SUPER_ADMIN sans action d'écriture métier.
- `nav-items.test.ts` : menu attendu par rôle (5 profils seed).
- `password.test.ts` : 7 car. refusé, 8 accepté, > 72 octets refusé, mot de passe temporaire conforme au schéma.
- `audit.redact.test.ts` : `passwordHash` et champs `password*` supprimés, imbriqués compris.
**Intégration (`tests/integration/`, base de test)**
- `auth.lockout.test.ts` : 4 échecs → pas verrouillé ; 5e → `LOCKED` ; bon mot de passe pendant le verrou → refusé ; `now + 15 min 1 s` → succès et compteur à 0 ; compte désactivé → `DISABLED` ; email inconnu → `INVALID` ; audit `ACCOUNT_LOCKED` écrit.
- `users.test.ts` : création → ligne `AuditLog USER_CREATE` sans hash ; email en double (casse différente) refusé ; ACHETEUR sans périmètre refusé ; désactivation de soi-même / du dernier Responsable refusée ; désactivation incrémente `sessionVersion` ; reset → `mustChangePassword=true` ; aucune suppression possible.
- `guard.test.ts` : `withAction` refuse sans session, rôle insuffisant (`FORBIDDEN`), `mustChangePassword`, licence expirée (`LICENSE_READ_ONLY`) sauf actions exemptées.
**Workflow (`tests/e2e/`, Playwright desktop + tablette)**
- `auth.spec.ts` : chaque rôle seed se connecte et voit son menu (S0.1 sans badge) ; mauvais mot de passe → message clair ; 5 échecs → message de verrouillage (compte dédié créé pour le test, pas un compte seed partagé).
- `acces.spec.ts` : Magasinier ouvre `/parametres/utilisateurs` → « Accès refusé » (S0.2) ; appel direct de l'action serveur refusé (via test d'intégration `guard.test.ts`).
- `utilisateurs.spec.ts` : Responsable crée un acheteur → mot de passe temporaire → connexion du nouvel acheteur → changement forcé → accès ; création visible dans `/parametres/journal` ; désactivation → reconnexion refusée.

## Seed (fictif)
| Nom | Email | Rôle | Périmètre |
|---|---|---|---|
| Jason (super-admin) | `admin@richbond.test` | SUPER_ADMIN | – |
| Responsable Achats (démo) | `responsable@richbond.test` | RESPONSABLE_ACHATS | – |
| Acheteur Local | `acheteur.local@richbond.test` | ACHETEUR | LOCAL |
| Acheteur Import | `acheteur.import@richbond.test` | ACHETEUR | IMPORT |
| Magasinier | `magasinier@richbond.test` | MAGASINIER | – |
Les anciens comptes `@exemple.ci` du LOT-00 sont désactivés par le seed s'ils existent (pas supprimés). `.test` est un TLD réservé : aucune adresse réelle.

## Hypothèses à ajouter (`docs/00-contexte-client.md`)
- H10 : emails seed `@richbond.test` (spec LOT-01) remplacent `@exemple.ci` (H9 mis à jour) ; nom du Responsable en seed = « Responsable Achats (démo) » et non le vrai nom du client (règle 9) – à confirmer.
- H11 : mot de passe de démo non écrit dans le dépôt : README renvoie à `SEED_DEFAULT_PASSWORD` – à confirmer.
- H12 : session 8 h, verrouillage 15 min après 5 échecs consécutifs, déverrouillage anticipé par le Responsable – à confirmer.
- H13 : Magasinier ne voit pas les prix d'achat, voit le PMP ; réglage modifiable en LOT-03 – à confirmer.

## Ordre et parallélisation
1 → 2 → (3 ∥ 4) → 5 → 6 → 7 → 8 → 9 → 10 → 11 ; frontend 12–14 dès la fin de 7 (actions bouchonnées par les signatures), 15–17 après 10 ; 18 en continu dès 2 ; 19 après 11 et 16 ; 20 → 21 → 22.
Commits : `feat(auth): …` (1-8, 10, 12, 16), `feat(utilisateurs): …` (9, 15), `feat(audit): …` (3, 17), `feat(socle): mise en page …` (13-14), `test(auth)`/`test(workflow): …` (18-19). Référencer EX-01/02/04 et LOT-01.

## Pièges
1. Next 16 : `middleware.ts` → `proxy.ts` (runtime Node) ; ne pas y importer Prisma si le runtime edge est forcé – n'y lire que le JWT (`auth()` d'Auth.js), le contrôle DB reste dans `getCurrentUser()`.
2. Auth.js Credentials : `authorize` qui lève une erreur renvoie `CredentialsSignin` générique → utiliser une sous-classe `CredentialsSignin` avec `code` (`LOCKED`, `DISABLED`) pour afficher le bon message.
3. `redirect()` dans une server action lève une exception : ne pas l'envelopper dans le `try/catch` de `toActionError` (relancer si `isRedirectError`).
4. bcrypt tronque à 72 octets → borne Zod.
5. Le JWT ne doit contenir ni hash ni données sensibles ; `sessionVersion` uniquement.
6. Les tests de verrouillage ne doivent pas verrouiller les comptes seed utilisés par les autres e2e (compte jetable).
