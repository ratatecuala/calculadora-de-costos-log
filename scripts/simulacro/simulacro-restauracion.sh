#!/usr/bin/env bash
# SIMULACRO DE RESTAURACIÓN LOCAL de un respaldo de Supabase (docs/25 fase 2b, docs/17 §5.6; A-77, A-78).
#
# Comprueba que los DATOS de un respaldo hecho con scripts/respaldo-supabase.sh se cargan completos en
# una base PostgreSQL LOCAL y temporal y coinciden con el origen: contenido completo de las tablas de la
# app y de auth.users/auth.identities, conteos, numeración y privilegios que dejan las migraciones.
# Nunca se conecta a Supabase ni a staging. No necesita contraseñas de Supabase.
#
# Lo que NO demuestra: una restauración FUNCIONAL de Supabase Auth (inicio de sesión, funciones,
# triggers y demás tablas de auth no viajan en el respaldo) ni una restauración en un proyecto Supabase
# nuevo. Es una comprobación de integridad de los datos, no un ensayo de recuperación completa.
#
#   RESPALDO=~/respaldos-cotizador/respaldo-<fecha>.tar.age \
#   CLAVE_AGE=~/.config/cotizador/clave-respaldo.txt \
#   scripts/simulacro/simulacro-restauracion.sh
#
# Qué hace, en orden, dentro de una carpeta temporal privada (permisos 700) que SIEMPRE se borra al
# terminar, también si algo falla o se interrumpe con Ctrl+C:
#   1. descifra el respaldo y comprueba las sumas SHA-256 del manifiesto;
#   2. comprueba que el PostgreSQL local es de la misma versión mayor que el del respaldo, o superior;
#   3. reconoce el prefijo del origen por sus invariantes y el schema.sql verificado; aplica solo
#      esas migraciones e iguala las definiciones de precio entero sin ejecutar el SQL del origen;
#   4. crea una base temporal con una base mínima tipo Supabase y las tablas auth.users y
#      auth.identities con las MISMAS columnas y TIPOS del origen (auth-columnas.txt del respaldo);
#   5. carga los datos de la app (public, private, auth.users y auth.identities); un formato o dato
#      que el simulacro no sepa interpretar es un ERROR explícito (procesar-respaldo.py);
#   6. ejecuta scripts/verificar-restauracion.sql con el MISMO instante de referencia del origen
#      (referencia_utc del manifiesto) y la compara con la del origen (diff).
# Resultado: «RESULTADO: DATOS VERIFICADOS» (código 0) o «RESULTADO: HAY DIFERENCIAS» (código 2).
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
for b in initdb pg_ctl psql postgres pg_dump; do [[ -x "$pgbin/$b" ]] || fallar "no encuentro $b de PostgreSQL (instálalo: docs/25 fase 0)"; done
mayor_local="$("$pgbin/postgres" --version | grep -oE '[0-9]+' | head -n 1)"

# Las 3 migraciones anteriores a #52 y la de #52, por nombre EXACTO.
anteriores_52=(20261118000315_esquema_inicial.sql 20261118000924_guardar_cotizacion_atomica.sql 20261118022422_numeracion_atomica.sql)
migracion_52=20261122120000_guardado_unico_y_contador.sql
# I-2 (A-81): solo si el origen ya las tenía (fila conteo.public.job_cargo_items en su verificación).
migraciones_i2=(20261125120000_lineas_de_carga.sql 20261125120100_guardado_v2.sql)
precio_entero=20261125130000_precio_entero.sql
for m in "${anteriores_52[@]}" "$migracion_52" "${migraciones_i2[@]}" "$precio_entero"; do [[ -f "$repo/supabase/migrations/$m" ]] || fallar "falta la migración $m en el repositorio"; done

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
for f in manifiesto.txt schema.sql data.sql auth-columnas.txt verificacion-origen.txt; do
  [[ -n "$carpeta" && -f "$carpeta/$f" ]] || fallar "el respaldo no trae $f (¿es de una versión anterior de respaldo-supabase.sh? Haz un respaldo nuevo)"
done
for f in schema.sql data.sql auth-columnas.txt verificacion-origen.txt; do
  grep -qE " $f\$" "$carpeta/manifiesto.txt" || fallar "el manifiesto no trae la suma SHA-256 de $f"
done
(cd "$carpeta" && grep -E ' (roles\.sql|schema\.sql|data\.sql|auth-columnas\.txt|verificacion-origen\.txt)$' manifiesto.txt | suma_c) || fallar "las sumas SHA-256 no coinciden: el respaldo está dañado o incompleto"
modo_respaldo="$(grep '^modo:' "$carpeta/manifiesto.txt" | cut -d' ' -f2 || true)"
[[ "$modo_respaldo" == pgdump || "$modo_respaldo" == cli ]] || fallar "modo de respaldo no reconocido en el manifiesto: «$modo_respaldo»"
referencia="$(grep '^referencia_utc:' "$carpeta/manifiesto.txt" | cut -d' ' -f2 || true)"
[[ "$referencia" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] || fallar "el manifiesto no trae un referencia_utc válido"
echo "   sumas SHA-256 correctas; modo del respaldo: $modo_respaldo; instante de referencia: $referencia"

echo "2) Versión de PostgreSQL"
srv="$(grep '^postgres_servidor:' "$carpeta/manifiesto.txt" | grep -oE '[0-9]+' | head -n 1 || true)"
[[ -n "$srv" ]] || fallar "el manifiesto no indica la versión del servidor"
mayor_origen=$(( srv / 10000 ))
(( mayor_local >= mayor_origen )) || fallar "tu PostgreSQL local es $mayor_local y el respaldo es de PostgreSQL $mayor_origen: instala PostgreSQL $mayor_origen (docs/25 fase 0)"
echo "   origen PostgreSQL $mayor_origen · local PostgreSQL $mayor_local"

echo "3) Estado de las migraciones del origen"
estado="$(python3 -I "$dir/estado_migraciones.py" estado "$carpeta/schema.sql" "$carpeta/verificacion-origen.txt")"
migraciones=("${anteriores_52[@]}")
case "$estado" in
  anterior) echo "   ANTES de #52: solo las 3 migraciones anteriores" ;;
  posterior) echo "   DESPUÉS de #52: se aplican las 4 migraciones" ;;
  m3) echo "   #52 y M3: se aplican las 5 migraciones" ;;
  i2) echo "   #52 e I-2: se aplican las 6 migraciones" ;;
  precio) echo "   #52, I-2 y precio entero: se aplican las 7 migraciones" ;;
  *) fallar "estado de migraciones desconocido" ;;
esac
if [[ "$estado" != anterior ]]; then migraciones+=("$migracion_52"); fi
if [[ "$estado" == m3 || "$estado" == i2 || "$estado" == precio ]]; then migraciones+=("${migraciones_i2[0]}"); fi
if [[ "$estado" == i2 || "$estado" == precio ]]; then migraciones+=("${migraciones_i2[1]}"); fi
if [[ "$estado" == precio ]]; then migraciones+=("$precio_entero"); fi

echo "4) Base local temporal"
"$pgbin/initdb" -D "$cluster" -U postgres -A trust --no-sync >/dev/null
mkdir -p "$sock"
"$pgbin/pg_ctl" -D "$cluster" -o "-k $sock -c listen_addresses= -p 54329" -l "$trabajo/pg.log" -w start >/dev/null
psql_l() { "$pgbin/psql" -X -q -v ON_ERROR_STOP=1 -h "$sock" -p 54329 -U postgres -d postgres "$@"; }
psql_l -f "$dir/base-supabase.sql" >/dev/null
python3 -I "$dir/procesar-respaldo.py" auth "$carpeta/auth-columnas.txt" "$carpeta/data.sql" > "$trabajo/auth.sql"
psql_l -f "$trabajo/auth.sql" >/dev/null || fallar "no se pudieron crear las tablas de Auth con los tipos del origen"
echo "   $(grep '^-- auth.users' "$trabajo/auth.sql" | sed 's/^-- //') (las del origen)"
for m in "${migraciones[@]}"; do
  psql_l --single-transaction -f "$repo/supabase/migrations/$m" >/dev/null
  echo "   migración aplicada: $m"
done
# Comprobar el estado local con la misma huella observacional, independiente de la selección.
"$pgbin/pg_dump" -w -h "$sock" -p 54329 -U postgres -d postgres --schema-only --schema=public --schema=private -f "$trabajo/schema-local.sql"
python3 -I "$dir/estado_migraciones.py" comparar "$carpeta/schema.sql" "$trabajo/schema-local.sql"
psql_l -A -t -F ' | ' -v referencia="$referencia" -f "$repo/scripts/verificar-restauracion.sql" > "$trabajo/estado-vacio.txt"
estado_local="$(python3 -I "$dir/estado_migraciones.py" estado "$trabajo/schema-local.sql" "$trabajo/estado-vacio.txt")"
[[ "$estado_local" == "$estado" ]] || fallar "la base local no quedó en el estado del origen ($estado): no se continúa"

echo "5) Cargar los datos"
python3 -I "$dir/procesar-respaldo.py" filtrar "$carpeta/data.sql" "$trabajo/datos.sql"
psql_l --single-transaction -c 'SET session_replication_role = replica' -f "$trabajo/datos.sql" >/dev/null || fallar "los datos no se pudieron cargar"


echo "6) Verificar"
if [[ "$estado" == precio ]]; then psql_l -f "$dir/verificar-precio-restaurado.sql" >/dev/null; fi
psql_l -A -t -F ' | ' -v referencia="$referencia" -f "$repo/scripts/verificar-restauracion.sql" > "$trabajo/restaurado.txt"
controles="$(grep -c ' | ' "$trabajo/restaurado.txt" || true)"
contenido="$(grep -c '^contenido\.' "$trabajo/restaurado.txt" || true)"
if diff -u "$carpeta/verificacion-origen.txt" "$trabajo/restaurado.txt" > "$trabajo/diferencias.txt"; then
  echo "RESULTADO: DATOS VERIFICADOS. Los $controles controles coinciden con el origen: contenido completo de $contenido tablas (las de la app, auth.users y auth.identities), conteos, numeración y privilegios."
  echo "   Alcance: integridad de los datos. NO prueba que Supabase Auth funcione (inicio de sesión) ni una restauración en un proyecto Supabase nuevo."
else
  echo "RESULTADO: HAY DIFERENCIAS. Líneas distintas (solo conteos, huellas o invariantes; sin datos personales):"
  grep -E '^[-+][a-z]' "$trabajo/diferencias.txt" || true
  echo "No borres el respaldo. Detente y avisa en #52 pegando estas líneas."
  exit 2
fi
