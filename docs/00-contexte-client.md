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
