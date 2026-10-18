# LOT-09 – Import Excel/CSV des données initiales

## Objectif
Charger les vraies données du client (articles, fournisseurs, stocks de départ) sans ressaisie, avec contrôle avant import.

## Règles
- Modèles Excel téléchargeables (`/parametres/import`) : Articles, Fournisseurs, Article-Fournisseur, Stock initial.
  Les colonnes reprennent les noms usuels des exports Sage (Référence, Désignation, Famille, Unité, Code fournisseur, Intitulé…) pour faciliter le copier-coller.
- Étapes : téléversement → détection des colonnes (correspondance modifiable) → **aperçu** avec erreurs par ligne (code manquant, catégorie inconnue, doublon, nombre invalide) → import des lignes valides seulement → rapport téléchargeable.
- Mode « créer ou mettre à jour » par code. Import du stock initial = mouvements AJUSTEMENT_INVENTAIRE datés, avec PMP initial.
- Réservé au Responsable et au Super-admin. Chaque import est tracé (fichier, lignes, erreurs).

## Critères d'acceptation
- [ ] Tests avec fichiers d'exemple dans `tests/fixtures/import/` (valide, avec erreurs, colonnes dans le désordre).
- [ ] Ré-importer le même fichier ne crée pas de doublon.
- [ ] Import de 2 000 articles < 30 s.
