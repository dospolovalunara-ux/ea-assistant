#!/usr/bin/env bash
# Проверка восстановления: последняя копия разворачивается во временную базу,
# затем сверяется количество строк в ключевых таблицах. Рабочая база не трогается.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; set +a
: "${DATABASE_URL:?DATABASE_URL не задан}"
DUMP=$(ls -t backups/db-*.dump 2>/dev/null | head -1)
[ -n "$DUMP" ] || { echo "Нет резервных копий в backups/"; exit 1; }
TMP_DB="restore_check_$(date +%s)"
BASE_URL="${DATABASE_URL%/*}"
psql "$DATABASE_URL" -qc "CREATE DATABASE $TMP_DB"
trap 'psql "$DATABASE_URL" -qc "DROP DATABASE IF EXISTS $TMP_DB"' EXIT
pg_restore --no-owner --dbname "$BASE_URL/$TMP_DB" "$DUMP"
for t in users calendar_events tasks audit_logs corporate_expenses personal_expenses family_documents; do
  a=$(psql "$DATABASE_URL" -tAc "select count(*) from $t")
  b=$(psql "$BASE_URL/$TMP_DB" -tAc "select count(*) from $t")
  printf "%-22s рабочая: %-6s копия: %s\n" "$t" "$a" "$b"
done
echo "✓ Копия $DUMP восстанавливается"
