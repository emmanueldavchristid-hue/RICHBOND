# Indicateurs (KPI) et rapports – définitions (LOT-15, EX-61 à EX-63)

Source unique des définitions : `src/modules/reporting/report-defs.ts` (infobulles « i » à l'écran). Toute modification se fait aux deux endroits.
Toutes les périodes sont en jours d'**Africa/Abidjan**. Montants en FCFA entiers (HT), quantités au PMP.
Un indicateur sans donnée s'affiche « – » (jamais 0 factice). Un indicateur dont le module n'existe pas encore s'affiche **« Non disponible »** avec la raison.

## Les trois rapports

| Rapport | Période | Contenu |
|---|---|---|
| Quotidien | un jour | DA créées / validées, BC émis (liste), réceptions (liste), entrées et sorties de stock par type, BC en retard, ruptures |
| Hebdomadaire | lundi au dimanche | synthèse comparée à la semaine précédente, BC en retard, inventaires validés et fiabilité, top 10 des consommations, réceptions |
| Mensuel | mois calendaire | montant acheté (local / import, par catégorie, par fournisseur), délais, OTIF, taux de service, ruptures, valeur et rotation du stock, couverture, dormants, coût moyen d'approche import, conformité des factures, fiabilité d'inventaire, gains achats, évaluation fournisseurs |

Chaque rapport : écran, export PDF (A4 paysage, en-tête RICHBOND, période, filtres) et Excel (une feuille « Informations », « Indicateurs » avec la définition de chaque KPI, puis une feuille par tableau).
Filtres : période, catégorie d'article, acheteur, fournisseur, dépôt. Le tableau « Période / filtres » est repris dans l'export.

## Définitions

| KPI | Définition | Sens favorable |
|---|---|---|
| DA créées | DA dont la date de création est dans la période (brouillons compris) | neutre |
| DA validées | DA dont la date de validation est dans la période | neutre |
| BC émis | BC validés dans la période, hors refusés et annulés | neutre |
| Montant acheté | Σ total HT FCFA des BC validés dans la période (taux figé du BC pour l'import) | neutre |
| Part des achats locaux | montant des BC locaux / montant total des BC validés | neutre |
| Délai de traitement des DA | moyenne, en jours calendaires, de (validation de la DA - soumission) pour les DA validées dans la période | baisse |
| Délai DA → BC | moyenne de (validation du BC - validation de la DA) pour les BC validés dans la période, un couple (BC, DA) compté une fois | baisse |
| Délai BC → réception | moyenne de (1re réception validée - validation du BC), pour les BC dont la 1re réception tombe dans la période | baisse |
| Livraisons à temps | réceptions de la période avec `daysLate <= 0` / réceptions de la période (hors annulées) | hausse |
| OTIF (On Time In Full) | parmi les BC dont la date promise initiale (à défaut la date demandée) tombe dans la période **et est déjà échue** : part de ceux qui ont une réception **soldant le BC** (`inFull`) **sans retard**. Un BC échu jamais soldé compte comme manqué | hausse |
| Taux de service magasin | lignes de sortie de la période laissant un stock > 0 / lignes de sortie de la période. Approximation (hypothèse H59) | hausse |
| Ruptures | articles stockés distincts dont une sortie de la période a laissé le stock à 0 | baisse |
| Valeur du stock | Σ quantité × PMP, à la fin de la période (valeur actuelle - mouvements postérieurs) | neutre |
| Rotation du stock | consommation (sorties de type SORTIE au PMP, nettes des annulations) / stock moyen, annualisée : × 365 / jours (tours par an) | hausse |
| Couverture moyenne | stock moyen / (consommation / jours) en jours | neutre |
| Valeur des dormants | Σ quantité × PMP des articles en stock sans aucun mouvement depuis `stock.dormantDays` (180 j par défaut) ; situation à la date de génération | baisse |
| Gains achats | économies de mise en concurrence (LOT-10) | hausse |
| Conformité des factures | factures rapprochées (`matchedAt`, date de facture dans la période, hors annulées) dont **toutes** les lignes sont `CONFORME` / factures rapprochées | hausse |
| Fiabilité d'inventaire | moyenne des fiabilités des inventaires validés dans la période (part d'articles comptés sans écart) | hausse |
| Coût d'approche import | moyenne des coefficients d'approche (coût dédouané / marchandise) des dossiers import clôturés dans la période ; le tableau liste aussi les frais intégrés au coût (hors TVA récupérable) | baisse |
| Évaluation fournisseurs | note fournisseurs (LOT-14) | – |

**Stock moyen** = moyenne de la valeur en début et en fin de période. Pour un mois en cours, les taux annualisés utilisent les jours écoulés.
**Variations** : comparaison avec la période précédente (jour, semaine ou mois précédent). La couleur dépend du sens favorable (une hausse des retards est mauvaise, une hausse des achats est neutre).

## Droits et périmètre

- Responsable Achats (et Super-admin en lecture) : les trois rapports, tous périmètres.
- Acheteur : rapports limités à son périmètre. Local : seuls les BC locaux sont comptés, « part des achats locaux » et « coût d'approche import » sont indiqués non disponibles. Import : seuls les BC import. « Les deux » : tout.
- Magasinier : aucun rapport achats.
- Les rapports sont des lectures : disponibles quand l'essai est expiré. Chaque export est tracé dans le journal d'activité.

## Limites connues

- Les filtres Acheteur et Fournisseur ne portent pas sur les mouvements de stock ; Dépôt et Catégorie portent sur les achats, les mouvements et la valeur du stock.
- La valeur des dormants et les BC en retard décrivent la situation à la date de génération, même pour une période passée.
