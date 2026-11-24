#!/usr/bin/env bash
# Comprueba que la conexión segura funciona (A-78, docs/25 paso 1.3): se conecta con
# `service=<PG_SERVICIO>` y muestra la versión de PostgreSQL y si la conexión usa TLS. No lee ni escribe
# datos.
#   scripts/conexion/probar-conexion.sh
set -euo pipefail
umask 077
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/conexion.sh"
cargar_conexion
command -v psql >/dev/null || _conexion_fallar "falta psql (docs/25 fase 0)"
# Con sslmode=verify-full, libpq comprueba el certificado y el nombre del servidor ANTES de enviar la
# contraseña: si el servidor no es el de Supabase, la conexión se corta sin entregarla.
fila="$(pg_seguro psql -w -X -q -A -t -F '|' -d "$CONEXION" -c "select current_setting('server_version'), coalesce((select ssl from pg_stat_ssl where pid = pg_backend_pid()), false)")" \
  || _conexion_fallar "no se pudo conectar (el mensaje de arriba está saneado: puedes copiarlo en #52). Si menciona el certificado o el nombre del servidor, NO cambies sslmode: avisa en #52"
version="${fila%%|*}"
if [[ "${fila##*|}" == t ]]; then tls="TLS verificado (verify-full: certificado y nombre del servidor)"; else tls="SIN TLS (solo permitido en la excepción de prueba local)"; fi
echo "Conexión correcta: PostgreSQL $version · $tls (servicio «$PG_SERVICIO»)."
