# Déploiement

## Planifier les alertes 8h / 15h (LOT-16)

La route `/api/cron/alertes` (GET ou POST) crée un digest par utilisateur actif et par créneau. Elle est idempotente : un second appel au même créneau ne crée aucun doublon. Le créneau se déduit de l'heure d'Abidjan (UTC+0, sans heure d'été) ; on peut le forcer avec `?slot=MATIN` ou `?slot=APRES_MIDI`. Si rien n'est à signaler pour un utilisateur, aucune notification n'est créée.

Prérequis : définir `CRON_SECRET` (valeur longue et aléatoire) dans l'environnement du serveur. Sans lui, la route répond 503 ; sans l'en-tête `Authorization: Bearer <CRON_SECRET>`, elle répond 401.

### Cron Linux (serveur en UTC, identique à Abidjan)
```
0 8,15 * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://app.exemple.ci/api/cron/alertes
```
Si le serveur n'est pas en UTC, convertir 8h et 15h d'Abidjan en heure du serveur.

### Planificateur de tâches Windows
Créer deux tâches (8h00 et 15h00, tous les jours) avec l'action « Démarrer un programme » :
```
curl.exe -fsS -X POST -H "Authorization: Bearer VOTRE_SECRET" http://localhost:3000/api/cron/alertes
```
Cocher « Exécuter même si l'utilisateur n'est pas connecté ».

### Cron de l'hébergeur
Planifier un appel HTTP POST aux mêmes heures (UTC) vers l'URL ci-dessus, avec l'en-tête `Authorization: Bearer <CRON_SECRET>` (par exemple Vercel Cron, qui envoie ce format si `CRON_SECRET` est défini).

### Copie par email
Prévue, désactivée par défaut (`ALERT_EMAIL_COPY` absent). Non implémentée : aucun utilitaire SMTP n'existe encore dans l'application.

### Alertes urgentes
Immédiates, sans passer par la tâche planifiée : la soumission d'une DA « Arrêt de production » prévient aussitôt le Responsable (gravité critique). La rupture d'un article critique figure dans le digest (risques de rupture) ; une notification immédiate à la sortie de stock reste à brancher dans le module stock.


## Options d'hébergement (LOT-18)

- **Serveur interne du client (Windows ou Linux)** : recommandé, les données restent chez RICHBOND. Prérequis : Node.js LTS, PostgreSQL 16+, un reverse proxy HTTPS (Caddy, Nginx ou IIS/ARR).
- **VPS** (Linux) : mêmes composants ; pare-feu limité aux ports 80/443 et SSH ; PostgreSQL non exposé sur Internet.

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Connexion PostgreSQL (`postgresql://utilisateur:motdepasse@hote:5432/base`). |
| `AUTH_SECRET` | Secret de signature des sessions (long, aléatoire : `openssl rand -base64 32`). |
| `AUTH_URL` | URL publique de l'application (`https://achats.exemple.ci`). |
| `CRON_SECRET` | Jeton de la route `/api/cron/alertes` (voir plus haut). |
| `LICENSE_SECRET` | Secret de vérification des clés de licence (voir « Clé de licence »). |
| `ALLOWED_ORIGINS` | Facultatif : origines autorisées pour les actions serveur si le proxy réécrit l'hôte (séparées par des virgules). |
| `BACKUP_DIR`, `BACKUP_RETENTION_DAYS` | Facultatives, utilisées par `scripts/backup.sh` (Linux). Sous Windows, dossier et durée se règlent dans la tâche planifiée. |

Ne jamais versionner ces valeurs. Le fichier `.env` reste sur le serveur.

## HTTPS

L'application doit être servie en HTTPS (les cookies de session et l'en-tête HSTS en dépendent). Les en-têtes de sécurité (CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, HSTS en production) sont posés par `next.config.ts`.
Exemple Caddy (certificat automatique) :
```
achats.exemple.ci {
  reverse_proxy localhost:3000
}
```
Sur un réseau interne sans nom public : certificat de l'autorité interne du client, ou certificat auto-signé installé sur les postes. Le proxy doit transmettre `Host` et `X-Forwarded-For` (limitation des connexions et journal d'audit utilisent l'adresse IP).

## Protections de connexion et de session

- 5 échecs sur un compte : verrouillage 15 minutes (`ACCOUNT_LOCKED` au journal). En plus, blocage 15 minutes après 10 échecs depuis une même adresse IP pour un même e-mail, ou 30 échecs depuis une même IP (`LOGIN_THROTTLED` au journal). Le message affiché reste générique.
- Session : 8 heures, prolongée par l'activité (renouvelée toutes les heures) ; inactivité de plus de 8 heures = reconnexion.
- CSRF : les actions serveur sont refusées par Next.js si l'en-tête `Origin` ne correspond pas à l'hôte ; la connexion Auth.js utilise un jeton CSRF ; aucune route API d'écriture n'accepte les cookies (la route cron exige le jeton `CRON_SECRET`).

## Sauvegardes

Linux : `scripts/backup.sh` (`pg_dump` au format custom, contrôle de l'archive par `pg_restore --list`, suppression des sauvegardes de plus de 30 jours via `BACKUP_RETENTION_DAYS`). Aucun mot de passe n'est écrit dans le script : il lit `DATABASE_URL` ou les variables `PG*` (ou `pgpass`) de l'environnement.

Linux (cron, tous les jours à 2 h) :
```
0 2 * * * . /etc/richbond.env && BACKUP_DIR=/var/backups/richbond /opt/richbond/scripts/backup.sh >> /var/log/richbond-backup.log 2>&1
```

### Windows : tâche planifiée appelant `pg_dump.exe` directement

Aucun script n'est installé sur le serveur (un antivirus peut bloquer un `.ps1` de sauvegarde comme faux positif). La tâche appelle `pg_dump.exe` ; la purge des anciennes sauvegardes est faite par la tâche elle-même, et seulement si la sauvegarde et son contrôle ont réussi.

1. **Mot de passe** : le créer une fois, pour le compte qui exécutera la tâche, dans `%APPDATA%\postgresql\pgpass.conf` (une ligne : `localhost:5432:richbond:richbond:MOT_DE_PASSE`). Il n'apparaît donc ni dans la tâche ni dans un script. Restreindre ce fichier à ce compte.
2. **Dossier** : créer `D:\Sauvegardes\richbond` (idéalement sur un autre disque que la base).
3. **Planificateur de tâches**, Créer une tâche :
   - Général : nom `RICHBOND - Sauvegarde`, compte dédié (ou SYSTEM avec `pgpass.conf` dans son profil), cocher « Exécuter même si l'utilisateur n'est pas connecté ».
   - Déclencheurs : quotidien, 02:00.
   - Actions : une seule action « Démarrer un programme » :
     - Programme : `cmd.exe`
     - Arguments (une seule ligne ; adapter la version de PostgreSQL, l'utilisateur et les chemins) :
       ```
       /c ""C:\Program Files\PostgreSQL\16\bin\pg_dump.exe" -h localhost -p 5432 -U richbond -d richbond -F c --no-owner -f "D:\Sauvegardes\richbond\richbond_%DATE:~6,4%%DATE:~3,2%%DATE:~0,2%.dump" && "C:\Program Files\PostgreSQL\16\bin\pg_restore.exe" --list "D:\Sauvegardes\richbond\richbond_%DATE:~6,4%%DATE:~3,2%%DATE:~0,2%.dump" > NUL && forfiles /p "D:\Sauvegardes\richbond" /m richbond_*.dump /d -30 /c "cmd /c del @path""
       ```
   - Paramètres : « Exécuter la tâche dès que possible après un démarrage planifié manqué ».
4. **Enchaînement** : `&&` garantit que le contrôle (`pg_restore --list`) ne s'exécute que si `pg_dump` a réussi, et que la purge (`forfiles ... /d -30` : fichiers de plus de 30 jours) ne s'exécute que si la sauvegarde du jour est valide. En cas d'échec, rien n'est supprimé et la colonne « Dernier résultat » de la tâche affiche un code différent de 0.
5. **Format de date** : `%DATE:~6,4%%DATE:~3,2%%DATE:~0,2%` suppose une date `JJ/MM/AAAA` (Windows en français). Contrôler avec `echo %DATE%` dans une invite de commandes ouverte sous le même compte ; si le résultat commence par le nom du jour, décaler les positions de 4 caractères. Lancer la tâche une fois à la main (clic droit, Exécuter) et vérifier qu'un fichier `richbond_AAAAMMJJ.dump` apparaît.

Durée de conservation : modifier la valeur `-30` de `forfiles` (en jours). Une seule sauvegarde par jour est conservée (un second lancement le même jour remplace le fichier).

À faire en plus : copier le dossier de sauvegarde hors du serveur (disque externe, autre site) ; les pièces jointes (photos d'articles, factures, DA) sont dans le dossier `storage/` : à sauvegarder avec la base.

Réversibilité : le Responsable peut aussi télécharger l'export complet en Excel depuis Paramètres, « Export complet des données » (une feuille par domaine, action tracée au journal).

## Restauration

1. Arrêter l'application.
2. Choisir l'archive : `ls backups/` (ou l'Explorateur Windows).
3. Linux : `scripts/restore.sh backups/richbond_AAAAMMJJ_HHMMSS.dump` ; Windows : `.\scripts\restore.ps1 -File .\backups\richbond_AAAAMMJJ_HHMMSS.dump`. Une confirmation « oui » est demandée (option `--force` / `-Force` pour l'automatiser). La restauration se fait en une seule transaction : en cas d'erreur, la base reste inchangée.
4. Restaurer le dossier `storage/` correspondant.
5. Redémarrer l'application, se connecter, contrôler le stock et le dernier BC.

Tester la procédure une fois par trimestre sur une base vide (changer `DATABASE_URL` vers une base de test), jamais directement sur la production.

## Mise à jour de l'application

1. Sauvegarde (`backup`), puis arrêt de l'application.
2. `git pull` (ou dépôt du nouveau paquet), `npm ci`.
3. `npx prisma migrate deploy` (applique les migrations sans toucher aux données), puis `npm run build`.
4. Redémarrer (`npm start` ou le service Windows / systemd) et vérifier la page de connexion.
5. En cas de problème : restaurer la sauvegarde de l'étape 1 et revenir à la version précédente du code.

Ne jamais lancer `prisma migrate reset` ni `npm run db:seed` en production.

## Clé de licence

La licence (essai puis activation) est gérée par le Super-admin dans Paramètres, Licence. Pour générer une clé : `npm run license:generate -- "RICHBOND CI"` (nom du titulaire de la licence) avec le même `LICENSE_SECRET` que le serveur ; la saisie de la clé dans l'écran Licence active l'application. Après expiration de l'essai, l'application passe en lecture seule : les consultations et les exports (dont l'export complet) restent disponibles.

## Test de charge (facultatif)

`npm run seed:charge` ajoute 2 000 articles fictifs et 10 000 mouvements de stock (préfixe `CHG-`, idempotent). À utiliser sur une base de développement uniquement.
