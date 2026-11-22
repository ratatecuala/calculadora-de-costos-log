#!/usr/bin/env bash
# HERRAMIENTA DE DISEÑO (#52, docs/23). Ensaya la PROPUESTA de #52 en un PostgreSQL LOCAL desechable.
# Nunca se conecta a Supabase. No es una migración. Crea una base nueva, aplica el stub de Supabase y
# las 3 migraciones reales, demuestra los huecos (H1–H3), aplica la propuesta y la verifica (S0–S8),
# y por último aplica los borradores M3/M4 encima y repite sus pruebas con la T6c reescrita.
#
#   PGHOST=/ruta/al/socket PGPORT=55433 PGUSER=medir scripts/diseno/ensayo-52/ensayar.sh
#   BMAS=1     → variante B+ (authenticated sin acceso al esquema private; la v2 de M4 como DEFINER)
#   CONTROL=C1 → control negativo: sin revocar el INSERT ni quitar la política de jobs (S1 debe fallar)
#   CONTROL=C2 → solo el revoke del GRANT, conservando la política (S1 debe seguir en OK)
#   CONTROL=C3 → sin SECURITY DEFINER (el guardado debe fallar)
#   CONTROL=C4 → sin revocar INSERT/DELETE en client_quotes (S2 debe fallar)
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
limpiar() { rm -f "$tmp"/*.sql; rmdir "$tmp" 2>/dev/null || true; if [[ $creada == 1 ]]; then psql -X -q -d postgres -c "drop database if exists $db" >/dev/null || true; fi; }
trap limpiar EXIT
psql -X -q -d postgres -c "create database $db" >/dev/null
creada=1
run() { psql -q -X -v ON_ERROR_STOP=1 -d "$db" "$@"; }
filtro() { sed -n 's/^.*NOTICE:  //p; s/^.*ERROR:  /ERROR: /p; /^---/p; /^variante/p; /^control/p'; }

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

# Borradores M3/M4 encima de la propuesta, con la T6c reescrita (t6c-52.sql).
run -f "$repo/scripts/diseno/borradores/M3_job_cargo_items.sql" >/dev/null
run -f "$repo/scripts/diseno/borradores/M4_guardado_v2.sql" >/dev/null
if [[ -n "${BMAS:-}" ]]; then
  run -c "alter function public.create_job_with_quote_v2(jsonb, jsonb, jsonb) security definer;
          revoke execute on function private.insert_cargo_items(uuid, jsonb) from authenticated;
          revoke usage on schema private from authenticated;" >/dev/null
  echo "variante B+: create_job_with_quote_v2 como DEFINER y sin EXECUTE de authenticated sobre private.insert_cargo_items"
fi
run -c "drop schema prueba cascade; delete from auth.users;" >/dev/null
awk -v t6c="$dir/t6c-52.sql" '
  /^-- T6c ·/ { while ((getline l < t6c) > 0) print l; salto = 1; next }
  /^-- T15 ·/ { salto = 0 }
  !salto { print }' "$repo/scripts/diseno/pruebas-borradores.sql" > "$tmp/pruebas.sql"
run -f "$tmp/pruebas.sql" 2>&1 | filtro
echo "Ensayo de #52 terminado. La base desechable se elimina al salir."
