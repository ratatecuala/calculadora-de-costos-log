#!/usr/bin/env bash
# A-88 · Ensayo LOCAL del snapshot v3 contra las migraciones REALES del repositorio. Nunca toca Supabase.
#   MIGRACIONES=staging → solo las 3 del 18-11 (lo que tiene hoy staging, según docs/25 §1.1);
#   MIGRACIONES=todas   → las 7 (con #52, I-2 y precio entero, aún sin aplicar en staging).
# Comprueba, para cada caso armado con el código del cliente (generar-v3.ts):
#   1. `create_job_with_quote` (sin migración nueva) guarda la v3 como `authenticated`;
#   2. `jobs.internal` queda IDÉNTICO a lo que envió el cliente (igualdad jsonb);
#   3. `pg_column_size` del jsonb sin comprimir (lo que evalúa el CHECK) ≤ 16384, también en la v3 máxima,
#      y textos con caracteres de 3 y 4 bytes sin pérdida (la v3 de 3 bytes sobre el tope la rechaza el cliente);
#   4. `client_quotes` no contiene nada de `economia` ni de la procedencia;
#   5. control negativo: un `internal` de más de 16 KB sigue rechazado por el CHECK existente.
#
#   PGHOST=/ruta/al/socket PGPORT=55433 PGUSER=postgres MIGRACIONES=todas scripts/diseno/v3/ensayar-v3.sh
set -euo pipefail
dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$dir/../../.." && pwd)"
case "${PGHOST:-}" in
  /*|localhost|127.0.0.1|::1) ;;
  *) echo "ERROR: PGHOST debe ser un socket local (ruta absoluta) o localhost/127.0.0.1/::1" >&2; exit 1 ;;
esac
modo="${MIGRACIONES:-todas}"
case "$modo" in staging|todas) ;; *) echo "ERROR: MIGRACIONES debe ser staging o todas" >&2; exit 1 ;; esac
t="$(mktemp -d "${TMPDIR:-/tmp}/ensayo-v3-XXXXXX")"
db="v3_$(date +%s)_$$"
creada=0
fin() { if [[ $creada == 1 ]]; then psql -X -q -d postgres -c "drop database if exists $db" >/dev/null || true; fi; rm -rf "$t"; }
trap fin EXIT

echo "1) Casos armados con el código real del cliente"
(cd "$repo" && npx vite-node "$dir/generar-v3.ts" "$t")

echo "2) Base local: stub + migraciones reales ($modo)"
psql -X -q -d postgres -c "create database $db" >/dev/null; creada=1
run() { psql -q -X -v ON_ERROR_STOP=1 -d "$db" "$@"; }
run -f "$repo/scripts/diseno/stub-supabase.sql" >/dev/null
if [[ "$modo" == staging ]]; then
  migs=("$repo"/supabase/migrations/20261118*.sql)
else
  migs=("$repo"/supabase/migrations/*.sql)
fi
for m in "${migs[@]}"; do PGOPTIONS='-c client_min_messages=warning' run -f "$m" >/dev/null; done
echo "   ${#migs[@]} migraciones aplicadas"
run -c "insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'a@prueba.invalid')" >/dev/null

echo "3) Guardado como authenticated (create_job_with_quote)"
run -f "$t/casos.sql" > "$t/guardado.log" 2>&1 || { echo "   el guardado falló: $(grep -m1 -o 'ERROR: .*' "$t/guardado.log")"; exit 3; }

echo "4) Comprobaciones en la base"
fallas=0
check() { if [[ "$2" == "$3" ]]; then echo "   OK  $1"; else echo "   FALLA $1 (obtenido: $2, esperado: $3)"; fallas=$((fallas + 1)); fi; }
q() { psql -X -q -At -v ON_ERROR_STOP=1 -d "$db" -c "$1"; }
casos="$(q "select count(*) from prueba_v3.esperado")"
check "todos los casos se guardaron" "$(q "select count(*) from prueba_v3.resultados r join public.jobs j on j.id = (r.resultado ->> 'id')::uuid")" "$casos"
check "internal idéntico a lo enviado (jsonb)" "$(q "select count(*) from prueba_v3.esperado e join prueba_v3.resultados r using (caso) join public.jobs j on j.id = (r.resultado ->> 'id')::uuid where j.internal = e.internal")" "$casos"
check "schemaVersion 3 en todos" "$(q "select count(*) from public.jobs where internal ->> 'schemaVersion' = '3'")" "$casos"
check "pg_column_size ≤ 16384 en todos" "$(q "select count(*) from public.jobs where pg_column_size(internal::text::jsonb) <= 16384")" "$casos"
check "nombre con 3 y 4 bytes idéntico, carácter por carácter" "$(q "select count(*) from public.jobs where internal -> 'vehicle' ->> 'name' = 'Furgón €漢字 😀🚚' || repeat('€', 21)")" "1"
check "client_quotes sin economía ni procedencia" "$(q "select count(*) from public.client_quotes q where to_jsonb(q)::text ~ '(economia|procedencia|parametros|partidas)'")" "0"
echo "   tamaños (bytes del cliente → pg_column_size sin comprimir):"
q "select '     ' || e.caso || ': ' || e.bytes_cliente || ' → ' || pg_column_size(j.internal::text::jsonb) from prueba_v3.esperado e join prueba_v3.resultados r using (caso) join public.jobs j on j.id = (r.resultado ->> 'id')::uuid order by e.caso"

echo "5) Control negativo: internal de más de 16 KB"
if run -c "update public.jobs set internal = internal || jsonb_build_object('relleno', repeat('x', 20000)) where internal ->> 'schemaVersion' = '3'" >"$t/neg.log" 2>&1; then
  echo "   FALLA: se aceptó un internal de más de 16 KB"; fallas=$((fallas + 1))
elif grep -q 'violates check constraint' "$t/neg.log"; then
  echo "   OK  rechazado por el CHECK de jobs.internal"
else
  echo "   FALLA: error inesperado: $(grep -m1 -o 'ERROR: .*' "$t/neg.log")"; fallas=$((fallas + 1))
fi

if [[ $fallas -gt 0 ]]; then echo "RESULTADO ($modo): $fallas falla(s)"; exit 1; fi
echo "RESULTADO ($modo): todo OK"
