#!/usr/bin/env bash
# PREPARACIÓN DE I-2 (A-80): prueba de integración cliente ↔ servidor en un PostgreSQL LOCAL desechable.
# Nunca se conecta a Supabase. No implementa I-2: usa el código ACTUAL del cliente y los BORRADORES M3/M4
# (sin modificarlos) sobre las 4 migraciones reales, incluida la de #52, con D-52-3 simulado (la v2 como
# SECURITY DEFINER), igual que probar-borradores.sh.
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

echo "2) Base local: stub + migraciones reales + borradores M3/M4 (+ D-52-3 simulado)"
psql -X -q -d postgres -c "create database $db" >/dev/null; creada=1
run() { psql -q -X -v ON_ERROR_STOP=1 -d "$db" "$@"; }
run -f "$repo/scripts/diseno/stub-supabase.sql" >/dev/null
for m in "$repo"/supabase/migrations/*.sql; do run -f "$m" >/dev/null; done
run -f "$repo/scripts/diseno/borradores/M3_job_cargo_items.sql" >/dev/null
run -f "$repo/scripts/diseno/borradores/M4_guardado_v2.sql" >/dev/null
# CONTROL_SIN_D523=1: deja M4 tal como está el borrador (SECURITY INVOKER). Con #52, authenticated ya no
# tiene USAGE en private (D-52-2), así que el guardado v2 debe fallar: demuestra que M4 se ajusta a #52.
if [[ "${CONTROL_SIN_D523:-}" != 1 ]]; then
run -c "alter function public.create_job_with_quote_v2(jsonb, jsonb, jsonb) security definer;
        revoke all on function public.create_job_with_quote_v2(jsonb, jsonb, jsonb) from public, anon, service_role;
        grant execute on function public.create_job_with_quote_v2(jsonb, jsonb, jsonb) to authenticated;
        revoke execute on function private.insert_cargo_items(uuid, jsonb) from authenticated;" >/dev/null
fi
run -c "insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'a@prueba.invalid'), ('00000000-0000-0000-0000-00000000000b', 'b@prueba.invalid')" >/dev/null
echo "   $(ls "$repo"/supabase/migrations/*.sql | wc -l) migraciones reales; M3 y M4 desde scripts/diseno/borradores (sin cambios)"

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
