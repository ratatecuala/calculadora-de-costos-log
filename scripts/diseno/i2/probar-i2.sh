#!/usr/bin/env bash
# PREPARACIÓN DE I-2 (A-80): prueba de integración cliente ↔ servidor en un PostgreSQL LOCAL desechable.
# Nunca se conecta a Supabase. Usa el código del cliente y las migraciones REALES del repositorio: las 4
# anteriores (incluida #52, sin cambios) y las de I-2, M3′ (20261125120000) y M4′ (20261125120100), A-81.
#   1. generar-casos.ts arma 7 cotizaciones con QuoteSession → buildJobRecord → toCloudPayload;
#   2. las guarda con create_job_with_quote_v2 como `authenticated` (cada una en su transacción);
#   3. exporta lo guardado y verificar-lectura.ts lo lee con el código del cliente (jobFromRow,
#      readSnapshot, clientQuoteFromRow) y comprueba el viaje de ida y vuelta, campo por campo.
#
#   PGHOST=/ruta/al/socket PGPORT=55433 PGUSER=medir scripts/diseno/i2/probar-i2.sh
set -euo pipefail
dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$dir/../../.." && pwd)"
case "${PGHOST:-}" in
  /*|localhost|127.0.0.1|::1) ;;
  *) echo "ERROR: PGHOST debe ser un socket local (ruta absoluta) o localhost/127.0.0.1/::1" >&2; exit 1 ;;
esac
t="$(mktemp -d "${TMPDIR:-/tmp}/prueba-i2-XXXXXX")"
db="i2_$(date +%s)_$$"
creada=0
fin() { if [[ $creada == 1 ]]; then psql -X -q -d postgres -c "drop database if exists $db" >/dev/null || true; fi; rm -rf "$t"; }
trap fin EXIT

echo "1) Casos armados con el código real del cliente"
(cd "$repo" && npx vite-node "$dir/generar-casos.ts" "$t")

echo "2) Base local: stub + TODAS las migraciones reales (#52 sin cambios, M3′ y M4′)"
psql -X -q -d postgres -c "create database $db" >/dev/null; creada=1
run() { psql -q -X -v ON_ERROR_STOP=1 -d "$db" "$@"; }
run -f "$repo/scripts/diseno/stub-supabase.sql" >/dev/null
for m in "$repo"/supabase/migrations/*.sql; do PGOPTIONS='-c client_min_messages=warning' run -f "$m" >/dev/null; done
# CONTROL_M4_INVOKER=1: M4′ como estaba el borrador (SECURITY INVOKER). Con #52, authenticated no tiene
# USAGE en private (D-52-2): el guardado v2 debe fallar. Demuestra por qué M4′ es SECURITY DEFINER.
if [[ "${CONTROL_M4_INVOKER:-}" == 1 ]]; then run -c "alter function public.create_job_with_quote_v2(jsonb, jsonb, jsonb) security invoker" >/dev/null; fi
run -c "insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'a@prueba.invalid'), ('00000000-0000-0000-0000-00000000000b', 'b@prueba.invalid')" >/dev/null
echo "   $(ls "$repo"/supabase/migrations/*.sql | wc -l) migraciones reales aplicadas"

echo "3) Guardado como authenticated (create_job_with_quote_v2)"
if ! run -f "$t/casos.sql" > "$t/guardado.log" 2>&1; then
  echo "   el guardado falló: $(grep -m1 -o 'ERROR: .*' "$t/guardado.log")"
  exit 3
fi

echo "4) Exportar lo guardado y verificarlo con el código del cliente"
psql -X -q -At -v ON_ERROR_STOP=1 -d "$db" > "$t/filas.json" <<'SQL'
select coalesce(json_agg(json_build_object(
  'caso', r.caso, 'intento', r.intento, 'resultado', r.resultado,
  'job', to_jsonb(j), 'quote', to_jsonb(q), 'internalBytes', pg_column_size(j.internal::text::jsonb),  -- sin comprimir: lo que evalúa el CHECK
  'items', (select coalesce(json_agg(to_jsonb(c) order by c.position), '[]'::json) from public.job_cargo_items c where c.job_id = j.id),
  'lineasDelTrabajo', (select count(*) from public.job_cargo_items c where c.job_id = j.id)
) order by r.caso, r.intento), '[]'::json)
from prueba_i2.resultados r
left join public.jobs j on j.id = (r.resultado ->> 'id')::uuid
left join public.client_quotes q on q.job_id = j.id;
SQL
(cd "$repo" && npx vite-node "$dir/verificar-lectura.ts" "$t/casos.json" "$t/filas.json")
