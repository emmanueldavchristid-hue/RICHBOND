# Guide de travail de Jason

## 1. Préparation (une seule fois)
1. **Claude Code sur ton abonnement Pro** : en haut de Claude Code, il ne doit pas y avoir « API Usage Billing ».
   Sinon : `claude logout`, supprimer la variable `ANTHROPIC_API_KEY`, rouvrir PowerShell, `claude login` avec le compte Pro.
2. **PostgreSQL** : installer PostgreSQL 16+ pour Windows (garder le mot de passe de l'utilisateur `postgres`), puis :
   ```
   psql -U postgres -c "CREATE DATABASE richbond;"
   psql -U postgres -c "CREATE DATABASE richbond_test;"
   ```
3. **Installer le projet** : dans `Documents\Claude\RICHBOND`, lancer
   `powershell -ExecutionPolicy Bypass -File .\installer.ps1`
4. **Remplir `.env`** : mot de passe PostgreSQL, et des valeurs aléatoires pour `AUTH_SECRET`, `LICENSE_SECRET`, `CRON_SECRET`
   (par exemple avec `npx auth secret`, ou n'importe quelle longue suite de caractères). Garde `LICENSE_SECRET` pour toi seul.

## 2. Lancer le développement autonome
```
cd C:\Users\Dell\Documents\Claude\RICHBOND
claude
```
puis taper `/lots-auto`. Claude enchaîne les lots tout seul (plan → code → tests → recette → GitHub) et te fait un compte rendu à chaque lot.

Ce que tu fais pendant ce temps :
- `/point` de temps en temps pour voir où on en est.
- Lire `docs/blocages.md` : c'est là que Claude écrit ce qu'il attend de toi.
- Tester dans le navigateur : `npm run dev` puis http://localhost:3000.

## 3. Quand la limite d'usage est atteinte
Le plan Pro a une limite par session et par semaine. Quand elle est atteinte, Claude s'arrête. À la remise à zéro :
`claude` puis `/lots-auto` : il relit le plan et le journal et reprend où il s'était arrêté. Rien n'est perdu (tout est commité).
Conseils pour aller plus loin avec le même quota :
- `/model opusplan` (réglé par défaut) : Opus seulement pour réfléchir, Sonnet pour coder. Les agents ont déjà le bon modèle.
- `/compact` si la session devient très longue, `/clear` entre deux lots si tu relances à la main.

## 4. Ton équipe d'agents
| Agent | Rôle | Modèle |
|---|---|---|
| chef-de-projet | Plan de chaque lot, suivi du plan, du journal, des hypothèses | Opus |
| dev-backend | Base de données, règles métier, sécurité, calculs | Sonnet |
| dev-frontend | Écrans, formulaires, tableaux de bord, fenêtre d'essai | Sonnet |
| expert-sage | Échanges avec Sage 100 | Opus |
| testeur-unitaire | Tests des règles métier (Vitest) | Sonnet |
| testeur-workflow | Tests des parcours complets multi-rôles (Playwright) | Sonnet |
| recette-metier | Ancien Responsable Achats : valide que ça sert vraiment au client | Opus |
| relecteur | Sécurité et qualité avant chaque fusion | Opus |

Ils sont dans `.claude/agents/`. Pour les voir ou les modifier, ouvre les fichiers, ou demande à Claude.

## 5. Tes commandes
| Commande | Effet |
|---|---|
| `/lots-auto` | Développe tous les lots restants sans s'arrêter |
| `/lot 05` | Développe un seul lot |
| `/tester-workflow` | Rejoue tous les parcours utilisateurs et corrige |
| `/recette 07` | Recette métier d'un lot |
| `/point` | Avancement, blocages, prochaine action |
| `/commit` | Commit propre après vérification |

## 6. Avant de montrer au client
- Après le LOT-08 : suivre `docs/demo-1.md` (script de démo de 15 minutes).
- Saisir les vrais noms des utilisateurs dans Paramètres > Utilisateurs.
- Régler la date de fin d'essai dans Paramètres > Licence (ou `TRIAL_END_DATE` dans `.env`).
- Générer la clé de licence le jour du paiement : `npm run license:generate -- "RICHBOND CI"`.

## 7. Règles d'or
- Dépôt GitHub **privé** (projet client).
- Jamais de vraies données client dans Git ; les fichiers d'export du client restent hors du dossier projet.
- Si Claude casse quelque chose : `git restore .` annule les changements non commités ; `git log` montre l'historique.
