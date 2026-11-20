# 22 · Diseño de integración: inventario y recursos en el cotizador (puerta P2)

**Versión 2 · 20-11-2026 · Estado: DISEÑO PROPUESTO, no autorizado.** Nada de este documento está implementado. Cada etapa requiere tu autorización por separado.

**Cambios respecto de la versión 1:** resuelve la [auditoría del diseño](https://github.com/ratatecuala/calculadora-de-costos-log/issues/53#issuecomment-7050466337) (2 P1 de diseño y 2 P2 de experiencia de usuario). La tabla del §8 resume cada uno.

**Base:**
- [docs/21](21-diseno-datos-cotizador.md): contratos (§3–§6), plan por puertas (§15) y fase 1 cerrada técnicamente (§17.7).
- Decisiones vigentes: A-47 (numeración e inmutabilidad), A-58 (ayudantes), A-61 (D-4 = b), A-62 (T-1 a T-6), A-64 (T-7), A-65 (T-8).

**No cambia:** el motor económico, las fórmulas, el IVA, Google Routes, Supabase, las migraciones, producción ni el PR #34.

## 0. Resumen

| Etapa | Qué hace | Migraciones | Cambia el costo | Requiere |
|---|---|---|---|---|
| **I-1 · Navegador** | Editores dentro de «Cotizar»; snapshot v2 **solo** si se guarda en el navegador; copia a la cuenta que separa lo copiable de lo diferido | **No** | **No** | Tu autorización de I-1 y de D-I1 a D-I7 |
| **I-1b · Recuperación del borrador** | Autoguardado del borrador sin emitir, con oferta de recuperarlo | No | No | **Obligatoria antes de encender la flag para transportistas reales** (§2.2) |
| **I-2 · Cuenta (nube)** | `create_job_with_quote_v2` y `job_cargo_items`; copia de v2 con líneas | **Sí (M3, M4)** | No | **#52 primero**, verificación de esquemas, respaldo real y autorización por migración (A-59) |
| **I-3 · Recursos en el costo** | Adaptador `costInputs`: ayudantes del detalle, minutos por parada y equipamiento | No | **Sí** | Aprobación de docs/21 §4.3–§4.4 y casos dorados nuevos |

Se mantiene el orden **I-1 → I-2 → I-3**. I-1b es parte de I-1: se programa junto con I-1 o inmediatamente después, pero siempre antes de mostrar la flag a usuarios.

## 1. Fuente única de cada costo: cómo se evita duplicar

**Regla:** cada concepto tiene **una sola** fuente que alimenta el motor. En I-1 esa fuente es **la misma de hoy**. Los editores nuevos describen, pero **no suman**.

| Concepto | Fuente del costo en I-1 (sin cambios) | Qué aporta el editor nuevo en I-1 | Control anti-duplicado | En I-3 (si se aprueba) |
|---|---|---|---|---|
| Ayudantes | «Ayudantes» × «Pago por ayudante» (`TripParams.helpers`, `helperFee`) | Detalle por ayudante, solo informativo | Si la cantidad o la suma del detalle difiere de los campos del costo: «El costo usa 2 × $15.000; tu detalle suma $36.000. **No se suma dos veces**: ajusta el costo si corresponde». Nunca se corrige solo | El detalle reemplaza los campos actuales mediante el adaptador; los campos antiguos se ocultan |
| Tiempo de carga y descarga | «Carga y descarga» (`loadMinutes`) | Minutos por origen y destino, informativos | Aviso si A + B difiere del campo del costo | `handlingTime` con la regla de completitud de docs/21 §4.4 |
| Equipamiento y embalaje | «Otros gastos» (`otherCosts`) | Líneas declaradas, informativas | «Si ya lo incluiste en Otros gastos, no lo repitas»; aviso si la suma del equipamiento supera «Otros gastos» | Líneas propias en el desglose |
| Inventario (peso, volumen) | — (no es costo) | Estimación de viajes como **cota inferior** | Nunca entra al precio | Solo con D-5, no autorizado |
| Frágil y manejo especial | — | Notas sin verificar (T-8) | Prohibido usarlos para costos o seguridad (A-65) | Sin cambios |

## 2. Conservación de los datos

### 2.1 Qué versión de snapshot se guarda (P1-1)

**Regla:** se escribe **v2 solo si se cumplen las dos condiciones**:
1. la flag `VITE_FF_INTEGRACION_CARGA` está encendida;
2. el repositorio **fijado para la escritura** (`repository.forWrite()`, sexta auditoría) es el del **navegador** (`kind === 'local'`).

En cualquier otro caso se escribe el **v1 exactamente como hoy**, aunque los editores tengan datos. En la cuenta nunca se escribe v2 antes de I-2.

**Cómo se implementa** (sin tocar la protección de cambio de cuenta):
- `saveQuote` ya obtiene `repo = await repository.forWrite()` antes de numerar. La decisión se toma **con ese mismo `repo`**: `snapshotVersionFor(flag, repo.kind)` devuelve `1 | 2`, y `build(number, version)` recibe la versión. No se mira la identidad de la pantalla ni otra referencia que pueda cambiar entre editar y guardar.
- `buildJobRecord(session, form, issuer, meta, { version })`:
  - **versión 1:** el mismo objeto que hoy, campo por campo;
  - **versión 2:** el snapshot v2 de §2.3.
- **Con cuenta**, los editores **no se muestran** en I-1 (D-I2), así que no hay detalle que perder. Si la identidad cambia mientras se cotiza, el borrador se reinicia con las reglas actuales (sexta auditoría). El formulario de la cotización solo se muestra a su dueño (`view.owner === currentOwner`).
- **Si la identidad cambia entre abrir el formulario y guardar**, el repositorio en la nube fijado por `forWrite()` rechaza la escritura (comportamiento actual). Si la escritura empezó en el navegador, sigue siendo v2 local; nunca se reinterpreta como nube.

**Pruebas obligatorias:**

| # | Caso | Resultado esperado |
|---|---|---|
| V1 | Navegador + flag encendida + editores con datos | Registro v2 válido con `snapshotV2Schema`; `cargoTotalsIssue` nulo |
| V2 | Cuenta + flag encendida | Registro **v1 idéntico** al de hoy (comparación profunda con la salida actual de `buildJobRecord`) |
| V3 | Cambio de identidad entre editar y guardar (navegador → cuenta y cuenta A → cuenta B) | Sin escritura en la otra cuenta; borrador reiniciado; nunca v2 en la nube |
| V4 | Flag apagada, navegador y cuenta | v1 idéntico en ambos (igual que hoy) |
| V5 | `snapshotVersionFor` | Tabla completa flag × tipo de repositorio |

### 2.2 Mientras se cotiza: borrador y recuperación (P2-A)

- **I-1 (solo pruebas internas, flag apagada para usuarios):**
  - el inventario y los recursos viven en la sesión (`QuoteSession`) **en memoria**, como hoy el resto del borrador;
  - se reinician al cerrar sesión o cambiar de cuenta.
  - **Advertencia explícita:** si se recarga o se cierra la pestaña antes de emitir, **el borrador se pierde**. Esto es aceptable solo para pruebas internas.
  - Recalcular la ruta o cambiar el vehículo no lo borra. Cambiar entre Rápido y Detallado no borra líneas (fase 1, P2-2).
- **I-1b (obligatorio antes de habilitar a transportistas):**
  - **Autoguardado:** guarda el borrador sin emitir en el navegador, con una clave propia `cotizador.borrador.v1`, separada del historial de cotizaciones emitidas.
  - **Una entrada por dueño:** solo para el modo sin cuenta en I-1; con cuenta, cuando llegue I-2.
  - **Contenido:** direcciones, parámetros, inventario y recursos, con su versión y fecha.
  - **Escritura:** se espera 1 segundo sin cambios antes de guardar. La validación es tolerante, porque un borrador puede estar incompleto. Si falla por cuota, aparece un aviso visible «no se pudo guardar el borrador» y **nunca** se escribe un historial a medias.
  - **Recuperación:** al volver, «Tienes un borrador sin emitir de hace 2 horas (12 objetos). ¿Recuperarlo?». **Recuperar** o **Descartar**: nunca se carga solo ni se mezcla con otra cotización.
  - **Se borra:** al emitir, al descartar o al cambiar de identidad. Un borrador de otra identidad nunca se ofrece.
  - **Pruebas:** recargar con 200 líneas y recuperar todo; cuota llena (aviso, sin corrupción); emitir borra el borrador; un borrador local no se ofrece con cuenta; un borrador ilegible se descarta con aviso.
- **No se confunde con lo emitido:** el historial de cotizaciones **emitidas** (`cotizador.trabajos.v1`) ya persiste hoy y sigue igual (§2.4).

### 2.3 Al emitir (snapshot v2, solo navegador)

- **Totales recalculados:** `cargo.totals` sale de `cargoSummary` sobre las líneas en ese instante y se verifica con `cargoTotalsIssue`.
- **Tiempos:** `cargo.handling` sale de `handlingTime` (los datos inválidos no suman).
- **Recursos:** `resources` se valida con el esquema completo (P2-A y P2-B de la fase 1).
- **Versión de fórmulas:** `formulaVersion` es igual a la versión del motor, porque las fórmulas no cambian.
- **Sin inventario ni recursos:** `cargo: null` y `resources: null`.
- **Datos inválidos, o «Rápido» con una lista sin decidir:** **no se emite** y se indica el campo (D-I3).
- **Tipos:** `JobRecord.internal` pasa a ser la unión versionada `SnapshotV1 | SnapshotV2`. El registro se valida con el esquema que corresponde al emitir y al copiar, **sin conversiones de tipo forzadas** que dejen pasar estructuras inválidas (sugerencia opcional de la auditoría).

### 2.4 Historial del navegador

- **Clave:** la misma `cotizador.trabajos.v1`, con la versión **por registro** (T-4). Los v1 existentes no se tocan.
- **Escritura:** todo o nada. Si el navegador está lleno, aparece el error existente y no queda una cotización a medias (L5).
- **Lectura:** siempre con `readSnapshot`. Un registro ilegible se muestra como hoy, con el aviso «no se pudo leer el detalle», y **nunca** se reescribe.

### 2.5 Copia del historial del navegador a la cuenta: v1 y v2 mezclados (P1-2)

**Problema actual:**
- `migrateLocalToCloud` copia **todas** las cotizaciones con `create_job_with_quote`, sin separarlas antes;
- marca el historial como copiado solo si `jobs.every(...)` está en la nube;
- y **reemplaza** el registro de lo copiado.

Con v2 con líneas en la mezcla, eso subiría cotizaciones sin su detalle o dejaría un aviso de pendientes que nunca se resuelve.

**Algoritmo nuevo** (I-1, sin migraciones; el resto del flujo actual se conserva):

1. **Clasificar ANTES de cualquier llamada a la base**, con `toCloudPayload` y sin modificar el registro local:

   | Clase | Condición | Destino en I-1 |
   |---|---|---|
   | `v1` | Sin `schemaVersion` y legible | **Elegible**: `create_job_with_quote` con el `internal` actual (idéntico a hoy, L1) |
   | `v2-resumen` | v2 válido, sin líneas (`cargo: null` o lista vacía) y con el `internal` bajo el tope de 11.000 bytes medido en **bytes UTF-8** | **Elegible**: misma función v1, con el `internal` v2 resumido |
   | `v2-con-lineas` | v2 válido con al menos una línea | **Diferida**: «la cuenta aún no puede guardar el detalle de carga» |
   | `ilegible` | `toCloudPayload` devuelve `ok: false` (malformado, inventario incompleto, sobre el tope) | **Diferida** con el motivo; nunca se sube |

2. **Copiar solo las elegibles**, una por una, con `ensureSameUser()` antes de cada llamada, como hoy. La idempotencia por `local_id` no cambia: un reintento devuelve `NULL` y no duplica ni gasta número.
3. **Fallo a mitad de la copia:**
   - se detiene y se informa cuántas se copiaron;
   - **no** se marca nada como completo;
   - el reintento vuelve a intentar todas las elegibles sin duplicar.
4. **Verificar solo las elegibles** contra la nube (`local_id`).
5. **Registro de avance por identificador:** el registro por usuario guarda, **sumándolos a lo anterior**:
   - `jobs`: identificadores verificados en la nube;
   - `deferred`: identificadores diferidos, con su clase y su motivo.

   Una diferida **nunca** se registra como copiada. Si la identidad cambió, no se escribe nada, como hoy.
6. **Pendientes y avisos:**
   - `pendingLocalData` devuelve `{ jobs: elegibles sin copiar, deferred: diferidas, vehicles }`;
   - el botón «Copiar a mi cuenta» solo aparece si hay **elegibles** pendientes o vehículos;
   - las diferidas se informan con una nota que **no** es un botón y no se repite como pendiente: «3 cotizaciones con detalle de carga quedan en este navegador; se podrán copiar cuando la cuenta lo permita (I-2)».
7. **Mensaje final, nunca un éxito engañoso:** «Se copiaron 5 cotizaciones (2 ya estaban). 3 quedan en este navegador porque tienen detalle de carga». Si hubo diferidas, el mensaje **siempre** las menciona y las muestra con su número de cotización.
8. **En I-2:** las `v2-con-lineas` pasan a ser elegibles con `create_job_with_quote_v2` y salen de `deferred` al verificarse.

**Pruebas obligatorias:**

| # | Caso | Resultado esperado |
|---|---|---|
| M1 | Solo v1 (el caso de hoy) | Mismo resultado y mismas llamadas que el código actual |
| M2 | Mezcla: 3 v1 + 1 v2-resumen + 2 v2-con-lineas | Se copian 4; quedan 2 diferidas con su número; el mensaje las menciona; el registro tiene 4 copiadas y 2 diferidas |
| M3 | Reintento después de M2 | 0 nuevas, 4 «ya estaban», sin duplicados; el aviso de copia no reaparece por las diferidas |
| M4 | Fallo de red en la 3.ª elegible | Se informan 2 copiadas; nada marcado como completo; el reintento termina sin duplicados |
| M5 | Cambio de identidad a mitad de la copia | Se detiene; no se escribe el registro; nada se graba en la otra cuenta |
| M6 | v2 con inventario incompleto o malformado | `ilegible`, diferida con motivo, nunca se llama a la base con ella |
| M7 | v2-resumen al límite de bytes (con caracteres multibyte) | Se mide en bytes UTF-8; sobre el tope → diferida |
| M8 | Registro anterior en el formato actual | Se lee y se completa; no se pierde lo ya copiado |
| M9 | Ningún registro local cambia | Comparación profunda del historial antes y después |

## 3. Texto visible para el cliente: «Servicio» e «Incluye» (P2-B)

**Hoy** (flag apagada, y así se mantiene): el formulario precarga «Incluye» con «Carga y descarga, N ayudante(s)» a partir del campo de costo `params.helpers`. Ese texto **sí llega al cliente** (PDF, enlace y WhatsApp).

**Aclaración:** «sin ayudantes en el texto sugerido» (fase 1, P1-3) se refiere **solo** a `suggestServiceText`, la sugerencia para «Servicio». **No** significa que nunca se informen ayudantes en ningún campo público. Anunciar ayudantes en «Incluye» es una **decisión comercial del transportista**.

**Diseño I-1 con la flag encendida (D-I5):**
- **«Servicio»:** queda como hoy; un botón **voluntario** «Usar texto sugerido» lo reemplaza solo si el usuario lo pulsa. La sugerencia nunca menciona ayudantes, montos, tiempos, pesos ni volúmenes.
- **«Incluye»:**
  - una **casilla explícita** «Indicar al cliente la cantidad de ayudantes», marcada si `params.helpers > 0` (el mismo valor predeterminado de hoy);
  - con la casilla marcada, el texto es el mismo de hoy; desmarcada, queda «Carga y descarga»;
  - el número **siempre** sale del campo de costo («Ayudantes»), **nunca** del detalle interno del editor de recursos;
  - el usuario puede seguir editando el texto a mano.
- **Flag apagada:** el formulario es **idéntico** al de hoy, sin casilla.

**Pruebas obligatorias:**
- **X1:** con la flag apagada, `includes` es idéntico al de hoy con 0, 1 y 3 ayudantes.
- **X2:** con la flag encendida, la casilla marcada produce el texto de hoy y desmarcada produce «Carga y descarga».
- **X3:** con un detalle de 5 ayudantes y el campo de costo en 2, «Incluye» dice 2.
- **X4:** el botón de sugerencia nunca pisa un texto sin la acción del usuario.
- **X5:** S1 (la sugerencia no menciona ayudantes) sigue vigente.

## 4. Protección de las cotizaciones históricas

| Riesgo | Protección | Prueba |
|---|---|---|
| Recalcular o reinterpretar una v1 | `readSnapshot` lee v1 tal cual, sin reinterpretar «carga y descarga 0» | C2 y H4 (existen) |
| Reescribir una v1 al leerla o copiarla | Ninguna lectura escribe; la copia usa `toCloudPayload`, idéntico para v1 | C2, L1, M1, M9 |
| Convertir ayudantes v1 recortando | `helpersFromV1` rechaza con motivo; el dato v1 queda intacto | Fase 1, P1-1 |
| Cambiar el PDF, el enlace o WhatsApp de una v1 | Lista blanca `CLIENT_QUOTE_KEYS` sin cambios; el inventario no va al PDF (D-I7) | Lista blanca + fixtures v1 |
| Cambiar números internos o emitidos | Sin cambios en la numeración (A-47) | T8, T12 y T14 de los borradores; `verificar-numeracion.mjs` cuando haya I-2 |
| Datos internos al cliente | §3: sugerencia voluntaria sin ayudantes; «Incluye» con casilla explícita | S1, X1–X5 |
| Escribir v2 en la cuenta antes de I-2 | §2.1: v2 solo con repositorio local | V2, V3 |
| Subir una v2 sin sus líneas | §2.5: clasificación previa, diferidas | M2, M6 |
| Cotizaciones en la nube con `internal` v2 resumido | `mappers.ts` aceptará v1 y v2 resumido sin exigir líneas (tarea 9) | Mapeo de ambos formatos |

## 5. Tareas por etapa

### 5.1 I-1 · sin migraciones (no depende de #52)

| # | Tarea | Archivos | Pruebas |
|---|---|---|---|
| 1 | Ranuras de inventario y recursos en la sesión, con reinicio por identidad | `session.ts` | Borrador por dueño; recalcular no borra |
| 2 | Editores plegables en «Cotizar», cerrados por defecto, **solo sin cuenta** y con la flag | `Calculator.tsx`, componentes de la fase 1 | e2e teléfono y PC; costo idéntico con y sin datos |
| 3 | Avisos anti-duplicado (§1) | `Calculator.tsx`, `modules/estado.ts` | Unitarias; ningún valor se corrige solo |
| 4 | «Servicio» con botón voluntario e «Incluye» con casilla (§3) | `QuoteForm.tsx` | X1–X5 |
| 5 | Versión de snapshot según flag y `forWrite().kind` (§2.1) | `saveQuote.ts`, `jobs.ts`, `clientQuote.ts` (tipo versionado) | V1–V5 |
| 6 | Registro v2 al emitir, con bloqueo por datos inválidos (§2.3) | `jobs.ts` | v2 válido; v1 idéntico; bloqueo |
| 7 | Historial local v2 todo o nada; error de cuota | `storage.ts` | L5; lectura mixta v1/v2 |
| 8 | Resumen de la carga en la vista y el historial (interno); v1 igual | `QuoteView.tsx`, `History.tsx` | Fixtures v1 sin cambios visibles |
| 9 | Lector de la nube tolerante a v2 resumido | `cloud/mappers.ts` | Mapeo v1 y v2 |
| 10 | Copia mixta v1/v2 con clasificación previa y diferidas (§2.5) | `cloud/migration.ts`, `App.tsx` (aviso) | M1–M9 |
| 11 | **I-1b:** autoguardado y recuperación del borrador (§2.2) | `session.ts`, módulo nuevo `draftStore.ts` | Recarga con 200 líneas, cuota, identidad |
| 12 | Regresión completa | — | `npm test`, casos dorados 64/64, e2e de cotizar existentes y e2e de módulos |

- **Responsable único** de `session.ts`, `Calculator.tsx`, `jobs.ts`, `saveQuote.ts` y `migration.ts`.
- **Reversión:** apagar la flag. Los v2 ya guardados en el navegador se siguen leyendo con `readSnapshot`, y la copia a la cuenta los sigue difiriendo.

### 5.2 I-2 · requiere migraciones (**primero #52**)

1. **#52:** impedir el `INSERT` directo en `jobs` (v1 como `SECURITY DEFINER`, `search_path` vacío y `REVOKE INSERT`). Requiere diseño, ensayo local, auditoría específica de privilegios, identidad e invariantes, y tu autorización.
2. **Verificación previa** (docs/21 §8): esquemas expuestos sin `private`, respaldo real y autorización individual de M3 y de M4.
3. **M3 y M4**, desde los borradores ya probados (18/18 y C3 27/27) y ajustadas a lo que resulte de #52.
4. **Cliente:**
   - `cloud/quotes.ts` llama a la v2;
   - `migration.ts` convierte las `v2-con-lineas` diferidas en elegibles;
   - se leen las líneas de la nube;
   - los editores se habilitan con cuenta y la recuperación del borrador se extiende a la cuenta.
5. **Pruebas:** T1–T15 en staging de prueba con usuarios ficticios, L1–L6, M1–M9 adaptadas y e2e con cuentas A y B.

**Por qué #52 va primero:** M4 se apoya en la v1. Si #52 la cambia a `SECURITY DEFINER`, la v2 y la función privada deben ajustarse a ese modelo.

### 5.3 I-3 · recursos en el costo (requiere aprobar fórmulas)

- **Adaptador `src/shared/costInputs.ts`** (docs/21 §4.3–§4.4): ayudantes desde el detalle («servicio» igual a la v1), minutos por parada con completitud y equipamiento como líneas.
- **Requisitos:**
  - casos dorados nuevos (H1–H3) y los 64 actuales iguales;
  - comparación de rutas «no concluyente» si depende del tiempo faltante;
  - más de 24 h según T-7 (docs/21 §4.5), si se autoriza.
- Los campos antiguos del cotizador se retiran **en la misma entrega**, para que nunca haya dos entradas para el mismo costo.

## 6. Decisiones D-I1 a D-I7 consolidadas

| ID | Decisión | Propuesta consolidada (v2) | Dictamen de la auditoría |
|---|---|---|---|
| **D-I1** | Fuente del costo en I-1 | Los campos actuales del cotizador son la **única** fuente; los editores son informativos, con avisos anti-duplicado | Aceptar |
| **D-I2** | Alcance de I-1 | **Solo sin cuenta.** v2 únicamente con flag **y** `forWrite().kind === 'local'`; con cuenta, v1 idéntico y sin editores. Las cotizaciones locales con detalle se informan como «no sincronizadas» en la copia a la cuenta (§2.5) | Aceptar con la delimitación del P1-1 |
| **D-I3** | Emitir con datos inválidos | **Bloquear** y mostrar el campo (incluido «Rápido» con una lista sin decidir) | Aceptar |
| **D-I4** | Borrador antes de emitir | En memoria **solo para pruebas internas**. **I-1b** (autoguardado y recuperación) es obligatorio antes de encender la flag para transportistas | Aceptar solo como prototipo |
| **D-I5** | Texto visible para el cliente | «Servicio»: botón voluntario, sugerencia sin ayudantes. «Incluye»: casilla explícita «Indicar al cliente la cantidad de ayudantes», con el valor predeterminado de hoy y el número tomado del campo de costo. Flag apagada: idéntico a hoy | Aceptar con la aclaración del P2-B |
| **D-I6** | Flag | `VITE_FF_INTEGRACION_CARGA`, nueva, apagada por defecto, independiente de la vista previa; encenderla en staging requiere tu autorización | Aceptar |
| **D-I7** | Inventario en el PDF, el enlace o WhatsApp | **No** durante I-1; la lista blanca queda intacta | Aceptar |

**Otras autorizaciones, por separado:** I-1 (incluida I-1b); #52; M3; M4; docs/21 §4.3–§4.4 y T-7 para I-3.

## 7. Pruebas que garantizarán la compatibilidad (consolidado)

| Grupo | Pruebas | Qué garantizan |
|---|---|---|
| Costos | Casos dorados **64/64**; igualdad de `computation('habitual')` con editores vacíos y llenos; prueba estática: el motor no importa los módulos nuevos | El resultado económico no cambia |
| Versión del snapshot | V1–V5 | v2 solo en el navegador con la flag; v1 idéntico en los demás casos |
| Emisión | v2 válido con el esquema; `cargoTotalsIssue` nulo; bloqueo con inválidos o con «Rápido» con lista | No se emite un snapshot inconsistente |
| Históricas | C2, H4, L1 y fixtures v1; lista blanca del PDF, el enlace y WhatsApp | Lo emitido antes no cambia |
| Historial local | L5 (cuota), lectura mixta v1/v2, escritura todo o nada | Nada queda a medias |
| Copia a la cuenta | M1–M9 | Ni pérdida de líneas, ni falso éxito, ni duplicados, ni datos en otra cuenta |
| Texto para el cliente | S1, X1–X5 | Sin datos internos, salvo la decisión explícita en «Incluye» |
| Borrador (I-1b) | Recarga con 200 líneas, cuota, emitir borra, identidad | El trabajo sin emitir no se pierde |
| Interfaz | e2e de cotizar existentes (sin cuenta y con cuentas A y B) + e2e de módulos en Pixel 7, iPhone 13, 1366 y 1440 | Teléfono y PC sin regresiones |
| Mutaciones | Reintroducir cada defecto (v2 en la nube, subida de v2 con líneas, éxito global con diferidas, ayudantes del detalle en «Incluye») debe hacer fallar las pruebas | Los errores corregidos no reaparecen sin aviso |

## 8. Respuesta a la auditoría del diseño (versión 1)

| Hallazgo | Corrección en esta versión |
|---|---|
| **P1-1** La flag no estaba delimitada por tipo de repositorio | §2.1: v2 solo con flag **y** `forWrite().kind === 'local'`; con cuenta, v1 idéntico. Pruebas V1–V5 |
| **P1-2** Copia mixta v1/v2 sin algoritmo | §2.5: clasificación previa, elegibles y diferidas, verificación solo de elegibles, registro acumulativo por identificador, mensajes sin falso éxito. Pruebas M1–M9 |
| **P2-A** Borrador solo en memoria | §2.2: advertencia explícita (pruebas internas) e **I-1b** obligatorio antes de habilitar a usuarios |
| **P2-B** «Incluye» anuncia ayudantes | §3: aclaración del alcance de P1-3; casilla explícita con el valor de hoy y el número tomado del campo de costo; flag apagada idéntica. Pruebas X1–X5 |
| Opcional: tipos y tamaño | §2.3: `internal` como unión versionada sin conversiones forzadas, con validación al emitir y al copiar; §2.5: tamaño en bytes UTF-8, incluido `cargo: null` (M7) |

## 9. Lo que este diseño NO hace

No implementa la integración, no modifica el motor ni las fórmulas, no toca el guardado actual, Supabase ni las migraciones, no cambia el IVA, no activa Google Routes, no habilita formularios públicos (docs/21 §18), no despliega y no fusiona el PR #34.
