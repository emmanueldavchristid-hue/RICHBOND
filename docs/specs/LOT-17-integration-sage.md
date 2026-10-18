# LOT-17 – Intégration Sage 100 Gestion commerciale i7

Lire d'abord `docs/04-integration-sage.md`.

## Objectif
Pas de double saisie entre l'application et Sage, sans jamais mettre en danger la base Sage du client.

## Fonctionnement
- Interface `SageAdapter` : `importItems(file)`, `importSuppliers(file)`, `importStock(file)`, `exportPurchaseOrders(ids)`, `exportReceipts(ids)`.
- Implémentation `FileSageAdapter` :
  - **Sage → application** : lecture des exports Sage (fichiers texte délimités ou Excel produits depuis Sage : articles, fournisseurs, stocks par dépôt).
    Correspondance par `sageCode`. Mise à jour sans doublon, rapport des écarts (article présent dans Sage mais pas dans l'app, et inversement).
  - **Application → Sage** : génération d'un fichier d'import des BC validés (et des réceptions) au format d'import paramétrable de Sage 100,
    avec un fichier de correspondance des colonnes réglable dans `/parametres/sage` (le format exact sera calé sur la version du client).
- Chaque synchronisation : `SageSyncRun` (sens, date, utilisateur, nb lignes, erreurs, fichier généré téléchargeable). Rejouable.
- Écran `/parametres/sage` : dernier import, dernier export, documents en attente d'export, bouton « Générer le fichier pour Sage », correspondance des codes.
- `OdbcSageAdapter` (lecture directe via le pilote ODBC Sage) : préparer l'interface et la documentation seulement ; implémenter si le client fournit l'accès.

## Critères d'acceptation
- [ ] Fichiers d'exemple fictifs dans `tests/fixtures/sage/` et tests de lecture / génération.
- [ ] Un document déjà exporté n'est pas réexporté (sauf demande explicite).
- [ ] Guide pas à pas `docs/sage/procedure-echanges.md` : comment faire l'export dans Sage et l'import du fichier généré (à valider sur le poste du client).
