# LOT-13 – Factures fournisseurs et rapprochement

## Objectif
Ne payer que ce qui a été commandé et reçu, au bon prix : le rapprochement **BC / réception / facture** (« 3 voies »).

## Règles
- Saisie d'une facture fournisseur : n° facture, date, fournisseur, BC concernés, lignes (article, quantité facturée, prix), montants HT / TVA / TTC, échéance (calculée depuis les conditions de paiement), pièce jointe.
- Pré-remplissage depuis les réceptions non encore facturées.
- Rapprochement automatique par ligne : quantité facturée vs reçue acceptée, prix facturé vs prix du BC. Tolérances paramétrables (défaut prix ± 1 %, quantité 0).
- Statuts : SAISIE → CONFORME | ÉCART (détail par ligne) → BON À PAYER (Responsable) → TRANSMISE COMPTABILITÉ ; LITIGE.
- Facture en double (même fournisseur + même n°) refusée.
- Échéancier : factures à payer cette semaine / ce mois, retards (information pour la trésorerie, l'application ne gère pas les paiements).
- Quantités facturées suivies sur les lignes de BC → un BC est CLÔTURÉ quand reçu et facturé totalement.

## Critères d'acceptation
- [ ] Tests du rapprochement (conforme, écart prix, écart quantité, facturation partielle, double facture).
- [ ] Liste des écarts exportable pour discussion fournisseur.
- [ ] Scénario S2 étendu jusqu'à la facture passe.
