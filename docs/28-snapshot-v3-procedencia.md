# 28 · Contrato de procedencia y snapshot v3 (A-88, Frente A)

**Estado:** IMPLEMENTADO EN LA RAMA, ensayado solo en local (26-11-2026, hora de Chile). Autorización: [A-88 en #43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7182067903). **No se modificaron fórmulas.** No se tocó Supabase ni staging, no se crearon migraciones, no se encendieron flags y no se desplegó nada. Diseño de origen: [26 §3](26-preparacion-fase-0.md#3-arquitectura-propuesta-para-incorporar-datos-sin-retrabajo).

## 1. Qué cambia para el usuario

Nada visible. La calculadora, la cotización, el PDF, WhatsApp y el enlace público se ven igual. Lo nuevo queda **solo en la copia interna** de cada cotización emitida: los parámetros económicos que realmente se usaron y, para cada uno, de dónde salió.

## 2. Contrato de procedencia (`src/shared/procedencia.ts`)

Un único contrato, reutilizable después por combustible, peajes, catálogo y calibración. El motor **no** lo lee: sigue recibiendo números.

| Campo | Contenido |
|---|---|
| `clase` | `medido`, `comprobado`, `declarado`, `estimado`, `simulado` o `faltante` |
| `fuente.tipo` | `usuario`, `valorInicial`, `vehiculo`, `ejemplo`, `ruta`; reservados: `referencia`, `medicion`, `comprobante` |
| `fuente.detalle` | texto breve sin datos personales (máx. 60) o `null` |
| `fecha` | fecha del dato (AAAA-MM-DD) o `null` si no se conoce |
| `vigenteDesde`, `vigenteHasta` | vigencia declarada por la fuente o `null`; desde ≤ hasta |
| `version` | versión del conjunto de datos de origen (máx. 20) o `null` |

Un **dato económico** es `{valor, unidad, procedencia}` y cumple `valor === null` ⇔ `clase === 'faltante'`. Nada se inventa: si no se conoce una fecha o una versión, queda `null`; un faltante nunca se convierte en 0 (A-18).

## 3. Snapshot v3

Mismos campos comunes que v1 (montos, costo, precio, recorrido según la retención A-38, vehículo, faltantes), **sin detalle de carga** y con un bloque nuevo `economia`:

- `registradoEl`: fecha de emisión.
- `parametros`: los 10 parámetros del motor (`fuelPricePerL` CLP/L, `kmPerL` km/L, `wearPerKm` CLP/km, `fixedPerHour` y `ownerPerHour` CLP/h, `helpers` personas, `helperFee` CLP, `loadMinutes` min, `tolls` y `otherCosts` CLP), cada uno como dato económico con su unidad fija.
- `recorrido`: procedencia de los km y de los minutos (declarado si se escribió a mano, simulado si viene del simulador, estimado si viene de un proveedor).
- `margen` (fracción) y `recargos` (CLP), con su procedencia.
- `partidas`: el desglose del motor tal como se calculó (máx. 10). **`null` cuando los km o minutos no se pueden retener** (ruta simulada o de un proveedor, A-38), porque las partidas permitirían reconstruirlos.
- `versiones`: motor, fórmulas y versión de los datos de combustible, catálogo y peajes (hoy `null`: no hay datos de referencia integrados).

Reglas de clasificación al emitir (`src/web/jobs.ts`):

| Situación | Clase · fuente |
|---|---|
| Campo vacío | `faltante` · usuario («no ingresado») |
| Valor cargado con «Cargar ejemplo ficticio» y no editado | `simulado` · ejemplo |
| km/L o desgaste iguales a «Mi vehículo» | `declarado` · vehiculo |
| Valor con que parte el formulario, aceptado sin cambiar (p. ej., 0 ayudantes) | `declarado` · valorInicial |
| Valor escrito por el usuario | `declarado` · usuario, con fecha |

La app aún **no produce** `medido` ni `comprobado`: llegarán con el instrumento 0B ([29](29-herramienta-medicion.md)) y los datos de referencia. Para saber qué valores vienen del ejemplo, la sesión marca cada campo cargado así; editar un campo le quita la marca solo a ese campo. Las marcas se guardan en el borrador.

El esquema es estricto y rechaza, entre otros: un parámetro sin unidad o con otra unidad, un faltante con valor, un valor sin procedencia, vigencias invertidas, versiones que no coinciden con las de la cotización, un margen distinto del registrado y un vehículo cuyo km/L o desgaste no coincide con los parámetros.

## 4. Qué versión se emite

| Flags de carga | Antes | Ahora |
|---|---|---|
| Apagadas (situación actual) | v1 | **v3** |
| `VITE_FF_INTEGRACION_CARGA` encendida | v2 | v2 (sin cambio; sin `economia`) |

v1 y v2 **no se tocan**: se leen igual que antes y no se recalculan. Una v3 tampoco se recalcula al leerla (ni siquiera si fue manipulada: se muestra lo guardado o se declara ilegible). Unificar v2 con `economia` queda para cuando se autorice I-2/I-3 (decisión D-A1, §8).

## 5. Caminos verificados

| Camino | Resultado |
|---|---|
| Emitir y guardar en el navegador (repositorio local) | ida y vuelta idéntica |
| Leer el historial («Mis trabajos») | v1, v2 y v3 se muestran; v3 sin recalcular |
| Guardar en la cuenta (`create_job_with_quote`) | v3 validada con `toCloudPayload` antes de enviar; una v3 inválida **no se envía** y muestra «No se guardó en tu cuenta» |
| Leer desde la cuenta (`jobFromRow`) | ida y vuelta idéntica |
| Copiar el historial local a la cuenta (`migration.ts`) | se clasifica como `v3` y se copia; una v3 inválida queda como ilegible |
| Borrador | guarda y recupera las marcas de ejemplo; un borrador antiguo parte sin marcas; claves desconocidas se descartan |
| Cotización del cliente (PDF, WhatsApp, enlace público, `client_quotes`) | lista blanca sin cambios: idéntica a la de v1 y sin `economia`, procedencia, parámetros ni partidas |

## 6. Supabase: no necesita migración (comprobado)

No se asumió: se ensayó con PostgreSQL 16 **local y desechable** (`scripts/diseno/v3/ensayar-v3.sh`), aplicando las migraciones **reales** del repositorio, en dos modos:

- `MIGRACIONES=staging`: solo las 3 del 18-11 (lo que tiene hoy staging según [25 §1.1](25-lista-staging-52.md));
- `MIGRACIONES=todas`: las 7 (con #52, I-2 y precio entero, aún sin aplicar en staging).

Cinco cotizaciones armadas con el **código real del cliente** se guardan como `authenticated` con `create_job_with_quote`. En ambos modos: todas se guardan, `jobs.internal` queda **idéntico** a lo enviado, `client_quotes` no contiene nada interno y un `internal` de más de 16 KB sigue rechazado por el `CHECK` existente (control negativo).

| Caso | Bytes en el cliente | `pg_column_size` sin comprimir |
|---|---|---|
| manual con vehículo | 3965 | 4886 |
| ejemplo (simulado) | 3753 | 4610 |
| con faltantes | 3754 | 4538 |
| ruta simulada (km nulos) | 3334 | 4004 |
| **v3 máxima** (todos los textos al tope, caracteres de 2 bytes) | **10643** | **11606** |

Límites: cliente 11000 bytes (`MAX_CLOUD_INTERNAL_JSON_BYTES`), base 16384 (`CHECK`). Para que el peor caso cupiera se fijaron topes: `detalle` ≤ 60, `version` ≤ 20, ≤ 10 partidas con `id` ≤ 20.

**Pendiente:** el mismo ensayo contra staging real requiere autorización (A-59) y no se ejecutó.

## 7. Pruebas

| Prueba | Resultado (26-11, Claude, ejecutadas) |
|---|---|
| `tests/snapshot-v3.test.ts` | **19/19** |
| `npm test` completo | **716/716** (antes 697) |
| `tsc` y `npm run build` | sin errores |
| Mutaciones | **6/6 detectadas**: datos internos en la cotización del cliente, volver a emitir v1, borrador que pierde las marcas, ejemplo clasificado como declarado, nube sin validar v3, partidas que ignoran A-38 |
| Ensayo PostgreSQL local (§6) | todo OK en `staging` y `todas` |
| `scripts/e2e-flujo-completo.mjs` (Pixel 7 y PC 1366, sin flags) | **154/154**; la verificación 8 ahora exige v3 con vehículo, tramos declarados y procedencia |
| `scripts/e2e-integracion.mjs` con la flag / `--sin-flag` | **278/278** / **24/24** (sin flag ahora exige v3 sin carga) |
| `scripts/e2e-precio-entero.mjs` | **44/44** |

No probado: Safari real, staging real, cuentas reales.

## 8. Limitaciones y decisiones pendientes

- **D-A1:** con `VITE_FF_INTEGRACION_CARGA` encendida se sigue emitiendo v2 sin `economia`. Propuesta: una v4 (o v3 con carga) cuando se autorice I-2/I-3.
- **D-A2:** la interfaz no muestra todavía la procedencia (p. ej., «valor del ejemplo» junto al campo). Requiere diseño UX y autorización.
- `medido` y `comprobado` no se producen aún; dependen de [29](29-herramienta-medicion.md) y de datos de referencia (#20, #21, C-1).
- Los borradores guardados antes de este cambio no traen marcas de ejemplo: si se emitieron con valores del ejemplo sin editar, esos valores quedan como `declarado`.
- **A-89 (modalidades simplificada y detallada):** v3 ya guarda los 10 parámetros con su procedencia, de modo que una cotización simplificada (sin gastos fijos) se distingue por sus faltantes o valores iniciales, no por ceros. Cuando se implemente A-89 convendrá añadir un campo `modalidad` y las exclusiones declaradas: es un campo nuevo de un esquema estricto, por lo que irá en una versión posterior (v4) sin tocar las v3 emitidas. Decisión D-A3, junto con la implementación de A-89.
- `staging` sigue con la versión del 18-11: no emite v3 hasta un despliegue autorizado.
