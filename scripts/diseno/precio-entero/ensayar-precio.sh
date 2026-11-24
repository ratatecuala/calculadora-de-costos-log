#!/usr/bin/env bash
# A-83 · Ensayo LOCAL de supabase/migrations/20261125130000_precio_entero.sql. Nunca toca Supabase.
#   PGHOST=/ruta/al/socket PGPORT=55433 PGUSER=medir scripts/diseno/precio-entero/ensayar-precio.sh
set -euo pipefail
dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; repo="$(cd "$dir/../../.." && pwd)"
case "${PGHOST:-}" in /*|localhost|127.0.0.1|::1) ;; *) echo "ERROR: PGHOST debe ser local" >&2; exit 1 ;; esac
mig="$repo/supabase/migrations/20261125130000_precio_entero.sql"
base="precio_$(date +%s)_$$"; creadas=()
trap 'for b in "${creadas[@]}"; do psql -X -q -d postgres -c "drop database if exists $b" >/dev/null || true; done' EXIT
filtro() { sed -n 's/^.*NOTICE:  //p; s/^.*ERROR:  /ERROR: /p'; }
q() { PGOPTIONS='-c client_min_messages=warning' psql -X -q -v ON_ERROR_STOP=1 -d "$db" "$@"; }
preparar() {  # base con todo MENOS esta migración + datos históricos con decimales
  db="$1"; psql -X -q -d postgres -c "create database $db" >/dev/null; creadas+=("$db")
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

echo "== Trigger (opción elegida)"
preparar "${base}_t"
huella() { q -At -c "select md5(string_agg(x, '|' order by x)) from (select tgname||':'||tgenabled::text x from pg_trigger where not tgisinternal union all select p.proname||':'||coalesce(p.proacl::text,'') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private') s"; }
q -f "$mig" >/dev/null; h1="$(huella)"; q -f "$mig" >/dev/null
[[ "$(huella)" == "$h1" ]] && echo "OK migración idempotente (aplicada dos veces)" || { echo "FALLA idempotencia"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -d "$db" -f "$dir/pruebas-precio.sql" 2>&1 | filtro
# Privilegios: nadie ejecuta las funciones del trigger directamente; invariantes de verificar-restauracion intactas.
for rol in anon authenticated service_role; do
  [[ "$(q -At -c "select has_function_privilege('$rol','private.exigir_precio_entero_jobs()','execute') or has_function_privilege('$rol','private.exigir_precio_entero_client_quotes()','execute')")" == f ]] || { echo "FALLA privilegios $rol"; exit 1; }
done
echo "OK funciones del trigger: sin EXECUTE para anon, authenticated ni service_role"
malas="$(q -At -F ' | ' -v referencia=2026-11-25T00:00:00Z -f "$repo/scripts/verificar-restauracion.sql" | awk -F ' \\| ' '$1 ~ /^inv\./ && $2 != $3')"
[[ -z "$malas" ]] && echo "OK verificar-restauracion.sql: todas las invariantes con el valor esperado" || { echo "$malas"; echo "FALLA invariantes"; exit 1; }
# Restaurar un respaldo: la carga en modo replica no ejecuta triggers, así que los históricos entran.
q -c "begin; set local session_replication_role = replica; insert into public.jobs (owner_id, number, issued_number, quote_date, client_name, net_price, internal) values ('00000000-0000-0000-0000-00000000000a', 50, 50, '2026-11-01', 'Restaurado ficticio', 10.5, '{}'); commit;" >/dev/null \
  && echo "OK carga de respaldo (session_replication_role = replica): un histórico con decimales se restaura"
q -f "$dir/reversion-precio.sql" >/dev/null
q -c "begin; set local role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',true);
      select public.create_job_with_quote('{\"quote_date\":\"2026-11-25\",\"client_name\":\"X\",\"net_price\":1.5,\"internal\":{}}','{\"issued_at\":\"2026-11-25\",\"client_name\":\"X\",\"net_price\":1.5,\"total\":1.5}'); commit;" >/dev/null \
  && echo "OK reversión: quitados triggers y funciones, se vuelve al comportamiento anterior (1,5 aceptado)"
q -f "$mig" >/dev/null && echo "OK reaplicar tras la reversión"

echo "== Control: CHECK … NOT VALID (opción descartada)"
preparar "${base}_c"
q -c "alter table public.jobs add constraint jobs_precio_entero_chk check (net_price = trunc(net_price)) not valid" >/dev/null
if q -c "begin; set local role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',true);
         update public.jobs set status = 'aceptada' where client_name = 'Histórico ficticio'; commit;" >/dev/null 2>&1; then
  echo "FALLA control: el CHECK permitió el UPDATE"; exit 1
else
  echo "OK control: con CHECK NOT VALID, cambiar el ESTADO de una cotización histórica con decimales FALLA (por eso se usan triggers)"
fi
echo "Ensayo terminado. Las bases desechables se eliminan al salir."
