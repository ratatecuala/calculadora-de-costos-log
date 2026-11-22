#!/usr/bin/env bash
# HERRAMIENTA DE DISEÑO (#52, docs/23 §11, A-74). Ensaya la migración REAL
#   supabase/migrations/20261122120000_guardado_unico_y_contador.sql
# en un PostgreSQL LOCAL desechable. Nunca se conecta a Supabase ni a staging.
#
#   PGHOST=/ruta/al/socket PGPORT=55433 PGUSER=medir scripts/diseno/ensayo-52/ensayar.sh
#
# Orden:
#   1. stub de Supabase + las migraciones ANTERIORES a la de #52 + privilegios por defecto simulados de
#      Supabase sobre las funciones existentes (service_role);
#   2. fase1.sql: datos ficticios y huecos H1–H4 sobre el estado anterior;
#   3. la migración real (o una copia modificada por CONTROL/MUTACION); L0: históricos y contadores intactos;
#   4. fase2.sql (S0–S7), privilegios.sql (S0c), S8 (concurrencia), pruebas-contador.sql (L1–L9), L10
#      (concurrencia y reintentos), escenarios-extra.sql (X1–X7), X8 y verificaciones de solo lectura (V0);
#   5. S9: la migración aplicada por SEGUNDA vez no falla y deja los mismos privilegios;
#   6. borradores M3/M4 con D-52-3 simulado y pruebas-borradores.sql (T1–T15, T6c y T6d);
#   7. fase R (otra base desechable): migración → datos → reversión → el guardado vuelve a la semántica
#      anterior sin perder datos → reversión otra vez → migración de nuevo;
#   8. scripts/verificar-restauracion.sql antes y después de la migración (probar-restauracion.sh).
#
# Controles negativos (sobre una COPIA de la migración; omiten la comprobación global S0c para observar
# el efecto aislado):
#   CONTROL=C1 → sin revocar el INSERT en jobs ni quitar su política (S1 debe fallar)
#   CONTROL=C2 → sin quitar la política jobs_insert, con el revoke (S1 debe seguir en OK: doble capa)
#   CONTROL=C3 → sin SECURITY DEFINER (el guardado debe fallar)
#   CONTROL=C4 → sin revocar INSERT/DELETE en client_quotes ni quitar su política de DELETE (S2 debe fallar)
#   CONTROL=C5 → sin D-52-3 simulado en M4 (T1 debe fallar: con D-52-2 la v2 INVOKER no llega a private)
#   CONTADOR=actual → sin el bloque N1 de la migración (L1 debe fallar)
# Mutaciones (defectos reintroducidos; NO omiten S0c, deben detectarse):
#   MUTACION=sin_revoke_insert | sin_definer | contador_salta | sin_revoke_service_role | sin_bmas
set -euo pipefail
dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$dir/../../.." && pwd)"
mig="$repo/supabase/migrations/20261122120000_guardado_unico_y_contador.sql"
case "${PGHOST:-}" in
  /*|localhost|127.0.0.1|::1) ;;
  *) echo "ERROR: PGHOST debe ser un socket local (ruta absoluta) o localhost/127.0.0.1/::1" >&2; exit 1 ;;
esac
[[ -f "$mig" ]] || { echo "ERROR: no existe $mig" >&2; exit 1; }
tmp="$(mktemp -d)"
db="ensayo52_$(date +%s)_$$"
dbr="${db}_r"
creadas=()
limpiar() {
  rm -f "$tmp"/*.sql "$tmp"/*.txt; rmdir "$tmp" 2>/dev/null || true
  for b in "${creadas[@]}"; do psql -X -q -d postgres -c "drop database if exists $b" >/dev/null || true; done
}
trap limpiar EXIT
psql -X -q -d postgres -c "create database $db" >/dev/null
creadas+=("$db")
run() { psql -q -X -v ON_ERROR_STOP=1 -d "$db" "$@"; }
filtro() { sed -n 's/^.*NOTICE:  //p; s/^.*ERROR:  /ERROR: /p; /^---/p; /^control/p; /^mutación/p; /^migración/p'; }

# ---- Copia de la migración, con el control o la mutación pedidos ----------------------------------
cp "$mig" "$tmp/mig.sql"
editar() { python3 - "$tmp/mig.sql" "$@" <<'PY'
import sys, re
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
args = sys.argv[2:]
for i in range(0, len(args), 2):
    old, new = args[i], args[i + 1]
    if old.startswith('BLOQUE:'):
        ini, fin = old[7:].split('|')
        a = s.index(ini); b = s.index(fin) + len(fin)
        s = s[:a] + new + s[b:]
    else:
        if s.count(old) != 1: sys.exit(f'editar: no se encontró una sola vez: {old}')
        s = s.replace(old, new)
open(p, 'w', encoding='utf-8').write(s)
PY
}
omitir_s0=0; omitir_s0c=0
case "${CONTROL:-}" in
  '') ;;
  C1) editar "revoke insert on table public.jobs from authenticated;" "-- control C1" "drop policy if exists jobs_insert on public.jobs;" "-- control C1"; omitir_s0c=1 ;;
  C2) editar "drop policy if exists jobs_insert on public.jobs;" "-- control C2"; omitir_s0c=1 ;;
  C3) editar "alter function public.create_job_with_quote(jsonb, jsonb) security definer;" "-- control C3"; omitir_s0=1; omitir_s0c=1 ;;
  C4) editar "revoke insert, delete on table public.client_quotes from authenticated;" "-- control C4" "drop policy if exists client_quotes_delete on public.client_quotes;" "-- control C4"; omitir_s0c=1 ;;
  C5) ;;
  *) echo "CONTROL desconocido: $CONTROL" >&2; exit 2 ;;
esac
if [[ "${CONTADOR:-}" == actual ]]; then editar "BLOQUE:-- [N1:inicio]|-- [N1:fin]" "-- control CONTADOR=actual: sin N1"; fi
case "${MUTACION:-}" in
  '') ;;
  sin_revoke_insert) editar "revoke insert on table public.jobs from authenticated;" "-- mutación" ;;
  sin_definer) editar "alter function public.create_job_with_quote(jsonb, jsonb) security definer;" "-- mutación" ;;
  contador_salta) editar "    return p_preferred; -- importación: se conserva el número libre SIN mover el contador" "    update public.quote_counters set last_number = greatest(v_last, p_preferred) where owner_id = v_uid;
    return p_preferred;" ;;
  sin_revoke_service_role) editar "revoke all on function public.create_job_with_quote(jsonb, jsonb) from public, anon, service_role;" "revoke all on function public.create_job_with_quote(jsonb, jsonb) from public, anon;" "revoke all on function private.allocate_quote_number(integer) from public, anon, authenticated, service_role;" "revoke all on function private.allocate_quote_number(integer) from public, anon, authenticated;" ;;
  sin_bmas) editar "revoke usage on schema private from authenticated;" "-- mutación" ;;
  *) echo "MUTACION desconocida: $MUTACION" >&2; exit 2 ;;
esac

echo "PostgreSQL: $(psql -X -Atq -d "$db" -c 'show server_version')  ·  base desechable: $db${CONTROL:+  ·  control $CONTROL}${CONTADOR:+  ·  contador $CONTADOR}${MUTACION:+  ·  mutación $MUTACION}"

# ---- 1. Estado ANTERIOR a #52 -------------------------------------------------------------------
run -f "$repo/scripts/diseno/stub-supabase.sql" >/dev/null
for m in "$repo"/supabase/migrations/*.sql; do
  [[ "$m" == "$mig" ]] && continue
  run -f "$m" >/dev/null
done
# Privilegios por defecto de Supabase (simulados): al crear una función, Supabase suele dar EXECUTE a
# anon, authenticated y service_role. Las migraciones anteriores revocaron explícitamente a public y anon,
# pero no a service_role: se simula ese resto para comprobar que la migración lo cierra (S0c).
run -c "grant execute on function public.create_job_with_quote(jsonb, jsonb) to service_role;
        grant execute on function private.allocate_quote_number(integer) to service_role;" >/dev/null

# ---- 2. Fase 1: huecos H1–H4 --------------------------------------------------------------------
run -f "$dir/fase1.sql" 2>&1 | filtro

# ---- 3. Migración real + L0 ---------------------------------------------------------------------
huella_jobs="select md5(coalesce(string_agg(j.id::text || ':' || j.number || ':' || j.issued_number || ':' || coalesce(q.number::text, '-') || ':' || coalesce(q.client_name, '-'), ',' order by j.id), '')) from public.jobs j left join public.client_quotes q on q.job_id = j.id"
huella_cont="select md5(coalesce(string_agg(owner_id::text || ':' || last_number, ',' order by owner_id), '')) from public.quote_counters"
run -c "insert into prueba.memo values ('huella_jobs', ($huella_jobs)), ('huella_cont', ($huella_cont))" >/dev/null
run -f "$tmp/mig.sql" >/dev/null
echo "migración real 20261122120000 aplicada${CONTROL:+ (copia con control $CONTROL)}${MUTACION:+ (copia con mutación $MUTACION)}${CONTADOR:+ (sin N1)}"
run -c "do \$\$ begin
  if (select v from prueba.memo where k = 'huella_jobs') <> ($huella_jobs) then raise exception 'FALLA L0: la migración cambió trabajos o documentos existentes'; end if;
  if (select v from prueba.memo where k = 'huella_cont') <> ($huella_cont) then raise exception 'FALLA L0: la migración cambió contadores existentes'; end if;
  raise notice 'OK L0 la migración no cambió trabajos, documentos ni contadores existentes (huellas idénticas)';
end \$\$;" 2>&1 | filtro

# ---- 4. Comprobaciones ---------------------------------------------------------------------------
run -v omitir_s0="$omitir_s0" -f "$dir/fase2.sql" 2>&1 | filtro
if [[ $omitir_s0c == 0 ]]; then run -f "$dir/privilegios.sql" 2>&1 | filtro; else echo "control: comprobación global S0c omitida"; fi

# S8 · 20 guardados simultáneos de C → números únicos y correlativos.
call="begin; set local role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',true); select public.create_job_with_quote(prueba.job(), prueba.quote()); commit;"
antes=$(psql -X -Atq -d "$db" -c "select coalesce(max(number),0) from public.jobs where owner_id='00000000-0000-0000-0000-00000000000c'")
pids=(); for i in $(seq 1 20); do psql -X -q -v ON_ERROR_STOP=1 -d "$db" -c "$call" >/dev/null & pids+=($!); done
f=0; for p in "${pids[@]}"; do wait "$p" || f=$((f + 1)); done
read -r n d mi ma < <(psql -X -Atq -F ' ' -d "$db" -c "select count(*), count(distinct number), min(number), max(number) from public.jobs where owner_id='00000000-0000-0000-0000-00000000000c' and number > $antes")
if [[ $f == 0 && $n == 20 && $d == 20 && $((ma - mi)) == 19 ]]; then echo "OK S8 concurrencia: 20 guardados simultáneos → N° $mi…$ma únicos y correlativos"
else echo "FALLA S8 errores=$f n=$n distintos=$d rango=$mi..$ma"; exit 1; fi

run -f "$dir/pruebas-contador.sql" 2>&1 | filtro

# L10 · concurrencia y reintentos simultáneos (cuenta D, contador en 4).
uid=00000000-0000-0000-0000-00000000000d
llamar() { psql -X -q -v ON_ERROR_STOP=1 -d "$db" -c "begin; set local role authenticated; select set_config('request.jwt.claim.sub','$uid',true); select public.create_job_with_quote($1, prueba.quote()); commit;" >/dev/null; }
pids=()
for i in $(seq 1 20); do llamar "prueba.job()" & pids+=($!); done
for i in 1 2 3 4 5; do llamar "prueba.job('d0000000-0000-4000-8000-0000000002$(printf %02d "$i")', 900000)" & pids+=($!); done
for i in 1 2 3 4 5; do llamar "prueba.job('d0000000-0000-4000-8000-000000000300', 800000)" & pids+=($!); done
f=0; for p in "${pids[@]}"; do wait "$p" || f=$((f + 1)); done
read -r g2 g2p g3 cnt dup rango < <(psql -X -Atq -F ' ' -d "$db" -c "
  select (select count(*) from public.jobs where owner_id = '$uid' and issued_number = 900000),
         (select count(*) from public.jobs where owner_id = '$uid' and number = 900000),
         (select count(*) from public.jobs where owner_id = '$uid' and local_id = 'd0000000-0000-4000-8000-000000000300' and number = 800000),
         (select last_number from public.quote_counters where owner_id = '$uid'),
         (select count(*) - count(distinct number) from public.jobs where owner_id = '$uid'),
         (select count(*) filter (where number between 5 and 28) = 24 and count(*) filter (where number between 29 and 499) = 0 from public.jobs where owner_id = '$uid')")
if [[ $f == 0 && $g2 == 5 && $g2p == 1 && $g3 == 1 && $dup == 0 && $cnt == 28 && $rango == t ]]; then
  echo "OK L10 concurrencia: 20 nuevas + 5 importaciones con el mismo N° + 5 reintentos simultáneos → 0 errores, sin duplicados, 1 copia del reintento, internos 5…28 correlativos, contador $cnt"
else
  echo "FALLA L10 errores=$f g2=$g2 g2_interno=$g2p g3=$g3 contador=$cnt duplicados=$dup rango=$rango"; exit 1
fi

run -f "$dir/escenarios-extra.sql" 2>&1 | filtro

# X8 · borrado e importación concurrentes del mismo número (cuenta H).
uh=00000000-0000-0000-0000-000000000011
run -c "begin; set local role authenticated; select set_config('request.jwt.claim.sub','$uh',true);
        select public.create_job_with_quote(prueba.job('a8000000-0000-4000-8000-000000000001', 7), prueba.quote()); commit;" >/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d "$db" -c "begin; set local role authenticated; select set_config('request.jwt.claim.sub','$uh',true);
        delete from public.jobs where local_id = 'a8000000-0000-4000-8000-000000000001'; select pg_sleep(1); commit;" >/dev/null & p1=$!
sleep 0.3
psql -X -q -v ON_ERROR_STOP=1 -d "$db" -c "begin; set local role authenticated; select set_config('request.jwt.claim.sub','$uh',true);
        select public.create_job_with_quote(prueba.job('a8000000-0000-4000-8000-000000000002', 7), prueba.quote()); commit;" >/dev/null & p2=$!
f=0; wait $p1 || f=$((f + 1)); wait $p2 || f=$((f + 1))
read -r vivos emit7 dup interno < <(psql -X -Atq -F ' ' -d "$db" -c "
  select count(*), count(*) filter (where issued_number = 7), count(*) - count(distinct number),
         coalesce(max(number) filter (where local_id = 'a8000000-0000-4000-8000-000000000002'), -1)
  from public.jobs where owner_id = '$uh'")
if [[ $f == 0 && $emit7 -ge 1 && $dup == 0 && $interno -gt 0 ]]; then
  echo "OK X8 borrado e importación concurrentes del N° 7: 0 errores, sin duplicados; la importación quedó con el emitido 7 e interno $interno ($vivos trabajos vivos de H)"
else
  echo "FALLA X8 errores=$f vivos=$vivos emitido7=$emit7 duplicados=$dup interno=$interno"; exit 1
fi

# V0 · verificaciones de solo lectura (versión psql y versión para el editor) contra esta base.
"$repo/scripts/diseno/verificaciones-52/probar.sh" "$db" > "$tmp/verificaciones.txt" 2>&1 || { cat "$tmp/verificaciones.txt"; echo "FALLA V0: las verificaciones de solo lectura no pasaron"; exit 1; }
grep -E '^(OK|FALLA) V0' "$tmp/verificaciones.txt"
if [[ -n "${VERIFICACIONES:-}" ]]; then psql -X -q -At -F ' | ' -d "$db" -c "$(cat "$repo/scripts/diseno/verificaciones-52/solo-lectura-editor.sql")" > "$VERIFICACIONES"; fi

# ---- 5. S9: la migración aplicada por segunda vez -------------------------------------------------
run -c "insert into prueba.memo values ('huella_jobs_s9', ($huella_jobs)), ('huella_cont_s9', ($huella_cont))
        on conflict (k) do update set v = excluded.v" >/dev/null
if run -f "$tmp/mig.sql" >/dev/null 2>"$tmp/s9.txt"; then
  run -c "do \$\$ begin
    if (select v from prueba.memo where k = 'huella_jobs_s9') <> ($huella_jobs) or (select v from prueba.memo where k = 'huella_cont_s9') <> ($huella_cont)
    then raise exception 'FALLA S9: aplicar de nuevo cambió datos o contadores'; end if;
    raise notice 'OK S9 la migración aplicada por segunda vez no falla ni cambia datos ni contadores';
  end \$\$;" 2>&1 | filtro
  if [[ $omitir_s0c == 0 ]]; then run -f "$dir/privilegios.sql" 2>&1 | filtro | sed 's/^OK S0c/OK S9 (S0c otra vez)/'; fi
else
  cat "$tmp/s9.txt"; echo "FALLA S9: la migración aplicada por segunda vez falló"; exit 1
fi

# ---- 6. Borradores M3/M4 encima de la migración ---------------------------------------------------
run -f "$repo/scripts/diseno/borradores/M3_job_cargo_items.sql" >/dev/null
run -f "$repo/scripts/diseno/borradores/M4_guardado_v2.sql" >/dev/null
if [[ "${CONTROL:-}" != C5 ]]; then
  # D-52-3 (criterio futuro para M4): con D-52-2 la v2 debe ser DEFINER para llegar a private.
  run -c "alter function public.create_job_with_quote_v2(jsonb, jsonb, jsonb) security definer;
          revoke all on function public.create_job_with_quote_v2(jsonb, jsonb, jsonb) from public, anon, service_role;
          grant execute on function public.create_job_with_quote_v2(jsonb, jsonb, jsonb) to authenticated;
          revoke execute on function private.insert_cargo_items(uuid, jsonb) from authenticated;" >/dev/null
  echo "migración: borradores M3/M4 con D-52-3 simulado (la v2 como DEFINER)"
else
  echo "control: M4 sin D-52-3 (la v2 queda INVOKER); T1 debe fallar"
fi
run -c "set client_min_messages = warning; drop schema prueba cascade; delete from auth.users;" >/dev/null
run -f "$repo/scripts/diseno/pruebas-borradores.sql" 2>&1 | filtro

# ---- 7. Fase R: reversión en otra base desechable -------------------------------------------------
psql -X -q -d postgres -c "create database $dbr" >/dev/null
creadas+=("$dbr")
runr() { psql -q -X -v ON_ERROR_STOP=1 -d "$dbr" "$@"; }
runr -f "$repo/scripts/diseno/stub-supabase.sql" >/dev/null
for m in "$repo"/supabase/migrations/*.sql; do runr -f "$m" >/dev/null; done
runr -f "$dir/reversion-r.sql" -v reversion="$dir/reversion-52.sql" -v migracion="$mig" 2>&1 | filtro
# verificar-restauracion.sql antes y después de la migración (sus invariantes dependen de ella).
if [[ -z "${CONTROL:-}${MUTACION:-}${CONTADOR:-}" ]]; then "$dir/probar-restauracion.sh"; fi
echo "Ensayo de #52 terminado. Las bases desechables se eliminan al salir."
