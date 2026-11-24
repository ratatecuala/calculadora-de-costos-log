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
    # Hasta #52 inclusive: las migraciones de I-2 (posteriores) se prueban en scripts/diseno/i2.
    [[ "$(basename "$m")" > "$(basename "$mig")" ]] && continue
    [[ "$estado" == antes && "$m" == "$mig" ]] && continue
    psql -q -X -v ON_ERROR_STOP=1 -d "$db" -f "$m" >/dev/null
  done
  # Datos reales (no una base vacía): una cotización nueva y la importación de un número alto libre (900).
  # Antes de #52 el contador salta a 900; con N1 queda en 1 (< máximo), y la invariante debe aceptarlo.
  psql -q -X -v ON_ERROR_STOP=1 -d "$db" >/dev/null <<'SQL'
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'r@prueba.invalid');
insert into auth.identities (id, user_id) values ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f1');
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
select public.create_job_with_quote(
  '{"quote_date":"2026-11-22","client_name":"Cliente ficticio","net_price":50000,"internal":{"engineVersion":"x"}}'::jsonb,
  '{"issued_at":"2026-11-22","client_name":"Cliente ficticio","net_price":50000,"total":50000}'::jsonb);
select public.create_job_with_quote(
  '{"local_id":"f0000000-0000-4000-8000-000000000001","issued_number":900,"quote_date":"2026-11-22","client_name":"Importada","net_price":50000,"internal":{"engineVersion":"x"}}'::jsonb,
  '{"issued_at":"2026-11-22","client_name":"Importada","net_price":50000,"total":50000}'::jsonb);
commit;
SQL
  contador=$(psql -X -Atq -d "$db" -c "select last_number from public.quote_counters where owner_id = '00000000-0000-0000-0000-0000000000f1'")
  salida=$(psql -X -q -At -F ' | ' -v ON_ERROR_STOP=1 -v referencia=2026-11-24T00:00:00Z -d "$db" -f "$repo/scripts/verificar-restauracion.sql")
  malas=$(echo "$salida" | awk -F ' \\| ' '$1 ~ /^inv\./ && $2 != $3 {print}')
  total=$(echo "$salida" | grep -c '^inv\.')
  if [[ -n "$malas" ]]; then echo "$malas"; echo "FALLA restauración ($estado de la migración): invariantes distintas de lo esperado"; exit 1; fi
  echo "OK verificar-restauracion.sql $estado de la migración: $total invariantes «inv.*» con el valor esperado (con datos: contador $contador tras importar el N° 900)"
done
