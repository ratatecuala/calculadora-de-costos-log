#!/usr/bin/env bash
# HERRAMIENTA DE DISEÑO (#52). Prueba solo-lectura.sql contra una base LOCAL ya preparada por el ensayo.
# No crea ni borra nada y nunca se conecta a Supabase. La invoca scripts/diseno/ensayo-52/ensayar.sh con
# su base desechable; también se puede llamar a mano: PGHOST=… PGPORT=… PGUSER=… probar.sh <base_local>
set -euo pipefail
case "${PGHOST:-}" in
  /*|localhost|127.0.0.1|::1) ;;
  *) echo "ERROR: PGHOST debe ser un socket local (ruta absoluta) o localhost/127.0.0.1/::1" >&2; exit 1 ;;
esac
db="${1:?falta la base local}"
dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
psql -X -q -v ON_ERROR_STOP=1 -d "$db" -f "$dir/solo-lectura.sql"
# Control: la transacción de solo lectura rechaza una escritura.
if psql -X -q -v ON_ERROR_STOP=1 -d "$db" -c "begin transaction read only; update public.quote_counters set last_number = last_number; rollback;" >/dev/null 2>&1; then
  echo "FALLA V0: una escritura pasó dentro de la transacción de solo lectura"
  exit 1
fi
echo "OK V0 solo-lectura.sql corrió completo y una escritura dentro de «read only» fue rechazada"
