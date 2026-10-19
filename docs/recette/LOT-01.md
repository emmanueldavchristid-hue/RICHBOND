# Recette LOT-01 – Authentification, rôles, utilisateurs, audit, mise en page

- Date : 19/10/2026
- Branche : `lot/01-auth-roles` (dernier commit `42eaacf`, plus des modifications de tests non commitées)
- Recetteur : agent recette métier (ancien Responsable Achats)
- Périmètre : `docs/specs/LOT-01-auth-roles.md`, EX-01, EX-02, EX-04, scénarios S0.1 et S0.2. Profils testés : Responsable Achats,
  Acheteur local, Acheteur import, Magasinier, Super-admin. Aucun fichier `.env*` n'a été lu.
- Contrôles lancés : `npm test` (15 fichiers, 262 tests verts), `npm run typecheck` (OK), `npm run lint` (0 erreur),
  `npx playwright test` (desktop + tablette iPad paysage), plus un parcours Playwright de recette sur tablette (port 3110)
  avec captures d'écran.

## Verdict : **Accepté avec réserves**

Les 5 critères d'acceptation sont tenus. La sécurité est sérieuse : mot de passe hashé, session relue en base à chaque requête,
verrouillage, journal sans secret, aucune suppression de compte, et on ne peut pas désactiver le dernier Responsable.
Rien ne bloque la démo à M. DIBI. Avant le LOT-02, il faut toutefois lever deux réserves : I1 (comptes inaccessibles en lecture
seule) et I2 (gestion des utilisateurs sur tablette).

## Critères d'acceptation

| # | Critère | Résultat | Preuve |
|---|---|---|---|
| 1 | Chaque rôle se connecte et voit un menu différent | OK | E2E `S0-1-acces-et-roles.spec.ts` : 5 profils verts sur desktop et tablette. Magasinier : Accueil, Achats, Stock, Rapports. Acheteur : tout sauf Paramètres. Responsable et Super-admin : tout. Le rôle s'affiche en français dans l'en-tête (« Acheteur (local) », « Responsable Achats »). Vérifié sur capture tablette. |
| 2 | Accès direct par URL à une page interdite → « Accès refusé », et l'action serveur refuse aussi | OK | Le Magasinier qui ouvre `/parametres/utilisateurs`, `/parametres/journal`, `/parametres` ou `/fournisseurs` arrive sur `/acces-refuse` (E2E et parcours de recette). Triple garde : `proxy.ts` par préfixe, `requirePageAction` dans chaque page, et `withAction` côté actions serveur (`guard.test.ts` : sans session, rôle insuffisant `FORBIDDEN`, mot de passe à changer, licence expirée, `sessionVersion` périmée). |
| 3 | Tests unitaires de la matrice : chaque rôle × chaque action sensible | OK | `tests/unit/permissions.matrix.test.ts` et `permissions.test.ts`. La matrice est exhaustive sur les 40 actions. Le périmètre LOCAL / IMPORT / ALL est couvert, et le SUPER_ADMIN n'a aucune écriture métier. |
| 4 | Verrouillage après 5 échecs testé | OK | `auth.lockout.test.ts` et `auth.lockout.edge.test.ts` : 4 échecs ne verrouillent pas, le 5e verrouille. Le compte reste verrouillé à 14 min 59 s et se débloque à 15 min 1 s. Avec 15 tentatives parallèles, un seul verrouillage. Le mot de passe saisi n'apparaît pas dans l'audit. E2E : verrouillage sur un compte jetable, message « Compte verrouillé, réessayez après HH:mm », puis déverrouillage par le Responsable. |
| 5 | Création d'utilisateur tracée dans le journal | OK | `users.test.ts` : une ligne `USER_CREATE` sans hash. E2E : la ligne « Création d'un utilisateur » est visible dans `/parametres/journal`, et le détail « après » ne contient pas le mot de passe temporaire. |

Exigences :
- EX-01 : OK. Compte individuel, bcrypt, JWT de 8 h invalidé par `sessionVersion` en cas de désactivation, de changement de rôle ou de réinitialisation.
- EX-02 : OK. Les 4 rôles et le périmètre acheteur sont en place. Le magasinier n'a pas de prix d'achat mais voit le PMP (H13).
- EX-04 : socle OK. `AuditLog` est écrit dans la même transaction que l'opération, avec un avant / après expurgé.

Écarts de spec acceptés : le nom du seed est « Responsable Achats (démo) » et non « François DIBI », ce qui respecte la règle 9 (H10).
Le mot de passe de démo n'est pas écrit dans le README (H11). Ces deux choix sont prudents et documentés.

Note sur les E2E : au premier passage, 2 tests tablette de S0.2 ont échoué (connexion du Responsable refusée). Au même moment,
un autre `playwright test` tournait sur la même base `richbond_test`, et son `globalSetup` vide puis réensemence la base pendant
le passage. Lancé seul, le parcours tablette se connecte normalement avec chaque rôle. Ce n'est pas un défaut applicatif,
mais voir C6.

## Anomalies

### Bloquant
Aucune.

### Important
- **I1 – Lecture seule : plus personne ne peut débloquer un compte.** Le plan (A9) prévoit que les actions du Super-admin sur
  les comptes échappent à `requireWritable`. Or toutes les actions de `parametres/utilisateurs/actions.ts` gardent
  `writable: true` par défaut. Quand l'essai expire, ni Jason ni M. DIBI ne peuvent plus réinitialiser un mot de passe oublié,
  déverrouiller ou désactiver un compte. Le cas réel : l'acheteur qui a oublié son mot de passe le jour où le client veut
  consulter ses données avant d'acheter la licence. À corriger au plus tard au LOT-02 : exempter au moins le Super-admin
  (A9), et idéalement aussi la réinitialisation, le déverrouillage et la désactivation par le Responsable, qui sont des
  actions de sécurité et non des écritures métier.
- **I2 – Liste des utilisateurs peu lisible sur tablette (iPad paysage, 1080 px).** Les colonnes « Dernière connexion » et
  « Actions » sortent de l'écran : il faut défiler horizontalement dans le tableau, et rien ne l'indique. Les badges de statut
  sont coupés (« Mot de passe à défi… »). Chaque ligne fait environ 270 px de haut, car les 3 ou 4 boutons s'empilent. Sur
  tablette, M. DIBI ne trouvera pas le bouton « Modifier ». Correction proposée : regrouper les actions dans un menu « … »
  par ligne, ou masquer la colonne Email sous 1280 px.
- **I3 – Le menu ne tient pas compte du périmètre de l'acheteur.** L'Acheteur local voit « Import » et ouvre `/import` sans
  être refusé. Le scénario S6.4 (« l'Acheteur local ne voit pas le menu Import ») sera donc faux tel quel. `visibleNav`
  appelle `can(user, "importFile.view")` sans `resource.scope`. C'est sans conséquence aujourd'hui (la page est « Bientôt
  disponible »), mais à régler au plus tard au LOT-12. À l'inverse, il faut décider si l'Acheteur import voit les BC locaux
  (« à confirmer »).

### Confort
- C1 – Dans le journal, la colonne « N° » affiche l'identifiant technique (`cmvehyjkw0001…`), qui ne parle à personne. Pour
  un utilisateur, il faudrait afficher le nom ou l'email concerné. Pour les lots suivants, il faudra afficher le numéro de
  pièce (`DA-2026-00001`), pas l'id.
- C2 – Le journal est envahi par « Connexion réussie » et « Déconnexion », qui représentent la majorité des lignes dès le
  premier jour. Il faudrait une case « Masquer les connexions », cochée par défaut, pour que M. DIBI voie d'abord les
  opérations sur les documents (EX-04).
- C3 – Le Responsable a un bouton « Réinitialiser le mot de passe » sur sa propre ligne. S'il clique, sa session est fermée
  (`sessionVersion` incrémenté) et le mot de passe temporaire est remplacé. Mieux vaut masquer ce bouton pour soi et renvoyer
  vers « Mon compte ».
- C4 – « Compte désactivé, contactez le Responsable Achats » s'affiche même avec un mauvais mot de passe. Cela révèle qu'un
  email existe. Le risque est faible en interne, mais le message pourrait n'apparaître qu'après un mot de passe correct.
- C5 – Le formulaire de connexion n'a ni `method="post"` ni `action`. Si l'on valide avant le chargement complet de la page
  (tablette lente sur le Wi-Fi du magasin), le navigateur peut envoyer l'email et le mot de passe dans l'URL, donc dans
  l'historique. Ce n'est pas reproduit en recette (sans JavaScript, la page ne s'affiche pas), mais il suffit d'ajouter
  `method="post"` pour couvrir ce cas.
- C6 – Les E2E partagent la base `richbond_test` sans verrou : deux passages simultanés (deux agents, ou CI et poste)
  s'écrasent mutuellement via `globalSetup` (TRUNCATE). Il faudrait ajouter un fichier verrou, ou une base par passage.
- C7 – L'accueil se résume à une liste de tuiles sans description (« Achats », « Stock », « Rapports »). Une ligne d'aide par
  tuile suffirait, par exemple « Demandes d'achat de réapprovisionnement » pour le magasinier.
- C8 – Les modifications de tests (`users.rules.test.ts`, `permissions.matrix.test.ts`, `auth.lockout.edge.test.ts`,
  `global-setup.ts`) et `docs/plans/LOT-01.md` ne sont pas commitées : à committer avant la fusion.
- C9 – Mon parcours de recette a laissé deux dossiers dans `test-results/` (`diag-*`, ignoré par git). Ils peuvent être supprimés.

## Idées d'amélioration à forte valeur (lots suivants)
1. **Historique sur chaque document (LOT-04 et suivants)** : un onglet « Historique » dans chaque DA et chaque BC, alimenté
   par `AuditLog` (qui, quoi, quand, avant / après). C'est ce que M. DIBI utilisera vraiment pour EX-04, plus que le journal
   global.
2. **Délégation de validation pendant les absences (LOT-04/05)** : quand M. DIBI est en congé ou en déplacement, désigner un
   suppléant avec des dates de début et de fin, tracé dans le journal. Sinon, les DA et BC restent bloqués, et c'est la
   première objection d'un Responsable Achats.
3. **Fiche utilisateur « Accès » imprimable (LOT-18)** : à la création d'un compte, une page de remise à imprimer (identifiant,
   mot de passe temporaire, URL de l'application, règles de mot de passe), à remettre en main propre aux acheteurs et au
   magasinier le jour du démarrage.
