# LOT-04 – Demandes d'achat (DA) et workflow de validation

## Objectif
Plus aucun achat sans demande tracée et validée. Le Responsable Achats voit en un coup d'œil ce qui attend sa décision.

## Règles
- Création par Responsable, Acheteurs ou Magasinier (DA de réapprovisionnement). Champs : service demandeur, demandeur (texte libre :
  la personne du service), motif, urgence (Normale / Urgente / Arrêt de production), date de besoin, type (Local / Import / À définir),
  lignes (article ou désignation libre pour un article nouveau, quantité, unité, prix estimé facultatif), pièces jointes.
- Numéro `DA-AAAA-00001` attribué à la soumission (le brouillon a un numéro provisoire).
- Statuts : BROUILLON → SOUMISE → VALIDÉE | REFUSÉE | À COMPLÉTER (retour au créateur avec commentaire) ; VALIDÉE → EN CONSULTATION → COMMANDÉE (partiellement / totalement) ; ANNULÉE.
- Validation par le Responsable Achats (hypothèse H1). Possibilité de modifier les quantités à la validation (tracé).
  Le paramètre « seuil de validation » est prévu pour plus tard (validation direction au-delà d'un montant).
- Une DA « Arrêt de production » remonte en tête de toutes les listes et déclenche une notification immédiate.
- À la validation, l'acheteur du bon périmètre (local/import) est notifié ; la DA est assignée à un acheteur (assignation modifiable).
- Contrôle intelligent à la saisie : si l'article a déjà une DA ou un BC en cours, afficher un avertissement
  « Déjà commandé : BC-2026-00042, 50 unités attendues le 12/11 » (évite les doublons, erreur fréquente en achats).
- Affichage du stock actuel et de la couverture en jours à côté de chaque ligne.

## Écrans
- `/achats/demandes` : onglets « À valider » (responsable), « Mes demandes », « Toutes » ; filtres statut, urgence, service, acheteur.
- Formulaire de DA (ajout rapide de lignes, recherche article au clavier).
- Fiche DA : en-tête, lignes, chronologie des validations et commentaires, boutons d'action selon rôle et statut.
- Validation groupée : le responsable coche plusieurs DA et valide en une fois.

## Critères d'acceptation
- [ ] Tests unitaires de toutes les transitions de statut (autorisées et interdites, par rôle).
- [ ] Le magasinier ne peut pas valider ; un acheteur ne peut pas valider sa propre DA.
- [ ] Avertissement de doublon testé.
- [ ] Toutes les décisions sont dans la chronologie et le journal d'audit.
- [ ] Scénario workflow S1 (docs/05) passe.
