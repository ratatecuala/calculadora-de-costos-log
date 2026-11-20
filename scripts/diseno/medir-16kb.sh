#!/usr/bin/env bash
# HERRAMIENTA DE DISEÑO (#45). Ejecuta la medición de 16 KB en una base LOCAL desechable y la elimina.
#   PGHOST=/ruta/al/socket PGPORT=55433 PGUSER=medir scripts/diseno/medir-16kb.sh
set -euo pipefail
dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
case "${PGHOST:-}" in
  *supabase*|"") echo "ERROR: PGHOST debe apuntar a un PostgreSQL local" >&2; exit 1 ;;
esac
db="medicion_$(date +%s)"
psql -q -d postgres -c "create database $db" >/dev/null
node "$dir/medir-snapshot-16kb.mjs" | psql -X -q -P pager=off -d "$db"
psql -q -d postgres -c "drop database $db" >/dev/null
