# LOT-05 – Bons de commande (BC), PDF, suivi des délais et relances

## Objectif
Des BC numérotés sans doublon, validés, envoyés et suivis jusqu'à la livraison, avec relance des retards.

## Règles
- Création depuis une ou plusieurs lignes de DA validées (regroupement par fournisseur) ou depuis une offre retenue (LOT-10) ; BC direct possible pour le Responsable (motif obligatoire).
- Champs : fournisseur (actif obligatoire), devise, taux de change figé, conditions de paiement, incoterm et lieu (import),
  adresse de livraison (dépôt), date de livraison demandée, lignes (article, quantité en unité d'achat, prix unitaire, remise %, TVA), frais (transport…), observations.
- Numéro `BC-AAAA-00001` attribué **à la validation** uniquement, en transaction (résout la désynchronisation actuelle).
- Statuts : BROUILLON → À VALIDER → VALIDÉ → ENVOYÉ → CONFIRMÉ (date promise saisie) → PARTIELLEMENT REÇU → REÇU → CLÔTURÉ ; REFUSÉ ; ANNULÉ (motif, seulement si rien n'est reçu).
- Contrôles à la création : prix > 20 % au-dessus du dernier prix d'achat → avertissement visible du validateur ; fournisseur sans évaluation récente → information.
- Avenant : modification d'un BC validé = nouvelle version (BC-2026-00042 v2), historique conservé, revalidation.
- Suivi : date promise par le fournisseur ; BC en retard = date promise (ou demandée) dépassée et pas totalement reçu.
- Relance : bouton « Relancer » qui enregistre la relance (date, moyen, commentaire) et prépare un texte d'email/WhatsApp copiable.
- Quantités suivies par ligne : commandée, reçue, restant à recevoir.

## PDF
Format professionnel A4 : en-tête RICHBOND CI (logo réglable dans paramètres), numéro, date, fournisseur, lignes, totaux HT/TVA/TTC
(ou total devise pour l'import), conditions, adresse de livraison, zone signature « Responsable Achats », mentions de pied de page réglables.

## Écrans
`/achats/commandes` (onglets : à valider, en cours, en retard, reçus, tous), fiche BC avec chronologie, création depuis DA.

## Critères d'acceptation
- [ ] Numérotation unique testée en concurrence ; aucun numéro consommé par un brouillon.
- [ ] Impossible de commander à un fournisseur bloqué.
- [ ] Calcul des totaux (remise, TVA 18 %, arrondis FCFA) testé.
- [ ] PDF généré et lisible (test : le fichier contient le numéro et le total).
- [ ] Liste « en retard » correcte selon dates simulées.
- [ ] Scénario S1 étendu jusqu'à l'envoi du BC passe.
