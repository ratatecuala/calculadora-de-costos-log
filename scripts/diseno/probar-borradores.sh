#!/usr/bin/env bash
# HERRAMIENTA DE DISEÑO (#45). Ensaya los borradores M3 y M4 en un PostgreSQL LOCAL desechable.
# Nunca se conecta a Supabase. Crea una base nueva, aplica el stub de Supabase, TODAS las migraciones
# reales del repositorio (incluida la de #52, 20261122120000), los borradores, las pruebas y una
# prueba de concurrencia.
#
#   PGHOST=/ruta/al/socket PGPORT=55433 PGUSER=medir scripts/diseno/probar-borradores.sh
set -euo pipefail

dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$dir/../.." && pwd)"
# Solo un PostgreSQL LOCAL: socket Unix (ruta absoluta) o localhost/127.0.0.1/::1 (P2-2).
case "${PGHOST:-}" in
  /*|localhost|127.0.0.1|::1) ;;
  *) echo "ERROR: PGHOST debe ser un socket local (ruta absoluta) o localhost/127.0.0.1/::1" >&2; exit 1 ;;
esac
db="diseno_$(date +%s)_$$"
creada=0
# Elimina la base desechable al salir, también si una prueba falla o se interrumpe (P2-2).
limpiar() { if [[ $creada == 1 ]]; then psql -X -q -d postgres -c "drop database if exists $db" >/dev/null || true; fi; }
trap limpiar EXIT

psql -X -q -d postgres -c "create database $db" >/dev/null
creada=1
run() { psql -q -X -v ON_ERROR_STOP=1 -d "$db" "$@"; }

echo "PostgreSQL: $(psql -X -Atq -d "$db" -c 'show server_version')  ·  base desechable: $db"
run -f "$dir/stub-supabase.sql" >/dev/null
for m in "$repo"/supabase/migrations/*.sql; do run -f "$m" >/dev/null; done
echo "OK migraciones reales aplicadas: $(ls "$repo"/supabase/migrations/*.sql | wc -l) (incluida la de #52)"
run -f "$dir/borradores/M3_job_cargo_items.sql" >/dev/null
run -f "$dir/borradores/M4_guardado_v2.sql" >/dev/null
# D-52-3 (criterio futuro para M4, docs/23 §4.5): con la migración de #52, authenticated ya no tiene
# USAGE en private (D-52-2), así que la v2 debe ser SECURITY DEFINER para llamar a la función privada.
# Se simula aquí sobre el BORRADOR, sin cambiarlo: es lo que M4 tendrá que adoptar cuando se apruebe.
run -c "alter function public.create_job_with_quote_v2(jsonb, jsonb, jsonb) security definer;
        revoke all on function public.create_job_with_quote_v2(jsonb, jsonb, jsonb) from public, anon, service_role;
        grant execute on function public.create_job_with_quote_v2(jsonb, jsonb, jsonb) to authenticated;
        revoke execute on function private.insert_cargo_items(uuid, jsonb) from authenticated;" >/dev/null
echo "OK borradores M3 y M4 aplicados (con D-52-3 simulado: la v2 como DEFINER)"
# pipefail: si una prueba falla, psql termina con error y el script se detiene.
run -f "$dir/pruebas-borradores.sql" 2>&1 | sed -n 's/^.*NOTICE:  //p; s/^.*ERROR:  /ERROR: /p'
# C3 (fase 0): las mismas fixtures que valida Zod en tests/contratos.cargo.test.ts.
run -v fixtures="$(cat "$repo/tests/fixtures/cargo-items.json")" -f "$dir/pruebas-c3.sql" 2>&1 | sed -n 's/^.*NOTICE:  //p; s/^.*ERROR:  /ERROR: /p'

# Concurrencia: 20 guardados v2 simultáneos de A (2 líneas cada uno) → números únicos y correlativos.
call="begin; set local role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',true); select public.create_job_with_quote_v2(prueba.job(), prueba.quote(), prueba.items(2)); commit;"
# Con N1 (#52) los números nuevos pueden quedar por debajo de un número importado (las importaciones no
# mueven el contador), así que las filas nuevas se identifican por id, no por «número > máximo previo».
psql -X -q -v ON_ERROR_STOP=1 -d "$db" -c "create table prueba_t14_antes as select id, number from public.jobs where owner_id='00000000-0000-0000-0000-00000000000a'" >/dev/null
pids=()
for i in $(seq 1 20); do psql -X -q -v ON_ERROR_STOP=1 -d "$db" -c "$call" >/dev/null & pids+=($!); done
fallidos=0
for p in "${pids[@]}"; do wait "$p" || fallidos=$((fallidos + 1)); done
if [[ $fallidos != 0 ]]; then echo "FALLA T14 concurrencia: $fallidos de 20 llamadas terminaron con error"; exit 1; fi
read -r n distintos minimo maximo ocupados lineas < <(psql -X -Atq -F ' ' -d "$db" -c "
  with nuevas as (select j.id, j.number from public.jobs j
                  where j.owner_id='00000000-0000-0000-0000-00000000000a' and j.id not in (select id from prueba_t14_antes))
  select count(*), count(distinct number), min(number), max(number),
         (select count(*) from prueba_t14_antes a where a.number between (select min(number) from nuevas) and (select max(number) from nuevas)),
         (select count(*) from public.job_cargo_items c where c.job_id in (select id from nuevas))
  from nuevas")
# Correlativos: el rango de las 20 nuevas solo puede tener «huecos» en números que ya estaban ocupados.
if [[ "$n" == 20 && "$distintos" == 20 && $((maximo - minimo + 1)) == $((20 + ocupados)) && "$lineas" == 40 ]]; then
  echo "OK T14 concurrencia: 20 guardados simultáneos → N° $minimo…$maximo únicos y correlativos (saltando $ocupados ocupados), 40 líneas"
else
  echo "FALLA T14 concurrencia: n=$n distintos=$distintos rango=$minimo..$maximo ocupados=$ocupados líneas=$lineas"; exit 1
fi

echo "Todas las pruebas de los borradores pasaron. La base desechable se elimina al salir."
