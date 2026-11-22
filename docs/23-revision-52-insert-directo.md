# 23 · Revisión técnica de #52: INSERT directo en `jobs` y documentos emitidos

**Versión 2 · 22-11-2026 · Estado: PROPUESTA para tu revisión.** Autorizada **solo** como diseño:
- versión 1: A-69, [registro en #43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7071050495);
- versión 2: A-70, [registro en #43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7071441529).

**Cambios de la versión 2:** responde la [revisión de ChatGPT](https://github.com/ratatecuala/calculadora-de-costos-log/issues/52#issuecomment-7071428749).
- **H4:** desbordamiento del contador al importar números muy altos (§3).
- **Rediseño del contador** (§10) con pruebas de límites de `INTEGER`, concurrencia y reintentos.
- Estado de D-52-1 a D-52-5 según tu decisión del 22-11 (§9).

**No se implementó nada:**
- no hay ninguna migración nueva en `supabase/migrations/`;
- no se tocó Supabase ni staging;
- la app no cambió.

El ensayo de §6 corre **solo** en un PostgreSQL local desechable, con la herramienta de diseño `scripts/diseno/ensayo-52/`, que sigue el mismo criterio que los borradores M3 y M4.

**Base:**
- [#52](https://github.com/ratatecuala/calculadora-de-costos-log/issues/52);
- A-47 (numeración atómica y documentos inalterables) y A-59 (cada migración en staging requiere autorización individual y un respaldo real);
- [docs/21 §8](21-diseno-datos-cotizador.md) (borradores M3 y M4 y la observación que originó #52);
- migraciones actuales:
  - `20261118000315_esquema_inicial.sql`;
  - `20261118000924_guardar_cotizacion_atomica.sql`;
  - `20261118022422_numeracion_atomica.sql`.

## 1. Resumen

| | |
|---|---|
| **Problema** | El rol `authenticated` puede escribir directamente en `jobs` y `client_quotes` por la Data API, **sin pasar** por `create_job_with_quote` ni por la numeración atómica |
| **Alcance** | Solo los datos de la propia cuenta: RLS por dueño, ninguna cuenta ve ni toca las de otra |
| **Gravedad** | **Media-alta para A-47.** Además de lo descrito en #52, el ensayo encontró un hueco **más grave**: un documento ya emitido se puede **reemplazar** borrándolo e insertándolo de nuevo (H3). La revisión de ChatGPT agregó **H4**: importar el número 2.147.483.647 por la propia función **bloquea** las cotizaciones siguientes de esa cuenta |
| **Propuesta** | La función de guardado pasa a `SECURITY DEFINER`. Se revocan `INSERT` en `jobs` e `INSERT`/`DELETE` en `client_quotes`, y se quitan las políticas que ya no corresponden. Opcionalmente (B+), `authenticated` pierde el acceso al esquema `private` |
| **Impacto en la app** | **Ninguno.** La app ya escribe solo mediante `create_job_with_quote` y solo actualiza `status` y `payment` |
| **Contador (v2)** | Rediseño **N1**: el contador avanza solo con los números que asigna él mismo; las importaciones conservan su número sin moverlo (§10) |
| **Ensayo local** | Huecos H1–H4 reproducidos. Con la propuesta y el rediseño: **42/42** (S0–S8, L0–L10 y las pruebas de M3/M4 con la T6c reescrita). Variante B+: 42/42. Controles negativos C1, C3, C4 y «contador actual» fallan como corresponde; C2 confirma que basta revocar el `GRANT`. Dos mutaciones del rediseño, detectadas |
| **Relación con M3/M4** | #52 va **antes** (puerta P3). Obliga a reescribir la T6c del borrador M3 y permite, si lo apruebas, cerrar a nivel SQL la función privada de M3 (§7) |

## 2. Estado actual: qué permite hoy la base

| Objeto | Permisos de `authenticated` hoy | Política RLS | ¿Lo usa la app? |
|---|---|---|---|
| `public.jobs` | `SELECT`, `INSERT`, `DELETE`, `UPDATE (status, payment)` | `jobs_insert`, `jobs_select`, `jobs_update`, `jobs_delete` (dueño) | Lectura; `UPDATE` de estado y pago; escritura **solo** mediante la función RPC |
| `public.client_quotes` | `SELECT`, `INSERT`, `DELETE` (el `UPDATE` se revocó en la numeración) | `insert`, `select`, `update`, `delete` (dueño) | Solo lectura. La escritura va dentro de la función RPC; el borrado, en cascada al borrar el trabajo |
| `public.quote_counters` | Ninguno | RLS sin políticas | No: solo `private.allocate_quote_number` |
| `public.create_job_with_quote` | `EXECUTE` | — | **Sí** (`quotes.ts` y `migration.ts`) |
| `private.allocate_quote_number` | `USAGE` del esquema y `EXECUTE` | — | Indirectamente, porque la v1 es `SECURITY INVOKER` y la necesita |

**Por qué existe el hueco:** la v1 es `SECURITY INVOKER`. Corre con los permisos del usuario, así que el usuario necesita `INSERT` sobre las dos tablas, y ese permiso también le sirve para escribir **fuera** de la función.

**Verificación del código** (`grep` en `src/web/cloud/*.ts`):
- ningún `insert` ni `delete` sobre `jobs` o `client_quotes`;
- solo `rpc('create_job_with_quote')`, `update(status, payment)` y lecturas.

**Scripts de staging:**
- `scripts/verificar-rls.mjs` **sí** usa `INSERT` directo en `jobs` y `client_quotes` para preparar sus datos. Habrá que adaptarlo (§8).
- `verificar-numeracion.mjs` y `e2e-staging.mjs` usan la función y la app.

## 3. Huecos confirmados en el ensayo local (fase 1)

Con las 3 migraciones reales y el stub de Supabase, como usuario `authenticated`:

| ID | Qué se hizo | Resultado | Por qué rompe A-47 |
|---|---|---|---|
| **H1** | `INSERT` directo con N° 5000 **antes** del primer guardado de la cuenta | Aceptado; el primer guardado recibe el **N° 5001**, no el 1 | El contador se crea desde el máximo existente, así que la secuencia queda bajo control del cliente y no de la base |
| **H2** | `INSERT` directo de un trabajo con el mismo número emitido que otro documento | Aceptado: un trabajo **sin cotización** y un número emitido repetido | «Cada trabajo nace con su documento en una transacción» deja de ser cierto; quedan trabajos huérfanos |
| **H3** (**nuevo**, no estaba en #52) | `DELETE` de la cotización de un trabajo emitido + `INSERT` de otra con N° 999, otro cliente y $1 | **Aceptado**: el documento emitido queda **reemplazado** | Rompe la inmutabilidad de A-47 («nunca se cambia un documento emitido»). Revocar `UPDATE` no basta si se permiten `DELETE` e `INSERT` |

| **H4** (revisión de ChatGPT, 22-11) | Por la **función** `create_job_with_quote`, sin acceso directo: importar con un `local_id` nuevo y el número emitido libre 2.147.483.647 | Aceptado: el contador sube a 2.147.483.647 y la **siguiente cotización falla** (`integer out of range`). Borrar el trabajo no baja el contador | La cuenta queda **sin poder cotizar** hasta una intervención en la base. **Existe hoy** y D-52-1 por sí sola no lo corrige |

Ninguno cruza cuentas: RLS por dueño sigue funcionando (verificado también en S5).

**Matiz honesto:** dos de los efectos de H1 y H2 también son posibles **por diseño** con la ruta de importación de la función, y D-52-1 no los cambia (R1). El salto de la secuencia y su desbordamiento (H4) se rediseñan en §10:
- un número local libre se conserva tal cual, así que la secuencia puede saltar;
- un número emitido ocupado se repite en el documento, con un número interno nuevo.

Lo que **solo** permite el acceso directo es:
- crear trabajos **sin documento** y **sin pasar** por el contador;
- **reemplazar documentos emitidos** (H3).

## 4. Corrección propuesta

### 4.1 Opción A (recomendada): la función como única puerta de escritura

```sql
-- #52 (propuesta, NO ejecutada): crear trabajos y documentos solo mediante el guardado.
-- 1. Misma función, misma firma y mismo cuerpo: solo cambia quién ejecuta los INSERT.
alter function public.create_job_with_quote(jsonb, jsonb) security definer;
-- (ya tiene search_path = '' y todas las referencias calificadas; EXECUTE solo para authenticated)

-- 2. Sin escritura directa de trabajos ni de documentos.
revoke insert on table public.jobs from authenticated;
revoke insert, delete on table public.client_quotes from authenticated;

-- 3. Políticas que ya no corresponden (defensa en profundidad y claridad).
drop policy if exists jobs_insert on public.jobs;
drop policy if exists client_quotes_insert on public.client_quotes;
drop policy if exists client_quotes_update on public.client_quotes;  -- sin GRANT UPDATE desde la numeración
drop policy if exists client_quotes_delete on public.client_quotes;
```

**Se conserva:**
- `SELECT` en las dos tablas;
- `UPDATE (status, payment)` en `jobs`;
- `DELETE` en `jobs`: el dueño borra el trabajo **completo**, y la cascada borra el documento y sus enlaces. El ensayo S7 confirma que la cascada funciona aunque `DELETE` en `client_quotes` esté revocado.

**Por qué es seguro hacerla `SECURITY DEFINER`:**

| Riesgo típico de DEFINER | Situación en esta función | Prueba |
|---|---|---|
| `search_path` manipulable | Ya tiene `set search_path = ''` y todas las referencias calificadas (`public.`, `private.`, `auth.`). `gen_random_uuid()` está en `pg_catalog`, que siempre se busca | S0 |
| Saltarse RLS y escribir en otra cuenta | La identidad sale **solo** de `auth.uid()`; `owner_id` se fija a esa identidad en ambos `INSERT`; las consultas de idempotencia filtran por dueño | S5: mismo `local_id` en otra cuenta crea lo propio; el `id` de un trabajo ajeno da error de clave y no lo toca; S5b |
| Ejecutarla sin sesión | `auth.uid()` nulo → 42501, como hoy | S6 |
| `anon` la ejecuta | `EXECUTE` revocado a `public` y `anon` (ya en la migración actual) | S0b |
| Concurrencia y numeración | `allocate_quote_number` ya era DEFINER, con `FOR UPDATE` | S8: 20 simultáneos dan números únicos y correlativos |
| Datos arbitrarios en el contenido | Igual que hoy: el usuario escribe **sus** datos, dentro de los `CHECK` de las tablas. DEFINER no amplía qué valores se aceptan | S3 y S4 |

### 4.2 Variante B+ (recomendada como parte de #52)

Con la v1 DEFINER, `authenticated` ya no necesita el esquema `private`:

```sql
revoke execute on function private.allocate_quote_number(integer) from authenticated;
revoke usage on schema private from authenticated;
```

Reduce la superficie: aunque un día se expusiera `private` por error en la Data API, `authenticated` no podría ejecutar nada de allí. Ensayada: **42/42** en la versión 2, con el rediseño del contador.

### 4.3 Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| **B.** Mantener INVOKER y agregar un *trigger* en `jobs` que exija una marca de transacción (`set_config`) puesta por la función | Más piezas, depende del mismo supuesto que la capa 2 de M3 y no cubre `DELETE` + `INSERT` en `client_quotes` sin otro *trigger* |
| **C.** Mover las tablas a un esquema no expuesto y leerlas con vistas | Refactorización grande de la app y de RLS sin beneficio adicional |
| **D.** Aceptar el riesgo y solo documentarlo | H3 rompe A-47 (documentos inalterables) |

## 5. Relación con M3 y M4 (I-2)

1. **Orden:** #52 se ejecuta **antes** que M3/M4, tal como fija la puerta P3 (docs/21 §15). Los borradores se ensayaron **encima** de la propuesta y siguen en verde.
2. **T6c del borrador M3 debe reescribirse:** su precondición era justamente el `INSERT` directo en `jobs`, que con #52 da 42501. La versión ensayada (`scripts/diseno/ensayo-52/t6c-52.sql`) comprueba:
   - **T6c-1:** el `INSERT` directo se rechaza;
   - **T6c-2:** la capa «marca de transacción» sigue funcionando con un trabajo creado sin el guardado v2.
3. **Comentario de M4:** dice «identidad por `auth.uid()` y RLS de la v1». Con DEFINER, la RLS **no** se aplica dentro de la v1. El aislamiento depende de los filtros explícitos por dueño, que existen y están probados (S5). El comentario debe actualizarse cuando se apruebe M4.
4. **Oportunidad (decisión D-52-3):** si M4 (`create_job_with_quote_v2`) también fuera DEFINER, se podría revocar a `authenticated` el `EXECUTE` sobre `private.insert_cargo_items`. Así, «solo M4 puede llamarla» pasaría a ser cierto a nivel SQL, y desaparecería el supuesto de seguridad P2-1 de docs/21 §8. Ensayado con B+: 42/42.
   - **Salvedad:** con B+, T6c-2 pasa porque falta el permiso, no por la marca. Para seguir probando la marca habría que ejecutarla con un rol de prueba que sí tenga `EXECUTE`.
5. **Para revisar al aprobar M4 (fuera de #52):** la v1 acepta cualquier `internal`, incluido un resumen v2. Es correcto para la copia mixta de I-1, porque los v2 con líneas quedan diferidos. Cuando exista la v2 con líneas, conviene decidir si la v1 debe rechazar un `internal` que declare líneas, para que «v2 con líneas» pase siempre por M4.

## 6. Ensayo local: resultados (Claude, 21-11-2026; ampliado el 22-11 con H4 y §10)

**Herramienta:** `scripts/diseno/ensayo-52/ensayar.sh`.
- Solo acepta un PostgreSQL local (socket o `localhost`).
- Crea una base desechable y la borra con `trap`, también si algo falla.
- No es una migración.

Comando:

```bash
PGHOST=/ruta/al/socket PGPORT=55433 PGUSER=medir scripts/diseno/ensayo-52/ensayar.sh
```

PostgreSQL 16.15, stub de Supabase y las 3 migraciones reales.

| Paso | Resultado |
|---|---|
| Fase 1: huecos | **H1, H2, H3 y H4 reproducidos** (§3) |
| S0, S0b | Función DEFINER con `search_path` vacío; `anon` sin `EXECUTE` |
| S1 | `INSERT` directo en `jobs` → **42501** |
| S2, S2b | `DELETE` e `INSERT` directos en `client_quotes` → **42501** |
| S3 | Guardado nuevo de B: N° 1, dueño B y documento N° 1 |
| S4 | Importación: N° 40 conservado; repetida → `NULL`; conflicto → interno 41 y emitido 40 |
| S5, S5b | Aislamiento entre cuentas con DEFINER (ver §4.1); el trabajo de B queda intacto |
| S6 | Sin sesión → 42501 |
| S7 | Estado y pago se pueden cambiar; el número no; borrar el trabajo borra el documento en cascada |
| S8 | 20 guardados simultáneos → números únicos y correlativos |
| M3/M4 encima de la propuesta | T1–T15, con **T6c-1 y T6c-2** en lugar de T6c: **todas OK** |
| Rediseño del contador (§10) | **L0–L10: todas OK** |
| **Total** | **42/42 OK**; también **42/42** con `BMAS=1` (31 de la versión 1 + 11 del contador) |

**Controles negativos** (`CONTROL=…`):

| Control | Qué se quita | Resultado esperado | Obtenido |
|---|---|---|---|
| C1 | El `revoke` de `INSERT` en `jobs` **y** el `drop` de `jobs_insert` | S1 falla | **FALLA S1: INSERT directo aceptado** ✔ |
| C2 | Solo el `drop` de la política (se mantiene el `revoke`) | S1 sigue OK: basta revocar el `GRANT` | **OK S1** ✔. Cada capa bloquea por sí sola |
| C3 | `SECURITY DEFINER` | El guardado deja de funcionar | **permission denied for table jobs** ✔. DEFINER es imprescindible si se revoca el `INSERT` |
| C4 | El `revoke` en `client_quotes` y su política de `DELETE` | S2 falla | **FALLA S2: DELETE aceptado** ✔ |

Al terminar no quedó ninguna base de ensayo.

**Lo que este ensayo NO demuestra:**
- el comportamiento en Supabase real: dueño de la función, roles y advertencias del panel. Ver la verificación previa en §8;
- que el script de RLS de staging siga en 40/40, porque necesita adaptarse (§8).

## 7. Riesgos residuales y decisiones que #52 no resuelve

| ID | Riesgo | Estado | Propuesta |
|---|---|---|---|
| R1 | La ruta de **importación** de la función acepta un número emitido elegido por el cliente. Hoy, si está libre, la secuencia salta hasta él y puede **desbordarse** (H4); si está ocupado, el documento repite el número emitido (con un interno nuevo) | **Rediseñado en §10** (D-52-4 v2): las importaciones conservan su número **sin mover** el contador, así que no hay salto ni desbordamiento. El número emitido repetido al importar se mantiene, por A-47 | Aprobar N1 (D-52-4). Verificar en el servidor el historial local sigue sin ser posible |
| R2 | `DELETE` en `jobs`: el dueño puede borrar una cotización emitida completa, y su número emitido podría volver a usarse mediante una importación | **Por diseño** («los números borrados no se reutilizan» rige para los guardados nuevos) | Mantener (D-52-5), o diseñar más adelante un «anular» en lugar de borrar |
| R3 | El `id` del trabajo lo propone el cliente: si choca con uno ajeno, da un error de clave (igual que hoy) | Riesgo despreciable: UUID v4 de 122 bits aleatorios | Sin cambios |
| R4 | El panel de Supabase puede advertir sobre funciones `SECURITY DEFINER` ejecutables por `authenticated` | Esperado e intencional | Documentarlo en la verificación posterior |
| R5 | El dueño de la función en Supabase debe ser el dueño de las tablas (normalmente `postgres`), para que DEFINER pueda escribir | **No verificado** en Supabase | Consulta de solo lectura antes de migrar (§8) |

## 8. Plan de implementación y pruebas (cuando lo autorices)

**Requisitos previos:**
- tu aprobación de esta propuesta y de las decisiones D-52-1 a D-52-5;
- el **primer respaldo real** (A-52, pendiente; lo haces tú);
- la autorización individual para ejecutar en staging (A-59).

**En el repositorio (local):**
1. Migración nueva en `supabase/migrations/` con §4.1 (y §4.2 si apruebas B+), más su SQL de reversión documentado.
2. Pruebas SQL: convertir H1–H3 en pruebas negativas, sumar S0–S8 y los controles al ensayo local, y reescribir la T6c en `pruebas-borradores.sql`.
3. Prueba estática en `npm test`: ningún archivo de `src/` hace `insert` ni `delete` sobre `jobs` o `client_quotes`. Cubre la protección de la app, aunque hoy ya se cumple.
4. Adaptar `scripts/verificar-rls.mjs`:
   - preparar los datos con `rpc('create_job_with_quote')`;
   - nuevas verificaciones: `INSERT` directo propio en `jobs` → 42501, e `INSERT`/`DELETE` en `client_quotes` → 42501;
   - mantener las de otra cuenta.
5. `npm test`, casos dorados, todos los e2e locales y el ensayo con sus controles.

**Verificación previa en staging (solo lectura, sin cambiar nada):**
- dueño de las tablas y de la función:

  ```sql
  select tableowner from pg_tables where tablename in ('jobs','client_quotes');
  select proowner::regrole from pg_proc where proname = 'create_job_with_quote';
  ```

- esquemas expuestos por la Data API, que no deben incluir `private` (ya exigido por docs/21 §8);
- **auditoría de datos:** trabajos sin cotización y números emitidos repetidos que no vengan de importaciones, por ejemplo restos de pruebas con `INSERT` directo:

  ```sql
  select count(*) from public.jobs j
  where not exists (select 1 from public.client_quotes q where q.job_id = j.id);
  ```

  Si aparecen, se informan y **no** se borra nada sin tu autorización.

**Ejecución en staging** (con autorización):
1. aplicar la migración;
2. `verificar-rls.mjs` adaptado, `verificar-numeracion.mjs` 17/17, `e2e-staging.mjs` 41/41 y `e2e-staging-anonimo.mjs` 59/59;
3. informe en #52.

**Reversión** (si algo falla):

```sql
alter function public.create_job_with_quote(jsonb, jsonb) security invoker;
grant insert on table public.jobs to authenticated;
grant insert, delete on table public.client_quotes to authenticated;
create policy jobs_insert on public.jobs for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy client_quotes_insert on public.client_quotes for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy client_quotes_delete on public.client_quotes for delete to authenticated using ((select auth.uid()) = owner_id);
create policy client_quotes_update on public.client_quotes for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
-- B+: grant usage on schema private to authenticated;
--     grant execute on function private.allocate_quote_number(integer) to authenticated;
```

La reversión no borra datos: solo devuelve permisos.

**Costo:** $0. Todo corre en local y en el plan gratuito de staging.

## 9. Decisiones

Estado según tu decisión del 22-11 (A-70). **Ninguna es autorización para implementar.**

| ID | Decisión | Estado |
|---|---|---|
| **D-52-1** | Opción A: la función de guardado como `SECURITY DEFINER`; revocar `INSERT` en `jobs` e `INSERT`/`DELETE` en `client_quotes`; quitar las políticas sobrantes | **Aceptada como orientación técnica** (22-11) |
| **D-52-2** | Variante B+: `authenticated` sin acceso al esquema `private` | **Aceptada como orientación técnica** (22-11) |
| **D-52-3** | Cuando se autorice M4: la v2 como `SECURITY DEFINER` y sin `EXECUTE` de `authenticated` sobre `private.insert_cargo_items` | **Criterio futuro**; se revisa junto con M4 |
| **D-52-4 (v2)** | Rediseño **N1** del contador (§10): las importaciones conservan su número sin moverlo; las cotizaciones nuevas siguen su propia secuencia, saltando los números ya usados como interno o emitido; aritmética sin desbordamiento. **Cambia un comportamiento verificado en staging** (§10.4) | **Pendiente de tu decisión.** Recomiendo N1 |
| **D-52-4b** | Si la auditoría previa (§10.5) encuentra contadores ya inflados, cómo repararlos | **Pendiente**, solo si aparecen casos |
| **D-52-5** | `DELETE` del trabajo completo por el dueño (R2) | **Provisional** (solo staging). Antes de un lanzamiento público hace falta una política de anulación o auditoría que concilie «documento emitido inalterable» con el borrado por el usuario |

**Lo que sigue sin autorización:** implementar #52, crear la migración, ejecutarla en staging, M3/M4, I-2, I-3, despliegues y merge del PR #34.

## 10. Rediseño del contador ante importaciones con números muy altos (versión 2, 22-11-2026)

### 10.1 Problema (H4)

`private.allocate_quote_number` acepta un número preferido (el emitido en el navegador) cuando está libre. Después hace `last_number = greatest(v_last, v_num)`, y las cotizaciones nuevas calculan `v_last + 1` en `integer`.

Con un número importado de 2.147.483.647 (el máximo de `INTEGER`):
- el contador queda en el máximo;
- la siguiente cotización falla por desbordamiento;
- borrar el trabajo no lo arregla, porque el contador nunca baja.

**Existe hoy**, solo con la ruta legítima de importación, y lo reproduce H4.

**Objetivos pedidos:**
1. no bloquear futuras cotizaciones;
2. numeración interna segura;
3. conservar el número emitido al cliente;
4. importación sin duplicados;
5. cotizaciones históricas intactas;
6. pruebas de los límites de `INTEGER`, concurrencia y reintentos.

### 10.2 Opciones

| Opción | Idea | Ventajas | Inconvenientes |
|---|---|---|---|
| **N1 (recomendada)** | **El contador avanza solo con los números que asigna él mismo.** Una importación con número libre lo conserva como interno y emitido (igual que hoy), **sin mover** el contador. Las cotizaciones nuevas siguen su secuencia y **saltan** los números ya usados como interno **o como emitido** | Cumple los 6 objetivos; cambio mínimo, solo una función; sin límite comercial; los números importados no se tocan | Cambia el comportamiento «la secuencia sigue después del número importado» (§10.4) |
| N2 | Mantener el salto, pero solo hasta un **tope** (por ejemplo, 1.000.000); por encima, el número importado queda como emitido con un interno del contador | Conserva el salto en casos normales | Exige elegir un **límite comercial**, algo que pediste no hacer en silencio; mezcla dos comportamientos |
| N3 | Separar **siempre** el interno del emitido en las importaciones: el interno sale del contador y el emitido se conserva | Interno siempre denso | Cambia también las importaciones con número libre (el interno deja de coincidir con el emitido) y obliga a más cambios en la app y en las pruebas |
| N4 | Pasar `number` y el contador a `bigint` | Aleja el límite | No evita el salto ni la secuencia «secuestrada» por un número importado; obliga a migrar columnas y tipos en la app; solo traslada el problema |

### 10.3 Propuesta N1

Archivo de diseño: `scripts/diseno/ensayo-52/contador-52.sql`. **No** es una migración.

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
create index if not exists jobs_owner_issued_idx on public.jobs (owner_id, issued_number);
```

**Cómo cumple cada objetivo:**

| Objetivo | Cómo |
|---|---|
| 1. No bloquear | Las importaciones no mueven el contador. Solo lo hacen las asignaciones propias, de a una. Agotar el rango exigiría 2.147.483.647 asignaciones en la misma cuenta, y aun así daría un error claro sin escribir nada (L9) |
| 2. Numeración interna segura | Unicidad `(owner_id, number)` como hasta ahora; el bloqueo `FOR UPDATE` serializa importaciones y guardados de la cuenta; aritmética en `bigint` |
| 3. Número emitido | La importación con número libre lo conserva como interno y emitido (L1). Con número ocupado, el emitido se conserva y el interno sale del contador (L5). Las cotizaciones nuevas **saltan** los números ya emitidos por otras, aunque su interno haya quedado libre (L7) |
| 4. Importación sin duplicados | Sin cambios en `create_job_with_quote`: la idempotencia por `local_id` y el manejo de importaciones simultáneas se conservan (L4 y L10) |
| 5. Históricos | No cambia ningún trabajo ni documento existente (L0). El contador nunca baja: los números borrados no se reutilizan en guardados nuevos (L8) |
| 6. Pruebas | L0–L10 (§10.6) |

**Contador nuevo:** empieza en 0. Con D-52-1, todo trabajo nace en esta función, que crea el contador antes del primer trabajo de la cuenta, y el bucle salta lo ocupado. Así ya no se copia un máximo inflado. La migración actual sí lo copiaba desde `max(number)`.

### 10.4 Cambio de comportamiento que debes aprobar

La migración de numeración (A-47, «decisiones menores» de docs/07) dice: «Un número local libre se conserva tal cual, así que la secuencia puede saltar hasta ese número». Con N1:
- **sigue igual:** el número local libre se conserva tal cual;
- **cambia:** la secuencia **ya no salta** hasta él. Las cotizaciones nuevas continúan su propia secuencia y lo saltan solo cuando llegan a él.

**Ejemplo:** el contador va en 12 y se importa una cotización con el N° 5000.
- Hoy, la siguiente cotización nueva sería la 5001.
- Con N1 sería la 13, luego la 14, y así hasta saltar la 5000.

**Comprobación afectada:** `scripts/verificar-numeracion.mjs` §5, «la secuencia sigue después del número importado (sin repetir)». Hoy espera `free + 1`. Habría que cambiarla por «la siguiente usa el contador y nunca repite un número interno ni emitido». El resto de sus 17 comprobaciones no cambia.

### 10.5 Verificación previa en staging (solo lectura, cuando se autorice)

```sql
-- ¿Contadores ya inflados por importaciones (bloqueados o a punto de estarlo)?
select count(*) from public.quote_counters where last_number >= 2000000000;
-- ¿Cuentas con trabajos y sin contador? (deberían ser 0)
select count(distinct owner_id) from public.jobs j
where not exists (select 1 from public.quote_counters c where c.owner_id = j.owner_id);
```

Si aparece algún contador inflado, no se repara en silencio: se informa y decides caso a caso (D-52-4b). Por ejemplo, bajar el contador al mayor número de la cuenta asignado antes del salto, con un registro de auditoría. Bajar el contador no puede duplicar números, porque el bucle salta los ocupados, pero sí podría reutilizar números de cotizaciones borradas.

### 10.6 Pruebas del rediseño (ensayo local, Claude, 22-11-2026)

Con `scripts/diseno/ensayo-52/ensayar.sh` sobre la propuesta de #52 (D-52-1), en PostgreSQL 16.15 local desechable:

| Prueba | Resultado |
|---|---|
| **H4** (con el contador actual) | Reproducido: tras importar el N° 2.147.483.647, la siguiente cotización da `integer out of range` |
| L0 | Trabajos y documentos existentes **idénticos** (huella) tras reemplazar la función |
| L1 | Importar el N° 2.147.483.647: se conserva el interno y el emitido, documento incluido; el contador **no salta**; la siguiente cotización es la N° 2 |
| L2 | 2.147.483.646 y 2.147.483.647 importados: la siguiente es la N° 3, sin duplicados |
| L3 | Emitido 2.147.483.648, `1e20` o −1: error limpio, nada escrito, contador sin mover; el reintento válido funciona |
| L4 | Importación repetida del máximo: `NULL`, una sola copia, contador igual |
| L5 | Importar un número ocupado (el máximo): interno del contador y documento con el emitido original |
| L6 | Guardado que falla **después** de asignar el número: sin hueco; el reintento recibe el número esperado |
| L7 | Número interno libre pero usado como **emitido** por otra importación: la cotización nueva lo salta |
| L8 | Tras borrar una cotización, la siguiente no reutiliza su número |
| L9 | Rango agotado (simulado con el contador en 2.147.483.645): la última asignación es la N° 2.147.483.647; la siguiente da un error claro sin escribir nada; una importación con número libre sigue funcionando |
| L10 | **Concurrencia y reintentos simultáneos:** 20 cotizaciones nuevas, 5 importaciones distintas con el mismo número libre y la misma importación enviada 5 veces a la vez. Resultado: 0 errores, sin duplicados, 1 sola copia del reintento, 1 sola importación con el interno 900000 (las otras 4 conservan ese emitido con un interno del contador), internos 5…28 correlativos y contador en 28 |
| **Total del ensayo** | **42/42** (también con B+) |

**Controles y mutaciones:**

| Control o mutación | Resultado |
|---|---|
| `CONTADOR=actual` (sin el rediseño) | **FALLA L1: el contador saltó a 2147483647** ✔ |
| El bucle no mira el número emitido | **FALLA L7: la cotización nueva repitió el N° 4 que el cliente ya vio** ✔ |
| La importación vuelve a mover el contador | **FALLA L1** ✔ |

Al terminar no quedó ninguna base de ensayo.

**Lo que no demuestra:**
- el comportamiento en Supabase real ni con los datos actuales de staging (§10.5);
- el rendimiento del bucle con miles de números importados contiguos. El salto recorre cada bloque ocupado **una vez**, porque el contador queda después del bloque, y usa índices; aun así, conviene medirlo en staging.

### 10.7 Qué se agregaría al plan de §8 (cuando lo autorices)

1. La misma migración de #52 incluiría la función N1 y el índice `jobs_owner_issued_idx`.
2. `verificar-numeracion.mjs` §5 se adaptaría (§10.4), y se agregarían comprobaciones de importación del máximo y de la siguiente cotización.
3. La verificación previa de §10.5 se sumaría a la de §8.
4. La reversión de la función sería volver a la definición de `20261118022422_numeracion_atomica.sql`. No borra datos, y los números ya asignados no cambian.

