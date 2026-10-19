# Contexte client et décisions

## Le client
- **Société** : RICHBOND CI (industrie).
- **Interlocuteur** : M. DIBI N'GORAN François, Responsable Achats (coordonnées dans le cahier des charges PDF, hors dépôt public).
- **Prestataire** : Christ-Emmanuel (Jason) Mouhi, freelance, en son nom propre.
- **Modalités** : période d'essai accordée au client ; paiement prévu au bout d'un mois.

## L'équipe utilisatrice
| Rôle | Nom | Email | Périmètre |
|---|---|---|---|
| Responsable Achats | DIBI N'GORAN François | à compléter | Tout |
| Acheteur 1 | à compléter | à compléter | local / import / les deux (à confirmer) |
| Acheteur 2 | à compléter | à compléter | local / import / les deux (à confirmer) |
| Magasinier | à compléter | à compléter | Stock |

Les noms seront saisis par Jason dans l'écran **Paramètres > Utilisateurs** (LOT-01). Le seed utilise des noms fictifs.
Correspondance avec le cahier des charges : « assistant achat local » et « assistant achat import » = les 2 acheteurs
(avec un périmètre), « gestionnaire de stock » = le magasinier.

## Environnement Sage
- Sage 100 **Gestion commerciale i7** installé chez le client (édition Maestria, fichiers `.gcm`).
- Jason configure aussi la base Sage pour l'équipe achats : voir `docs/sage/configuration-sage-achats.md`.
- Répartition des rôles entre les deux outils : voir `docs/04-integration-sage.md`.

## Période d'essai de l'application
- Durée par défaut : 30 jours à partir de l'installation chez le client (date réglable par le SUPER_ADMIN).
- Compte à rebours visible : fenêtre à la connexion + badge permanent dans l'en-tête (LOT-02).
- À l'échéance : passage en **lecture seule**. Les données restent consultables et exportables, rien n'est supprimé.
- Activation par une clé de licence générée par Jason.

## Décisions et hypothèses (à confirmer avec le client)
| # | Hypothèse prise | Statut |
|---|---|---|
| H1 | Toute DA est validée par le Responsable Achats | à confirmer |
| H2 | Tout BC est validé par le Responsable Achats ; seuil réglable (par défaut 0 FCFA = tous) | à confirmer |
| H3 | Numérotation : `DA-AAAA-00001`, `BC-AAAA-00001`, `REC-AAAA-00001`, `SOR-AAAA-00001`, `INV-AAAA-0001`, `IMP-AAAA-0001` | à confirmer (peut devoir suivre Sage) |
| H4 | Un seul site, un dépôt principal (« MAGASIN CENTRAL ») + possibilité d'en créer d'autres | à confirmer |
| H5 | TVA 18 % sur achats locaux, PMP calculé hors taxes | à confirmer |
| H6 | Inventaire hebdomadaire tournant (une partie des articles chaque semaine, tous les articles A chaque mois) | à confirmer |
| H7 | Application maître du cycle DA → BC → réception ; Sage maître de la comptabilité et des codes articles/fournisseurs | à confirmer |
| H8 | Jours ouvrés = lundi–vendredi ; jours fériés ivoiriens non gérés à ce stade (utile pour les délais fournisseurs) | à confirmer |
| H9 | Comptes seed fictifs sur le domaine `richbond.test` (TLD réservé, remplace `exemple.ci` depuis LOT-01) ; les anciens comptes `@exemple.ci` sont désactivés par le seed ; les vrais comptes sont créés par le SUPER_ADMIN à l'installation | à confirmer |
| H10 | Emails seed `@richbond.test` (spec LOT-01) ; nom du Responsable en seed = « Responsable Achats (démo) » et non le vrai nom du client (règle 9) | à confirmer |
| H11 | Mot de passe de démo non écrit dans le dépôt : le README renvoie à `SEED_DEFAULT_PASSWORD` | à confirmer |
| H12 | Session de 8 h ; verrouillage 15 min après 5 échecs consécutifs ; déverrouillage anticipé par le Responsable | à confirmer |
| H14 | Le message « Compte désactivé, contactez le Responsable Achats » s'affiche à la connexion même avec un mauvais mot de passe (révèle l'existence de l'email ; risque faible en interne). Laissé tel quel (recette LOT-01 C4) ; envisager de ne l'afficher qu'après un mot de passe correct | à confirmer |
| H13 | Le Magasinier ne voit pas les prix d'achat mais voit le PMP ; réglage modifiable en LOT-03 | à confirmer |
| H15 | Statut de licence calculé à chaque lecture avec l'heure serveur (EXPIRED non persisté) ; fin d'essai à 23:59 heure d'Abidjan ; `TRIAL_END_DATE`/`TRIAL_DAYS` lus seulement à la création de la licence | à confirmer |
| H16 | Protection contre le recul de l'horloge du serveur : l'application retient la dernière heure vue et ne revient jamais en arrière | à confirmer |
| H17 | Fenêtre d'essai affichée à tous les rôles, une fois par session, et à nouveau aux jours de rappel J-7, J-3, J-1 et le dernier jour | à confirmer |
| H18 | Clé de licence de 20 caractères (`RB-XXXXX-XXXXX-XXXXX-XXXXX`) ; 5 essais d'activation max par 15 min | à confirmer |
| H19 | Activation définitive : pas de révocation dans l'application ; changement de bénéficiaire = nouvelle clé par Jason | à confirmer |
| H20 | Si la ligne de licence est supprimée en base, un nouvel essai est recréé automatiquement (durée par défaut) | à confirmer |
| H21 | Les boutons Désactiver / Réinitialiser (comptes) restent actifs en consultation seule (essai expiré) | à confirmer |
| H22 | Un seul code par article et par fournisseur (= code Sage s'il existe), majuscules, 17 caractères max ; vide à la création = généré (`ART-00001`, `FRS-00001`) ; modifiable par le Responsable seul, avec audit (LOT-03, R1/R2) | à confirmer |
| H23 | Coefficient de conversion : 1 unité d'achat = `coef` unités de stock, strictement positif, 3 décimales, arrondi demi-supérieur (LOT-03, R3) | à confirmer |
| H24 | Unités : liste fermée (U, KG, G, T, L, M, M2, M3, ROULEAU, FUT, CARTON, SAC, PALETTE, PAIRE, JEU, H, FORFAIT, BOBINE, BIDON, PCE) en attendant l'import Sage (LOT-03, R4) | à confirmer |
| H25 | Bloquer un fournisseur : acheteurs et Responsable (motif obligatoire) ; le débloquer : Responsable seul (LOT-03, R8) | à confirmer |
| H26 | Les acheteurs écrivent sur tous les fournisseurs et articles, quel que soit leur périmètre local/import ; le périmètre s'applique aux DA, BC et dossiers (LOT-03, R9) | à confirmer |
| H27 | Taux de change saisis à la main, en FCFA pour 1 unité de devise, dernier taux antérieur ou égal à la date ; alerte « taux ancien » au-delà de 30 jours ; EUR = 655,957 (confirmation si différent) (LOT-03, R11) | à confirmer |
| H28 | Taux saisis par les acheteurs et le Responsable (`exchangeRate.manage`) ; dépôts, services et devises gérés par le Responsable ; lecture ouverte à tout utilisateur connecté (LOT-03, R14) | à confirmer |
| H29 | Prix d'achat masqués au Magasinier par défaut (réglage `warehouse.showPurchasePrice`, modifiable par le Responsable) ; les prix ne quittent pas le serveur pour lui (LOT-03, R15) | à confirmer |
| H30 | Photos d'articles stockées sur le serveur applicatif (`storage/items/`, hors dépôt git), servies après contrôle de session, à inclure dans la sauvegarde (LOT-15) (LOT-03, R19) | à confirmer |
| H31 | Le prix d'un lien article-fournisseur, son historique et le minimum de commande sont exprimés par unité d'ACHAT de l'article (unité affichée partout) ; stock de sécurité, point de commande et quantité économique par unité de STOCK. L'unité d'achat d'un article ne peut plus changer tant que des prix y sont rattachés (LOT-03, revue I1) | à confirmer |
| H32 | Unité d'achat identique à l'unité de stock : coefficient obligatoirement égal à 1 (LOT-03, revue I3) | à confirmer |
| H33 | Un code de plus de 17 caractères ou contenant un caractère hors A-Z, 0-9, « - », « _ », « . » est refusé avec un message (jamais tronqué ni corrigé en silence). Format exact des codes à confirmer sur un export Sage réel (LOT-03, revue I4) | à confirmer sur export Sage réel |
| H34 | Fiche fournisseur : adresse, téléphone et email généraux, banque/RIB en texte libre (non repris dans le journal d'audit ni dans l'export Excel) ; conditions de paiement déjà présentes (LOT-03, revue I5) | à confirmer |
| H35 | Un taux de change s'écartant de plus de 20 % du dernier taux connu de la même devise demande une confirmation explicite (toutes devises ; EUR garde en plus sa parité fixe) (LOT-03, revue) | à confirmer |
| H36 | Confort non traité en LOT-03 : le Magasinier n'a pas accès aux fiches fournisseurs ; la fiche article s'ouvre directement en édition pour qui a le droit d'écriture (pas de bouton « Modifier ») ; devises et réglages sont des paramètres sans verrou de version (dernière écriture gagnante, opérations sérialisées par verrou de ligne) | à confirmer |
