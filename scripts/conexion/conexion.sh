# Biblioteca de CONEXIÓN SEGURA a PostgreSQL para los scripts del propietario (A-78). Se carga con
# `source`; no se ejecuta sola.
#
# Regla: la contraseña NUNCA va en la línea de comandos, en variables de entorno ni en la salida.
#   * pg_service.conf (permisos 600): servidor, puerto, base y usuario, bajo un nombre de servicio.
#   * pgpass          (permisos 600): la contraseña. libpq la lee del archivo; no aparece en ningún
#                                     argumento de proceso.
# TLS (A-79): toda conexión remota exige sslmode=verify-full y sslrootcert con el certificado raíz de
# Supabase (cifrado + identidad del servidor). Se rechazan disable/allow/prefer/require/verify-ca, también
# si se editan los archivos a mano, y cualquier variable PGSSL*/PGGSS*/PGREQUIRESSL que pudiera torcer la
# política. Única excepción: pruebas en un servidor LOCAL (loopback) con
# COTIZADOR_PRUEBA_LOCAL_SIN_TLS=solo-loopback-de-prueba (sanear.py).
# Los dos se crean con `python3 scripts/conexion/configurar-conexion.py` (docs/25, paso 1.3), fuera del
# repositorio, en ~/.config/cotizador. Los programas reciben solo `service=<nombre>` y `-w` (nunca piden
# la contraseña por teclado). Los mensajes de error de psql/pg_dump se muestran SANEADOS (sanear.py):
# sin contraseña, usuario, servidor ni identificador del proyecto.
#
# Variables (opcionales):
#   PG_SERVICIO    nombre del servicio (por defecto cotizador-staging)
#   PGSERVICEFILE  ruta del archivo de servicios (por defecto ~/.config/cotizador/pg_service.conf)
#   PGPASSFILE     ruta del archivo de contraseñas (por defecto ~/.config/cotizador/pgpass)

_conexion_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_conexion_repo="$(cd "$_conexion_dir/../.." && pwd)"

_conexion_fallar() { echo "ERROR: $*" >&2; exit 1; }

# Comprueba que un archivo privado existe, está fuera del repositorio, es del usuario y tiene permisos
# 600 o 400.
_conexion_archivo_privado() {
  local ruta="$1" nombre="$2" abs permisos
  [[ -f "$ruta" ]] || _conexion_fallar "no existe $nombre ($ruta). Créalo con: python3 scripts/conexion/configurar-conexion.py"
  abs="$(cd "$(dirname "$ruta")" && pwd)/$(basename "$ruta")"
  case "$abs" in "$_conexion_repo"/*) _conexion_fallar "$nombre no puede estar dentro del repositorio" ;; esac
  [[ "$(stat -c %u "$ruta")" == "$(id -u)" ]] || _conexion_fallar "$nombre debe ser tuyo (dueño del archivo)"
  permisos="$(stat -c %a "$ruta")"
  [[ "$permisos" == 600 || "$permisos" == 400 ]] || _conexion_fallar "$nombre tiene permisos $permisos: deben ser 600 (chmod 600 \"$ruta\")"
}

# Valida la configuración y deja listos PGSERVICEFILE, PGPASSFILE y CONEXION ("service=<nombre>").
cargar_conexion() {
  # Métodos antiguos o inseguros: se rechazan explícitamente.
  [[ -z "${SUPABASE_DB_URL:-}" && -z "${SUPABASE_DB_URL_FILE:-}" ]] \
    || _conexion_fallar "SUPABASE_DB_URL y SUPABASE_DB_URL_FILE ya no se usan: ponían la contraseña en la línea de comandos. Usa python3 scripts/conexion/configurar-conexion.py (docs/25, paso 1.3)"
  [[ -z "${PGPASSWORD:-}" ]] || _conexion_fallar "no uses la variable PGPASSWORD: la contraseña va solo en el archivo pgpass"
  [[ -z "${DATABASE_URL:-}" ]] || _conexion_fallar "no uses DATABASE_URL: la conexión va en pg_service.conf y pgpass"
  local v
  for v in $(compgen -e); do
    case "$v" in
      PGSSL*|PGGSS*|PGREQUIRESSL|PGSYSCONFDIR)
        _conexion_fallar "no uses la variable $v: la seguridad de la conexión (TLS) se fija solo en pg_service.conf" ;;
    esac
  done

  PG_SERVICIO="${PG_SERVICIO:-cotizador-staging}"
  [[ "$PG_SERVICIO" =~ ^[A-Za-z0-9_-]+$ ]] || _conexion_fallar "PG_SERVICIO solo admite letras, números, - y _"
  export PGSERVICEFILE="${PGSERVICEFILE:-$HOME/.config/cotizador/pg_service.conf}"
  export PGPASSFILE="${PGPASSFILE:-$HOME/.config/cotizador/pgpass}"
  _conexion_archivo_privado "$PGSERVICEFILE" "el archivo de servicios (pg_service.conf)"
  _conexion_archivo_privado "$PGPASSFILE" "el archivo de contraseñas (pgpass)"
  command -v python3 >/dev/null || _conexion_fallar "falta python3"
  python3 -I "$_conexion_dir/sanear.py" --comprobar "$PG_SERVICIO" || exit 1
  # Ningún otro origen de conexión debe colarse por el entorno.
  unset PGSERVICE PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGOPTIONS
  CONEXION="service=$PG_SERVICIO"
}

# Ejecuta un programa de PostgreSQL y muestra sus errores SANEADOS. Conserva el código de salida.
pg_seguro() {
  local err rc=0
  err="$(mktemp "${TMPDIR:-/tmp}/pg-err-XXXXXX")"
  "$@" 2>"$err" || rc=$?
  python3 -I "$_conexion_dir/sanear.py" < "$err" >&2 || true
  rm -f "$err"
  return "$rc"
}
