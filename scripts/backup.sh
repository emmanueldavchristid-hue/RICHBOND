#!/usr/bin/env bash
# Sauvegarde quotidienne PostgreSQL (LOT-18). Aucun mot de passe en dur.
#
# Connexion, par ordre de priorité :
#   1. variable d'environnement DATABASE_URL (postgresql://utilisateur:motdepasse@hote:5432/base) ;
#   2. variables standard PGHOST, PGPORT, PGUSER, PGDATABASE, PGPASSWORD (ou fichier ~/.pgpass).
# Variables facultatives :
#   BACKUP_DIR            dossier de destination (défaut : ./backups)
#   BACKUP_RETENTION_DAYS durée de conservation en jours (défaut : 30)
#
# Exemple cron (tous les jours à 2 h) :
#   0 2 * * * DATABASE_URL=... /opt/richbond/scripts/backup.sh >> /var/log/richbond-backup.log 2>&1
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION="${BACKUP_RETENTION_DAYS:-30}"
mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y%m%d_%H%M%S)"
FILE="$BACKUP_DIR/richbond_${STAMP}.dump"

if [[ -n "${DATABASE_URL:-}" ]]; then
  # pg_dump accepte une URL de connexion (le paramètre ?schema=... propre à Prisma est retiré).
  TARGET="${DATABASE_URL%%\?*}"
  pg_dump --format=custom --no-owner --file="$FILE" "$TARGET"
else
  pg_dump --format=custom --no-owner --file="$FILE"
fi

# Contrôle : l'archive doit être lisible.
pg_restore --list "$FILE" > /dev/null

# Rétention : suppression des sauvegardes plus anciennes que N jours.
find "$BACKUP_DIR" -name 'richbond_*.dump' -type f -mtime +"$RETENTION" -delete

echo "$(date -Iseconds) Sauvegarde OK : $FILE ($(du -h "$FILE" | cut -f1))"
