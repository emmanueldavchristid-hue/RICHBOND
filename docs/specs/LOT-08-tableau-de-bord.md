# LOT-08 – Tableau de bord d'accueil par rôle

## Objectif
En arrivant le matin, chacun voit ce qu'il doit faire aujourd'hui, et le Responsable voit la santé de ses achats.

## Responsable Achats (cockpit)
- Cartes « à traiter » : DA à valider, BC à valider, BC en retard, articles critiques en risque de rupture, non-conformités ouvertes.
- KPI du mois (vs mois précédent) : montant commandé (FCFA), nombre de BC, délai moyen DA → BC (jours), délai moyen BC → réception,
  taux de livraison à temps, valeur du stock, nombre de ruptures.
- Graphiques : achats par mois (12 mois, local vs import), top 10 fournisseurs en montant, valeur de stock par catégorie.
- Liste « Risques de rupture » : articles A ou critiques dont la date de rupture prévue < prochaine livraison.

## Acheteur
- Mes DA assignées à traiter, mes BC à envoyer, mes BC en retard à relancer (bouton relancer direct), dossiers import en cours (LOT-12).

## Magasinier
- Réceptions attendues aujourd'hui et cette semaine, articles sous le seuil, inventaire de la semaine à faire (LOT-11), dernières sorties.

## Règles
- Chaque carte est cliquable vers la liste filtrée correspondante.
- Calculs dans `src/modules/reporting/`, testés, en requêtes agrégées (pas de chargement de toutes les lignes).
- Chargement < 2 s avec le seed.

## Critères d'acceptation
- [ ] Trois tableaux de bord différents selon le rôle.
- [ ] Tests unitaires des calculs de KPI sur un jeu de données connu.
- [ ] Seed suffisant (6 mois d'historique fictif) pour que la démo soit parlante.
- [ ] **Jalon DÉMO 1** : écrire `docs/demo-1.md` (script de démonstration de 15 min : connexion de chaque rôle, DA urgente → validation → BC → réception → stock → tableau de bord).
