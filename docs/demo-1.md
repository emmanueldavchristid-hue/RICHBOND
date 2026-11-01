# Démonstration 1 – Déroulé pour M. DIBI (≈ 20 minutes)

Application Achats & Stocks RICHBOND CI, version d'essai. Toutes les données sont **fictives** (jeu de démonstration).

## Avant de commencer

- Comptes fictifs du jeu de démonstration, tous avec le mot de passe défini dans `SEED_DEFAULT_PASSWORD` (voir `.env`, à ne pas afficher à l'écran) :
  - `responsable@richbond.test` : Responsable Achats (M. DIBI)
  - `acheteur.local@richbond.test` : Acheteur local
  - `acheteur.import@richbond.test` : Acheteur import
  - `magasinier@richbond.test` : Magasinier
  - `admin@richbond.test` : Super admin (technique, hors démonstration)
- Prévoir deux fenêtres de navigateur (ou une fenêtre privée) pour passer d'un rôle à l'autre sans se déconnecter à chaque fois.
- Ordinateur en 1366×768 pour le Responsable et l'Acheteur ; tablette (ou fenêtre étroite) pour le Magasinier.
- Captures de référence : `docs/captures/ecrans-cles/1366x768/` et `docs/captures/ecrans-cles/1024x768/` (tablette).
- Le guide complet de chaque rôle est dans `docs/guide-utilisateur.md`.

## Déroulé

| # | Durée | Étape | Compte |
|---|---|---|---|
| 0 | 1 min | Connexion et compte à rebours d'essai | Responsable |
| 1 | 3 min | Demande d'achat (DA) puis validation | Magasinier, puis Responsable |
| 2 | 2 min | Bon de commande (BC) et PDF | Acheteur local |
| 3 | 2 min | Réception de la marchandise | Magasinier (tablette) |
| 4 | 2 min | Stock et PMP | Responsable |
| 5 | 3 min | Facture et rapprochement | Acheteur local, puis Responsable |
| 6 | 3 min | Dossier import, frais d'approche, coût dédouané | Acheteur import |
| 7 | 1 min | Tableau de bord | Responsable |
| 8 | 2 min | Rapports | Responsable |
| 9 | 1 min | Alertes et notifications | Responsable |

### 0. Connexion et compte à rebours d'essai (1 min)
- **Compte** : Responsable.
- **Écran** : `/connexion`, puis la fenêtre « Version d'essai » et le badge du nombre de jours restants.
- **On montre** : la connexion, la fenêtre de compte à rebours (date de fin d'essai), le badge. Après l'échéance, l'application passe en consultation seule : on peut se connecter, consulter, télécharger les PDF et exporter ; rien n'est supprimé.
- **Bénéfice** : aucune surprise à la fin de l'essai, les données restent accessibles.

### 1. Demande d'achat puis validation (3 min)
- **Comptes** : Magasinier (création), puis Responsable (validation).
- **Écrans** : `Achats > Demandes d'achat > Nouvelle demande`, onglet « À valider », fiche de la DA.
- **On montre** : le magasinier crée une DA de réapprovisionnement (article, quantité, priorité) et l'envoie. Le Responsable la voit dans « À valider » et sur son accueil, la valide (confirmation avant action irréversible) ou la refuse avec motif. Le numéro `DA-AAAA-NNNNN` est attribué et l'historique est tracé.
- **Bénéfice** : plus de demandes orales ou papier perdues ; circuit de validation tracé.

### 2. Bon de commande et PDF (2 min)
- **Compte** : Acheteur local (puis Responsable pour la validation du BC).
- **Écrans** : `Achats > Commandes > À commander`, création du BC, fiche du BC.
- **On montre** : la DA validée apparaît dans « À commander » ; l'acheteur crée le BC (fournisseur, prix, alerte d'écart par rapport au dernier prix). Le Responsable valide ; le numéro `BC-AAAA-NNNNN` est attribué et le PDF généré (aperçu filigrané « NON VALIDÉ » avant validation). Marquer comme envoyé, puis confirmer avec la date promise.
- **Bénéfice** : un BC professionnel en quelques clics, avec contrôle des prix avant engagement.

### 3. Réception de la marchandise (2 min)
- **Compte** : Magasinier, sur tablette.
- **Écran** : `Stock > Réceptions > Nouvelle réception`.
- **On montre** : gros boutons, saisie numérique, peu de champs. Le magasinier choisit le BC attendu, saisit les quantités reçues (réception partielle possible) et signale une non-conformité si besoin. Confirmation avant validation.
- **Bénéfice** : écart commandé/reçu connu dès l'arrivée du camion, non-conformités documentées pour le fournisseur.

### 4. Stock et PMP (2 min)
- **Compte** : Responsable.
- **Écrans** : `Stock` (vue d'ensemble), fiche article, mouvements.
- **On montre** : la quantité en stock a augmenté du seul fait de la réception (le stock ne change que par des mouvements tracés), le PMP (prix moyen pondéré) recalculé, la valeur du stock, les articles sous le seuil. Le magasinier voit le stock mais pas les prix d'achat (réglable).
- **Bénéfice** : stock fiable et valorisé automatiquement, historique complet par article.

### 5. Facture et rapprochement (3 min)
- **Comptes** : Acheteur local (saisie), puis Responsable (bon à payer).
- **Écrans** : `Achats > Factures`, fiche facture, section « Rapprochement par ligne ».
- **On montre** : la facture est comparée ligne à ligne au BC et à la réception. CONFORME : bon à payer direct. ÉCART (prix ou quantité hors tolérance) : le bon à payer exige un motif de dérogation tracé. Export des écarts et échéancier.
- **Bénéfice** : on ne paie que ce qui a été commandé et reçu.

### 6. Dossier import, frais d'approche, coût dédouané (3 min)
- **Compte** : Acheteur import.
- **Écrans** : `Import`, fiche d'un dossier, onglets « Synthèse », « Jalons », « Frais d'approche », « Coût de revient ».
- **On montre** : un dossier import lié à un BC en devise (montant, devise, taux figé à la date), ses jalons, les frais d'approche (transport, transit, douane) répartis sur les articles, jusqu'au **coût dédouané** et au coefficient d'approche. Clôture avec confirmation.
- **Bénéfice** : le vrai coût d'arrivée de chaque article importé, donc de bons prix de vente et de bonnes décisions d'achat.

### 7. Tableau de bord (1 min)
- **Compte** : Responsable (puis un coup d'œil sur l'accueil de l'Acheteur et du Magasinier).
- **Écran** : `Accueil`.
- **On montre** : cartes « à traiter » (cliquables, déjà filtrées), indicateurs du mois avec infobulle d'aide, graphiques, risques de rupture. Chaque rôle voit un accueil adapté.
- **Bénéfice** : savoir en 10 secondes ce qui demande une décision.

### 8. Rapports (2 min)
- **Compte** : Responsable.
- **Écrans** : `Rapports` : quotidien, hebdomadaire, mensuel.
- **On montre** : filtres de période, indicateurs, tableaux, export PDF et Excel.
- **Bénéfice** : rapports prêts pour les réunions et la direction, sans ressaisie.

### 9. Alertes et notifications (1 min)
- **Compte** : Responsable.
- **Écran** : cloche de notification, page `Notifications`, bandeau rouge des alertes critiques.
- **On montre** : BC en retard, ruptures, non-conformités, échéances ; alertes calculées à 8 h et 15 h (tâche planifiée, voir B2 ci-dessous).
- **Bénéfice** : l'application prévient avant que le problème ne se voie en atelier.

## Ce qui n'est pas dans cette version

| Élément | Raison |
|---|---|
| Intégration Sage 100 (LOT-17) | Reste à faire : elle dépend d'éléments client (extrait réel de codes articles et fournisseurs, accès à Sage i7). En attendant, codes saisis ou importés par fichier. Sage reste maître de la comptabilité (H7). |
| Comparatif des offres (LOT-10) | Reporté après la mise en service : le circuit DA, BC, réception couvre le besoin immédiat. |
| Évaluation fournisseurs (LOT-14) | Reporté après la mise en service : il faut quelques mois d'historique de livraisons pour que les notes aient un sens. |
| Écran de modification d'une facture | L'action serveur est prête, l'écran n'est pas fait. En attendant, annuler et ressaisir. |
| Écran de modification de l'en-tête d'un dossier import | Même situation. Les frais, jalons et documents restent modifiables. |

## À confirmer avec le client

- Hypothèses de `docs/00-contexte-client.md` (H1 à H63) : validation systématique des DA et BC par le Responsable et seuil du BC (H1, H2), numérotation (H3), TVA 18 % et PMP hors taxes (H5), inventaire tournant (H6), prix visibles ou non du Magasinier (H13), règles des dossiers import (H52 à H57).
- Périmètre des deux acheteurs (local, import ou les deux) et noms des utilisateurs réels.
- `docs/blocages.md` : B1 extrait réel de codes Sage (à obtenir de M. DIBI), B2 tâche planifiée des alertes 8 h / 15 h, B3 test de restauration des sauvegardes.
