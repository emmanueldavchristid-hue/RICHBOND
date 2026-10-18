# LOT-12 – Achats import, frais d'approche, coût d'arrivée dédouané

## Objectif
Suivre chaque commande import (notamment les PDR) du proforma jusqu'au magasin, et connaître le **vrai coût** d'un article importé.

## Dossier import
- Numéro `IMP-AAAA-0001`, rattaché à un ou plusieurs BC import du même fournisseur / même expédition.
- Champs : fournisseur, incoterm (EXW, FOB, CFR, CIF, DAP…), mode (maritime, aérien, routier), port / aéroport d'embarquement, transitaire,
  n° connaissement (BL) / LTA, n° conteneur, n° déclaration en douane, régime.
- **Jalons** avec date prévue et date réelle : proforma reçue → paiement / ouverture de crédit documentaire → marchandise prête → embarquement (ETD) →
  arrivée prévue (ETA) → arrivée port → documents reçus → dédouanement → enlèvement → réception magasin.
- Vue chronologique (frise) et liste des dossiers par jalon courant ; retard d'un jalon = alerte.
- Documents attachés (facture commerciale, packing list, BL, certificat d'origine, déclaration).

## Frais d'approche
- Lignes de frais : type (fret, assurance, droits de douane, redevances et prélèvements douaniers, frais de transitaire, manutention / acconage,
  magasinage port, transport jusqu'à l'usine, frais bancaires, autres), montant, devise, taux, fournisseur du frais, TVA récupérable ou non.
  Les types sont paramétrables.
- Statut d'un frais : estimé → réel. Le coût estimé est calculé dès la création du dossier (coefficients par défaut par mode de transport, paramétrables),
  puis remplacé par les montants réels.
- **Répartition** sur les lignes de marchandises par clé choisie par frais : valeur (défaut), poids, volume, quantité.
- Coût d'arrivée dédouané unitaire = (valeur marchandise en FCFA + frais répartis non récupérables) / quantité.
- **Coefficient d'approche** = coût dédouané / prix d'achat en FCFA ; historisé par fournisseur et origine pour mieux estimer les prochains achats (et alimenter le coût complet du LOT-10).
- À la clôture du dossier : réajustement du coût des réceptions concernées et du PMP (via LOT-07), tracé.

## Critères d'acceptation
- [ ] Tests : répartition selon chaque clé, arrondis (la somme répartie = total exact), conversion devises, coefficient d'approche, réajustement du PMP.
- [ ] Fiche de calcul du coût de revient import exportable en PDF/Excel.
- [ ] Les acheteurs au périmètre LOCAL ne voient pas le menu Import (sauf périmètre ALL).
- [ ] Scénario S6 (docs/05) passe.
