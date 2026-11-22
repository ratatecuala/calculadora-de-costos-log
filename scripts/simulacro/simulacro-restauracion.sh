#!/usr/bin/env bash
# SIMULACRO DE RESTAURACIÓN LOCAL de un respaldo de Supabase (docs/25 fase 2, docs/17 §5.6; A-77).
#
# Comprueba que un respaldo hecho con scripts/respaldo-supabase.sh se puede restaurar y queda IDÉNTICO
# (conteos, huellas de identificadores, numeración y privilegios), usando una base PostgreSQL LOCAL y
# temporal. Nunca se conecta a Supabase ni a staging. No necesita contraseñas de Supabase.
#
#   RESPALDO=~/respaldos-cotizador/respaldo-<fecha>.tar.age \
#   CLAVE_AGE=~/.config/cotizador/clave-respaldo.txt \
#   scripts/simulacro/simulacro-restauracion.sh
#
# Qué hace, en orden, dentro de una carpeta temporal privada (permisos 700) que SIEMPRE se borra al
# terminar, también si algo falla o se interrumpe con Ctrl+C:
#   1. descifra el respaldo y comprueba las sumas SHA-256 del manifiesto;
#   2. comprueba que el PostgreSQL local es de la misma versión mayor que el del respaldo, o superior;
#   3. detecta por la huella del origen (fila inv.security_definer) si el origen tenía aplicada la
#      migración de #52, y aplica EXACTAMENTE las migraciones de ese estado (lista explícita: nunca
#      «todas las de la carpeta»). Antes de #52: solo las 3 anteriores;
#   4. crea una base temporal con una base mínima tipo Supabase y las tablas auth.users y
#      auth.identities con las MISMAS columnas que trae el respaldo (procesar-respaldo.py);
#   5. carga los datos de la app (public, private, auth.users y auth.identities);
#   6. ejecuta scripts/verificar-restauracion.sql y la compara con la del origen (diff).
# Resultado: «RESULTADO: restauración idéntica» (código 0) o «RESULTADO: HAY DIFERENCIAS» (código 2).
# La salida solo muestra conteos, huellas y nombres de tablas: nunca datos personales.
#
# Requisitos (en Windows 11, dentro de Ubuntu en WSL: docs/25): PostgreSQL de la misma versión que el
# servidor del respaldo (Supabase usa 17), age y python3. No ejecutar con sudo.
# Solo para ensayos con datos FICTICIOS: RESPALDO puede ser una carpeta sin cifrar si además se define
# SIMULACRO_CARPETA_FICTICIA=1.
set -euo pipefail
umask 077

dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$dir/../.." && pwd)"
fallar() { echo "ERROR: $*" >&2; exit 1; }

[[ "$(id -u)" != 0 ]] || fallar "no lo ejecutes con sudo ni como root (PostgreSQL no lo permite)"
: "${RESPALDO:?falta RESPALDO: la ruta del archivo respaldo-<fecha>.tar.age}"
command -v python3 >/dev/null || fallar "falta python3"
suma_c() { if command -v sha256sum >/dev/null; then sha256sum -c --quiet -; else shasum -a 256 -c -q -; fi; }

# Binarios de PostgreSQL: PG_BIN, o la versión más alta instalada en /usr/lib/postgresql, o el PATH.
if [[ -n "${PG_BIN:-}" ]]; then pgbin="$PG_BIN"
elif ls -d /usr/lib/postgresql/*/bin >/dev/null 2>&1; then pgbin="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -n 1)"
else pgbin="$(dirname "$(command -v initdb || echo /nonexistent/initdb)")"; fi
for b in initdb pg_ctl psql postgres; do [[ -x "$pgbin/$b" ]] || fallar "no encuentro $b de PostgreSQL (instálalo: docs/25 fase 0)"; done
mayor_local="$("$pgbin/postgres" --version | grep -oE '[0-9]+' | head -n 1)"

# Las 3 migraciones anteriores a #52 y la de #52, por nombre EXACTO.
anteriores_52=(20261118000315_esquema_inicial.sql 20261118000924_guardar_cotizacion_atomica.sql 20261118022422_numeracion_atomica.sql)
migracion_52=20261122120000_guardado_unico_y_contador.sql
for m in "${anteriores_52[@]}" "$migracion_52"; do [[ -f "$repo/supabase/migrations/$m" ]] || fallar "falta la migración $m en el repositorio"; done

trabajo="$(mktemp -d "${TMPDIR:-/tmp}/simulacro-XXXXXX")"
cluster="$trabajo/pg"
sock="$trabajo/s"
limpiar() {
  if [[ -f "$cluster/postmaster.pid" ]]; then "$pgbin/pg_ctl" -D "$cluster" -m immediate stop >/dev/null 2>&1 || true; fi
  rm -rf "$trabajo"
  echo "Limpieza: se borraron los archivos descifrados y la base temporal."
}
trap limpiar EXIT
trap 'exit 130' INT TERM

echo "1) Descifrar y comprobar el respaldo"
if [[ -f "$RESPALDO" && "$RESPALDO" == *.tar.age ]]; then
  : "${CLAVE_AGE:?falta CLAVE_AGE: la ruta de tu clave privada de age (clave-respaldo.txt)}"
  [[ -f "$CLAVE_AGE" ]] || fallar "no existe CLAVE_AGE"
  command -v age >/dev/null || fallar "falta el programa age"
  age -d -i "$CLAVE_AGE" "$RESPALDO" | tar -x -C "$trabajo" || fallar "no se pudo descifrar: ¿es la clave correcta?"
elif [[ -d "$RESPALDO" && "${SIMULACRO_CARPETA_FICTICIA:-}" == 1 ]]; then
  echo "   AVISO: carpeta SIN CIFRAR (solo para ensayos con datos ficticios)."
  cp -R "$RESPALDO" "$trabajo/"
else
  fallar "RESPALDO debe ser un archivo .tar.age (o, solo en ensayos ficticios, una carpeta con SIMULACRO_CARPETA_FICTICIA=1)"
fi
carpeta="$(find "$trabajo" -mindepth 1 -maxdepth 1 -type d -name 'respaldo-*' | head -n 1)"
[[ -n "$carpeta" && -f "$carpeta/manifiesto.txt" && -f "$carpeta/data.sql" && -f "$carpeta/verificacion-origen.txt" ]] || fallar "el respaldo no tiene manifiesto.txt, data.sql y verificacion-origen.txt"
(cd "$carpeta" && grep -E ' (roles\.sql|schema\.sql|data\.sql|verificacion-origen\.txt)$' manifiesto.txt | suma_c) || fallar "las sumas SHA-256 no coinciden: el respaldo está dañado o incompleto"
echo "   sumas SHA-256 correctas; modo del respaldo: $(grep '^modo:' "$carpeta/manifiesto.txt" | cut -d' ' -f2)"

echo "2) Versión de PostgreSQL"
srv="$(grep '^postgres_servidor:' "$carpeta/manifiesto.txt" | grep -oE '[0-9]+' | head -n 1)"
[[ -n "$srv" ]] || fallar "el manifiesto no indica la versión del servidor"
mayor_origen=$(( srv / 10000 ))
(( mayor_local >= mayor_origen )) || fallar "tu PostgreSQL local es $mayor_local y el respaldo es de PostgreSQL $mayor_origen: instala PostgreSQL $mayor_origen (docs/25 fase 0)"
echo "   origen PostgreSQL $mayor_origen · local PostgreSQL $mayor_local"

echo "3) Estado de #52 en el origen"
fila="$(grep -E '^inv\.security_definer \| ' "$carpeta/verificacion-origen.txt" || true)"
[[ -n "$fila" ]] || fallar "verificacion-origen.txt no trae la fila inv.security_definer: no se puede saber el estado de #52"
valor="$(cut -d'|' -f2 <<<"$fila")"
if grep -q 'public\.create_job_with_quote' <<<"$valor"; then
  estado="posterior"; migraciones=("${anteriores_52[@]}" "$migracion_52")
else
  estado="anterior"; migraciones=("${anteriores_52[@]}")
fi
if [[ "$estado" == anterior ]]; then
  echo "   el origen está ANTES de #52: se aplican solo las 3 migraciones anteriores (nunca la de #52)"
else
  echo "   el origen está DESPUÉS de #52: se aplican las 3 anteriores y la de #52"
fi

echo "4) Base local temporal"
"$pgbin/initdb" -D "$cluster" -U postgres -A trust --no-sync >/dev/null
mkdir -p "$sock"
"$pgbin/pg_ctl" -D "$cluster" -o "-k $sock -c listen_addresses= -p 54329" -l "$trabajo/pg.log" -w start >/dev/null
psql_l() { "$pgbin/psql" -X -q -v ON_ERROR_STOP=1 -h "$sock" -p 54329 -U postgres -d postgres "$@"; }
psql_l -f "$dir/base-supabase.sql" >/dev/null
python3 "$dir/procesar-respaldo.py" auth "$carpeta/data.sql" > "$trabajo/auth.sql"
psql_l -f "$trabajo/auth.sql" >/dev/null
echo "   $(grep '^-- auth.users' "$trabajo/auth.sql" | sed 's/^-- //') (las del respaldo)"
for m in "${migraciones[@]}"; do
  psql_l --single-transaction -f "$repo/supabase/migrations/$m" >/dev/null
  echo "   migración aplicada: $m"
done
definer="$(psql_l -A -t -c "select coalesce((select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_job_with_quote'), false)")"
if [[ "$estado" == anterior && "$definer" != f ]] || [[ "$estado" == posterior && "$definer" != t ]]; then
  fallar "la base local no quedó en el estado del origen ($estado a #52): no se continúa"
fi

echo "5) Cargar los datos"
python3 "$dir/procesar-respaldo.py" filtrar "$carpeta/data.sql" "$trabajo/datos.sql"
psql_l --single-transaction -c 'SET session_replication_role = replica' -f "$trabajo/datos.sql" >/dev/null

echo "6) Verificar"
"$pgbin/psql" -X -A -t -F ' | ' -v ON_ERROR_STOP=1 -h "$sock" -p 54329 -U postgres -d postgres -f "$repo/scripts/verificar-restauracion.sql" > "$trabajo/restaurado.txt"
controles="$(grep -c ' | ' "$trabajo/restaurado.txt")"
if diff -u "$carpeta/verificacion-origen.txt" "$trabajo/restaurado.txt" > "$trabajo/diferencias.txt"; then
  echo "RESULTADO: restauración idéntica ($controles controles: conteos, huellas, numeración y privilegios)"
else
  echo "RESULTADO: HAY DIFERENCIAS. Líneas distintas (solo conteos, huellas o invariantes; sin datos personales):"
  grep -E '^[-+][a-z]' "$trabajo/diferencias.txt" || true
  echo "No borres el respaldo. Detente y avisa en #52 pegando estas líneas."
  exit 2
fi
