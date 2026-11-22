# 17 · Supabase: auditoría de seguridad, respaldo y Google OAuth

**Fecha:** 18-11-2026 · **PR:** #34 (sin merge) · **Issue:** #35 · **Frente E** (Claude).

**Alcance:** auditoría de **solo lectura** del proyecto de staging `calculadora-fletes-staging`. Herramientas usadas: asesores de Supabase, catálogos de Postgres con `SELECT` y la documentación oficial. **No se cambió nada en Supabase**: ni configuración, ni datos, ni migraciones. El otro proyecto de la organización no se consultó.

En este documento no figuran el identificador del proyecto, URLs privadas, claves ni correos. Se usan marcadores: `<project-ref>`, `<db-password>`, `<staging-host>`, `<region>`.

> Etiquetas: **VERIFICADO** (consultado en el servicio real o ensayado) · **DOCUMENTADO** (fuente oficial, sin verificar en el panel) · **PENDIENTE** (paso manual del propietario) · **DECISIÓN** (la toma el propietario).

## 1. Resumen

| # | Hallazgo | Severidad | Estado |
|---|---|---|---|
| H1 | RLS, políticas, GRANT, funciones y esquema `private` coinciden con lo diseñado. `anon` no tiene privilegios sobre ninguna tabla; solo puede ejecutar `get_public_quote` | — (correcto) | VERIFICADO |
| H2 | **Restaurar el esquema volcado (`schema.sql`) en un proyecto Supabase nuevo amplía los privilegios.** Los privilegios por defecto de Supabase dan `ALL` a `anon` y `authenticated` sobre cada tabla y función nueva, y el volcado solo agrega `GRANT`: no revoca. Resultado en el ensayo: `anon` con 42 privilegios de tabla; el dueño puede leer `token_hash`, reescribir el número de un trabajo y modificar una cotización emitida (se rompe A-47). Los datos quedan protegidos por RLS, pero las restricciones por columna se pierden | **Alta** si se restaura así | VERIFICADO en ensayo local. Mitigado con la **ruta B** (§5.5) y la verificación `inv.*` |
| H3 | Las 3 migraciones aplicadas tienen **contenido idéntico** (md5) al del repositorio, pero **otras versiones**: repo `20261118000100/200/300` y remoto `20261118000315/000924/022422`. Un `supabase db push` futuro intentaría reaplicarlas y fallaría | Media (operativa) | VERIFICADO. **RESUELTO** en el repositorio: archivos renombrados a las versiones remotas (opción a), sin escribir en Supabase |
| H4 | Privilegios por defecto de Supabase en `public`: toda tabla o función **nueva** queda abierta a `anon` salvo que su migración la revoque. Las 3 migraciones lo hacen; una migración futura que lo olvide expondría la tabla | Media (latente) | VERIFICADO. Regla para migraciones futuras (§2, fila 10) |
| H5 | Protección de contraseñas filtradas **desactivada**. Según la documentación oficial, solo existe en el plan **Pro o superior** | Baja en staging (solo 2 usuarios de prueba, sin registro público) | VERIFICADO (asesor) + DOCUMENTADO |
| H6 | Asesor: 3 funciones `SECURITY DEFINER` ejecutables por `authenticated` y 1 por `anon` (`get_public_quote`) | Aceptado por diseño | VERIFICADO. Todas con `search_path` vacío y validación de dueño |
| H7 | `quote_counters` con RLS y sin políticas (aviso INFO) | Aceptado por diseño: nadie lo lee por la API | VERIFICADO |
| H8 | Ajustes de Auth que la API de solo lectura no expone (registro abierto, URLs, MFA de la cuenta, etc.) | — | PENDIENTE: lista §3 |
| H9 | La organización ya tiene **2 proyectos gratuitos activos** (el límite del plan gratuito). Un simulacro de restauración en un **proyecto Supabase nuevo** exige pausar uno o pagar | Media (planificación) | VERIFICADO (lista de proyectos). DECISIÓN §9 |

Asesor de rendimiento: **sin hallazgos**. Invariantes de `scripts/verificar-restauracion.sql` ejecutadas en staging (solo lectura): **todas correctas** (§2, fila 15).

## 2. Auditoría (18-11-2026)

| # | Control | Estado verificado | Evidencia | Acción |
|---|---|---|---|---|
| 1 | Proyecto | `ACTIVE_HEALTHY`, región `sa-east-1`, **Postgres 17.11** | `get_project`, `select version()` | — |
| 2 | Migraciones aplicadas vs repo | 3 de 3, mismos nombres y **md5 idéntico** del SQL; las versiones (marca de tiempo) difieren | `supabase_migrations.schema_migrations` vs `md5sum` de `supabase/migrations/*.sql` | **Resuelto (18-11-2026):** se aplicó (a), renombrar los archivos del repositorio a las versiones remotas, sin escribir en Supabase. Se descartó (b) `supabase migration repair`, que escribe en el historial remoto |
| 3 | RLS | Activada en las **6** tablas de `public` (`profiles`, `vehicles`, `jobs`, `client_quotes`, `quote_shares`, `quote_counters`). Sin `FORCE RLS` (no hace falta: el dueño de las tablas es `postgres`, que la API no usa) | `pg_class.relrowsecurity` | — |
| 4 | Políticas | **17**: 4 (`SELECT/INSERT/UPDATE/DELETE`) por dueño en `profiles`, `vehicles`, `jobs` y `client_quotes`, todas `TO authenticated` con `(select auth.uid()) = owner_id`; 1 de lectura en `quote_shares`; 0 en `quote_counters` | `pg_policies` | Informativo: `client_quotes_update` no tiene efecto porque falta `GRANT UPDATE` (documentos inalterables, A-47). Se puede dejar |
| 5 | GRANT a `anon` | **Ninguno** sobre tablas de `public` o `private` | `information_schema.role_table_grants` | — |
| 6 | GRANT a `authenticated` | `profiles` y `vehicles`: `SELECT, INSERT, UPDATE, DELETE`. `jobs`: `SELECT, INSERT, DELETE` + `UPDATE (status, payment)`. `client_quotes`: `SELECT, INSERT, DELETE` (sin `UPDATE`). `quote_shares`: `SELECT` de 6 columnas, **sin `token_hash`**. `quote_counters`: nada | `role_table_grants`, `column_privileges` | — |
| 7 | Funciones | 7 funciones, **todas con `search_path=''`**, dueño `postgres`. `SECURITY DEFINER`: `private.allocate_quote_number`, `public.create_quote_share`, `public.get_public_quote`, `public.revoke_quote_share`. `EXECUTE` de `anon`: solo `get_public_quote`. `PUBLIC`: ninguna | `pg_proc`, `has_function_privilege` | — |
| 8 | Esquema `private` | `anon` sin `USAGE`; `authenticated` con `USAGE` (necesario para que `create_job_with_quote` llame a la función de numeración) | `has_schema_privilege` | **PENDIENTE (panel):** confirmar que *Exposed schemas* de la Data API **no** incluye `private` (§3). El asesor no marcó `allocate_quote_number`, coherente con que no está expuesto |
| 9 | Extensiones | `pgcrypto` 1.3 y `uuid-ossp` en `extensions`; `pg_stat_statements`; `supabase_vault`; `plpgsql`. **`pg_graphql` no instalada** (GraphQL inactivo, menos superficie); sin `pg_net` ni `pg_cron` | `list_extensions` | — |
| 10 | Privilegios por defecto | En `public`, `postgres` y `supabase_admin` conceden `ALL` a `anon`, `authenticated` y `service_role` sobre tablas, funciones y secuencias nuevas (comportamiento estándar de Supabase) | `pg_default_acl` | **Regla:** toda migración nueva debe incluir `revoke all ... from public, anon, authenticated` y `GRANT` explícitos (como las 3 actuales) y comprobarse con `scripts/verificar-restauracion.sql`. Opcional (**DECISIÓN**, es DDL): una migración que quite esos privilegios por defecto |
| 11 | Roles | Sin roles propios (solo los estándar de Supabase) | `pg_roles` | No hace falta respaldar roles |
| 12 | Auth: datos | 2 usuarios (proveedor `email`, confirmados), 0 anónimos, 0 factores MFA, 1 sesión activa. Storage: 0 buckets, 0 objetos | Conteos agregados | Sin datos personales reales |
| 13 | Tiempos de espera | `statement_timeout`: `anon` 3 s, `authenticated` 8 s (valores estándar) | `pg_roles.rolconfig` | — |
| 14 | Asesores | Seguridad: H5, H6, H7. Rendimiento: ninguno | `get_advisors` | §3 y §4 |
| 15 | Invariantes de la base | Contador ≥ máximo en todas las cuentas (una cuenta tiene contador mayor que su máximo porque sus trabajos se borraron: correcto, los números no se reutilizan); sin números duplicados; sin cotizaciones sin trabajo; sin filas sin usuario; RLS 6/6; políticas 17; privilegios iguales a los esperados | `scripts/verificar-restauracion.sql` (sin la sección de huellas), solo lectura | — |

*Estado actual (22-11, A-74):* la migración de #52 (en el repositorio, **no aplicada en staging**) cambia tres cosas: las políticas pasan de 17 a 13, se revoca la escritura directa y, con N1, un contador puede quedar por debajo del máximo tras una importación. `verificar-restauracion.sql` detecta si la migración está aplicada y valida el estado correspondiente ([23 §11](23-revision-52-insert-directo.md)).
| 16 | Ajustes de Auth | No se pueden leer con herramientas de solo lectura sobre la base | — | §3 |

Conteos de staging al 18-11-2026 (todos de prueba): `auth.users` 2 · `auth.identities` 2 · `profiles` 1 · `vehicles` 13 · `jobs` 23 · `client_quotes` 23 · `quote_shares` 11 (0 vigentes) · `quote_counters` 2.

## 3. Configuración de Auth: lista de verificación manual

Estos ajustes **no** se pueden leer con SQL. El propietario los revisa en el panel de Supabase (proyecto `calculadora-fletes-staging`). Las rutas son las de la documentación oficial al 18-11-2026; los nombres del panel cambian con frecuencia.

| Ajuste | Ruta en el panel | Recomendado en staging | Plan | Fuente |
|---|---|---|---|---|
| Registro de usuarios nuevos | Authentication → Sign In / Providers → *User Signups* → **Allow new users to sign up** | **Desactivado** mientras no haya Google. Ojo: es **global** y también bloquea a usuarios **nuevos** de Google (§7.4) | Todos | Panel (a confirmar) |
| Confirmación de correo | Authentication → Sign In / Providers → Email → **Confirm email** | Activada | Todos | Production Checklist |
| Contraseñas | Authentication → Sign In / Providers → Email → longitud mínima y caracteres exigidos | Mínimo **12** (la documentación desaconseja menos de 8) con dígitos, minúsculas, mayúsculas y símbolos | Todos | Password security |
| Contraseñas filtradas (HaveIBeenPwned) | Misma página → *Prevent use of leaked passwords* | Activar **solo si** se pasa a Pro | **Pro o superior**: «Leaked password protection is available on the Pro Plan and above» | Password security |
| Expiración de OTP y enlaces | Authentication → Sign In / Providers → Email → *Email OTP Expiration* | ≤ 3600 s | Todos | Production Checklist |
| Límites de frecuencia | Authentication → **Rate Limits** | Dejar los valores por defecto. Con el SMTP incorporado, los correos por hora tienen un tope fijo que solo cambia con SMTP propio | Todos | Production Checklist (Auth rate limits) |
| Site URL y Redirect URLs | Authentication → **URL Configuration** | *Site URL* = `https://<staging-host>` (no el `http://localhost:3000` por defecto). *Redirect URLs*: `https://<staging-host>` y `https://<staging-host>/**`. Sin comodines genéricos; sin `localhost` cuando sea público | Todos | Redirect URLs |
| Duración del JWT de acceso | Project Settings → JWT Keys (sección *Legacy JWT Secret*) | **3600 s** (valor por defecto y recomendado) | Todos | User sessions |
| Duración máxima, inactividad, una sesión por usuario | Authentication → **Sessions** | No disponible en Free | **Pro o superior** | User sessions |
| Detección de reutilización de *refresh token* | Authentication → Sessions → opciones avanzadas | Activada (por defecto) | Todos | User sessions |
| MFA para usuarios de la app (TOTP) | Authentication → Multi-Factor | Activo por defecto y gratuito; la app v1 no lo usa | Todos | MFA (TOTP) |
| **MFA de la cuenta del propietario** en Supabase | Account → Security (cuenta del panel) | **Activar** | Todos | Production Checklist |
| Exigir MFA en la organización | Organization → Settings / Security | Recomendado si hay más de un miembro | Ver documentación | Production Checklist |
| Esquemas expuestos por la Data API | Project Settings → **Data API** → *Exposed schemas* | Solo `public` (y `graphql_public` si viene por defecto). **Nunca `private`** | Todos | — |
| SSL obligatorio | Database → Settings → **SSL Configuration** | Activado | Todos | Production Checklist |
| Restricciones de red de la base | Database → Settings → **Network Restrictions** | Opcional. Si se activa, incluir la IP desde donde se respalda | Todos | Production Checklist |
| CAPTCHA | Authentication → Attack Protection | No hace falta con el registro cerrado; evaluar antes de un lanzamiento público | Todos | — |
| SMTP propio | Authentication → Emails → SMTP Settings | No hace falta en staging | Todos | Production Checklist |

## 4. Restricciones pendientes (docs/13 §7) y estado verificado

| # | Paso | Estado al 18-11-2026 | ¿Depende del plan? |
|---|---|---|---|
| 1 | Google OAuth | **PENDIENTE.** Solo hay identidades `email`; no hay cliente de Google. Checklist en §7 | No (Google Cloud sin facturación; §7.6) |
| 2 | Cerrar el registro abierto por correo | **No verificable por SQL.** El propietario confirma en el panel (§3, primera fila) | No |
| 3 | Protección de contraseñas filtradas | **Desactivada (asesor). Requiere Pro.** En Free: registro cerrado, contraseñas largas y aleatorias para los usuarios de prueba, longitud mínima 12 | **Sí, Pro** |
| 4 | MFA en las cuentas de Supabase y Cloudflare del propietario | **No verificable** desde aquí | No |
| 5 | Rotar o revocar el token de Cloudflare | Fuera de Supabase; sigue pendiente | No |
| 6 | Decidir el plan antes de cualquier lanzamiento | **DECISIÓN.** Free: pausa por inactividad (7 días), sin respaldos descargables, sin contraseñas filtradas ni límites de sesión | Sí |
| 7 | *(nuevo)* Alinear versiones de migraciones (H3) | **RESUELTO**: archivos del repositorio renombrados | No |
| 8 | *(nuevo)* Respaldo propio periódico y simulacro de restauración | **PREPARADO y ensayado localmente**; falta el primero real (necesita `<db-password>`) | No |

## 5. Respaldo y restauración (plan gratuito)

«Database backups are not available for download for Free Plan projects» (Production Checklist). Por eso el respaldo es **propio**.

### 5.1 Qué se respalda y qué no

| Elemento | ¿Viaja en el respaldo? | Nota |
|---|---|---|
| Tablas, RLS, políticas, funciones y GRANT de `public` y `private` | Sí (`schema.sql`) | Al restaurar en un proyecto nuevo, los privilegios se **amplían** (H2): usar la ruta B, que reconstruye el esquema desde las migraciones del repositorio |
| Datos de `public` (perfiles, vehículos, trabajos, cotizaciones, enlaces, contadores) | Sí (`data.sql`) | Los enlaces públicos vigentes siguen funcionando: se conserva el hash del token |
| `auth.users` y `auth.identities` | Sí (`data.sql`) | Incluye los **hashes** de contraseña: los usuarios conservan su contraseña. Es **dato personal**: el respaldo va cifrado |
| Sesiones y *refresh tokens* | Modo `cli`: sí. Modo `pgdump`: no | Da igual: un proyecto nuevo tiene otras claves de firma, así que todos vuelven a iniciar sesión |
| **Estructura** de los esquemas `auth` y `storage` | No | La administra Supabase. Esta app no la modificó (sin triggers ni políticas propias ahí) |
| Archivos de Storage | No aplica | 0 buckets |
| Configuración de Auth (proveedores, Google, Site/Redirect URLs, límites, SMTP), claves de API, claves JWT, Data API, restricciones de red | **No** | Se reconfigura a mano (§3 y §7). La app se recompila con la nueva URL y la nueva clave publicable |
| Historial de migraciones (`supabase_migrations`) | No (por defecto) | Con la ruta B, `supabase db push` lo recrea |
| Roles | No hace falta | Sin roles propios (§2, fila 11) |

### 5.2 Riesgos y requisitos

- **Contraseña de la base (`<db-password>`):** solo la tiene el propietario (Database → Settings permite restablecerla). Guardarla en un gestor de contraseñas. No escribirla en la línea de comandos (queda en el historial y en la lista de procesos): usar un archivo `600` fuera del repositorio o `~/.pgpass`.
- **IPv6 vs pooler:** la conexión directa (`db.<project-ref>.supabase.co`) es solo IPv6 salvo que se pague el complemento IPv4. Usar el **Session pooler** (puerto **5432**, usuario `postgres.<project-ref>`, host del pooler de `<region>`), copiando la cadena exacta del botón **Connect** del panel. No usar el *transaction pooler* (6543) para `pg_dump`.
- **Versión de `pg_dump`:** el proyecto usa **Postgres 17.11**, así que `pg_dump` y `psql` deben ser de la versión **17 o superior**: `pg_dump` se niega a volcar un servidor más nuevo. La CLI de Supabase evita el problema porque usa una imagen Docker de la misma versión. El contenedor de Claude solo tiene la 16: desde aquí no se puede respaldar el proyecto real, aunque se tuviera la contraseña.
- **`\restrict` en los volcados:** los `pg_dump` recientes (16.10+ y 17.6+) agregan esa línea. Restaurar con un `psql` de la misma versión o una más nueva.
- **Docker:** obligatorio para `supabase db dump`.
- **Proyecto pausado:** no se puede volcar. Primero se reanuda desde el panel.
- **Límite de proyectos:** ver H9. El simulacro gratuito es **local** (§5.6).
- **Privilegios por defecto (H2):** después de toda restauración, ejecutar `scripts/verificar-restauracion.sql` y exigir que todas las filas `inv.*` coincidan.

### 5.3 Respaldo paso a paso (máquina del propietario)

**Preparación (una vez):**
1. Instalar `age` y crear la clave: `age-keygen -o ~/.config/cotizador/clave-respaldo.txt`. Guardar ese archivo (clave **privada**) en el gestor de contraseñas o en un medio fuera de línea. La línea `Public key: age1...` es el destinatario, no es secreta.
2. Elegir el modo:
   - `cli` (recomendado, comandos oficiales): Supabase CLI + Docker Desktop.
   - `pgdump`: cliente PostgreSQL **17** (`brew install postgresql@17`, o el instalador oficial).
3. Guardar la cadena del Session pooler en un archivo fuera del repositorio:
   ```bash
   mkdir -p ~/.config/cotizador && chmod 700 ~/.config/cotizador
   printf '%s\n' 'postgresql://postgres.<project-ref>:<db-password>@<pooler-host>:5432/postgres' > ~/.config/cotizador/db-url
   chmod 600 ~/.config/cotizador/db-url
   ```
   (Escribirla con un editor evita que la contraseña quede en el historial de la terminal.)
4. Crear la carpeta de destino **fuera del repositorio**, de preferencia en un disco cifrado: `mkdir -p ~/respaldos-cotizador`.

**Cada respaldo:**
```bash
SUPABASE_DB_URL_FILE=~/.config/cotizador/db-url \
BACKUP_DIR=~/respaldos-cotizador \
BACKUP_AGE_RECIPIENT=age1... \
BACKUP_CONSERVAR=16 \
scripts/respaldo-supabase.sh cli        # o: pgdump
```
El script (`set -euo pipefail`, `umask 077`):
- se niega a escribir dentro del repositorio y a respaldar sin cifrado;
- genera `roles.sql`, `schema.sql` y `data.sql`;
- ejecuta `scripts/verificar-restauracion.sql` contra el **origen** (`verificacion-origen.txt`);
- escribe `manifiesto.txt` con las versiones y los SHA-256;
- empaqueta y cifra todo en `respaldo-<fecha>.tar.age`;
- borra los archivos en claro y, si algo falla a mitad, no deja copias parciales.

Después: copiar el `.tar.age` a un **segundo lugar** del propietario (disco externo o nube propia; está cifrado). **Nunca** a GitHub ni a este repositorio.

Equivalente manual del modo `cli` (documentación oficial «Backup and Restore using the CLI»):
```bash
supabase db dump --db-url "$DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$DB_URL" -f schema.sql
supabase db dump --db-url "$DB_URL" -f data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
```

### 5.4 Frecuencia y retención (propuesta: DECISIÓN del propietario)

| Etapa | Frecuencia | Retención | Simulacro de restauración |
|---|---|---|---|
| Staging (solo datos de prueba, como hoy) | Antes de cada migración y 1 vez al mes | Últimos 3 | Trimestral, local |
| Beta con usuarios reales en Free | **Semanal** + antes de cada migración | 8 semanales + 12 mensuales | **Mensual**, local (§5.6), con el informe de `diff` guardado junto al respaldo |
| Pro | Respaldos diarios de Supabase (7 días) **más** el respaldo propio mensual | 12 mensuales | Trimestral |

El script **avisa** cuando hay más respaldos que `BACKUP_CONSERVAR`, pero **no borra** nada: el borrado lo decide el propietario.

### 5.5 Restauración (ruta B, recomendada)

La ruta B reconstruye el esquema con las **migraciones del repositorio**, que revocan y conceden de forma explícita, y carga solo los **datos** del respaldo. Es la que reprodujo la base **idéntica** en el ensayo (§6).

1. **Destino:**
   - un proyecto Supabase nuevo en `sa-east-1` (ver H9: hoy exige pausar un proyecto o pagar); o
   - un Postgres local (§5.6).
2. **Descifrar y comprobar:**
   ```bash
   age -d -i ~/.config/cotizador/clave-respaldo.txt respaldo-<fecha>.tar.age | tar -xf -
   ```
   ```bash
   cd respaldo-<fecha> && grep -E '\.sql$' manifiesto.txt | shasum -a 256 -c -
   ```
3. **Esquema desde el repositorio:**
   > **Estado actual (22-11, A-76):** el repositorio ya contiene la migración de #52 (`20261122120000_guardado_unico_y_contador.sql`), que **staging todavía no tiene**. Para restaurar un respaldo tomado **antes** de aplicarla, usa **solo las 3 migraciones anteriores** con la vía `psql` de abajo. `supabase db push` las aplicaría todas, y el `diff` de la verificación no daría cero sin que hubiera ningún problema real. Ver [25 · Lista de comprobación](25-lista-staging-52.md), paso 2.6.
   - con la CLI: `supabase link --project-ref <nuevo-project-ref>` y luego `supabase db push`;
   - o, sin CLI, por cada archivo:
   ```bash
   psql "$NEW_DB_URL" --single-transaction -v ON_ERROR_STOP=1 -f supabase/migrations/<archivo>.sql
   ```
4. **Datos:**
   ```bash
   psql "$NEW_DB_URL" --single-transaction --variable ON_ERROR_STOP=1 \
     --command 'SET session_replication_role = replica' --file data.sql
   ```
   El modo `replica` desactiva los *triggers* y las claves foráneas durante la carga, así que el orden de las tablas no importa. Si `data.sql` (modo `cli`) trae `COPY` de tablas internas que el destino no tiene, se comentan esa línea y su `\.` (documentación oficial, *Troubleshooting*).
5. **Reconfigurar a mano:**
   - Auth (§3) y Google (§7): la URI de callback cambia con el nuevo `<project-ref>`;
   - nueva clave publicable y URL en `.env.staging.local`; recompilar y desplegar el Worker.
6. **Verificar:**
   ```bash
   psql "$NEW_DB_URL" -X -A -t -F ' | ' -f scripts/verificar-restauracion.sql > restaurado.txt
   ```
   ```bash
   diff verificacion-origen.txt restaurado.txt && echo "Restauración idéntica"
   ```
   - Exigir **diferencia cero**: conteos, huellas md5 de identificadores, numeración (`inv.contador_menor_que_maximo` = 0, es decir, contador ≥ máximo) y privilegios (`inv.*`).
   - Después, contra el proyecto restaurado: `scripts/verificar-rls.mjs` (los usuarios de prueba conservan su contraseña) y, si se acepta que cree datos, `scripts/verificar-numeracion.mjs`.

**Ruta A (oficial completa: `roles.sql` + `schema.sql` + `data.sql`):** sirve para recuperar exactamente lo que había, pero en un proyecto Supabase nuevo **deja privilegios de más** (H2). Si se usa, el `diff` de `inv.*` lo detecta; en ese caso, rehacer por la ruta B. No usar en producción una restauración con diferencias en `inv.*`.

### 5.6 Simulacro local (gratuito)

- **Opción 1, sin Docker (la ensayada):** Postgres 17 local, más un *stub* mínimo de Supabase (roles `anon`/`authenticated`/`service_role`, esquema `auth` con `users`, `identities` y `auth.uid()`, y `pgcrypto` en `extensions`). Después, los pasos 3, 4 y 6 de §5.5. El *stub* usado está descrito en §6.
- **Opción 2, con Docker:** `supabase start` levanta una pila local con el esquema `auth` real (cadena local `postgresql://postgres:postgres@127.0.0.1:54322/postgres`). Luego, pasos 3, 4 y 6. No ensayada aquí: el contenedor de Claude no tiene Docker en funcionamiento.

## 6. Ensayo local de respaldo y restauración (18-11-2026)

**No tocó Supabase.** Se hizo en un Postgres desechable dentro del contenedor de Claude, con datos **ficticios** (dominio `.invalid`).

**Entorno:**
- PostgreSQL **16.15**: `pg_dump`/`psql` 16. No hay 17 disponible: el repositorio PGDG está bloqueado por la red.
- `age` 1.x.
- Sin Docker en funcionamiento: el modo `cli` **no se pudo ensayar**.

**Pasos y comandos:**
1. Clúster desechable en `/tmp` (`initdb`, `pg_ctl`, socket local, puerto 55432).
2. *Stub* de Supabase:
   - roles `anon`, `authenticated` y `service_role`;
   - `extensions.pgcrypto`;
   - `auth.users` y `auth.identities`;
   - `auth.uid()` leyendo el claim `sub`, como Supabase;
   - **los mismos privilegios por defecto de Supabase** en `public`.
3. Las **3 migraciones del repositorio**, con `psql --single-transaction -v ON_ERROR_STOP=1`: aplicaron **sin errores**.
4. Datos ficticios por el mismo camino que la API (`set role authenticated` + claim `sub`), para que actúen RLS, GRANT y funciones:
   - 2 usuarios, 1 perfil, 3 vehículos (uno predeterminado);
   - 7 trabajos con cotización, uno importado con `issued_number` ya ocupado (quedó como interno 6, emitido 3);
   - 2 enlaces (1 revocado);
   - un trabajo borrado, para que el contador quede por encima del máximo.
5. Respaldo:
   ```bash
   SUPABASE_DB_URL_FILE=… BACKUP_DIR=… BACKUP_AGE_RECIPIENT=age1… scripts/respaldo-supabase.sh pgdump
   ```
   Resultado: `respaldo-20261118T043527Z.tar.age` (61,6 KB, permisos `600`). `age -d` lo descifró y los SHA-256 del manifiesto coincidieron (3/3 OK). Con la versión final del script se repitió todo de punta a punta (`respaldo-20261118T044448Z.tar.age` → descifrar → `shasum -c` 3/3 → ruta B → `diff verificacion-origen.txt restaurado.txt`): **«Restauración idéntica»**. El aviso de retención apareció como se esperaba, sin borrar nada.
6. Controles del script (probados):
   - rechaza `BACKUP_DIR` dentro del repositorio;
   - rechaza respaldar sin cifrado;
   - rechaza un modo desconocido o una carpeta inexistente;
   - ante una falla de conexión no deja carpetas parciales.
7. **Ruta A** (comando oficial `psql --single-transaction … roles.sql schema.sql 'SET session_replication_role = replica' data.sql` sobre una base nueva con el *stub*):
   - primero falló con `schema "public" already exists`, porque el volcado con `pg_dump -n public` incluye `CREATE SCHEMA public`. Según su documentación, `supabase db dump` agrega `IF NOT EXISTS`, así que con el modo `cli` no debería pasar. Con el modo `pgdump`, la ruta B no usa `schema.sql`;
   - tras comentar esa línea, restauró con datos **idénticos**, pero con **privilegios ampliados** (H2).
8. **Ruta B** (las 3 migraciones + `data.sql`): restauró sin errores.

**Resultado (`diff` de `scripts/verificar-restauracion.sql`):**

| Control | Origen | Ruta A | Ruta B |
|---|---|---|---|
| `auth.users` / `auth.identities` | 2 / 2 | 2 / 2 | 2 / 2 |
| `profiles` / `vehicles` | 1 / 3 | 1 / 3 | 1 / 3 |
| `jobs` / `client_quotes` | 7 / 7 | 7 / 7 | 7 / 7 |
| `quote_shares` (vigentes) / `quote_counters` | 2 (1) / 2 | 2 (1) / 2 | 2 (1) / 2 |
| Huellas md5 (ids, números, totales, hashes de token, contadores) | — | **iguales** | **iguales** |
| `inv.privilegios_tabla_anon` | 0 | **42** | 0 |
| `inv.authenticated_lee_token_hash` | false | **true** | false |
| `inv.funciones_ejecutables_por_anon` | solo `get_public_quote` | **6 funciones** | solo `get_public_quote` |
| `inv.privilegios_tabla_authenticated` | según migraciones | **ALL en 6 tablas** | según migraciones |
| **`diff` total** | — | 4 diferencias | **0 diferencias** |

**Pruebas funcionales tras restaurar:**

| Prueba | Ruta B | Ruta A |
|---|---|---|
| B ve los trabajos de A | 0 filas | — |
| `anon` lee `jobs` | `permission denied` | — |
| Nuevo número de A (contador 6) | **7** | — |
| Nuevo número de B (último borrado 2, máximo 1) | **3**: no reutiliza | — |
| A reescribe `jobs.number` | `permission denied` | **lo logra** |
| A modifica `client_quotes` | `permission denied` | **lo logra** |
| A lee `token_hash` | `permission denied` | **lo logra** |
| A cambia el estado de un trabajo | permitido | permitido |

**Límites del ensayo:**
- Postgres 16 y no 17.
- *Stub* en vez de Supabase real: no están la estructura completa de `auth`, ni `storage`, ni Supavisor.
- No se ensayó el modo `cli` (sin Docker).
- No se ensayó contra el proyecto real (requiere `<db-password>` y un cliente 17).

El clúster se detuvo y se borró al terminar. El *stub* y los datos ficticios quedaron solo en el directorio temporal de la sesión, no en el repositorio.

**Primer respaldo real (PENDIENTE, propietario):**
1. Ejecutar `scripts/respaldo-supabase.sh` en modo `cli` o `pgdump` (cliente 17).
2. Hacer un simulacro local por la ruta B.
3. Registrar aquí la fecha y el resultado del `diff`.

## 7. Google OAuth: checklist

### 7.1 Qué cubre ya el código

`src/web/cloud/auth.ts`, `client.ts` y `components/AccountView.tsx`:
- `signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin, scopes: 'openid email profile' } })`. Vuelve a la raíz del sitio de staging.
- Cliente con `flowType: 'pkce'` y `detectSessionInUrl: true`. Al volver, supabase-js canjea el `?code=` y lo borra de la URL con `history.replaceState`, sin código adicional. Verificado en el código de `@supabase/auth-js` incluido en `@supabase/supabase-js` 2.118.0.
- Antes de intentar, la app consulta `GET <supabase-url>/auth/v1/settings` con la clave publicable. Si `external.google` no es `true`, muestra «El inicio con Google todavía no está configurado en este entorno de pruebas».
- El acceso con contraseña solo aparece con `VITE_TEST_PASSWORD_LOGIN=true` (staging).
- Solo clave publicable en el navegador; rechazo de `sb_secret_`.
- Sin CSP en el Worker que bloquee la navegación a `*.supabase.co` o a Google. `Referrer-Policy: no-referrer` no afecta a OAuth.

**Cambios de código obligatorios:** ninguno. **Opcionales:**
1. Mostrar un mensaje si Supabase devuelve `?error=…&error_description=…`, por ejemplo cuando el registro está cerrado. supabase-js lo convierte en un error de inicialización (`AuthImplicitGrantRedirectError`), pero `AuthStore` no lo muestra: el usuario vuelve como anónimo sin explicación. Prioridad baja.
2. Prueba e2e del inicio del flujo (§7.5).

### 7.2 Google Cloud (propietario)

1. En una cuenta de Google **del propietario**, crear un proyecto nuevo en Google Cloud Console (p. ej. «cotizador-fletes-staging»). **No asociar cuenta de facturación.**
2. **Google Auth Platform → Branding** (pantalla de consentimiento):
   - nombre de la app;
   - correo de soporte;
   - correo de contacto del desarrollador.
3. **Audience:**
   - tipo **External**;
   - estado de publicación **Testing**;
   - agregar como **Test users** solo las cuentas de Google que probarán.

   En modo prueba solo esas cuentas pueden iniciar sesión, lo que limita el registro por Google sin tocar Supabase.
4. **Data Access (Scopes):** `openid` (agregar a mano), `.../auth/userinfo.email` y `.../auth/userinfo.profile`. Son ámbitos **no sensibles**: la documentación de Supabase advierte de verificación solo si se agregan ámbitos sensibles o restringidos. No agregar otros.
5. **Clients → Create client:**
   - tipo **Web application**, nombre «Supabase staging»;
   - *Authorized JavaScript origins*: `https://<staging-host>`. Para el flujo por redirección que usa la app no es estrictamente necesario, pero la guía de Supabase lo indica;
   - *Authorized redirect URIs*: `https://<project-ref>.supabase.co/auth/v1/callback`. Copiarla tal cual desde la página del proveedor Google en Supabase.
6. Copiar el **Client ID** y el **Client Secret** directamente al panel de Supabase (paso 7.3). **Nunca** por chat, GitHub, issues ni el repositorio.

### 7.3 Supabase (propietario)

7. Authentication → Sign In / Providers → **Google**:
   - activar;
   - pegar el Client ID y el Client Secret;
   - dejar *Skip nonce check* **desactivado**;
   - guardar.
8. Authentication → **URL Configuration**:
   - *Site URL* = `https://<staging-host>`;
   - *Redirect URLs*: `https://<staging-host>` y `https://<staging-host>/**`.
9. Decidir el registro (§7.4).

### 7.4 Registro cerrado y Google: DECISIÓN

*Allow new users to sign up* es un ajuste **global**: si se desactiva, tampoco se crean usuarios **nuevos** con Google. Opciones:

- **(a)** Mantener el registro **abierto** mientras Google esté en modo *Testing*. Solo los *test users* pasan por Google, pero el registro por correo queda abierto.
- **(b)** Registro abierto **más** un *hook* «Before User Created» que rechace `app_metadata.provider = 'email'`. Es una función Postgres gratuita documentada por Supabase, pero es **DDL**: requiere una migración nueva y autorización.
- **(c)** Abrir el registro solo durante la primera entrada de cada usuario de prueba de Google y volver a cerrarlo después. Es manual y propenso a olvidos.

Recomendación: **(a)** mientras sea staging privado (Basic Auth del Worker más usuarios de prueba de Google), y **(b)** antes de cualquier apertura.

### 7.5 Cómo se verificará

- **Manual (propietario):**
  1. abrir staging;
  2. «Mi cuenta» → «Continuar con Google»;
  3. elegir una cuenta *test user*;
  4. aceptar el consentimiento: debe volver a staging con sesión iniciada;
  5. en Supabase → Authentication → Users debe aparecer el usuario con proveedor `google`;
  6. crear un vehículo y una cotización y cerrar sesión;
  7. volver a entrar desde otro navegador.

  Una cuenta de Google **no** listada como *test user* debe ser rechazada por Google.
- **Automática (e2e, propuesta para `scripts/e2e-staging.mjs`; no la implementa este frente):**
  1. comprobar que `/auth/v1/settings` informa `google: true`;
  2. pulsar «Continuar con Google» e **interceptar sin seguir** la navegación;
  3. verificar que la solicitud a `/auth/v1/authorize` lleva `provider=google`, `redirect_to=https://<staging-host>` y `code_challenge`;
  4. verificar que la redirección a `accounts.google.com` lleva el `client_id` esperado, `redirect_uri=https://<project-ref>.supabase.co/auth/v1/callback` y `scope` con `openid email profile`.

  No inicia sesión en Google: automatizar el inicio real con una cuenta de Google no es fiable y requeriría credenciales. Se mantiene «0 solicitudes a dominios externos» abortando esa navegación.
- La RLS no cambia con Google: `scripts/verificar-rls.mjs` sigue valiendo, con usuarios de contraseña.

### 7.6 Facturación y verificación de Google

- Crear el proyecto, la pantalla de consentimiento y un cliente OAuth web **no requiere** cuenta de facturación. El inicio de sesión no usa ninguna API de pago.
- Con solo `openid email profile` no hace falta la verificación de Google (que es para ámbitos sensibles o restringidos). La verificación de **marca** (logo y nombre) es opcional y tarda unos días hábiles (documentación de Supabase).
- **Fuente:** documentación de Supabase «Sign in with Google». No se pudo contrastar con la documentación de Google en esta sesión, porque la red del contenedor no permite `support.google.com`. El propietario lo confirma al crear el cliente: la consola **no** debe pedir una cuenta de facturación.
- En modo *Testing*, Google muestra un aviso de «app no verificada» a los *test users*. Es esperable en staging.

## 8. Pasos manuales del propietario (en orden)

1. Activar **MFA** en las cuentas del panel de Supabase y de Cloudflare.
2. Revisar la **lista §3** en el panel y anotar el estado en el PR. Prioridad:
   1. registro de usuarios nuevos;
   2. *Site URL* y *Redirect URLs*;
   3. *Exposed schemas* sin `private`;
   4. longitud mínima de contraseña.
3. **Google OAuth:** §7.2 y §7.3, más la decisión §7.4.
4. **Primer respaldo real**, con `scripts/respaldo-supabase.sh` (modo `cli`, o `pgdump` con cliente 17), cifrado con `age`, guardado fuera del repositorio y en un segundo lugar.
5. **Simulacro de restauración local** (§5.5 ruta B y §5.6), guardando el `diff` junto al respaldo.
6. **Rotar o revocar** el token de Cloudflare entregado a Claude (docs/13 §9).

## 9. Decisiones que requiere el propietario

> **18-11-2026:** D1, D2 y D5 quedaron resueltas por **A-52** (plan gratuito, respaldo propio y simulacro local) y D4 por **A-53** (Google en modo *Testing*, con registro abierto). Ver [07](07-decisiones.md). Siguen abiertas D3 (segundo lugar de los respaldos) y D7.

| # | Decisión | Opciones | Recomendación |
|---|---|---|---|
| D1 | Plan de Supabase antes de usuarios reales | Free (pausa por inactividad, sin respaldos descargables, sin contraseñas filtradas ni límites de sesión) / Pro (gasto: requiere autorización) | Seguir en Free mientras sea staging; decidir antes de la beta |
| D2 | Frecuencia y retención del respaldo | §5.4 | Staging: antes de cada migración + mensual. Beta: semanal + simulacro mensual |
| D3 | Dónde guardar los respaldos cifrados | Disco del propietario + un segundo lugar (disco externo o nube propia) | Ambos; nunca GitHub |
| D4 | Registro por correo cuando exista Google | §7.4 (a), (b) o (c) | (a) en staging; (b) antes de abrir |
| D5 | Destino del simulacro de restauración | Local (gratis) / proyecto nuevo (exige pausar el otro proyecto o pagar, H9) | Local |
| D7 | Privilegios por defecto (H4) | Regla en cada migración (actual) / migración que los retire | Mantener la regla y la verificación `inv.*`; evaluar la migración antes de producción |

## 10. Archivos

- [`scripts/respaldo-supabase.sh`](../scripts/respaldo-supabase.sh): respaldo cifrado. Modo `pgdump` ensayado; modo `cli` = comandos oficiales, no ensayados aquí.
- [`scripts/verificar-restauracion.sql`](../scripts/verificar-restauracion.sql): una sola consulta `SELECT` con conteos, huellas e invariantes, sin datos personales. Ensayada localmente y ejecutada en staging (sin huellas).

## 11. Fuentes oficiales (consultadas el 18-11-2026)

- Supabase, *Backup and Restore using the CLI*: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- Supabase, *Restore a Platform Project to Self-Hosted* (qué incluye el volcado y qué no; compatibilidad de versiones): https://supabase.com/docs/guides/self-hosting/restore-from-platform
- Supabase, *Production Checklist* (respaldos en Free, pausa, MFA de la cuenta, límites de Auth, SSL, restricciones de red): https://supabase.com/docs/guides/deployment/going-into-prod
- Supabase, *Password security* («Leaked password protection is available on the Pro Plan and above»): https://supabase.com/docs/guides/auth/password-security
- Supabase, *User sessions* (JWT de 1 h; límites de sesión solo en Pro): https://supabase.com/docs/guides/auth/sessions
- Supabase, *Redirect URLs*: https://supabase.com/docs/guides/auth/redirect-urls
- Supabase, *Sign in with Google*: https://supabase.com/docs/guides/auth/social-sign-in/auth-google
- Supabase, *Multi-Factor Authentication (TOTP)* («free to use and is enabled on all Supabase projects by default»): https://supabase.com/docs/guides/auth/auth-mfa/totp
- Supabase, *Before User Created Hook*: https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook
- Supabase, *Database Linter* (avisos 0008, 0028, 0029): https://supabase.com/docs/guides/database/database-linter
