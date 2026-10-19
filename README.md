# RICHBOND – Achats & Stocks

Application web de gestion des achats et des stocks pour RICHBOND CI : demandes d'achat, validation, consultations et comparatifs,
bons de commande, réceptions, stock et réapprovisionnement, inventaires, achats import et frais d'approche, factures,
évaluation des fournisseurs, tableaux de bord, rapports, alertes 8h/15h, échanges avec Sage 100.

Développement : Christ-Emmanuel (Jason) Mouhi – freelance.

## Démarrer
1. `powershell -ExecutionPolicy Bypass -File .\installer.ps1` (une seule fois)
2. Remplir `.env`, créer les bases `richbond` et `richbond_test`
3. `claude` puis `/lots-auto`

Toute la méthode : `docs/07-guide-de-travail.md`. Plan et avancement : `docs/03-plan-des-lots.md`.

## Comptes de démonstration
Créés (fictifs) par le seed `npx prisma db seed`. Mot de passe de tous les comptes : la valeur de `SEED_DEFAULT_PASSWORD` de votre environnement local.

| Rôle | Email |
|---|---|
| Super-admin | `admin@richbond.test` |
| Responsable Achats | `responsable@richbond.test` |
| Acheteur local | `acheteur.local@richbond.test` |
| Acheteur import | `acheteur.import@richbond.test` |
| Magasinier | `magasinier@richbond.test` |

## Période d'essai et licence (LOT-02)

Variables d'environnement (à ajouter à `.env`) :

- `TRIAL_END_DATE=AAAA-MM-JJ` : date de fin de l'essai (23:59 heure d'Abidjan), appliquée à la création de la licence seulement.
- `TRIAL_DAYS=30` : durée de l'essai si `TRIAL_END_DATE` est absente (1 à 365).
- `LICENSE_SECRET` : secret serveur d'au moins 32 caractères (`npm run license:secret` en génère un). Obligatoire en production pour activer une licence. Ne jamais le versionner.
- `ALLOW_TEST_NOW=1` : tests uniquement, jamais en production. Autorise `TEST_NOW` / cookie `rb-test-now` à simuler l'heure.

Génération d'une clé d'activation (Jason uniquement) : `npm run license:generate -- "RICHBOND CI"`.
Prolonger ou activer : page `/parametres/licence` (Super-admin).
