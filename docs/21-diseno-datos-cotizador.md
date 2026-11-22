# 21 · Diseño técnico de datos del cotizador ampliado (#45)

**Versión 3 · 20-11-2026.**
> **Estado vigente (sincronizado el 20-11-2026, hasta `2f8e112`):** diseño **aprobado** (A-61, A-62). **Fase 0 cerrada** (A-63, §16). **Fase 1 cerrada técnicamente** (A-66, §17.7). **Integración I-1 + I-1b implementada y cerrada técnicamente** detrás de la flag apagada (A-67, A-68; [22 §14](22-diseno-integracion-cotizador.md)). D-I8 parcial implementada el 21-11 (A-69, [22 §15](22-diseno-integracion-cotizador.md)). Pendientes de tu decisión: D-2b, D-5, D-7 y D-10. **No autorizados:** encender las flags, la puerta P3 (M3/M4, después de #52), la P4 (I-3, recursos en el costo), despliegues, Google Routes, IVA y merge del PR #34.
>
> *Estado al publicar la versión 3 (histórico): DISEÑO; pendiente de tus decisiones (§12) y de autorizar la fase 0.*

- La versión 2 corrigió los 5 P1 y los 3 P2 de la [auditoría sobre `cba6ffb`](https://github.com/ratatecuala/calculadora-de-costos-log/issues/45#issuecomment-7042277474) (§13.1).
- La versión 3 corrige los 5 P2 de la [reauditoría (0 P0, 0 P1)](https://github.com/ratatecuala/calculadora-de-costos-log/issues/45#issuecomment-7044566908) (§13.2) y agrega el plan de implementación de inventario y recursos (§15).
- **Fase 1 (A-66, 20-11-2026):** editores y funciones puras de inventario (#47) y recursos (#51), detrás de una feature flag **desactivada** y sin conexión al cotizador (§17). T-7 y T-8 decididas (A-64, A-65).
- **Aprobado (20-11-2026):** D-4 = (b) y T-1 a T-6 (A-61, A-62) y **solo la fase 0** (A-63). La fase 0 está implementada (§16) y corregida según la [auditoría de ChatGPT](https://github.com/ratatecuala/calculadora-de-costos-log/issues/45#issuecomment-7045276976) (§13.3); la fase 1 **no** estaba autorizada en ese momento (la autorizó A-66).
**Autorización:** [ratificación en #43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7041864905) (A-55 a A-60) y [aprobación del 20-11 registrada en #43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7044997471) (A-61 a A-63). **Siguen sin aprobar** D-2b, D-5, D-7 y D-10.
**Al publicar la versión 3 no había** interfaz nueva, integración al cotizador, migraciones en Supabase, cambios en el motor ni datos importados; solo los contratos de la fase 0 (§16). **Hoy** existen los editores de la fase 1 (§17) y la integración I-1 + I-1b ([22 §10](22-diseno-integracion-cotizador.md)), ambos detrás de flags **apagadas**. Siguen sin existir migraciones nuevas en Supabase, cambios en el motor y datos importados.
**Ensayos:** los borradores SQL y las mediciones se ejecutaron en un PostgreSQL 16 **local y desechable**, con las 3 migraciones reales del repositorio (§11).

## 0. Resumen

- **Cuatro módulos independientes con contrato fijo:**
  - inventario (#47);
  - recursos (#51);
  - vehículos y catálogo (#46);
  - costo según carga (#48), bloqueado hasta D-5.
- **El motor no cambia.** Los módulos nuevos solo **informan**, salvo dos ajustes que necesitarán tu aprobación al programarse (§4.3):
  - la modalidad de ayudantes por hora;
  - la marca de tiempo de carga incompleto.
- **Límite de 16 KB (§7, con inserciones reales):**
  - con los datos de ejemplo, el snapshot con las líneas adentro admite **unas 47 líneas**; una casa de 80 se rechaza. Es una observación con esas fixtures, **no un límite fijo**: depende del largo de los textos y de los campos llenos;
  - con la opción (b), el snapshot guarda solo un resumen de ~2,5 KB, incluso con 200 líneas.
  - Recomendación para **D-4** (pendiente): opción **(b)**.
- **Inmutabilidad probada (§8.1):** en la nube, el dueño **solo puede leer** las líneas. Se escriben una sola vez, en la misma transacción que crea la cotización, protegidas por cuatro capas comprobadas con pruebas y controles negativos.
- **Numeración e idempotencia sin cambios (§8.2):** el guardado v2 **reutiliza** la función actual.
- **Persistencia local definida (§6.3):** el navegador guarda la lista completa y la transfiere íntegra al copiarla a la cuenta.
- **Cotizaciones históricas intactas** (§6.2): no se recalculan, no se reescriben y se leen como versión 1.

## 1. Principios de arquitectura

1. **Módulos con contrato fijo:** tipos, esquema Zod y funciones puras de resumen. Ningún módulo importa la interfaz de otro.
2. **El motor (`src/engine`) no cambia.** El adaptador `src/shared/costInputs.ts` traduce los módulos a las entradas del motor. Todo efecto nuevo en el costo requiere aprobación (D-5, o §4.3 para los dos ajustes de completitud y ayudantes).
3. **null ≠ 0 (A-18).** Lo desconocido es `null` y nunca se presenta un costo como completo si falta un dato que lo afecta (§4.4).
4. **Snapshot inmutable por cotización** (A-47), en la nube y en el navegador.
5. **Cambios aditivos en Supabase.** Una migración por cambio, con autorización individual y respaldo previo (A-59).
6. **Paridad teléfono y PC (A-49).**

## 2. Mapa de módulos y contratos

| Módulo | Archivos del contrato (fase 0) | Funciones puras |
|---|---|---|
| Inventario | `src/shared/cargo.ts` | `cargoSummary(inv)`, `capacityEstimate(summary, vehicle)`, `suggestServiceText(inv, res)` |
| Recursos | `src/shared/resources.ts` | `resourcesSummary(res)`, `helperCostLines(res)`, `handlingTime(res)` |
| Vehículos | `src/shared/vehicleCatalog.ts` | `isCatalogFuel(f)`, `copyFromCatalog(entry)` |
| Snapshot | `src/shared/snapshot.ts` | `readSnapshot(raw)` (v1 o v2 → v2 normalizado), `toCloudPayload(local)` (§6.3) |
| Costo (bloqueado) | `src/shared/costInputs.ts` | `toEngineInputs(...)` (§4.3–§4.4) |

**Firmas:**

| Función | Firma | Nota |
|---|---|---|
| `capacityEstimate` | `→ { minTrips: number, basis: 'peso' \| 'volumen', incomplete: boolean } \| { minTrips: null, reason: string }` | Solo aviso: cota inferior, nunca tarifa ni garantía |
| `handlingTime` | `→ { minutes: number \| null, complete: boolean, missingStops: ('A' \| 'B')[] }` | §4.4 |
| `suggestServiceText` | `→ string ≤ 300` | Sin pesos, volúmenes, montos ni tiempos (§6.4) |

## 3. Inventario (carril 1, #47)

### 3.1 `CargoItem` (sin `id`: la posición es el orden de la lista)

| Campo | Tipo y límites |
|---|---|
| `kind` | texto 1–30 (lista abierta sugerida: `refrigerador`, `lavadora`, `sofa`, `cama`, `cajas`, `otro`) |
| `description` | texto 1–80, obligatorio |
| `qty` | entero 1–999 (por defecto 1) |
| `unitWeightKg` | número > 0 y ≤ 5.000, o `null` |
| `dimsCm` | `{ l, w, h }`, cada uno **entero** 1–2.000 cm, o `null` (las tres o ninguna) |
| `volumeM3` + `volumeSource` | número > 0 y ≤ 100 con `'calculado' \| 'declarado'`, o ambos `null` |

**Volumen calculado (P2-4):** si `volumeSource = 'calculado'`, deben existir las tres dimensiones y `volumeM3 = Math.round(l × w × h / 1000) / 1000` (m³ con 3 decimales: `l × w × h` es un entero de cm³, así que `l × w × h / 1000` tiene a lo sumo 3 decimales y `Math.round` redondea la mitad hacia arriba, igual que `round()` de PostgreSQL con positivos; verificado en una muestra amplia contra aritmética entera). La interfaz **recalcula** el volumen cada vez que cambia una dimensión; el esquema Zod **valida** la igualdad; y el servidor tiene la misma regla como `CHECK` (`round(l*w*h/1e6, 3)`), probada en T15. Si el usuario quiere otro valor, lo marca como `declarado`.
| `fragile` | booleano (por defecto `false`) |
| `handling` | `'normal' \| 'pesado' \| 'voluminoso' \| 'requiere2'` (por defecto `normal`) |

**Significado de los valores por defecto (P2 de la auditoría de la fase 0):** `fragile: false` significa «**no marcado** como frágil» y `handling: 'normal'` significa «**sin manejo especial declarado**». No significan que se haya verificado. Por eso **no se usan para seguridad ni para costos**, y la interfaz los rotulará así. Usar `null` para «desconocido» exigiría cambiar también M3: queda como **T-8** (§12).

`CargoInventory = { mode: 'rapido' | 'detallado', summary: texto ≤ 200, items: CargoItem[] }`

**Tope T-1 (pendiente; recomendado 200 líneas):** se exige en **tres lugares**:
1. el esquema Zod, usado en la interfaz y en el almacenamiento local;
2. la función de guardado del servidor (`create_job_with_quote_v2`, error 22023);
3. la función privada de inserción.

### 3.2 Totales y estimación de capacidad

- **Totales:** se suman solo las líneas con dato y se informa la completitud (`linesWithWeight / lines`). Si falta alguna, se muestra «al menos X kg».
- **`capacityEstimate`:** la cantidad de viajes es una **cota inferior**. Siempre se muestra con el aviso «no garantiza que la carga quepa (forma, acomodo, puertas)».
- **Sin datos del vehículo:** si falta la carga útil o el volumen, `minTrips: null` y se explica el motivo.
- **No** modifica el precio. **No** hay plantillas con pesos precargados: solo con fuente (C-2).

## 4. Recursos (carril 2, #51)

### 4.1 Esquema

| Bloque | Campos |
|---|---|
| `stops[]` (A y B; T-3) | `role`, `floor: −5..60 \| null`, `elevator: 'si' \| 'no' \| 'noCabe' \| null`, `stairs: boolean \| null`, `carryMeters: 0..1.000 \| null`, `access: texto ≤ 120`, `loadMinutes: 0..1.440 \| null` |
| `helpers[]` | `id` (uuid), `mode: 'servicio' \| 'hora'`; servicio: `feeService`; hora: `ratePerHour`, `paidSegments: ('manipulacion' \| 'traslado')[]` y `hours: número \| null` |
| `equipment[]` | `label: texto ≤ 60`, `amount: CLP ≥ 0 \| null` |

**Límites técnicos fijados en la fase 0** (revisables; no son reglas de negocio): montos en pesos **enteros** entre 0 y 9.999.999.999 (el tope de `jobs.net_price`); `hours` > 0 y ≤ 24; `paidSegments` con al menos un tramo y sin repetir; hasta 20 ayudantes y 20 elementos de equipamiento; `id` del ayudante en formato UUID y sin repetir; minutos y pisos enteros.

### 4.2 Sin doble contabilización (A-58)

1. **Una modalidad por ayudante:** el esquema rechaza campos de la otra modalidad.
2. **Modalidad por hora:** `hours` lo declara el transportista. Si falta, ese ayudante tiene costo `null` (faltante), nunca 0.
3. **Las horas de los ayudantes no se suman** al tiempo del transportista. Ese tiempo es conducción más carga y descarga, y alimenta gastos fijos y meta por hora, igual que hoy.
4. **El equipamiento** se suma como líneas declaradas, sin porcentajes.

### 4.3 Compatibilidad con el motor

| Situación | Entrada al motor | ¿Cambia el resultado actual? |
|---|---|---|
| Ayudantes v1 (cantidad × monto) | Se convierten en N ayudantes «servicio» con el mismo monto | **No**: casos dorados 64/64 |
| Todos los ayudantes «servicio» | Ítem «Ayudantes» = Σ montos | No (equivale a la v1) |
| Algún ayudante «hora» | Ítem «Ayudantes» = Σ líneas, `null` si alguna falta | Sí: **requiere aprobación para programarlo** (A-58 aprobó la planificación, no el código) |
| Tiempo de carga incompleto | §4.4 | Sí, solo en la completitud: **requiere aprobación** |

### 4.4 Tiempo de carga y descarga incompleto (P1-5)

**Problema:**
- Hoy `TripParams.loadMinutes` es un número obligatorio y la interfaz convierte el campo vacío en 0 (`v ?? 0`). Es una brecha ya registrada en docs/15.
- Si se sumaran solo los minutos de una parada conocida, los gastos fijos (CF) y la meta (R) parecerían completos sin estarlo.

**Contrato propuesto:**
1. `handlingTime(res)` devuelve `{ minutes, complete, missingStops }`, donde `minutes` suma solo las paradas con dato.
2. Si `complete === false`, el adaptador entrega al motor:
   - los minutos conocidos, que son una **cota inferior válida**, porque los minutos faltantes solo agregan costo;
   - **dos partidas faltantes** (`amount: null`): `tiempoCargaPendiente` en la categoría `fijo` y otra igual en `remuneracion`.
3. El motor actual ya trata `null` como faltante: CF, R y el costo pasan a **cota inferior** y el precio sugerido se rotula «al menos». **No se cambian fórmulas ni el código del motor.**
4. **Interfaz:**
   - muestra «Costo parcial: falta el tiempo de carga en B»;
   - la cotización se puede emitir como **indicativa**;
   - «lo que te queda» y la rentabilidad se rotulan como máximo (cota superior), como hoy con cualquier faltante.
5. **La comparación de rutas** (`session.ts`, horas por ruta) usa el mismo `handlingTime`. Con tiempo incompleto, la comparación queda «no concluyente» si el resultado depende de ese tiempo.
6. **Cotizaciones v1:** se leen como estaban, con 0 cuando no se declaró. **No se reinterpretan.**

### 4.5 Trabajos de más de 24 horas (T-7, A-64: DISEÑO, no implementado)

**Hoy (límite provisional conservado):** un ayudante por hora admite hasta 24 h y cada parada hasta 1.440 minutos. Un valor mayor se **rechaza** con mensaje; nunca se recorta ni se vuelve 0.

**Propuesta para servicios de varias jornadas** (requiere tu aprobación para programarla):

| Elemento | Cambio propuesto | Compatibilidad |
|---|---|---|
| Ayudante por hora | Campo nuevo `workdays`: entero 1–14 (por defecto 1). `hours` pasa a ser **horas por jornada** (≤ 24). Monto = tarifa × horas × jornadas | Aditivo: sin `workdays` equivale a 1 jornada, igual que hoy |
| Ayudante por servicio | Sin cambios: el monto cubre el servicio completo, dure lo que dure | — |
| Tiempo del transportista | Campo opcional `workdays` a nivel de recursos, **solo informativo** hasta aprobar §4.3–§4.4: el motor sigue usando conducción + carga y descarga | Sin cambio de fórmulas |
| Interfaz | Selector «Jornadas» junto a «Horas por jornada»; el resumen muestra «3 jornadas × 8 h» | Teléfono y PC |
| Pruebas | 30 h en una jornada: rechazado; 3 × 10 h: aceptado; sin `workdays`: igual que hoy; tope de 14: rechazado con mensaje | — |

El tope de 14 jornadas es un **supuesto** revisable. Ninguna cotización guardada cambia: el snapshot v2 todavía no se guarda en ninguna parte.

## 5. Vehículos y catálogo (carril 3, #46)

### 5.1 Catálogo `vehicle_catalog` (borrador M1)

| Columna | Nota |
|---|---|
| `segment` | `'camioneta' \| 'furgon' \| 'camionLiviano'`. `camionMediano` solo después de D-2b |
| `make`, `model`, `version`, `year_from`, `year_to`, `engine` | Texto y enteros |
| `fuel` | **Piloto: solo `'gasolina' \| 'diesel'`**, que es un subconjunto de `vehicles.fuel` (P2-6). Eléctricos, híbridos y GNC **quedan fuera del piloto**: un híbrido que consume combustible líquido requiere un análisis propio antes de clasificarlo. `isCatalogFuel` protege el tipo y **no** hace falta migrar `vehicles.fuel` |
| `km_per_l_ref`, `km_per_l_cycle` | Referencial, con ciclo WLTP, WLTC o NEDC, o `null` |
| `curb_weight_kg`, `gvw_kg`, `payload_kg`, `cargo_volume_m3`, `cargo_*_mm`, `door_*_mm` | Numéricos o `null` |
| `sources jsonb` | `{ campo: { url, title, retrievedAt, confidence } }`. Restricción: **todo campo no nulo tiene fuente** |
| `data_version` | Texto |

- **RLS:** `SELECT` para `anon` y `authenticated`; **sin escritura por la API**.
- **Datos:** hasta 15 versiones (A-60), cargadas con una migración de datos revisada y autorizada.

### 5.2 «Mis vehículos» (borrador M2)

- **Columnas nuevas y opcionales:** `catalog_id` (FK, `on delete set null`), `make`, `model`, `model_year`, `version`, `payload_kg`, `cargo_volume_m3` y `cargo_*_mm`. Se amplía el `GRANT UPDATE` del dueño a esas columnas.
- **Elegir del catálogo** copia los valores, que el usuario puede ajustar. Si después el catálogo cambia, se ofrece «hay datos nuevos» y nada se aplica solo.
- **Vehículos existentes:** columnas en `null`; funcionan igual que hoy.
- **Sin rendimiento ni desgaste «cargado»:** dependen de C-2 y D-5.

## 6. Snapshot versionado, persistencia local y compatibilidad

### 6.1 Snapshot `internal` v2

```text
{ schemaVersion: 2, formulaVersion, engineVersion,
  routeSource, km, minutes, costEstimate, costType, suggestedPrice, margin, missing,          ← igual que la v1
  vehicle: { …v1, catalogId, catalogDataVersion, make, model, modelYear, version, payloadKg, cargoVolumeM3 },
  cargo: { mode, summary, totals, capacity, handling: { minutes, complete, missingStops },
           items?: CargoItem[] },   ← en la NUBE: solo con D-4 = (a). En el NAVEGADOR: siempre (§6.3)
  resources: { stops, helpers, equipment } }
```

### 6.2 Compatibilidad histórica

| Caso | Comportamiento |
|---|---|
| `internal` sin `schemaVersion` | Versión 1. `readSnapshot` la normaliza **solo para mostrarla** y **nunca la reescribe** |
| `client_quotes` y `jobs.internal` | Sin `UPDATE` del dueño (A-47; probado en T11) |
| PDF, enlace y WhatsApp de cotizaciones v1 | Idénticos (prueba con fixtures v1) |
| Números interno y emitido | Sin cambios (T8, T12, T14) |
| Función de guardado v1 | Sigue disponible e igual (T12) |

### 6.3 Persistencia en el navegador y copia a la cuenta (P1-3)

**Dónde se guarda:**
- En la **misma clave** `cotizador.trabajos.v1`, con la versión **por registro** (T-4).
- Cada cotización nueva lleva **el snapshot v2 con la lista completa** en `internal.cargo.items`. El límite de 16 KB es una restricción de la **base de datos**, no del navegador.

**Lectura:** `readSnapshot` lee registros v1 y v2. Los v1 no tienen inventario.

**Copia a la cuenta** (`migrateLocalToCloud`, con cliente fijado a la sesión como hoy):
- **Con D-4 = (b):** `toCloudPayload` separa `items` y los envía **completos** en `p_cargo_items` a `create_job_with_quote_v2`. El `internal` que sube conserva el resumen (`totals`, `capacity`, `handling`) sin las líneas.
- **Con D-4 = (a):** sube igual que en el navegador, si cabe en 16 KB (unas 47 líneas con las fixtures de §7; depende de los textos). Si no cabe, se avisa y esa cotización **no se copia**: queda intacta en el navegador.
- **Integridad antes de copiar (P1 de la auditoría de la fase 0):** un registro local v2 con inventario **debe** traer `cargo.items`, y sus conteos deben coincidir con `cargo.totals` (`lines`, `linesWithWeight`, `linesWithVolume`). Si falta la lista o no coincide, `toCloudPayload` devuelve `ok: false` con el motivo, **no se copia nada** y lo local queda intacto. La lectura (`readSnapshot`) sigue aceptando un resumen sin lista, porque así lo guarda la nube. Peso, volumen y completitud se validarán o reconstruirán con `cargoSummary` en la fase 1, antes de emitir.
- **Idempotencia:** por `local_id`, igual que hoy. Una copia repetida devuelve `NULL`, no duplica líneas y no gasta número (T8).
- **Atomicidad:** si falla cualquier línea, no se crea la cotización en la nube y el registro local queda intacto (T7).
- **Lo local nunca se borra** al copiar.

**Cuota del navegador (localStorage, ~5 MB):**
- Antes de guardar se valida el tamaño. Si `setItem` falla, se muestra el error de guardado que ya existe (`QuoteStorageError`).
- **No se escribe nada parcial**: se reemplaza el arreglo completo o nada.
- Con el tope de 200 líneas, una cotización pesa hasta ~60 KB.

### 6.4 Texto del servicio para el cliente (P2-7)

- **No se agrega `service_summary`** (se elimina el borrador M5). Se **reutiliza** `service_description`, que ya existe en `jobs` y `client_quotes`: ≤ 300 caracteres, lista blanca del enlace, PDF y WhatsApp.
- **Generación:** `suggestServiceText` arma una **sugerencia editable** a partir de los tipos y cantidades del inventario y del piso o ascensor. Por ejemplo: «Traslado de 1 refrigerador y 6 cajas; origen 4.º piso sin ascensor».
- **Nunca incluye** pesos, volúmenes, montos, tiempos ni costos.
- **La lista blanca de `get_public_quote` no cambia.**

## 7. Medición del límite de 16 KB (P1-4, corregida)

**Método reproducible:**
- **Comando:** `PGHOST=… PGPORT=… PGUSER=… scripts/diseno/medir-16kb.sh` crea una base local desechable, ejecuta y la elimina.
- **Solo local (P2-2):** el script se niega a correr si `PGHOST` no es un socket Unix (ruta absoluta) o `localhost`, `127.0.0.1` o `::1`. La base se elimina con `trap` también si algo falla.
- **Aserciones (P2-3):** cada caso declara su resultado esperado (`ACEPTADO` o `23514`). Al final, un bloque compara esperado y obtenido; **si alguno no coincide, el script termina con error**. Control: cambiar la expectativa de S3b a `23514` hace fallar la medición.
- **Restricción:** el script **copia literalmente** la restricción de `jobs.internal` desde la migración inicial y la imprime al final (`pg_get_constraintdef`):
  `CHECK ((jsonb_typeof(internal) = 'object') AND (pg_column_size(internal) <= 16384))`.
- **Inserción:** cada caso es un `INSERT` en su **propio bloque**, con transacción independiente, que registra éxito o error y su SQLSTATE.
- **Medición previa:** se mide `pg_column_size(literal::jsonb)`, que es lo que evalúa el CHECK. Lo almacenado puede comprimirse por [TOAST](https://www.postgresql.org/docs/16/storage-toast.html) y medir menos, así que **no sirve para predecir el rechazo**.
- **Datos:** ficticios, con la forma del contrato (§3.1 y §6.1).
- **Resultado:** PostgreSQL 16.15, 20-11-2026.

| Caso | Bytes JSON | `pg_column_size` antes de almacenar | % del límite | `INSERT` | SQLSTATE | Esperado |
|---|---|---|---|---|---|---|
| v1 actual (sin inventario) | 374 | 494 | 3,0 | Aceptado | — | OK |
| (a) S1 un refrigerador | 2.115 | 2.786 | 17,0 | Aceptado | — | OK |
| (a) S2 depto 1 dormitorio, 15 líneas | 4.873 | 6.766 | 41,3 | Aceptado | — | OK |
| (a) S3 depto 3 dormitorios, 40 líneas | 9.820 | 13.902 | 84,9 | Aceptado | — | OK |
| (a) S3b 45 líneas | 10.801 | 15.318 | 93,5 | Aceptado | — | OK |
| (a) S4 casa grande, 80 líneas | 17.728 | 25.306 | 154,5 | **Rechazado** | 23514 | OK |
| (a) S5 extremo, 150 líneas y textos al máximo | 40.391 | 54.082 | 330,1 | **Rechazado** | 23514 | OK |
| (a) S6 200 líneas (tope T-1) | 41.444 | 59.514 | 363,2 | **Rechazado** | 23514 | OK |
| (b) resumen de 80 líneas | 1.899 | 2.474 | 15,1 | Aceptado | — | OK |
| (b) resumen de 200 líneas, textos al máximo | 2.051 | 2.626 | 16,0 | Aceptado | — | OK |

Repetida el 20-11-2026 con la versión 3 del script (volumen calculado con la regla de §3.1): las cifras no cambian y los **10 casos** coinciden con lo esperado.

**Lectura de los datos:**
- Con estas fixtures, cada línea ocupa unos **285 bytes** sin comprimir y el máximo práctico de la opción (a) es **~47 líneas**. **No es un límite universal:** con descripciones de 80 caracteres el máximo baja, y con líneas sin peso ni medidas sube. Por eso la opción (a) exigiría medir cada cotización antes de subirla.
- Con la opción (b), el snapshot no crece con el inventario: ~2,5 KB.
- `p_cargo_items` con 200 líneas y textos al máximo pesa ~68 KB. Es solo referencia: es un parámetro de la función y no está sujeto al límite de `internal`.
- **Corrección de la versión 1:** sus cifras (por ejemplo, «40 líneas al 97 %») se midieron con una línea que incluía `id`, que ya no es parte del contrato, y con un script que no reproducía las inserciones. Esas cifras se reemplazan por estas.

**Opciones para D-4 (decisión tuya, pendiente):**

| Opción | Cabida en la nube | Inmutabilidad | Evaluación |
|---|---|---|---|
| (a) Todo en `internal`, con tope ~45 líneas | Hasta un depto de 3 dormitorios; **no** una casa | Total | Limita mudanzas reales |
| **(b) `job_cargo_items` + resumen en `internal`** | 200 líneas (T-1) | **Probada** (§8.1): solo lectura; escritura única en la transacción de guardado | **Recomendada** |
| (c) Subir el límite a 64 KB | ~150 líneas; 200 no caben | Total | Mueve el problema |

## 8. Supabase: borradores ensayados en local (ninguno ejecutado en Supabase)

Los borradores están en `scripts/diseno/borradores/`, **fuera** de `supabase/migrations`, para que ninguna herramienta los aplique.
- **Ensayo:** `scripts/diseno/probar-borradores.sh` crea una base local con un stub de Supabase (`stub-supabase.sql`), aplica las **3 migraciones reales**, luego M3 y M4, y ejecuta las pruebas (§11.1).
- **Seguridad del ensayo (P2-2 y P2-3):** solo acepta un PostgreSQL local (socket o `localhost`, `127.0.0.1`, `::1`); elimina la base con `trap` aunque algo falle; y las 20 llamadas concurrentes de T14 usan `ON_ERROR_STOP=1` y se revisa el código de salida de **cada una**.
- **Ejecución en staging:** requiere tu autorización individual y respaldo real previo (A-59).

**Supuesto de seguridad de la función privada (P2-1).** `create_job_with_quote_v2` es `SECURITY INVOKER`, igual que la v1. Por eso el rol `authenticated` **conserva `EXECUTE`** sobre `private.insert_cargo_items` y **no** se afirma que «solo M4 puede llamarla» a nivel SQL. La protección real son cuatro capas, cada una con su prueba:

| Capa | Qué impide | Prueba | Control negativo |
|---|---|---|---|
| 1. El esquema `private` **no está expuesto** por la Data API | Llamarla por REST | Verificación previa a migrar (abajo) | — |
| 2. **Marca de transacción**: M4 hace `set_config('cotizador.guardado_v2_job', id, true)` y la función exige que coincida con el trabajo | Usarla fuera del guardado v2, incluso con un trabajo recién creado por `INSERT` directo en la misma transacción | **T6c** | Sin la capa 2, **T6c falla** |
| 3. Trabajo **creado en esta transacción** (`created_at = now()`) | Agregar líneas a una cotización ya emitida | **T6b** | Sin la capa 3, **T6b falla** |
| 4. Trabajo **sin líneas previas** | Duplicar o completar líneas | **T6** | — |

La marca es local a la transacción (`is_local = true`) y desaparece al terminar. Un cliente que pudiera ejecutar SQL arbitrario podría ponerla, pero ese cliente no existe: la Data API solo expone tablas y funciones de los esquemas configurados, y las capas 3 y 4 siguen aplicando.

**Verificación obligatoria antes de ejecutar M3 en staging** (sin cambiar nada; resultado en el issue):
1. Panel de Supabase → Data API → *Exposed schemas*: deben ser solo `public` (y `graphql_public` si está). **No** `private`.
2. `select rolconfig from pg_roles where rolname = 'authenticator';` → si aparece `pgrst.db_schemas`, no debe incluir `private`.
3. Si `private` estuviera expuesto: **detenerse**, informar y no migrar.

**Observación fuera de alcance (no se corrige aquí):** desde el esquema inicial, `authenticated` puede hacer `INSERT` directo en `jobs` (lo necesita la v1, que es `SECURITY INVOKER`). Solo afecta los datos del propio usuario, pero le permite crear un trabajo sin pasar por la numeración atómica. Cambiarlo exigiría una migración propia con tu autorización; queda propuesto como mejora de A-47. *Estado actual (22-11):* revisión técnica en [23](23-revision-52-insert-directo.md) (versión 2, con el rediseño del contador), sin implementar; con la propuesta, la T6c de estos borradores debe reescribirse (23 §5).

### 8.1 M3 · `job_cargo_items` inalterable (P1-1)

| Regla | Cómo se garantiza | Prueba |
|---|---|---|
| El dueño solo **lee** sus líneas | `GRANT SELECT` únicamente; RLS `owner_id = auth.uid()` | T2 (INSERT), T3 (UPDATE), T4 (DELETE) rechazados con 42501; T5 (B no ve las de A) |
| Escritura **única**, dentro de la transacción de guardado | `private.insert_cargo_items` (SECURITY DEFINER, `search_path=''`) exige: trabajo del usuario; **marca del guardado v2** para ese trabajo; creado **en esta transacción**; sin líneas previas; ≤ 200 líneas (ver las capas arriba) | T6, T6b y **T6c**: rechazadas |
| Las defensas no son redundantes | **Controles:** sin la marca, **T6c falla**; sin `created_at = now()`, **T6b falla** | Ejecutados (§11.1) |
| Volumen calculado coherente | `CHECK`: si `volume_source = 'calculado'`, `volume_m3 = round(l*w*h/1e6, 3)` con cm enteros | **T15**; sin el `CHECK`, **T15 falla** |
| Tres medidas o ninguna | `CHECK` con `IS NOT NULL` explícitos. **Corregido en la fase 0:** sin ellos, una línea con solo dos medidas pasaba, porque un `CHECK` que da `NULL` se considera cumplido | **C3** (27 fixtures compartidas con Zod); sin la corrección, **C3 falla** |
| Borrado | Solo **en cascada** cuando el dueño elimina el trabajo completo. Eso ya lo permiten hoy el `GRANT DELETE` sobre `jobs` y la **política RLS** `jobs_delete` del esquema inicial (no es una función), y borra también la cotización y sus enlaces. Es un caso distinto de alterar un documento: el documento deja de existir completo | T13 |
| `internal` no se reescribe | Permisos actuales: el dueño solo actualiza `status` y `payment` | T11 |

### 8.2 M4 · `create_job_with_quote_v2` (P1-2)

**Diseño:**
- La v2 **llama a la v1 sin modificarla** y, en la misma transacción, inserta las líneas.
- Se conservan **exactamente** los invariantes de la v1: identidad por `auth.uid()`, `private.allocate_quote_number` con `FOR UPDATE`, `issued_number` conservado al importar, idempotencia por `(owner_id, local_id)` y el retorno `{id, number, issued_number}` o `NULL`.

| Invariante | Prueba |
|---|---|
| Guardado con líneas en una transacción | T1 (3 líneas), T9b (200 líneas) |
| Una línea inválida revierte **todo**: sin trabajo y sin avance del contador (sin huecos) | T7 |
| Importación repetida: `NULL`, sin líneas duplicadas, sin gastar número, número emitido conservado | T8 |
| > 200 líneas: rechazo **antes** de asignar número | T9 |
| `anon` no puede guardar | T10 |
| La v1 sigue igual; B tiene su propia secuencia | T12 |
| 20 guardados simultáneos con líneas: números únicos y correlativos | T14 |

### 8.3 Resto de los borradores

- **M1** (catálogo) y **M2** («Mis vehículos»), según §5.
- **M5 eliminado** (§6.4).
- **IVA** (`tax_mode`, `tax_rate`): solo con #37 y D-7.

## 9. Distribución de tareas paralelas (cuando se autorice el desarrollo)

| Fase | Carril | Entrega | Archivos propios | Puede empezar |
|---|---|---|---|---|
| 0 | D | Contratos (§2), fixtures v1 de regresión y pruebas de esquema | `src/shared/{cargo,resources,vehicleCatalog,snapshot}.ts`, `tests/contratos.*` | Con tu autorización |
| 1 | 1 | Editor de inventario, `cargoSummary`, `capacityEstimate`, `suggestServiceText` | `src/web/components/Inventory*.tsx`, `tests/inventario.*` | Tras la fase 0 |
| 1 | 2 | Editor de recursos, `handlingTime`, `helperCostLines`, conversión v1 | `src/web/components/Resources*.tsx`, `tests/recursos.*` | Tras la fase 0 |
| 1 | 3 | Selector de catálogo y «Mis vehículos» ampliado (sin datos reales hasta C-1 y M1) | `src/web/components/VehiclePicker*.tsx`, `src/web/cloud/vehicleCatalog.ts`, `tests/catalogo.*` | Tras la fase 0 |
| 1 | Datos | Persistencia local v2 y copia a la cuenta (§6.3) | `src/web/storage.ts`, `src/web/cloud/migration.ts`, `tests/persistencia.*` | Tras la fase 0 y D-4 |
| 2 | Integración | Ranuras en `QuoteSession` y `Calculator.tsx`; guardado v2 | `session.ts`, `Calculator.tsx`, `jobs.ts`, `saveQuote.ts` (**un solo responsable**) | Tras la fase 1 |
| 3 | 4 | Adaptador `costInputs` con §4.3 y §4.4 y fórmulas aprobadas | `src/shared/costInputs.ts` | **Bloqueado:** aprobación §4.3–§4.4, C-2 y D-5 |
| ∀ | QA | e2e por carril en Pixel 7, iPhone 13, 1366 y 1440 (#50) | `scripts/e2e-*` | Con cada carril |

## 10. Criterios de aceptación del diseño

- [x] Reauditoría de ChatGPT: **0 P0 y 0 P1**; los 5 P2 se corrigen en esta versión (§13.2).
- [x] Borradores M3 y M4 ensayados en local: **18 de 18 pruebas** (T1–T15, T6b, T6c y T9b) y 3 controles negativos (T6b, T6c y T15) (§11.1).
- [x] Medición de 16 KB reproducible, con la restricción real, un `INSERT` independiente por caso y **aserciones** que hacen fallar el script ante un resultado inesperado (§7).
- [x] Decisión del propietario sobre D-4 y T-1 a T-6 (A-61, A-62).
- [x] Autorización expresa de la fase 0 (A-63) y fase 0 implementada (§16).
- [ ] Revisión técnica de la fase 0 (ChatGPT) y autorización de la fase 1.
- [ ] Corrección del `INSERT` directo en `jobs` (#52) antes de M3/M4 en staging.
- [ ] Aprobación expresa de §4.3 y §4.4 antes de programar el adaptador.

## 11. Pruebas

### 11.1 Ejecutadas (base local desechable; PostgreSQL 16.15; 3 migraciones reales + M3 y M4)

| Pruebas | Resultado |
|---|---|
| `probar-borradores.sh`: T1–T15, T6b, T6c y T9b | **18/18 OK** (versión 3, 20-11-2026) |
| `probar-borradores.sh`: **C3** con `tests/fixtures/cargo-items.json` (fase 0) | **27/27**; encontró el defecto de «dos medidas» de M3, ya corregido |
| Control negativo: M3 sin `created_at = now()` | **T6b falla**: la prueba detecta la defensa faltante |
| Control negativo: M3 sin la marca del guardado v2 | **T6c falla** |
| Control negativo: M3 sin el `CHECK` de volumen calculado | **T15 falla** |
| Guardas del script | `PGHOST` vacío, con `supabase` o con una IP remota → **rechazado** antes de conectar; tras cada fallo no queda ninguna base `diseno_*` ni `medicion_*` |
| `medir-16kb.sh` | Tabla de §7: **10/10** con el resultado esperado; control (expectativa cambiada) → **falla** |
| `npm test` (sin cambios en la aplicación) | 249/249 |

### 11.2 Por implementar en el desarrollo (criterios de aceptación de cada carril)

| ID | Prueba | Carril |
|---|---|---|
| C1 | Contratos Zod: límites de §3.1 y §4.1; dimensiones enteras; volumen `calculado` igual a `Math.round(l·w·h/1000)/1000`; una modalidad por ayudante; 201 líneas rechazadas | 0 · **hecho** (§16) |
| C3 | El mismo conjunto de líneas que Zod acepta, el `CHECK` de M3 también lo acepta (fixtures compartidas con `pruebas-c3.sql`) | 0 y Datos · **hecho** (§16) |
| C2 | `readSnapshot` lee fixtures v1 con las formas históricas y no modifica nada | 0 · **hecho** (§16) |
| L1 | Copia a la cuenta de un registro v1: idéntico al flujo actual | Datos |
| L2 | Copia de un registro v2 con 120 líneas: 120 filas en `job_cargo_items`, `internal` con resumen | Datos |
| L3 | Copia repetida: sin duplicados ni números gastados | Datos |
| L4 | Una línea inválida: nada se copia; lo local queda intacto | Datos |
| L5 | `setItem` lanza `QuotaExceededError`: error visible y ninguna escritura parcial | Datos |
| L6 | Con D-4 = (a): una cotización de 80 líneas no se copia y queda local, con aviso | Datos |
| H1 | Paradas A y B con minutos: costo igual al actual con la suma | 2 y 4 |
| H2 | Falta la parada B: CF, R y el costo pasan a cota inferior; el precio, «al menos» | 2 y 4 |
| H3 | Comparación de rutas no concluyente si depende del tiempo faltante | 4 |
| H4 | Cotización v1 con carga 0: se muestra igual que antes | 0 · **hecho** (§16) |
| S1 | `suggestServiceText` nunca contiene kg, m³, $ ni minutos | 1 |
| K1 | El catálogo no tiene ningún valor sin fuente; combustible solo gasolina o diésel en el piloto | 3 |
| G1 | Casos dorados 64/64 en cada entrega | ∀ |

## 12. Decisiones técnicas pendientes del propietario

> **Estado actual (20-11-2026):** D-4 = (b) y T-1 a T-6 **aprobadas** (A-61, A-62); T-7 y T-8 **decididas** (A-64, A-65). Siguen **pendientes** §4.3 y §4.4 (se aprueban con I-3), D-2b, D-5, D-7 y D-10. La tabla conserva la redacción con que se propusieron.

| ID | Decisión | Recomendación |
|---|---|---|
| **D-4** | Inventario en la nube: (a), (b) o (c) | **(b)** (§7 y §8.1) |
| T-1 | Tope de líneas por cotización (en la interfaz, en local y en el servidor) | 200 |
| T-2 | Texto del servicio: **reutilizar `service_description`** con una sugerencia editable (§6.4) | Sí (se elimina `service_summary`) |
| T-3 | Accesibilidad solo en A y B | Sí |
| T-4 | Historial local: misma clave con versión por registro | Sí |
| T-5 | Fuentes del catálogo en `jsonb` por campo | Sí |
| T-6 | Nueva función v2 que reutiliza la v1 | Sí (§8.2) |
| §4.3 y §4.4 | Aprobación para programar la modalidad por hora y la marca de tiempo de carga incompleto | Aprobar junto con la fase de integración |
| **T-7** (**decidida, A-64**: se conservan provisionalmente; diseño para más de 24 h en §4.5) | Límites técnicos de recursos: ≤ 24 h por ayudante, ≤ 20 ayudantes, ≤ 20 elementos de equipamiento, pesos enteros ≤ 9.999.999.999 (§4.1). Hoy un trabajo de varias jornadas se **rechaza** con mensaje; no se recorta ni se vuelve 0 | Revisar con criterio de producto **antes de habilitar la interfaz** (fase 1). Alternativa: horas por jornada |
| **T-8** (**decidida, A-65**: se mantienen; prohibido usarlos para costos o seguridad) | `fragile` y `handling`: mantener los valores por defecto («no marcado», «sin manejo especial») o usar `null` para «desconocido» (implica cambiar M3) | Mantenerlos, rotulados en la interfaz y sin uso en costos ni seguridad; reconsiderar si se usan para algo más |
| D-2b, D-5, D-7, D-10 | Sin cambios | — |

## 13. Respuesta a las auditorías

### 13.1 Auditoría de `cba6ffb` (versión 2)

| Hallazgo | Corrección | Dónde | Evidencia |
|---|---|---|---|
| P1-1 Inventario no inmutable | Solo `SELECT`; escritura única dentro del guardado; borrado solo en cascada del trabajo completo (caso documentado) | §8.1, M3 | T2–T6b, T11, T13; control negativo |
| P1-2 M4 sin invariantes | La v2 reutiliza la v1; invariantes listados | §8.2, M4 | T1, T7, T8, T9, T9b, T12, T14 |
| P1-3 Persistencia local | Lista completa en el registro local v2; `toCloudPayload` → `p_cargo_items`; idempotencia; cuota | §6.3 | L1–L6 (desarrollo) + T7 y T8 (servidor) |
| P1-4 Medición no reproducible | Restricción copiada de la migración; `INSERT` independiente por caso; tamaño previo; versión | §7 | `medir-16kb.sh` |
| P1-5 Tiempo parcial | `handlingTime` con completitud; partidas faltantes para CF y R sin cambiar el motor; v1 sin reinterpretar | §4.4 | H1–H4 (desarrollo) |
| P2-6 Combustibles | Piloto solo gasolina y diésel; `isCatalogFuel`; sin migrar `vehicles.fuel` | §5.1 | K1 |
| P2-7 `service_summary` duplicado | Se elimina; se reutiliza `service_description` con una sugerencia sin datos internos | §6.4 | S1 |
| P2-8 Fixtures ≠ contrato | `CargoItem` sin `id`; `capacity.minTrips`; T-1 en la interfaz, en local y en el servidor | §2, §3, §7 | Script v2, T9 y T9b |

### 13.3 Auditoría de la fase 0 (`1c2caa6`): 0 P0, 1 P1, 3 P2

| Hallazgo | Corrección | Evidencia |
|---|---|---|
| **P1** `toCloudPayload` podía copiar un v2 local sin `items` (o con conteos distintos) como si tuviera 0 líneas | `localCargoIntegrityIssue`: exige `items` en local y que `lines`, `linesWithWeight` y `linesWithVolume` coincidan; si no, `ok: false` y nada se copia. La lectura de la nube no cambia; v1 tampoco | 14 pruebas nuevas; con el comportamiento anterior fallan 7; sin exigir `items` o sin el conteo de peso, también fallan |
| P2-1 Límites técnicos sin ratificar | Registrados como **T-7** (PROPUESTA) y marcados en el código como supuestos; pruebas de más de 24 h, 21 ayudantes y 21 elementos: se rechazan con mensaje, nunca se recortan ni se vuelven 0 | `contratos.resources.test.ts` |
| P2-2 Valores por defecto de `fragile` y `handling` | Significado documentado («no marcado», «sin manejo especial»), sin uso en seguridad ni costos; decisión **T-8** (PROPUESTA) | §3.1, `cargo.ts` |
| P2-3 Párrafo contradictorio en docs/07 | Marcado como estado **histórico**, con el estado actual (A-55 a A-61; pendientes D-2b, D-5, D-7, D-10) | docs/07 |

### 13.2 Reauditoría de la versión 2 (versión 3): 0 P0, 0 P1, 5 P2

| Hallazgo | Corrección | Dónde | Evidencia |
|---|---|---|---|
| P2-1 `authenticated` conserva `EXECUTE` sobre la función privada | Supuesto documentado; **capa nueva**: marca de transacción que solo pone M4; verificación obligatoria de esquemas expuestos antes de migrar | §8 y M3/M4 | **T6c** + control negativo |
| P2-2 Guardas débiles en los scripts | `PGHOST` solo socket o `localhost`/`127.0.0.1`/`::1`; `trap` elimina la base aunque falle | Ambos `.sh` | Guardas probadas; 0 bases residuales |
| P2-3 Concurrencia y medición no fallaban solas | `ON_ERROR_STOP=1` y código de salida por cada llamada de T14; resultado esperado por caso y aserción final con `23514` | `probar-borradores.sh`, `medir-snapshot-16kb.mjs` | Control: expectativa cambiada → falla |
| P2-4 Volumen calculado sin validar | Dimensiones enteras; regla única de redondeo; `CHECK` en M3; recálculo en la interfaz y validación Zod | §3.1, M3 | **T15** + control; C1 y C3 (desarrollo) |
| P2-5 Redacción | `jobs_delete` es una **política RLS**; «~47 líneas» es una observación con las fixtures, no un límite | §0, §7, §8.1 | — |

## 14. Lo que este diseño NO hace

No programa funciones de la aplicación, no ejecuta migraciones en Supabase, no modifica el motor ni sus fórmulas, no importa datos al catálogo, no implementa IVA y no activa Google Routes. Todo ensayo se hizo en un PostgreSQL **local y desechable**.

## 15. Plan de implementación: inventario y recursos (cuando se autorice)

> **Estado actual (20-11-2026):** P0 cerrada (A-63). P1 cerrada técnicamente (A-66). P2: solo **I-1 + I-1b** (A-68), cerrada técnicamente con la flag apagada; la vista previa en staging **no** está autorizada. P3 y P4 **no autorizadas**.

**Texto original:** nada de esta sección estaba autorizado. Cada puerta indica qué aprobación tuya la abre. El orden es el de §9; aquí se detalla para los carriles 1 (inventario, #47) y 2 (recursos, #51), más lo que ambos necesitan de datos e integración. El carril 3 (catálogo) sigue esperando C-1 y M1.

### 15.1 Puertas de aprobación

| Puerta | Qué abre | Requiere |
|---|---|---|
| P0 | Fase 0: contratos y pruebas, **sin interfaz ni cambios visibles** | Ratificar D-4 y T-1 a T-6 + autorizar expresamente la fase 0 |
| P1 | Carriles 1 y 2: editores y funciones puras, **solo en el navegador** y detrás de un interruptor apagado | Revisión de la fase 0 + tu autorización |
| P2 | Integración en el cotizador, guardado local v2 y vista previa en staging | Revisión de los carriles + tu autorización |
| P3 | M3 y M4 en Supabase staging | Autorización individual por migración + respaldo real previo (A-59) + verificación de esquemas expuestos (§8) |
| P4 | Adaptador de costo (§4.3 y §4.4): modalidad por hora y tiempo incompleto | Aprobación expresa de §4.3–§4.4; casos dorados nuevos revisados |

Ninguna puerta autoriza fusionar el PR #34, activar Google Routes, producción ni gastos.

### 15.2 Fase 0 · Contratos (puerta P0)

| Entrega | Archivo | Contenido |
|---|---|---|
| Inventario | `src/shared/cargo.ts` | Tipos y esquema Zod de `CargoItem` y `CargoInventory` (§3.1, T-1 = 200, cm enteros, regla de volumen); firmas de `cargoSummary`, `capacityEstimate` y `suggestServiceText` |
| Recursos | `src/shared/resources.ts` | Tipos y Zod de `stops` (solo A y B, T-3), `helpers` (una modalidad por ayudante) y `equipment`; firmas de `resourcesSummary`, `helperCostLines` y `handlingTime` |
| Snapshot | `src/shared/snapshot.ts` | Tipo v2 (§6.1); `readSnapshot` (v1 → v2 solo para mostrar, sin reescribir); `toCloudPayload` según D-4 |
| Pruebas | `tests/contratos.*.test.ts` | C1, C2, C3 y H4; fixtures v1 reales anonimizadas |

**Criterio de salida:** `npm test` en verde (249 actuales + nuevas), casos dorados 64/64, **ningún archivo de `src/web` ni `src/engine` modificado**, revisión de ChatGPT.

### 15.3 Carril 1 · Inventario (#47, puerta P1)

1. **Funciones puras** (`src/shared/cargo.ts`):
   - `cargoSummary`: totales solo con líneas que tienen dato y completitud (`linesWithWeight / lines`); «al menos X kg» si falta alguno.
   - `capacityEstimate`: cota inferior de viajes por peso y volumen; `null` con motivo si falta un dato del vehículo; siempre con el aviso de §3.2.
   - `suggestServiceText`: tipos y cantidades + piso/ascensor; nunca kg, m³, $ ni minutos (S1).
2. **Interfaz** (`src/web/components/Inventory*.tsx`):
   - modo rápido (texto ≤ 200) y detallado (líneas);
   - agregar, editar, duplicar, reordenar y eliminar líneas **mientras se cotiza**; al emitir, la lista queda congelada en el snapshot;
   - volumen recalculado al cambiar una dimensión; cambiar a «declarado» es explícito;
   - contador «N de 200» y bloqueo en 200;
   - teléfono y PC con la misma funcionalidad (A-49): lista apilada en teléfono, tabla en PC.
3. **Pruebas:** unitarias de las tres funciones, S1, límites de C1 desde la interfaz, e2e en Pixel 7, iPhone 13, 1366 y 1440 (#50).
4. **No incluye:** plantillas con pesos (C-2), efecto en el precio (D-5) ni catálogo.

### 15.4 Carril 2 · Recursos (#51, puerta P1)

1. **Funciones puras** (`src/shared/resources.ts`):
   - `handlingTime`: `{ minutes, complete, missingStops }`; suma solo paradas con dato (§4.4).
   - `helperCostLines`: una línea por ayudante; «servicio» = monto; «hora» = tarifa × horas o `null` si faltan las horas (A-58).
   - `resourcesSummary`: lo que se muestra en el resumen interno.
   - Conversión v1: «cantidad × monto» → N ayudantes «servicio» con el mismo monto.
2. **Interfaz** (`src/web/components/Resources*.tsx`): paradas A y B (piso, ascensor, escalera, metros de acarreo, acceso, minutos), ayudantes con selector de modalidad y equipamiento declarado.
3. **Mientras no se apruebe §4.3–§4.4 (puerta P4):** el costo se calcula **igual que hoy**. La modalidad «hora» y el tiempo incompleto se muestran como **información**, con el aviso «aún no se incluye en el costo», y los ayudantes «servicio» siguen entrando por el campo actual. Así no se altera ningún cálculo económico sin tu aprobación.
4. **Pruebas:** unitarias, conversión v1 con casos dorados 64/64 idénticos, e2e (#50). H1–H3 quedan para la puerta P4.

### 15.5 Datos e integración (puertas P2 y P3)

| Paso | Archivos | Pruebas |
|---|---|---|
| Registro local v2 en la misma clave, versión por registro (T-4); escritura todo-o-nada; error de cuota visible | `src/web/storage.ts` | L5 y lectura mixta v1/v2 |
| Ranuras de inventario y recursos en la sesión y el cotizador; texto sugerido en `service_description` (T-2) | `session.ts`, `Calculator.tsx` (**un solo responsable**) | e2e #50 |
| Guardado y copia a la cuenta con `create_job_with_quote_v2` (T-6) cuando exista M4; antes, la nube sigue con la v1 y **sin líneas** | `jobs.ts`, `saveQuote.ts`, `cloud/migration.ts`, `cloud/quotes.ts` | L1–L4, L6 (si D-4 = a) |
| Migraciones M3 y M4 (copiadas de los borradores probados, con la verificación de §8) | `supabase/migrations/` | T1–T15 contra staging de prueba, con usuarios ficticios |

**Orden recomendado:** fase 0 → carriles 1 y 2 en paralelo (archivos disjuntos) → datos locales → integración → M3/M4 → copia a la cuenta. Así todo funciona primero **en el navegador**, y la nube se agrega al final sin bloquear la interfaz.

### 15.6 Riesgos y cómo se controlan

| Riesgo | Control |
|---|---|
| Alterar el costo sin aprobación | Puerta P4; casos dorados 64/64 obligatorios en cada entrega (G1) |
| Cotizaciones antiguas cambian | `readSnapshot` no reescribe; fixtures v1 reales (C2, H4) |
| Conflictos entre carriles | Archivos disjuntos (§9); `session.ts` y `Calculator.tsx` con un solo responsable |
| Diferencia entre la validación del navegador y la del servidor | Fixtures compartidas (C3) |
| Inventario grande llena el navegador | Tope 200, validación de tamaño y error visible (L5) |
| Exposición del esquema `private` | Verificación previa obligatoria (§8); si falla, no se migra |

## 16. Fase 0 implementada (A-63)

**Alcance autorizado y cumplido:** tipos, contratos y validaciones Zod de inventario y recursos; contratos del snapshot versionado; pruebas de compatibilidad con las cotizaciones actuales; cálculos y casos dorados intactos. **La aplicación todavía no importa estos archivos:** no hay cambio visible, ni en lo que se guarda, ni en el costo.

| Archivo | Contenido |
|---|---|
| `src/shared/cargo.ts` | `cargoItemSchema` (§3.1, `strict`, valores por defecto sin inventar datos), `cargoItemsSchema` (≤ 200, T-1), `cargoInventorySchema`, `volumeFromDims`, esquemas de `totals` y `capacity`, firmas de `cargoSummary`, `capacityEstimate` y `suggestServiceText` (carril 1) |
| `src/shared/resources.ts` | `stopSchema` (solo A y B, T-3), `helperSchema` (unión por modalidad, `strict`: A-58), `equipmentSchema`, `resourcesSchema`, `handlingTimeSchema`, firmas de `handlingTime` y `helperCostLines` (carril 2) |
| `src/shared/snapshot.ts` | `snapshotV1Schema` (lectura tolerante de lo existente), `snapshotV2Schema` (§6.1), `readSnapshot` (nunca lanza ni modifica; v1 sin inventario ni recursos), `toCloudPayload` (D-4 = b: líneas aparte, `internal` sin `items`; v1 idéntico) |
| `tests/contratos.*.test.ts` | 96 pruebas: C1, C2, C3, H4, la parte pura de L1 e integridad del inventario antes de copiar (P1 de la auditoría) |
| `tests/fixtures/` | `cargo-items.json` (27 casos compartidos con el servidor) y `snapshots-v1.json` (5 formas históricas, datos ficticios; no provienen de staging) |
| `scripts/diseno/pruebas-c3.sql` | C3 del lado del servidor, en el PostgreSQL local desechable |

**Decisiones menores tomadas en la fase 0 (revisables en la revisión técnica):**
- En la vista de una cotización v1, `formulaVersion` es `null` (no se conocía) y los datos del catálogo del vehículo son `null`. Los campos extra del vehículo v1 no se muestran, pero el registro no cambia.
- `cargo` y `resources` pueden ser `null` en una cotización v2 sin inventario o sin recursos.
- `toCloudPayload` copia un v1 **tal cual** (como hoy). Un v2 se valida antes de copiarse, incluida la integridad del inventario: si es inválido o le faltan objetos, no se copia.
- Diferencias permitidas en C3 (Zod más estricto que el servidor): campos extra y números escritos como texto.

**Pruebas (20-11-2026, Claude):**

| Prueba | Resultado |
|---|---|
| `npm test` | **345/345** (249 anteriores + 96 de la fase 0), tras corregir la auditoría |
| `npm run typecheck` y `vite build` | Sin errores |
| `scripts/verificar-casos-dorados.mjs` | **64/64** |
| `probar-borradores.sh` (local desechable) | 18/18 + **C3 27/27** |
| Mutaciones manuales (quitar la regla de volumen, permitir medidas con decimales, quitar `strict` del ayudante, no copiar en `readSnapshot`, dejar `items` en `toCloudPayload`; tras la auditoría: quitar la verificación de integridad, no exigir `items`, no contar líneas con peso) | **Las 8 hacen fallar las pruebas** |
| Archivos de `src/web`, `src/engine`, `src/server` y `supabase/` | **Sin cambios** |

## 17. Fase 1: inventario (#47) y recursos (#51) — implementada, sin integrar (A-66)

**Autorización:** [registro en #43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7045847482). **No** se conecta al cotizador, **no** cambia el resultado económico y **no** toca Supabase, migraciones, IVA ni Google Routes.

### 17.1 Qué se entregó

| Archivo | Contenido |
|---|---|
| `src/shared/cargo.ts` | `cargoSummary` (Σ cantidad × valor por unidad; `null` si no hay datos), `cargoTotalsIssue` (comprobación de peso y volumen), `capacityEstimate` (cota inferior por peso y volumen; incompleta si faltan datos), `suggestServiceText` (≤ 300, sin datos internos), `floorLabel`, `CARGO_TEMPLATES` (solo nombres) |
| `src/shared/resources.ts` | `handlingTime`, `helperCostLines`, `resourcesSummary`, `helpersFromV1`, `switchHelperMode` |
| `src/shared/snapshot.ts` | La integridad antes de copiar ahora también compara **peso y volumen**; `missing` acotado en v2 (≤ 20 × 60); tope conservador de 11.000 bytes de JSON para el `internal` que sube a la nube |
| `src/web/modules/inventoryDraft.ts`, `resourcesDraft.ts` | Estado de los editores como funciones puras (validación con el contrato y errores por línea y campo) |
| `src/web/components/InventoryEditor.tsx`, `ResourcesEditor.tsx`, `ModulesPreview.tsx` | Editores y vista previa **solo en memoria** |
| `src/web/featureFlags.ts` | `VITE_FF_CARGA_RECURSOS`, **apagada** por defecto. Con la flag apagada, Vite elimina la vista previa del paquete (verificado: 0 apariciones de sus textos) |
| `src/web/App.tsx` | Pestaña «Carga (prueba)» **solo** con la flag encendida. Es el único archivo existente de la interfaz que cambió; el cotizador, la sesión, el guardado y el motor no importan los módulos nuevos (prueba automática) |
| `scripts/e2e-modulos.mjs` | Prueba de navegador local, con y sin flag |

### 17.2 Decisiones de interfaz (revisables)

- **Volumen:** se calcula solo con las tres medidas y la regla del servidor. Si el usuario escribe otro valor, queda «declarado» y no se pisa al cambiar las medidas; un enlace permite volver al calculado. Con medidas diminutas (0 m³) la línea queda sin volumen.
- **Modo rápido:** las líneas del modo detallado se conservan en el borrador, pero no entran al inventario; se avisa.
- **T-8:** «Marcar como frágil» y «Sin manejo especial declarado», con la nota «son notas para ti: no cambian el costo ni certifican la seguridad». El texto sugerido no los menciona.
- **Recursos:** los montos de ayudantes y el tiempo de carga se muestran como «informativo: aún no se incluye en el costo». Un ayudante nuevo empieza «por servicio» y sin monto; por hora, sin tramos marcados, el monto queda faltante.
- **Pisos:** forma chilena («1.er piso», «4.º piso», «subterráneo 2»), con subterráneos −5 a −1 y pisos 1 a 60.
- **Texto sugerido:** si una descripción contiene kg, m³, $, minutos u horas, se usa el tipo del objeto en su lugar.

### 17.3 Pruebas (20-11-2026, Claude)

| Prueba | Resultado |
|---|---|
| `npm test` | **404/404** (345 anteriores + 59 de la fase 1) |
| `scripts/verificar-casos-dorados.mjs` | **64/64** |
| `npm run typecheck` y `vite build` (con y sin flag) | Sin errores |
| `scripts/e2e-modulos.mjs` en Pixel 7, iPhone 13 (emulado en Chromium), 1366 × 768 y 1440 × 900 | **100/100**: sin flag no hay pestaña; volumen calculado; totales 219 kg y 1,842 m³; estimación «al menos 2 viajes» por volumen; error de cm enteros; duplicar, eliminar y subir; tiempo incompleto; ayudante por hora sin tramos (faltante) y con tramo ($18.000); 30 h rechazadas; cambio de modalidad sin montos residuales; texto sin datos internos; sin desplazamiento horizontal; controles ≥ 44 px; **no escribe en el navegador**; 0 errores de consola |
| Compatibilidad con el motor | La conversión de ayudantes v1 da exactamente la partida «Ayudantes» actual en 5 casos (incluido el faltante) |
| Mutaciones manuales (peso sin cantidad, total 0 en vez de `null`, sin margen de redondeo en la capacidad, texto sin filtro, cambio de modalidad que conserva el monto, monto por hora sin tramos) | **Las 6 hacen fallar las pruebas** |

**No probado:** Safari real en un iPhone (solo emulación en Chromium); lectores de pantalla (solo marcado accesible verificado); con la flag encendida en staging (no se desplegó).

### 17.4 Pendiente para la integración (puerta P2, no autorizada)

- Conectar los editores a `QuoteSession` y `Calculator.tsx`, guardar el snapshot v2 en el navegador (§6.3) y reemplazar el resumen guardado por `cargoSummary` al emitir.
- El PDF, el enlace y WhatsApp solo con la descripción del servicio (prueba de lista blanca).
- En teléfono, una mudanza de muchas líneas hace la página larga: evaluar líneas plegables al integrar.

> **Estado actual:** estos puntos se resolvieron con I-1 + I-1b (A-68): editores conectados a la sesión, snapshot v2 en el navegador, PDF, enlace y WhatsApp solo con la descripción del servicio, y líneas plegables (§17.5). Detalle en [22 §10](22-diseno-integracion-cotizador.md).

### 17.5 Interfaz plegable y separación cliente / transportista (20-11-2026, pedido del propietario)

Mejora visual dentro de la fase 1 (A-66). **No** elimina información ni funciones, **no** cambia contratos, validaciones ni cálculos, y sigue sin conexión al cotizador.

| Pedido | Cómo quedó |
|---|---|
| Cada objeto como fila compacta | Título «12 × Cajas», resumen «12 kg c/u · 0,08 m³ c/u» y estado: **Completo**, **Faltan datos opcionales** o **Revisar** (con el motivo) |
| Al seleccionarlo, todos sus campos | La fila se despliega con descripción, cantidad, tipo, peso, medidas, volumen, manejo especial y frágil, más Listo, Subir, Bajar, Duplicar y Eliminar |
| Objeto nuevo abierto | Al agregar o duplicar, la línea nueva se abre sola. Las demás **sin errores** se cierran (sus datos se conservan); las que tienen errores siguen abiertas |
| Cerrar sin perder datos | «Listo» o la fila cierran: el borrador no depende de que la fila esté abierta (prueba automática y e2e: al reabrir, los valores siguen) |
| Origen, destino, ayudantes y equipamiento plegables | Cada uno con resumen («4.º piso · sin ascensor», «Por hora · 3 h × $6.000 = $18.000») y estado |
| Qué falta, qué es opcional, qué está completo | Rótulos «(obligatorio)» y «(opcional)» en cada campo; etiquetas de estado; un dato opcional que falta **nunca** es un error ni se completa con 0 |
| Resumen de peso, volumen y viajes | PC: columna derecha **fija** al desplazarse. Teléfono: **barra al pie** siempre visible («219 kg · 1,842 m³ · ≥ 2 viajes · Ver resumen») |
| Mejor uso del ancho en PC | Dos columnas (editores y resumen); campos en grilla automática; origen y destino lado a lado |
| Datos del cliente y costos internos | **«Datos de la carga»** (objetos y accesos) frente a **«Tus recursos y costos internos — Solo para ti»** (minutos, ayudantes, equipamiento). El texto para el cliente se marca «Lo verá el cliente» |

**Clasificación en el código:** `src/shared/audiencia.ts` marca cada campo como `cliente` o `transportista`. Una prueba verifica que cubre exactamente los campos de los contratos y que tiempos, ayudantes y equipamiento son internos.

**Pruebas:** `npm test` **419/419** (15 nuevas: estados, resúmenes, apertura al agregar y clasificación). `scripts/e2e-modulos.mjs` reescrito para el flujo plegable: **166/166** en Pixel 7, iPhone 13 (emulado), 1366 × 768 y 1440 × 900, con capturas. Entre otras cosas verifica:
- todo cerrado al inicio;
- un objeto nuevo se abre solo;
- un objeto completo se cierra al agregar otro, conservando sus datos;
- una fila cerrada marca «Revisar»;
- la barra al pie se ve en el teléfono, y en PC hay dos columnas con el resumen fijo;
- no hay desplazamiento horizontal, los controles miden al menos 44 px, no se escribe en el navegador y no hay errores de consola.

Casos dorados 64/64. Con la flag apagada, el paquete sigue sin los editores.

### 17.6 Respuesta a la auditoría de la fase 1 (`fe0e143` y `2812b0f`: 0 P0, 3 P1, 2 P2)

[Auditoría](https://github.com/ratatecuala/calculadora-de-costos-log/issues/45#issuecomment-7049343146). Todo dentro de la fase 1 (A-66): sin conexión al cotizador, sin cambios en el motor ni en Supabase.

| Hallazgo | Corrección | Prueba que impide que reaparezca |
|---|---|---|
| **P1-1** `helpersFromV1` recortaba a 20 (21 × $15.000 = $315.000 pasaba a $300.000) | Nunca recorta. Devuelve `{ ok: false, reason }` si la cantidad supera 20 (T-7), si no es un entero ≥ 0 o si el monto no cabe en el contrato nuevo; el dato v1 se conserva tal cual. Con 20 o menos, la suma es idéntica al motor | 20 → 20 líneas y $300.000 = motor; 21, 25, 50 y 1.000 → rechazo con motivo; −1, 1,5, NaN e ∞ → rechazo; montos con decimales, negativos o fuera de rango → rechazo. Reintroducir el recorte hace fallar **4** pruebas |
| **P1-2** Datos inválidos sumaban en los totales informativos (30 h × $6.000 = $180.000) | `helperCostLines` valida cada ayudante con el contrato: estado `ok`, `faltante` o `invalido`; un inválido **no suma**. `equipmentAmount` hace lo mismo con el equipamiento, y `handlingTime` trata los minutos inválidos como faltantes. Los totales distinguen «falta el monto de N» de «N con datos inválidos, no suma», y las filas dicen «monto no calculable» | 30 h, tarifa negativa o con decimales, monto negativo o con decimales, 0 h; equipamiento con decimales, fuera de rango o sin nombre; minutos 1.441, −5 y 2,5; mezcla de válidos e inválidos. E2E: con 30 h el resumen no muestra $180.000. Quitar cada validación hace fallar **6**, **2** y **1** pruebas |
| **P1-3** El texto para el cliente incluía «N ayudantes» | `suggestServiceText` ya **no recibe** ayudantes: solo inventario y, de las paradas, piso y ascensor (aunque llegue la parada completa con minutos). Anunciar ayudantes al cliente sería una decisión explícita aparte | `@ts-expect-error` (el typecheck falla si se vuelve a aceptar un tercer parámetro); igualdad del texto con y sin datos internos en las paradas; revisión estática de la llamada en la vista previa; E2E «sin ayudantes». Volver a agregarlo hace fallar las pruebas y el typecheck |
| **P2-1** Foco perdido al cerrar con «Listo» | `Disclosure` devuelve el foco al encabezado si se cierra con el foco dentro; Escape cierra y vuelve al encabezado; Enter abre (botón nativo) | E2E en 4 tamaños: «Listo» y Escape dejan el foco en el encabezado, y Enter abre. Sin la corrección, el E2E falla en los 4 |
| **P2-2** Pasar a «Rápido» excluía la lista sin decirlo | Cambiar de modo **nunca** borra líneas. «Rápido» con una lista deja el inventario **inválido** y muestra un aviso con «Volver a Detallado» o «Descartar la lista», este último con confirmación. El resumen no calcula 0 por omisión | Ida y vuelta entre modos conserva líneas y datos; solo el descarte explícito vacía la lista; E2E del aviso, de cancelar y de volver. Quitar la regla hace fallar la prueba |

**Decisión del propietario mantenida:** al agregar un objeto, los anteriores sin errores se cierran (conservando sus datos) y los que tienen errores siguen abiertos.

**Resultados (20-11-2026, Claude):**
- `npm test`: **450/450**.
- Casos dorados: **64/64**.
- Typecheck y build, con y sin flag: sin errores.
- E2E: **210/210** en Pixel 7, iPhone 13 (emulado), 1366 y 1440.
- **Sigue sin probarse:** Safari real y lector de pantalla.

### 17.7 Reauditoría de la fase 1 (`cee34b6`: 0 P0, 0 P1, 2 P2) y cierre técnico

[Reauditoría](https://github.com/ratatecuala/calculadora-de-costos-log/issues/45#issuecomment-7049771363): la fase 1 cumple el criterio de cierre técnico. Se corrigieron sus 2 P2:

| Hallazgo | Corrección | Prueba que impide que reaparezca |
|---|---|---|
| **P2-A** `helperCostLines` solo validaba tarifa y horas | Cada ayudante se valida con el **esquema completo** (id UUID, modalidad, tramos permitidos y sin repetir, sin campos extra). Solo un dato vacío (monto, tarifa, horas o tramos) es «faltante». El producto tarifa × horas también debe caber en el tope monetario | 8 casos malformados (tramo desconocido o repetido, id no UUID, campo de la otra modalidad, modalidad desconocida, horas como texto) y producto sobre el tope → «inválido». Quitar el esquema completo hace fallar **15** pruebas; quitar el tope del producto, **1** |
| **P2-B** `equipmentAmount` devolvía «faltante» antes de validar el nombre | Primero se valida el elemento completo; «faltante» es solo el monto vacío con un nombre válido | Nombre vacío o de 61 caracteres con monto vacío → «inválido»; campo extra → «inválido»; el resumen lo cuenta como inválido. Volver al orden anterior hace fallar **2** pruebas |

**Resultados (Claude, 20-11-2026):** `npm test` **465/465**; casos dorados 64/64; typecheck y build sin errores; e2e de módulos 210/210 (sin cambios visibles en la interfaz). La interfaz plegable se conserva sin rediseño.

**Siguiente etapa:** diseño de integración en [22](22-diseno-integracion-cotizador.md) (I-1 sin migraciones; I-2 tras #52; I-3 con aprobación de fórmulas). **No autorizado** en ese momento. **Estado actual:** A-67 aprobó el diseño y A-68 autorizó I-1 + I-1b, ya implementadas y cerradas técnicamente ([22 §10 y §14](22-diseno-integracion-cotizador.md)); I-2 e I-3 siguen sin autorizar.

## 18. Propuesta para una etapa posterior: datos de la carga aportados por el cliente (NO autorizada)

**Estado: PROPUESTO.** No se implementa ningún formulario público ni recepción de datos. Requiere tu aprobación expresa y, por tratarse de datos de terceros y de una URL pública, una revisión de seguridad y privacidad (docs/06).

**Idea:** el transportista envía al cliente un enlace para que complete **solo** los «Datos de la carga» (objetos y accesos). El transportista revisa, corrige y decide; el cliente nunca ve costos, tiempos, ayudantes ni el margen.

| Tema | Propuesta |
|---|---|
| Qué puede completar el cliente | Solo los campos `cliente` de `src/shared/audiencia.ts`: objetos (descripción, cantidad, peso, medidas, volumen, frágil, manejo) y accesos de origen y destino (piso, ascensor, escaleras, acarreo, nota) |
| Qué nunca ve ni envía | Campos `transportista` (minutos, ayudantes, equipamiento), costos, margen, precio sugerido y datos de otros clientes |
| Validación | El mismo contrato Zod en el navegador del cliente **y** en el servidor (tope de 200 líneas, cm enteros, volumen coherente) |
| Flujo | Enlace de un solo uso y con vencimiento → el cliente envía → queda como **borrador pendiente de revisión** → el transportista lo acepta, corrige o descarta. Nada entra a una cotización sin su revisión |
| Seguridad | Token largo y aleatorio (como `quote_shares`); límite de envíos por enlace y por IP; sin cuenta del cliente; sin archivos adjuntos en la primera versión |
| Privacidad | Datos mínimos; aviso de para qué se usan; se borran si el transportista descarta el envío; nada de domicilios exactos en registros técnicos |
| Datos y migraciones | Tabla nueva de envíos pendientes con RLS y función pública acotada: requiere diseño, migración y autorización propios (A-59) |
| Dependencias | Integración del inventario (puerta P2), #52 resuelto y la decisión sobre producción |

**Decisiones que harían falta:** autorizar el diseño de esta etapa, el canal del enlace (WhatsApp o correo) y la política de retención de los envíos.

