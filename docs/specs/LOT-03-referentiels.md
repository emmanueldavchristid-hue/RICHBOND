# LOT-03 – Référentiels

## Objectif
Des fiches articles et fournisseurs fiables : c'est la base de tout le reste (prix, délais, seuils, évaluation).

## Articles
- Champs : code (= code Sage si existant), désignation, catégorie (Matière première, Intrant, PDR, Fourniture, Service),
  famille, unité de stock, unité d'achat + coefficient de conversion, article stocké (non pour les services),
  criticité (Critique / Important / Standard – une PDR critique arrête une ligne de production), dépôt par défaut,
  stock de sécurité, point de commande, quantité économique de commande, délai de réapprovisionnement (jours),
  fournisseur principal, code-barres (facultatif), statut (actif / bloqué / obsolète), photo (facultative).
- Onglet « Fournisseurs » : plusieurs fournisseurs par article avec référence fournisseur, dernier prix, devise, délai annoncé, minimum de commande.
- Onglet « Stock » (lecture, alimenté par LOT-07) et « Historique des prix ».
- Pour les PDR : champ « Équipement / machine concernée » (texte) pour retrouver les pièces d'une machine.

## Fournisseurs
- Champs : code (= code Sage), raison sociale, type Local / Import, pays, ville, devise par défaut, NCC (n° compte contribuable),
  RCCM, contacts (nom, fonction, téléphone, email – plusieurs), conditions de paiement (comptant, 30 j, 60 j…),
  incoterm habituel (import), délai moyen annoncé, catégories fournies, statut (actif / en évaluation / bloqué avec motif), notes.
- Indicateurs affichés sur la fiche (alimentés plus tard) : nombre de BC, montant acheté sur 12 mois, taux de service, note.
- Un fournisseur bloqué ne peut plus recevoir de BC (règle vérifiée au LOT-05).

## Autres paramètres
- Dépôts (seed : MAGASIN CENTRAL, MAGASIN PDR), services demandeurs (Production, Maintenance, Qualité, Logistique, Administration, Direction),
  devises (XOF, EUR, USD, CNY) avec taux de change datés (saisie manuelle).

## Critères d'acceptation
- [ ] Listes avec recherche, filtres (catégorie, type, statut, criticité), tri, pagination, export Excel.
- [ ] Unicité des codes, validation Zod, messages en français.
- [ ] Conversion unité d'achat → unité de stock testée.
- [ ] Seed : ~40 articles réalistes (MP pour matelas/mousse : polyol, TDI, tissu matelassé, fil ; intrants ; PDR : roulements, courroies, moteurs ;
      fournitures ; services) et ~25 fournisseurs (locaux et import : Chine, Europe, Inde), noms fictifs.
- [ ] Droits : magasinier en lecture, acheteurs et responsable en écriture.
