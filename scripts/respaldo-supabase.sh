#!/usr/bin/env bash
# Respaldo de la base de Supabase (plan gratuito: no hay respaldos descargables).
# Procedimiento completo, restauración y verificación: docs/17-supabase-seguridad-respaldo.md §5 (ensayo en §6).
#
# Se ejecuta en la máquina del PROPIETARIO (Windows 11: dentro de Ubuntu en WSL, docs/25). No
# contiene secretos y el respaldo se escribe fuera del repositorio, cifrado.
#
# CONEXIÓN SEGURA (A-78): la contraseña NO va en la línea de comandos ni en variables de entorno.
# Se usan pg_service.conf y pgpass (permisos 600, fuera del repositorio), creados con
# `python3 scripts/conexion/configurar-conexion.py`. psql y pg_dump reciben solo `service=<nombre>`
# y `-w`; sus mensajes de error se muestran saneados (scripts/conexion/conexion.sh).
#
#   BACKUP_DIR=$HOME/respaldos-cotizador \
#   BACKUP_AGE_RECIPIENT=age1...            # clave PÚBLICA de age (o BACKUP_GPG_SIMETRICO=1)
#   scripts/respaldo-supabase.sh pgdump
#
# Modos:
#   pgdump `pg_dump` directo, acotado a lo de esta app: esquemas public y private, y los datos de
#          auth.users y auth.identities, más la lista de columnas y tipos de esas dos tablas de Auth
#          (auth-columnas.txt, para el simulacro). Requiere pg_dump de versión MAYOR O IGUAL a la del
#          servidor (Supabase usa Postgres 17).
#   cli    DESACTIVADO (A-78): `supabase db dump --db-url` exige la contraseña en la línea de comandos.
#
# Instante de referencia (A-78): el manifiesto guarda `referencia_utc`, y la verificación cuenta los
# enlaces vigentes EN ESE INSTANTE, no «ahora». Así un enlace que vence entre el respaldo y el simulacro
# no produce una diferencia falsa.
#
# Variables opcionales:
#   BACKUP_SIN_CIFRAR=1   solo para ensayos con datos ficticios: deja los .sql sin cifrar.
#   BACKUP_CONSERVAR=N    avisa (no borra) si hay más de N respaldos cifrados en BACKUP_DIR.
set -euo pipefail
umask 077

modo="${1:-pgdump}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "$script_dir/.." && pwd)"

fallar() { echo "ERROR: $*" >&2; exit 1; }
[[ "$modo" != "cli" ]] || fallar "el modo cli está desactivado: supabase db dump --db-url pondría la contraseña en la línea de comandos. Usa: scripts/respaldo-supabase.sh pgdump"
[[ "$modo" == "pgdump" ]] || fallar "modo desconocido: $modo (usa pgdump)"

# --- Conexión segura: pg_service.conf + pgpass (nunca la contraseña en argumentos ni en la salida) --
source "$script_dir/conexion/conexion.sh"
cargar_conexion

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
referencia="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
trabajo="$backup_dir/respaldo-$sello"
mkdir "$trabajo"
limpiar() {
  # Si algo falla, no deja copias a medio hacer (ni sin cifrar).
  if [[ -d "$trabajo" ]]; then rm -rf "$trabajo"; fi
}
trap limpiar EXIT

command -v psql >/dev/null || fallar "falta psql"
version_servidor="$(pg_seguro psql -w -X -q -A -t -d "$CONEXION" -c 'show server_version_num')" || fallar "no se pudo conectar (mensaje saneado arriba)"
mayor_servidor=$(( version_servidor / 10000 ))

command -v pg_dump >/dev/null || fallar "falta pg_dump"
mayor_cliente="$(pg_dump --version | sed -E 's/[^0-9]*([0-9]+).*/\1/')"
(( mayor_cliente >= mayor_servidor )) || fallar "pg_dump $mayor_cliente es menor que el servidor ($mayor_servidor): instala pg_dump $mayor_servidor o superior"
# Esta app no crea roles propios (verificado el 18-11-2026): no se respaldan roles.
printf -- '-- Modo pgdump: el proyecto no tiene roles propios (docs/17 §2).\n' > "$trabajo/roles.sql"
pg_seguro pg_dump -w -d "$CONEXION" --schema-only --schema=public --schema=private --no-subscriptions --no-publications \
  -f "$trabajo/schema.sql" || fallar "pg_dump (esquema) falló (mensaje saneado arriba)"
# Con -t, pg_dump ignora -n: se listan las tablas explícitamente.
pg_seguro pg_dump -w -d "$CONEXION" --data-only --table='public.*' --table='private.*' \
  --table=auth.users --table=auth.identities -f "$trabajo/data.sql" || fallar "pg_dump (datos) falló (mensaje saneado arriba)"
# Columnas y tipos de auth.users y auth.identities (la estructura de Auth no viaja en el volcado): el
# simulacro las recrea con sus tipos reales para comparar el contenido completo. Sin datos.
pg_seguro psql -w -X -q -A -t -F $'\t' -v ON_ERROR_STOP=1 -d "$CONEXION" > "$trabajo/auth-columnas.txt" <<'SQL' || fallar "no se pudieron leer las columnas de Auth (mensaje saneado arriba)"
select c.relname, a.attnum, a.attname, format_type(a.atttypid, a.atttypmod), a.attgenerated::text,
       coalesce(pg_get_expr(d.adbin, d.adrelid), '')
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum and a.attgenerated <> ''
 where n.nspname = 'auth' and c.relname in ('users', 'identities') and a.attnum > 0 and not a.attisdropped
 order by 1, 2;
SQL

suma() { if command -v sha256sum >/dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }

# --- Manifiesto: versiones, sumas y verificación del ORIGEN (sin datos personales) -------------
pg_seguro psql -w -X -q -A -t -F ' | ' -v ON_ERROR_STOP=1 -v referencia="$referencia" -d "$CONEXION" \
  -f "$script_dir/verificar-restauracion.sql" > "$trabajo/verificacion-origen.txt" || fallar "la verificación del origen falló (mensaje saneado arriba)"
{
  echo "fecha_utc: $sello"
  echo "referencia_utc: $referencia"
  echo "modo: $modo"
  echo "postgres_servidor: $version_servidor"
  echo "pg_dump: $(pg_dump --version 2>/dev/null || echo 'n/d')"
  echo "cifrado: $cifrado"
  (cd "$trabajo" && suma roles.sql schema.sql data.sql auth-columnas.txt verificacion-origen.txt)
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
