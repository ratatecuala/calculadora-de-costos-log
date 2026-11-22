# 13 · Entorno de pruebas (staging): Cloudflare + Supabase

**Fecha:** 18-11-2026 (sincronizado el 20-11-2026: staging **no** se redesplegó desde el 18-11) · **PR:** #34 (sin merge) · **Autorización:** el propietario autorizó por chat la integración y las pruebas en un entorno **gratuito de desarrollo/staging**. No autorizó producción pública, servicios de pago, facturación, Google Routes real ni merge (registrado como A-46 en [07](07-decisiones.md), pendiente de ratificación escrita en el PR).

> Distinción obligatoria (AGENTS §4): **FUNCIONA (probado en el servicio real)** · **PREPARADO (código listo, sin probar en el servicio real)** · **BLOQUEADO**.

## 1. Recursos usados o creados

| Plataforma | Recurso | Plan | Estado |
|---|---|---|---|
| Supabase | Organización existente (1 sola) | **Gratuito** | Sin cambios de plan |
| Supabase | Proyecto existente de **otro producto** | — | **No se tocó** |
| Supabase | Proyecto **nuevo** `calculadora-fletes-staging` (ref entregado al propietario por chat), región **sa-east-1 (São Paulo)** | Gratuito (creado sin cotización de costo: $0) | Creado 18-11 |
| Cloudflare | Cuenta existente (1 sola) | Workers **Free** | Sin cambios de plan; el token usado no tiene permisos de facturación |
| Cloudflare | Worker existente de otro proyecto | — | **No se tocó** |
| Cloudflare | Worker **nuevo** `calculadora-fletes-staging` en `*.workers.dev` + Durable Object `RouteBudgetDurableObject` (**SQLite**, único disponible en el plan gratuito) | Free | Creado 18-11 |
| Entorno de Claude | Entorno de red propio de este repositorio: solo el host del proyecto Supabase, la API de Cloudflare, su documentación y el host del Worker de staging | — | Creado 18-11 |

Límites del plan gratuito leídos en la documentación oficial (HECHO VERIFICADO, 18-11-2026):
- **Workers Free:** 100.000 solicitudes/día; 10 ms de CPU por invocación; archivos estáticos gratuitos.
- **Durable Objects (Free):** solo con almacenamiento SQLite; 100.000 solicitudes/día, 13.000 GB-s/día, 5 GB. Si se supera un límite, **las operaciones fallan con error, no se cobra**; los límites se reinician a las 00:00 UTC.
- **Supabase Free:** **sin respaldos automáticos descargables**; Supabase recomienda exportar con `supabase db dump` y guardar copias fuera.

## 2. Qué funciona realmente y qué quedó preparado

| Función | Estado | Evidencia |
|---|---|---|
| Calculadora sin cuenta, historial local, PDF por impresión | **FUNCIONA en staging** | e2e móvil y escritorio (§5) |
| Aviso «sin respaldo en la nube» para anónimos | **FUNCIONA** | e2e |
| Esquema `profiles`, `vehicles`, `jobs`, `client_quotes`, `quote_shares` con RLS y GRANT mínimos | **FUNCIONA** (migraciones aplicadas) | `supabase/migrations/` + RLS 39/39 |
| Inicio de sesión **con Google** | **PREPARADO / BLOQUEADO**: falta crear el cliente OAuth en Google Cloud del propietario (§7) | La app consulta a Supabase si Google está habilitado y, si no, lo dice |
| Sesión, cierre y recuperación de sesión | **FUNCIONA** con usuarios de prueba (correo + contraseña, solo staging) | e2e |
| Vehículos en la nube: crear, editar, borrar, predeterminado, recuperar en otro dispositivo | **FUNCIONA** | e2e |
| Cotizaciones en la nube: guardar, historial tras cerrar sesión, estado y pago | **FUNCIONA** | e2e |
| Datos comerciales en la cuenta | **FUNCIONA** (se guardan al crear la cotización) | RLS + e2e |
| Enlace público revocable sin costos internos | **FUNCIONA** | RLS + e2e |
| Copia opcional del historial local a la cuenta, sin duplicados, sin borrar lo local | **FUNCIONA** | e2e (1 copia exacta) |
| Worker sirviendo la app + `/api/route` + Durable Object real | **FUNCIONA** | §5.3 |
| Interruptor de emergencia en caliente | **FUNCIONA en Cloudflare real** | §5.3 |
| Google Routes | **APAGADO** (proveedor simulado) | — |
| Inventario y recursos en el cotizador (fase 1 e integración I-1 + I-1b, 20-11-2026) | **NO DESPLEGADO.** Staging conserva la versión del 18-11; el código nuevo existe solo en la rama, detrás de flags apagadas, y desplegarlo **no está autorizado** | Pruebas locales ([05](05-pruebas-y-calibracion.md), [22 §14](22-diseno-integracion-cotizador.md)) |

## 3. Esquema y seguridad (Supabase)

Migraciones versionadas: [`supabase/migrations/`](../supabase/migrations/).

| Tabla | Contenido | Acceso |
|---|---|---|
| `profiles` | Nombre comercial, teléfono, correo de la cotización, preferencias | Solo el dueño (`auth.uid() = id`) |
| `vehicles` | Nombre, tipo, combustible, km/L, $/km, predeterminado (único por dueño) | Solo el dueño |
| `jobs` | Cotización completa **con costos internos** (`internal`), estado, pago, vehículo usado | Solo el dueño |
| `client_quotes` | **Solo** los 16 campos de `CLIENT_QUOTE_KEYS`; no tiene columnas de costos | Solo el dueño; el público, solo por `get_public_quote` |
| `quote_shares` | Enlaces: **hash SHA-256** del token, expiración, revocación | El dueño lee sin el hash; crear y revocar, solo por funciones |

- **RLS** activa en las 5 tablas, con políticas `SELECT/INSERT/UPDATE/DELETE` por dueño.
- **GRANT:** `anon` no tiene acceso a **ninguna** tabla; `authenticated`, solo lo necesario (en `quote_shares`, sin la columna `token_hash`).
- **Coherencia de dueño:** claves foráneas compuestas `(owner_id, job_id)` y `(owner_id, quote_id)`: una cotización o un enlace no pueden colgar de datos de otro usuario.
- **Enlace público:** token aleatorio de **256 bits** (base64url, 43 caracteres), generado en el servidor y mostrado **una vez**; en la base solo queda su hash. Revocable, expiración opcional (la app usa 30 días; máximo 366).
- **Guardado atómico:** `create_job_with_quote` guarda trabajo y cotización en una transacción, con permisos del usuario (RLS aplica).
- **Funciones `SECURITY DEFINER` (avisos del asesor de Supabase, aceptados):** `get_public_quote` (debe poder llamarla un visitante sin sesión; solo devuelve campos de `client_quotes` con un token vigente), `create_quote_share` y `revoke_quote_share` (validan `auth.uid()` y el dueño). Todas con `search_path` vacío y `EXECUTE` revocado a `public`.
- **Navegador:** solo la clave **publicable**. La app se niega a arrancar con una clave `sb_secret_` (prueba automática). No existe ninguna clave secreta en el Worker ni en el repositorio.

## 4. Cloudflare (Worker + Durable Object)

- Configuración versionada: [`wrangler.jsonc`](../wrangler.jsonc). Variables públicas: `ROUTES_PROVIDER=simulado`, `ROUTES_ENABLED=true`, `STAGING_TEST_MARKERS=true`.
- Secretos (fuera del repositorio, cargados con `wrangler deploy --secrets-file`): `ADMIN_TOKEN`, `ORIGIN_HASH_SALT`, `STAGING_BASIC_AUTH`.
- **Staging privado:** todo el sitio (app, API y enlaces públicos) exige usuario y contraseña (`STAGING_BASIC_AUTH`). Encabezados `noindex`, `nosniff`, `DENY` de marcos y `no-referrer`.
- **Políticas sin cambios:** objetivo 7.000 y corte 8.000 al mes, ritmo diario, 3 comparaciones/día y 10/mes, 20 rutas/día por usuario, 40 por origen, reintento con nueva reserva, cierre ante falla del contador.
- **Ayudas de prueba solo para staging** (apagadas por defecto y nunca con Google): `STAGING_TEST_MARKERS` (el simulador falla si una dirección contiene `[prueba:falla]` o `[prueba:falla-lenta]`) y `STAGING_FAULT_COUNTER` (el Durable Object responde como caído; solo se activó durante la prueba §5.3-7 y se retiró).
- **Archivos de la app incrustados en el Worker:** el proxy del entorno de Claude reemplaza el encabezado `Authorization` de todas las solicitudes a la API de Cloudflare, y eso rompe la subida separada de *Static Assets* (que usa su propio token temporal). Por eso `npm run build:staging` incrusta `dist/` en el Worker (`src/server/embeddedAssets.ts`, `scripts/embed-assets.mjs`). Desde una máquina normal se puede volver a *Static Assets* sin cambiar la lógica.

### Hallazgo en Cloudflare real (no detectable con Vitest)

El Worker guardaba el *stub* del Durable Object entre solicitudes. En Workers, un objeto de E/S creado en una solicitud **no puede usarse desde otra**: el contador fallaba de forma intermitente (9 de 10 en un mismo isolate). El sistema **cerró correctamente** (modo manual, sin consultar al proveedor), pero sin servicio. Corrección: el contador se crea en cada solicitud y la deduplicación usa el *binding*, que es estable. Regresión en `tests/staging.worker.test.ts`; tras desplegar, 10 de 10.

## 5. Resultados de pruebas

### 5.1 Automáticas (sin red): `npm test`
*(Cifra del 18-11; hoy `npm test` da **625/625** en la rama, con código que staging aún no tiene.)* **225 pruebas en verde** al 18-11-2026 (incluye la validación independiente del motor, [15](15-validacion-motor.md), y las regresiones de experiencia de usuario, [14](14-qa-ux.md)). Historial: 140 tras la quinta auditoría, 154 con A-47.

### 5.2 RLS real con dos usuarios: `scripts/verificar-rls.mjs` → **39/39** (40/40 tras la corrección del 18-11, §5.4 bis)
Sesiones reales (JWT emitidos por Supabase) de los usuarios A y B y un visitante anónimo, con la clave publicable:
- B no puede **leer, modificar ni borrar** perfiles, vehículos, trabajos, cotizaciones ni enlaces de A, ni conociendo los ids.
- B no puede **insertar** a nombre de A, colgar una cotización de un trabajo de A, crear ni revocar enlaces de A, ni cambiar su predeterminado.
- El anónimo recibe `permission denied` en las 5 tablas; ni el dueño puede leer `token_hash`.
- El enlace público devuelve **exactamente** los 16 campos autorizados y ningún costo; un token inventado no devuelve nada; revocado deja de funcionar; no se aceptan expiraciones pasadas.
- A puede borrar lo suyo; la cotización y los enlaces se borran en cascada.

### 5.3 Cloudflare real: `scripts/verificar-cloudflare.mjs` → **8/8** y **2/2**
1. Una solicitud se calcula y reserva **exactamente 1**.
2. Falla reintentable: el reintento consume **otra reserva** (Δ = 2).
3. Servicio apagado (interruptor en caliente): rutas y comparaciones responden `servicio_apagado`, **Δ = 0**.
4. Apagado **durante** una consulta: el reintento queda bloqueado (Δ = 1, solo la reserva inicial).
5. Comparaciones: 3 al día; la cuarta se rechaza sin reservar.
6. **30 solicitudes simultáneas** del mismo usuario: **20 autorizadas, 10 rechazadas, 0 fallas del contador, Δ = 20**. Desde la quinta auditoría la prueba es **estricta**: calcula la cifra exacta esperada con el cupo real del origen (`originUsedToday` del estado administrativo) y, si el cupo del origen no alcanza, se declara no concluyente en vez de aprobarse.
7. Durable Object caído (falla inyectada en el objeto real): `contador_no_disponible`, sin ruta, el proveedor no se consulta.

### 5.4 bis. Redespliegue del 18-11-2026 y prueba sin cuenta: `scripts/e2e-staging-anonimo.mjs` → **59/59**

- **Redespliegue:** versión con las correcciones de experiencia de usuario (docs/14), A-50, A-51 y el aviso de texto inválido. Mismo Worker, plan gratuito, proveedor **simulado**; sin cambios en el Durable Object, en Supabase ni en las variables.
- **Rotación del acceso privado (`STAGING_BASIC_AUTH`)**, autorizada por el propietario:
  - usuario y contraseña nuevos, aleatorios (32 caracteres);
  - entregados al propietario como archivo adjunto privado, nunca en el chat, GitHub ni los registros;
  - la contraseña anterior dejó de funcionar;
  - `ADMIN_TOKEN` y `ORIGIN_HASH_SALT` no se tocaron.
  - Verificado: sin credenciales o con credenciales incorrectas → **401** (también `/api/route`); con las nuevas → **200**.
- **Prueba en navegador sin cuenta**, en PC 1440 y 1366 y en teléfono Pixel 7 e iPhone 13, **59/59**:
  - acceso privado;
  - ruta simulada, cotización, historial local y PDF sin costos internos;
  - pestañas visibles y sin desplazamiento horizontal;
  - aviso al escribir «-5000» en un campo;
  - margen «12,5»;
  - «Precio total» y leyenda en el documento, el PDF y WhatsApp;
  - controles táctiles de al menos 44 px;
  - 0 errores de página y 0 dominios externos.
- **Contraseñas de los usuarios de prueba restablecidas** (autorización del propietario, 18-11):
  - solo los **2 usuarios ficticios** (dominio `.invalid`, proveedor `email`), verificados antes por id y correo en el proyecto de staging;
  - se cambió únicamente su hash de contraseña: un hash bcrypt calculado localmente, sin que la contraseña saliera del contenedor;
  - contraseñas entregadas al propietario como archivo adjunto privado;
  - las nuevas inician sesión y una contraseña incorrecta se rechaza;
  - no se borró ninguna cuenta ni se tocaron otros servicios.
- **Pruebas completas con cuentas, sobre la versión del 18-11:**

  | Prueba | Resultado |
  |---|---|
  | `scripts/e2e-staging.mjs` (PC 1440 y teléfono Pixel 7) | **41/41**: anónimo, PDF sin costos, copia del historial local (1 copia, número emitido conservado), vehículo y cotización en la cuenta, enlace público, cerrar sesión, **B en el mismo navegador no ve nada de A**, volver a entrar, estado y pago persisten, **otro dispositivo**, enlace sin costos y revocable, 0 errores, 0 dominios externos |
  | `scripts/verificar-numeracion.mjs` (Supabase real) | **17/17**: 20 guardados simultáneos desde 2 dispositivos (únicos y correlativos), importación repetida y simultánea (1 copia, sin huecos), número ocupado → interno nuevo con el emitido intacto, números y documentos inalterables, contador inaccesible, **B con secuencia propia**, enlace con el número emitido |
  | `scripts/verificar-rls.mjs` (Supabase real) | **39/39**: B no lee, modifica, borra ni inserta datos de A; el anónimo no accede a ninguna tabla; el enlace devuelve solo los 16 campos autorizados y deja de funcionar al revocarlo |

- **Ajustes de los scripts (no de la app):**
  - `verificar-numeracion.mjs` exigía que los números empezaran en «máximo visible + 1». Eso deja de cumplirse cuando la propia prueba borró cotizaciones antes, porque los números borrados no se reutilizan (A-47). Ahora exige números **únicos, correlativos y posteriores al máximo**, y que B tenga una secuencia **propia y correlativa**. Con la condición antigua fallaban 1 de 17 verificaciones, y siempre por esa suposición.
  - `verificar-rls.mjs` ya **no sobrescribe** el perfil comercial existente de A. Su vehículo de prueba se llama «Vehículo RLS …», para no confundirse con el vehículo ficticio «Camioneta A».
  - **Revisión de ChatGPT de `8ee1de0`, corregida:**
    - `verificar-rls.mjs` guarda el vehículo predeterminado de A antes de la prueba y lo **restaura siempre** en un `finally`, también si la prueba se interrumpe, y verifica que quedó igual (nueva verificación: **40/40**).
    - En `verificar-numeracion.mjs`, la independencia de B ya no compara órdenes absolutos entre cuentas. Comprueba que los guardados de B no consumen números de A: A sigue correlativa antes y después.
    - Validado con una ejecución de cada script y huellas md5 de **todas** las tablas antes y después, incluido el vehículo predeterminado: **idénticas**. Solo avanzan los contadores de numeración.
- **Datos existentes intactos**, verificado con huellas md5 antes y después: el perfil de A, los 13 vehículos (incluida «Camioneta A»), los 23 trabajos, sus cotizaciones y los 11 enlaces previos son idénticos.
- **Datos que sí cambiaron:**
  - el e2e agregó datos ficticios nuevos: 2 vehículos y 4 cotizaciones con sello de tiempo;
  - los scripts borraron sus propias cotizaciones de prueba;
  - los contadores de numeración de A y B avanzaron, porque los números borrados no se reutilizan.

### 5.4 Flujo completo en navegador: `scripts/e2e-staging.mjs` → **39/39** (móvil Pixel 7 y escritorio 1440)
*(Primera corrida; tras la quinta auditoría y en la repetición del 18-11 dio **41/41**, §5.4 bis.)*
Desde la quinta auditoría incluye: al cerrar sesión no queda a la vista el vehículo de la cuenta y el borrador de la cotización queda vacío; otra cuenta en el **mismo navegador** no ve vehículos ni cotizaciones de la anterior.

Anónimo (ruta simulada → costos → precio → cotización → historial local → impresión sin costos internos); copia del historial local a la cuenta (1 copia, sin duplicados); vehículo y cotización en la cuenta; enlace público; cerrar sesión (no quedan datos de la cuenta a la vista); volver a entrar (se recuperan); estado y pago persisten tras recargar; **otro dispositivo** recupera vehículo y cotización; **usuario B no ve nada de A**; enlace público sin costos y revocable; sin errores de página; **0 solicitudes a dominios externos**.

## 6. Cómo verificar el entorno de pruebas

**Sin comandos (propietario):**
1. Abrir la URL del Worker de staging (§1) e ingresar el usuario y la contraseña de staging que Claude entregó por chat.
2. Calcular una ruta (simulada), escribir un precio y crear una cotización: queda en «Mis trabajos» con el aviso «solo en este navegador».
3. En «Ingresar», usar un usuario de prueba (entregados por chat): aparece «Copiar a mi cuenta»; copiar y revisar «Mis trabajos».
4. Abrir la cotización → «Crear enlace» → abrir el enlace en una ventana privada: se ve solo la cotización. «Desactivar» y recargar: «Enlace no disponible».
5. Cerrar sesión y volver a entrar desde otro navegador o el teléfono: los datos de la cuenta siguen ahí.

**Con comandos (agentes):** ver la cabecera de cada script en `scripts/` (credenciales siempre desde archivos fuera del repositorio).

## 7. Pasos manuales del propietario

> **Actualización 18-11-2026:** auditoría de solo lectura, lista de ajustes de Auth con su ruta en el panel, checklist completo de Google OAuth y orden recomendado en [17 · Supabase: seguridad y respaldo](17-supabase-seguridad-respaldo.md) §3, §7 y §8. Verificado: la protección de contraseñas filtradas **solo existe en el plan Pro** (punto 3).

1. **Google OAuth** (para «Continuar con Google»): en un proyecto de Google Cloud **del propietario**, crear un cliente OAuth «Aplicación web» con la URI de redirección `https://<ref>.supabase.co/auth/v1/callback`; en Supabase → Authentication → Providers → Google, pegar el ID y el secreto del cliente. En Authentication → URL Configuration, agregar la URL del Worker de staging a *Redirect URLs*. Alcances: `openid`, `email`, `profile`. No requiere facturación de Google Cloud, pero es una cuenta y una credencial nuevas: decisión del propietario.
2. **Cerrar el registro abierto de staging:** hoy Supabase permite registrarse por correo (con confirmación). Recomendado: desactivar el registro de nuevos usuarios por correo en Authentication mientras sea staging.
3. **Protección de contraseñas filtradas** (aviso del asesor): **requiere plan Pro** según la documentación oficial. En el plan gratuito: registro cerrado y contraseñas largas (mínimo 12) para los usuarios de prueba (docs/17 §3).
4. **MFA** en las cuentas de Supabase y Cloudflare del propietario.
5. **Rotar o revocar** el token de Cloudflare entregado a Claude cuando termine la revisión (§9).
6. Antes de cualquier lanzamiento: decidir plan de Supabase (el gratuito **se pausa** tras ~1 semana de baja actividad y **no tiene respaldos automáticos**), dominio y aviso de privacidad (#17).

## 8. Servicios que siguen apagados

- **Google Routes:** desconectado; ninguna clave de Google existe en el Worker. Pro y Enterprise bloqueados por código.
- **Producción pública:** no existe. Staging es privado (usuario y contraseña) y `noindex`.
- **Facturación y planes de pago:** no se activaron. Ambos servicios en plan gratuito.
- **Google OAuth:** no configurado (falta el cliente del propietario).

## 9. Detener servicios ante errores (interruptores)

| Nivel | Acción | Efecto |
|---|---|---|
| 1 | `POST /api/admin/routes {"enabled": false}` con `ADMIN_TOKEN` | Detiene **reservas nuevas y reintentos** al instante (probado). No cancela una llamada ya en curso |
| 2 | `ROUTES_ENABLED=false` (variable del Worker) | Apaga `/api/route` en la siguiente solicitud |
| 3 | Desactivar la ruta `workers.dev` o borrar el Worker en el panel de Cloudflare | Sitio fuera de línea |
| 4 | Pausar el proyecto de Supabase en su panel | Sin cuentas ni nube; la calculadora local sigue funcionando |

**Revocar credenciales:** token de Cloudflare (panel → My Profile → API Tokens → Roll/Delete); `ADMIN_TOKEN`, `STAGING_BASIC_AUTH`, `ORIGIN_HASH_SALT` (`wrangler secret put <NOMBRE>`); clave publicable de Supabase (Settings → API Keys: crear otra y desactivar la actual); usuarios de prueba (Authentication → Users → borrar `prueba-a` y `prueba-b`, dominio `.invalid`); enlaces públicos (desde la app, «Desactivar»).

## 10. Respaldo y restauración (Supabase gratuito)

El plan gratuito **no tiene respaldos descargables**. El procedimiento completo está en [17 · Supabase: seguridad y respaldo](17-supabase-seguridad-respaldo.md) §5 y §6:

- **Respaldo:** `scripts/respaldo-supabase.sh` (modo `cli` con la CLI de Supabase y Docker, o `pgdump` con cliente PostgreSQL **17**), cifrado con `age`, siempre **fuera** del repositorio. **PREPARADO**: el primer respaldo real lo ejecuta el propietario, porque requiere la contraseña de la base.
- **Restauración recomendada (ruta B):** esquema desde las **migraciones del repositorio** y solo los **datos** del respaldo. La ruta oficial completa (`roles.sql` + `schema.sql` + `data.sql`) **amplía los privilegios** en un proyecto nuevo (hallazgo H2 de docs/17), así que no se usa sin pasar después la verificación.
- **Verificación:** `scripts/verificar-restauracion.sql` en origen y destino, con `diff` igual a cero (conteos, huellas, numeración e invariantes de privilegios), y luego `scripts/verificar-rls.mjs`.
- **Ensayado localmente el 18-11-2026** (Postgres 16 con un *stub* de Supabase y datos ficticios): ruta B **idéntica** al origen. No se tocó Supabase.
- **Migraciones:** los archivos del repositorio se renombraron a las versiones aplicadas en staging (`20261118000315`, `…000924`, `…022422`); el contenido ya era idéntico (md5). Así un `supabase db push` futuro no intenta reaplicarlas.
- Lo que **no** viaja en el respaldo: configuración de Auth (proveedores, URLs), claves de API y claves JWT.

## 10 bis. Aislamiento entre sesiones en el navegador (quinta auditoría)

- **Vehículos:** `src/web/vehicleList.ts` liga la lista a una identidad. Al entrar, salir o cambiar de cuenta la lista se vacía al instante, las cargas iniciadas por la identidad anterior se descartan aunque lleguen tarde, y una carga fallida deja la lista vacía.
- **Borrador de la cotización:** se reinicia al cerrar sesión o al cambiar de una cuenta a otra; se conserva al pasar de anónimo a una cuenta (es quien estaba cotizando).
- **Copia del historial local:** usa un cliente **fijado al token** de la cuenta que la inició (`createBoundClient`), así nada puede quedar a nombre de otra cuenta aunque la sesión cambie; además comprueba la identidad antes de cada paso y no se marca como completa si la sesión cambió.
- **Precio:** la confirmación se exige también en el último paso de guardado (`buildJobRecord`).
- **Guardado de una cotización (sexta auditoría):** `saveQuote` usa `QuoteRepository.forWrite()`. En la nube es un repositorio **fijado al token** de la sesión vigente al empezar, que antes de cada escritura comprueba que la app siga con esa cuenta; si cambió, no escribe nada más (nunca en la otra cuenta). La app ignora un guardado que termina cuando la cuenta ya es otra.
- **Render (sexta auditoría):** la lista de vehículos, el borrador y la vista de una cotización se filtran por dueño **en el propio render**, así otra identidad no ve datos ajenos ni por un cuadro mientras corre el efecto que los limpia.

## 10 ter. Numeración de cotizaciones (A-47, aprobada)

Migración [`20261118022422_numeracion_atomica.sql`](../supabase/migrations/20261118022422_numeracion_atomica.sql), aplicada en staging el 18-11-2026.

- **Número interno** (`jobs.number`): único por cuenta (`unique (owner_id, number)`). Lo asigna la base dentro de `create_job_with_quote`, con un contador por cuenta (`quote_counters`) bloqueado con `FOR UPDATE` en la misma transacción que guarda la cotización. La función que asigna vive en un esquema `private`, no expuesto por la API; el contador no se puede leer ni escribir por REST.
- **Número emitido** (`jobs.issued_number`): el que figura en el documento del cliente (`client_quotes.number`). En cotizaciones nuevas es igual al interno.
- **Importación del historial local:** se conserva el `local_id`, así que repetirla no duplica nada, ni siquiera de forma simultánea, y tampoco gasta números. Si el número local está **libre**, se conserva. Si está **ocupado**, se asigna un número interno nuevo y el documento conserva el emitido; el historial muestra «N° interno (emitida como N° X)».
- **Documentos inalterables:** el dueño solo puede cambiar estado y pago; `client_quotes` no admite `UPDATE`.
- **Datos existentes:** la migración no borró nada ni cambió ningún documento emitido. Los 9 trabajos de prueba con número repetido recibieron un número interno nuevo y conservan su número emitido.
- **Verificación real** (`scripts/verificar-numeracion.mjs`): **17/17**.
  - 20 guardados simultáneos desde 2 dispositivos → números únicos y correlativos.
  - Importación repetida al mismo tiempo → 1 copia, sin huecos.
  - Número ocupado → interno nuevo y documento con el emitido, también en el enlace público.
  - Cambios del número prohibidos; secuencias independientes por cuenta.
- **En navegador** (`scripts/e2e-staging.mjs`): **41/41**. Una cotización anónima N° 1 copiada a la cuenta queda como «N° 0094 (emitida como N° 0001)».
- **Sin cuenta:** la numeración local sigue siendo «máximo + 1» en el navegador; no protege ante dos pestañas simultáneas (A-47 rige para las cuentas).

## 11. Limitaciones conocidas

- **Números de cotización:** resuelto en la cuenta con A-47 (§10 ter). Sin cuenta, la numeración local no protege ante dos pestañas simultáneas.
- **Origen de red:** el egreso del proxy de pruebas usa varias IP, así que el límite por origen (40/día) se reparte entre ellas; el límite por usuario y el techo global sí se verificaron con cifras exactas.
- **Deduplicación del doble clic** en Cloudflare: por isolate; dos clics simultáneos atendidos por isolates distintos reservan dos veces (el límite y el contador siguen correctos).
- **Datos de prueba** en staging: usuarios `prueba-a`/`prueba-b` con cotizaciones y vehículos ficticios creados por las pruebas.
- **Archivos incrustados** en el Worker (ver §4).
- Supabase gratuito puede **pausarse** por inactividad.
