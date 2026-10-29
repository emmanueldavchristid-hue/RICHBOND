#!/usr/bin/env bash
# Restauration d'une sauvegarde PostgreSQL (LOT-18).
# Usage : scripts/restore.sh <fichier.dump> [--force]
# ATTENTION : remplace les données de la base cible. Arrêter l'application avant.
# Connexion : DATABASE_URL ou PGHOST/PGPORT/PGUSER/PGDATABASE/PGPASSWORD (voir backup.sh).
# Conseil : tester d'abord sur une base vide (ex. richbond_test) en changeant DATABASE_URL.
set -euo pipefail

FILE="${1:-}"
if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "Usage : $0 <fichier.dump> [--force]" >&2
  exit 1
fi
if [[ "${2:-}" != "--force" ]]; then
  read -r -p "Cette opération REMPLACE les données de la base cible. Continuer (oui/non) ? " ans
  [[ "$ans" == "oui" ]] || { echo "Annulé."; exit 1; }
fi

pg_restore --list "$FILE" > /dev/null

if [[ -n "${DATABASE_URL:-}" ]]; then
  TARGET="${DATABASE_URL%%\?*}"
  pg_restore --clean --if-exists --no-owner --single-transaction --dbname="$TARGET" "$FILE"
else
  pg_restore --clean --if-exists --no-owner --single-transaction --dbname="${PGDATABASE:?PGDATABASE ou DATABASE_URL requis}" "$FILE"
fi
echo "Restauration terminée depuis $FILE. Redémarrer l'application puis vérifier la connexion et le stock."
