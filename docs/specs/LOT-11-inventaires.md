# LOT-11 – Inventaires hebdomadaires (mode tablette)

## Objectif
Des inventaires réguliers, rapides à faire au magasin, qui fiabilisent le stock sans arrêter l'activité.

## Règles
- Inventaire tournant (hypothèse H6) : l'application propose chaque semaine une liste (articles A chaque mois, B chaque trimestre, C chaque semestre,
  + articles avec écart récent ou mouvement anormal). Le Responsable peut ajouter / retirer des articles ou lancer un inventaire complet d'un dépôt.
- Numéro `INV-AAAA-0001`. Statuts : PRÉPARÉ → EN COMPTAGE → À VALIDER → VALIDÉ ; ANNULÉ.
- **Comptage aveugle** : le magasinier ne voit pas la quantité théorique pendant le comptage (meilleure fiabilité).
- Le théorique est figé à l'ouverture du comptage ; les mouvements pendant le comptage sont signalés.
- Écarts : quantité et valeur (au PMP). Écart > seuil (défaut 5 % ou 100 000 FCFA) → recomptage demandé avant validation.
- Validation par le Responsable : ajustements AJUSTEMENT_INVENTAIRE créés, motif par écart important.
- Indicateur de fiabilité du stock = % d'articles sans écart.

## Écran tablette
Liste par emplacement, saisie au pavé numérique large, recherche par code ou scan code-barres (caméra, facultatif via BarcodeDetector si disponible), sauvegarde automatique.

## Critères d'acceptation
- [ ] Tests : sélection tournante, figement du théorique, calcul des écarts, ajustements créés à la validation uniquement.
- [ ] La quantité théorique n'est jamais envoyée au navigateur du magasinier en mode aveugle.
- [ ] Scénario S5 (docs/05) passe sur un viewport tablette.
