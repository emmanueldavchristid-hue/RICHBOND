# LOT-15 – KPI avancés et rapports

## Objectif
Les rapports que le Responsable Achats présente à sa direction, générés en un clic.

## Rapports
- **Quotidien** : DA créées / validées, BC émis, réceptions, entrées et sorties de stock du jour, retards, ruptures.
- **Hebdomadaire** : synthèse de la semaine, BC en retard, inventaire de la semaine et fiabilité, top consommations.
- **Mensuel** : montant acheté (local / import, par catégorie, par fournisseur), délais, OTIF, gains achats (LOT-10), valeur et rotation du stock,
  articles dormants, couverture moyenne, ruptures, coût moyen d'approche import, évaluation fournisseurs.
- Chaque rapport : écran, export **PDF** (mise en page propre, en-tête RICHBOND, période) et **Excel** (données brutes).
- Filtres : période, catégorie, acheteur, fournisseur, dépôt.

## KPI (définitions écrites dans `docs/kpi.md` et affichées en infobulle)
Délai de traitement DA, délai BC → réception, OTIF, taux de service magasin (sorties servies sans attente), nombre de ruptures,
rotation du stock, couverture moyenne, valeur des dormants, gains achats, part des achats locaux, taux de conformité des factures, fiabilité d'inventaire.

## Critères d'acceptation
- [ ] Tests des calculs de KPI sur jeu de données connu.
- [ ] Les 3 rapports génèrent un PDF et un Excel sans erreur.
- [ ] Rapport quotidien < 3 s.
