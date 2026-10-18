# Configurer Sage 100 Gestion commerciale i7 pour l'équipe Achats de RICHBOND

Guide de terrain pour Jason, à dérouler chez le client avec M. DIBI.
Les noms de menus correspondent à Sage 100 i7 ; certains libellés peuvent varier légèrement selon l'édition installée.
**Avant toute manipulation : faire une copie de sauvegarde des fichiers de la société (`.gcm` et `.mae`).**

## 0. Principe d'organisation
| Personne | Ce qu'elle fait dans Sage | Ce qu'elle fait dans l'application |
|---|---|---|
| M. DIBI, Responsable Achats | Contrôle, validation, états, paramétrage | Validation DA/BC, tableau de bord, rapports, évaluation |
| Acheteur 1 (local) | Fiches fournisseurs/articles, documents d'achat locaux | DA, consultations, BC, relances, factures |
| Acheteur 2 (import) | Fiches fournisseurs import, documents d'achat import | BC import, dossiers import, frais d'approche |
| Magasinier | Mouvements de stock, inventaire | Réceptions, sorties, inventaires tournants |

Tant que l'application n'est pas en production, l'équipe travaille dans Sage avec ce paramétrage. Ensuite, la règle sera :
on saisit dans l'application, on transfère vers Sage (voir `docs/04-integration-sage.md`).

## 1. Paramètres société (Fichier > Paramètres société)
- **Identification** : raison sociale RICHBOND CI, adresse, NCC, RCCM, téléphone, logo si possible (apparaît sur les BC imprimés).
- **Exercice / période** : vérifier les dates d'exercice.
- **Devises** : déclarer XOF comme devise de tenue, puis EUR, USD, CNY (et autres pays d'import) avec leur cours.
- **Taxes** : TVA 18 % sur achats (déductible), et les taxes spécifiques utilisées par la comptabilité.
- **Catégories comptables achats** : au minimum « Achats locaux » et « Achats import » (les comptes et taxes diffèrent).
- **Unités** : unités d'achat et de stock utilisées (KG, L, M, M², PCE, ROULEAU, FÛT, CARTON…).
- **Documents** : définir la numérotation de chaque document d'achat (préfixe et compteur). Proposition :
  préparation/demande `DA`, bon de commande `BC`, bon de livraison `BL`, retour `BR`, facture `FA`. Une seule souche par type,
  pour que tout le monde partage la même numérotation (c'est le problème actuel de synchronisation des BC).
- **Dépôts de stockage** : MAGASIN CENTRAL (matières premières, intrants, fournitures), MAGASIN PDR (pièces de rechange) – à adapter à l'organisation réelle.
- **Valorisation du stock** : méthode CMUP (prix moyen pondéré), cohérente avec le PMP de l'application.

## 2. Familles d'articles (Structure > Familles)
| Famille | Code proposé | Suivi de stock |
|---|---|---|
| Matières premières | MP | CMUP |
| Intrants / consommables de production | INT | CMUP |
| Pièces de rechange | PDR | CMUP |
| Fournitures (bureau, entretien, EPI) | FOU | CMUP |
| Services (maintenance, transport, prestations) | SRV | Aucun (non stocké) |

Sous-familles possibles pour les PDR par type de machine. Renseigner pour chaque famille la catégorie comptable et les comptes d'achat.

## 3. Fournisseurs (Structure > Fournisseurs)
- Code : convention unique, par exemple `F` + 5 chiffres (`F00001`), ou les 6 premières lettres du nom.
- Renseigner : intitulé, adresse, contact principal, téléphone, email, NCC, **catégorie comptable** (local / import),
  **devise** (import), **conditions de règlement**, mode d'expédition, délai de livraison habituel.
- Utiliser le champ statistique libre (ou un « info libre ») pour le **type** LOCAL / IMPORT et la **catégorie d'achat** principale :
  cela permettra les statistiques et la reprise dans l'application.
- Mettre en sommeil (sans supprimer) les fournisseurs inactifs.

## 4. Articles (Structure > Articles)
- Référence : reprendre les codes existants s'ils sont fiables ; sinon convention par famille (`MP-0001`, `PDR-0001`…).
- Onglets à remplir :
  - **Identification** : désignation claire, famille, unité de vente/stock, suivi de stock CMUP.
  - **Fournisseurs** : fournisseur principal (et secondaires), référence fournisseur, prix d'achat, délai, conditionnement, quantité minimum de commande.
  - **Stock / Dépôts** : dépôt principal, **stock minimum** (= point de commande) et **stock maximum**. Ce sont ces valeurs que l'assistant de
    réapprovisionnement de Sage utilise.
  - **Frais d'approche** (s'il est présent dans ta version) : coefficient ou montant estimé pour les articles importés.
- Bloquer (mise en sommeil) les articles obsolètes.

## 5. Collaborateurs (Structure > Collaborateurs)
Créer M. DIBI et les 2 acheteurs comme collaborateurs de type **acheteur**. On les choisit ensuite sur chaque document d'achat :
cela donne des statistiques par acheteur.

## 6. Utilisateurs et droits (Fichier > Autorisations d'accès)
1. Définir d'abord un mot de passe pour le compte administrateur (garde-le pour toi et M. DIBI).
2. Créer 3 profils, puis un utilisateur par personne avec son propre mot de passe :

| Fonction Sage | Responsable Achats | Acheteur | Magasinier |
|---|---|---|---|
| Paramètres société | Modification | Lecture / interdit | Interdit |
| Autorisations d'accès | Modification | Interdit | Interdit |
| Fournisseurs | Modification | Modification | Lecture |
| Articles | Modification | Modification | Lecture |
| Documents des achats (saisie) | Modification | Modification | Bon de livraison uniquement si possible, sinon lecture |
| Transformation / validation des BC | Modification | Lecture (si ta version le permet) | Interdit |
| Factures d'achat / mise à jour comptable | Modification | Lecture | Interdit |
| Documents des stocks (entrées, sorties, virements) | Modification | Lecture | Modification |
| Saisie d'inventaire | Modification | Lecture | Modification |
| Réapprovisionnement | Modification | Modification | Lecture |
| États et statistiques | Modification | Lecture | Lecture (stocks) |
| Suppression de documents | Modification | Interdit | Interdit |

Tester chaque compte en se connectant avec, avant de le remettre à l'utilisateur.

## 7. Circuit des documents d'achat (Traitement > Documents des achats)
1. **Préparation de commande** (ou Demande d'achat si ta version la propose) : saisie du besoin.
2. Validation par M. DIBI, puis **transformation en Bon de commande** (le numéro BC est attribué par Sage, un seul compteur).
   Utiliser le **statut** du document (par exemple Saisi → Confirmé) pour matérialiser la validation, si l'édition le permet.
3. Impression / envoi du BC au fournisseur.
4. **Bon de livraison** à la réception (saisi ou validé par le magasinier) : le stock entre au dépôt et le CMUP se met à jour.
   En cas de livraison partielle, ne transformer que les quantités reçues ; le reliquat reste sur le BC.
5. **Facture** à réception de la facture fournisseur, à partir du BL (contrôle prix et quantités), puis mise à jour comptable.
6. Retours : **Bon de retour** puis avoir.

## 8. Stock (Traitement > Documents des stocks, Inventaire, Réapprovisionnement)
- Sorties pour la production ou la maintenance : **mouvement de sortie** avec le service en référence.
- Transferts entre magasins : **virement de dépôt à dépôt**.
- Inventaire : préparation (liste par dépôt / famille), comptage, saisie, validation par M. DIBI, mise à jour. Rythme : inventaire tournant chaque semaine.
- **Réapprovisionnement** : l'assistant propose les commandes à passer à partir des stocks mini/maxi ; à lancer chaque matin par un acheteur.

## 9. Imprimés
Adapter le modèle de **bon de commande** : logo, mentions RICHBOND, conditions générales d'achat, zone de signature du Responsable Achats.

## 10. Réseau et sauvegardes
- Base sur le poste ou serveur principal, **Sage Serveur i7** pour l'accès simultané des 4 utilisateurs.
- Sauvegarde quotidienne des fichiers de la société (copie automatique vers un autre disque ou un support externe), en dehors des heures de saisie.

## 11. Ce qui ne relève pas de ta prestation
La **licence Sage 100** doit être au nom de RICHBOND CI, achetée auprès de Sage ou d'un revendeur agréé. Ta prestation porte sur
l'installation, le paramétrage, la reprise des données et la formation. Sur ta facture, présente-les ainsi, séparément de l'application.
