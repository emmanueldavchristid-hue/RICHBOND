# LOT-14 – Évaluation et panel fournisseurs

## Objectif
Une évaluation objective des ~150 fournisseurs, calculée automatiquement à partir des faits, complétée par le jugement de l'équipe.

## Note automatique (sur la période choisie, défaut 12 mois glissants)
- **OTIF** (On Time In Full) : % de lignes de BC livrées complètes et à la date promise (tolérance ± 2 jours réglable). Poids 35 %.
- **Qualité** : 100 % − (quantité refusée / quantité livrée), et nombre de non-conformités. Poids 25 %.
- **Prix** : évolution vs prix de référence et compétitivité dans les consultations (LOT-10). Poids 20 %.
- **Conformité administrative et facturation** : % de factures conformes (LOT-13). Poids 10 %.
- **Note manuelle** trimestrielle du Responsable (réactivité, service, communication), 1 à 5. Poids 10 %.
- Note finale /100 → classe A (≥ 80, fournisseur stratégique), B (60-79), C (40-59, plan de progrès), D (< 40, à remplacer).
  Poids et seuils paramétrables.

## Panel et diversification
- Fiche fournisseur : radar des critères, évolution trimestrielle, historique des incidents.
- Carte du panel par catégorie d'achat : nombre de fournisseurs actifs, part du premier fournisseur (dépendance), part local / import.
- Alerte **dépendance** : catégorie avec un seul fournisseur actif ou un fournisseur > 70 % du montant → suggestion de rechercher une source locale.
- Liste « fournisseurs à développer » (locaux en évaluation) et suivi des nouveaux fournisseurs testés.
- Export de la fiche d'évaluation en PDF (à partager avec le fournisseur).

## Critères d'acceptation
- [ ] Tests de chaque critère et de la note finale sur un jeu de données connu.
- [ ] Recalcul à la demande et automatique chaque nuit.
- [ ] Alerte de dépendance testée.
