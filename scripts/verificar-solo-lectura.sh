#!/usr/bin/env bash
# VERIFICACIONES DE SOLO LECTURA de #52 (V1–V17) con la conexión segura (A-78, docs/25 paso 3.1).
# Solo con autorización expresa del propietario para consultar staging.
#
#   scripts/verificar-solo-lectura.sh            → escribe ~/verificacion-52.txt (permisos 600)
#
# Se conecta con `service=<PG_SERVICIO>` (pg_service.conf + pgpass, permisos 600): la contraseña no va
# en la línea de comandos, en variables de entorno ni en la salida. Ejecuta
# scripts/diseno/verificaciones-52/solo-lectura.sql, que abre `begin transaction read only` y termina con
# `rollback`: cualquier escritura falla. El resultado solo trae conteos, máximos y configuración.
set -euo pipefail
umask 077
dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$dir/conexion/conexion.sh"
cargar_conexion
command -v psql >/dev/null || _conexion_fallar "falta psql (docs/25 fase 0)"
salida="${SALIDA:-$HOME/verificacion-52.txt}"
case "$(cd "$(dirname "$salida")" && pwd)/" in "$(cd "$dir/.." && pwd)"/*) _conexion_fallar "la salida no puede quedar dentro del repositorio" ;; esac
pg_seguro psql -w -X -d "$CONEXION" -v ON_ERROR_STOP=1 -f "$dir/diseno/verificaciones-52/solo-lectura.sql" > "$salida" \
  || _conexion_fallar "las verificaciones fallaron (el mensaje de arriba está saneado: puedes copiarlo en #52)"
chmod 600 "$salida"
if grep -qE 'V17.*\bon\b' "$salida"; then v17="on (solo lectura comprobada)"; else v17="NO es «on»: no cuenta como verificación formal; avisa en #52"; fi
echo "Listo: resultado en $salida · V17: $v17"
