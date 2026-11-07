#!/usr/bin/env bash
# Резервная копия базы (pg_dump, custom format) и приватного хранилища файлов.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; set +a
: "${DATABASE_URL:?DATABASE_URL не задан}"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p backups
pg_dump --format=custom --no-owner --file "backups/db-$STAMP.dump" "$DATABASE_URL"
STORE="${FILE_STORAGE_DIR:-storage}"
if [ -d "$STORE" ]; then tar -czf "backups/files-$STAMP.tar.gz" -C "$STORE" .; fi
echo "✓ Резервная копия: backups/db-$STAMP.dump"
