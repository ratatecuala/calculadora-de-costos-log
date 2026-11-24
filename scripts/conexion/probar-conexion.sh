#!/usr/bin/env bash
# Comprueba que la conexión segura funciona (A-78, docs/25 paso 1.3): se conecta con
# `service=<PG_SERVICIO>` y muestra solo la versión de PostgreSQL. No lee ni escribe datos.
#   scripts/conexion/probar-conexion.sh
set -euo pipefail
umask 077
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/conexion.sh"
cargar_conexion
command -v psql >/dev/null || _conexion_fallar "falta psql (docs/25 fase 0)"
version="$(pg_seguro psql -w -X -q -A -t -d "$CONEXION" -c 'show server_version')" || _conexion_fallar "no se pudo conectar (el mensaje de arriba está saneado: puedes copiarlo en #52)"
echo "Conexión correcta: PostgreSQL $version (servicio «$PG_SERVICIO»)."
