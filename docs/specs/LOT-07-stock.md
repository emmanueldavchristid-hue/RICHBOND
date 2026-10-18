# LOT-07 – Stock : mouvements, sorties, PMP, seuils, prévision de rupture, réapprovisionnement

## Objectif
Savoir à tout moment ce qu'on a, ce que ça vaut, ce qu'on consomme, et **quand on va manquer**, avant que ça arrive.

## Mouvements et sorties
- Bon de sortie (`SOR-AAAA-00001`) par le Magasinier : service demandeur, demandeur, motif, machine (PDR), lignes. Sortie refusée si stock insuffisant.
- Transfert entre dépôts. Ajustements réservés au Responsable (et aux inventaires, LOT-11).
- Journal des mouvements filtrable par article, dépôt, type, période ; fiche de stock d'un article (entrées, sorties, solde progressif).

## PMP (CMUP)
- Recalcul à chaque entrée : `PMP = (stock × PMP + qté entrée × coût entrée) / (stock + qté entrée)`. Sorties valorisées au PMP du moment.
- Si le stock est nul ou négatif avant l'entrée : PMP = coût de l'entrée.
- Réajustement du coût d'une réception import (LOT-12) : correction du PMP sur la quantité encore en stock, tracée.
- Tests unitaires exhaustifs du PMP (cas nominal, stock nul, réajustement, arrondis).

## Seuils et prévision (valeur ajoutée supply chain)
- Consommation moyenne journalière = sorties des 90 derniers jours / 90 (paramétrable).
- **Couverture** = stock disponible / consommation moyenne (en jours). Stock disponible + en commande = position de stock.
- **Date de rupture prévue** = aujourd'hui + couverture. Alerte si la date de rupture arrive avant la prochaine livraison attendue.
- Point de commande suggéré = consommation moyenne × délai de réappro + stock de sécurité ;
  stock de sécurité suggéré = consommation moyenne × délai × coefficient selon criticité (Critique 1,0 ; Important 0,5 ; Standard 0,25).
  Les valeurs suggérées sont proposées, le Responsable les accepte ou garde ses valeurs.
- **Classification ABC** (valeur consommée sur 12 mois : A = 80 %, B = 15 %, C = 5 %), recalculée chaque mois.
- Articles dormants : sans mouvement depuis 180 jours (immobilisation de trésorerie).

## Réapprovisionnement
- `/stock/reappro` : liste des articles sous le point de commande (position de stock incluant les commandes en cours),
  quantité suggérée (max(quantité économique, point de commande + consommation pendant le délai − position)) arrondie au minimum de commande du fournisseur principal.
- Le Magasinier ou un Acheteur coche et clique « Créer les DA » : une DA par type (local/import), statut SOUMISE.

## Écrans
`/stock/articles` (stock, PMP, valeur, couverture en jours avec code couleur, date de rupture prévue), `/stock/mouvements`, `/stock/sorties`, `/stock/reappro`.

## Critères d'acceptation
- [ ] Tests PMP, couverture, date de rupture, point de commande, ABC.
- [ ] Sortie impossible au-delà du stock ; tout passe par StockMovement (test qui vérifie qu'aucun autre code ne modifie StockLevel).
- [ ] Génération de DA depuis la liste de réappro testée.
- [ ] Scénario S3 (docs/05) passe.
