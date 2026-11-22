#!/usr/bin/env bash
# PRUEBA DEL SIMULACRO DE RESTAURACIÓN (A-77) con datos FICTICIOS, solo en PostgreSQL LOCAL.
# Nunca se conecta a Supabase. Crea orígenes falsos con un esquema auth representativo de Supabase,
# respalda con el script REAL (scripts/respaldo-supabase.sh pgdump, cifrado con age) y comprueba el
# simulacro y sus controles negativos.
#
#   PGHOST=/ruta/al/socket PGPORT=55433 PGUSER=medir scripts/simulacro/probar-simulacro.sh
#
# Requiere: un servidor PostgreSQL LOCAL (para los orígenes), age, python3. No ejecutar como root.
set -euo pipefail
umask 077
dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$dir/../.." && pwd)"
case "${PGHOST:-}" in
  /*|localhost|127.0.0.1|::1) ;;
  *) echo "ERROR: PGHOST debe ser un socket local (ruta absoluta) o localhost/127.0.0.1/::1" >&2; exit 1 ;;
esac
[[ "$(id -u)" != 0 ]] || { echo "ERROR: no ejecutar como root" >&2; exit 1; }

t="$(mktemp -d "${TMPDIR:-/tmp}/prueba-simulacro-XXXXXX")"
bases=()
fin() { for b in "${bases[@]}"; do psql -X -q -d postgres -c "drop database if exists $b" >/dev/null 2>&1 || true; done; rm -rf "$t"; }
trap fin EXIT
ok=0; fallas=0
check() {
  if eval "$2"; then ok=$((ok + 1)); echo "OK $1"
  else fallas=$((fallas + 1)); echo "FALLA $1"; [[ -f "$t/sim.log" ]] && tail -n 4 "$t/sim.log" | sed 's/^/   | /'; fi
}
restos() { find "${TMPDIR:-/tmp}" -maxdepth 1 -name 'simulacro-*' -user "$(id -un)" 2>/dev/null | wc -l; }

age-keygen -o "$t/clave.txt" 2>/dev/null
destinatario="$(grep -oE 'age1[0-9a-z]+' "$t/clave.txt" | head -n 1)"
mkdir -p "$t/respaldos" "$t/conf"

# Crea un origen falso: base Supabase + auth representativo + migraciones (3 o 4) + datos ficticios.
origen() {
  local db="$1" con52="$2"
  psql -X -q -d postgres -c "create database $db" >/dev/null; bases+=("$db")
  local run=(psql -X -q -v ON_ERROR_STOP=1 -d "$db")
  "${run[@]}" -f "$dir/base-supabase.sql" >/dev/null
  "${run[@]}" -f "$dir/fixtures/auth-representativo.sql" >/dev/null
  for m in 20261118000315_esquema_inicial.sql 20261118000924_guardar_cotizacion_atomica.sql 20261118022422_numeracion_atomica.sql; do
    "${run[@]}" --single-transaction -f "$repo/supabase/migrations/$m" >/dev/null
  done
  if [[ "$con52" == 1 ]]; then "${run[@]}" --single-transaction -f "$repo/supabase/migrations/20261122120000_guardado_unico_y_contador.sql" >/dev/null; fi
  "${run[@]}" -f "$dir/fixtures/datos-ficticios.sql" >/dev/null
  printf 'postgresql:///%s?host=%s&port=%s&user=%s\n' "$db" "$PGHOST" "${PGPORT:-5432}" "${PGUSER:-$(id -un)}" > "$t/conf/db-url-$db"
}
respaldar() {  # respalda con el script real y devuelve la ruta del .tar.age
  SUPABASE_DB_URL_FILE="$t/conf/db-url-$1" BACKUP_DIR="$t/respaldos" BACKUP_AGE_RECIPIENT="$destinatario" \
    "$repo/scripts/respaldo-supabase.sh" pgdump > "$t/resp-$1.log" 2>&1
  grep -oE 'Respaldo listo: .*' "$t/resp-$1.log" | sed 's/Respaldo listo: //'
}
simular() { RESPALDO="$1" CLAVE_AGE="$t/clave.txt" "${2:-$dir/simulacro-restauracion.sh}" > "$t/sim.log" 2>&1; }

sello="$(date +%s)_$$"
antes_restos="$(restos)"

echo "== E1 · origen ANTES de #52, respaldo real del script (pgdump, cifrado con age)"
origen "sim_pre_$sello" 0
r1="$(respaldar "sim_pre_$sello")"
check "E1 respaldo cifrado creado" '[[ -f "$r1" && "$r1" == *.tar.age ]]'
if simular "$r1"; then e1=0; else e1=$?; fi
check "E1 simulacro: restauración idéntica (código 0)" '[[ $e1 == 0 ]] && grep -q "RESULTADO: restauración idéntica" "$t/sim.log"'
check "E1 aplicó solo las 3 migraciones anteriores (nunca la de #52)" 'grep -q "ANTES de #52" "$t/sim.log" && ! grep -q "migración aplicada: 20261122120000" "$t/sim.log"'
check "E1 auth.users con las columnas del respaldo (más de 30)" 'grep -qE "auth.users: (3[0-9]|[4-9][0-9]) columnas" "$t/sim.log"'
grep -E "RESULTADO|columnas|migración aplicada|conservada|omitida" "$t/sim.log" | sed 's/^/   /'

echo "== E2 · origen DESPUÉS de #52 (las 4 migraciones; importación alta con N1)"
origen "sim_post_$sello" 1
r2="$(respaldar "sim_post_$sello")"
if simular "$r2"; then e2=0; else e2=$?; fi
check "E2 simulacro: restauración idéntica" '[[ $e2 == 0 ]] && grep -q "RESULTADO: restauración idéntica" "$t/sim.log"'
check "E2 aplicó las 4 migraciones (estado DESPUÉS de #52 detectado)" 'grep -q "DESPUÉS de #52" "$t/sim.log" && grep -q "migración aplicada: 20261122120000" "$t/sim.log"'

echo "== E3 · respaldo tipo «cli» (todos los esquemas, identificadores entre comillas, tablas internas)"
mkdir -p "$t/cli/respaldo-cli"
c="$t/cli/respaldo-cli"
pg_dump -d "sim_pre_$sello" --data-only --quote-all-identifiers --use-set-session-authorization -f "$c/data.sql" 2>/dev/null || pg_dump -d "sim_pre_$sello" --data-only --quote-all-identifiers -f "$c/data.sql"
printf -- '-- roles\n' > "$c/roles.sql"; printf -- '-- schema\n' > "$c/schema.sql"
psql -X -A -t -F ' | ' -v ON_ERROR_STOP=1 -d "sim_pre_$sello" -f "$repo/scripts/verificar-restauracion.sql" > "$c/verificacion-origen.txt"
{ echo "modo: cli"; echo "postgres_servidor: $(psql -X -A -t -d postgres -c 'show server_version_num')"; (cd "$c" && sha256sum roles.sql schema.sql data.sql verificacion-origen.txt); } > "$c/manifiesto.txt"
tar -C "$t/cli" -cf - respaldo-cli | age -r "$destinatario" -o "$t/cli.tar.age"
if simular "$t/cli.tar.age"; then e3=0; else e3=$?; fi
check "E3 simulacro con volcado de todos los esquemas: restauración idéntica" '[[ $e3 == 0 ]] && grep -q "RESULTADO: restauración idéntica" "$t/sim.log"'
check "E3 omitió las tablas internas (auth.sessions, auth.refresh_tokens, storage.buckets) sin mostrar su contenido" 'grep -q "omitida: auth.sessions (1 filas)" "$t/sim.log" && grep -q "omitida: storage.buckets (1 filas)" "$t/sim.log" && ! grep -q tokenficticio "$t/sim.log"'
grep -E "omitida|conservada" "$t/sim.log" | sed 's/^/   /'

echo "== C1 · control: el stub mínimo anterior (auth.users con id y email) NO puede cargar el respaldo"
age -d -i "$t/clave.txt" "$r1" | tar -x -C "$t" 
d1="$(find "$t" -maxdepth 1 -type d -name 'respaldo-*' | head -n 1)"
psql -X -q -d postgres -c "create database sim_stub_$sello" >/dev/null; bases+=("sim_stub_$sello")
psql -X -q -v ON_ERROR_STOP=1 -d "sim_stub_$sello" -f "$repo/scripts/diseno/stub-supabase.sql" -c "create extension if not exists pgcrypto with schema extensions" -c "create table if not exists auth.identities (id uuid primary key, user_id uuid)" >/dev/null
for m in 20261118000315_esquema_inicial.sql 20261118000924_guardar_cotizacion_atomica.sql 20261118022422_numeracion_atomica.sql; do psql -X -q -v ON_ERROR_STOP=1 -d "sim_stub_$sello" --single-transaction -f "$repo/supabase/migrations/$m" >/dev/null; done
if psql -X -q -v ON_ERROR_STOP=1 -d "sim_stub_$sello" --single-transaction -c 'SET session_replication_role = replica' -f "$d1/data.sql" > "$t/stub.log" 2>&1; then c1=0; else c1=1; fi
check "C1 el stub mínimo falla al cargar auth.users del respaldo (motivo del cambio)" '[[ $c1 == 1 ]] && grep -q "does not exist" "$t/stub.log"'
grep -m1 -oE 'column "[a-z_]+" of relation "users" does not exist' "$t/stub.log" | sed 's/^/   /' || true

echo "== C2 · control: un respaldo al que le falta una cotización (sumas coherentes) → HAY DIFERENCIAS"
cp -R "$d1" "$t/c2"; mv "$t/c2" "$t/c2x"; mkdir "$t/c2"; mv "$t/c2x" "$t/c2/respaldo-c2"
python3 - "$t/c2/respaldo-c2/data.sql" <<'PY'
import sys
p = sys.argv[1]; out = []; dentro = False; quitado = False
for line in open(p, encoding='utf-8'):
    if line.startswith('COPY public.jobs '): dentro = True; out.append(line); continue
    if dentro and not quitado and line.strip() != '\\.': quitado = True; continue
    if line.strip() == '\\.': dentro = False
    out.append(line)
open(p, 'w', encoding='utf-8').writelines(out)
PY
(cd "$t/c2/respaldo-c2" && { grep -vE ' (data\.sql)$' manifiesto.txt; sha256sum data.sql; } > m2 && mv m2 manifiesto.txt)
tar -C "$t/c2" -cf - respaldo-c2 | age -r "$destinatario" -o "$t/c2.tar.age"
if simular "$t/c2.tar.age"; then c2=0; else c2=$?; fi
check "C2 detecta la cotización perdida (código 2 y conteo de jobs distinto)" '[[ $c2 == 2 ]] && grep -q "HAY DIFERENCIAS" "$t/sim.log" && grep -q "conteo.public.jobs" "$t/sim.log"'

echo "== C3 · control: data.sql alterado sin actualizar el manifiesto → se detiene en las sumas"
cp -R "$d1" "$t/c3tmp"; mkdir "$t/c3"; mv "$t/c3tmp" "$t/c3/respaldo-c3"; echo '-- alterado' >> "$t/c3/respaldo-c3/data.sql"
tar -C "$t/c3" -cf - respaldo-c3 | age -r "$destinatario" -o "$t/c3.tar.age"
if simular "$t/c3.tar.age"; then c3=0; else c3=$?; fi
check "C3 se detiene: «las sumas SHA-256 no coinciden»" '[[ $c3 != 0 ]] && grep -q "sumas SHA-256 no coinciden" "$t/sim.log"'

echo "== C4 · control: respaldo de una versión de PostgreSQL más nueva que la local → se niega"
cp -R "$d1" "$t/c4tmp"; mkdir "$t/c4"; mv "$t/c4tmp" "$t/c4/respaldo-c4"; sed -i 's/^postgres_servidor: .*/postgres_servidor: 990000/' "$t/c4/respaldo-c4/manifiesto.txt"
tar -C "$t/c4" -cf - respaldo-c4 | age -r "$destinatario" -o "$t/c4.tar.age"
if simular "$t/c4.tar.age"; then c4=0; else c4=$?; fi
check "C4 se niega por versión («instala PostgreSQL 99»)" '[[ $c4 != 0 ]] && grep -q "instala PostgreSQL 99" "$t/sim.log"'

echo "== C5 · control: clave de age equivocada → no descifra"
age-keygen -o "$t/otra.txt" 2>/dev/null
if RESPALDO="$r1" CLAVE_AGE="$t/otra.txt" "$dir/simulacro-restauracion.sh" > "$t/sim.log" 2>&1; then c5=0; else c5=$?; fi
check "C5 clave equivocada: «no se pudo descifrar»" '[[ $c5 != 0 ]] && grep -q "no se pudo descifrar" "$t/sim.log"'

echo "== C6 · mutación: el simulacro aplica también la migración de #52 a un origen anterior → se detiene"
# Copia mutante FUERA del repositorio, con enlaces a las migraciones y a la verificación.
m6="$t/mut"; mkdir -p "$m6/scripts/simulacro"
ln -s "$repo/supabase" "$m6/supabase"; ln -s "$repo/scripts/verificar-restauracion.sql" "$m6/scripts/verificar-restauracion.sql"
cp "$dir/base-supabase.sql" "$dir/procesar-respaldo.py" "$m6/scripts/simulacro/"
sed 's/estado="anterior"; migraciones=("${anteriores_52\[@\]}")/estado="anterior"; migraciones=("${anteriores_52[@]}" "$migracion_52")/' "$dir/simulacro-restauracion.sh" > "$m6/scripts/simulacro/simulacro-restauracion.sh"
chmod +x "$m6/scripts/simulacro/simulacro-restauracion.sh"
if grep -q 'estado="anterior"; migraciones=("${anteriores_52\[@\]}" "$migracion_52")' "$m6/scripts/simulacro/simulacro-restauracion.sh"; then mut=1; else mut=0; fi
if simular "$r1" "$m6/scripts/simulacro/simulacro-restauracion.sh"; then c6=0; else c6=$?; fi
check "C6 la mutación se aplicó y el simulacro se detiene («no quedó en el estado del origen»)" '[[ $mut == 1 && $c6 != 0 ]] && grep -q "no quedó en el estado del origen" "$t/sim.log"'

echo "== C7 · limpieza: tras todas las corridas (también las fallidas) no queda ninguna carpeta temporal"
check "C7 sin carpetas «simulacro-*» residuales" '[[ "$(restos)" == "$antes_restos" ]]'

echo
echo "Resultado: $ok correctas, $fallas fallas"
(( fallas == 0 ))
