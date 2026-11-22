# 23 · Revisión técnica de #52: INSERT directo en `jobs` y documentos emitidos

**Versión 1 · 21-11-2026 · Estado: PROPUESTA para tu revisión.** Autorizada **solo** como análisis documental (A-69, [registro en #43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7071050495)).

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
| **Gravedad** | **Media-alta para A-47.** Además de lo descrito en #52, el ensayo encontró un hueco **más grave**: un documento ya emitido se puede **reemplazar** borrándolo e insertándolo de nuevo (H3) |
| **Propuesta** | La función de guardado pasa a `SECURITY DEFINER`. Se revocan `INSERT` en `jobs` e `INSERT`/`DELETE` en `client_quotes`, y se quitan las políticas que ya no corresponden. Opcionalmente (B+), `authenticated` pierde el acceso al esquema `private` |
| **Impacto en la app** | **Ninguno.** La app ya escribe solo mediante `create_job_with_quote` y solo actualiza `status` y `payment` |
| **Ensayo local** | Huecos H1–H3 reproducidos. Con la propuesta: **31/31** (S0–S8 y las pruebas de M3/M4 con la T6c reescrita). Variante B+: 31/31. Controles negativos C1, C3 y C4 fallan como corresponde; C2 confirma que basta revocar el `GRANT` |
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

Ninguno cruza cuentas: RLS por dueño sigue funcionando (verificado también en S5).

**Matiz honesto:** dos de los efectos de H1 y H2 también son posibles **por diseño** con la ruta de importación de la función, y #52 no los cambia (§9, R1):
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

Reduce la superficie: aunque un día se expusiera `private` por error en la Data API, `authenticated` no podría ejecutar nada de allí. Ensayada: **31/31**.

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
4. **Oportunidad (decisión D-52-3):** si M4 (`create_job_with_quote_v2`) también fuera DEFINER, se podría revocar a `authenticated` el `EXECUTE` sobre `private.insert_cargo_items`. Así, «solo M4 puede llamarla» pasaría a ser cierto a nivel SQL, y desaparecería el supuesto de seguridad P2-1 de docs/21 §8. Ensayado con B+: 31/31.
   - **Salvedad:** con B+, T6c-2 pasa porque falta el permiso, no por la marca. Para seguir probando la marca habría que ejecutarla con un rol de prueba que sí tenga `EXECUTE`.
5. **Para revisar al aprobar M4 (fuera de #52):** la v1 acepta cualquier `internal`, incluido un resumen v2. Es correcto para la copia mixta de I-1, porque los v2 con líneas quedan diferidos. Cuando exista la v2 con líneas, conviene decidir si la v1 debe rechazar un `internal` que declare líneas, para que «v2 con líneas» pase siempre por M4.

## 6. Ensayo local: resultados (Claude, 21-11-2026)

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
| Fase 1: huecos | **H1, H2 y H3 reproducidos** (§3) |
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
| **Total** | **31/31 OK**; también **31/31** con `BMAS=1` |

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
| R1 | La ruta de **importación** de la función acepta un número emitido elegido por el cliente. Si está libre, la secuencia salta hasta él; si está ocupado, el documento repite el número emitido (con un interno nuevo) | **Por diseño** (A-47, «decisiones menores» de docs/07) | Mantener (D-52-4). Para limitarlo habría que verificar en el servidor el historial local, algo que no es posible |
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

## 9. Decisiones para tu aprobación

| ID | Decisión | Recomendación |
|---|---|---|
| **D-52-1** | Opción A: la función de guardado como `SECURITY DEFINER`; revocar `INSERT` en `jobs` e `INSERT`/`DELETE` en `client_quotes`; quitar las políticas sobrantes | **Aprobar** |
| **D-52-2** | Variante B+: `authenticated` sin acceso al esquema `private` | **Aprobar** (ensayada, 31/31) |
| **D-52-3** | Cuando se autorice M4: la v2 como `SECURITY DEFINER` y sin `EXECUTE` de `authenticated` sobre `private.insert_cargo_items` | **Aprobar en principio**; se decide junto con M3/M4 |
| **D-52-4** | Ruta de importación con número emitido elegido por el cliente (R1) | **Mantener**, como hoy (A-47) |
| **D-52-5** | `DELETE` del trabajo completo por el dueño (R2) | **Mantener** por ahora; evaluar «anular» más adelante |

**Lo que sigue sin autorización:** implementar #52, crear la migración, ejecutarla en staging, M3/M4, I-2, I-3, despliegues y merge del PR #34.
