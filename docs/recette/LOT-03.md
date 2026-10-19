# Recette LOT-03 – Référentiels (articles, fournisseurs, dépôts, services, devises)

- Date : 19/10/2026
- Branche : `lot/03-referentiels` (dernier commit `c04fc86`). L'arbre de travail contenait aussi deux modifications non commitées, de simple mise en forme (Prettier) : `src/components/data-table/toolbar.tsx` et `tests/e2e/scenarios/SR-referentiels.spec.ts`.
- Recetteur : agent recette métier (ancien Responsable Achats, industrie)
- Périmètre :
  - `docs/specs/LOT-03-referentiels.md`, EX-10 et EX-11, `docs/plans/LOT-03.md` (règles R1 à R20) ;
  - scénarios SR1 à SR6 de `docs/05-scenarios-de-test.md`.
  - Aucun fichier `.env*` n'a été lu.
- Contrôles lancés :
  - `npm test` : 29 fichiers, 433 tests verts ;
  - `npm run typecheck` : OK ;
  - `npm run lint` : 0 erreur. Les 2 avertissements viennent des scripts jetables de `tests/e2e/_recette/`.
  - `SR-referentiels.spec.ts` : 16/16 verts, en desktop et sur tablette iPad paysage (3,9 min).
  - Un parcours Playwright de recette, avec captures, en Responsable, Magasinier (tablette) et Acheteur local. Il comprend des saisies piégées : unités identiques avec un coefficient, code avec « / », code de 18 caractères, doublon de code en minuscules, seuils inversés, coefficient nul, service.

## Verdict : **Accepté avec réserves**

Le socle est solide et pensé « achats » :
- **Code = code Sage** : généré `ART-00001` / `FRS-00001` si vide, figé pour l'acheteur, modifiable par le Responsable seul, avec trace au journal.
- **Unités et conversion** : aperçu en direct « 1 Fût (FÛT) = 200 KG ».
- **PDR** : champ équipement et filtre « machine », criticité expliquée (« une rupture arrête une ligne de production »).
- **Blocage fournisseur** : motif obligatoire, bandeau rouge sur la fiche (« aucun bon de commande possible »), déblocage réservé à M. DIBI.
- **Prix** : masqués au magasinier côté serveur, historique des prix conservé.
- **Taux de change** : datés, avec alerte « taux ancien » et garde-fou sur la parité EUR.
- **Listes** : rapides, filtrables, exportables, même en consultation seule.

Le seed est crédible pour une usine de matelas et de mousse : polyol, TDI, MDI, tissus, ressorts ensachés, roulements 6205/6308, moteur 7,5 kW, buse de mélange, fournisseurs de Shenzhen, Hambourg, Mumbai…

Rien ne bloque la démo. Il reste cependant un point de fond à trancher **avant le LOT-05** : l'unité dans laquelle on exprime le prix et le minimum de commande (I1). Le plus visible en démo sera la colonne « Équivalent FCFA » vide sur tout l'historique du seed (I2).

## Critères d'acceptation

| # | Critère | Résultat | Preuve |
|---|---|---|---|
| 1 | Listes avec recherche, filtres (catégorie, type, statut, criticité), tri, pagination, export Excel | OK | SR4 (desktop et tablette) :<br>- « 1–25 sur N », page 2, tri croissant et décroissant ;<br>- recherche par désignation et par référence fournisseur ;<br>- filtres catégorie, famille, criticité, statut, ainsi que type, pays et statut pour les fournisseurs ;<br>- état conservé dans l'URL ;<br>- export `articles_AAAAMMJJ.xlsx` avec autant de lignes que le filtre.<br>Dans mon parcours sur tablette, le filtre PDR + Critique donne « 1–5 sur 5 », et le filtre « Équipement / machine » apparaît dès qu'on choisit PDR. |
| 2 | Unicité des codes, validation Zod, messages en français | OK, avec la réserve I4 | - `art-00001` est refusé avec « Ce code existe déjà. » (passage en majuscules avant contrôle) ;<br>- `MP/POLY01` est refusé avec « Code invalide : 17 caractères maximum… » ;<br>- seuils inversés : « Le point de commande doit être supérieur ou égal au stock de sécurité. » ;<br>- coefficient 0 : « …doit être strictement positif. »<br>En intégration, 10 créations parallèles avec le même code donnent 1 succès, et 20 codes automatiques donnent une séquence sans trou. **Mais un code de 18 caractères est tronqué sans message** (I4). |
| 3 | Conversion unité d'achat → unité de stock testée | OK, avec la réserve I3 | `tests/unit/referentials.conversion.test.ts` couvre :<br>- 1 FÛT × 200 = 200 KG ;<br>- 2,5 ROULEAU × 50 = 125 M ;<br>- l'arrondi à 3 décimales et le coefficient ≤ 0 refusé ;<br>- l'aller-retour.<br>En SR1, l'aperçu affiche « 1 Carton = 10 U ». **Mais unité d'achat = unité de stock avec un coefficient 10 est accepté** (I3). |
| 4 | Seed : ~40 articles réalistes, ~25 fournisseurs (local, Chine, Europe, Inde), noms fictifs | OK, avec la réserve I2 | **40 articles** : 9 MP, 6 intrants, 16 PDR sur 5 équipements, 6 fournitures, 3 services.<br>**25 fournisseurs** : 12 locaux (Abidjan, Bouaké, San-Pedro), 6 Chine, 4 Europe, 3 Inde. Parmi eux, 2 sont en évaluation et 1 est bloqué avec motif. NCC et téléphones fictifs.<br>Le seed est idempotent (test `seed.test.ts`). L'historique des prix n'a pas de taux (I2), et l'unité des prix est incohérente d'un article à l'autre (I1). |
| 5 | Droits : magasinier en lecture, acheteurs et Responsable en écriture | OK | - Magasinier sur tablette : fiche grisée « Fiche en lecture seule », aucun bouton d'écriture, ni prix ni onglet « Historique des prix ». Les prix ne sont pas envoyés au navigateur (SR2). Le menu ne propose pas Fournisseurs ni Paramètres (conforme à la matrice LOT-01).<br>- Les écritures directes sont refusées (`FORBIDDEN`, tests d'intégration).<br>- Acheteur : peut écrire sur les articles, les fournisseurs et les taux, mais ne peut ni débloquer un fournisseur ni ouvrir dépôts et devises.<br>- Essai expiré (SR5) : consultation et export OK, boutons grisés. |

## Ce que voit l'utilisateur (vérifié)

- **Fiche article**
  - Sections claires : Identification, Unités et conversion, Stock, Approvisionnement, plus la photo.
  - Une aide sous chaque seuil (« Niveau à ne jamais atteindre », « Déclenche le réapprovisionnement »).
  - Badges Critique / Actif, boutons « Bloquer » et « Marquer obsolète ».
- **Onglet Fournisseurs de l'article**
  - Fournisseur avec la mention « Principal » et le statut « En évaluation » visible, référence, dernier prix dans sa devise, date, délai, minimum.
  - Gros boutons Modifier / Retirer (44 px).
- **Fiche fournisseur bloqué**
  - Bandeau rouge avec le motif et la date.
  - Indicateurs « – » (BC, montant 12 mois, taux de service, note) prêts pour les lots 5, 10 et 14.
  - Incoterm présent pour les fournisseurs import.
- **Devises**
  - XOF « devise de base ».
  - CNY 83, EUR 655,957 et USD 605, datés de la veille.
  - Boutons « Saisir un taux », « Historique ».

## Anomalies

### Bloquant
Aucune.

### Important

- **I1 – Le prix et le minimum de commande n'ont pas d'unité, et le seed mélange les conventions.**
  - Ce qu'on voit :
    - Polyol : unité d'achat FÛT de 200 KG, « Dernier prix 1,90 EUR », « Minimum 200 ». C'est 1,90 € le kg… et 200 fûts ou 200 kg ?
    - Étiquettes produit (ROULEAU de 1 000 U) : « 18 500 FCFA » est un prix au rouleau.
    - Roulement 6205 (CARTON de 10 U) : « 3 800 FCFA » est un prix à la pièce.
    - Les seuils (stock de sécurité 4 000, point de commande 8 000) s'affichent eux aussi sans unité.
  - Pourquoi c'est important :
    - au LOT-05, le BC se fait en unité d'achat ;
    - au LOT-06/07, le PMP se calcule en unité de stock.
    - Un acheteur qui saisit « 1,90 » en pensant au kg, alors que le BC multiplie par des fûts, produit un BC faux d'un facteur 200.
  - À faire avant le LOT-05 :
    - fixer la règle (proposition prudente : **prix et minimum exprimés en unité d'achat**, comme sur la facture fournisseur) et la noter « à confirmer » ;
    - afficher l'unité partout : « 380 EUR / FÛT », « Minimum 2 FÛT », « Stock de sécurité 4 000 KG » ;
    - mettre le seed en cohérence.
- **I2 – L'historique des prix du seed n'a aucun taux : la colonne « Équivalent FCFA » est vide (« – ») sur tous les articles de démonstration.**
  - En démo, M. DIBI ouvrira le polyol et verra 1,90 EUR / 2,10 USD / 14,20 CNY sans pouvoir les comparer.
  - Seuls les prix saisis dans l'application ont un taux (SR1).
  - Correction : le seed renseigne `rateToXof` à partir des taux semés. Le taux à J-35 existe déjà, il faudrait en ajouter un vers J-120 pour l'ancien prix.
- **I3 – Unité d'achat = unité de stock avec un coefficient différent de 1 est accepté.**
  - Preuve : `ART-00041` a été créé avec U → U et un coefficient de 10.
  - Conséquence au LOT-06 : une réception de 5 U entrera 50 U en stock.
  - Correction : si les deux unités sont identiques, le coefficient doit valoir 1, avec un message en français. C'est une règle Zod d'une ligne.
- **I4 – Le code d'un article de plus de 17 caractères est tronqué en silence, et la limite reste à confirmer côté Sage.**
  - Preuve : la saisie (ou le collage) de `ABCDEFGHIJKLMNOPQR` (18 caractères) enregistre `ABCDEFGHIJKLMNOPQ`, sans aucun message. C'est l'effet du `maxLength={17}` de `CodeInput`.
  - Pourquoi c'est un risque :
    - dans Sage 100, la référence article accepte en principe 18 caractères et le compte tiers 17 ;
    - la regex refuse aussi « / » et l'espace, que certaines bases Sage utilisent.
  - Si les codes réels de RICHBOND dépassent ou utilisent ces caractères, l'import du LOT-09 rejettera des articles, ou pire créera des codes différents de Sage.
  - Correction :
    - ne pas tronquer : laisser saisir et afficher l'erreur ;
    - **confirmer la longueur et les caractères sur un export Sage réel avant le LOT-09** (à ajouter dans `docs/blocages.md` ou à H22).
- **I5 – La fiche fournisseur n'a ni adresse, ni téléphone ou email général, ni coordonnées bancaires.**
  - Le BC du LOT-05 doit porter l'adresse du fournisseur (rue, BP, ville). Les paiements import se font par virement (banque, IBAN/SWIFT), et les contacts seuls ne suffisent pas.
  - Ce n'était pas dans la spec, mais c'est un manque évident pour un acheteur.
  - À ajouter au plus tard au début du LOT-05 : adresse, BP, téléphone et email généraux. La banque et l'IBAN pourront venir au LOT-12 ou LOT-13.

### Confort

- **C1 – La liste fermée d'unités ne couvre pas tout le terrain.**
  - Il manque BOBINE ou CÔNE (fil), BIDON, BOÎTE, LOT, PLAQUE ou BLOC (mousse).
  - Le guide de configuration Sage du projet parle aussi de `PCE`, alors que l'application utilise `U`.
  - À traiter au LOT-09 : prévoir une table de correspondance avec les unités Sage, ou laisser le Responsable ajouter une unité.
- **C2 – Seul l'euro est protégé contre une erreur de taux.**
  - Un USD saisi à 6 050 au lieu de 605, ou un taux inversé, passe sans alerte.
  - Proposition : demander une confirmation quand l'écart avec le dernier taux dépasse 10 %.
- **C3 – Liste des articles sur tablette.**
  - Le code se coupe sur deux lignes (« ART- / 00016 ») et la colonne « Fournisseur principal » est rognée : il faut défiler horizontalement.
  - La catégorie « Pièce de rechange (PDR) » est répétée sur chaque ligne alors qu'elle est déjà filtrée.
  - À faire : un code insécable, et des colonnes masquables ou le mode cartes en portrait.
- **C4 – La fiche article est directement en mode modification.**
  - Il n'y a pas de bouton « Modifier », d'où un risque de modification involontaire par un acheteur.
  - Pour le magasinier, la fiche ressemble à un grand formulaire grisé plutôt qu'à une fiche de consultation lisible.
- **C5 – On ne sait pas qui a bloqué un fournisseur.** `blockedById` est enregistré mais pas affiché dans le bandeau : « Bloqué le 19/10/2026 par … ».
- **C6 – Le magasinier ne voit pas les fiches fournisseurs.** C'est conforme au LOT-01, mais à confirmer avec M. DIBI : à la réception, il peut avoir besoin du téléphone du fournisseur. Les noms affichés sur l'article ne sont pas cliquables pour lui, et c'est correct.
- **C7 – Cohérence des données et des règles.**
  - Seed : le fournisseur de fils bloqué (« Ahmedabad Yarn ») est lié aux ressorts ensachés.
  - Rien n'avertit d'un fournisseur « Import » dont le pays est CI, ni d'un fournisseur « Local » situé à l'étranger.
  - L'unité de stock reste modifiable après création : il faudra la verrouiller au LOT-07, dès qu'il existe des mouvements.

## Idées d'amélioration à forte valeur

1. **Comparer les fournisseurs en FCFA sur l'onglet Fournisseurs de l'article** (LOT-05 ou LOT-10). Il s'agit d'ajouter une colonne « Équivalent FCFA » (prix × dernier taux) à côté du délai, et de marquer « le moins cher » et « le plus rapide ». Exemple pour le polyol : 1,90 EUR ≈ 1 246 FCFA ; 2,10 USD ≈ 1 271 FCFA ; 14,20 CNY ≈ 1 179 FCFA. C'est la première question d'un Responsable Achats, et l'effet en démo est immédiat.
2. **Vue « Pièces d'une machine »** (LOT-07/08) : choisir « Ligne mousse continue » et voir toutes ses PDR, avec leur criticité, le stock face au seuil et le délai fournisseur. Pour éviter les doublons de saisie (« Ligne mousse continue » / « Ligne de mousse »), il faudrait une liste d'équipements normalisée. C'est l'outil anti-arrêt de ligne que la maintenance réclamera.
3. **Contrôle qualité des référentiels avant l'import Sage** (LOT-09) : un rapport des fiches incomplètes. Il listerait :
   - les articles critiques sans seuils ou sans fournisseur principal ;
   - les PDR critiques sans équipement ;
   - les prix de plus de 6 mois ;
   - les fournisseurs sans NCC ni contact.

   Il sert à fiabiliser la base avant de s'en servir pour les alertes et l'évaluation des fournisseurs.

## Note de recette

- Mon parcours a utilisé deux scripts temporaires dans `tests/e2e/_recette/lot03/` (`pw.config.ts`, `r.spec.ts`). Leur suppression m'a été refusée par l'environnement : **il faut supprimer ce dossier**, ainsi que les anciens `tests/e2e/_recette/*.spec.ts` et `tests/e2e/_dbg/`, **avant le commit**.
- Les articles de test créés (`ART-00041`, `ABCDEFGHIJKLMNOPQ`, `ART-00042`) sont dans la base de **test** uniquement. Le `global-setup` des tests e2e la réinitialise.
- Je n'ai modifié aucun fichier de code.
