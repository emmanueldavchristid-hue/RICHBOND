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
