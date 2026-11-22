#!/usr/bin/env bash
# HERRAMIENTA DE DISEÑO (#52, A-74). Prueba las dos versiones de las verificaciones de solo lectura contra
# una base LOCAL ya preparada por el ensayo. No crea ni borra nada y nunca se conecta a Supabase.
#   V0a  la versión psql (solo-lectura.sql) corre completa dentro de una transacción de solo lectura;
#   V0b  la versión para el editor (solo-lectura-editor.sql) no tiene metaórdenes de psql y corre como
#        UNA sola consulta (psql -c), como se entiende que la envía el editor SQL de Supabase;
#   V0c  paridad: ambas devuelven exactamente las mismas filas;
#   V0d  una escritura dentro de la transacción de solo lectura falla en las dos modalidades.
# La invoca scripts/diseno/ensayo-52/ensayar.sh; también: PGHOST=… PGPORT=… PGUSER=… probar.sh <base_local>
set -euo pipefail
case "${PGHOST:-}" in
  /*|localhost|127.0.0.1|::1) ;;
  *) echo "ERROR: PGHOST debe ser un socket local (ruta absoluta) o localhost/127.0.0.1/::1" >&2; exit 1 ;;
esac
db="${1:?falta la base local}"
dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -f "$tmp"/salida-*.txt; rmdir "$tmp" 2>/dev/null || true' EXIT

# V0a · versión psql (incluye el archivo del editor con \ir).
psql -X -q -At -F ' | ' -v ON_ERROR_STOP=1 -d "$db" -f "$dir/solo-lectura.sql" > "$tmp/salida-psql.txt"
echo "OK V0a solo-lectura.sql (psql) corrió completo: $(wc -l < "$tmp/salida-psql.txt") filas"

# V0b · versión para el editor: SQL puro, enviada como una sola consulta.
if grep -qE '^[[:space:]]*\\' "$dir/solo-lectura-editor.sql"; then
  echo "FALLA V0b: solo-lectura-editor.sql contiene metaórdenes de psql"; exit 1
fi
psql -X -q -At -F ' | ' -v ON_ERROR_STOP=1 -d "$db" -c "$(cat "$dir/solo-lectura-editor.sql")" > "$tmp/salida-editor.txt"
echo "OK V0b solo-lectura-editor.sql (SQL puro, una sola consulta) corrió completo: $(wc -l < "$tmp/salida-editor.txt") filas"

# V0c · paridad exacta.
if ! diff -q "$tmp/salida-psql.txt" "$tmp/salida-editor.txt" >/dev/null; then
  diff "$tmp/salida-psql.txt" "$tmp/salida-editor.txt" | head -20
  echo "FALLA V0c: las dos versiones no devuelven lo mismo"; exit 1
fi
grep -q '^V17 .*"transaction_read_only":"on"' "$tmp/salida-editor.txt" || { echo "FALLA V0c: V17 no confirma el modo solo lectura"; exit 1; }
echo "OK V0c paridad: ambas versiones devuelven las mismas $(wc -l < "$tmp/salida-editor.txt") filas y V17 confirma «read only = on»"

# V0d · una escritura en la misma transacción de solo lectura falla (las dos modalidades).
if psql -X -q -v ON_ERROR_STOP=1 -d "$db" -c "begin transaction read only; update public.quote_counters set last_number = last_number; rollback;" >/dev/null 2>&1; then
  echo "FALLA V0d: una escritura pasó dentro de «begin transaction read only» (psql)"; exit 1
fi
if psql -X -q -v ON_ERROR_STOP=1 -d "$db" -c "set transaction read only; update public.quote_counters set last_number = last_number;" >/dev/null 2>&1; then
  echo "FALLA V0d: una escritura pasó tras «set transaction read only» en una sola consulta (modo editor)"; exit 1
fi
echo "OK V0d una escritura dentro de la transacción de solo lectura falla en las dos modalidades"
