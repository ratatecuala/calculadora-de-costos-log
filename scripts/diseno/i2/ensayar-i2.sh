#!/usr/bin/env bash
# ENSAYO LOCAL de las migraciones REALES de I-2 (A-81, paso 1 de docs/22 §17.5):
#   supabase/migrations/20261125120000_lineas_de_carga.sql (M3′) y 20261125120100_guardado_v2.sql (M4′).
# Nunca se conecta a Supabase. Base desechable con el stub de Supabase y TODAS las migraciones del repositorio
# (incluida #52, sin modificarla), con los privilegios por defecto de Supabase SIMULADOS para comprobar que
# M3′/M4′ los cierran explícitamente.
#   1. privilegios (P1–P5) e idempotencia (M3′/M4′ aplicadas dos veces);
#   2. T1–T15 de scripts/diseno/pruebas-borradores.sql, ahora contra las migraciones reales (sin simular D-52-3);
#   3. C3: las 27 fixtures compartidas con Zod;
#   4. T14: 20 guardados v2 simultáneos;
#   5. verificar-restauracion.sql: todas las invariantes «inv.*» con el valor esperado en el estado «con I-2»;
#   6. reversión (scripts/diseno/i2/reversion-i2.sql): v1 y datos intactos; reaplicar funciona.
#   PGHOST=/ruta/al/socket PGPORT=55433 PGUSER=medir scripts/diseno/i2/ensayar-i2.sh
set -euo pipefail
dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$dir/../../.." && pwd)"
case "${PGHOST:-}" in
  /*|localhost|127.0.0.1|::1) ;;
  *) echo "ERROR: PGHOST debe ser un socket local (ruta absoluta) o localhost/127.0.0.1/::1" >&2; exit 1 ;;
esac
m3="$repo/supabase/migrations/20261125120000_lineas_de_carga.sql"
m4="$repo/supabase/migrations/20261125120100_guardado_v2.sql"
base="i2_$(date +%s)_$$"
creadas=()
trap 'for b in "${creadas[@]}"; do psql -X -q -d postgres -c "drop database if exists $b" >/dev/null || true; done' EXIT
filtro() { sed -n 's/^.*NOTICE:  //p; s/^.*ERROR:  /ERROR: /p'; }
nueva() {  # nueva <db>: stub + privilegios por defecto de Supabase simulados + todas las migraciones
  psql -X -q -d postgres -c "create database $1" >/dev/null; creadas+=("$1")
  psql -q -X -v ON_ERROR_STOP=1 -d "$1" -f "$repo/scripts/diseno/stub-supabase.sql" >/dev/null
  # El stub no trae auth.identities; verificar-restauracion.sql la cuenta.
  psql -q -X -v ON_ERROR_STOP=1 -d "$1" -c "create table if not exists auth.identities (id uuid primary key, user_id uuid)" >/dev/null
  psql -q -X -v ON_ERROR_STOP=1 -d "$1" -c "
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema private grant all on functions to anon, authenticated, service_role;" >/dev/null 2>&1 || true
  for m in "$repo"/supabase/migrations/*.sql; do PGOPTIONS='-c client_min_messages=warning' psql -q -X -v ON_ERROR_STOP=1 -d "$1" -f "$m" >/dev/null; done
}
db="${base}_a"
run() { psql -q -X -v ON_ERROR_STOP=1 -d "$db" "$@"; }

echo "PostgreSQL: $(psql -X -Atq -d postgres -c 'show server_version')"
nueva "$db"
echo "OK migraciones reales aplicadas: $(ls "$repo"/supabase/migrations/*.sql | wc -l) (incluidas #52 sin cambios, M3′ y M4′), con privilegios por defecto de Supabase simulados"
huella() { run -At -c "select md5(string_agg(x, '|' order by x)) from (
  select n.nspname||'.'||p.proname||':'||p.prosecdef||':'||coalesce(p.proacl::text,'') x from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')
  union all select table_name||':'||grantee||':'||privilege_type from information_schema.role_table_grants where table_schema='public'
  union all select tablename||':'||policyname from pg_policies where schemaname='public') s"; }
antes="$(huella)"
run -f "$m3" >/dev/null 2>&1; run -f "$m4" >/dev/null 2>&1
[[ "$(huella)" == "$antes" ]] && echo "OK M3′ y M4′ idempotentes: aplicadas dos veces, mismos privilegios, políticas y funciones" || { echo "FALLA idempotencia"; exit 1; }

run -f "$dir/privilegios-i2.sql" 2>&1 | filtro
run -f "$repo/scripts/diseno/pruebas-borradores.sql" 2>&1 | filtro | sed 's/^OK /OK (real) /'
run -v fixtures="$(cat "$repo/tests/fixtures/cargo-items.json")" -f "$repo/scripts/diseno/pruebas-c3.sql" 2>&1 | filtro | sed 's/^OK /OK (real) /'

# T14: 20 guardados v2 simultáneos de A (2 líneas cada uno) → números únicos; 40 líneas.
call="begin; set local role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',true); select public.create_job_with_quote_v2(prueba.job(), prueba.quote(), prueba.items(2)); commit;"
run -c "create table prueba.t14_antes as select id from public.jobs where owner_id='00000000-0000-0000-0000-00000000000a'" >/dev/null
pids=(); for i in $(seq 1 20); do psql -X -q -v ON_ERROR_STOP=1 -d "$db" -c "$call" >/dev/null & pids+=($!); done
fallidos=0; for p in "${pids[@]}"; do wait "$p" || fallidos=$((fallidos + 1)); done
read -r n distintos lineas < <(psql -X -Atq -F ' ' -d "$db" -c "
  select count(*), count(distinct number), (select count(*) from public.job_cargo_items c where c.job_id in (select id from public.jobs j2 where j2.owner_id='00000000-0000-0000-0000-00000000000a' and j2.id not in (select id from prueba.t14_antes)))
  from public.jobs where owner_id='00000000-0000-0000-0000-00000000000a' and id not in (select id from prueba.t14_antes)")
[[ $fallidos == 0 && $n == 20 && $distintos == 20 && $lineas == 40 ]] && echo "OK (real) T14 concurrencia: 20 guardados v2 simultáneos, 20 números distintos, 40 líneas" || { echo "FALLA T14: fallidos=$fallidos n=$n distintos=$distintos líneas=$lineas"; exit 1; }

# verificar-restauracion.sql en el estado «con I-2», con datos.
salida="$(run -At -F ' | ' -v referencia=2026-11-25T00:00:00Z -f "$repo/scripts/verificar-restauracion.sql")"
malas="$(awk -F ' \\| ' '$1 ~ /^inv\./ && $2 != $3 {print}' <<<"$salida")"
[[ -z "$malas" ]] && grep -q '^contenido.public.job_cargo_items | ' <<<"$salida" \
  && echo "OK verificar-restauracion.sql con I-2: $(grep -c '^inv\.' <<<"$salida") invariantes con el valor esperado; incluye conteo y contenido de job_cargo_items" \
  || { echo "$malas"; echo "FALLA verificar-restauracion.sql con I-2"; exit 1; }

# Reversión en otra base: datos y v1 intactos; reaplicar funciona.
db="${base}_r"
nueva "$db"
run -c "insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a','a@prueba.invalid')" >/dev/null
guardar() { run -At -c "begin; set local role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',true);
  select $1('{\"quote_date\":\"2026-11-25\",\"client_name\":\"Cliente ficticio\",\"net_price\":50000,\"internal\":{\"engineVersion\":\"x\"}}'::jsonb,
            '{\"issued_at\":\"2026-11-25\",\"client_name\":\"Cliente ficticio\",\"net_price\":50000,\"total\":50000}'::jsonb $2) ->> 'number'; commit;" | grep -E '^[0-9]+$'; }
guardar public.create_job_with_quote_v2 ", '[{\"kind\":\"cajas\",\"description\":\"Caja\",\"qty\":1}]'::jsonb" >/dev/null
run -f "$dir/reversion-i2.sql" >/dev/null
quedan="$(run -At -c "select count(*) from public.jobs")"; tabla="$(run -At -c "select to_regclass('public.job_cargo_items') is null")"
n1="$(guardar public.create_job_with_quote "")"
run -f "$m3" >/dev/null 2>&1; run -f "$m4" >/dev/null 2>&1
n2="$(guardar public.create_job_with_quote_v2 ", '[]'::jsonb")"
[[ $quedan == 1 && $tabla == t && $n1 == 2 && $n2 == 3 ]] \
  && echo "OK reversión: quita la tabla y las funciones de I-2, el trabajo guardado queda, la v1 sigue numerando (N° $n1) y reaplicar M3′/M4′ funciona (N° $n2)" \
  || { echo "FALLA reversión: quedan=$quedan tabla_quitada=$tabla n1=$n1 n2=$n2"; exit 1; }
echo "Ensayo de I-2 terminado. Las bases desechables se eliminan al salir."
