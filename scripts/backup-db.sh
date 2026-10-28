#!/usr/bin/env bash
# Nightly-style backup of the Cashflow database to a compressed file.
#
#   DATABASE_URL="postgres://..." ./scripts/backup-db.sh [output-folder]
#
# - Needs `pg_dump` (PostgreSQL client tools, version 16 or newer; Neon runs 16/17).
# - The connection string is read from the environment (or .env.local) and is
#   never printed. Do not paste it on the command line history of a shared PC.
# - Output: <folder>/cashflow-YYYY-MM-DD-HHMM.sql.gz  (default folder: ./backups)
# - Keeps the newest 30 files in that folder.
# - Backups contain patient data: store them encrypted and off the clinic PC.
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" && -f .env.local ]]; then
  # Read only the one variable we need; do not export the rest of the file.
  DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.local | head -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
fi
: "${DATABASE_URL:?DATABASE_URL is not set}"

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump not found. Install PostgreSQL client tools first (e.g. brew install libpq)." >&2
  exit 1
fi

folder="${1:-backups}"
mkdir -p "$folder"
file="$folder/cashflow-$(date +%Y-%m-%d-%H%M).sql.gz"

# --no-owner/--no-privileges: the dump restores into any database or role.
pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip -9 > "$file"

# A real dump is never tiny; an empty file means the connection failed.
size=$(wc -c < "$file")
if [[ "$size" -lt 2048 ]]; then
  rm -f "$file"
  echo "Backup failed: output was empty." >&2
  exit 1
fi

echo "Backup written: $file ($((size / 1024)) KB)"

# Keep the newest 30.
ls -1t "$folder"/cashflow-*.sql.gz 2>/dev/null | tail -n +31 | while read -r old; do
  rm -f "$old"
done
