#!/usr/bin/env bash
# Respaldo de la base de Supabase (plan gratuito: no hay respaldos descargables).
# Procedimiento completo, restauración y verificación: docs/17-supabase-seguridad-respaldo.md §5 (ensayo en §6).
#
# Se ejecuta en la máquina del PROPIETARIO. No contiene secretos: la cadena de conexión se lee de
# un archivo fuera del repositorio (permisos 600) y el respaldo se escribe fuera del repositorio,
# cifrado.
#
#   SUPABASE_DB_URL_FILE=$HOME/.config/cotizador/db-url \
#   BACKUP_DIR=$HOME/respaldos-cotizador \
#   BACKUP_AGE_RECIPIENT=age1...            # clave PÚBLICA de age (o BACKUP_GPG_SIMETRICO=1)
#   scripts/respaldo-supabase.sh [cli|pgdump]
#
# Modos:
#   cli    (recomendado, comandos oficiales de Supabase) `supabase db dump`: roles, esquema y datos.
#          Requiere la CLI de Supabase y Docker. No ensayado en el contenedor de Claude (sin Docker).
#   pgdump `pg_dump` directo, acotado a lo de esta app: esquemas public y private, y los datos de
#          auth.users y auth.identities. Requiere pg_dump de versión MAYOR O IGUAL a la del servidor
#          (Supabase usa Postgres 17). Ensayado localmente el 18-11-2026 (docs/17 §6).
#
# Variables opcionales:
#   BACKUP_SIN_CIFRAR=1   solo para ensayos con datos ficticios: deja los .sql sin cifrar.
#   BACKUP_CONSERVAR=N    avisa (no borra) si hay más de N respaldos cifrados en BACKUP_DIR.
set -euo pipefail
umask 077

modo="${1:-cli}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "$script_dir/.." && pwd)"

fallar() { echo "ERROR: $*" >&2; exit 1; }
[[ "$modo" == "cli" || "$modo" == "pgdump" ]] || fallar "modo desconocido: $modo (usa cli o pgdump)"

# --- Cadena de conexión: nunca en el repositorio ni en la salida -------------------------------
if [[ -n "${SUPABASE_DB_URL_FILE:-}" ]]; then
  [[ -f "$SUPABASE_DB_URL_FILE" ]] || fallar "no existe SUPABASE_DB_URL_FILE"
  case "$(cd "$(dirname "$SUPABASE_DB_URL_FILE")" && pwd)/" in
    "$repo_dir"/*) fallar "el archivo con la cadena de conexión no puede estar dentro del repositorio" ;;
  esac
  db_url="$(head -n 1 "$SUPABASE_DB_URL_FILE")"
elif [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  db_url="$SUPABASE_DB_URL"
else
  fallar "falta SUPABASE_DB_URL_FILE (recomendado) o SUPABASE_DB_URL"
fi
[[ "$db_url" == postgres://* || "$db_url" == postgresql://* ]] || fallar "la cadena de conexión no parece de Postgres"

# --- Carpeta de destino: fuera del repositorio -------------------------------------------------
[[ -n "${BACKUP_DIR:-}" ]] || fallar "falta BACKUP_DIR (carpeta fuera del repositorio)"
[[ -d "$BACKUP_DIR" ]] || fallar "BACKUP_DIR no existe: créala antes (fuera del repositorio, idealmente cifrada)"
backup_dir="$(cd "$BACKUP_DIR" && pwd)"
case "$backup_dir/" in
  "$repo_dir"/*) fallar "BACKUP_DIR no puede estar dentro del repositorio" ;;
esac

# --- Cifrado: obligatorio salvo ensayo explícito -----------------------------------------------
if [[ -n "${BACKUP_AGE_RECIPIENT:-}" ]]; then
  command -v age >/dev/null || fallar "falta el programa age"
  cifrado="age"
elif [[ "${BACKUP_GPG_SIMETRICO:-}" == "1" ]]; then
  command -v gpg >/dev/null || fallar "falta el programa gpg"
  cifrado="gpg"
elif [[ "${BACKUP_SIN_CIFRAR:-}" == "1" ]]; then
  cifrado="ninguno"
  echo "AVISO: respaldo SIN CIFRAR (solo para ensayos con datos ficticios)." >&2
else
  fallar "define BACKUP_AGE_RECIPIENT o BACKUP_GPG_SIMETRICO=1 (el respaldo contiene datos personales)"
fi

sello="$(date -u +%Y%m%dT%H%M%SZ)"
trabajo="$backup_dir/respaldo-$sello"
mkdir "$trabajo"
limpiar() {
  # Si algo falla, no deja copias a medio hacer (ni sin cifrar).
  if [[ -d "$trabajo" ]]; then rm -rf "$trabajo"; fi
}
trap limpiar EXIT

command -v psql >/dev/null || fallar "falta psql"
version_servidor="$(psql "$db_url" -X -A -t -c 'show server_version_num')"
mayor_servidor=$(( version_servidor / 10000 ))

case "$modo" in
  cli)
    command -v supabase >/dev/null || fallar "falta la CLI de Supabase (o usa el modo pgdump)"
    supabase db dump --db-url "$db_url" -f "$trabajo/roles.sql" --role-only
    supabase db dump --db-url "$db_url" -f "$trabajo/schema.sql"
    supabase db dump --db-url "$db_url" -f "$trabajo/data.sql" --use-copy --data-only \
      -x "storage.buckets_vectors" -x "storage.vector_indexes"
    ;;
  pgdump)
    command -v pg_dump >/dev/null || fallar "falta pg_dump"
    mayor_cliente="$(pg_dump --version | sed -E 's/[^0-9]*([0-9]+).*/\1/')"
    (( mayor_cliente >= mayor_servidor )) || fallar "pg_dump $mayor_cliente es menor que el servidor ($mayor_servidor): instala pg_dump $mayor_servidor o superior"
    # Esta app no crea roles propios (verificado el 18-11-2026): no se respaldan roles.
    printf -- '-- Modo pgdump: el proyecto no tiene roles propios (docs/17 §2).\n' > "$trabajo/roles.sql"
    pg_dump "$db_url" --schema-only --schema=public --schema=private --no-subscriptions --no-publications \
      -f "$trabajo/schema.sql"
    # Con -t, pg_dump ignora -n: se listan las tablas explícitamente.
    pg_dump "$db_url" --data-only --table='public.*' --table='private.*' \
      --table=auth.users --table=auth.identities -f "$trabajo/data.sql"
    ;;
esac

suma() { if command -v sha256sum >/dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }

# --- Manifiesto: versiones, sumas y verificación del ORIGEN (sin datos personales) -------------
psql "$db_url" -X -A -t -F ' | ' -v ON_ERROR_STOP=1 -f "$script_dir/verificar-restauracion.sql" > "$trabajo/verificacion-origen.txt"
{
  echo "fecha_utc: $sello"
  echo "modo: $modo"
  echo "postgres_servidor: $version_servidor"
  echo "pg_dump: $(pg_dump --version 2>/dev/null || echo 'n/d')"
  echo "cifrado: $cifrado"
  (cd "$trabajo" && suma roles.sql schema.sql data.sql verificacion-origen.txt)
} > "$trabajo/manifiesto.txt"
echo "Conteos del origen (sin datos personales):"
grep -E '^conteo\.' "$trabajo/verificacion-origen.txt"

# --- Empaquetar y cifrar ------------------------------------------------------------------------
case "$cifrado" in
  age)
    tar -C "$backup_dir" -cf - "respaldo-$sello" | age -r "$BACKUP_AGE_RECIPIENT" -o "$backup_dir/respaldo-$sello.tar.age"
    salida="$backup_dir/respaldo-$sello.tar.age"
    ;;
  gpg)
    tar -C "$backup_dir" -cf - "respaldo-$sello" | gpg --symmetric --cipher-algo AES256 -o "$backup_dir/respaldo-$sello.tar.gpg"
    salida="$backup_dir/respaldo-$sello.tar.gpg"
    ;;
  ninguno)
    salida="$trabajo"
    ;;
esac
trap - EXIT
if [[ "$cifrado" != "ninguno" ]]; then rm -rf "$trabajo"; fi

echo "Respaldo listo: $salida"

if [[ -n "${BACKUP_CONSERVAR:-}" ]]; then
  total=$(find "$backup_dir" -maxdepth 1 -name 'respaldo-*.tar.*' | wc -l)
  if (( total > BACKUP_CONSERVAR )); then
    echo "AVISO: hay $total respaldos cifrados; la política conserva $BACKUP_CONSERVAR. Revisa y borra los más antiguos a mano." >&2
  fi
fi
