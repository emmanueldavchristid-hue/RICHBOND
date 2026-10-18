# Intégration avec Sage 100

## Ce qui est en place chez le client
**Sage 100 Gestion commerciale i7**, édition Maestria (base en fichiers `.gcm`, liée à un fichier comptable `.mae`).
Installateurs disponibles : Gestion commerciale i7, Comptabilité i7, Sage Serveur i7 (accès réseau multi-postes).
Ils ne doivent jamais être dans le dépôt Git.

## Qui fait quoi (hypothèse H7, à confirmer avec M. DIBI)
| Sujet | Maître | Commentaire |
|---|---|---|
| Codes articles, codes fournisseurs | Sage | L'application reprend les codes Sage (`sageCode`) |
| DA, validation, consultations, comparatifs | Application | N'existe pas (ou peu) dans Sage |
| Bons de commande | Application | Exportés vers Sage pour la suite comptable |
| Réceptions et stock opérationnel | Application | Exportées vers Sage (bons de livraison achats) |
| Factures et comptabilité | Sage | L'application fait le rapprochement et le « bon à payer » |
| Frais d'approche détaillés, KPI, alertes, évaluation | Application | Valeur ajoutée de l'application |

Point de vigilance : il faut éviter que l'équipe saisisse les mêmes documents dans les deux outils.
La règle à faire valider : **on saisit dans l'application, on transfère vers Sage par fichier**.

## Mécanismes d'échange, par ordre de sécurité
1. **Fichiers d'export / import de Sage** (choix par défaut). Sage 100 sait exporter et importer des données au format texte paramétrable.
2. **Lecture par le pilote ODBC Sage 100**, si installé chez le client. Lecture seule.
3. **Écriture par les Objets Métiers Sage** (SDK officiel, licence séparée). Seulement si le client l'achète.

Interdit : modifier directement les fichiers `.gcm` / `.mae`.

## Licence Sage
Le client doit disposer de sa propre licence Sage 100 (achetée auprès de Sage ou d'un revendeur agréé).
La prestation de Jason porte sur l'installation, le paramétrage et la formation, pas sur la licence du logiciel.
