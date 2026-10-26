# Recette LOT-09 – Import Excel/CSV des données initiales (EX-12)

Recette par lecture du code et des tests. Rien n'a été exécuté (ni serveur, ni Playwright, ni Vitest).
Les verdicts "OK" ci-dessous reposent donc sur la lecture du code et sur l'existence de tests dont les assertions correspondent, pas sur une exécution.

**Verdict : Accepté avec réserves.** Il n'y a aucun bloquant. Le socle est sérieux : ré-import sans doublon, stock par mouvements, droits, verrou anti-doublon, aperçu sans écriture. Une réserve importante pèse sur l'usage réel avec un export Sage : la catégorie obligatoire et les codes à espaces. Elle est à traiter avant de charger les vraies données.

## Critères d'acceptation

| Critère | Verdict | Preuve |
|---|---|---|
| Fichiers d'exemple dans `tests/fixtures/import/` (valide, erreurs, désordre) | OK | `articles-valides.csv`, `articles-erreurs.csv`, `articles-desordre.csv`, plus `fournisseurs.csv`, `article-fournisseur.csv`, `stock-initial.csv`. Utilisés par `tests/unit/import.rules.test.ts`, `tests/integration/import.test.ts` et `S-import.spec.ts`. |
| Ré-importer le même fichier ne crée pas de doublon | OK | Mise à jour par code. Les lignes identiques sortent en "Inchangé" (`itemPatch`, `supplierPatch`, `linkPatch`). Le stock initial est ignoré si un mouvement `IMPORT-STOCK-INITIAL` existe déjà pour l'article et le dépôt. Un verrou `pg_advisory_xact_lock` empêche deux imports simultanés. Tests : ré-import articles, fournisseurs, liens et stock, plus un test de concurrence. |
| 2 000 articles en moins de 30 s | OK (non rejoué) | Test d'intégration "performance". L'insertion se fait par `createMany` par blocs de 500. Les mises à jour sont unitaires et séquentielles, ce qui reste acceptable pour 2 000 lignes. |

Règles de la spec :

| Règle | Verdict | Remarque |
|---|---|---|
| 4 modèles Excel avec noms de colonnes Sage | OK | Modèle avec feuille "Aide", colonnes en texte. Alias Sage reconnus : `AR_Ref`, `AR_Design`, `CT_Num`, `CT_Intitule`, `FA_CodeFamille`, "Numéro tiers". Le test relit le modèle tel quel. |
| Étapes fichier, colonnes modifiables, aperçu par ligne, import des valides, rapport | OK | Assistant en 4 étapes. Erreurs en clair par ligne : code manquant, catégorie inconnue, doublon dans le fichier, unité inconnue, nombre invalide. Filtre "Erreurs seulement". Rapport Excel téléchargeable. |
| Créer ou mettre à jour par code | OK | Le message "Sera créé / Sera mis à jour / Déjà à jour" est affiché avant import. |
| Stock initial = AJUSTEMENT_INVENTAIRE daté avec PMP | OK | Passe par `applyMovements`, avec date, PMP obligatoire et date future refusée. Si l'article a déjà d'autres mouvements dans le dépôt, la ligne est refusée avec un message qui renvoie à l'inventaire. Choix prudent et juste. |
| Réservé Responsable et Super-admin, tracé | OK | `import.manage` vérifié dans la page, l'action, la route du modèle et la route du rapport. Test : Acheteur et Magasinier reçoivent FORBIDDEN, 403, et une redirection vers "accès refusé". Le commit est refusé en licence expirée, l'aperçu reste possible. Un `AuditLog` IMPORT_COMMIT contient le fichier, les lignes et les erreurs. |

## Anomalies

### Bloquant
Aucune.

### Important

1. **Catégorie obligatoire, absente de tout export Sage.** Un export d'articles Sage n'a pas de colonne "Catégorie" au sens de l'application (Matière première, Intrant, PDR, Fourniture, Service). Le fichier réel de M. DIBI donnera donc 100 % de lignes en erreur tant qu'il n'a pas ajouté la colonne à la main. Il n'existe aucune "valeur par défaut pour tout le fichier", seulement "ne pas importer".
   Correction proposée : dans l'étape Colonnes, offrir "Même catégorie pour toutes les lignes : [liste]" ou une correspondance Famille Sage vers catégorie.

2. **Codes Sage à espaces, "/" ou accents refusés.** La règle est `^[A-Z0-9][A-Z0-9._-]{0,16}$`. Des références du type "ROUL 6205/2RS" ou "Vis M8 x 30" sont en erreur ligne par ligne. C'est conforme à la règle du projet sur les codes, mais l'impact sur les données réelles n'a pas été évalué dans le lot.
   À faire : demander un extrait réel anonymisé à M. DIBI, ou ajouter dans l'aperçu une proposition de code corrigé (espaces remplacés par "-"). Le code doit rester celui de Sage pour l'échange, donc il faut trancher avant de charger.

3. **Quantité 0 refusée au stock initial.** Un export de stock Sage contient beaucoup d'articles à 0. Chacun est en erreur "doit être strictement positive", ce qui noie les vraies erreurs. Une quantité 0 devrait être ignorée avec un avertissement, et seules les quantités négatives devraient être des erreurs.

4. **Séparateur décimal ambigu sur les quantités.** `parseDecimalString("1.250", 3)` donne 1,25 et non 1250. Pour un export français ou un fichier Excel en texte, une quantité "1.250" peut vouloir dire 1 250. Les prix à 2 décimales sont protégés, car "4,500" est rejeté. Pour les quantités (3 décimales), l'erreur est silencieuse.
   Correction proposée : traiter "x.yyy" comme ambigu et refuser, ou afficher la valeur interprétée en gras dans l'aperçu.

### Mineur

5. Aucun avertissement quand une colonne obligatoire n'est pas associée à l'étape Colonnes. On voit seulement ensuite une avalanche d'erreurs "manquant". Il faudrait surligner le champ obligatoire resté vide et désactiver "Contrôler".
6. Seule la première ligne non vide sert d'en-tête. Les exports Sage ou Excel avec un titre ou un logo au-dessus de l'en-tête seront mal lus. Pas de choix de la ligne d'en-tête. Le message d'erreur sera confus.
7. Seule la première feuille d'un classeur est lue, sans le dire à l'utilisateur.
8. L'ordre à respecter n'est pas indiqué sur l'écran : Articles et Fournisseurs, puis Article-Fournisseur, puis Stock initial. Seuls les messages d'erreur le disent ("importez d'abord les articles"). Un petit "Ordre conseillé" sur l'étape 1 suffirait.
9. Pas d'historique des imports. Le rapport n'est téléchargeable que depuis l'écran de résultat, ou via l'URL du lot (il est lu dans l'audit). Une liste "Derniers imports" sous l'assistant serait utile.
10. Les nombres Excel flottants (par exemple 0,1 + 0,2 stocké en 0.30000000000000004) seraient rejetés pour "trop de décimales". Cas rare.
11. L'unité de stock d'un article existant ne peut pas être changée par import. C'est juste, et le message est clair.
12. Impossible de vider une valeur par mise à jour : une cellule vide ne remplace pas une valeur existante (famille, ville…). C'est volontaire et prudent, mais le noter dans l'aide.

## Réalisme pour la démo de M. DIBI

- Parcours simple : 4 cartes, un modèle téléchargeable, une correspondance de colonnes devinée, un aperçu coloré, une confirmation explicite ("N lignes vont être créées…"). Vocabulaire en français courant, un acheteur s'y retrouve.
- Messages d'erreur lisibles, avec la valeur fautive et la correction attendue ("Catégorie inconnue : « Gadget » (Matière première, Intrant, PDR…)").
- Tablette : cibles tactiles de 44 à 48 px.
- Pour la démo, il faut préparer un export Sage réaliste (avec Famille mais sans Catégorie). Sans la correction du point 1, la démo sur un vrai fichier échouera à la première étape.

## Idées d'amélioration à forte valeur

1. **Catégorie par défaut et correspondance Famille vers Catégorie** dans l'étape Colonnes (point 1 ci-dessus). C'est la condition pour charger un vrai export Sage sans retoucher le fichier.
2. **Bouton "Télécharger les lignes en erreur"** : un fichier avec les colonnes d'origine et une colonne "Motif" en plus. L'acheteur corrige uniquement ces lignes et ré-importe, sans chercher par numéro de ligne.
3. **Assistant d'ordre et historique des imports** : bandeau "1. Articles et Fournisseurs, 2. Liens, 3. Stock" avec une coche sur ce qui est déjà fait (lu dans l'audit), plus la liste des derniers imports avec leur rapport.
