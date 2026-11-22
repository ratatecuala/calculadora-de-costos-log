# 25 · Lista de comprobación: respaldo, simulacro de restauración y verificaciones previas en staging para #52

> **Documento preparado; nada de esto se ha ejecutado contra Supabase ni staging.** Lo preparó Claude (A-76 y A-77, [registros en #43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7078172931)) sin ninguna operación remota. Lo único ejecutado es el **simulacro con datos ficticios** en una base local (§7).

**Versión 2 · 22-11-2026.** Responde a la [auditoría de la versión 1](https://github.com/ratatecuala/calculadora-de-costos-log/issues/52#issuecomment-7078148568) (1 P1 y 2 P2):

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
2. un **simulacro de restauración** que demuestre que ese respaldo se restaura idéntico;
3. las **verificaciones de solo lectura** en staging, revisadas.

**Migración en cuestión:** `supabase/migrations/20261122120000_guardado_unico_y_contador.sql`. Está aprobada técnicamente (A-76). **No se aplica todavía.**

**Reglas para todo el documento:**
- **Si algo no coincide: detente**, no lo arregles a mano y avisa en #52. Pega solo el mensaje, sin datos personales.
- **Contraseñas y cadenas de conexión:** viven solo en archivos tuyos fuera del repositorio (`~/.config/cotizador/`) y en tu gestor de contraseñas. **Nunca** en un chat, un issue, un PR ni en el repositorio.
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
  - **No se hace:** aplicar la migración, ejecutar `supabase db push` (aplicaría la de #52, que ya está en `supabase/migrations/`), encender flags, desplegar ni hacer merge del PR #34.
  - **Bien si:** en el panel de Supabase, *Database → Migrations*, siguen solo las 3 versiones del 18-11 (`20261118000315`, `20261118000924` y `20261118022422`), **sin** `20261122120000`.
  - **Si no:** si aparece `20261122120000`, detente y avisa. No la reviertas por tu cuenta.

- [ ] **1.2 Confirmar que nada aplica migraciones solo.**
  - **Quién:** el propietario.
  - **Qué revisar:**
    - el repositorio no tiene `.github/workflows/` (comprobado por Claude el 22-11);
    - en el panel de Supabase, la **integración con GitHub / Branching** del proyecto de staging debe estar **desactivada** o desconectada de este repositorio (**POR CONFIRMAR**: Claude no ve el panel);
    - nadie más tiene instrucciones de correr `supabase db push`.
  - **Si no:** si la integración está activa, detente y avisa.

- [ ] **1.3 Guardar la cadena de conexión** (solo cuando vayas a hacer el respaldo).
  - **Quién:** el propietario.
  - **Qué hacer:**
    - en el panel de Supabase, botón **Connect** → **Session pooler** (puerto **5432**, usuario `postgres.<project-ref>`). No uses el *transaction pooler* (6543);
    - el proyecto **no** debe estar pausado.
  - **Dónde guardarla:** abre el editor con `nano ~/.config/cotizador/db-url`, pega la cadena y reemplaza `[YOUR-PASSWORD]` por la contraseña de la base. Para guardar, `Ctrl+O` y `Enter`; para salir, `Ctrl+X`. Después:
    ```bash
    chmod 600 ~/.config/cotizador/db-url
    ```
  - **Bien si:** `ls -l ~/.config/cotizador/db-url` muestra `-rw-------`. El archivo **no** está en `~/calculadora`.
  - **Si no recuerdas la contraseña:** se restablece en *Database → Settings*. Avisa antes, porque cambia la contraseña para todo lo que la use.

---

## Fase 2 · Respaldo real (A-52): lo hace el propietario cuando lo decida

- [ ] **2.1 Hacer el respaldo cifrado.** En Ubuntu:
  ```bash
  cd ~/calculadora
  ```
  ```bash
  SUPABASE_DB_URL_FILE=~/.config/cotizador/db-url BACKUP_DIR=~/respaldos-cotizador BACKUP_AGE_RECIPIENT="$(grep -oE 'age1[0-9a-z]+' ~/.config/cotizador/clave-respaldo.txt)" scripts/respaldo-supabase.sh pgdump
  ```
  - **Qué hace** (modo `pgdump`, con PostgreSQL 17; el modo `cli` necesita Docker y no se usa aquí):
    - respalda las tablas de la app (`public` y `private`) y los datos de `auth.users` y `auth.identities`;
    - ejecuta la verificación del **origen**;
    - cifra todo en `~/respaldos-cotizador/respaldo-<fecha>.tar.age`;
    - **borra los archivos sin cifrar**.
  - **Bien si:** termina con `Respaldo listo: …respaldo-<fecha>.tar.age` y muestra los conteos (solo números).
  - **Si no:** copia el mensaje de error, **sin** la cadena de conexión, en #52 y detente.

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
    4. crea una base local temporal, con las tablas de Auth **con las mismas columnas que trae tu respaldo**, y carga los datos;
    5. ejecuta `scripts/verificar-restauracion.sql` y lo compara con la verificación del origen.
  - **Bien si** las últimas líneas dicen:
    ```text
    RESULTADO: restauración idéntica (30 controles: conteos, huellas, numeración y privilegios)
    Limpieza: se borraron los archivos descifrados y la base temporal.
    ```
  - **Si no:** si dice `HAY DIFERENCIAS`, **no borres el respaldo**. Pega en #52 las líneas que muestra: son solo conteos, huellas e invariantes, sin datos personales. Detente.
  - **Qué demuestra:**
    - el respaldo está completo y sin daños;
    - se descifra con tu clave;
    - los datos de la app se restauran **idénticos** (cuentas, perfiles, vehículos, cotizaciones, enlaces y contadores);
    - las migraciones del repositorio reconstruyen los mismos privilegios.
  - **Qué NO demuestra:** la estructura interna de Auth de Supabase, que no viaja en el respaldo (docs/17 §5.1); en el simulacro sus columnas se guardan como texto. Tampoco demuestra una restauración en un proyecto Supabase nuevo (§7).

---

## Fase 3 · Verificaciones de solo lectura en staging

**Requiere una autorización tuya aparte** para consultar staging. Hoy no está dada. Las consultas **solo leen**: devuelven conteos, máximos y configuración, **nunca** ids de cuentas ni correos.

- [ ] **3.1 Vía oficial: psql desde Ubuntu.** Es la única que demuestra el modo de solo lectura (V17).
  ```bash
  cd ~/calculadora
  ```
  ```bash
  psql "$(head -n 1 ~/.config/cotizador/db-url)" -X -f scripts/diseno/verificaciones-52/solo-lectura.sql > ~/verificacion-52.txt
  ```
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

| Paso | Decisión del propietario | Estado al 22-11-2026 |
|---|---|---|
| 0 | Preparar Windows 11 (WSL, PostgreSQL 17, age, clave) | Pendiente |
| 1.1–1.3 | Confirmar que nada se aplicó y que no hay integraciones automáticas; guardar la cadena de conexión | Pendiente (la integración con GitHub del panel está **POR CONFIRMAR**) |
| 2.1–2.2 | Hacer el respaldo real y guardar la segunda copia | Pendiente (A-52: lo hace el propietario) |
| 2.3 | Ejecutar el simulacro y publicar el resultado | Pendiente |
| 3 | **Autorizar** las consultas de solo lectura en staging | **No autorizado todavía** |
| 3.3 / 4 | Si V10 o V13 encuentran casos: **D-52-4b**, caso a caso | Solo si aparecen |
| 5 | **A-59:** aplicar la migración en staging | **No autorizado** |
| — | Política de borrado de trabajos emitidos (D-52-5) antes de un lanzamiento público | Provisional |

---

## 7. Pruebas del simulacro (Claude, 22-11-2026, solo datos ficticios y PostgreSQL local)

**Herramienta:** `scripts/simulacro/probar-simulacro.sh`.
- Crea orígenes **falsos** con un esquema Auth **representativo** del de Supabase (`fixtures/auth-representativo.sql`): 35 columnas en `auth.users`, columnas generadas, `jsonb` con comillas, barras y eñes, y tablas internas como `auth.sessions`, `auth.refresh_tokens` y `storage.buckets`.
- Los llena con datos ficticios (`fixtures/datos-ficticios.sql`).
- Respalda con el **script real** (`scripts/respaldo-supabase.sh pgdump`, cifrado con age).
- Ejecuta el simulacro y los controles.

| Prueba | Resultado |
|---|---|
| E1 · origen **antes** de #52, respaldo real cifrado | **Restauración idéntica** (30 controles). Aplicó **solo** las 3 migraciones anteriores; `auth.users` se creó con las 34 columnas del respaldo (la generada `confirmed_at` no viaja) |
| E2 · origen **después** de #52 (importación alta con N1) | **Idéntica**; detectó el estado y aplicó las 4 migraciones |
| E3 · volcado de **todos** los esquemas (estilo `cli`, con comillas y tablas internas) | **Idéntica**. Omitió `auth.sessions`, `auth.refresh_tokens`, `storage.buckets`, su `setval` y los cambios de rol, solo con nombre y cantidad de filas, sin su contenido |
| C1 · **control:** el stub anterior, con `auth.users(id, email)` | **Falla** al cargar: `column "instance_id" of relation "users" does not exist`. Es el defecto que señaló la auditoría |
| C2 · respaldo con una cotización menos y sumas coherentes | **HAY DIFERENCIAS** (código 2), con el conteo de `jobs` distinto |
| C3 · `data.sql` alterado sin actualizar el manifiesto | Se detiene: «las sumas SHA-256 no coinciden» |
| C4 · respaldo de una versión de PostgreSQL más nueva que la local | Se niega: «instala PostgreSQL 99» |
| C5 · clave de age equivocada | «no se pudo descifrar» |
| C6 · **mutación:** el simulacro aplica también la de #52 a un origen anterior | Se detiene: «la base local no quedó en el estado del origen» |
| C7 · limpieza | Sin carpetas temporales residuales, también tras las corridas fallidas |
| **Total** | **15/15**, tres corridas (la última, sobre la versión final de los archivos) |

**Defectos reintroducidos en la herramienta: 6, todos detectados.**

| Defecto | Prueba que falla |
|---|---|
| Auth con solo `id` y `email` | E1 |
| Filtro que conserva todas las tablas | E3 |
| Sin comprobar las sumas SHA-256 | C3 |
| Sin borrar la carpeta temporal | C7 |
| Estado de #52 siempre «antes» | E2 |
| Filtro que descarta `auth.users` | E1 |

**Hallazgo durante las pruebas:** un volcado puede incluir `SET SESSION AUTHORIZATION` con un rol del origen que no existe en la base local, y eso hacía fallar la carga. El filtro ahora omite esos cambios de rol, que no son datos.

**Limitaciones (lo que estas pruebas NO cubren):**
- **Windows/WSL:** Claude no tiene un Windows. Los pasos de la fase 0 son los estándar de Microsoft y de PostgreSQL, pero **no se ejecutaron**: **POR CONFIRMAR** en tu equipo.
- **PostgreSQL 17:** el contenedor de Claude solo tiene la 16, así que las pruebas usaron 16 en origen y destino. Con un respaldo real (17), el script exige 17 en local (C4).
- **Respaldo real:** el origen fue ficticio, con un Auth **representativo**, no el de Supabase. Por eso la prueba definitiva es tu simulacro del paso 2.3 con el respaldo real.
- **Modo `cli`** (CLI de Supabase y Docker): no se ensayó; el procedimiento usa `pgdump`.
- **Restauración en un proyecto Supabase nuevo** (ruta B completa de docs/17 §5.5): no se ensayó, porque exige otro proyecto (H9).

---

## Datos faltantes y puntos por confirmar

- **POR CONFIRMAR:** si el proyecto de staging tiene activa la integración con GitHub o Branching de Supabase (solo se ve en el panel).
- **POR CONFIRMAR:** el comportamiento del editor SQL real con `set transaction read only`. Por eso la verificación formal usa psql.
- **POR CONFIRMAR:** los pasos de la fase 0 en tu Windows 11.
- **DATO FALTANTE:** el segundo lugar donde guardarás los respaldos.
