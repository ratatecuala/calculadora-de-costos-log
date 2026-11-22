# 23 · #52: escritura directa en `jobs`, documentos emitidos y contador de cotizaciones

**Versión 4 · 22-11-2026 · Estado: DISEÑO APROBADO (A-72) · MIGRACIÓN IMPLEMENTADA EN EL REPOSITORIO Y ENSAYADA SOLO EN LOCAL (A-74) · NO APLICADA EN SUPABASE NI EN STAGING.**

**Decisiones de diseño aprobadas el 22-11** ([registro en #43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7071778285), docs/07 A-72):
- **D-52-1:** la función de guardado como única puerta de escritura;
- **D-52-2:** variante B+;
- **D-52-4 v2:** opción N1 del contador, incluido el cambio de numeración (§4.3).

D-52-3 queda reservado para M4, D-52-5 es provisional y D-52-4b solo se resolverá si aparecen contadores inflados, nunca con reparación automática.

**Implementación local (A-74, [registro en #43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7072135863)):** la migración existe en `supabase/migrations/20261122120000_guardado_unico_y_contador.sql` y está ensayada **solo** en PostgreSQL local desechable (§11).

**Lo que sigue sin autorización:**
- aplicar la migración en Supabase o en staging, por cualquier vía (`supabase db push` incluido): exige la auditoría del código, el respaldo real (A-52), las verificaciones de solo lectura y la autorización individual A-59;
- ejecutar cualquier cosa en Supabase, incluidas las verificaciones de solo lectura de §8;
- despliegues y merge del PR #34.

Herramientas, todas solo para PostgreSQL local:
- `scripts/diseno/ensayo-52/` (ensayo de la migración real, reversión y restauración);
- `scripts/diseno/verificaciones-52/` (consultas de solo lectura, preparadas, en dos versiones: psql y editor de Supabase).

**Historial del documento:**

| Versión | Fecha | Autorización | Contenido |
|---|---|---|---|
| 1 | 21-11 | A-69 ([registro](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7071050495)) | Huecos H1–H3, propuesta A y B+, ensayo 31/31 |
| 2 | 22-11 | A-70 ([registro](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7071441529)) | H4 (desbordamiento del contador), rediseño N1, ensayo 42/42 |
| 3 | 22-11 | A-72 ([registro](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7071778285)) | Diseño aprobado. Incorpora las 5 condiciones de la [reauditoría](https://github.com/ratatecuala/calculadora-de-costos-log/issues/52#issuecomment-7071695410), los riesgos de `SECURITY DEFINER`, el plan por autorizaciones, los escenarios X1–X8, las verificaciones de solo lectura y el ensayo 52/52 |
| 4 | 22-11 | A-74 ([registro](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7072135863)) | **Migración real** en el repositorio, ensayo sobre ella (**65 OK**), reversión ensayada, scripts de staging adaptados (sin ejecutar), verificaciones en versión para el editor de Supabase (corrige el P2 de la [auditoría](https://github.com/ratatecuala/calculadora-de-costos-log/issues/52#issuecomment-7072118724)) y prueba estática en `npm test` (§11) |

**Base:**
- [#52](https://github.com/ratatecuala/calculadora-de-costos-log/issues/52);
- A-47 (numeración atómica y documentos inalterables), A-52 (respaldo propio) y A-59 (cada migración en staging requiere autorización individual y un respaldo real);
- [docs/21 §8](21-diseno-datos-cotizador.md) (borradores M3/M4);
- migraciones actuales: `20261118000315_esquema_inicial.sql`, `20261118000924_guardar_cotizacion_atomica.sql` y `20261118022422_numeracion_atomica.sql`.

## 1. Resumen

| | |
|---|---|
| **Problema** | `authenticated` puede escribir directamente en `jobs` y `client_quotes` por la Data API, **sin pasar** por `create_job_with_quote` ni por la numeración atómica (H1–H3). Además, la propia función, al importar un número emitido muy alto, **bloquea** las cotizaciones siguientes de la cuenta (H4) |
| **Alcance** | Solo los datos de la propia cuenta: RLS por dueño; ninguna cuenta ve ni toca las de otra |
| **Gravedad** | **Media-alta para A-47:** un documento emitido se puede reemplazar (H3) y una cuenta puede quedar sin poder cotizar (H4) |
| **Diseño aprobado** | **D-52-1:** la función de guardado como `SECURITY DEFINER`; sin `INSERT` en `jobs` ni `INSERT`/`DELETE` en `client_quotes`; sin las políticas sobrantes. **D-52-2:** `authenticated` sin acceso al esquema `private`. **N1:** el contador avanza solo con los números que asigna él mismo |
| **Impacto en la app** | **Ninguno.** La app ya escribe solo mediante `create_job_with_quote` y solo actualiza `status` y `payment` |
| **Cambio visible** | Con N1, importar un número alto ya no hace saltar la secuencia (ejemplo aprobado en §4.3) |
| **Ensayo local (v3)** | Huecos H1–H4 reproducidos. Con el diseño: **52/52** (también con B+). Controles negativos y mutaciones, detectados (§7) |
| **Lo que N1 no hace** | No rebaja contadores ya inflados: una cuenta que ya está en el máximo **no se desbloquea sola** (X1). Requiere D-52-4b, caso a caso |

## 2. Estado actual: qué permite hoy la base

| Objeto | Permisos de `authenticated` hoy | Política RLS | ¿Lo usa la app? |
|---|---|---|---|
| `public.jobs` | `SELECT`, `INSERT`, `DELETE`, `UPDATE (status, payment)` | `jobs_insert`, `jobs_select`, `jobs_update`, `jobs_delete` (dueño) | Lectura; `UPDATE` de estado y pago; escritura **solo** mediante la función RPC |
| `public.client_quotes` | `SELECT`, `INSERT`, `DELETE` (el `UPDATE` se revocó en la numeración) | `insert`, `select`, `update`, `delete` (dueño) | Solo lectura. La escritura va dentro de la función RPC; el borrado, en cascada al borrar el trabajo |
| `public.quote_counters` | Ninguno | RLS sin políticas | No: solo `private.allocate_quote_number` |
| `public.create_job_with_quote` | `EXECUTE` | — | **Sí** (`quotes.ts` y `migration.ts`) |
| `private.allocate_quote_number` | `USAGE` del esquema y `EXECUTE` | — | Indirectamente: la v1 es `SECURITY INVOKER` y la necesita |

**Por qué existe el hueco:** la v1 es `SECURITY INVOKER`. Corre con los permisos del usuario, así que el usuario necesita `INSERT` sobre las dos tablas, y ese permiso también le sirve para escribir **fuera** de la función.

**Código de la app** (`grep` en `src/web/cloud/*.ts`):
- ningún `insert` ni `delete` sobre `jobs` o `client_quotes`;
- solo `rpc('create_job_with_quote')`, `update(status, payment)` y lecturas.

**Scripts de staging:**
- `scripts/verificar-rls.mjs` **sí** usa `INSERT` directo para preparar sus datos: habrá que adaptarlo (§9);
- `verificar-numeracion.mjs` y `e2e-staging.mjs` usan la función y la app.

## 3. Huecos confirmados en el ensayo local

Con las 3 migraciones reales y el stub de Supabase, como `authenticated`:

| ID | Qué se hizo | Resultado | Por qué rompe A-47 |
|---|---|---|---|
| **H1** | `INSERT` directo con N° 5000 **antes** del primer guardado de la cuenta | Aceptado; el primer guardado recibe el **N° 5001**, no el 1 | El contador se crea desde el máximo existente: la secuencia queda bajo control del cliente |
| **H2** | `INSERT` directo de un trabajo con el mismo número emitido que otro documento | Aceptado: trabajo **sin cotización** y número emitido repetido | «Cada trabajo nace con su documento» deja de ser cierto |
| **H3** (v1, nuevo) | `DELETE` de la cotización de un trabajo emitido + `INSERT` de otra con N° 999, otro cliente y $1 | **Aceptado**: el documento emitido queda **reemplazado** | Rompe la inmutabilidad. Revocar `UPDATE` no basta si se permiten `DELETE` e `INSERT` |
| **H4** (v2, revisión de ChatGPT) | Por la **función**, sin acceso directo: importar con un `local_id` nuevo y el emitido libre 2.147.483.647 | Aceptado: el contador sube al máximo y la **siguiente cotización falla** (`integer out of range`). Borrar el trabajo no baja el contador | La cuenta queda **sin poder cotizar**. Existe hoy, y D-52-1 por sí sola no lo corrige |

Ninguno cruza cuentas (verificado también en S5).

**Lo que solo permite el acceso directo:**
- crear trabajos sin documento y sin pasar por el contador;
- reemplazar documentos emitidos (H3).

**Lo que es posible por diseño con la ruta de importación (A-47):** un número emitido ocupado se repite en el documento importado, con un interno nuevo (R1).

## 4. Diseño aprobado (A-72)

### 4.1 D-52-1: la función de guardado como única puerta de escritura

```sql
-- #52 (diseño aprobado, NO ejecutado): crear trabajos y documentos solo mediante el guardado.
alter function public.create_job_with_quote(jsonb, jsonb) security definer;   -- mismo cuerpo y firma
revoke insert on table public.jobs from authenticated;
revoke insert, delete on table public.client_quotes from authenticated;
drop policy if exists jobs_insert on public.jobs;
drop policy if exists client_quotes_insert on public.client_quotes;
drop policy if exists client_quotes_update on public.client_quotes;  -- sin GRANT UPDATE desde la numeración
drop policy if exists client_quotes_delete on public.client_quotes;
-- Privilegios explícitos tras cualquier cambio de función (ver §5, privilegios por defecto):
revoke all on function public.create_job_with_quote(jsonb, jsonb) from public, anon, service_role;
grant execute on function public.create_job_with_quote(jsonb, jsonb) to authenticated;
```

**Se conserva:**
- `SELECT` en ambas tablas;
- `UPDATE (status, payment)` en `jobs`;
- `DELETE` del trabajo **completo** (D-52-5, provisional). La cascada borra el documento y los enlaces; S7 confirma que funciona aunque `DELETE` en `client_quotes` esté revocado.

### 4.2 D-52-2: variante B+

```sql
revoke execute on function private.allocate_quote_number(integer) from authenticated;
revoke usage on schema private from authenticated;
```

Con la v1 DEFINER, `authenticated` ya no necesita el esquema `private`. Aunque se expusiera por error en la Data API, no podría ejecutar nada de allí.

### 4.3 D-52-4 v2: contador N1 (aprobado, con el cambio de numeración)

**Regla:** el contador avanza **solo** con los números que asigna él mismo.

| Caso | Comportamiento |
|---|---|
| Importación con número emitido **libre** | Se conserva como interno y emitido, igual que hoy, **sin mover** el contador |
| Cotización nueva, o importación con número **ocupado** | Contador + 1, **saltando** los números ya usados como interno **o como emitido** |
| Agotamiento del rango | Aritmética en `bigint`. Agotar el rango exigiría 2.147.483.647 asignaciones de la misma cuenta, y aun así da un error claro (22003) sin escribir nada |
| Contador nuevo | Empieza en 0: tras D-52-1 todo trabajo nace en la función, que crea el contador antes del primer trabajo. El bucle salta lo ocupado |
| Números borrados | El contador nunca baja: no se reutilizan en guardados nuevos |

**Ejemplo aprobado (A-72):** el contador está en 12 y se importa la cotización N° 5000.
- La siguiente cotización nueva es la **N° 13**, no la 5001.
- El documento importado conserva su N° 5000.
- Las nuevas siguen 13, 14… y saltan la 5000 cuando llegan a ella.

**Comprobación afectada:** `verificar-numeracion.mjs` §5 hoy espera `free + 1`. Pasará a esperar «la siguiente usa el contador y nunca repite un número interno ni emitido» (§9).

Implementado en la migración `supabase/migrations/20261122120000_guardado_unico_y_contador.sql` (bloque `[N1]`). El archivo de diseño `contador-52.sql` se retiró en la v4 para no tener dos fuentes de verdad.

```sql
create or replace function private.allocate_quote_number(p_preferred integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_last integer; v_next bigint;
begin
  if v_uid is null then raise exception 'Se requiere iniciar sesión' using errcode = '42501'; end if;
  insert into public.quote_counters (owner_id, last_number) values (v_uid, 0) on conflict (owner_id) do nothing;
  select last_number into v_last from public.quote_counters where owner_id = v_uid for update;
  if p_preferred is not null and p_preferred > 0
     and not exists (select 1 from public.jobs where owner_id = v_uid and number = p_preferred) then
    return p_preferred;                       -- importación: se conserva SIN mover el contador
  end if;
  v_next := v_last::bigint + 1;               -- bigint: nunca desborda en silencio
  while v_next <= 2147483647 and exists (select 1 from public.jobs
        where owner_id = v_uid and (number = v_next or issued_number = v_next)) loop
    v_next := v_next + 1;                     -- nunca repite un número que el cliente ya vio
  end loop;
  if v_next > 2147483647 then
    raise exception 'Se agotó la numeración de cotizaciones de esta cuenta' using errcode = '22003';
  end if;
  update public.quote_counters set last_number = v_next::integer where owner_id = v_uid;
  return v_next::integer;
end $$;
revoke all on function private.allocate_quote_number(integer) from public, anon, service_role;
create index if not exists jobs_owner_issued_idx on public.jobs (owner_id, issued_number);
```

### 4.4 Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Mantener INVOKER y agregar un *trigger* con marca de transacción | Más piezas; depende del mismo supuesto que la capa 2 de M3; no cubre `DELETE` + `INSERT` en `client_quotes` |
| Mover las tablas a un esquema no expuesto | Refactorización grande sin beneficio adicional |
| Solo documentar el riesgo | H3 y H4 rompen A-47 |
| Contador N2 (salto con tope) | Exige un **límite comercial** elegido en silencio |
| Contador N3 (separar siempre interno y emitido) | Cambia también las importaciones con número libre y obliga a más cambios en la app |
| Contador N4 (`bigint` en las columnas) | Solo traslada el problema; no evita el salto |

### 4.5 Relación con M3 y M4 (D-52-3, reservado para M4)

1. **Orden:** #52 va **antes** que M3/M4 (puerta P3). Los borradores se ensayaron **encima** del diseño y siguen en verde (§7).
2. **T6c del borrador M3:** su precondición era el `INSERT` directo. Con #52 se reescribe en dos pruebas, ya incorporadas en `scripts/diseno/pruebas-borradores.sql` (v4):
   - **T6c-1:** el `INSERT` directo se rechaza;
   - **T6c-2:** la capa «marca de transacción» sigue funcionando.
3. **Comentario de M4:** dice «RLS de la v1», pero con DEFINER la RLS **no** se aplica dentro de la v1. El aislamiento depende de los filtros explícitos por dueño (S5). Se actualizará al aprobar M4.
4. **D-52-3, criterio futuro:** al diseñar M4, la v2 como DEFINER y sin `EXECUTE` de `authenticated` sobre `private.insert_cargo_items`. Ensayado con B+ (52/52).
   - **Hallazgo de la v4:** con D-52-2 dentro de la migración real, el borrador M4 tal como está (v2 INVOKER) **ya no funciona**: `authenticated` no tiene `USAGE` en `private` (control C5: T1 falla con «permission denied for schema private»). Por lo tanto, **D-52-3 deja de ser opcional para M4**: cuando se apruebe M4, la v2 deberá ser DEFINER (o habrá que conceder un permiso explícito, que no se recomienda). Los ensayos lo simulan sobre el borrador, sin modificarlo.
   - **Salvedad resuelta en la v4:** T6, T6b y T6c-2 se ejecutan con un rol de prueba local (`prueba_capas`) que sí tiene `EXECUTE`, y exigen que el rechazo venga de la capa de M3 y no de los permisos. La capa de permisos se prueba aparte en T6d.
5. **Al aprobar M4:** decidir si la v1 debe rechazar un `internal` que declare líneas, para que «v2 con líneas» pase siempre por M4.

## 5. Riesgos de `SECURITY DEFINER`, privilegios, RLS e identidad

| # | Riesgo | Mitigación en el diseño | Prueba local | Verificación en Supabase (§8) |
|---|---|---|---|---|
| 1 | **Dueño de la función y de las tablas.** Una función DEFINER corre como su dueño. Si es dueño de las tablas (o tiene `BYPASSRLS`), la RLS **no** se aplica dentro de la función | El aislamiento no depende de la RLS dentro de la función: la identidad sale **solo** de `auth.uid()`, `owner_id` se fija a esa identidad en ambos `INSERT`, y las búsquedas de idempotencia y de números filtran por dueño | S5, S5b, L10 | V1 (dueño, RLS forzada), V2 (dueño de la función), V3 (`BYPASSRLS`). **Por validar:** en Supabase las tablas suelen pertenecer a `postgres`. Si la RLS estuviera **forzada**, la función no podría insertar sin la política `jobs_insert` y el guardado fallaría: V1 debe mostrar `rls_forzada = f` |
| 2 | **`search_path` y `pg_temp`.** Un usuario podría crear en su sesión una tabla temporal `jobs` o una función temporal para sombrear objetos | `set search_path = ''` y **todas** las referencias calificadas (`public.`, `private.`, `auth.`). Las funciones **nunca** se buscan en `pg_temp` | **X4:** tabla temporal `jobs` y `pg_temp.gen_random_uuid()` sin efecto; el guardado escribe en `public.jobs` con un id aleatorio | V2 (`proconfig = search_path=""`) |
| 3 | **Referencias sin calificar** (`gen_random_uuid()`) | Está en `pg_catalog`, que se busca siempre y primero para funciones; no se puede sombrear desde `pg_temp` | X4 | — |
| 4 | **Identidad.** `auth.uid()` lee el *claim* `sub` de la configuración de la transacción. ¿Puede el cliente fijarlo con `set_config`? | PostgREST fija los *claims* desde el JWT **verificado** en cada transacción, y solo expone tablas y funciones de los esquemas configurados (`public`). `set_config` está en `pg_catalog`, no expuesto, y ninguna función pública lo llama con datos del usuario. **Regla:** no crear nunca una función pública que llame a `set_config` con entradas del cliente | S6 (sin sesión → 42501) | V8 (esquemas expuestos). Probar con cuentas reales (`verificar-rls.mjs`) |
| 5 | **Privilegios por defecto.** En Supabase, `ALTER DEFAULT PRIVILEGES` suele dar `EXECUTE` a `anon`, `authenticated` y `service_role` sobre funciones **nuevas** de `public`. PostgreSQL da además `EXECUTE` a `PUBLIC` por omisión | Toda función creada o reemplazada en la migración termina con `revoke all … from public, anon, service_role` y un `grant execute … to authenticated` explícito | **X3a:** con privilegios por defecto simulados, una función nueva queda ejecutable por `anon`. **X3b:** el `revoke` explícito la cierra | V5 (EXECUTE por rol) y V6 (privilegios por defecto) |
| 6 | **`CREATE OR REPLACE` conserva privilegios**, y `ALTER FUNCTION … SECURITY DEFINER` no los cambia | Se cuenta con ello y, aun así, se revoca y concede explícitamente (riesgo 5) | **X3c:** tras `CREATE OR REPLACE`, `anon` sigue sin `EXECUTE` y `authenticated` lo mantiene | V5 después de migrar |
| 7 | **Exposición del esquema `private`** | No exponerlo. Con B+, `authenticated` no tiene `USAGE` ni `EXECUTE` allí | S0b, B+ (52/52) | V5 (`usage_private`), V8 |
| 8 | **`service_role`** (`BYPASSRLS`, solo del lado del servidor) | Sin `EXECUTE` sobre la función de guardado. Sin `auth.uid()` el guardado se niega. Su clave nunca viaja al navegador | **X5:** sin `EXECUTE` en el stub | V4 y V5. En Supabase puede tener privilegios por defecto sobre tablas: es el rol administrativo y se documenta |
| 9 | **Sobrecargas de función.** Una segunda firma con otro comportamiento | `authenticated` no puede crear objetos en `public`. La migración no deja firmas viejas: verificar que haya una sola por nombre | **X4b:** crear una sobrecarga → 42501 | V2 (lista firmas) |
| 10 | **Mensajes de error que filtren datos.** Un DEFINER puede leer filas ajenas | El único choque posible con datos ajenos es la clave primaria del `id` propuesto. El mensaje solo repite el `id` que envió el propio usuario. UUID v4: adivinar uno ajeno es inviable (R3) | **X6:** mensaje y detalle sin dueño ni contenido ajeno | — |
| 11 | **Disparadores que correrían como el dueño** dentro del DEFINER | Solo existe `set_updated_at()`, con `search_path` vacío y únicamente en `UPDATE`; ninguno en `INSERT` | **X7** | V9 |
| 12 | **Bloqueo y tiempo del bucle** con el contador bloqueado (`FOR UPDATE`) | El bloqueo es por cuenta. El bucle recorre cada bloque ocupado **una vez** con índices (`jobs_owner_number_unique` y `jobs_owner_issued_idx`) | **X2:** 10.000 importados contiguos → la primera cotización nueva tardó 64–117 ms en local (cinco corridas); la siguiente, 0,6–1,1 ms | Medir en staging (§9, paso 5) |

## 6. Condiciones de la reauditoría y riesgos residuales

### 6.1 Las 5 condiciones ([reauditoría de docs/23 v2](https://github.com/ratatecuala/calculadora-de-costos-log/issues/52#issuecomment-7071695410))

| # | Condición | Cómo queda en el diseño |
|---|---|---|
| 1 | **Contadores ya inflados:** N1 no rebaja `last_number`, y una cuenta ya en el máximo de INT4 **no se desbloquea sola** | **Confirmado en local (X1):** con el contador en 2.147.483.647, la siguiente cotización sigue fallando con 22003, sin escribir nada. Antes de migrar se ejecutan las verificaciones de solo lectura V10–V13. Si aparece un caso, se documentan el número real, el historial y la causa, y se resuelve **por cuenta** con D-52-4b, con tu autorización. **Nunca** con un arreglo automático ni reutilizando números borrados. X1b muestra, solo como ilustración, que bajar el contador lo desbloquea |
| 2 | **Semántica pública:** N1 garantiza internos únicos y que un número **nuevo** no repita un emitido **aún almacenado** | **No** promete unicidad absoluta: un documento importado puede repetir un emitido (A-47, R1), y un número de una cotización **borrada** puede reaparecer por importación (R2). V16 mide los repetidos (por importación o, si existieran, entre cotizaciones nuevas) |
| 3 | **Seguridad del DEFINER verificada en Supabase real** | §5 (12 riesgos con mitigación y prueba local) y verificaciones V1–V9. El ensayo con stub **no** sustituye a staging |
| 4 | **Regresiones obligatorias** | Plan de §9: `verificar-numeracion.mjs` §5 adaptado (17/17), `verificar-rls.mjs` adaptado (40/40 o la suite actualizada), T6c reescrita, idempotencia, aislamiento A/B, importaciones simultáneas, borrado y cascada, límites de INT4, e2e reales y medición del bucle de saltos con números importados contiguos |
| 5 | **Secuencia de autorizaciones** | §9: diseño aprobado (A-72, hecho) → implementación local (autorización aparte) → auditoría de código → respaldo real → verificaciones de solo lectura → aprobación A-59 → staging |

### 6.2 Riesgos residuales

| ID | Riesgo | Estado |
|---|---|---|
| R1 | La importación acepta un número emitido elegido por el cliente. Con N1 ya **no** mueve el contador (sin salto ni desbordamiento). Si el número está ocupado, el documento repite el emitido con un interno nuevo | Por diseño (A-47), visible en V16. Verificar en el servidor el historial local no es posible |
| R2 | `DELETE` del trabajo completo: el dueño puede borrar una cotización emitida, y su número podría reaparecer en una importación | **D-52-5 provisional, solo staging.** Antes de un lanzamiento público hace falta una política de anulación o auditoría |
| R3 | El `id` del trabajo lo propone el cliente | Despreciable (UUID v4). X6: el error no expone datos ajenos |
| R4 | El panel de Supabase puede advertir sobre funciones DEFINER ejecutables por `authenticated` | Esperado e intencional; se documenta en la verificación posterior |
| R5 | El dueño de la función debe ser el dueño de las tablas | **Por validar** con V1–V3 antes de migrar |
| R6 | Cuentas ya bloqueadas por H4 antes de migrar | N1 no las desbloquea (X1). Se detectan con V10 y se resuelven con D-52-4b |

## 7. Ensayo local del DISEÑO (v3, con fragmentos de diseño; cifras históricas). La v4 ensaya la migración real: §11

**Herramienta:** `scripts/diseno/ensayo-52/ensayar.sh`.
- Solo acepta PostgreSQL local (socket o `localhost`).
- Crea una base desechable y la borra con `trap`, también si algo falla.
- No es una migración.

```bash
PGHOST=/ruta/al/socket PGPORT=55433 PGUSER=medir scripts/diseno/ensayo-52/ensayar.sh
```

PostgreSQL 16.15, stub de Supabase y las 3 migraciones reales.

| Bloque | Pruebas | Resultado (v3) |
|---|---|---|
| Fase 1: huecos con las migraciones actuales | H1, H2, H3, H4 | **4 reproducidos** |
| D-52-1 (+ B+ con `BMAS=1`) | S0, S0b, S1, S2, S2b, S3, S4, S5, S5b, S6, S7, S8 | **12/12** |
| N1 (§4.3) | L0–L10 (L7 y L10 incluyen concurrencia y reintentos) | **11/11** |
| Escenarios nuevos (v3) | X1 (L11), X2, X3a, X3b/c, X4, X4b, X5, X7, X8 | **9/9 OK**, más 5 líneas «INFO» de medición o documentación (X1b, X2 tiempos, X6, X7 ×2) |
| Verificaciones de solo lectura | V0 (V1–V17 corren completas; una escritura dentro de `read only` se rechaza) | **1/1** |
| Borradores M3/M4 encima del diseño | T1–T15 con T6c-1 y T6c-2 | **19/19** |
| **Total** | | **52/52 OK** en la base y **52/52** con `BMAS=1` |

**Escenarios nuevos (v3):**

| ID | Escenario | Resultado real |
|---|---|---|
| X1 (L11) | Contador ya inflado al máximo (estado que deja H4) | N1 **no** desbloquea: 22003, nada escrito. **X1b** (ilustración de D-52-4b): bajar el contador a 0 a mano desbloquea; siguiente N° 1 |
| X2 | 10.000 números importados contiguos (1…10.000) y contador nuevo | 1.ª nueva = N° 10.001, 2.ª = N° 10.002, importación libre = N° 50.000. **Tiempos en local** (cinco corridas): 1.ª nueva 63,8 / 70,0 / 117,4 / 69,2 / 104,0 ms (recorre el bloque una vez), 2.ª 0,6–1,1 ms, importación 0,5–0,9 ms |
| X3 | Privilegios por defecto simulados (`alter default privileges … grant execute on functions to anon, authenticated`) | Una función nueva queda ejecutable por `anon` si no se revoca (X3a). El `revoke` explícito la cierra, y `CREATE OR REPLACE` conserva los privilegios (X3b/c) |
| X4 | Tabla temporal `jobs` y `pg_temp.gen_random_uuid()` en la sesión del usuario; intento de crear una sobrecarga | Sin efecto: escribe en `public.jobs` con un id aleatorio. La sobrecarga → 42501 |
| X5 | `service_role` | Sin `EXECUTE` sobre `create_job_with_quote` |
| X6 | Mensaje de error ante el `id` de un trabajo ajeno | «duplicate key value violates unique constraint "jobs_pkey"». Detalle: solo el `id` enviado por el propio usuario |
| X7 | Disparadores de `jobs` y `client_quotes` | 2 (`*_updated_at` → `set_updated_at()`, INVOKER, `search_path` vacío), solo en `UPDATE`; ninguno en `INSERT` |
| X8 | Borrar el trabajo con el interno 7 (transacción abierta 1 s) e importar el N° 7 a la vez | 0 errores, sin duplicados. La importación quedó con el emitido 7 e interno 1, porque el 7 seguía ocupado al decidir |

**Controles negativos y mutaciones:**

| Control o mutación | Resultado esperado | Obtenido (v3) |
|---|---|---|
| C1: sin `revoke` de `INSERT` en `jobs` ni `drop` de `jobs_insert` | S1 falla | **FALLA S1: INSERT directo aceptado** ✔ |
| C2: solo sin el `drop` de la política | S1 sigue OK: basta el `revoke` | **52/52** ✔ |
| C3: sin `SECURITY DEFINER` | El guardado falla | **permission denied for table jobs** ✔ |
| C4: sin `revoke` en `client_quotes` ni su política de `DELETE` | S2 falla | **FALLA S2: DELETE aceptado** ✔ |
| `CONTADOR=actual` (sin N1) | L1 falla | **FALLA L1: el contador saltó a 2147483647** ✔ |
| Mutación: el bucle no mira el emitido | L7 falla | **FALLA L7: la cotización nueva repitió el N° 4 que el cliente ya vio** ✔ (v2 y v3) |
| Mutación: la importación vuelve a mover el contador | L1 falla | **FALLA L1: el contador saltó a 2147483647** ✔ (v2 y v3) |

Al terminar no quedó ninguna base `ensayo52_*`. Los escenarios X y las verificaciones V corren solo con el contador propuesto (con `CONTADOR=actual` se omiten).

**Observación:** con N1, las importaciones de los borradores M3/M4 (T7 y T8) ya no mueven el contador. Por eso T9b recibe ahora el N° 3, cuando antes recibía el 8. Es el comportamiento aprobado, y las aserciones de M3/M4 lo aceptan.

**Lo que el ensayo NO demuestra:**
- el comportamiento en Supabase real: dueños, roles, privilegios por defecto, panel, `auth.uid()` real;
- los datos actuales de staging;
- el rendimiento con datos reales;
- `verificar-rls.mjs` y `verificar-numeracion.mjs` adaptados, que todavía no existen.

## 8. Verificaciones de solo lectura (preparadas, NO ejecutadas en Supabase)

**Corrección de la v4** (P2 de la [auditoría del Frente B](https://github.com/ratatecuala/calculadora-de-costos-log/issues/52#issuecomment-7072118724)): la v3 decía que el script se podía pegar en el editor SQL de Supabase, pero usa metaórdenes de psql (`\set`, `\pset`, `\echo`) que el editor no entiende. Ahora hay **dos versiones con la misma consulta**:

| Versión | Archivo | Cómo se ejecuta |
|---|---|---|
| **Editor SQL de Supabase** (SQL puro) | `scripts/diseno/verificaciones-52/solo-lectura-editor.sql` | Pegar el archivo **completo** en el editor y ejecutarlo **una vez**. Contiene 2 sentencias: `set transaction read only;` y **una única consulta** que devuelve todas las verificaciones como filas `(verificacion, resultado)`. Así se ven juntas aunque el editor muestre solo el resultado de la última sentencia. Sin metaórdenes de psql |
| **psql** | `scripts/diseno/verificaciones-52/solo-lectura.sql` | **Solo** con `psql -X -f scripts/diseno/verificaciones-52/solo-lectura.sql`. Abre `begin transaction read only`, **incluye el archivo del editor tal cual** (`\ir`) y termina con `rollback` |

- Ninguna crea, modifica ni borra nada. Una escritura dentro de la transacción de solo lectura falla en las dos modalidades (V0d).
- Las consultas de datos devuelven **conteos** y máximos, nunca ids ni correos.
- Una verificación que no aparece en el resultado no devolvió filas (por ejemplo, V8 sin `pgrst.db_schemas`: revisar el panel).
- **No probado en el editor real** (no se tocó Supabase). Se entiende que el editor envía el texto como una sola consulta, y eso se reprodujo en local con `psql -c "$(cat solo-lectura-editor.sql)"`. Si el editor rechazara `set transaction read only`, se puede ejecutar solo la consulta `SELECT`: únicamente lee catálogos y cuenta filas.

**Pruebas en local** (`verificaciones-52/probar.sh`, llamado por `ensayar.sh`):
- **V0a:** la versión psql corre completa (39 filas en la base de ensayo);
- **V0b:** la versión del editor no tiene metaórdenes y corre como una sola consulta (39 filas);
- **V0c:** paridad: las dos devuelven **exactamente las mismas filas**, y V17 confirma «read only = on»;
- **V0d:** una escritura en la misma transacción falla en las dos modalidades.

**Uso previsto:** después del respaldo real y con tu autorización. El resultado se pega en #52. **Ningún hallazgo se repara automáticamente** (D-52-4b).

| Consulta | Qué mide | Cómo interpretarlo (antes de migrar) | Resultado en la base de ensayo (v3; los cambios de la v4 están en §11.2) |
|---|---|---|---|
| V1 | Dueño de `jobs`, `client_quotes`, `quote_counters` y `quote_shares`; RLS y RLS forzada | El dueño debe ser el mismo rol que será dueño de la función DEFINER. `rls_forzada` debe ser `f` | dueño `medir`, RLS `t`, forzada `f` |
| V2 | Funciones de guardado y numeración: dueño, DEFINER, `search_path`, firmas | Hoy: `create_job_with_quote` con DEFINER `f`. Después: `t`, con `search_path=""` y **una sola** firma | DEFINER `t`, `search_path=""` (base ya con el diseño) |
| V3 | ¿El dueño es superusuario o tiene `BYPASSRLS`? | Informativo: confirma que la RLS no aplica dentro del DEFINER (riesgo 1) | `medir`: superusuario, `bypassrls` |
| V4 | Privilegios de tabla de `anon`, `authenticated` y `service_role` | Hoy, `authenticated` tiene `INSERT` en `jobs` y en `client_quotes`. Después: `jobs` = SELECT/DELETE (+UPDATE por columna), `client_quotes` = SELECT | `jobs` sel/del; `client_quotes` sel |
| V5 | `EXECUTE` sobre las funciones; `USAGE` de `private` | `anon` nunca. Con B+, `authenticated` sin `EXECUTE` en `private.*` y sin `USAGE` | Base sin B+: `authenticated` con `EXECUTE`/`USAGE` en `private` |
| V6 | Privilegios por defecto sobre funciones y tablas | Si hay entradas que dan `EXECUTE` a `anon`/`authenticated`, la migración debe revocar explícitamente (riesgo 5) | Sin entradas (la simulación X3 se revierte) |
| V7 | Políticas en `jobs` y `client_quotes` | Después: `jobs_select`, `jobs_update`, `jobs_delete` y `client_quotes_select` | Exactamente esas 4 |
| V8 | `pgrst.db_schemas` del rol `authenticator` | No debe incluir `private`. Sin fila: revisar el panel | Sin fila (el stub no lo define) |
| V9 | Disparadores | Ninguno en `INSERT` | 2, solo en `UPDATE` |
| V10 | Contadores ≥ 2.000.000.000, en el máximo y máximo | **≥ 1 → D-52-4b** (no migrar sin decidir ese caso; N1 no lo desbloquea) | 1 inflado, 1 en el máximo (el simulado en L9) ✔ detectado |
| V11 | Cuentas con trabajos y sin contador | Debe ser 0 | 0 |
| V12 | Contadores por debajo de su máximo interno | Hoy no debería ocurrir (las importaciones mueven el contador). Con N1 es normal después de importar | 3 (importaciones con N1) |
| V13 | Internos o emitidos ≥ 2.000.000.000 | Posibles importaciones anómalas: informar | 4 y 5 (L1–L9) ✔ detectado |
| V14 | Trabajos sin cotización | Restos de `INSERT` directo (H2) o pruebas: informar, **sin** borrar | 10.002 (H1, H2 y los 10.000 de X2, insertados sin cotización) ✔ detectado |
| V15 | Documento con un número distinto del emitido del trabajo | Posible H3 en el pasado: informar | 0 |
| V16 | Números emitidos repetidos por cuenta, y grupos con más de una cotización **nueva** (sin `local_id`) | Los repetidos por importación son legítimos (A-47). Un grupo con más de una nueva indica `INSERT` directo (H2) o datos anómalos | 4 grupos, 1 con dos nuevas (H2) ✔ detectado |
| V17 | `transaction_read_only` | Debe decir `on` | `on` |

## 9. Plan de implementación, reversión y pruebas (cada paso con su autorización)

| Paso | Qué | Autorización |
|---|---|---|
| 0 | Diseño: D-52-1, D-52-2 y N1 | **Hecho** (A-72) |
| 1 | **Implementación local** (detalle abajo) | **Hecho en local** (A-74, §11). Lo único sin ejecutar son los scripts que necesitan staging |
| 2 | Auditoría independiente del código del paso 1 (ChatGPT) | — |
| 3 | **Primer respaldo real** de Supabase (A-52) | Lo ejecuta el propietario |
| 4 | Verificaciones de solo lectura de §8 en staging; informe en #52. Si V10 o V13 encuentran casos: D-52-4b por cuenta | Autorización para ejecutar consultas de solo lectura |
| 5 | Aplicar la migración en staging y repetir las verificaciones y las suites | **A-59**: autorización individual |
| 6 | Informe; recién entonces M3/M4 pueden pedirse (puerta P3) | — |

**Paso 1 · implementación local** (hecho el 22-11, A-74; resultados en §11):
1. Migración nueva en `supabase/migrations/` con §4.1, §4.2 y §4.3:
   - la función N1 con `revoke`/`grant` explícitos y el índice `jobs_owner_issued_idx`;
   - comentarios;
   - la reversión documentada en el mismo PR.
2. **Ensayo convertido en pruebas de la migración real:**
   - H1–H4 pasan a ser pruebas **negativas**;
   - S0–S8, L0–L10, X1–X8 y los controles se mantienen;
   - la T6c de `scripts/diseno/pruebas-borradores.sql` se reescribe como T6c-1 y T6c-2.
3. **Prueba estática en `npm test`:** ningún archivo de `src/` hace `insert` ni `delete` sobre `jobs` o `client_quotes`.
4. **`scripts/verificar-rls.mjs`:**
   - preparar los datos con `rpc('create_job_with_quote')`;
   - agregar: `INSERT` directo propio en `jobs` → 42501, e `INSERT`/`DELETE` en `client_quotes` → 42501;
   - mantener las verificaciones de la otra cuenta.
5. **`scripts/verificar-numeracion.mjs`:**
   - adaptar §5 a N1;
   - agregar: importar 2.147.483.647 y la siguiente cotización (hecho). Importar 2.147.483.648 → error limpio y el reintento se prueban en el ensayo local (L3), no en este script.
6. `npm test`, casos dorados, todos los e2e locales y el ensayo con sus controles.

**Paso 5 · en staging** (con A-59):
1. Repetir V1–V17. Resultados esperados después de migrar: V2 DEFINER `t`; V4 y V5 según §8; V7 con 4 políticas.
2. Suites: `verificar-rls.mjs` adaptado (40/40 o el nuevo total), `verificar-numeracion.mjs` adaptado (17/17 o el nuevo total), `e2e-staging.mjs` 41/41 y `e2e-staging-anonimo.mjs` 59/59.
3. Medir el tiempo de la primera cotización tras una importación grande.

**Reversión completa:** archivo `scripts/diseno/ensayo-52/reversion-52.sql`, idempotente y ensayado (fase R, §11). Fuera de `supabase/migrations` a propósito. No borra datos y los números ya asignados no cambian. Resumen:

```sql
-- D-52-1
alter function public.create_job_with_quote(jsonb, jsonb) security invoker;
grant insert on table public.jobs to authenticated;
grant insert, delete on table public.client_quotes to authenticated;
create policy jobs_insert on public.jobs for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy client_quotes_insert on public.client_quotes for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy client_quotes_delete on public.client_quotes for delete to authenticated using ((select auth.uid()) = owner_id);
create policy client_quotes_update on public.client_quotes for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
-- D-52-2 (B+)
grant usage on schema private to authenticated;
grant execute on function private.allocate_quote_number(integer) to authenticated;
-- N1: volver a la definición de 20261118022422_numeracion_atomica.sql (copiar su CREATE OR REPLACE de
-- private.allocate_quote_number, sección 4) y quitar el índice.
drop index if exists public.jobs_owner_issued_idx;
```

**Efecto de revertir N1:** vuelve el riesgo H4. Los contadores que con N1 quedaron por debajo de su máximo (V12) no generan duplicados, porque la función anterior también salta los ocupados.

**Costo:** $0. Todo corre en local y en el plan gratuito de staging.

## 10. Decisiones

| ID | Decisión | Estado |
|---|---|---|
| **D-52-1** | Función de guardado DEFINER; sin `INSERT` en `jobs` ni `INSERT`/`DELETE` en `client_quotes`; sin políticas sobrantes | **Aprobada como decisión de diseño** (A-72, 22-11) |
| **D-52-2** | B+: `authenticated` sin acceso a `private` | **Aprobada como decisión de diseño** (A-72) |
| **D-52-3** | M4 como DEFINER y sin `EXECUTE` de `authenticated` sobre `private.insert_cargo_items` | **Reservada para M4** |
| **D-52-4 v2** | Contador N1, con el cambio de numeración del ejemplo (§4.3) | **Aprobada como decisión de diseño** (A-72) |
| **D-52-4b** | Reparación de contadores ya inflados | **Solo si V10 o V13 encuentran casos**: por cuenta, con tu autorización, **nunca** automática |
| **D-52-5** | `DELETE` del trabajo completo por el dueño | **Provisional** (solo staging). Antes de un lanzamiento público hace falta una política de anulación o auditoría |

**Próxima autorización que hace falta:** después de la auditoría independiente del código (paso 2), el respaldo real (paso 3) y la autorización para ejecutar las verificaciones de solo lectura en staging (paso 4). Aplicar la migración (paso 5) exige A-59. La implementación local (A-74) **no** autoriza ninguno de esos pasos.

## Anexo · Cifras históricas

- **Versión 1 (21-11):**
  - ensayo **31/31** (S0–S8 y M3/M4 con la T6c reescrita), también con B+;
  - controles C1–C4 como en §7;
  - D-52-1 a D-52-5 propuestas.
- **Versión 2 (22-11):**
  - ensayo **42/42** (31 + L0–L10), también con B+;
  - `CONTADOR=actual` falla en L1;
  - mutaciones del bucle (L7) y del salto (L1), detectadas.
  - Decisión del 22-11 (A-70): D-52-1 y D-52-2 como orientación técnica, D-52-3 criterio futuro, D-52-4 a rediseñar, D-52-5 provisional.
  - Tiempos: no se medía el bucle.
- **Versión 3 (22-11):** 52/52 (42 + X1–X8 + V0), también con B+. Diseño aprobado por A-72.
- **Versión 4 (22-11):** migración real ensayada en local: **65 OK**, 5 INFO, 4 HUECO (fase 1), 0 FALLA (§11).

## 11. Implementación local (A-74, 22-11-2026)

**Autorización:** A-74, [registro en #43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7072135863). Solo el repositorio y PostgreSQL local desechable. **No** se ejecutó nada en Supabase ni en staging, ni siquiera lectura, y no hay ningún flujo de GitHub Actions que aplique migraciones (no existe `.github/workflows`).

### 11.1 Archivos

| Archivo | Qué es |
|---|---|
| `supabase/migrations/20261122120000_guardado_unico_y_contador.sql` | **La migración.** D-52-1 (DEFINER, `revoke` de la escritura directa, políticas sobrantes fuera, privilegios explícitos de `EXECUTE` a `public`, `anon` y `service_role`), N1 (función de asignación e índice `jobs_owner_issued_idx`) y D-52-2 (sin `private` para `authenticated`). Cabecera: **no aplicar** sin auditoría, respaldo real, verificaciones de solo lectura y A-59; un `supabase db push` la aplicaría. No toca datos ni contadores. Idempotente |
| `scripts/diseno/ensayo-52/reversion-52.sql` | Reversión completa e idempotente; la función de asignación anterior se copia **literal** de `20261118022422` |
| `scripts/diseno/ensayo-52/ensayar.sh` | Ensayo de la migración **real**, con controles, mutaciones, segunda aplicación (S9), fase R y restauración |
| `fase1.sql`, `fase2.sql`, `privilegios.sql`, `pruebas-contador.sql`, `escenarios-extra.sql`, `reversion-r.sql`, `probar-restauracion.sh` | Partes del ensayo (H1–H4; S0–S7; S0c; L1–L9; X1–X7; R1–R4; restauración) |
| `scripts/diseno/pruebas-borradores.sql`, `probar-borradores.sh` | T6c definitiva (T6c-1 y T6c-2), T6d nueva, rol de prueba `prueba_capas`, D-52-3 simulado sobre el borrador M4 y T14 adaptado a N1 |
| `scripts/diseno/verificaciones-52/solo-lectura-editor.sql` (nuevo), `solo-lectura.sql`, `probar.sh` | Versión para el editor (SQL puro), versión psql que la incluye y prueba de paridad (§8) |
| `scripts/verificar-rls.mjs`, `scripts/verificar-numeracion.mjs` | Adaptados a #52 y N1. **No ejecutados:** requieren staging con la migración aplicada |
| `scripts/verificar-restauracion.sql` | Las invariantes de privilegios dependen de si la migración está aplicada, así que vale antes y después |
| `tests/sin-escritura-directa.test.ts` | Prueba estática en `npm test`: `src/` no escribe directamente en `jobs` ni en `client_quotes`, no toca el contador y guarda con la función |
| Retirados | `ensayo-52.sql` (dividido en `fase1.sql` y `fase2.sql`), `contador-52.sql` (ahora en la migración) y `t6c-52.sql` (ahora en `pruebas-borradores.sql`) |

### 11.2 Ensayo de la migración real (Claude, PostgreSQL 16.15 local, 22-11-2026)

**Orden:**
1. Estado anterior: stub, las 3 migraciones previas y los privilegios por defecto de Supabase simulados para `service_role`.
2. H1–H4 reproducidos.
3. Se aplica la **migración real**.
4. L0, S0–S7, S0c, S8, L1–L10, X1–X8 y V0a–V0d.
5. S9: la migración aplicada otra vez.
6. M3/M4 con D-52-3 simulado.
7. Fase R en otra base.
8. Restauración antes y después de la migración.

| Bloque | Resultado |
|---|---|
| Fase 1 sobre el estado anterior | **H1, H2, H3 y H4 reproducidos** |
| L0: la migración no cambia trabajos, documentos (número y cliente) ni contadores existentes | **OK** (huellas idénticas) |
| S0–S7 (DEFINER, `anon`, escritura directa → 42501, guardado, importación, aislamiento, sin sesión, estado, pago y cascada) | **11/11 OK**. S4 se adaptó a N1: el conflicto recibe el interno 2 (contador + 1), no el 41 |
| S0c: privilegios completos (sin `private` para `authenticated`; `anon`, `service_role` y `PUBLIC` sin `EXECUTE`; sin escritura directa; borrado y estado conservados; sin políticas sobrantes; índice presente) | **OK** |
| S8: 20 guardados simultáneos | **OK**, correlativos |
| L1–L9: límites de INT4, reintentos y números emitidos | **9/9 OK** |
| L10: concurrencia y reintentos simultáneos | **OK**: 0 errores, sin duplicados, internos 5…28 |
| X1–X8 | **9 OK** y 5 INFO (X1b, tiempos de X2: 1.ª nueva 58,3 ms, 2.ª 0,6 ms, importación 0,5 ms; X6; X7 ×2) |
| V0a–V0d: verificaciones de solo lectura, dos versiones y paridad | **4/4 OK** (39 filas idénticas) |
| S9: la migración aplicada por segunda vez | **OK**: no falla, no cambia datos ni contadores; S0c otra vez OK |
| M3/M4 encima de la migración (T1–T15, T6, T6b, T6c-1, T6c-2, T6d) | **20/20 OK** |
| Fase R: reversión | **R1–R4 OK**: datos idénticos; INVOKER, escritura directa, políticas y `private` restaurados; el guardado con la semántica anterior (importar 1000 → la siguiente es la 1001); reversión idempotente; la migración otra vez con datos idénticos y N1 activo |
| `verificar-restauracion.sql` antes y después de la migración | **15/15 invariantes** en los dos estados. Con el archivo anterior, después de migrar fallarían 3 (políticas, privilegios de `authenticated` y DEFINER) |
| **Total** | **65 OK**, 5 INFO, 4 HUECO (fase 1), **0 FALLA**. No quedó ninguna base de ensayo |

**Verificaciones después de la migración** (base de ensayo; cambios respecto de la tabla v3 de §8):
- V4: `authenticated` → `jobs` SELECT/DELETE y `client_quotes` SELECT.
- V5: `authenticated` sin `EXECUTE` en `private.allocate_quote_number` y sin `USAGE` en `private`; `service_role` sin `EXECUTE`.
- V7: 4 políticas (`jobs_select`, `jobs_update`, `jobs_delete`, `client_quotes_select`).
- V10: 1 contador inflado (el simulado en L9 y X1).
- V12: 4 contadores por debajo de su máximo (normal con N1).
- V13: 4 internos y 5 emitidos altos.
- V14: 10.002 trabajos sin cotización (H1, H2 y X2).
- V15: 0.
- V16: 4 grupos, 1 con dos nuevas (H2).
- V17: `on`.

`probar-borradores.sh` (todas las migraciones, M3/M4 con D-52-3 simulado): T1–T15, T6d y C3 27/27 OK. T14 se adaptó a N1: 20 simultáneos, N° 4…24 correlativos saltando 1 ocupado, 40 líneas.

**Controles y mutaciones** (cada uno sobre una **copia** de la migración):

| Control o mutación | Resultado |
|---|---|
| C1: sin `revoke insert` en `jobs` ni `drop` de `jobs_insert` | **FALLA S1: INSERT directo aceptado** ✔ |
| C2: con el `revoke` pero sin el `drop` de la política | **61 OK**, sin fallas ✔ (doble capa) |
| C3: sin `SECURITY DEFINER` | **permission denied for schema private** ✔: el guardado deja de funcionar (con D-52-2, la INVOKER ya no llega a `private`) |
| C4: sin `revoke` en `client_quotes` ni el `drop` de su política de `DELETE` | **FALLA S2: DELETE aceptado** ✔ |
| C5: M4 sin D-52-3 (v2 INVOKER) | **permission denied for schema private** en T1 ✔ (hallazgo de §4.5) |
| `CONTADOR=actual` (sin el bloque N1) | **FALLA S4** (interno 41, el salto antiguo) ✔ |
| Mutación `sin_revoke_insert` | **FALLA S0c: queda escritura directa** ✔ |
| Mutación `sin_definer` | **FALLA S0** ✔ |
| Mutación `contador_salta` | **FALLA S4** (interno 41) ✔ |
| Mutación `sin_revoke_service_role` | **FALLA S0c: anon o service_role pueden ejecutar la asignación** ✔ |
| Mutación `sin_bmas` | **FALLA S0c: authenticated conserva USAGE en private** ✔ |

### 11.3 `npm test` y scripts de staging

- `npm test`: **603/603**, incluida la prueba estática (3 pruebas, con un control interno del detector). Typecheck sin errores.
- `verificar-rls.mjs`:
  - crea los datos de prueba por la función, como importación con un número alto libre: con N1 no consume números de la secuencia real de A;
  - agrega «A no INSERTA trabajos directamente», «A no INSERTA documentos» y «A no BORRA su documento emitido (H3)».
- `verificar-numeracion.mjs`:
  - §3 y §5 adaptados a N1: la siguiente cotización usa el contador y no repite ningún interno ni emitido;
  - §5b nuevo: importar el máximo de INT4 y la siguiente cotización.
- Los dos scripts pasan `node --check`, pero **no se ejecutaron**: necesitan staging con la migración aplicada, y antes de migrar las pruebas nuevas fallarían.

### 11.4 Lo que no se probó y lo que falta

- **Nada en Supabase real:** dueños de funciones y tablas, `BYPASSRLS`, privilegios por defecto reales, `auth.uid()` real, esquemas expuestos, el editor SQL real. Lo cubrirán las verificaciones de solo lectura (paso 4).
- `verificar-rls.mjs`, `verificar-numeracion.mjs`, `e2e-staging.mjs` y `e2e-staging-anonimo.mjs` contra staging con la migración.
- **Secuencia que falta, cada paso con su autorización:**
  1. auditoría independiente de este código;
  2. primer respaldo real (A-52), que hace el propietario;
  3. verificaciones de solo lectura en staging e informe en #52 (D-52-4b si aparecen contadores inflados);
  4. **A-59** para aplicar la migración en staging;
  5. repetir las suites.

  M3/M4 vienen después y deberán adoptar D-52-3 (§4.5).

### 11.x Revisión de integración (Claude, 22-11-2026)

Al integrar este frente en la rama del PR #34, Claude **repitió** todas las ejecuciones:
- `ensayar.sh`: **65 OK**, 0 fallas.
- `probar-borradores.sh`: **24/24**.
- Controles: C1, C3, C4 y C5 fallan como corresponde; C2 da 61 OK (doble capa).
- `CONTADOR=actual` y las 5 mutaciones de la migración: **todos detectados**.
- `npm test`: **625/625** sobre el árbol integrado con el Frente A.

**Hallazgo y corrección:** `scripts/verificar-restauracion.sql` exigía, también con la migración aplicada, que ningún contador fuera menor que el número máximo de su cuenta (`inv.contador_menor_que_maximo`). Con N1 eso es **normal** tras importar un número alto libre, así que en uso real el script habría dado un **falso error**. La prueba de restauración no lo detectaba porque corría sobre bases **vacías**.

| Cambio | Detalle |
|---|---|
| Condición | Con la migración aplicada, solo cuenta como error una cuenta con trabajos **sin** contador. Antes de la migración, la regla anterior se mantiene |
| Prueba | `probar-restauracion.sh` carga **datos reales** antes de verificar: una cotización nueva y la importación libre del N° 900. Antes de migrar, el contador queda en 900; después, en 1 |
| Control | Con la condición anterior, la verificación posterior a la migración **falla** (`inv.contador_menor_que_maximo | 1 | 0`); con la corrección pasa en ambos estados |
