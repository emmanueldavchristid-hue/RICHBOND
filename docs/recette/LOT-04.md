# Recette LOT-04 – Demandes d'achat (DA) et workflow de validation

- Date : 19/10/2026
- Branche : `lot/04-demandes-achat` (dernier commit `b0c3e42`)
- Recetteur : agent recette métier (ancien Responsable Achats, industrie)
- Périmètre :
  - `docs/specs/LOT-04-demandes-achat.md` : EX-20, et la partie DA d'EX-21 ;
  - `docs/plans/LOT-04.md` : choix D1 à D21 ;
  - scénarios S1 (étapes 1 à 3) et SD1 à SD5 de `docs/05-scenarios-de-test.md`.
  - Aucun fichier `.env*` n'a été lu. Le code n'a pas été modifié.
- Contrôles lancés :
  - `vitest tests/unit` : 24 fichiers, 444 tests verts.
  - `vitest` intégration DA (`purchase-requests.test.ts`, `purchase-requests.actions.test.ts`) : 57 tests verts.
  - `npm run typecheck` : OK.
  - `S1-da.spec.ts` et `SD-demandes.spec.ts`, en desktop et sur tablette :
    - premier passage complet (8,5 min) : 8 tests verts, 4 rouges, tous sur tablette (SD2 à SD5). SD2 a dépassé son délai en attendant la cloche. Les 3 suivants ont échoué dès la connexion, avec le message « Email ou mot de passe incorrect » ;
    - second passage, tablette seule : 5/5 verts (4,7 min).
  - Lecture du code : service, workflow, requêtes, écrans liste, fiche et formulaire, cloche, bandeau, seed.

## Verdict : **Accepté avec réserves**

Le workflow est juste et bien protégé :
- **Machine d'états** dans une seule table, testée statut par statut et rôle par rôle.
- **Numéro DA attribué à la soumission seulement** : pas de trou dû aux brouillons abandonnés, et le même numéro est gardé quand la DA revient « à compléter ».
- **Validation contrôlée** :
  - quantités réduites à la validation et tracées (avant → après) ;
  - « Local / Import » imposé à la validation d'une DA « À définir » ;
  - assignation automatique à l'acheteur le moins chargé du bon périmètre ;
  - alerte du Responsable si aucun acheteur ne couvre le périmètre.
- **Contrôle interne respecté** : le magasinier ne valide jamais, l'acheteur ne valide jamais sa propre DA, et l'auto-validation du Responsable est marquée dans la chronologie.
- **Arrêt de production** :
  - la DA passe en tête de liste et sa ligne est surlignée en rouge ;
  - un bandeau rouge s'affiche sur toutes les pages du Responsable, avec un lien « Ouvrir la demande » ;
  - la notification est classée CRITIQUE, et la date de besoin est mise à aujourd'hui.
- **Doublon** : l'avertissement « Déjà demandé : DA-…, 5 U, besoin le JJ/MM » ne bloque pas. Il apparaît à la saisie, puis de nouveau sur la fiche au moment de la validation.
- **Prix** retirés côté serveur pour le magasinier : fiche, liste et export.
- **Lecture seule** : quand l'essai a expiré, la consultation et l'export restent possibles.
- **Concurrence** : si deux personnes agissent en même temps sur une DA, la seconde reçoit un conflit (`CONFLICT`). Le travail de la première n'est pas écrasé.

Rien ne bloque la démo.

**« Vois-je en 5 s ce qui m'attend ? »** : oui sur la page Demandes d'achat, pas encore à la connexion.
- Ce qui marche :
  - un arrêt de production s'impose tout de suite (bandeau rouge) ;
  - l'onglet « À valider » s'ouvre par défaut, avec un compteur rouge ;
  - la cloche affiche le nombre de notifications non lues ;
  - la validation groupée se fait en 3 gestes.
- Ce qui manque :
  - à la connexion, M. DIBI arrive sur un `/accueil` fait de tuiles génériques, sans aucun chiffre. Il doit cliquer sur « Achats » pour voir ce qui l'attend (I1) ;
  - les onglets « Toutes » et « Mes demandes » affichent d'abord les DA les plus anciennes (I2).

## Critères d'acceptation

| # | Critère | Statut | Preuve |
|---|---|---|---|
| 1 | Tests unitaires de toutes les transitions de statut, autorisées et interdites, par rôle | **OK** | `tests/unit/purchase-requests.workflow.test.ts` : matrice statut × action × rôle, états finaux immuables, actions système (consultation / commande). Les tests sont verts. |
| 2 | Le magasinier ne peut pas valider ; un acheteur ne peut pas valider sa propre DA | **OK** | `workflow.ts` : `roleAllows` puis `SELF_APPROVAL`. Tests unitaires (« le Magasinier ne peut jamais valider… », « un acheteur ne valide pas, même sa propre DA »). Test d'intégration : magasinier → `FORBIDDEN`. Côté écran, les boutons viennent de `availableActions`. S1, étape 3 : l'acheteur ne voit aucun bouton de validation. |
| 3 | Avertissement de doublon testé | **OK** | `purchase-requests.duplicates.test.ts`. Intégration : doublon signalé sur une DA ouverte, ignoré sur une DA annulée ou refusée. SD3 de bout en bout : avertissement avant l'envoi, rappel sur la fiche, disparition après annulation de la 1re DA. Les BC en cours seront ajoutés au LOT-05 (`OpenOrderSource`). |
| 4 | Toutes les décisions sont dans la chronologie et le journal d'audit | **OK** | Le service écrit `recordEvent` et `log(tx, …)` dans la même transaction, pour chaque création, modification, soumission, validation, refus, retour, annulation, assignation, commentaire et pièce jointe. Test d'intégration « 1 AuditLog + 1 PurchaseRequestEvent » par décision. Le seed, lui, n'écrit pas d'audit (C5). |
| 5 | Le scénario S1 (docs/05) passe | **OK** | `S1-da.spec.ts` est vert en desktop et sur tablette. Il couvre la DA du magasinier, la réduction du toner de 2 à 1 avec le choix du type Local, puis la notification et l'onglet « Assignées à moi » de l'acheteur local. |

Exigences du plan hors critères formels :
- Validation groupée (SD4) : OK.
- Retour « à compléter » puis resoumission avec le même numéro (SD2) : OK.
- Essai expiré (SD5) : OK.
- Pièces jointes : contrôle de signature, 5 Mo maximum, lecture protégée. Couvert en intégration.

## Anomalies

### Bloquant
Aucune.

### Important

**I1. Rien n'attend M. DIBI à la connexion.**
- Constat : `/accueil` affiche des tuiles sans aucun chiffre. Le nombre de DA à valider n'apparaît que dans l'onglet de `/achats/demandes`, qui demande un clic de plus.
- Le tableau de bord complet relève du LOT-08. Mais le jour de la démo, la première impression compte.
- Correction minimale : une tuile ou une pastille « À valider : 4 DA (dont 1 arrêt de production) » sur l'accueil, ou un compteur sur l'entrée « Achats » du menu. Cela réutilise `toValidate`.

**I2. Ordre des onglets « Toutes » et « Mes demandes ».**
- Constat : `buildRequestOrder` trie toujours par `priority asc` puis `neededBy asc`.
- Conséquences :
  - (a) une DA « Arrêt de production » refusée, annulée ou commandée il y a 6 mois reste indéfiniment en tête de « Toutes » et de « Mes demandes ». De plus, les lignes COMMANDEE restent surlignées en rouge ;
  - (b) en dessous, les DA les plus anciennes passent en premier. Après quelques mois, l'acheteur doit aller page 5 pour retrouver la DA d'hier.
- Correction attendue :
  - garder la priorité absolue de l'arrêt de production pour les statuts ouverts uniquement (SOUMISE, A_COMPLETER, VALIDEE, EN_CONSULTATION, PARTIELLEMENT_COMMANDEE) ;
  - trier ensuite par date de soumission ou de création décroissante dans « Toutes » et « Mes demandes » ;
  - garder le tri par date de besoin croissante pour « À valider » et « Assignées à moi ».

**I3. La validation groupée ne fonctionne jamais pour les DA du magasinier.**
- Constat : les DA de réappro sont créées « À définir » (D10), puis toujours écartées par la validation groupée (D19). Or les DA de réappro sont justement les plus nombreuses et les plus répétitives.
- Pistes :
  - proposer dans la confirmation groupée un choix « Type pour les DA à définir : Local / Import » ;
  - ou bien prendre par défaut le type de l'article, une fois le fournisseur principal connu.
- La première piste est simple et suffit.

**I4. Les scénarios e2e sont instables quand on les lance tous ensemble.**
- Constat : au premier passage complet, 4 tests tablette ont échoué. SD2 a dépassé son délai en attendant la cloche, et les 3 suivants ont été refusés à la connexion (« Email ou mot de passe incorrect »). Rejoués seuls, ils sont tous verts.
- Causes probables : charge du serveur de dev, ou compteur d'échecs de connexion / verrouillage par compte partagé entre les tests.
- Ce n'est pas visible par le client. Mais cela fragilise la règle « tests verts avant fusion » des lots suivants. À stabiliser par le testeur-workflow : session réutilisée (`storageState`) ou comptes dédiés par projet.

### Confort

**C1. Chronologie « Quantité modifiée » sans nom d'article.**
- Constat : la chronologie affiche « Ligne 2 : 2 → 1 » sans dire de quel article il s'agit. De plus, le `payload.designation` contient l'identifiant technique de l'article, pas son code.
- Souhaité : « Ligne 2 – ART-00012 Toner : 2 → 1 ».

**C2. La validation ne permet que de réduire une quantité.**
- Constat : impossible d'augmenter (arrondi au carton ou au minimum de commande du fournisseur, regroupement de besoins). C'est un choix prudent et défendable.
- À confirmer avec M. DIBI. En attendant, l'arrondi pourra se faire au BC (LOT-05).

**C3. Stock et couverture absents de la fiche et de la fenêtre de validation.**
- Constat : ils ne sont affichés que dans le formulaire, et valent « – » jusqu'au LOT-07 (prévu).
- Au LOT-07, il faut les mettre aussi dans la fenêtre de validation : c'est là que le Responsable décide de réduire une quantité.

**C4. Bandeau rouge d'arrêt de production rafraîchi seulement à la navigation.**
- Constat : le bandeau n'est recalculé qu'en changeant de page. La cloche, elle, se rafraîchit toutes les 60 s. Si M. DIBI reste sur une page, l'arrêt n'apparaît qu'au badge de la cloche.
- C'est acceptable. Un `router.refresh()` quand arrive une notification CRITIQUE suffirait.

**C5. Données du seed visibles en démo.**
- Les motifs commencent par « [démo] », et ce préfixe s'affichera dans le bandeau rouge et dans la liste devant M. DIBI. C'est honnête, mais un peu brut : préférer un marqueur invisible à l'écran (champ technique ou tag dans l'audit).
- Les DA du seed n'ont pas d'entrées dans le journal d'audit. Si on ouvre « Journal d'activité » pendant la démo, il paraîtra vide pour ces DA.

**C6. Le compteur « À valider » suit les filtres actifs.**
- Constat : le compteur rouge de l'onglet varie avec les filtres urgence, service ou acheteur. Quand on filtre « Service = Maintenance », on croit qu'il n'y a plus que 2 DA à valider.
- Le compteur devrait rester global.

## Idées à forte valeur (lots suivants)

1. **Prévenir l'acheteur dès la soumission d'un arrêt de production** (LOT-05 ou LOT-16). Dans la vraie vie, l'acheteur commence à chercher le roulement avant même la validation formelle. Une notification « pré-alerte » à l'acheteur du périmètre, ou à tous si le type est « À définir », fait gagner des heures de machine arrêtée.
2. **Âge et délai sur la liste « À valider »** (LOT-08). Afficher « soumise il y a 3 j » et mettre en rouge la date de besoin quand elle est dépassée. C'est l'indicateur que la direction regardera : délai moyen de validation des DA.
3. **Réponse rapide sur la DA** (LOT-05/16). Bouton « Créer le BC » sur la fiche d'une DA validée assignée à moi, et relance automatique du Responsable quand une DA reste plus de 48 h en « À valider ».
