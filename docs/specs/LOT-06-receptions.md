# LOT-06 – Réceptions, contrôle, non-conformités, retours

## Objectif
Le magasinier enregistre ce qui arrive réellement, contre le BC, et le stock se met à jour sans ressaisie.

## Règles
- Réception créée par le Magasinier à partir d'un BC ENVOYÉ / CONFIRMÉ / PARTIELLEMENT REÇU (recherche par n° BC ou fournisseur).
- Saisie : n° du bon de livraison fournisseur, date, dépôt, transporteur, pour chaque ligne : quantité livrée, quantité acceptée,
  quantité refusée + motif (Abîmé, Non conforme, Erreur de référence, Hors délai…), n° de lot facultatif, photo facultative.
- Tolérance de sur-livraison réglable (défaut 0 %) : au-delà, réception bloquée sauf accord du Responsable.
- Numéro `REC-AAAA-00001`. Validation de la réception = création des `StockMovement` (ENTREE_RECEPTION) des quantités acceptées,
  au coût unitaire du BC converti en FCFA (le coût définitif import est réajusté au LOT-12).
- Le BC passe automatiquement PARTIELLEMENT REÇU ou REÇU. Possibilité de solder un reliquat (motif).
- Refus : création d'une **non-conformité** (fournisseur, BC, article, quantité, motif, décision : retour / avoir / remplacement) qui alimente l'évaluation fournisseur.
- Retour fournisseur : bon de retour qui génère une sortie de stock RETOUR_FOURNISSEUR si la marchandise était entrée.
- Réception au plus tard la date du jour ; une réception validée ne se modifie pas : annulation par contre-passation (Responsable seulement).
- Pour chaque réception, la ponctualité (date réception vs date promise) et la complétude sont mémorisées (calcul OTIF au LOT-14).

## Écrans
`/stock/receptions` : « Attendus aujourd'hui / cette semaine » (BC dont la date tombe), « En retard », « Réceptions récentes ».
Écran de saisie adapté tablette : gros champs, quantités pré-remplies avec le restant dû, bouton « Tout accepter ».

## Critères d'acceptation
- [ ] Tests : réception partielle puis complète ; sur-livraison refusée ; refus partiel ; contre-passation.
- [ ] Le stock et le statut du BC sont cohérents après chaque cas (tests).
- [ ] Le magasinier ne voit pas les prix sur l'écran de réception (sauf paramètre contraire).
- [ ] Scénarios S1 et S2 (docs/05) passent.
