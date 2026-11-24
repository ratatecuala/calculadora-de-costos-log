#!/usr/bin/env bash
# PRUEBAS DEL RESPALDO, LA CONEXIÓN SEGURA Y EL SIMULACRO DE RESTAURACIÓN (A-77, A-78), solo con datos y
# credenciales FICTICIOS y en un PostgreSQL LOCAL temporal que esta prueba crea y borra. Nunca se conecta a
# Supabase ni a staging.
#
#   scripts/simulacro/probar-simulacro.sh
#
# Requiere PostgreSQL (initdb, pg_ctl, psql, pg_dump), age y python3. No ejecutar como root.
# El servidor temporal exige contraseña (scram-sha-256) por TCP y usa la zona horaria America/Santiago, así
# que las pruebas comprueban de verdad que la contraseña llega por pgpass y que las huellas no dependen de la
# zona horaria.
#
# Frente A (credenciales): la contraseña ficticia nunca aparece en los argumentos ni en el entorno de ningún
# proceso (registro de cada llamada a psql/pg_dump + vigilancia de /proc durante las corridas), ni en los
# registros, resultados, respaldos o archivos del repositorio. Rechazos explícitos y errores saneados.
# Frente B (integridad): contenido completo; alterar un cliente, un precio, el JSON interno, un vehículo, un
# correo o un hash de contraseña provoca HAY DIFERENCIAS; formatos no reconocidos son errores explícitos.
# Frente C (tiempo): un enlace que vence entre el respaldo y el simulacro no produce una diferencia falsa.
# TLS (A-79): el servidor temporal tiene TLS con un certificado de una CA de prueba. Las conexiones de las
# pruebas generales usan la EXCEPCIÓN explícita de pruebas locales (loopback, sin TLS); el grupo T prueba
# sin excepción: verify-full con la CA correcta funciona, y certificado incorrecto, nombre de servidor
# distinto, archivo faltante, modos inseguros (también editados a mano) y variables PGSSL* se rechazan.
set -euo pipefail
umask 077
dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$dir/../.." && pwd)"
[[ "$(id -u)" != 0 ]] || { echo "ERROR: no ejecutar como root" >&2; exit 1; }

if [[ -n "${PG_BIN:-}" ]]; then pgbin="$PG_BIN"; else pgbin="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -n 1)"; fi
for b in initdb pg_ctl psql pg_dump; do [[ -x "$pgbin/$b" ]] || { echo "ERROR: falta $b" >&2; exit 1; }; done

t="$(mktemp -d "${TMPDIR:-/tmp}/prueba-simulacro-XXXXXX")"
puerto="$(python3 -I -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')"
fin() {
  [[ -f "$t/pg/postmaster.pid" ]] && "$pgbin/pg_ctl" -D "$t/pg" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$t"
}
trap fin EXIT
ok=0; fallas=0
check() {
  if eval "$2"; then ok=$((ok + 1)); echo "OK $1"
  else fallas=$((fallas + 1)); echo "FALLA $1"; [[ -f "$t/ult.log" ]] && tail -n 6 "$t/ult.log" | sed 's/^/   | /'; fi
}
restos() { find "${TMPDIR:-/tmp}" -maxdepth 1 -name 'simulacro-*' -user "$(id -un)" 2>/dev/null | wc -l; }
antes_restos="$(restos)"

# ---- Certificados de PRUEBA: una CA, el certificado del servidor (solo DNS:localhost) y otra CA ajena ------
mkdir "$t/tls"
ca() { openssl req -x509 -newkey rsa:2048 -nodes -keyout "$t/tls/$1.key" -out "$t/tls/$1.crt" -days 2 -subj "/CN=$2" \
         -addext basicConstraints=critical,CA:TRUE -addext keyUsage=critical,keyCertSign,cRLSign 2>/dev/null; }
ca ca "CA de prueba"; ca otra-ca "Otra CA de prueba"
openssl req -newkey rsa:2048 -nodes -keyout "$t/tls/server.key" -out "$t/tls/server.csr" -subj "/CN=localhost" 2>/dev/null
printf 'subjectAltName=DNS:localhost\nbasicConstraints=CA:FALSE\n' > "$t/tls/ext"
openssl x509 -req -in "$t/tls/server.csr" -CA "$t/tls/ca.crt" -CAkey "$t/tls/ca.key" -CAcreateserial -out "$t/tls/server.crt" -days 2 -extfile "$t/tls/ext" 2>/dev/null
printf 'esto no es un certificado\n' > "$t/tls/basura.crt"

# ---- Servidor temporal: local por socket sin contraseña (administración), TCP con scram-sha-256 y TLS ------
"$pgbin/initdb" -D "$t/pg" -U postgres --auth-local=trust --auth-host=scram-sha-256 --no-sync >/dev/null
mkdir "$t/s"
"$pgbin/pg_ctl" -D "$t/pg" -o "-k $t/s -c listen_addresses=127.0.0.1 -p $puerto -c timezone=America/Santiago -c ssl=on -c ssl_cert_file=$t/tls/server.crt -c ssl_key_file=$t/tls/server.key" -l "$t/pg.log" -w start >/dev/null
# Excepción EXPLÍCITA para las pruebas generales (servidor de loopback). El grupo T la quita.
export COTIZADOR_PRUEBA_LOCAL_SIN_TLS=solo-loopback-de-prueba
adm() { PGOPTIONS='-c client_min_messages=warning' "$pgbin/psql" -X -q -v ON_ERROR_STOP=1 -h "$t/s" -p "$puerto" -U postgres "$@"; }

# ---- Credencial FICTICIA: aleatoria, con : \ @ % / para probar el escapado. Nunca va en argumentos. -------
usuario="respaldo_fict_$RANDOM$RANDOM"
python3 -I - > "$t/secreto" <<'PY'
import secrets
print('Fict:' + secrets.token_hex(12) + '@%/\\:z', end='')
PY
python3 -I -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.stdin.read(), safe=""), end="")' < "$t/secreto" > "$t/secreto-url"
{ printf "create role %s login superuser password '" "$usuario"; sed "s/'/''/g" "$t/secreto"; printf "';\n"; } | adm -d postgres
printf 'Fict:INCORRECTA\n' > "$t/clave-mala"

# ---- Detector: registro de cada psql/pg_dump (argumentos y entorno PG*) + vigilancia de /proc -----------------
mkdir "$t/shims"
for b in psql pg_dump; do
  cat > "$t/shims/$b" <<SH
#!/usr/bin/env bash
{ printf '%s\0' "$b" "\$@"; printf '\n'; env | grep -E '^(PG|DATABASE_URL|SUPABASE)' || true; } >> "\$SHIM_LOG"
exec "$pgbin/$b" "\$@"
SH
  chmod +x "$t/shims/$b"
done
cat > "$t/vigia.py" <<'PY'
import os, sys, time
secretos = [open(p, 'rb').read() for p in sys.argv[1:3]]
alto, salida = sys.argv[3], sys.argv[4]
yo, hallazgos, rondas = str(os.getpid()), set(), 0
while not os.path.exists(alto):
    rondas += 1
    for pid in os.listdir('/proc'):
        if not pid.isdigit() or pid == yo:
            continue
        for parte in ('cmdline', 'environ'):
            try:
                with open(f'/proc/{pid}/{parte}', 'rb') as f:
                    datos = f.read()
            except OSError:
                continue
            if any(s and s in datos for s in secretos):
                nombre = datos.split(b'\0')[0][-40:].decode('utf-8', 'replace')
                hallazgos.add(f'{parte} de {nombre}')
    time.sleep(0.002)
with open(salida, 'w') as f:
    f.write(f'rondas {rondas}\n' + ''.join(h + '\n' for h in sorted(hallazgos)))
PY
vigilar() {  # vigilar <nombre> <comando...>: ejecuta el comando con el detector activo
  local nombre="$1"; shift
  rm -f "$t/alto"
  python3 -I "$t/vigia.py" "$t/secreto" "$t/secreto-url" "$t/alto" "$t/vigia-$nombre.txt" &
  local vp=$! rc=0
  sleep 0.2
  SHIM_LOG="$t/shim-$nombre.log" PATH="$t/shims:$PATH" "$@" > "$t/ult.log" 2>&1 || rc=$?
  touch "$t/alto"; wait "$vp"
  cp "$t/ult.log" "$t/log-$nombre.txt"
  return "$rc"
}
sin_secreto() {  # sin_secreto <archivos o carpetas...>: ninguno contiene la contraseña (ni codificada)
  ! grep -rqF -f "$t/secreto" "$@" 2>/dev/null && ! grep -rqF -f "$t/secreto-url" "$@" 2>/dev/null
}
vigia_limpio() { [[ -f "$t/vigia-$1.txt" ]] && [[ "$(sed -n 1p "$t/vigia-$1.txt" | cut -d' ' -f2)" -gt 10 ]] && [[ "$(wc -l < "$t/vigia-$1.txt")" == 1 ]]; }

age-keygen -o "$t/clave.txt" 2>/dev/null
destinatario="$(grep -oE 'age1[0-9a-z]+' "$t/clave.txt" | head -n 1)"
mkdir -p "$t/respaldos" "$t/conf"
export PGSERVICEFILE="$t/conf/pg_service.conf" PGPASSFILE="$t/conf/pgpass"

# Origen falso: base Supabase + Auth representativo + migraciones (3 o 4) + datos ficticios + servicio.
origen() {
  local db="$1" con52="$2"
  adm -d postgres -c "create database $db" >/dev/null
  local run=(adm -d "$db")
  "${run[@]}" -f "$dir/base-supabase.sql" >/dev/null
  "${run[@]}" -f "$dir/fixtures/auth-representativo.sql" >/dev/null
  for m in 20261118000315_esquema_inicial.sql 20261118000924_guardar_cotizacion_atomica.sql 20261118022422_numeracion_atomica.sql; do
    "${run[@]}" --single-transaction -f "$repo/supabase/migrations/$m" >/dev/null
  done
  if [[ "$con52" == 1 ]]; then "${run[@]}" --single-transaction -f "$repo/supabase/migrations/20261122120000_guardado_unico_y_contador.sql" >/dev/null; fi
  "${run[@]}" -f "$dir/fixtures/datos-ficticios.sql" >/dev/null
  # La cadena «como la muestra Supabase» (con [YOUR-PASSWORD]) y la contraseña en otra línea, por stdin.
  { printf 'postgresql://%s:[YOUR-PASSWORD]@127.0.0.1:%s/%s?sslmode=disable\n' "$usuario" "$puerto" "$db"; cat "$t/secreto"; printf '\n'; } \
    | COTIZADOR_CONFIG_DIR="$t/conf" python3 -I "$repo/scripts/conexion/configurar-conexion.py" --servicio "o-$db" > "$t/conf-$db.log"
}
respaldar() {  # respaldar <db> [raíz alternativa]: respalda con el script real bajo el detector
  local raiz="${2:-$repo}"
  PG_SERVICIO="o-$1" BACKUP_DIR="$t/respaldos" BACKUP_AGE_RECIPIENT="$destinatario" \
    vigilar "resp-$1" "$raiz/scripts/respaldo-supabase.sh" pgdump || return 1
  grep -oE 'Respaldo listo: .*' "$t/log-resp-$1.txt" | sed 's/Respaldo listo: //'
}
simular() { RESPALDO="$1" CLAVE_AGE="$t/clave.txt" "${2:-$dir/simulacro-restauracion.sh}" > "$t/ult.log" 2>&1; }
simular_carpeta() { RESPALDO="$1" SIMULACRO_CARPETA_FICTICIA=1 "${2:-$dir/simulacro-restauracion.sh}" > "$t/ult.log" 2>&1; }
descifrar() { local d="$t/des-$2"; mkdir -p "$d"; age -d -i "$t/clave.txt" "$1" | tar -x -C "$d"; find "$d" -mindepth 1 -maxdepth 1 -type d | head -n 1; }
resellar() {  # recalcula las sumas del manifiesto (para alterar un respaldo «con sumas coherentes»)
  (cd "$1" && { grep -vE ' (roles\.sql|schema\.sql|data\.sql|auth-columnas\.txt|verificacion-origen\.txt)$' manifiesto.txt
               sha256sum $(ls roles.sql schema.sql data.sql auth-columnas.txt verificacion-origen.txt 2>/dev/null); } > m && mv m manifiesto.txt)
}
copia() { local d="$t/copias/$2/respaldo-$2"; mkdir -p "$(dirname "$d")"; cp -R "$1" "$d"; echo "$d"; }
# Árbol mutante fuera del repositorio: copia de scripts/ con un archivo alterado; supabase/ enlazado.
mutante() {  # mutante <nombre> <archivo relativo a scripts/> <expresión sed>
  local m="$t/mut-$1"; mkdir -p "$m"; cp -R "$repo/scripts" "$m/scripts"; ln -s "$repo/supabase" "$m/supabase"
  sed -i "$3" "$m/scripts/$2"
  if cmp -s "$m/scripts/$2" "$repo/scripts/$2"; then echo "MUTACIÓN NO APLICADA: $1" >&2; fi
  echo "$m"
}
alterar() {  # alterar <data.sql> <esquema.tabla> <columna> <valor nuevo>: cambia esa columna de la 1.ª fila
  python3 -I - "$@" <<'PY'
import re, sys
ruta, tabla, col, nuevo = sys.argv[1:5]
lineas = open(ruta, encoding='utf-8').read().split('\n')
for i, l in enumerate(lineas):
    m = re.match(r'^COPY ' + re.escape(tabla) + r' \((.*)\) FROM stdin;$', l)
    if m:
        cols = [c.strip().strip('"') for c in m.group(1).split(',')]
        campos = lineas[i + 1].split('\t')
        assert campos[cols.index(col)] != nuevo
        campos[cols.index(col)] = nuevo
        lineas[i + 1] = '\t'.join(campos)
        break
else:
    sys.exit(f'no está {tabla}')
open(ruta, 'w', encoding='utf-8').write('\n'.join(lineas))
PY
}

sello="$(date +%s)"
echo "== A · conexión segura con credenciales FICTICIAS (contraseña con : \\ @ % /, servidor con scram-sha-256)"
origen "pre_$sello" 0
check "A1 configurar-conexion.py: pg_service.conf y pgpass con permisos 600 y carpeta 700" '[[ "$(stat -c %a "$t/conf/pg_service.conf")" == 600 && "$(stat -c %a "$t/conf/pgpass")" == 600 && "$(stat -c %a "$t/conf")" == 700 ]]'
check "A2 pg_service.conf sin contraseña; la salida del asistente tampoco la muestra" 'sin_secreto "$t/conf/pg_service.conf" "$t/conf-pre_$sello.log" && ! grep -q "^password" "$t/conf/pg_service.conf"'
if PG_SERVICIO="o-pre_$sello" vigilar conexion "$repo/scripts/conexion/probar-conexion.sh"; then a3=0; else a3=$?; fi
check "A3 probar-conexion.sh conecta solo con service=… (pgpass escapado correctamente)" '[[ $a3 == 0 ]] && grep -q "Conexión correcta: PostgreSQL" "$t/log-conexion.txt"'

echo "== E1 · origen ANTES de #52: respaldo real (pgdump + age) con el detector de credenciales activo"
# Frente C: un enlace que vence 3 s después de crearse, justo antes del respaldo.
adm -d "pre_$sello" -c "insert into public.quote_shares (owner_id, quote_id, token_hash, expires_at) select owner_id, id, extensions.digest('vence-pronto', 'sha256'), now() + interval '3 seconds' from public.client_quotes where owner_id = 'a0000000-0000-4000-8000-00000000000a' order by number desc limit 1" >/dev/null
creado_vence="$(date +%s)"
r1="$(respaldar "pre_$sello")" || r1=""
check "E1 respaldo cifrado creado" '[[ -n "$r1" && -f "$r1" && "$r1" == *.tar.age ]]'
check "A4 la contraseña no aparece en ningún argumento de psql/pg_dump (registro de llamadas)" '[[ -s "$t/shim-resp-pre_$sello.log" ]] && sin_secreto "$t/shim-resp-pre_$sello.log" && grep -q "service=o-pre_$sello" "$t/shim-resp-pre_$sello.log"'
check "A5 ni en el entorno de ningún proceso (sin PGPASSWORD) ni en argumentos de otros procesos (/proc vigilado)" '! grep -q "^PGPASSWORD" "$t/shim-resp-pre_$sello.log" && vigia_limpio "resp-pre_$sello"'
d1="$(descifrar "$r1" e1)"
check "A6 ni en la salida del respaldo ni en ningún archivo del respaldo descifrado" 'sin_secreto "$t/log-resp-pre_$sello.txt" "$d1"'
check "C· el manifiesto guarda el instante de referencia y la verificación cuenta el enlace que vence" 'grep -qE "^referencia_utc: [0-9T:Z-]+$" "$d1/manifiesto.txt" && grep -q "^conteo.public.quote_shares_vigentes_en_referencia | 2 |" "$d1/verificacion-origen.txt"'
while (( $(date +%s) < creado_vence + 4 )); do sleep 0.5; done
if simular "$r1"; then e1=0; else e1=$?; fi
check "E1 simulacro: DATOS VERIFICADOS (código 0), con el enlace ya vencido (Frente C)" '[[ $e1 == 0 ]] && grep -q "RESULTADO: DATOS VERIFICADOS" "$t/ult.log"'
check "E1 compara el contenido completo de 8 tablas y aclara que no prueba Supabase Auth" 'grep -q "contenido completo de 8 tablas" "$t/ult.log" && grep -q "NO prueba que Supabase Auth funcione" "$t/ult.log"'
check "E1 aplicó solo las 3 migraciones anteriores (nunca la de #52)" 'grep -q "ANTES de #52" "$t/ult.log" && ! grep -q "migración aplicada: 20261122120000" "$t/ult.log"'
check "E1 Auth recreado con los tipos del origen (34 + 1 generada en users)" 'grep -qE "auth.users: 35 columnas" "$t/ult.log"'
grep -E "RESULTADO|columnas|referencia|conservada|omitida" "$t/ult.log" | sed 's/^/   /'

echo "== A · rechazos explícitos y errores saneados"
cp "$PGPASSFILE" "$t/pgpass.bueno"
corre() { PG_SERVICIO="o-pre_$sello" BACKUP_DIR="$t/respaldos" BACKUP_AGE_RECIPIENT="$destinatario" "$@" > "$t/ult.log" 2>&1; }
if corre env SUPABASE_DB_URL_FILE=/dev/null "$repo/scripts/respaldo-supabase.sh" pgdump; then x=0; else x=1; fi
check "A7 rechaza el método antiguo (SUPABASE_DB_URL_FILE)" '[[ $x == 1 ]] && grep -q "ya no se usan" "$t/ult.log"'
if corre env PGPASSWORD=x "$repo/scripts/respaldo-supabase.sh" pgdump; then x=0; else x=1; fi
check "A8 rechaza PGPASSWORD" '[[ $x == 1 ]] && grep -q "no uses la variable PGPASSWORD" "$t/ult.log"'
if corre "$repo/scripts/respaldo-supabase.sh" cli; then x=0; else x=1; fi
check "A9 rechaza el modo cli (exigiría la contraseña en --db-url)" '[[ $x == 1 ]] && grep -q "modo cli está desactivado" "$t/ult.log"'
chmod 644 "$PGPASSFILE"
if corre "$repo/scripts/respaldo-supabase.sh" pgdump; then x=0; else x=1; fi
chmod 600 "$PGPASSFILE"
check "A10 rechaza un pgpass con permisos 644" '[[ $x == 1 ]] && grep -q "tiene permisos 644" "$t/ult.log"'
cp "$PGSERVICEFILE" "$t/srv.bueno"; printf 'password=x\n' >> "$PGSERVICEFILE"
if corre "$repo/scripts/respaldo-supabase.sh" pgdump; then x=0; else x=1; fi
cp "$t/srv.bueno" "$PGSERVICEFILE"
check "A11 rechaza una contraseña dentro de pg_service.conf" '[[ $x == 1 ]] && grep -q "no debe contener la contraseña" "$t/ult.log"'
if printf 'postgresql://u:[YOUR-PASSWORD]@h:5432/postgres\nx\n' | COTIZADOR_CONFIG_DIR="$repo/.prueba-conf" python3 -I "$repo/scripts/conexion/configurar-conexion.py" > "$t/ult.log" 2>&1; then x=0; else x=1; fi
check "A12 el asistente se niega a guardar la configuración dentro del repositorio" '[[ $x == 1 ]] && grep -q "dentro del repositorio" "$t/ult.log" && [[ ! -e "$repo/.prueba-conf" ]]'
if printf 'postgresql://u:[YOUR-PASSWORD]@h:6543/postgres\nx\n' | COTIZADOR_CONFIG_DIR="$t/otra-conf" python3 -I "$repo/scripts/conexion/configurar-conexion.py" > "$t/ult.log" 2>&1; then x=0; else x=1; fi
check "A13 el asistente rechaza el transaction pooler (puerto 6543)" '[[ $x == 1 ]] && grep -q "6543" "$t/ult.log"'
# Contraseña equivocada: falla, y el mensaje no muestra usuario, servidor ni contraseña.
python3 -I - "$PGPASSFILE" "$t/clave-mala" <<'PY'
import sys
ruta, mala = sys.argv[1], open(sys.argv[2]).read().strip()
lineas = open(ruta).read().splitlines()
lineas = [l.rsplit(':', 1)[0].rstrip('\\') if False else l for l in lineas]
out = []
for l in lineas:
    i, campos = 0, 0
    while campos < 4:
        if l[i] == '\\': i += 2; continue
        if l[i] == ':': campos += 1
        i += 1
    out.append(l[:i] + mala.replace('\\', '\\\\').replace(':', '\\:'))
open(ruta, 'w').write('\n'.join(out) + '\n')
PY
if PG_SERVICIO="o-pre_$sello" BACKUP_DIR="$t/respaldos" BACKUP_AGE_RECIPIENT="$destinatario" vigilar mala "$repo/scripts/respaldo-supabase.sh" pgdump; then x=0; else x=1; fi
cp "$t/pgpass.bueno" "$PGPASSFILE"
check "A14 contraseña equivocada: falla con un mensaje SANEADO (<usuario>, <servidor>; sin usuario, IP ni contraseña)" '[[ $x == 1 ]] && grep -q "<usuario>" "$t/log-mala.txt" && ! grep -q "$usuario" "$t/log-mala.txt" && ! grep -q "127.0.0.1" "$t/log-mala.txt" && ! grep -qF "INCORRECTA" "$t/log-mala.txt" && sin_secreto "$t/log-mala.txt"'
sed -n '/ERROR\|FATAL\|failed/p' "$t/log-mala.txt" | head -n 2 | sed 's/^/   /'

echo "== T · TLS: verify-full con certificado raíz; todo lo demás se rechaza (sin la excepción de prueba)"
sin_exc() { env -u COTIZADOR_PRUEBA_LOCAL_SIN_TLS "$@"; }
mkdir -p "$t/conf-vacia"
if printf 'postgresql://u:[YOUR-PASSWORD]@db.ejemplo.invalid:5432/postgres\nNO-DEBE-PEDIRSE\n' | sin_exc env COTIZADOR_CONFIG_DIR="$t/conf-vacia" python3 -I "$repo/scripts/conexion/configurar-conexion.py" > "$t/ult.log" 2>&1; then x=0; else x=1; fi
check "T1 asistente sin el certificado: se detiene ANTES de pedir la contraseña y no escribe nada" '[[ $x == 1 ]] && grep -q "no existe el certificado" "$t/ult.log" && [[ ! -e "$t/conf-vacia/pgpass" && ! -e "$t/conf-vacia/pg_service.conf" ]]'
{ printf 'postgresql://%s:[YOUR-PASSWORD]@localhost:%s/pre_%s?sslmode=require\n' "$usuario" "$puerto" "$sello"; cat "$t/secreto"; printf '\n'; } \
  | sin_exc env COTIZADOR_CONFIG_DIR="$t/conf" python3 -I "$repo/scripts/conexion/configurar-conexion.py" --servicio tls --certificado "$t/tls/ca.crt" > "$t/ult.log" 2>&1 || true
seccion_tls() { python3 -I -c 'import configparser,sys; c=configparser.ConfigParser(interpolation=None); c.optionxform=str; c.read(sys.argv[1]); print("\n".join(f"{k}={v}" for k,v in c["tls"].items()))' "$PGSERVICEFILE"; }
check "T2 asistente: escribe sslmode=verify-full, sslrootcert y gssencmode=disable, aunque la cadena traiga sslmode=require" 'seccion_tls | grep -qx "sslmode=verify-full" && seccion_tls | grep -qx "sslrootcert=$t/tls/ca.crt" && seccion_tls | grep -qx "gssencmode=disable" && grep -q "se usará sslmode=verify-full" "$t/ult.log"'
if PG_SERVICIO=tls sin_exc "$repo/scripts/conexion/probar-conexion.sh" > "$t/ult.log" 2>&1; then x=0; else x=1; fi
check "T3 verify-full con la CA correcta: conecta y confirma «TLS verificado»" '[[ $x == 0 ]] && grep -q "TLS verificado (verify-full" "$t/ult.log"'
if (unset COTIZADOR_PRUEBA_LOCAL_SIN_TLS; PG_SERVICIO=tls BACKUP_DIR="$t/respaldos" BACKUP_AGE_RECIPIENT="$destinatario" vigilar tls-resp "$repo/scripts/respaldo-supabase.sh" pgdump); then x=0; else x=1; fi
check "T4 el respaldo completo funciona por TLS verificado, sin la contraseña en argumentos ni /proc" '[[ $x == 0 ]] && grep -q "Respaldo listo" "$t/log-tls-resp.txt" && sin_secreto "$t/shim-tls-resp.log" "$t/log-tls-resp.txt" && vigia_limpio tls-resp'
# Variantes de la sección [tls] editadas «a mano» en una copia de pg_service.conf.
variante() {  # variante <nombre> <operaciones...>: k=v cambia o agrega, -k quita, ^línea antepone tal cual
  python3 -I - "$PGSERVICEFILE" "$t/conf/v-$1.conf" "${@:2}" <<'PY'
import configparser, sys
c = configparser.ConfigParser(interpolation=None); c.optionxform = str; c.read(sys.argv[1])
d = dict(c['tls']); antes = []
for op in sys.argv[3:]:
    if op.startswith('-'): d.pop(op[1:], None)
    elif op.startswith('^'): antes.append(op[1:])
    else: k, v = op.split('=', 1); d[k] = v
open(sys.argv[2], 'w').write('[tls]\n' + ''.join(l + '\n' for l in antes) + ''.join(f'{k}={v}\n' for k, v in d.items()))
PY
}
con_variante() { PGSERVICEFILE="$t/conf/v-$1.conf" PG_SERVICIO=tls sin_exc "${2:-$repo}/scripts/conexion/probar-conexion.sh" > "$t/ult.log" 2>&1; }
rechaza() {  # rechaza <id> <descripción> <variante> <mensaje esperado>
  if con_variante "$3"; then x=0; else x=1; fi
  esperado="$4"
  check "$1 $2 → rechazado («$4»)" '[[ $x == 1 ]] && grep -qF -- "$esperado" "$t/ult.log" && ! grep -q "Conexión correcta" "$t/ult.log"'
}
antes_auth="$(grep -c "password authentication failed" "$t/pg.log" || true)"
variante otra-ca "sslrootcert=$t/tls/otra-ca.crt"
rechaza T5 "certificado de OTRA CA" otra-ca "certificate verify failed"
check "T6 … y la contraseña no llegó al servidor: se cortó en TLS, sin intento de autenticación" '[[ "$(grep -c "password authentication failed" "$t/pg.log" || true)" == "$antes_auth" ]]'
variante otro-nombre "host=127.0.0.1"
rechaza T7 "nombre de servidor distinto del certificado (127.0.0.1 vs localhost)" otro-nombre "does not match host name"
variante falta "sslrootcert=$t/tls/no-existe.crt"
rechaza T8 "certificado faltante" falta "no existe el certificado"
n=8
for modo in disable allow prefer require verify-ca; do
  n=$((n + 1)); variante "modo-$modo" "sslmode=$modo"
  rechaza "T$n" "sslmode=$modo editado a mano" "modo-$modo" "sslmode=$modo no verifica la identidad del servidor"
done
variante sin-modo -sslmode;                       rechaza T14 "sin sslmode (libpq usaría prefer)" sin-modo "sslmode=(sin definir)"
variante duplicado "^sslmode=disable";            rechaza T15 "sslmode=disable antes de verify-full (libpq usa la primera)" duplicado "repetido"
variante system "sslrootcert=system";             rechaza T16 "sslrootcert=system" system "no «system»"
variante sin-cert -sslrootcert;                   rechaza T17 "verify-full sin sslrootcert" sin-cert "sslrootcert debe ser la ruta"
variante basura "sslrootcert=$t/tls/basura.crt";  rechaza T18 "archivo que no es un certificado" basura "no es un certificado válido"
variante hoja "sslrootcert=$t/tls/server.crt";    rechaza T19 "certificado de servidor en lugar de la CA raíz" hoja "no contiene un certificado raíz"
variante gss "gssencmode=prefer";                 rechaza T20 "gssencmode=prefer" gss "gssencmode=disable"
variante extra "requiressl=1";                    rechaza T21 "parámetro extra (requiressl)" extra "no permitidos: requiressl"
cp "$t/tls/ca.crt" "$t/tls/ca-escribible.crt"; chmod 666 "$t/tls/ca-escribible.crt"
variante escribible "sslrootcert=$t/tls/ca-escribible.crt"; rechaza T22 "certificado modificable por otros (666)" escribible "no debe poder modificarlo nadie más"
variante ok
for v in PGSSLMODE=disable PGSSLROOTCERT=/dev/null PGGSSENCMODE=prefer PGREQUIRESSL=0; do
  n=$((n + 1)); if PGSERVICEFILE="$t/conf/v-ok.conf" PG_SERVICIO=tls sin_exc env "$v" "$repo/scripts/conexion/probar-conexion.sh" > "$t/ult.log" 2>&1; then x=0; else x=1; fi
  esperado="no uses la variable ${v%%=*}"
  check "T$((n + 9)) variable ${v%%=*} en el entorno → rechazada" '[[ $x == 1 ]] && grep -qF -- "$esperado" "$t/ult.log"'
done
variante remoto "host=db.ejemplo.invalid" "sslmode=disable"
if PGSERVICEFILE="$t/conf/v-remoto.conf" PG_SERVICIO=tls "$repo/scripts/conexion/probar-conexion.sh" > "$t/ult.log" 2>&1; then x=0; else x=1; fi
check "T27 la excepción de prueba NO vale para un servidor remoto" '[[ $x == 1 ]] && grep -q "solo vale para un servidor local" "$t/ult.log"'
if PGSERVICEFILE="$t/conf/v-remoto.conf" PG_SERVICIO=tls COTIZADOR_PRUEBA_LOCAL_SIN_TLS=1 "$repo/scripts/conexion/probar-conexion.sh" > "$t/ult.log" 2>&1; then x=0; else x=1; fi
check "T28 la excepción exige su valor exacto" '[[ $x == 1 ]] && grep -q "solo admite el valor exacto" "$t/ult.log"'
if PG_SERVICIO="o-pre_$sello" sin_exc "$repo/scripts/conexion/probar-conexion.sh" > "$t/ult.log" 2>&1; then x=0; else x=1; fi
check "T29 sin la excepción, ni siquiera un servidor local acepta sslmode=disable" '[[ $x == 1 ]] && grep -q "sslmode=disable no verifica" "$t/ult.log"'
if printf 'postgresql://u:[YOUR-PASSWORD]@db.ejemplo.invalid:5432/postgres\nx\n' | COTIZADOR_CONFIG_DIR="$t/conf-vacia" python3 -I "$repo/scripts/conexion/configurar-conexion.py" > "$t/ult.log" 2>&1; then x=0; else x=1; fi
check "T30 el asistente con la excepción y un servidor remoto se niega (no escribe sslmode=disable)" '[[ $x == 1 ]] && grep -q "solo vale para un servidor local" "$t/ult.log" && [[ ! -e "$t/conf-vacia/pg_service.conf" ]]'

echo "== E2 · origen DESPUÉS de #52 + verificaciones de solo lectura (V1–V17) con la conexión segura"
origen "post_$sello" 1
r2="$(respaldar "post_$sello")" || r2=""
if simular "$r2"; then e2=0; else e2=$?; fi
check "E2 simulacro: DATOS VERIFICADOS" '[[ $e2 == 0 ]] && grep -q "RESULTADO: DATOS VERIFICADOS" "$t/ult.log"'
check "E2 aplicó las 4 migraciones (estado DESPUÉS de #52 detectado)" 'grep -q "DESPUÉS de #52" "$t/ult.log" && grep -q "migración aplicada: 20261122120000" "$t/ult.log"'
if PG_SERVICIO="o-post_$sello" SALIDA="$t/verificacion-52.txt" vigilar sololectura "$repo/scripts/verificar-solo-lectura.sh"; then x=0; else x=$?; fi
check "A15 verificar-solo-lectura.sh: V1–V17 completas, V17 = on, salida 600" '[[ $x == 0 ]] && grep -q "V17: on" "$t/log-sololectura.txt" && grep -q "V1 ·" "$t/verificacion-52.txt" && grep -q "V16 ·" "$t/verificacion-52.txt" && [[ "$(stat -c %a "$t/verificacion-52.txt")" == 600 ]]'
check "A16 solo lectura sin la contraseña en argumentos, entorno, /proc ni resultado" 'sin_secreto "$t/shim-sololectura.log" "$t/log-sololectura.txt" "$t/verificacion-52.txt" && vigia_limpio sololectura && grep -q "service=o-post_$sello" "$t/shim-sololectura.log"'

echo "== E3 · volcado de TODOS los esquemas (identificadores entre comillas, tablas internas, cambios de rol)"
c="$t/cli/respaldo-cli"; mkdir -p "$c"
"$pgbin/pg_dump" -h "$t/s" -p "$puerto" -U postgres -d "pre_$sello" --data-only --quote-all-identifiers --use-set-session-authorization -f "$c/data.sql"
printf -- '-- roles\n' > "$c/roles.sql"; printf -- '-- schema\n' > "$c/schema.sql"
cp "$d1/auth-columnas.txt" "$c/"
ref_c="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
adm -A -t -F ' | ' -v referencia="$ref_c" -d "pre_$sello" -f "$repo/scripts/verificar-restauracion.sql" > "$c/verificacion-origen.txt"
{ echo "referencia_utc: $ref_c"; echo "modo: cli"; echo "postgres_servidor: $(adm -A -t -d postgres -c 'show server_version_num')"; } > "$c/manifiesto.txt"; resellar "$c"
if simular_carpeta "$c"; then e3=0; else e3=$?; fi
check "E3 DATOS VERIFICADOS; omitió tablas internas y cambios de rol sin mostrar su contenido" '[[ $e3 == 0 ]] && grep -q "omitida (fuera del alcance del simulacro): auth.sessions (1 filas)" "$t/ult.log" && grep -q "cambio de rol" "$t/ult.log" && ! grep -q tokenficticio "$t/ult.log"'

echo "== B · alterar el CONTENIDO (sumas SHA-256 coherentes) → HAY DIFERENCIAS en la huella de contenido"
# Cada caso cambia UNA columna que las huellas antiguas (ids, números, total) no cubrían.
n=0; huellas_antiguas=0
for caso in "public.jobs|client_name|Cliente alterado|cliente del trabajo" \
            "public.jobs|net_price|49999|precio cobrado del trabajo" \
            "public.jobs|internal|{\"engineVersion\": \"alterada\"}|JSON interno" \
            "public.vehicles|km_per_l|12.5|rendimiento de un vehículo" \
            "auth.users|email|otra@prueba.invalid|correo en Auth" \
            "auth.users|encrypted_password|\$2a\$10\$ALTERADOALTERADOALTERADOALTERADOALTERADOALTERADOALTERA|hash de contraseña en Auth"; do
  IFS='|' read -r tabla col valor desc <<<"$caso"; n=$((n + 1))
  cb="$(copia "$d1" "b$n")"; alterar "$cb/data.sql" "$tabla" "$col" "$valor"; resellar "$cb"
  if simular_carpeta "$cb"; then x=0; else x=$?; fi
  check "B$n alterar $desc ($tabla.$col) → HAY DIFERENCIAS en contenido.$tabla" '[[ $x == 2 ]] && grep -q "^[-+]contenido.$tabla " "$t/ult.log" && ! grep -q "DATOS VERIFICADOS" "$t/ult.log"'
  if grep -qE "^[-+](huella|conteo)\." "$t/ult.log"; then huellas_antiguas=$((huellas_antiguas + 1)); fi
done
check "B7 en los 6 casos ninguna huella antigua (ids, números, conteos) cambió: solo las detecta el contenido" '[[ $huellas_antiguas == 0 ]]'

echo "== B · formatos o datos no reconocidos → error explícito (nunca «DATOS VERIFICADOS»)"
formato() {  # formato <nombre> <mensaje esperado> <comando que altera la copia $cf>
  cf="$(copia "$d1" "$1")"; esperado="$2"; eval "$3"; resellar "$cf"
  if simular_carpeta "$cf"; then x=0; else x=$?; fi
  check "B· $1 → «$2»" '[[ $x != 0 ]] && grep -qF -- "$esperado" "$t/ult.log" && ! grep -q "DATOS VERIFICADOS" "$t/ult.log"'
}
editar_copy() {  # editar_copy <data.sql> <esquema.tabla> quitar-tabla|quitar-campo
  python3 -I - "$@" <<'PY'
import sys
ruta, tabla, accion = sys.argv[1:4]
lineas = open(ruta, encoding='utf-8').read().split('\n')
i = next(k for k, l in enumerate(lineas) if l.startswith(f'COPY {tabla} ('))
if accion == 'quitar-campo':
    lineas[i + 1] = lineas[i + 1].rsplit('\t', 1)[0]
else:
    j = next(k for k in range(i, len(lineas)) if lineas[k] == '\\.')
    del lineas[i:j + 1]
open(ruta, 'w', encoding='utf-8').write('\n'.join(lineas))
PY
}
formato insert "usa INSERT" 'printf "INSERT INTO public.jobs VALUES (1);\n" >> "$cf/data.sql"'
formato tabla-desconocida "public.extra no reconocida" 'printf "COPY public.extra (id) FROM stdin;\n1\n\\\\.\n" >> "$cf/data.sql"'
formato fila-incompleta "no tiene" 'editar_copy "$cf/data.sql" public.vehicles quitar-campo'
formato copy-binario "opciones no reconocidas" 'sed -i "s/^\(COPY public.profiles .*\) FROM stdin;$/\1 FROM stdin WITH (FORMAT binary);/" "$cf/data.sql"'
formato sentencia-desconocida "sentencia no reconocida" 'printf "ALTER TABLE public.jobs DISABLE TRIGGER ALL;\n" >> "$cf/data.sql"'
formato codificacion "codificación LATIN1" 'sed -i "s/^SET client_encoding = .*/SET client_encoding = '"'"'LATIN1'"'"';/" "$cf/data.sql"'
formato tipo-auth-desconocido "no reconocido por el simulacro" 'sed -i "0,/\ttimestamp with time zone\t/s//\tauth.tipo_propio\t/" "$cf/auth-columnas.txt"'
formato columnas-auth-distintas "no coinciden con auth-columnas.txt" 'sed -i "/^users\t[0-9]*\tphone\t/d" "$cf/auth-columnas.txt"'
formato falta-tabla "no trae datos de: public.vehicles" 'editar_copy "$cf/data.sql" public.vehicles quitar-tabla'
formato respaldo-antiguo "no trae auth-columnas.txt" 'rm "$cf/auth-columnas.txt"'
formato sin-referencia "referencia_utc válido" 'sed -i "/^referencia_utc:/d" "$cf/manifiesto.txt"'
if adm -A -t -d "pre_$sello" -f "$repo/scripts/verificar-restauracion.sql" > "$t/ult.log" 2>&1; then x=0; else x=1; fi
check "C· verificar-restauracion.sql sin -v referencia → error explícito" '[[ $x == 1 ]] && grep -q "falta el instante de referencia" "$t/ult.log"'

echo "== Controles anteriores (A-77)"
psql_s() { adm -d "stub_$sello" "$@"; }
adm -d postgres -c "create database stub_$sello" >/dev/null
psql_s -f "$repo/scripts/diseno/stub-supabase.sql" -c "create extension if not exists pgcrypto with schema extensions" -c "create table if not exists auth.identities (id uuid primary key, user_id uuid)" >/dev/null
for m in 20261118000315_esquema_inicial.sql 20261118000924_guardar_cotizacion_atomica.sql 20261118022422_numeracion_atomica.sql; do psql_s --single-transaction -f "$repo/supabase/migrations/$m" >/dev/null; done
if psql_s --single-transaction -c 'SET session_replication_role = replica' -f "$d1/data.sql" > "$t/ult.log" 2>&1; then x=0; else x=1; fi
check "C1 el stub mínimo (auth.users con id y email) no puede cargar un respaldo real" '[[ $x == 1 ]] && grep -q "does not exist" "$t/ult.log"'
cf="$(copia "$d1" c2)"
python3 -I - "$cf/data.sql" <<'PY'
import sys
p = sys.argv[1]; out = []; dentro = quitado = False
for line in open(p, encoding='utf-8'):
    if line.startswith('COPY public.jobs '): dentro = True; out.append(line); continue
    if dentro and not quitado and line.strip() != '\\.': quitado = True; continue
    if line.strip() == '\\.': dentro = False
    out.append(line)
open(p, 'w', encoding='utf-8').writelines(out)
PY
resellar "$cf"
if simular_carpeta "$cf"; then x=0; else x=$?; fi
check "C2 falta una cotización → HAY DIFERENCIAS (código 2, conteo de jobs)" '[[ $x == 2 ]] && grep -q "conteo.public.jobs" "$t/ult.log"'
cf="$(copia "$d1" c3)"; echo '-- alterado' >> "$cf/data.sql"
if simular_carpeta "$cf"; then x=0; else x=$?; fi
check "C3 data.sql alterado sin actualizar el manifiesto → «las sumas SHA-256 no coinciden»" '[[ $x != 0 ]] && grep -q "sumas SHA-256 no coinciden" "$t/ult.log"'
cf="$(copia "$d1" c4)"; sed -i 's/^postgres_servidor: .*/postgres_servidor: 990000/' "$cf/manifiesto.txt"
if simular_carpeta "$cf"; then x=0; else x=$?; fi
check "C4 versión de PostgreSQL más nueva que la local → «instala PostgreSQL 99»" '[[ $x != 0 ]] && grep -q "instala PostgreSQL 99" "$t/ult.log"'
age-keygen -o "$t/otra.txt" 2>/dev/null
if RESPALDO="$r1" CLAVE_AGE="$t/otra.txt" "$dir/simulacro-restauracion.sh" > "$t/ult.log" 2>&1; then x=0; else x=$?; fi
check "C5 clave de age equivocada → «no se pudo descifrar»" '[[ $x != 0 ]] && grep -q "no se pudo descifrar" "$t/ult.log"'

echo "== Mutaciones: el detector y las comprobaciones fallan si se reintroduce el defecto"
m="$(mutante m1 simulacro/simulacro-restauracion.sh 's/estado="anterior"; migraciones=("${anteriores_52\[@\]}")/estado="anterior"; migraciones=("${anteriores_52[@]}" "$migracion_52")/')"
if simular "$r1" "$m/scripts/simulacro/simulacro-restauracion.sh"; then x=0; else x=$?; fi
check "M1 aplicar #52 a un origen anterior → se detiene («no quedó en el estado del origen»)" '[[ $x != 0 ]] && grep -q "no quedó en el estado del origen" "$t/ult.log"'
# M2: la contraseña en la cadena de conexión (como el método antiguo) → el detector lo ve.
python3 -I - "$t/pgpass.bueno" > "$t/conf/clave-cruda" <<'PY'
import sys
l = open(sys.argv[1]).read().splitlines()[0]; i = c = 0
while c < 4:
    if l[i] == '\\': i += 2; continue
    if l[i] == ':': c += 1
    i += 1
print(l[i:].replace('\\:', ':').replace('\\\\', '\\'), end='')
PY
m="$(mutante m2 conexion/conexion.sh 's|CONEXION="service=$PG_SERVICIO"|CONEXION="service=$PG_SERVICIO password=$(cat "$(dirname "$PGPASSFILE")/clave-cruda")"|')"
respaldar "pre_$sello" "$m" >/dev/null || true
rm -f "$t/conf/clave-cruda"
check "M2a contraseña en la cadena de conexión → el registro de llamadas la detecta (A4 fallaría)" '! sin_secreto "$t/shim-resp-pre_$sello.log"'
check "M2b … y la vigilancia de /proc también, por su cuenta (A5 fallaría)" '! vigia_limpio "resp-pre_$sello"'
m="$(mutante m3 conexion/conexion.sh 's|python3 -I "$_conexion_dir/sanear.py" < "$err" >\&2|cat "$err" >\&2|')"
cp "$PGPASSFILE" "$t/pgpass.tmp"; sed -i 's/[^:]*$/OTRA/' "$PGPASSFILE"
if PG_SERVICIO="o-pre_$sello" BACKUP_DIR="$t/respaldos" BACKUP_AGE_RECIPIENT="$destinatario" "$m/scripts/respaldo-supabase.sh" pgdump > "$t/ult.log" 2>&1; then x=0; else x=1; fi
cp "$t/pgpass.tmp" "$PGPASSFILE"
check "M3 sin sanear los errores → el usuario aparece en el mensaje (A14 fallaría)" 'grep -q "$usuario" "$t/ult.log"'
m="$(mutante m4 verificar-restauracion.sql '/^  union all select .contenido\./d')"
cb="$t/copias/m4"; mkdir -p "$cb"
r4="$(respaldar "pre_$sello" "$m")"; d4="$(descifrar "$r4" m4)"; cp -R "$d4" "$cb/respaldo-m4"; alterar "$cb/respaldo-m4/data.sql" public.jobs client_name "Cliente alterado"; resellar "$cb/respaldo-m4"
if simular_carpeta "$cb/respaldo-m4" "$m/scripts/simulacro/simulacro-restauracion.sh"; then x=0; else x=$?; fi
check "M4 con las huellas antiguas (sin contenido.*) alterar un cliente NO se detecta (por eso B1–B6 las necesitan)" '[[ $x == 0 ]]'
m="$(mutante m5 verificar-restauracion.sql 's/expires_at > (select instante from ref)/expires_at > now()/')"
if simular "$r1" "$m/scripts/simulacro/simulacro-restauracion.sh"; then x=0; else x=$?; fi
check "M5 contar enlaces vigentes con now() (lo anterior) → diferencia FALSA por el enlace vencido (Frente C)" '[[ $x == 2 ]] && grep -q "quote_shares_vigentes_en_referencia" "$t/ult.log"'
m="$(mutante m6 simulacro/procesar-respaldo.py "s/raise ErrorRespaldo(f'línea {n}: sentencia no reconocida/continue  # /")"
cf="$(copia "$d1" m6)"; printf "ALTER TABLE public.jobs DISABLE TRIGGER ALL;\n" >> "$cf/data.sql"; resellar "$cf"
if simular_carpeta "$cf" "$m/scripts/simulacro/simulacro-restauracion.sh"; then x=0; else x=$?; fi
check "M6 si las sentencias desconocidas se omitieran (como en A-77), pasaría «DATOS VERIFICADOS» en silencio" '[[ $x == 0 ]] && grep -q "DATOS VERIFICADOS" "$t/ult.log"'
m="$(mutante m7 verificar-restauracion.sql "/^set timezone = 'UTC';/d")"
r7="$(respaldar "pre_$sello" "$m")"
if simular "$r7" "$m/scripts/simulacro/simulacro-restauracion.sh"; then x=0; else x=$?; fi
check "M7 sin fijar la zona horaria, origen (America/Santiago) y simulacro difieren → las huellas lo muestran" '[[ $x == 2 ]] && grep -q "^[-+]contenido.auth.users" "$t/ult.log"'
m="$(mutante m8 simulacro/procesar-respaldo.py "s/            if generada == 's':/            if False:/")"
if simular "$r1" "$m/scripts/simulacro/simulacro-restauracion.sh"; then x=0; else x=$?; fi
check "M8 Auth sin sus columnas generadas → HAY DIFERENCIAS en contenido.auth.* (los tipos del origen importan)" '[[ $x == 2 ]] && grep -q "^[-+]contenido.auth" "$t/ult.log"'

echo "== Mutaciones de la política TLS: cada defecto reintroducido deja pasar una configuración insegura"
m="$(mutante mt1 conexion/sanear.py "s/        if sec.get('sslmode') != 'verify-full':/        if False:/")"
if con_variante modo-require "$m"; then x=0; else x=1; fi
check "MT1 sin exigir verify-full, sslmode=require conecta (T12 lo detecta)" '[[ $x == 0 ]] && grep -q "Conexión correcta" "$t/ult.log"'
m="$(mutante mt2 conexion/sanear.py "s/cp = leer_servicios(os.environ\['PGSERVICEFILE'\], estricto=True)/cp = leer_servicios(os.environ['PGSERVICEFILE'])/")"
if con_variante duplicado "$m"; then x=0; else x=1; fi
check "MT2 aceptando claves repetidas, «sslmode=disable» antepuesto conecta SIN TLS (T15 lo detecta)" '[[ $x == 0 ]] && grep -q "SIN TLS" "$t/ult.log"'
m="$(mutante mt3 conexion/sanear.py "s/    if not es_loopback(host):/    if False:/")"
if printf 'postgresql://u:[YOUR-PASSWORD]@db.ejemplo.invalid:5432/postgres\nx\n' | COTIZADOR_CONFIG_DIR="$t/conf-mt3" python3 -I "$m/scripts/conexion/configurar-conexion.py" > "$t/ult.log" 2>&1; then x=0; else x=1; fi
check "MT3 excepción sin límite de loopback: el asistente escribe sslmode=disable para un servidor remoto (T30 lo detecta)" '[[ $x == 0 ]] && grep -q "^sslmode=disable" "$t/conf-mt3/pg_service.conf"'
m="$(mutante mt4 conexion/sanear.py "s/    if sec.get('gssencmode') != 'disable':/    if False:/")"
if con_variante gss "$m"; then x=0; else x=1; fi
check "MT4 sin exigir gssencmode=disable, gssencmode=prefer pasa (T20 lo detecta)" '[[ $x == 0 ]]'
m="$(mutante mt5 conexion/sanear.py "s/    cas = ctx.get_ca_certs()/    cas = [{'notAfter': 'Jan  1 00:00:00 2999 GMT'}]/")"
if con_variante hoja "$m"; then x=0; else x=$?; fi
check "MT5 sin comprobar que sea una CA, el certificado de servidor pasa la comprobación (T19 lo detecta)" '! grep -q "no contiene un certificado raíz" "$t/ult.log"'
m="$(mutante mt6 conexion/conexion.sh 's/      PGSSL\*|PGGSS\*|PGREQUIRESSL|PGSYSCONFDIR)/      NINGUNA)/')"
if PGSERVICEFILE="$t/conf/v-ok.conf" PG_SERVICIO=tls sin_exc env PGSSLMODE=disable "$m/scripts/conexion/probar-conexion.sh" > "$t/ult.log" 2>&1; then x=0; else x=1; fi
check "MT6 sin rechazar PGSSL*, PGSSLMODE=disable ya no se rechaza (T23 lo detecta)" '[[ $x == 0 ]]'
m="$(mutante mt7 conexion/configurar-conexion.py "s/        tls = \[('sslmode', 'verify-full'), ('sslrootcert', cert)\]/        tls = [('sslmode', 'require')]/")"
{ printf 'postgresql://%s:[YOUR-PASSWORD]@localhost:%s/pre_%s\n' "$usuario" "$puerto" "$sello"; cat "$t/secreto"; printf '\n'; } \
  | sin_exc env COTIZADOR_CONFIG_DIR="$t/conf-mt7" python3 -I "$m/scripts/conexion/configurar-conexion.py" --servicio tls --certificado "$t/tls/ca.crt" > "$t/ult.log" 2>&1 || true
check "MT7 un asistente que escribe sslmode=require (lo anterior) deja una configuración que T2 detecta" 'grep -q "^sslmode=require" "$t/conf-mt7/pg_service.conf"'
if PGSERVICEFILE="$t/conf-mt7/pg_service.conf" PGPASSFILE="$t/conf-mt7/pgpass" PG_SERVICIO=tls sin_exc "$repo/scripts/conexion/probar-conexion.sh" > "$t/ult.log" 2>&1; then x=0; else x=1; fi
check "MT7b … y los scripts reales la rechazan igual (defensa en profundidad)" '[[ $x == 1 ]] && grep -q "sslmode=require no verifica" "$t/ult.log"'

echo "== Limpieza y repositorio"
check "C7 sin carpetas «simulacro-*» residuales (también tras las corridas fallidas)" '[[ "$(restos)" == "$antes_restos" ]]'
check "A17 la contraseña ficticia no quedó en ningún archivo del repositorio" 'sin_secreto --exclude-dir=node_modules --exclude-dir=.git "$repo"'

echo
echo "Resultado: $ok correctas, $fallas fallas"
(( fallas == 0 ))
