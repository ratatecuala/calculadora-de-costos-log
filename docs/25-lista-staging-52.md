# 25 · Lista de comprobación: respaldo, simulacro de restauración y verificaciones previas en staging para #52

> **Actualización del 26-11-2026 (A-87):** las instrucciones resumidas para el propietario, en orden, y lo que viene después de #52 (I-2 y precio entero) están en [26 §4](26-preparacion-fase-0.md#4-staging-qué-falta-y-qué-haces-tú). Se corrigieron los pasos 1.1 y 1.2, que estaban desactualizados.

> **Documento preparado; nada de esto se ha ejecutado contra Supabase ni staging.** Lo preparó Claude (A-76 a A-79; registros en #43: [A-77](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7078172931), [A-78](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7118420787) y [A-79](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7120135246)) sin ninguna operación remota. Lo único ejecutado son **pruebas con datos y credenciales ficticios** en una base local (§7).

**Versión 4 · 24-11-2026.** Responde a la [reauditoría de A-78](https://github.com/ratatecuala/calculadora-de-costos-log/issues/52#issuecomment-7119520646) (1 P1, A-79): la conexión cifraba, pero **no verificaba que el servidor fuera Supabase** (`sslmode=require` por defecto, y se aceptaba incluso `disable`). Ahora:
- se exige `sslmode=verify-full` con el **certificado raíz de Supabase** (`sslrootcert`), descargado del panel (paso 1.3a);
- se rechazan los demás modos, también si se editan a mano, junto con las claves repetidas, los parámetros extra, las variables `PGSSL…` y los certificados falsos, faltantes o modificables por otros;
- las pruebas locales sin TLS usan una **excepción explícita** que solo vale para un servidor local.

**Versión 3 · 24-11-2026 (historial).** Respondía a la [reauditoría de A-77](https://github.com/ratatecuala/calculadora-de-costos-log/issues/52#issuecomment-7118358999) (2 P1 y 1 P2):

| Hallazgo | Corrección (A-78) |
|---|---|
| P1 · la contraseña viajaba en los argumentos de `psql` y `pg_dump` (visible en la lista de procesos) | **Conexión segura:** dos archivos privados (`pg_service.conf` y `pgpass`, permisos `600`) que crea un asistente sin mostrar la contraseña (paso 1.3). Los programas reciben solo `service=cotizador-staging`; los mensajes de error salen **saneados** (sin contraseña, usuario, servidor ni identificador del proyecto). Se rechazan el método anterior, `PGPASSWORD` y el modo `cli` |
| P1 · «restauración idéntica» afirmaba más de lo comprobado | El simulacro compara el **contenido completo** (todas las columnas) de las 6 tablas de la app y de `auth.users`/`auth.identities`, estas con los **tipos del origen**. Alterar un cliente, un precio, el JSON interno, un vehículo, un correo o un hash de contraseña da `HAY DIFERENCIAS`. El mensaje ahora dice **«DATOS VERIFICADOS»** y aclara que **no** prueba que Supabase Auth funcione. Un formato o dato que no sepa interpretar es un **error explícito** |
| P2 · un enlace que vence entre el respaldo y el simulacro daba una diferencia falsa | Los enlaces vigentes se cuentan en un **instante de referencia** fijo guardado en el manifiesto, no en «ahora» |

**Versión 2 · 22-11-2026 (historial).** Respondía a la [auditoría de la versión 1](https://github.com/ratatecuala/calculadora-de-costos-log/issues/52#issuecomment-7078148568) (1 P1 y 2 P2):

| Hallazgo | Corrección |
|---|---|
| Nombre de migración incorrecto | Ahora es `20261118000924_guardar_cotizacion_atomica.sql`, y el script lo comprueba |
| El stub mínimo no podía cargar los datos de Auth de un respaldo real | Nuevo simulacro automático (`scripts/simulacro/`): crea `auth.users` y `auth.identities` con **las columnas que trae el propio respaldo** |
| Riesgo de aplicar sin querer la migración de #52 al restaurar | El simulacro usa una lista explícita de migraciones según el estado del origen |
| Contradicción del modo de solo lectura en el editor SQL | La verificación formal se hace **solo con psql** (V17 = `on`); el editor queda como vistazo informativo |
| Instrucciones no pensadas para Windows | Preparación de Windows 11 paso a paso (§0) |
| Archivos descifrados sin protección | El simulacro descifra solo en una carpeta privada temporal que **borra siempre** al terminar |

**Para qué sirve:** antes de pedir la autorización individual **A-59** para aplicar la migración de #52 en staging, hacen falta tres cosas:
1. un **respaldo real** cifrado;
2. un **simulacro de restauración** que demuestre que los datos de ese respaldo se cargan completos y coinciden con el origen;
3. las **verificaciones de solo lectura** en staging, revisadas.

**Migración en cuestión:** `supabase/migrations/20261122120000_guardado_unico_y_contador.sql`. Está aprobada técnicamente (A-76). **No se aplica todavía.**

**Reglas para todo el documento:**
- **Si algo no coincide: detente**, no lo arregles a mano y avisa en #52. Pega solo el mensaje, sin datos personales.
- **Contraseñas y cadenas de conexión:** viven solo en archivos tuyos fuera del repositorio (`~/.config/cotizador/`) y en tu gestor de contraseñas. **Nunca** en un chat, un issue, un PR, el repositorio **ni en una línea de comandos**: el asistente del paso 1.3 la pide sin mostrarla.
- **Nunca bajes la seguridad de la conexión** (`sslmode`) para que algo funcione: un error de certificado es motivo para detenerse.
- **Nunca descifres un respaldo a mano.** El simulacro lo hace por ti en una carpeta privada que borra al terminar.
- **Ningún hallazgo se repara automáticamente** (D-52-4b).

**Cómo leer los bloques de comandos:**
- copia **una línea o un bloque completo** y pégalo en la ventana de Ubuntu (clic derecho, o `Ctrl+Shift+V`); después pulsa `Enter`;
- donde dice `<algo>`, reemplázalo por tu dato;
- si una línea pide tu contraseña de Ubuntu (`sudo`), escríbela: no se ve mientras escribes, es normal.

---

## Fase 0 · Preparar tu computador con Windows 11 (una sola vez)

El respaldo y el simulacro usan herramientas de Linux. En Windows 11 se ejecutan dentro de **Ubuntu en WSL**, un Linux oficial de Microsoft que corre dentro de Windows. Todo lo que sigue se escribe en la ventana de Ubuntu, salvo el paso 0.1.

**Requisitos previos:**
- Windows 11 actualizado y una cuenta de administrador;
- unos **10 GB** libres;
- conexión a internet;
- tu **gestor de contraseñas** (por ejemplo, Bitwarden o 1Password).

- [ ] **0.1 Instalar Ubuntu (WSL).** Abre el menú Inicio, escribe **PowerShell**, haz clic derecho en «Windows PowerShell» y elige **Ejecutar como administrador**. Escribe:
  ```powershell
  wsl --install -d Ubuntu-24.04
  ```
  Reinicia el computador cuando lo pida. Después abre **Ubuntu** desde el menú Inicio, espera a que termine y crea un **usuario y una contraseña de Ubuntu** (no tienen que ser los de Windows; guárdalos en tu gestor).
  - **Bien si:** ves una línea que termina en `$` en la ventana de Ubuntu.

- [ ] **0.2 Instalar las herramientas** (Git, age, Python y PostgreSQL 17). En Ubuntu, un bloque a la vez:
  ```bash
  sudo apt update && sudo apt install -y git age python3 curl ca-certificates postgresql-common
  ```
  ```bash
  sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
  ```
  ```bash
  sudo apt install -y postgresql-17
  ```
  El segundo comando agrega el repositorio **oficial** de PostgreSQL, porque Ubuntu 24.04 trae la versión 16 y Supabase usa la **17**. No hace falta configurar nada más de PostgreSQL: el simulacro crea su propia base temporal.
  - **Bien si** estos comandos muestran `17.x`, `17.x` y una versión de age:
    ```bash
    /usr/lib/postgresql/17/bin/postgres --version; psql --version; age --version
    ```

- [ ] **0.3 Descargar el proyecto** (público; los scripts están en la rama del PR #34):
  ```bash
  git clone https://github.com/ratatecuala/calculadora-de-costos-log.git ~/calculadora
  ```
  ```bash
  cd ~/calculadora && git checkout claude/determined-volta-q9xvli
  ```
  - **Bien si** este comando repite los dos nombres de archivo, sin errores:
    ```bash
    ls scripts/simulacro/simulacro-restauracion.sh scripts/respaldo-supabase.sh
    ```
  - Para actualizarlo más adelante: `cd ~/calculadora && git pull`.

- [ ] **0.4 Crear tus carpetas privadas y tu clave de cifrado:**
  ```bash
  mkdir -p ~/.config/cotizador ~/respaldos-cotizador && chmod 700 ~/.config/cotizador ~/respaldos-cotizador
  ```
  ```bash
  age-keygen -o ~/.config/cotizador/clave-respaldo.txt && chmod 600 ~/.config/cotizador/clave-respaldo.txt
  ```
  **Guarda una copia de la clave ahora.** Muestra el archivo con `cat ~/.config/cotizador/clave-respaldo.txt` y copia **todo** su contenido en una nota segura de tu gestor de contraseñas.
  - La línea `AGE-SECRET-KEY-…` es **secreta**: sin ella **no se puede abrir ningún respaldo**.
  - La línea `# public key: age1…` es pública.

- [ ] **0.5 Proteger el disco** (recomendado). En Windows: **Configuración → Privacidad y seguridad → Cifrado del dispositivo** (o **BitLocker** en Windows Pro), y actívalo.
  - **Por qué:** el borrado de archivos no garantiza que no queden restos en el disco. Con el disco cifrado, esos restos no se pueden leer si alguien se lleva el equipo.
  - Tus carpetas de Ubuntu (`~/…`) **no** se sincronizan con OneDrive. **No** guardes la clave ni archivos descifrados en carpetas de Windows sincronizadas (Escritorio, Documentos u OneDrive).

---

## Fase 1 · Antes de empezar

- [ ] **1.1 Confirmar lo que NO se hace todavía.**
  - **Quién:** el propietario.
  - **No se hace:** aplicar migraciones, ejecutar `supabase db push`, encender flags, desplegar ni hacer merge del PR #34. Ojo: `supabase db push` aplicaría **las cuatro** migraciones locales que ya están en `supabase/migrations/`: #52 (`20261122120000`), I-2 (`20261125120000` y `20261125120100`) y precio entero (`20261125130000`).
  - **Bien si:** en el panel de Supabase, *Database → Migrations*, siguen solo las 3 versiones del 18-11 (`20261118000315`, `20261118000924` y `20261118022422`), **sin** ninguna de las cuatro posteriores.
  - **Si no:** si aparece cualquiera de ellas, detente y avisa. No la reviertas por tu cuenta.

- [ ] **1.2 Confirmar que nada aplica migraciones solo.**
  - **Quién:** el propietario.
  - **Qué revisar:**
    - el único flujo automático del repositorio es `.github/workflows/a83.yml` (desde A-83). Claude lo revisó el 26-11: corre pruebas en un PostgreSQL desechable dentro de GitHub, con permiso de solo lectura, sin secretos y **sin** conectarse a Supabase;
    - en el panel de Supabase, la **integración con GitHub / Branching** del proyecto de staging debe estar **desactivada** o desconectada de este repositorio (**POR CONFIRMAR**: Claude no ve el panel);
    - nadie más tiene instrucciones de correr `supabase db push`.
  - **Si no:** si la integración está activa, detente y avisa.

- [ ] **1.3 Configurar la conexión segura** (solo cuando vayas a hacer el respaldo).
  - **Quién:** el propietario.
  - **Por qué hacen falta dos cosas** (A-78 y A-79):
    - que la contraseña **no** quede a la vista (asistente, paso 1.3c);
    - que tu computador compruebe que del otro lado está **de verdad** Supabase y no un impostor. Para eso se usa el **certificado raíz** de Supabase y la verificación más estricta de PostgreSQL, `sslmode=verify-full`, que verifica el certificado **y** el nombre del servidor. Si algo no coincide, la conexión se corta **antes** de enviar la contraseña.
  - **1.3a Descargar el certificado raíz desde el panel de Supabase** (no se conecta a la base ni usa la contraseña):
    1. En el navegador de Windows, entra al panel de tu proyecto de staging.
    2. Abre la configuración de la base de datos (**Project Settings → Database**) y busca la sección **SSL Configuration**.
    3. Pulsa **Download certificate**. Se guarda en tu carpeta **Descargas** con un nombre terminado en `.crt` (por ejemplo, `prod-ca-2021.crt`).

    **POR CONFIRMAR:** los nombres exactos del menú, el botón y el archivo. Claude no pudo abrir el panel ni la documentación desde su entorno. Si no coinciden, busca «SSL» en la configuración de la base de datos y **avisa en #52** antes de seguir.
  - **1.3b Copiar el certificado a tu carpeta privada de Ubuntu.** En Ubuntu, reemplaza `<tu-usuario-de-windows>` y el nombre del archivo:
    ```bash
    cp "/mnt/c/Users/<tu-usuario-de-windows>/Downloads/prod-ca-2021.crt" ~/.config/cotizador/supabase-ca.crt && chmod 644 ~/.config/cotizador/supabase-ca.crt
    ```
    Comprueba que es un certificado raíz válido y vigente:
    ```bash
    cd ~/calculadora && python3 -I scripts/conexion/sanear.py --certificado ~/.config/cotizador/supabase-ca.crt && echo "Certificado correcto"
    ```
    - **Bien si:** dice `Certificado correcto`.
    - **Si no:** dice qué falla (no existe, no es un certificado, no es la CA raíz o está vencido). Vuelve a descargarlo. El certificado **no es secreto**, pero nadie más debe poder modificarlo.
  - **1.3c Ejecutar el asistente.** Antes, en el panel de Supabase, botón **Connect** → **Session pooler** (puerto **5432**). Copia la cadena tal como aparece, con `[YOUR-PASSWORD]`. No uses el *transaction pooler* (6543): el asistente lo rechaza. El proyecto **no** debe estar pausado.
    ```bash
    cd ~/calculadora && python3 scripts/conexion/configurar-conexion.py
    ```
    1. Pega la cadena (clic derecho) y pulsa `Enter`. **No se verá nada mientras pegas:** es normal.
    2. El asistente comprueba el certificado del paso 1.3b. Si falta, se detiene **antes** de pedirte la contraseña.
    3. Escribe o pega la **contraseña de la base** y pulsa `Enter`. Tampoco se verá.
  - **Qué guarda:** en `~/.config/cotizador`, con permisos `600`:
    - `pg_service.conf`: servidor, puerto, base, usuario y la seguridad de la conexión (`sslmode=verify-full`, la ruta del certificado y `gssencmode=disable`), **sin** contraseña;
    - `pgpass`: la contraseña, en un archivo que solo PostgreSQL lee.

    Aunque la cadena de Supabase traiga otro `sslmode` (por ejemplo, `require`), el asistente guarda `verify-full`. Los scripts **rechazan** cualquier otro modo (`disable`, `allow`, `prefer`, `require`, `verify-ca`), también si alguien edita los archivos a mano, y rechazan las variables `PGSSL…`.
  - **1.3d Comprobar la conexión** (esto sí consulta Supabase: hazlo solo cuando vayas a respaldar):
    ```bash
    scripts/conexion/probar-conexion.sh
    ```
    - **Bien si:** dice `Conexión correcta: PostgreSQL 17.x · TLS verificado (verify-full: certificado y nombre del servidor)`.
    - **Si menciona el certificado** (`certificate verify failed`) **o el nombre del servidor** (`does not match host name`): **detente**. **No** cambies `sslmode` ni borres el certificado para «hacerlo funcionar», y avisa en #52. Puede ser un certificado equivocado o un servidor que no es Supabase. La contraseña **no** se envió.
    - **Otros errores:** el mensaje sale **saneado**, con `<usuario>` y `<servidor>` en vez de tus datos, así que puedes copiarlo en #52. Detente.
  - **Si antes creaste `~/.config/cotizador/db-url`** (versión 2 de esta lista): bórralo con `rm ~/.config/cotizador/db-url`. Ya no se usa, y el respaldo se niega a usarlo porque ponía la contraseña en la línea de comandos.
  - **Si no recuerdas la contraseña:** se restablece en *Database → Settings*. Avisa antes, porque cambia la contraseña para todo lo que la use. Después repite el asistente.

---

## Fase 2 · Respaldo real (A-52): lo hace el propietario cuando lo decida

- [ ] **2.1 Hacer el respaldo cifrado.** En Ubuntu:
  ```bash
  cd ~/calculadora
  ```
  ```bash
  BACKUP_DIR=~/respaldos-cotizador BACKUP_AGE_RECIPIENT="$(grep -oE 'age1[0-9a-z]+' ~/.config/cotizador/clave-respaldo.txt)" scripts/respaldo-supabase.sh pgdump
  ```
  - **Qué hace** (modo `pgdump`, con PostgreSQL 17 y la conexión segura del paso 1.3; el modo `cli` está desactivado porque exigiría la contraseña en la línea de comandos):
    - respalda las tablas de la app (`public` y `private`), los datos de `auth.users` y `auth.identities`, y la lista de columnas y tipos de esas dos tablas;
    - ejecuta la verificación del **origen** y guarda en el manifiesto el **instante de referencia**;
    - cifra todo en `~/respaldos-cotizador/respaldo-<fecha>.tar.age`;
    - **borra los archivos sin cifrar**.
  - **Bien si:** termina con `Respaldo listo: …respaldo-<fecha>.tar.age` y muestra los conteos (solo números).
  - **Si no:** copia el mensaje de error en #52 y detente. Sale saneado, pero revísalo antes de pegarlo.
  - **Mientras corre, no uses la app de staging.** Si alguien guarda algo justo en ese momento, el simulacro mostrará diferencias: repite el respaldo.

- [ ] **2.2 Guardar una segunda copia** del archivo **cifrado**.
  - **Cómo:** en el Explorador de Windows, escribe `\\wsl$\Ubuntu-24.04\home\<tu-usuario-de-ubuntu>\respaldos-cotizador` en la barra de direcciones y copia el `.tar.age` a un disco externo o a tu nube.
  - Al estar cifrado, se puede guardar en la nube.
  - **Nunca** guardes la clave (`clave-respaldo.txt`) en el mismo lugar que el respaldo.
  - **DATO FALTANTE:** qué segundo lugar usarás. Lo eliges tú.

---

## Fase 2b · Simulacro de restauración (local, sin Supabase)

- [ ] **2.3 Ejecutar el simulacro** con el respaldo recién hecho. En Ubuntu:
  ```bash
  cd ~/calculadora
  ```
  ```bash
  RESPALDO="$(ls -t ~/respaldos-cotizador/respaldo-*.tar.age | head -n 1)" CLAVE_AGE=~/.config/cotizador/clave-respaldo.txt scripts/simulacro/simulacro-restauracion.sh
  ```
  - **Qué hace solo**, en una carpeta privada temporal (permisos `700`) que **borra al terminar**, también si algo falla o lo interrumpes con `Ctrl+C`:
    1. descifra el respaldo y comprueba sus sumas SHA-256;
    2. comprueba que tu PostgreSQL local sea de la versión del respaldo (17) o superior;
    3. **detecta si el origen tenía aplicada la migración de #52** (por la fila `inv.security_definer` de la verificación del origen). Hoy no la tiene, así que aplica **solo** las 3 migraciones anteriores, por nombre exacto, y comprueba que la de #52 no quedó aplicada;
    4. crea una base local temporal, con `auth.users` y `auth.identities` **con las columnas y los tipos del origen**, y carga los datos. Si encuentra un formato o un dato que no sabe interpretar, se detiene con un **error explícito**: nunca lo omite en silencio;
    5. ejecuta `scripts/verificar-restauracion.sql` con el **mismo instante de referencia** del origen y lo compara con la verificación del origen.
  - **Bien si** las últimas líneas dicen:
    ```text
    RESULTADO: DATOS VERIFICADOS. Los 39 controles coinciden con el origen: contenido completo de 8 tablas (las de la app, auth.users y auth.identities), conteos, numeración y privilegios.
       Alcance: integridad de los datos. NO prueba que Supabase Auth funcione (inicio de sesión) ni una restauración en un proyecto Supabase nuevo.
    Limpieza: se borraron los archivos descifrados y la base temporal.
    ```
  - **Si no:**
    - si dice `HAY DIFERENCIAS`, **no borres el respaldo**. Pega en #52 las líneas que muestra: son solo conteos, huellas md5 e invariantes, sin datos personales. Detente;
    - si dice `ERROR:`, pega solo esa línea en #52 y detente.
  - **Qué demuestra:**
    - el respaldo está completo y sin daños, y se descifra con tu clave;
    - **todas las columnas de todas las filas** de perfiles, vehículos, trabajos, cotizaciones, enlaces, contadores, `auth.users` y `auth.identities` coinciden con el origen. Lo comprueban las huellas md5 «contenido.*»;
    - las migraciones del repositorio reconstruyen los mismos privilegios.
  - **Qué NO demuestra:**
    - que **Supabase Auth funcione** después de restaurar: el inicio de sesión, sus funciones, *triggers* y demás tablas internas no viajan en el respaldo (docs/17 §5.1);
    - una restauración en un **proyecto Supabase nuevo**.

    Las dos cosas exigen un entorno Supabase compatible y una autorización aparte (§7).

---

## Fase 3 · Verificaciones de solo lectura en staging

**Requiere una autorización tuya aparte** para consultar staging. Hoy no está dada. Las consultas **solo leen**: devuelven conteos, máximos y configuración, **nunca** ids de cuentas ni correos.

- [ ] **3.1 Vía oficial: psql desde Ubuntu, con la conexión segura.** Es la única que demuestra el modo de solo lectura (V17).
  ```bash
  cd ~/calculadora
  ```
  ```bash
  scripts/verificar-solo-lectura.sh
  ```
  Ejecuta `scripts/diseno/verificaciones-52/solo-lectura.sql` con `service=cotizador-staging`, sin la contraseña en la línea de comandos. Escribe `~/verificacion-52.txt` con permisos `600` y termina con `Listo: … V17: on (solo lectura comprobada)`.
  Para ver el resultado en el Bloc de notas:
  ```bash
  notepad.exe "$(wslpath -w ~/verificacion-52.txt)"
  ```
  - El script corre dentro de `begin transaction read only … rollback`: **cualquier intento de escritura falla**.
  - **Bien si:** aparecen V1 a V17 y **V17 dice `on`**.
  - **Si no:** copia **solo el mensaje** de error en #52 y detente.

- [ ] **3.1b (Opcional) Vistazo en el editor SQL de Supabase.** Sirve **solo para mirar**, no como verificación formal.
  - **Cómo:** pega el archivo completo `scripts/diseno/verificaciones-52/solo-lectura-editor.sql`.
  - **Por qué no es formal:** no se sabe si el editor ejecuta su primera línea (`set transaction read only;`) en la misma transacción. Por eso V17 puede salir `off` sin que sea un error. Las consultas igualmente **solo leen**: son `SELECT` sobre catálogos y conteos.
  - **Si el editor rechaza `set transaction read only`, o V17 no es `on`:** usa la vía 3.1. **No** borres esa línea para «forzarlo».
  - **POR CONFIRMAR:** el comportamiento del editor real.

- [ ] **3.2 Copiar el resultado a #52 sin datos personales.**
  - **Qué hacer:** pega en #52 el contenido de `~/verificacion-52.txt`.
  - **Antes de pegar:** revisa que no haya ninguna cadena de conexión, contraseña, URL privada ni identificador de cuenta.

- [ ] **3.3 Leer el semáforo** (el detalle está en [23 §8](23-revision-52-insert-directo.md)).

| Consulta | Verde (se puede seguir) | Detente y avisa si… |
|---|---|---|
| **V1** · dueño de las tablas | Las 4 tablas tienen el **mismo dueño**; `rls` = `t`; `rls_forzada` = `f` | Dueños distintos entre tablas, o `rls` = `f` |
| **V2** · funciones de guardado | Hoy: `create_job_with_quote` con `security_definer` = `f` (todavía no migrada), **una sola** firma, y el mismo dueño que V1 | `security_definer` ya en `t` (alguien migró: ver 1.1), varias firmas o un dueño distinto del de las tablas |
| **V3** · ¿el dueño salta RLS? | Informativo: anota el resultado | — (sirve para la revisión de la fase 4) |
| **V4** · privilegios de tablas | Hoy `authenticated` tiene `INSERT` en `jobs` y `client_quotes`: es lo **esperado antes** de migrar. `anon` sin privilegios | `anon` con cualquier privilegio en estas tablas |
| **V5** · funciones y esquema `private` | `anon` **sin** `EXECUTE` en ninguna. Hoy `authenticated` tiene acceso a `private`: es lo esperado antes de migrar | `anon` con `EXECUTE` |
| **V6** · privilegios por defecto | Informativo: si dan `EXECUTE` a `anon` o `authenticated` sobre funciones nuevas, la migración ya lo revoca explícitamente | — (anotar para la revisión) |
| **V7** · políticas | Hoy aparecen también `jobs_insert` y las de `client_quotes`: esperado antes de migrar | Faltan políticas de `select` |
| **V8** · esquemas expuestos | `private` **no** aparece en `pgrst.db_schemas` | `private` aparece. Sin fila: revisa en el panel, en *Data API → Exposed schemas*, que solo estén `public` (y `graphql_public`) |
| **V9** · disparadores | Ninguno con `en_insert` = `t` | Alguno en `INSERT` |
| **V10** · contadores | `contadores_inflados` = **0** y `contadores_en_el_maximo` = **0** | **≥ 1** → **D-52-4b**: decidir caso a caso con el propietario. **Nunca** reparar automáticamente; N1 no desbloquea una cuenta que ya está en el máximo |
| **V11** · cuentas sin contador | **0** | ≥ 1 |
| **V12** · contador bajo su máximo | **0** (antes de migrar no debería ocurrir) | ≥ 1: informar |
| **V13** · números ≥ 2.000.000.000 | **0** | ≥ 1: posible importación anómala; informar |
| **V14** · trabajos sin cotización | **0** | ≥ 1: restos de pruebas o de escritura directa (H2). Informar, **sin borrar nada** |
| **V15** · documento con número distinto | **0** | ≥ 1: posible documento reemplazado en el pasado (H3). Informar |
| **V16** · números emitidos repetidos | `grupos_con_mas_de_una_nueva` = **0**. Los repetidos por importación son legítimos (A-47) | `grupos_con_mas_de_una_nueva` ≥ 1: informar |
| **V17** · modo solo lectura | `on` (con la vía psql de 3.1) | `off` o un error: **no** cuenta como verificación formal; repítela con la vía psql |

---

## Fase 4 · Revisión antes de pedir A-59

- [ ] **4.1 Revisión independiente** de Claude y ChatGPT, a partir de lo publicado en #52. Se revisan:
  - el resultado del simulacro (2.3);
  - el semáforo de la fase 3;
  - dueños y BYPASSRLS (V1–V3);
  - privilegios por defecto (V6);
  - esquemas expuestos (V8);
  - contadores y datos anómalos (V10–V16).

  Cualquier anomalía se decide en #52 antes de seguir; las de contadores van por D-52-4b.

---

## Fase 5 · Lo que viene DESPUÉS (requiere la autorización individual A-59)

**Solo se menciona; esta lista no da instrucciones para ejecutarlo.**
- Aplicar la migración `20261122120000_guardado_unico_y_contador.sql` en staging.
- Repetir V1–V17 ([23 §9](23-revision-52-insert-directo.md), paso 5).
- Correr `scripts/verificar-rls.mjs` y `scripts/verificar-numeracion.mjs` (adaptados). El test del máximo de INT4 va **solo después** de aplicar la migración (H4).
- Correr `scripts/e2e-staging.mjs` y `scripts/e2e-staging-anonimo.mjs` (59/59).
- Hacer un **respaldo nuevo** después de migrar y su simulacro. El simulacro detectará el estado «DESPUÉS de #52» y aplicará también esa migración.
- **La reversión** (`scripts/diseno/ensayo-52/reversion-52.sql`) devuelve el comportamiento **inseguro** anterior. No es un «deshacer» neutro.

---

## Fase 6 · Qué decide el propietario en cada paso

| Paso | Decisión del propietario | Estado al 24-11-2026 |
|---|---|---|
| 0 | Preparar Windows 11 (WSL, PostgreSQL 17, age, clave) | Pendiente |
| 1.1–1.3 | Confirmar que nada se aplicó y que no hay integraciones automáticas; descargar el certificado raíz de Supabase y configurar la conexión segura (asistente) | Pendiente (la integración con GitHub del panel está **POR CONFIRMAR**) |
| 2.1–2.2 | Hacer el respaldo real y guardar la segunda copia | Pendiente (A-52: lo hace el propietario) |
| 2.3 | Ejecutar el simulacro y publicar el resultado | Pendiente |
| 3 | **Autorizar** las consultas de solo lectura en staging | **No autorizado todavía** |
| 3.3 / 4 | Si V10 o V13 encuentran casos: **D-52-4b**, caso a caso | Solo si aparecen |
| 5 | **A-59:** aplicar la migración en staging | **No autorizado** |
| — | Política de borrado de trabajos emitidos (D-52-5) antes de un lanzamiento público | Provisional |

---

## 7. Pruebas (Claude, 24-11-2026; solo datos y credenciales ficticios, PostgreSQL local)

**Cómo se ejecutan:**
```bash
scripts/simulacro/probar-simulacro.sh
```
Con PostgreSQL, age y python3; no como root.

**Qué hace la prueba:**
- Crea y borra **su propio servidor** PostgreSQL temporal, que:
  - exige contraseña (`scram-sha-256`) por red;
  - usa la zona horaria `America/Santiago`, para comprobar que las huellas no dependen de ella.
- Crea orígenes **falsos** con un Auth **representativo** del de Supabase (`fixtures/auth-representativo.sql`):
  - 35 columnas en `auth.users`, columnas generadas y `jsonb` con comillas, barras y eñes;
  - tablas internas como `auth.sessions`.

  Los llena con datos ficticios (`fixtures/datos-ficticios.sql`).
- Crea una **contraseña ficticia aleatoria** con `:` `\` `@` `%` `/`, la configura con el asistente del paso 1.3 y respalda con el **script real**.
- Mientras corre, un **detector**:
  - registra los argumentos y el entorno de cada `psql` y `pg_dump`;
  - vigila **todos** los procesos en `/proc`, cada 2 ms.

**Resultado (24-11, con A-79): 98/98** en dos corridas. A-78 dejó 60/60; A-79 agrega los 30 controles TLS (T1–T30) y 8 mutaciones (MT1–MT7b).

**TLS (A-79).** El servidor de prueba usa TLS con un certificado firmado por una **CA de prueba** (solo `DNS:localhost`); también hay **otra CA** ajena. Las pruebas generales conectan con la **excepción explícita** de prueba local (`COTIZADOR_PRUEBA_LOCAL_SIN_TLS=solo-loopback-de-prueba`, que solo vale para loopback). El grupo T la quita:

| Prueba TLS | Resultado |
|---|---|
| T1 · asistente sin certificado | Se detiene **antes** de pedir la contraseña y no escribe archivos |
| T2 · asistente con la CA y una cadena con `sslmode=require` | Escribe `verify-full`, `sslrootcert` y `gssencmode=disable` |
| T3–T4 · `verify-full` con la CA correcta | Conecta («TLS verificado»), y el **respaldo completo** funciona por TLS sin la contraseña en argumentos ni en `/proc` |
| T5–T6 · certificado de **otra CA** | `certificate verify failed`. El registro del servidor confirma que **no hubo intento de autenticación**: la contraseña no se envió |
| T7 · **nombre de servidor distinto** (127.0.0.1 en vez de localhost) | `does not match host name` |
| T8 · certificado **faltante** | Rechazado antes de conectar |
| T9–T14 · `disable`, `allow`, `prefer`, `require`, `verify-ca` y `sslmode` ausente, **editados a mano** | Rechazados |
| T15 · `sslmode=disable` **antes** de `sslmode=verify-full` | Rechazado por clave repetida. **Hallazgo:** libpq usa la primera aparición; sin esta regla, la conexión iba **sin TLS** (MT2) |
| T16–T22 · `sslrootcert=system`, sin `sslrootcert`, un archivo que no es un certificado, el certificado del servidor en vez de la CA, `gssencmode=prefer`, un parámetro extra (`requiressl`) y un certificado modificable por otros | Rechazados |
| T23–T26 · variables `PGSSLMODE`, `PGSSLROOTCERT`, `PGGSSENCMODE` y `PGREQUIRESSL` | Rechazadas |
| T27–T30 · excepción con un servidor remoto, con un valor inexacto, servidor local **sin** la excepción, y asistente con la excepción para un servidor remoto | Rechazados |
| MT1–MT7b · mutaciones | Se quita cada regla y la configuración insegura pasa, o la conexión va sin TLS:<br>• **MT1:** `require` conecta;<br>• **MT2:** la clave repetida conecta **sin TLS**;<br>• **MT3:** la excepción sin límite de loopback escribe `disable` para un servidor remoto;<br>• **MT4:** pasa `gssencmode=prefer`;<br>• **MT5:** pasa un certificado que no es CA;<br>• **MT6:** pasa `PGSSLMODE=disable`;<br>• **MT7:** el asistente anterior escribía `require`; los scripts igual lo rechazan (MT7b).<br>Las pruebas correspondientes las detectan todas |

**Resultado de A-78 (se mantiene): 60/60.**

| Grupo | Qué se comprobó | Resultado |
|---|---|---|
| A · credenciales (17) | El asistente crea `pg_service.conf` (sin contraseña) y `pgpass`, con permisos `600` y carpeta `700`. `probar-conexion.sh`, el respaldo y `verificar-solo-lectura.sh` (V1–V17, V17 = `on`) conectan solo con `service=…`. La contraseña **no** aparece en argumentos, en el entorno (sin `PGPASSWORD`), en `/proc`, en la salida, en el respaldo descifrado, en el resultado de solo lectura ni en el repositorio. Se rechazan el método anterior (`SUPABASE_DB_URL_FILE`), `PGPASSWORD`, el modo `cli`, un `pgpass` con permisos `644`, una contraseña dentro de `pg_service.conf`, una configuración dentro del repositorio y el puerto 6543. Con una contraseña equivocada falla con el mensaje saneado: `… failed for user "<usuario>"`, sin usuario, IP ni contraseña | Todo OK |
| E · simulacro (8) | **E1:** antes de #52, solo 3 migraciones, Auth con los tipos del origen (35 columnas, 1 generada): **DATOS VERIFICADOS** (39 controles, contenido completo de 8 tablas). **E2:** después de #52, 4 migraciones: verificado. **E3:** volcado de **todos** los esquemas, con comillas y cambios de rol: verificado. Las tablas internas se omiten informando solo nombre y cantidad de filas | Todo OK |
| B · contenido (7) | Con las sumas SHA-256 **coherentes**, se alteró **una** columna. Cada caso da `HAY DIFERENCIAS` en `contenido.<tabla>`:<br>• el cliente de un trabajo;<br>• el precio de un trabajo;<br>• el JSON interno de costos;<br>• el rendimiento de un vehículo;<br>• el correo en Auth;<br>• el hash de contraseña en Auth.<br>En los 6 casos **ninguna huella anterior** (ids, números y conteos) cambió: sin las nuevas, esas alteraciones pasaban | Todo OK |
| B · formatos (11) | Error explícito, nunca «DATOS VERIFICADOS», ante:<br>• `INSERT`;<br>• una tabla de la app desconocida;<br>• una fila con columnas de menos;<br>• `COPY` binario;<br>• una sentencia desconocida;<br>• una codificación que no es UTF-8;<br>• un tipo propio en Auth;<br>• columnas de Auth que no coinciden;<br>• una tabla que falta;<br>• un respaldo antiguo sin `auth-columnas.txt`;<br>• un manifiesto sin instante de referencia | Todo OK |
| C · tiempo (2, más E1) | Un enlace que **vence 3 segundos después** de crearse se respalda vigente (cuenta 2 en la referencia). El simulacro corre **después** de que venció y da **DATOS VERIFICADOS**. `verificar-restauracion.sql` sin `-v referencia` da un error explícito | Todo OK |
| Controles de A-77 (5) | El *stub* `auth.users(id, email)` no carga un respaldo real; falta una cotización → `HAY DIFERENCIAS`; sumas alteradas, versión 99 y clave equivocada → se detiene | Todo OK |
| Mutaciones (9) | Se reintroduce cada defecto y la prueba correspondiente lo detecta:<br>• **M1:** #52 aplicada a un origen anterior → se detiene;<br>• **M2:** la contraseña en la cadena de conexión → la detectan **por separado** el registro de llamadas y la vigilancia de `/proc`;<br>• **M3:** errores sin sanear → aparece el usuario;<br>• **M4:** solo las huellas anteriores → alterar un cliente **no** se detecta;<br>• **M5:** contar con `now()` → **diferencia falsa** por el enlace vencido;<br>• **M6:** omitir sentencias desconocidas → «verificado» en silencio;<br>• **M7:** sin fijar la zona horaria → difieren las huellas;<br>• **M8:** Auth sin columnas generadas → difiere `contenido.auth` | Todas detectadas |
| Limpieza (1) | **C7:** sin carpetas temporales residuales, también tras las corridas fallidas | OK |

**Además:**
- `scripts/diseno/ensayo-52/ensayar.sh` (#52 en local) sigue en **65 OK**. Su verificación antes y después de la migración usa la versión nueva de `verificar-restauracion.sql`.
- `npm test`: **636/636**.

**Limitaciones (lo que estas pruebas NO cubren):**
- **Windows/WSL:** Claude no tiene Windows. Los pasos de las fases 0 y 1.3 **no se ejecutaron**: **POR CONFIRMAR** en tu equipo, incluido pegar en el asistente sin que se vea y copiar el certificado desde `/mnt/c/Users/…/Downloads`.
- **Certificado real de Supabase:** no se usó, porque las pruebas usan una CA propia. **POR CONFIRMAR** que el certificado del panel valide el **Session pooler** con `verify-full`. La reauditoría cita la documentación oficial de Supabase (actualizada el 16-11-2026) con ese procedimiento, pero Claude no pudo abrirla: su red no permite `supabase.com` ni `postgresql.org`. Si el paso 1.3d falla por el certificado, **no se baja la seguridad**: se avisa en #52.
- **PostgreSQL 17 y Supabase real:** el contenedor solo tiene la 16, y el origen fue ficticio. Las columnas y los tipos de Auth de Supabase son los de la documentación pública, **sin confirmar**. Si tu respaldo trae un tipo que el simulacro no reconoce, se detendrá con un error explícito. La prueba definitiva es tu simulacro del paso 2.3.
- **Supabase Auth funcional e inicio de sesión:** **no** se prueban. Lo mismo vale para una restauración en un proyecto Supabase nuevo (H9). Requieren un entorno Supabase compatible y una autorización aparte.
- **Detector de `/proc`:** muestrea cada 2 ms. El registro de cada `psql`/`pg_dump` sí es completo. Ambos detectaron por separado la contraseña reintroducida (M2).
- **Cambios durante el respaldo:** si alguien usa la app mientras corre, la verificación del origen puede no coincidir con el volcado. Se ve como `HAY DIFERENCIAS`; se repite el respaldo.

**Historial:** la versión 2 (A-77, 22-11) tenía 15/15 pruebas. Su mensaje «restauración idéntica» comparaba solo identificadores y conteos, y el respaldo pasaba la contraseña en los argumentos. Ambos defectos están corregidos aquí.

---

## Datos faltantes y puntos por confirmar

- **POR CONFIRMAR:** si el proyecto de staging tiene activa la integración con GitHub o Branching de Supabase (solo se ve en el panel).
- **POR CONFIRMAR:** el comportamiento del editor SQL real con `set transaction read only`. Por eso la verificación formal usa psql.
- **POR CONFIRMAR:** los pasos de las fases 0 y 1.3 en tu Windows 11.
- **POR CONFIRMAR:** el menú y el nombre exacto del certificado en el panel de Supabase, y que valide el Session pooler con `verify-full` (paso 1.3).
- **POR CONFIRMAR:** que las columnas y los tipos de `auth.users` y `auth.identities` de tu proyecto sean reconocidos por el simulacro (si no, se detiene con un error explícito).
- **DATO FALTANTE:** el segundo lugar donde guardarás los respaldos.
