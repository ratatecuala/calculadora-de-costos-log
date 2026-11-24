#!/usr/bin/env bash
# A-83 · Ensayo LOCAL de supabase/migrations/20261125130000_precio_entero.sql. Nunca toca Supabase.
#   PGHOST=/ruta/al/socket PGPORT=55433 PGUSER=medir scripts/diseno/precio-entero/ensayar-precio.sh
set -euo pipefail
dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; repo="$(cd "$dir/../../.." && pwd)"
case "${PGHOST:-}" in *,*) echo "ERROR: se requiere un único servidor local" >&2; exit 1 ;; /*|localhost|127.0.0.1|::1) ;; *) echo "ERROR: PGHOST debe ser local" >&2; exit 1 ;; esac
# Impedir que parámetros heredados de libpq desvíen el ensayo fuera del servidor local.
unset PGHOSTADDR PGSERVICE PGSERVICEFILE PGOPTIONS
export LC_ALL=C
mig="$repo/supabase/migrations/20261125130000_precio_entero.sql"
base="precio_$(date +%s)_$$"; creadas=()
limpiar() {
  local codigo=$? b
  trap - EXIT
  for b in "${creadas[@]}"; do
    psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $b" >/dev/null || codigo=1
  done
  exit "$codigo"
}
trap limpiar EXIT
q() { PGOPTIONS='-c client_min_messages=warning' psql -X -q -v ON_ERROR_STOP=1 -d "$db" "$@"; }
preparar() {  # base con todo MENOS esta migración + datos históricos con decimales
  db="$1"; psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "create database $db" >/dev/null; creadas+=("$db")
  q -f "$repo/scripts/diseno/stub-supabase.sql" >/dev/null
  q -c "create table if not exists auth.identities (id uuid primary key, user_id uuid)" >/dev/null
  for m in "$repo"/supabase/migrations/*.sql; do [[ "$m" == "$mig" ]] || q -f "$m" >/dev/null; done
  q >/dev/null <<'SQL'
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'a@prueba.invalid');
-- Histórico anterior a la regla (A-81): precio con decimales, insertado como lo dejó el cliente antiguo.
insert into public.jobs (id, owner_id, number, issued_number, quote_date, client_name, net_price, internal)
values ('d0000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-00000000000a', 1, 1, '2026-11-20', 'Histórico ficticio', 123456.78, '{"engineVersion":"x"}');
insert into public.client_quotes (owner_id, job_id, number, issued_at, client_name, net_price, total)
values ('00000000-0000-0000-0000-00000000000a', 'd0000000-0000-4000-8000-000000000001', 1, '2026-11-20', 'Histórico ficticio', 123456.78, 123456.78);
insert into public.quote_counters (owner_id, last_number) values ('00000000-0000-0000-0000-00000000000a', 1);
SQL
}

fallar() { echo "FALLA: $*" >&2; exit 1; }

comprobar() {
  local nombre="$1" sql="$2" resultado
  resultado="$(q -At -c "$sql")"
  [[ "$resultado" == t ]] || fallar "$nombre"
  echo "OK $nombre"
}

pruebas_rpc() {
  local salida punto
  salida="$(PGOPTIONS='-c client_min_messages=notice' psql -X -qAt -v ON_ERROR_STOP=1 -d "$db" -f "$dir/pruebas-precio.sql" 2>&1)" || fallar "SQL de precios: $salida"
  for punto in E1 E2 E3 E4 E5 E5b E6 E7; do
    [[ "$salida" == *"OK $punto "* ]] || fallar "SQL incompleto: $punto"
  done
  [[ "$salida" == *$'\nPRECIO_SQL_COMPLETO' ]] || fallar "SQL incompleto: fin"
  echo "OK ocho controles SQL de precios"
}

preparar "${base}_t"
q -f "$mig" >/dev/null
# Fingerprint incluye definición, tabla, modo de disparo y permisos de las funciones.
huella() {
  q -At -c "select md5(string_agg(pg_get_triggerdef(t.oid) || t.tgenabled::text ||
    pg_get_functiondef(p.oid) || coalesce(p.proacl::text,''), '|' order by t.tgname))
    from pg_trigger t join pg_proc p on p.oid=t.tgfoid
    where (t.tgrelid,t.tgname) in (('public.jobs'::regclass,'jobs_precio_entero'),
                                   ('public.client_quotes'::regclass,'client_quotes_precio_entero'))
    having count(*)=2"
}
inicial="$(huella)"
[[ -n "$inicial" ]] || fallar "faltan triggers"
q -f "$mig" >/dev/null
actual="$(huella)"
[[ "$actual" == "$inicial" ]] || fallar "idempotencia"
pruebas_rpc
for rol in anon authenticated service_role; do
  comprobar "privilegios $rol" "select not (has_function_privilege('$rol','private.exigir_precio_entero_jobs()','execute')
    or has_function_privilege('$rol','private.exigir_precio_entero_client_quotes()','execute'))"
done

invariantes="$(q -At -F '|' -v referencia=2026-11-25T00:00:00Z -f "$repo/scripts/verificar-restauracion.sql")"
awk -F '[|]' '/^inv\./ { if (NF != 3 || $2 != $3 || vistos[$1]++) error=1; n++ }
  END { exit (error || n != 15) }' <<<"$invariantes" || fallar "invariantes de restauración incompletas o incorrectas"

# Carga privilegiada de dos filas ficticias de un respaldo y lectura posterior en otra sesión.
q >/dev/null <<'SQL'
begin;
set local session_replication_role = replica;
with restaurado as (
  insert into public.jobs (owner_id, number, issued_number, quote_date, client_name, net_price, internal)
  values ('00000000-0000-0000-0000-00000000000a', 50, 50, '2026-11-01', 'Restaurado ficticio', 10.5, '{}')
  returning id, owner_id
)
insert into public.client_quotes (job_id, owner_id, number, issued_at, client_name, net_price, total)
select id, owner_id, 50, '2026-11-01', 'Restaurado ficticio', 10.5, 10.5 from restaurado;
commit;
SQL
comprobar "restauración de ambas filas" "select count(*)=1 from public.jobs j join public.client_quotes q
  on q.job_id=j.id and q.owner_id=j.owner_id where j.number=50 and j.net_price=10.5 and q.net_price=10.5 and q.total=10.5"

q -f "$dir/reversion-precio.sql" >/dev/null
comprobar "reversión de objetos" "select to_regprocedure('private.exigir_precio_entero_jobs()') is null
  and to_regprocedure('private.exigir_precio_entero_client_quotes()') is null
  and not exists (select from pg_trigger where tgname in ('jobs_precio_entero','client_quotes_precio_entero'))"
q >/dev/null <<'SQL'
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',true);
select public.create_job_with_quote('{"quote_date":"2026-11-25","client_name":"Reversión","net_price":1.5,"internal":{}}',
                                    '{"issued_at":"2026-11-25","client_name":"Reversión","net_price":1.5,"total":1.5}');
commit;
SQL
comprobar "reversión funcional" "select count(*)=1 from public.jobs j join public.client_quotes q on q.job_id=j.id
  where j.client_name='Reversión' and j.net_price=1.5 and q.net_price=1.5 and q.total=1.5"
q -f "$mig" >/dev/null
actual="$(huella)"
[[ "$actual" == "$inicial" ]] || fallar "reaplicación de triggers"
pruebas_rpc

preparar "${base}_c"
q >/dev/null <<'SQL'
alter table public.jobs add constraint jobs_precio_entero_chk check (net_price = trunc(net_price)) not valid;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
do $$
declare nombre text;
begin
  begin
    update public.jobs set status='aceptada' where client_name='Histórico ficticio';
    raise exception 'El control CHECK permitió actualizar el histórico';
  exception when check_violation then
    get stacked diagnostics nombre = constraint_name;
    if nombre <> 'jobs_precio_entero_chk' then raise; end if;
  end;
end $$;
SQL
echo "OK control CHECK y ensayo completo"
