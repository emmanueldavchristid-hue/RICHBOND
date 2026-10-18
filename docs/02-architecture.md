# Architecture

## Stack
| Besoin | Choix |
|---|---|
| Application web | Next.js (App Router, server actions) + TypeScript `strict` |
| Base | PostgreSQL 16+ via Prisma (migrations versionnées) |
| Auth | Auth.js, provider Credentials, mots de passe bcrypt, sessions JWT courtes |
| UI | Tailwind CSS + shadcn/ui, icônes lucide-react, graphiques Recharts |
| Tableaux | TanStack Table (tri, filtres, pagination côté serveur) |
| Formulaires | react-hook-form + Zod (schémas partagés client/serveur) |
| PDF | @react-pdf/renderer (BC, bons de sortie, rapports) |
| Excel | exceljs (import et export) |
| Dates | date-fns + date-fns-tz, fuseau `Africa/Abidjan` |
| Tâches planifiées | Route `/api/cron/[tache]` protégée par `CRON_SECRET`, appelée par un planificateur (cron serveur, Planificateur de tâches Windows ou service d'hébergement) |
| Tests | Vitest (unitaires), Playwright (workflow multi-rôles) |
| CI | GitHub Actions : lint, typecheck, tests unitaires |

## Arborescence
```
src/
  app/
    (auth)/connexion/
    (app)/                      # layout protégé : menu, en-tête, badge d'essai, notifications
      accueil/                  # tableau de bord (par rôle)
      achats/demandes/ achats/consultations/ achats/commandes/ achats/factures/
      import/dossiers/
      stock/articles/ stock/mouvements/ stock/receptions/ stock/sorties/ stock/inventaires/ stock/reappro/
      fournisseurs/ fournisseurs/evaluations/
      rapports/
      parametres/ (utilisateurs, depots, services, devises, seuils, licence, sage)
    api/cron/[tache]/ api/export/...
  modules/                      # logique métier (pure + accès données via repositories)
    auth/ licensing/ purchasing/ sourcing/ receiving/ stock/ inventory/ imports/ invoicing/
    suppliers/ reporting/ alerts/ audit/ numbering/
  integrations/sage/            # SageAdapter + implémentations
  components/                   # UI partagée (StatusBadge, MoneyCell, DataTable, ConfirmDialog, TrialBanner…)
  lib/                          # db, auth, permissions, money, dates, errors
prisma/ schema.prisma  seed.ts
tests/ unit/  e2e/  fixtures/
```

## Modèle de données (principal)
- `User` (nom, email, rôle, périmètre achat LOCAL|IMPORT|ALL, actif)
- `License` (statut TRIAL|ACTIVE|EXPIRED, trialStartsAt, trialEndsAt, licensedTo, activatedAt, keyFingerprint)
- `Counter` (clé, année, valeur)
- `AuditLog` (user, action, entité, id, avant/après JSON, date)
- `Warehouse` (dépôt) · `Department` (service demandeur : Production, Maintenance, Qualité, Admin…)
- `Currency` + `ExchangeRate` (XOF, EUR, USD, CNY…)
- `Supplier` (sageCode, raison sociale, type LOCAL|IMPORT, pays, devise, contacts, conditions de paiement, délai moyen annoncé, catégories, statut actif/bloqué)
- `ItemCategory` (MATIERE_PREMIERE, INTRANT, PDR, FOURNITURE, SERVICE) · `Item` (sageCode, désignation, catégorie, unité, stocké oui/non, criticité, classe ABC, stock de sécurité, point de commande, quantité économique, délai de réappro, fournisseur principal)
- `ItemSupplier` (article ↔ fournisseur : référence fournisseur, dernier prix, délai, minimum de commande)
- `StockLevel` (article × dépôt : quantité, PMP) – mis à jour uniquement par `StockMovement`
- `StockMovement` (type ENTREE_RECEPTION|SORTIE|AJUSTEMENT_INVENTAIRE|RETOUR_FOURNISSEUR|TRANSFERT, quantité signée, coût unitaire, référence document)
- `PurchaseRequest` (DA) + lignes · `Approval` (étape, décideur, décision, commentaire)
- `RfqRound` (consultation) + `Quote` + `QuoteLine` + `QuoteScore`
- `PurchaseOrder` (BC) + lignes (qté commandée, reçue, facturée) · `PurchaseOrderEvent` (envoyé, relancé, confirmé, date promise)
- `Receipt` + lignes (qté reçue, acceptée, refusée, motif) · `NonConformity`
- `StockIssue` (bon de sortie) + lignes
- `InventoryCount` + lignes (théorique figé, compté, écart, valeur de l'écart)
- `ImportFile` (dossier import) + `ImportMilestone` + `LandedCostLine` (type de frais, montant, devise, clé de répartition)
- `SupplierInvoice` + lignes, statut de rapprochement
- `SupplierEvaluation` (période, critères, note)
- `Notification` (destinataire, type, gravité, lien, lu)
- `SageSyncRun` (type, sens, date, lignes, erreurs, fichier)

## Conventions
- Statuts en enum Prisma ; transitions autorisées définies dans `src/modules/<domaine>/workflow.ts` et testées.
- Erreurs métier : classe `BusinessError(code, messageFr)` affichée telle quelle à l'utilisateur.
- Garde commune `requireAction(user, action)` + `requireWritable()` (licence) dans toutes les server actions.
- Montants : `Int` en FCFA ; devises étrangères : `Decimal(14,2)` + taux `Decimal(14,6)`.
- Quantités : `Decimal(14,3)`.
- Chaque liste : recherche, filtres, tri, pagination, export Excel.
