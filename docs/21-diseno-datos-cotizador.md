# 21 · Diseño técnico de datos del cotizador ampliado (#45)

**Versión 1 · 20-11-2026 · Estado: DISEÑO para auditoría.** No hay código, migraciones ejecutadas ni datos importados.
**Autorización:** [ratificación del propietario en #43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7041864905): D-1, D-2, D-3, D-6, D-8 (solo **diseño** de migraciones) y D-9. Siguen **sin aprobar** D-2b, D-4, D-5, D-7 y D-10.
**Base:** plan [19](19-plan-cotizador-ampliado.md) versión 2 · esquema actual en `supabase/migrations/` (3 migraciones) · motor `motor-1.0.1` (no cambia).

## 0. Resumen

- **Cuatro módulos independientes** con contratos fijos:
  - inventario (#47);
  - recursos (#51);
  - vehículos y catálogo (#46);
  - costo según carga (#48), este último bloqueado.
- **Primero se publica un paquete de «contratos»:** tipos, esquemas y lector de snapshot versionado. Después, cada carril trabaja en sus propios archivos.
- **Inventario y recursos básicos se diseñan ya**, sin esperar C-1 ni C-2. Todos sus campos los declara el usuario y ninguno tiene valores por defecto.
- **Medición real del límite de 16 KB** (§7):
  - el snapshot `internal` con inventario cabe hasta unas **40 líneas** (S3, 97 % del límite);
  - una casa con 80 líneas **ya lo excede**.
  - **Recomendación para D-4** (sigue pendiente de tu decisión): las líneas del inventario van en una tabla propia e **inalterable**, `job_cargo_items`, y el snapshot del documento guarda solo un **resumen** compacto.
- **Compatibilidad:**
  - las cotizaciones emitidas no se tocan;
  - `internal` sin `schemaVersion` se lee como versión 1;
  - los vehículos y el historial local actuales funcionan sin cambios.
- **El motor económico no cambia** en este diseño. Los módulos nuevos solo **informan**, salvo la modalidad de ayudantes «por servicio», que reproduce exactamente el cálculo actual.

## 1. Principios de arquitectura

1. **Módulos con contrato fijo.** Cada módulo expone tipos, un esquema Zod y funciones puras de resumen. Ningún módulo importa la interfaz de otro.
2. **El motor (`src/engine`) no cambia.** Un **adaptador** (`src/shared/costInputs.ts`, carril 4) traduce inventario y recursos a las entradas del motor, y solo se activa con fórmulas aprobadas (D-5).
3. **null ≠ 0** (A-18). Todo dato opcional desconocido es `null` y nunca bloquea la cotización.
4. **Snapshot inmutable por cotización.** El documento emitido conserva los datos con los que se calculó: vehículo, inventario, recursos y versiones.
5. **Aditivo y no destructivo** en Supabase. Una migración por cambio, autorizada individualmente y con respaldo real previo (D-8, A-52).
6. **Paridad teléfono y PC** (A-49). Los mismos contratos sirven a ambas interfaces.

## 2. Mapa de módulos y contratos

```text
                        ┌──────────────────────────────┐
                        │  Contratos (fase 0, carril D) │
                        │  src/shared/cargo.ts          │
                        │  src/shared/resources.ts      │
                        │  src/shared/vehicleCatalog.ts │
                        │  src/shared/snapshot.ts (v1/v2)│
                        └──────────────┬───────────────┘
        ┌───────────────────┬──────────┴─────────┬───────────────────────┐
        ▼                   ▼                    ▼                       ▼
 Carril 1: inventario  Carril 2: recursos   Carril 3: vehículos   Carril 4: costo por carga
 InventoryEditor.tsx   ResourcesEditor.tsx  VehiclePicker.tsx     costInputs.ts (adaptador)
 cargoSummary()        resourcesSummary()   catálogo + vínculo    BLOQUEADO (C-2, D-5)
 capacityEstimate()    helperCostLines()
        │                   │                    │
        └─────── QuoteSession: slots inventory/resources/vehicle (sin tocar el motor) ───────┘
```

**Funciones puras del contrato (sin efectos):**

| Función | Entrada | Salida | Uso |
|---|---|---|---|
| `cargoSummary(inv)` | Inventario | Totales de peso y volumen **con su completitud** (`linesWithWeight`, etc.) y texto resumen | Interfaz, snapshot, estimación de capacidad |
| `capacityEstimate(summary, vehicle)` | Resumen + carga útil y volumen (o `null`) | `{ minTrips, basis: 'peso' \| 'volumen', incomplete, reason }` o `null` | **Solo aviso** (cota inferior; nunca tarifa) |
| `resourcesSummary(res)` | Recursos | Minutos declarados por parada, ayudantes por modalidad, líneas de equipamiento | Interfaz y snapshot |
| `helperCostLines(res)` | Recursos | Una línea por ayudante: `{ mode, amount \| null }` | Carril 4 y compatibilidad (§4.3) |
| `readSnapshot(raw)` | `internal` de cualquier versión | Snapshot v2 normalizado (lectura de v1 sin pérdida) | Historial, PDF, enlace, copia a la cuenta |

## 3. Inventario (carril 1, #47)

### 3.1 Esquema `CargoItem` y `CargoInventory`

| Campo | Tipo | Regla |
|---|---|---|
| `kind` | texto ≤ 30 | Tipo de objeto. Lista abierta y sugerida (`refrigerador`, `lavadora`, `sofa`, `cama`, `cajas`, `otro`) |
| `description` | texto 1–80 | Obligatorio |
| `qty` | entero 1–999 | Por defecto 1 |
| `unitWeightKg` | número > 0 y ≤ 5.000, o `null` | Peso por unidad |
| `dimsCm` | `{ l, w, h }` > 0 y ≤ 2.000, o `null` | Las tres o ninguna |
| `volumeM3` | número > 0 y ≤ 100, o `null` | Por unidad |
| `volumeSource` | `'calculado' \| 'declarado' \| null` | Calculado = l × w × h / 10⁶ cuando hay dimensiones; el usuario puede declararlo |
| `fragile` | booleano | Por defecto `false` |
| `handling` | `'normal' \| 'pesado' \| 'voluminoso' \| 'requiere2'` | Por defecto `normal` |

`CargoInventory = { mode: 'rapido' | 'detallado', summary: texto ≤ 200, items: CargoItem[] }`
- **Modo rápido:** sin líneas o con una sola, más el texto `summary`.
- **Límite de líneas:** 200 por cotización en la interfaz (decisión técnica T-1).

### 3.2 Totales y completitud

- `weightKg = Σ qty × unitWeightKg` **solo** de las líneas con peso. Se informa `linesWithWeight / lines`.
- Si falta alguna línea, el total se rotula «al menos X kg (faltan datos)». Es la misma idea de cota que usa el motor.
- El volumen sigue la misma regla.
- **No hay plantillas con pesos ni volúmenes precargados.** Las referencias solo se agregan con fuente (C-2), y en una tabla aparte y versionada.

### 3.3 Estimación de capacidad (aviso)

- Se calcula `minTrips = máx(⌈peso / carga útil⌉, ⌈volumen / volumen de carga⌉)` solo con los datos presentes.
- Siempre muestra: «estimación mínima; no garantiza que la carga quepa por forma, acomodo o puertas».
- Sin carga útil ni volumen del vehículo, devuelve `null` con su motivo («el vehículo no tiene carga útil registrada»).
- **No** modifica el precio ni sugiere sobrecargar.

## 4. Recursos (carril 2, #51)

### 4.1 Esquema

| Bloque | Campos |
|---|---|
| `stops[]` (A y B) | `role: 'A' \| 'B'`, `floor: entero −5..60 \| null`, `elevator: 'si' \| 'no' \| 'noCabe' \| null`, `stairs: boolean \| null`, `carryMeters: 0..1.000 \| null`, `access: texto ≤ 120`, `loadMinutes: 0..1.440 \| null` |
| `helpers[]` | `id`, `mode: 'servicio' \| 'hora'`, `feeService` (solo en el modo servicio), `ratePerHour` (solo en el modo hora), `paidSegments: ('manipulacion' \| 'traslado')[]` (solo en el modo hora), `hours: número \| null` (horas pagadas declaradas) |
| `equipment[]` | `label: texto ≤ 60`, `amount: CLP ≥ 0 \| null` |

### 4.2 Reglas contra la doble contabilización (D-6, aprobada como planificación)

1. **Una modalidad por ayudante** (el esquema lo valida). En el modo servicio, `ratePerHour`, `paidSegments` y `hours` deben ir vacíos, y al revés.
2. **Horas pagadas explícitas:** en el modo hora, `hours` lo declara el transportista y `paidSegments` documenta qué cubren. Sin `hours`, el costo de ese ayudante es **faltante** (`null`), nunca 0.
3. **Tiempo del transportista** (conducción + carga y descarga): alimenta gastos fijos y meta por hora, como hoy. Las horas de los ayudantes **no** se suman a ese tiempo.
4. **Equipamiento:** líneas declaradas que se suman a «otros gastos». No hay porcentajes.

### 4.3 Compatibilidad con el motor actual

- **Hoy:** `TripParams.helpers` (cantidad) y `helperFee` (un monto por ayudante), con el ítem «Ayudantes» = cantidad × monto.
- **Conversión v1 → v2:** N ayudantes con modalidad «servicio» y el mismo `feeService`. El ítem resultante es **idéntico** (casos dorados 64/64).
- **Modalidad «hora»:** el ítem «Ayudantes» sería Σ líneas, con `null` si alguna falta. Es un desembolso declarado (tarifa × horas que escribe el usuario), sin coeficiente. Igual **requiere tu aprobación para programarlo**, porque cambia lo que recibe el motor (D-6 aprobó la planificación, no el código).
- **`loadMinutes` por parada:** el motor recibe la suma de A + B en el campo actual «carga y descarga». Si una parada no tiene dato, se usa solo lo declarado y se rotula. **No hay coeficientes** por piso ni por ascensor: el piso y el ascensor solo orientan al transportista.

## 5. Vehículos y catálogo (carril 3, #46)

### 5.1 Catálogo global `vehicle_catalog`

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid | — |
| `segment` | `'camioneta' \| 'furgon' \| 'camionLiviano'` | `camionMediano` **solo** cuando D-2b esté resuelta (migración aparte) |
| `make`, `model`, `version` | texto | `version` puede ser `''` |
| `year_from`, `year_to` | entero o `null` | — |
| `engine`, `fuel` | texto | Combustible: los mismos valores que hoy más `electrico`, `hibrido` y `gnc` (los no líquidos no usan la fórmula de litros) |
| `km_per_l_ref` + `km_per_l_cycle` | numérico o `null` + `'WLTP' \| 'WLTC' \| 'NEDC' \| null` | Referencial |
| `curb_weight_kg`, `gvw_kg`, `payload_kg` | numérico o `null` | — |
| `cargo_volume_m3`, `cargo_l_mm`, `cargo_w_mm`, `cargo_h_mm`, `door_w_mm`, `door_h_mm` | numérico o `null` | — |
| `sources` | jsonb | `{ campo: { url, title, retrievedAt, confidence } }`. **Todo campo no nulo debe tener fuente** (`check` + prueba) |
| `data_version` | texto | Cambia con cada actualización |

- Con D-9 aprobada: **hasta 15 versiones**, `null` permitido y ninguna sin fuente.
- La carga se hace con una migración de datos revisada y autorizada, **no** con una importación masiva.

### 5.2 «Mis vehículos» (`vehicles`, columnas nuevas y opcionales)

`catalog_id` (FK a `vehicle_catalog`, `on delete set null`), `make`, `model`, `model_year`, `version`, `payload_kg`, `cargo_volume_m3`, `cargo_l_mm`, `cargo_w_mm`, `cargo_h_mm`.
- **Al elegir del catálogo** se **copian** los valores a «Mis vehículos». Desde ese momento son del usuario y los puede ajustar.
- **Si el catálogo cambia,** se muestra «hay datos nuevos» y no se aplica nada solo.
- **Vehículos existentes:** columnas nuevas en `null`. **Funcionan igual que hoy:** el motor solo usa `km_per_l` y `wear_per_km`.
- **Rendimiento y desgaste cargados** (`km_per_l_loaded`, `wear_per_km_loaded`) **no se agregan todavía.** Dependen de C-2 y D-5, en una migración aparte.

### 5.3 Modo sin cuenta

El catálogo es de lectura pública (`anon`), así que el modo sin cuenta también puede usarlo. Para eso «Mis vehículos» local (`cotizador.vehiculos.v1`) incorpora los mismos campos opcionales en un esquema versionado (§6.3).

## 6. Snapshot versionado y compatibilidad histórica

### 6.1 Snapshot `internal` v2 (propuesto)

```text
{ schemaVersion: 2, formulaVersion, engineVersion,
  routeSource, km, minutes, costEstimate, costType, suggestedPrice, margin, missing,   ← igual que la v1
  vehicle: { …v1, catalogId, catalogDataVersion, make, model, modelYear, version, payloadKg, cargoVolumeM3 },
  cargo:   { mode, summary, totals: { weightKg, volumeM3, lines, linesWithWeight, linesWithVolume },
             capacity: { minTrips, basis, incomplete } | null,
             items?: CargoItem[]     ← solo si D-4 = (a); con D-4 = (b) las líneas van en job_cargo_items },
  resources: { stops, helpers, equipment } }
```

### 6.2 Reglas de compatibilidad

| Caso | Comportamiento |
|---|---|
| `internal` sin `schemaVersion` | Se lee como **versión 1**: sin inventario ni recursos; los ayudantes se convierten como en §4.3 solo para mostrarlos. **Nunca se reescribe** |
| `client_quotes` | Sigue **sin `UPDATE`** (A-47). Columnas nuevas opcionales y nulas en las cotizaciones históricas |
| PDF, enlace y WhatsApp de una cotización histórica | Iguales que antes (prueba de regresión con fixtures v1) |
| Número emitido e interno (A-47) | Sin cambios |
| `get_public_quote` | Lista blanca intacta. Si se agrega `service_summary`, se amplía la lista con una prueba (T-2) |

### 6.3 Historial y vehículos locales (sin cuenta)

- Claves actuales `cotizador.trabajos.v1` y `cotizador.vehiculos.v1`: se **leen** con el mismo lector (`readSnapshot`). Los registros nuevos se escriben con `schemaVersion: 2` **en la misma clave**, porque cada registro declara su versión. No hay migración destructiva.
- **Espacio:** localStorage suele permitir unos 5 MB por origen. Un snapshot S5 (~60 KB) daría unas 80 cotizaciones locales. Mitigación: tope de líneas (T-1) y aviso de espacio, que hoy ya existe como error de guardado visible.
- **Copia a la cuenta:** el historial local v1 y v2 se convierte con el mismo lector; idempotencia por `local_id`, igual que hoy.

## 7. Medición del límite de 16 KB

**Método:**
- **Snapshots:** generados por `scripts/diseno/medir-snapshot-16kb.mjs` con la forma v2 propuesta y datos **ficticios**.
- **Inserción:** en un PostgreSQL 16 local y desechable, en una tabla con la **misma restricción de staging**: `check (jsonb_typeof(internal)='object' and pg_column_size(internal) <= 16384)`.
- **Hallazgo:** la restricción se evalúa sobre el valor **sin comprimir**. Una lectura posterior del valor ya almacenado (comprimido) muestra cifras menores que **no** sirven para predecir el rechazo.

| Caso | Bytes JSON | `pg_column_size` (sin comprimir) | % del límite | Inserción con la restricción |
|---|---|---|---|---|
| v1 actual (sin inventario) | 407 | 494 | 3 % | Aceptada |
| S1 un refrigerador | 2.299 | 2.770 | 17 % | Aceptada |
| S2 depto 1 dormitorio (15 líneas) | 6.047 | 7.462 | 46 % | Aceptada |
| S3 depto 3 dormitorios (40 líneas) | 12.749 | 15.850 | **97 %** | Aceptada (al límite) |
| S4 casa grande (80 líneas) | 23.485 | 29.286 | 179 % | **Rechazada** |
| S4b casa grande sin `id` por línea (80) | 19.805 | 25.446 | 155 % | **Rechazada** |
| S5 extremo (150 líneas, textos al máximo) | 51.092 | 61.610 | 376 % | **Rechazada** |
| S5b extremo sin `id` (150) | 44.192 | 54.410 | 332 % | **Rechazada** |
| S6 sin agrupar (300 líneas) | 82.488 | 103.146 | 630 % | **Rechazada** |

Con recursos completos (2 paradas, 3 ayudantes y 4 líneas de equipamiento), cada línea de inventario ocupa unos **330 bytes**.

**Opciones para D-4 (decisión tuya; sigue pendiente):**

| Opción | Cabida | Inmutabilidad | Complejidad | Evaluación |
|---|---|---|---|---|
| (a) Todo en `internal`, con tope de ~35 líneas | Hasta un depto de 3 dormitorios; **no** una casa | Total (un solo documento) | Baja | Limita mudanzas reales |
| **(b) `job_cargo_items` + resumen en `internal`** | Cientos de líneas | Filas **sin `UPDATE`**, insertadas en la **misma transacción** que el trabajo y borradas solo en cascada con él | Media | **Recomendada** |
| (c) Subir el límite de `internal` a 64 KB | Hasta unas 150 líneas | Total | Baja | Se mueve el problema, el tamaño crece sin control y S6 igual excede |

## 8. Cambios propuestos a Supabase (solo diseño; ninguno ejecutado)

Cada bloque es **una migración aparte**. Requiere tu autorización individual y respaldo real previo. Antes, se ensaya en local (ruta B de docs/17).

| # | Migración (borrador) | Contenido | Depende de |
|---|---|---|---|
| M1 | `vehicle_catalog` | Tabla de §5.1; `check` de fuentes por campo; RLS; `GRANT SELECT` a `anon` y `authenticated`; **sin** `INSERT/UPDATE/DELETE` por la API | D-9 (aprobada como diseño), informe C-1 para los datos |
| M2 | `vehicles` ampliado | Columnas opcionales de §5.2 y FK `catalog_id` (`on delete set null`); `GRANT UPDATE` ampliado a las columnas nuevas | M1 |
| M3 | `job_cargo_items` | Si D-4 = (b): tabla con `owner_id`, `job_id`, `position`, campos de §3.1; FK compuesta `(owner_id, job_id)` → `jobs(owner_id, id)` `on delete cascade`; RLS `SELECT/INSERT/DELETE` por dueño; **sin `UPDATE`** | D-4 |
| M4 | Guardado atómico v2 | Nueva función `create_job_with_quote_v2(p_job, p_quote, p_cargo_items)` que inserta trabajo, cotización y líneas en **una** transacción; la v1 se mantiene para clientes antiguos | M3 |
| M5 | `client_quotes.service_summary` | Texto ≤ 300 para el cliente; ampliar `get_public_quote` y su lista blanca, con prueba | T-2 |
| — | `tax_mode`, `tax_rate` | **No en este diseño:** van con #37, después del informe de #16 (D-7) | D-7 |

**RLS propuesto:**

| Objeto | `anon` | `authenticated` (dueño) | `authenticated` (otro usuario) |
|---|---|---|---|
| `vehicle_catalog` | `SELECT` | `SELECT` | `SELECT` |
| `vehicles` (columnas nuevas) | — | `SELECT/INSERT/UPDATE/DELETE` | — |
| `job_cargo_items` | — | `SELECT/INSERT/DELETE` (sin `UPDATE`) | — |
| `get_public_quote` | `EXECUTE` (lista blanca) | `EXECUTE` | `EXECUTE` |

**Verificaciones que se agregan** (cuando se autorice ejecutar):
- **`verificar-rls.mjs`:** el catálogo se puede leer pero no escribir; B no ve líneas de A; ninguna línea se puede modificar.
- **`verificar-restauracion.sql`:** conteos e invariantes de las tablas nuevas.
- **Prueba de fuentes:** ningún valor del catálogo sin fuente.

## 9. Distribución de tareas paralelas (desarrollo posterior, cuando se autorice)

| Fase | Carril | Entrega | Archivos propios (sin solaparse) | Puede empezar |
|---|---|---|---|---|
| 0 | D | **Contratos:** tipos y esquemas Zod de inventario, recursos y catálogo; `readSnapshot` v1/v2; fixtures v1 de regresión | `src/shared/cargo.ts`, `resources.ts`, `vehicleCatalog.ts`, `snapshot.ts`, `tests/contratos.*` | Con tu autorización de desarrollo |
| 1 | 1 | Editor de inventario (rápido y detallado), `cargoSummary`, aviso de capacidad | `src/web/components/Inventory*.tsx`, `src/shared/cargoSummary.ts`, `tests/inventario.*` | Al terminar la fase 0 |
| 1 | 2 | Editor de recursos (paradas, ayudantes, equipamiento), `resourcesSummary`, conversión v1 de ayudantes | `src/web/components/Resources*.tsx`, `src/shared/resourcesSummary.ts`, `tests/recursos.*` | Al terminar la fase 0, en paralelo con el carril 1 |
| 1 | 3 | Selector de catálogo y «Mis vehículos» ampliado (con datos de prueba **sin** valores reales hasta C-1) | `src/web/components/VehiclePicker*.tsx`, `src/web/cloud/vehicleCatalog.ts`, `tests/catalogo.*` | Al terminar la fase 0; los datos reales, tras C-1 y M1 |
| 2 | Integración | Ranuras en `QuoteSession` y `Calculator.tsx` para los tres editores; snapshot v2 al guardar | `src/web/session.ts`, `Calculator.tsx`, `jobs.ts` (**un solo responsable**) | Tras los carriles 1 a 3 |
| 3 | 4 | Adaptador `costInputs` y fórmulas aprobadas | `src/shared/costInputs.ts`, motor | **Bloqueado:** C-2 y D-5 |
| ∀ | QA | e2e por carril en Pixel 7, iPhone 13, 1366 y 1440 (#50) | `scripts/e2e-*` | Con cada carril |

**Reglas de coordinación:**
- Ningún carril edita archivos de otro.
- `session.ts`, `Calculator.tsx` y `jobs.ts` se tocan **solo** en la integración.
- Cada carril llega en su propio PR o commit, con pruebas.
- Los casos dorados 64/64 deben seguir en verde en cada entrega.

## 10. Criterios de aceptación del diseño

- [ ] Auditoría de ChatGPT sin hallazgos P0/P1.
- [ ] Decisión del propietario sobre D-4, con los datos de §7.
- [ ] Decisiones técnicas T-1 a T-6 (§11) resueltas o diferidas de forma explícita.
- [ ] Autorización expresa para empezar la fase 0 de desarrollo, que hoy **no** está autorizada.

## 11. Decisiones técnicas pendientes del propietario

| ID | Decisión | Recomendación |
|---|---|---|
| **D-4** | Inventario: (a) en `internal` con tope, (b) tabla `job_cargo_items` + resumen o (c) subir el límite | **(b)**, por la medición de §7 |
| T-1 | Tope de líneas de inventario por cotización | 200 en la interfaz (en local, ~60 KB por cotización como máximo) |
| T-2 | `service_summary` para el cliente: generado automáticamente, editable o ambos; ampliar la lista blanca del enlace público | Generado y editable; ampliar la lista con prueba |
| T-3 | Datos de accesibilidad también para la parada «base» | No: solo A y B (la base es del transportista) |
| T-4 | Historial local: misma clave con versión por registro, o clave nueva `v2` | Misma clave, versión por registro (sin migración destructiva) |
| T-5 | Fuentes del catálogo: `sources jsonb` por campo o tabla aparte de fuentes | `jsonb` por campo (piloto de ≤ 15 versiones) |
| T-6 | Guardado: nueva función `create_job_with_quote_v2` o modificar la actual | Nueva función; la actual sigue disponible |
| D-2b, D-5, D-7, D-10 | Siguen pendientes (§12 del plan) | Sin cambios |

## 12. Lo que este diseño NO hace

No programa funciones, no ejecuta migraciones, no modifica el motor ni sus fórmulas, no carga datos al catálogo, no implementa IVA y no activa Google Routes. La medición de §7 se hizo en un PostgreSQL **local y desechable**, sin tocar Supabase.
