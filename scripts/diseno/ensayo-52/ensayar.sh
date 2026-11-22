#!/usr/bin/env bash
# HERRAMIENTA DE DISEÑO (#52, docs/23). Ensaya la PROPUESTA de #52 en un PostgreSQL LOCAL desechable.
# Nunca se conecta a Supabase. No es una migración. Crea una base nueva, aplica el stub de Supabase y
# las 3 migraciones reales, demuestra los huecos (H1–H4), aplica la propuesta y la verifica (S0–S8),
# ensaya el rediseño del contador (L0–L10, docs/23 §10) y por último aplica los borradores M3/M4
# encima y repite sus pruebas con la T6c reescrita.
#
#   PGHOST=/ruta/al/socket PGPORT=55433 PGUSER=medir scripts/diseno/ensayo-52/ensayar.sh
#   BMAS=1     → variante B+ (authenticated sin acceso al esquema private; la v2 de M4 como DEFINER)
#   CONTROL=C1 → control negativo: sin revocar el INSERT ni quitar la política de jobs (S1 debe fallar)
#   CONTROL=C2 → solo el revoke del GRANT, conservando la política (S1 debe seguir en OK)
#   CONTROL=C3 → sin SECURITY DEFINER (el guardado debe fallar)
#   CONTROL=C4 → sin revocar INSERT/DELETE en client_quotes (S2 debe fallar)
#   CONTADOR=actual → control: sin el rediseño del contador (N1), con la función actual (L1 debe fallar)
#   VERIFICACIONES=/ruta/archivo.txt → guarda la salida completa de las verificaciones de solo lectura
# Con el contador propuesto también corre los escenarios X1–X8 (escenarios-extra.sql) y prueba
# scripts/diseno/verificaciones-52/solo-lectura.sql contra la base desechable (docs/23 v3).
set -euo pipefail
dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$dir/../../.." && pwd)"
case "${PGHOST:-}" in
  /*|localhost|127.0.0.1|::1) ;;
  *) echo "ERROR: PGHOST debe ser un socket local (ruta absoluta) o localhost/127.0.0.1/::1" >&2; exit 1 ;;
esac
tmp="$(mktemp -d)"
db="ensayo52_$(date +%s)_$$"
creada=0
limpiar() { rm -f "$tmp"/*.sql "$tmp"/*.txt; rmdir "$tmp" 2>/dev/null || true; if [[ $creada == 1 ]]; then psql -X -q -d postgres -c "drop database if exists $db" >/dev/null || true; fi; }
trap limpiar EXIT
psql -X -q -d postgres -c "create database $db" >/dev/null
creada=1
run() { psql -q -X -v ON_ERROR_STOP=1 -d "$db" "$@"; }
filtro() { sed -n 's/^.*NOTICE:  //p; s/^.*ERROR:  /ERROR: /p; /^---/p; /^variante/p; /^control/p; /^contador/p'; }
cp "$dir/ensayo-52.sql" "$tmp/ensayo.sql"
quitar() { python3 - "$tmp/ensayo.sql" "$@" <<'PY'
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
for o in sys.argv[2:]:
    if s.count(o) != 1: sys.exit(f'control: no se encontró una sola vez: {o}')
    s = s.replace(o, '-- control negativo: quitado\n')
open(p, 'w', encoding='utf-8').write(s)
PY
}
case "${CONTROL:-}" in
  '') ;;
  C1) quitar "revoke insert on table public.jobs from authenticated;" "drop policy jobs_insert on public.jobs;" ;;
  C2) quitar "drop policy jobs_insert on public.jobs;" ;;
  C3) quitar "alter function public.create_job_with_quote(jsonb, jsonb) security definer;"; omitir_s0=1 ;;
  C4) quitar "revoke insert, delete on table public.client_quotes from authenticated;" "drop policy client_quotes_delete on public.client_quotes;" ;;
  *) echo "CONTROL desconocido: $CONTROL" >&2; exit 2 ;;
esac

echo "PostgreSQL: $(psql -X -Atq -d "$db" -c 'show server_version')  ·  base desechable: $db${CONTROL:+  ·  control $CONTROL}${BMAS:+  ·  variante B+}"
run -f "$repo/scripts/diseno/stub-supabase.sql" >/dev/null
for m in "$repo"/supabase/migrations/*.sql; do run -f "$m" >/dev/null; done
run -v bmas="${BMAS:-0}" -v omitir_s0="${omitir_s0:-0}" -f "$tmp/ensayo.sql" 2>&1 | filtro

# S8 · concurrencia con la función DEFINER: 20 guardados simultáneos de C → números únicos y correlativos.
call="begin; set local role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',true); select public.create_job_with_quote(prueba.job(), prueba.quote()); commit;"
antes=$(psql -X -Atq -d "$db" -c "select coalesce(max(number),0) from public.jobs where owner_id='00000000-0000-0000-0000-00000000000c'")
pids=(); for i in $(seq 1 20); do psql -X -q -v ON_ERROR_STOP=1 -d "$db" -c "$call" >/dev/null & pids+=($!); done
f=0; for p in "${pids[@]}"; do wait "$p" || f=$((f + 1)); done
read -r n d mi ma < <(psql -X -Atq -F ' ' -d "$db" -c "select count(*), count(distinct number), min(number), max(number) from public.jobs where owner_id='00000000-0000-0000-0000-00000000000c' and number > $antes")
if [[ $f == 0 && $n == 20 && $d == 20 && $((ma - mi)) == 19 ]]; then echo "OK S8 concurrencia con DEFINER: 20 simultáneos → N° $mi…$ma únicos y correlativos"
else echo "FALLA S8 errores=$f n=$n distintos=$d rango=$mi..$ma"; exit 1; fi

# Rediseño del contador (N1, docs/23 §10): huella de lo existente, función propuesta y pruebas L0–L9.
huella="select md5(coalesce(string_agg(j.id::text || ':' || j.number || ':' || j.issued_number || ':' || coalesce(q.number::text, '-'), ',' order by j.id), '')) from public.jobs j left join public.client_quotes q on q.job_id = j.id"
run -c "insert into prueba.memo values ('huella_antes', ($huella))" >/dev/null
if [[ "${CONTADOR:-propuesto}" == propuesto ]]; then
  run -f "$dir/contador-52.sql" >/dev/null
  echo "contador: rediseño N1 aplicado (docs/23 §10)"
else
  echo "control: contador ACTUAL (sin el rediseño); L1 debe fallar"
fi
run -f "$dir/pruebas-contador.sql" 2>&1 | filtro

# L10 · concurrencia y reintentos simultáneos (cuenta D, contador en 4):
#   G1: 20 cotizaciones nuevas; G2: 5 importaciones distintas con el MISMO número libre 900000;
#   G3: la MISMA importación (mismo local_id, N° 800000) enviada 5 veces a la vez.
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
esperado_cnt=28; [[ "${CONTADOR:-propuesto}" == propuesto ]] || esperado_cnt=900000
if [[ $f == 0 && $g2 == 5 && $g2p == 1 && $g3 == 1 && $dup == 0 && $cnt == "$esperado_cnt" && $rango == t ]]; then
  echo "OK L10 concurrencia: 20 nuevas + 5 importaciones con el mismo N° + 5 reintentos simultáneos → 0 errores, sin duplicados, 1 copia del reintento, internos 5…28 correlativos, contador $cnt"
else
  echo "FALLA L10 errores=$f g2=$g2 g2_interno=$g2p g3=$g3 contador=$cnt duplicados=$dup rango=$rango"; exit 1
fi

if [[ "${CONTADOR:-propuesto}" == propuesto ]]; then
  # Escenarios adicionales (docs/23 v3 §7): X1–X7.
  run -f "$dir/escenarios-extra.sql" 2>&1 | filtro

  # X8 · Borrado e importación concurrentes del mismo número (cuenta H). T1 borra el trabajo con el
  #      interno 7 y espera 1 s antes de confirmar; T2 importa el N° 7 mientras tanto.
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

  # Verificaciones de solo lectura (scripts/diseno/verificaciones-52) contra esta base desechable.
  "$repo/scripts/diseno/verificaciones-52/probar.sh" "$db" > "$tmp/verificaciones.txt" 2>&1 || { cat "$tmp/verificaciones.txt"; echo "FALLA V: las verificaciones de solo lectura no corrieron"; exit 1; }
  grep -E '^OK V0' "$tmp/verificaciones.txt"
  if [[ -n "${VERIFICACIONES:-}" ]]; then cp "$tmp/verificaciones.txt" "$VERIFICACIONES"; fi
fi

# Borradores M3/M4 encima de la propuesta, con la T6c reescrita (t6c-52.sql).
run -f "$repo/scripts/diseno/borradores/M3_job_cargo_items.sql" >/dev/null
run -f "$repo/scripts/diseno/borradores/M4_guardado_v2.sql" >/dev/null
if [[ -n "${BMAS:-}" ]]; then
  run -c "alter function public.create_job_with_quote_v2(jsonb, jsonb, jsonb) security definer;
          revoke execute on function private.insert_cargo_items(uuid, jsonb) from authenticated;
          revoke usage on schema private from authenticated;" >/dev/null
  echo "variante B+: create_job_with_quote_v2 como DEFINER y sin EXECUTE de authenticated sobre private.insert_cargo_items"
fi
run -c "set client_min_messages = warning; drop schema prueba cascade; delete from auth.users;" >/dev/null
awk -v t6c="$dir/t6c-52.sql" '
  /^-- T6c ·/ { while ((getline l < t6c) > 0) print l; salto = 1; next }
  /^-- T15 ·/ { salto = 0 }
  !salto { print }' "$repo/scripts/diseno/pruebas-borradores.sql" > "$tmp/pruebas.sql"
run -f "$tmp/pruebas.sql" 2>&1 | filtro
echo "Ensayo de #52 terminado. La base desechable se elimina al salir."
