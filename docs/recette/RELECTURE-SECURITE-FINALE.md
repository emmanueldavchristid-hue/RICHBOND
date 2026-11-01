# Relecture sécurité finale (lecture seule)

Périmètre : LOT-12 (import-files), LOT-15 (reporting, /api/rapports), puis balayage transversal (actions, routes API, uploads, Excel, IDOR, stock, numérotation, secrets, en-têtes).
Méthode : lecture du code uniquement. Le fichier d'environnement, la base de test et Playwright n'ont pas été utilisés. Aucun code modifié.

## Verdict
Aucun bloquant de sécurité (pas d'accès sans droit, pas d'injection, pas de secret versionné). Trois points importants à traiter avant la mise en service (planificateur bloqué par le proxy, dépassement d'entier sur les frais, IP non fiable), plus des points mineurs.

## Bloquants
Aucun.

## Importants

### I1. Le proxy redirige l'appel du planificateur vers /connexion (alertes jamais déclenchées en production)
- `src/proxy.ts:27` et `src/proxy.ts:41` : le matcher n'exclut que `api/auth`, les statiques et les images. Un appel curl POST avec l'en-tête Authorization Bearer CRON_SECRET sur `/api/cron/alertes`, sans cookie de session, reçoit une redirection 307 vers `/connexion` avant d'atteindre `src/app/api/cron/alertes/route.ts`. La commande `curl -fsS` de `docs/deploiement.md:11` ne traite pas un 307 comme une erreur : l'échec serait silencieux.
- Les tests ne le voient pas : le test d'intégration appelle le handler directement, et S7 utilise `page.request` (cookies de la session connectée). Constat par lecture, à confirmer par un curl sans cookie sur un serveur de recette.
- Correctif : ajouter `api/cron` au lookahead négatif du matcher (la route a déjà sa propre garde CRON_SECRET à temps constant). Ajouter un test qui appelle la route via le proxy sans cookie.

### I2. Dépassement d'entier sur les frais d'approche (erreur 500 au lieu d'un message)
- `src/modules/import-files/schemas.ts:17-18` autorise un montant jusqu'à 9 999 999 999 999 et un taux jusqu'à 1 000 000, mais `approach_costs.amount_xof` est un Int 32 bits (`prisma/schema.prisma:1507`, plafond 2 147 483 647). Le produit calculé par `toXof` (`src/modules/import-files/landed-cost.ts:11`, appelé en `service.ts:337` et `service.ts:392`) peut dépasser : Postgres refuse, l'utilisateur reçoit une erreur technique générique, rien n'est corrompu.
- Correctif : dans `toXof`, lever une BusinessError (code MONTANT_TROP_ELEVE) si le résultat dépasse 2 147 483 647 ; ou resserrer `amount` et vérifier le produit. Test unitaire sur la limite.

### I3. Adresse IP d'audit et de limitation de connexion fondée sur X-Forwarded-For non fiable
- `src/modules/auth/ip.ts`, `src/lib/auth.ts` (fonction clientIp), `src/app/api/export-complet/route.ts:36` (copie locale de la même logique). L'en-tête est lu tel quel : tout client peut le forger, donc fausser le journal d'audit et contourner la limitation par couple e-mail + IP (`src/modules/auth/rate-limit.ts`). Le verrou par compte (5 échecs, 15 min, `authenticate.ts`) reste la vraie protection, ce qui limite l'impact.
- Correctif : n'accepter X-Forwarded-For que si l'application est derrière le proxy déclaré (variable TRUST_PROXY=1) ; utiliser `getClientIp()` partout (supprimer les deux copies). Documenter dans `docs/deploiement.md`.

## Mineurs

- M1. `src/proxy.ts:41` : dans une chaîne TypeScript, la séquence backslash-point vaut un simple point. Le motif exclut donc tout chemin se terminant par png, js, css, etc. précédé de n'importe quel caractère (ex. `/api/x/foojs`). Sans impact aujourd'hui (chaque route a sa propre garde `getCurrentUser`), mais le garde-fou en profondeur est percé. Correctif : doubler le backslash dans la chaîne.
- M2. `src/modules/auth/authenticate.ts:80-81` : un compte désactivé répond « Compte désactivé » sans vérifier le mot de passe, ce qui révèle l'existence du compte à qui connaît l'e-mail. Correctif : tester `passwordOk` avant de révéler DISABLED.
- M3. `src/modules/import-files/documents.ts:52` : on peut ajouter une pièce à un dossier clôturé (seul ANNULE est refusé) alors que le retrait exige OUVERT. À trancher (probablement voulu : pièces tardives) ; l'ajout reste tracé dans l'audit.
- M4. `src/modules/reporting/report-queries.ts:318-325` : `closedImportFiles` ignore le filtre buyerId et n'a pas de LIMIT (les autres tableaux sont plafonnés à 200). Ajouter le filtre sur `imp.created_by_id` si posé, et un plafond.
- M5. `src/modules/licensing/key.ts:35` : le secret de licence de repli constant s'active avec ALLOW_TEST_NOW=1, y compris hors test. L'horloge (`src/lib/clock.ts:13`) neutralise ALLOW_TEST_NOW en production, mais pas ce repli : avec ALLOW_TEST_NOW=1 oublié et LICENSE_SECRET absent en production, une clé pourrait être forgée. Correctif : conditionner aussi le repli à NODE_ENV différent de production.
- M6. `src/modules/purchase-requests/attachment-type.ts:30-34` : un Excel/Word est reconnu par la présence de noms d'entrée dans les octets (sans lire le ZIP). Sans conséquence ici (téléchargement en pièce jointe, nosniff, nom généré côté serveur). Les pièces import et factures n'acceptent que PDF/JPEG/PNG : conforme.
- M7. `next.config.ts` : CSP avec script-src 'unsafe-inline' (runtime Next sans nonce). Acceptable en application interne ; à durcir si exposée sur Internet.
- M8. `src/modules/auth/rate-limit.ts` : limitation en mémoire du processus, perdue au redémarrage. Acceptable en mono-instance ; à noter dans `docs/deploiement.md`.
- M9. Fichiers non suivis à la racine : `voir-la-demo.ps1:33` affiche un mot de passe de démonstration en clair (fictif), et `scripts-fantome/`, `skills-lock.json` ne sont pas ignorés. Ne pas les commiter (règle 9 de CLAUDE.md) ; remplacer par une référence à SEED_DEFAULT_PASSWORD ou les ajouter à `.gitignore`.
- M10. Séparation des tâches : un Acheteur import peut créer le dossier, saisir les frais et le clôturer, ce qui réévalue le PMP (irréversible). Conforme à la spec (droit importFile.close) ; envisager une confirmation du Responsable au-delà d'un seuil de surcoût. Pas un défaut de code.

## Constats conformes (vérifiés)

### LOT-12 import-files
- 23 server actions sur 23 passent par `withAction` (session, mot de passe à changer, droit, licence, Zod) : `src/app/(app)/import/actions.ts`. Lectures en `writable: false`, écritures gardées par la licence.
- Défense en profondeur : chaque fonction de service appelle `assertImportAccess` (rôle + périmètre IMPORT ; Acheteur LOCAL ou sans périmètre refusé ; Super-admin en lecture seule) : `scope.ts`, `service.ts`, `queries.ts`, `export.ts`, `documents.ts`. Pages : `requirePageAction` avec périmètre IMPORT.
- Routes `/api/import-files/[id]/fiche` et `/documents/[docId]` : 401 sans session, 403 si mot de passe à changer ou hors périmètre, identifiants validés par `idSchema`, format par `z.enum`, `Cache-Control: private, no-store`, nosniff, Content-Disposition attachment encodé.
- IDOR : `readImportDocument` cherche l'identifiant de pièce ET du dossier ; `setLineLogistics` borne les lignes au dossier ; `updateCost` et `removeCost` retrouvent le dossier du frais puis exigent OUVERT ; `linkImportOrder` contrôle type, fournisseur, statut et rattachement unique sous verrou ordonné.
- Uploads : type par signature (PDF/JPEG/PNG), 5 Mo, 30 pièces, nom stocké généré (24 caractères hexadécimaux plus extension), identifiant de dossier restreint à lettres, chiffres, tiret et tiret bas, stockage hors `public/` (`storage/` ignoré par Git), fichier supprimé si la transaction échoue, nom d'affichage nettoyé.
- Intégrité : IMP-AAAA-NNNN via `nextNumber` dans la transaction de création ; verrou FOR UPDATE ; stock modifié uniquement par `applyMovement` (REEVALUATION_COUT, après `lockStockLevels`) ; audit sur chaque écriture ; taux figé par frais.

### LOT-15 reporting
- Route `/api/rapports/[kind]` : 401/403/404, format par Zod, paramètres en liste blanche, périmètre appliqué côté serveur (`reportAccess`), export tracé (REPORT_EXPORT), nom de fichier issu d'une date validée.
- SQL : gabarits paramétrés `Prisma.sql` ; seuls les alias constants passent par `Prisma.raw` (`sql-filters.ts`). Identifiants de filtre vérifiés en base. Aucun `$queryRawUnsafe` dans le reporting.
- Excel : `sanitizeCell` (`src/lib/excel.ts`) neutralise les textes commençant par signe égal, plus, moins, arobase, tabulation ou retour chariot ; tous les exports passent par `buildWorkbook` / `buildMultiWorkbook`.

### Balayage transversal
- Actions : 24 fichiers "use server", tous les exports passent par `withAction` (hors `connexion`). Les actions à droit null sont des lectures personnelles ou délèguent au service (`createRequestAction`). Les actions DA déclarées `purchaseRequest.view` s'appuient sur `assertTransition`.
- Routes : cron protégé par CRON_SECRET à temps constant (503 si absent) ; exports et `/api/export-complet` (droit `data.export`) vérifient session, mot de passe, droit ; logo, photo, pièces DA et factures vérifient session et droit de lecture.
- Stock : `stockLevel.update` et `stockMovement.create` n'existent que dans `src/modules/stock/movements.ts`. Tous les `nextNumber` reçoivent le `tx` de création.
- Pages et composants : aucun import de `@/lib/db`, pas de dangerouslySetInnerHTML.
- Secrets : seul `.env.example` est suivi ; pas de secret en dur hors repli de test (M5). Horloge de test neutralisée en production.
- En-têtes : CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, HSTS en production. Session JWT 8 h, utilisateur relu en base à chaque requête. Origine des actions contrôlée par Next (ALLOWED_ORIGINS).

## Ordre conseillé
1. I1 (matcher du proxy + test du cron sans cookie).
2. I2 (garde de dépassement dans `toXof` + test).
3. I3, M1, M5.
4. M2 à M4, M9 au fil de l'eau.
