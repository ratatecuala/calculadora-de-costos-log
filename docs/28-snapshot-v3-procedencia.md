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

**El origen se registra en el momento en que se fija el valor, no se deduce al emitir** (corrección tras la [revisión de GPT](https://github.com/ratatecuala/calculadora-de-costos-log/pull/34#issuecomment-7182498521)). La sesión guarda, por cada campo económico (los 10 parámetros, el margen y los recargos), qué evento fijó su valor vigente y la **fecha local del dispositivo** de ese evento. Esos orígenes también van en el borrador.

| Evento registrado | Clase · fuente · fecha |
|---|---|
| Campo vacío (cualquier evento) | `faltante` · usuario («no ingresado») · `null` |
| «Cargar ejemplo ficticio», sin editar después | `simulado` · ejemplo · `null` |
| Elegir o restaurar «Mi vehículo» (km/L y desgaste) | `declarado` · vehiculo · fecha de la última edición del perfil (`null` si no se conoce, p. ej., tras recuperar un borrador) |
| El usuario escribe el valor, aunque coincida con el del vehículo o con el inicial (p. ej., 0 ayudantes) | `declarado` · usuario · fecha local en que lo escribió |
| Ningún evento y valor igual al inicial del formulario | `declarado` · valorInicial · fecha de emisión (cuando se aceptó) |
| Ningún evento y otro valor (p. ej., un borrador anterior a este cambio) | `declarado` · usuario · «origen no registrado» · `null` (no se inventa) |

`registradoEl` también es la fecha local (antes se tomaba la UTC, que en Chile pasa al día siguiente después de las 21:00). La app aún **no produce** `medido` ni `comprobado`: llegarán con el instrumento 0B ([29](29-herramienta-medicion.md)) y los datos de referencia.

El esquema es estricto y rechaza, entre otros: un parámetro sin unidad o con otra unidad, un faltante con valor, un valor sin procedencia, vigencias invertidas, versiones que no coinciden con las de la cotización, un margen distinto del registrado, un vehículo cuyo km/L o desgaste no coincide con los parámetros, **partidas sin km o minutos retenidos (A-38)** y **un registro de más de 11000 bytes en UTF-8**. Emitir, leer y copiar pasan por el mismo esquema, así que estas reglas se aplican en los tres caminos.

El snapshot es un registro de lo emitido, **no un respaldo criptográfico**: no lleva firma ni huella y no prueba la hora.

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
| manual con vehículo | 3981 | 4910 |
| ejemplo (simulado) | 3753 | 4610 |
| con faltantes | 3754 | 4538 |
| ruta simulada (km nulos) | 3334 | 4004 |
| nombre de vehículo con caracteres de 3 y 4 bytes («€», «漢», emojis) | 4123 | 5026 |
| **v3 máxima** (todos los textos al tope, caracteres de 2 bytes) | **10643** | **11606** |

Límites: cliente 11000 bytes (`MAX_CLOUD_INTERNAL_JSON_BYTES`), base 16384 (`CHECK`). Para que el peor caso cupiera se fijaron topes: `detalle` ≤ 60, `version` ≤ 20, ≤ 10 partidas con `id` ≤ 20.

**Caracteres de 3 y 4 bytes.** Los topes de texto cuentan caracteres, no bytes, así que la «v3 máxima» con caracteres de 2 bytes no era el máximo Unicode: con caracteres de 3 bytes llega a 13739 bytes. Por eso el tamaño total en UTF-8 pasó a ser parte del contrato v3: una v3 sobre 11000 bytes **no se emite**. El error es explícito y no se guarda nada a medias, de modo que toda v3 guardada se puede copiar a la cuenta sin recortes. En la práctica no se alcanza: los únicos textos que escribe el usuario son cortos (nombre del vehículo, ≤ 40 caracteres). El ensayo confirma que esos textos se guardan carácter por carácter y que la v3 de 3 bytes la rechaza el cliente con su motivo.

**Pendiente:** el mismo ensayo contra staging real requiere autorización (A-59) y no se ejecutó.

## 7. Pruebas

| Prueba | Resultado (26-11, Claude, ejecutadas) |
|---|---|
| `tests/snapshot-v3.test.ts` | **25/25** |
| `npm test` completo | **722/722** (antes 697) |
| `tsc` y `npm run build` | sin errores |
| Mutaciones | **6/6 detectadas** en la primera entrega: datos internos en la cotización del cliente, volver a emitir v1, borrador que pierde las marcas, ejemplo clasificado como declarado, nube sin validar v3, partidas que ignoran A-38. **6/6** tras la revisión: sin regla A-38 al leer, sin tope UTF-8, fecha de emisión en lugar de la del evento, fecha UTC en lugar de la local, vehículo sin registrar su origen, fecha inventada sin evento |
| Ensayo PostgreSQL local (§6) | todo OK en `staging` y `todas` |
| `scripts/e2e-flujo-completo.mjs` (Pixel 7 y PC 1366, sin flags) | **154/154**; la verificación 8 ahora exige v3 con vehículo, tramos declarados y procedencia |
| `scripts/e2e-integracion.mjs` con la flag / `--sin-flag` | **278/278** / **24/24** (sin flag ahora exige v3 sin carga) |
| `scripts/e2e-precio-entero.mjs` | **44/44** |
| `scripts/e2e-numeros.mjs` (con y sin flag) | **900/900** (tras las correcciones de A-90) |

Las e2e de integración detectaron una regresión de las correcciones de A-90: un origen registrado en un campo que luego se vaciaba dejaba un borrador «vacío» (P1-1 de I-1). Se corrigió: al borrador solo van los orígenes de campos que siguen distintos del valor inicial, y se agregó una prueba que la detecta. Tras la corrección: flujo completo 154/154, integración 278/278 y 24/24 sin flag, precio entero 44/44 y números 900/900.

No probado: Safari real, staging real, cuentas reales.

## 8. Limitaciones y decisiones pendientes

- **D-A1:** con `VITE_FF_INTEGRACION_CARGA` encendida se sigue emitiendo v2 sin `economia`. Recomendación aceptada por GPT: diferir la unión de carga y procedencia mientras las flags estén apagadas.
- **D-A2:** la interfaz no muestra todavía la procedencia (p. ej., «valor del ejemplo» junto al campo). GPT recomienda mostrar la procedencia y las exclusiones al implementar A-89.
- `medido` y `comprobado` no se producen aún; dependen de [29](29-herramienta-medicion.md) y de datos de referencia (#20, #21, C-1).
- Los borradores guardados antes de este cambio no traen orígenes: sus valores quedan como «origen no registrado», sin fecha.
- **D-A4 · Inferencia con la ruta no retenida (A-38):** aunque km, minutos y partidas se omitan, el costo total (ya guardado en v1) junto con los parámetros puede permitir **deducir** los km o los minutos. Por ejemplo, si faltan los costos por hora, el costo queda lineal en los km. Hoy esto solo ocurre con la **ruta simulada** (datos ficticios, sin condiciones de un proveedor), porque Google real no está autorizado. **Antes de habilitar un proveedor real** hay que decidir entre: (a) guardar los parámetros igual, si las condiciones del proveedor lo permiten; (b) omitir en ese caso los valores que multiplican distancia o tiempo, dejando su procedencia; (c) no emitir v3 con una ruta no retenible. Es una decisión contractual que no se reabre aquí y que no se resuelve guardando datos del proveedor.
- Hallazgo previo, fuera de A-88: la fecha de la cotización (`createdAt`) se toma en UTC (`QuoteForm.tsx`), así que una cotización emitida después de las 21:00 en Chile muestra la fecha del día siguiente. Afecta a v1, v2 y v3 y al documento del cliente. Corregirlo requiere autorización.
- **A-89 (modalidades simplificada y detallada):** v3 ya guarda los 10 parámetros con su procedencia, de modo que una cotización simplificada (sin gastos fijos) se distingue por sus faltantes o valores iniciales, no por ceros. Cuando se implemente A-89 convendrá añadir un campo `modalidad` y las exclusiones declaradas: es un campo nuevo de un esquema estricto, por lo que irá en una versión posterior (v4) sin tocar las v3 emitidas. Decisión D-A3, junto con la implementación de A-89 (GPT: versión posterior explícita, preservando v1 a v3).
- `staging` sigue con la versión del 18-11: no emite v3 hasta un despliegue autorizado.
