#!/usr/bin/env bash
# HERRAMIENTA DE DISEÑO (#45). Ensaya los borradores M3 y M4 en un PostgreSQL LOCAL desechable.
# Nunca se conecta a Supabase. Crea una base nueva, aplica el stub de Supabase, las 3 migraciones
# reales del repositorio, los borradores, las pruebas y una prueba de concurrencia.
#
#   PGHOST=/ruta/al/socket PGPORT=55433 PGUSER=medir scripts/diseno/probar-borradores.sh
set -euo pipefail

dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$dir/../.." && pwd)"
db="diseno_$(date +%s)"
case "${PGHOST:-}" in
  *supabase*|"") echo "ERROR: PGHOST debe apuntar a un PostgreSQL local (socket o localhost)" >&2; exit 1 ;;
esac

psql -q -d postgres -c "create database $db" >/dev/null
run() { psql -q -X -v ON_ERROR_STOP=1 -d "$db" "$@"; }

echo "PostgreSQL: $(psql -X -Atq -d "$db" -c 'show server_version')  ·  base desechable: $db"
run -f "$dir/stub-supabase.sql" >/dev/null
for m in "$repo"/supabase/migrations/*.sql; do run -f "$m" >/dev/null; done
echo "OK migraciones reales aplicadas: $(ls "$repo"/supabase/migrations/*.sql | wc -l)"
run -f "$dir/borradores/M3_job_cargo_items.sql" >/dev/null
run -f "$dir/borradores/M4_guardado_v2.sql" >/dev/null
echo "OK borradores M3 y M4 aplicados"
run -f "$dir/pruebas-borradores.sql" 2>&1 | sed -n 's/^.*NOTICE:  //p'

# Concurrencia: 20 guardados v2 simultáneos de A (2 líneas cada uno) → números únicos y correlativos.
call="begin; set local role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',true); select public.create_job_with_quote_v2(prueba.job(), prueba.quote(), prueba.items(2)); commit;"
antes=$(psql -X -Atq -d "$db" -c "select coalesce(max(number),0) from public.jobs where owner_id='00000000-0000-0000-0000-00000000000a'")
pids=()
for i in $(seq 1 20); do psql -X -q -d "$db" -c "$call" >/dev/null & pids+=($!); done
for p in "${pids[@]}"; do wait "$p"; done
read -r n distintos minimo maximo lineas < <(psql -X -Atq -F ' ' -d "$db" -c "
  select count(*), count(distinct number), min(number), max(number),
         (select count(*) from public.job_cargo_items c where c.job_id = any(array_agg(j.id)))
  from public.jobs j where owner_id='00000000-0000-0000-0000-00000000000a' and number > $antes")
if [[ "$n" == 20 && "$distintos" == 20 && $((maximo - minimo)) == 19 && "$lineas" == 40 ]]; then
  echo "OK T14 concurrencia: 20 guardados simultáneos → N° $minimo…$maximo únicos y correlativos, 40 líneas"
else
  echo "FALLA T14 concurrencia: n=$n distintos=$distintos rango=$minimo..$maximo líneas=$lineas"; exit 1
fi

psql -q -d postgres -c "drop database $db" >/dev/null
echo "Base desechable eliminada. Todas las pruebas de los borradores pasaron."
