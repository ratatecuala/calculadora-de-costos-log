#!/usr/bin/env bash
# HERRAMIENTA DE DISEÑO (#45). Ejecuta la medición de 16 KB en una base LOCAL desechable y la elimina.
#   PGHOST=/ruta/al/socket PGPORT=55433 PGUSER=medir scripts/diseno/medir-16kb.sh
set -euo pipefail
dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Solo un PostgreSQL LOCAL: socket Unix (ruta absoluta) o localhost/127.0.0.1/::1 (P2-2).
case "${PGHOST:-}" in
  /*|localhost|127.0.0.1|::1) ;;
  *) echo "ERROR: PGHOST debe ser un socket local (ruta absoluta) o localhost/127.0.0.1/::1" >&2; exit 1 ;;
esac
db="medicion_$(date +%s)_$$"
creada=0
limpiar() { if [[ $creada == 1 ]]; then psql -X -q -d postgres -c "drop database if exists $db" >/dev/null || true; fi; }
trap limpiar EXIT
psql -X -q -d postgres -c "create database $db" >/dev/null
creada=1
# ON_ERROR_STOP también va dentro del script generado; la aserción final falla si algún caso no
# coincide con lo esperado. pipefail propaga el error de node o de psql.
node "$dir/medir-snapshot-16kb.mjs" | psql -X -q -v ON_ERROR_STOP=1 -P pager=off -d "$db"
echo "Medición OK. La base desechable se elimina al salir."

