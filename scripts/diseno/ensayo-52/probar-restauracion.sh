#!/usr/bin/env bash
# HERRAMIENTA DE DISEÑO (#52, A-74). Comprueba scripts/verificar-restauracion.sql en un PostgreSQL LOCAL
# desechable ANTES y DESPUÉS de la migración 20261122120000: todas las invariantes «inv.*» deben valer lo
# esperado en ambos estados. Nunca se conecta a Supabase.
#   PGHOST=/ruta/al/socket PGPORT=55433 PGUSER=medir scripts/diseno/ensayo-52/probar-restauracion.sh
set -euo pipefail
dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$dir/../../.." && pwd)"
mig="$repo/supabase/migrations/20261122120000_guardado_unico_y_contador.sql"
case "${PGHOST:-}" in
  /*|localhost|127.0.0.1|::1) ;;
  *) echo "ERROR: PGHOST debe ser un socket local (ruta absoluta) o localhost/127.0.0.1/::1" >&2; exit 1 ;;
esac
base="restauracion52_$(date +%s)_$$"
creadas=()
trap 'for b in "${creadas[@]}"; do psql -X -q -d postgres -c "drop database if exists $b" >/dev/null || true; done' EXIT
for estado in antes despues; do
  db="${base}_$estado"
  psql -X -q -d postgres -c "create database $db" >/dev/null
  creadas+=("$db")
  psql -q -X -v ON_ERROR_STOP=1 -d "$db" -f "$repo/scripts/diseno/stub-supabase.sql" >/dev/null
  # El stub no trae auth.identities; verificar-restauracion.sql la cuenta.
  psql -q -X -v ON_ERROR_STOP=1 -d "$db" -c "create table if not exists auth.identities (id uuid primary key, user_id uuid)" >/dev/null
  for m in "$repo"/supabase/migrations/*.sql; do
    [[ "$estado" == antes && "$m" == "$mig" ]] && continue
    psql -q -X -v ON_ERROR_STOP=1 -d "$db" -f "$m" >/dev/null
  done
  salida=$(psql -X -At -F ' | ' -v ON_ERROR_STOP=1 -d "$db" -f "$repo/scripts/verificar-restauracion.sql")
  malas=$(echo "$salida" | awk -F ' \\| ' '$1 ~ /^inv\./ && $2 != $3 {print}')
  total=$(echo "$salida" | grep -c '^inv\.')
  if [[ -n "$malas" ]]; then echo "$malas"; echo "FALLA restauración ($estado de la migración): invariantes distintas de lo esperado"; exit 1; fi
  echo "OK verificar-restauracion.sql $estado de la migración: $total invariantes «inv.*» con el valor esperado"
done
