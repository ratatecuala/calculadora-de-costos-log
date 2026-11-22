# 25 · Lista de comprobación: respaldo y verificaciones previas en staging para #52

> **Documento preparado; nada de esto se ha ejecutado.** Ni el respaldo, ni las consultas en staging, ni la migración. Lo preparó Claude por encargo del propietario (A-76, [registro en #43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7077903187)), sin ninguna operación remota.

**Para qué sirve:** antes de pedir la autorización individual **A-59** para aplicar la migración de #52 en staging, hay que tener dos cosas:
1. un **respaldo real** de la base, que se pueda restaurar (A-52);
2. las **verificaciones de solo lectura** hechas en staging y revisadas.

Esta lista dice quién hace cada paso, qué necesita, cómo saber que salió bien y cuándo detenerse.

**Migración en cuestión:** `supabase/migrations/20261122120000_guardado_unico_y_contador.sql`. Está aprobada técnicamente (A-76) y ensayada solo en PostgreSQL local ([23 §11](23-revision-52-insert-directo.md)). **Todavía no se aplica.**

**Reglas para todo el documento:**
- Si algo no coincide con lo esperado: **detente, no lo arregles a mano y avisa en #52** (sin datos personales).
- Las contraseñas y cadenas de conexión viven **solo** en archivos tuyos fuera del repositorio (por ejemplo, `~/.config/cotizador/`) o en tu gestor de contraseñas. **Nunca** se pegan en un chat, un issue, un PR ni en el repositorio.
- Ningún hallazgo se repara automáticamente (D-52-4b).

---

## Fase 1 · Antes de empezar

- [ ] **1.1 Confirmar lo que NO se hace todavía.**
  - **Quién:** el propietario.
  - **Qué no se hace:**
    - aplicar la migración;
    - ejecutar `supabase db push` (aplicaría la migración nueva, porque ya está en `supabase/migrations/`);
    - encender flags (`VITE_FF_INTEGRACION_CARGA`, `VITE_FF_CARGA_RECURSOS`);
    - desplegar;
    - hacer merge del PR #34.
  - **Bien si:** nadie ha corrido nada de eso. Se puede mirar en el panel de Supabase, en *Database → Migrations* (o en el historial de migraciones). Debe seguir mostrando solo las 3 versiones del 18-11 (`20261118000315`, `20261118000924` y `20261118022422`), sin `20261122120000`.
  - **Si algo sale mal:** si aparece `20261122120000` aplicada, **detente y avisa**. No intentes revertirla por tu cuenta.

- [ ] **1.2 Confirmar que nada aplica migraciones solo.**
  - **Quién:** el propietario.
  - **Qué necesitas:** acceso al panel de Supabase y a GitHub.
  - **Qué revisar:**
    - el repositorio no tiene `.github/workflows/` (comprobado por Claude el 22-11 en la rama del PR #34);
    - en el panel de Supabase, la **integración con GitHub / Branching** del proyecto de staging debe estar **desactivada** o sin conexión a este repositorio. **POR CONFIRMAR:** Claude no puede ver el panel.
    - ninguna otra persona o herramienta tiene instrucciones de correr `supabase db push` sobre staging.
  - **Bien si:** se cumplen los tres puntos.
  - **Si algo sale mal:** si la integración con GitHub o Branching está activa, **detente y avisa** antes de seguir. Podría aplicar la migración desde el repositorio.

- [ ] **1.3 Tener las credenciales en su lugar (fuera del repositorio).**
  - **Quién:** el propietario.
  - **Qué necesitas** (según [17 §5.2–§5.3](17-supabase-seguridad-respaldo.md)):
    - la contraseña de la base (`<db-password>`), en tu gestor de contraseñas;
    - la cadena del **Session pooler** (puerto **5432**, usuario `postgres.<project-ref>`), copiada del botón **Connect** del panel. Guárdala en `~/.config/cotizador/db-url` con permisos `600`, escrita con un editor de texto para que no quede en el historial de la terminal. No uses el *transaction pooler* (6543);
    - el proyecto de staging **no pausado**: si está pausado, reanúdalo desde el panel.
  - **Bien si:** `~/.config/cotizador/db-url` existe, tiene permisos `600` y **no** está dentro de la carpeta del repositorio.
  - **Si algo sale mal:** si no recuerdas la contraseña, se puede restablecer en *Database → Settings*. Eso cambia la contraseña para todo lo que la use; avisa antes si no estás seguro.

---

## Fase 2 · Respaldo real (A-52), en la máquina del propietario

Procedimiento completo en [17 §5.3](17-supabase-seguridad-respaldo.md). El script **no** contiene secretos, se niega a escribir dentro del repositorio y se niega a respaldar sin cifrado.

- [ ] **2.1 Preparar las herramientas (una sola vez).**
  - **Quién:** el propietario.
  - **Qué necesitas:**
    - **`age`** para cifrar. Crea la clave con `age-keygen -o ~/.config/cotizador/clave-respaldo.txt` y guarda ese archivo (clave **privada**) en tu gestor de contraseñas o en un medio fuera de línea. La línea `Public key: age1...` es la clave pública y no es secreta.
    - **Una de dos vías para volcar la base:**
      - **modo `cli`** (recomendado): la CLI de Supabase **y Docker** (Docker Desktop) funcionando;
      - **modo `pgdump`**: el cliente PostgreSQL **17 o superior**, porque staging usa Postgres 17.11 y un `pg_dump` más viejo se niega a volcarlo.
  - **Bien si:**
    - `age --version` responde;
    - y, según el modo, Docker está corriendo con la CLI instalada, o `pg_dump --version` muestra 17 o más.
  - **Si algo sale mal:** con un `pg_dump` 16 o anterior no se puede respaldar staging: instala la 17 o usa el modo `cli`.

- [ ] **2.2 Crear la carpeta de destino fuera del repositorio.**
  - **Quién:** el propietario.
  - **Qué hacer:** `mkdir -p ~/respaldos-cotizador`, de preferencia en un disco cifrado.
  - **Bien si:** la carpeta existe y no está dentro del repositorio.

- [ ] **2.3 Hacer el respaldo.**
  - **Quién:** el propietario, desde la carpeta del repositorio.
  - **Comando** (el que ya existe en el repo, [17 §5.3](17-supabase-seguridad-respaldo.md)):
    ```bash
    SUPABASE_DB_URL_FILE=~/.config/cotizador/db-url \
    BACKUP_DIR=~/respaldos-cotizador \
    BACKUP_AGE_RECIPIENT=age1... \
    BACKUP_CONSERVAR=16 \
    scripts/respaldo-supabase.sh cli
    ```
    Usa `pgdump` en lugar de `cli` si elegiste esa vía. `age1...` es **tu clave pública**.
  - **Bien si:**
    - termina sin error y aparece `~/respaldos-cotizador/respaldo-<fecha>.tar.age`;
    - el script también guarda, dentro del respaldo, `verificacion-origen.txt` (el resultado de `scripts/verificar-restauracion.sql` sobre staging) y `manifiesto.txt` con los SHA-256.
  - **Si algo sale mal:** si el script se detiene, no deja copias a medias. Copia **solo el mensaje de error, sin la cadena de conexión** en #52 y detente.

- [ ] **2.4 Comprobar que el respaldo se puede abrir.**
  - **Quién:** el propietario.
  - **Comandos** ([17 §5.5](17-supabase-seguridad-respaldo.md), paso 2), en una carpeta temporal tuya fuera del repositorio:
    ```bash
    age -d -i ~/.config/cotizador/clave-respaldo.txt respaldo-<fecha>.tar.age | tar -xf -
    ```
    ```bash
    cd respaldo-<fecha> && grep -E '\.sql$' manifiesto.txt | shasum -a 256 -c -
    ```
  - **Bien si:** se descifra y todas las líneas de `shasum` dicen **OK**.
  - **Si algo sale mal:** si no se descifra, revisa que usas la clave privada que corresponde a la pública del paso 2.3. Si un SHA-256 no coincide, el respaldo **no sirve**: repítelo.

- [ ] **2.5 Guardar una segunda copia.**
  - **Quién:** el propietario.
  - **Qué hacer:** copiar el `.tar.age` a un **segundo lugar** tuyo, como un disco externo o tu nube personal. Va cifrado.
  - **Nunca:** a GitHub ni a este repositorio.
  - **Bien si:** el archivo está en dos lugares distintos.

- [ ] **2.6 Ensayar la restauración en local (ruta B) con `diff` = 0.**
  - **Quién:** el propietario. Claude puede guiar, pero no tiene el respaldo ni debe tenerlo, porque contiene datos personales.
  - **Qué necesitas:** un PostgreSQL **17** local y el *stub* de Supabase ([17 §5.6](17-supabase-seguridad-respaldo.md), opción 1). El stub del repositorio es `scripts/diseno/stub-supabase.sql`, que no trae `auth.identities`; hay que crearla como hace `scripts/diseno/ensayo-52/probar-restauracion.sh`. La opción 2 es `supabase start` con Docker.
  - **Pasos** ([17 §5.5](17-supabase-seguridad-respaldo.md), pasos 3, 4 y 6):
    1. **Esquema:** aplicar **solo las 3 migraciones anteriores a #52**: `20261118000315_esquema_inicial.sql`, `20261118000924_guardado_cotizacion_atomica.sql` y `20261118022422_numeracion_atomica.sql`. **No** apliques `20261122120000_guardado_unico_y_contador.sql`: staging todavía no la tiene, y el `diff` saldría distinto de cero sin que haya ningún problema real. `supabase db push` aplicaría todas, así que aquí conviene la vía `psql --single-transaction -v ON_ERROR_STOP=1 -f <archivo>` por cada una de las 3.
    2. **Datos:** cargar `data.sql` con `SET session_replication_role = replica`, con el comando de 17 §5.5, paso 4.
    3. **Verificar:** ejecutar `scripts/verificar-restauracion.sql` contra la base local y comparar con `verificacion-origen.txt` del respaldo, con los comandos de 17 §5.5, paso 6.
  - **Bien si:** `diff` imprime **«Restauración idéntica»** (cero diferencias), incluidas todas las filas `inv.*`.
  - **Si algo sale mal:** cualquier diferencia en `inv.*`, conteos o huellas: **detente y avisa en #52** con la línea del `diff`. Muestra solo las filas `inv.*` y los conteos, nunca correos ni ids. No sigas a la fase 3.

---

## Fase 3 · Verificaciones de solo lectura en staging

**Requiere una autorización tuya aparte** para consultar staging. Hoy no está dada: A-76 no la incluye. Las consultas **solo leen**: devuelven conteos, máximos y configuración, **nunca** ids de cuentas ni correos.

- [ ] **3.1 Elegir UNA vía** (las dos devuelven exactamente lo mismo: [23 §8](23-revision-52-insert-directo.md)).
  - **Vía A · Editor SQL de Supabase** (sin instalar nada):
    - abre el editor del proyecto de staging, pega el archivo **completo** `scripts/diseno/verificaciones-52/solo-lectura-editor.sql` y ejecútalo **una vez**;
    - la primera línea (`set transaction read only;`) pone la consulta en modo de solo lectura, y la segunda devuelve todas las verificaciones como filas `(verificacion, resultado)`;
    - **si el editor rechaza `set transaction read only`:** borra solo esa línea y ejecuta la consulta `SELECT` que queda. Solo lee catálogos y cuenta filas. **POR CONFIRMAR** en el editor real: no se ha probado allí.
  - **Vía B · psql** (en tu máquina):
    - guarda la contraseña en `~/.pgpass` (permisos `600`) para no escribirla en la línea de comandos ([17 §5.2](17-supabase-seguridad-respaldo.md));
    - ejecuta, con la cadena del Session pooler **sin** la contraseña:
      ```bash
      psql "postgresql://postgres.<project-ref>@<pooler-host>:5432/postgres" -X -f scripts/diseno/verificaciones-52/solo-lectura.sql
      ```
    - **solo con psql:** este archivo usa metaórdenes de psql y no sirve en el editor.
  - **Quién:** el propietario.
  - **Bien si:** aparecen las filas V1 a V17 y **V17 dice `on`**.
  - **Si algo sale mal:** un error de sintaxis en el editor casi siempre significa que pegaste `solo-lectura.sql` en vez de `solo-lectura-editor.sql`. Cualquier otro error: copia **solo el mensaje** en #52 y detente.

- [ ] **3.2 Copiar el resultado a #52 sin datos personales.**
  - **Quién:** el propietario.
  - **Qué hacer:** pegar en #52 la tabla de resultados tal cual sale. Ya viene sin ids ni correos. Antes de pegar, revisa que no haya **ninguna** cadena de conexión, contraseña, URL privada ni identificador de cuenta.
  - **Bien si:** #52 tiene V1–V17 y nada sensible.

- [ ] **3.3 Leer el semáforo** (versión simple; el detalle está en [23 §8](23-revision-52-insert-directo.md)).

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
| **V17** · modo solo lectura | `on` | Cualquier otra cosa: **no** sigas usando esa vía |

---

## Fase 4 · Revisión antes de pedir A-59

- [ ] **4.1 Revisión independiente de los resultados.**
  - **Quién:** Claude y ChatGPT, a partir de lo publicado en #52.
  - **Qué se revisa:**
    - la fase 2: respaldo verificado y `diff` = 0;
    - el semáforo de la fase 3;
    - dueños y BYPASSRLS (V1–V3);
    - privilegios por defecto (V6);
    - esquemas expuestos (V8);
    - contadores y datos anómalos (V10–V16).
  - **Bien si:** ambos concluyen que se puede pedir A-59 y no queda ningún «detente» abierto.
  - **Si algo sale mal:** cualquier anomalía se discute y decide en #52 antes de seguir. Si es de contadores, va por D-52-4b.

---

## Fase 5 · Lo que viene DESPUÉS (requiere la autorización individual A-59)

**Solo se menciona; esta lista no da instrucciones para ejecutarlo.**

- Aplicar la migración `20261122120000_guardado_unico_y_contador.sql` en staging.
- Repetir V1–V17. Se espera, por ejemplo: V2 con DEFINER `t`, V7 con 4 políticas y V4/V5 sin escritura directa ni acceso a `private` ([23 §9](23-revision-52-insert-directo.md), paso 5).
- Correr los scripts adaptados `scripts/verificar-rls.mjs` y `scripts/verificar-numeracion.mjs`.
  - **El test de importar el máximo de INT4 solo se corre DESPUÉS de aplicar la migración:** con el esquema actual bloquearía la cuenta de prueba (H4).
- Correr `scripts/e2e-staging.mjs` (cuentas reales) y `scripts/e2e-staging-anonimo.mjs` (59/59).
- **Ojo con la reversión:** `scripts/diseno/ensayo-52/reversion-52.sql` devuelve el comportamiento **anterior**, que es el inseguro: vuelven la escritura directa, el reemplazo de documentos y el riesgo H4. No es un «deshacer» neutro; usarla exige una decisión explícita ante un incidente.

---

## Fase 6 · Qué decide el propietario en cada paso

| Paso | Decisión del propietario | Estado al 22-11-2026 |
|---|---|---|
| 1.1–1.3 | Confirmar que nada se aplicó, que no hay integraciones automáticas y dónde están las credenciales | Pendiente (la integración con GitHub del panel está **POR CONFIRMAR**) |
| 2.1–2.6 | Hacer el respaldo real, guardarlo en dos lugares y ensayar la restauración (`diff` = 0) | Pendiente (A-52: lo hace el propietario) |
| 3 | **Autorizar las consultas de solo lectura** en staging y elegir la vía (editor o psql) | **No autorizado todavía** |
| 3.3 / 4 | Si V10 o V13 encuentran casos: **D-52-4b** caso a caso | Solo si aparecen |
| 4 | Aceptar la revisión de resultados | Pendiente |
| 5 | **A-59:** autorización individual para aplicar la migración en staging | **No autorizado** |
| — | Política de borrado de trabajos emitidos (D-52-5) antes de un lanzamiento público | Provisional |

## Datos faltantes y puntos por confirmar

- **POR CONFIRMAR:** si el proyecto de staging tiene activa la integración con GitHub o Branching de Supabase. Solo se ve en el panel.
- **POR CONFIRMAR:** si el editor SQL de Supabase acepta `set transaction read only` dentro del texto pegado. Se reprodujo en local, pero no en el editor real.
- **DATO FALTANTE:** el segundo lugar donde se guardarán los respaldos. Lo elige el propietario, como anota el README.
- **DATO FALTANTE:** el comando exacto para crear el stub local con `auth.identities` en una sola línea. Hoy está repartido entre `scripts/diseno/stub-supabase.sql` y `scripts/diseno/ensayo-52/probar-restauracion.sh`. La opción con Docker (`supabase start`) no lo necesita.
- **Nota:** [17 §5.5](17-supabase-seguridad-respaldo.md), paso 3, sugiere `supabase db push` para el esquema. Para el ensayo de la fase 2 **no** sirve tal cual, porque aplicaría también la migración de #52. Usa las 3 migraciones anteriores, como dice el paso 2.6.
