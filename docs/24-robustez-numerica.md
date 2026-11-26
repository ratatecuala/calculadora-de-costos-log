# 24 · Robustez ante números extremos en la calculadora (A-71)

**Versión 3 · 22-11-2026 · Estado: IMPLEMENTADA.** A-71 está auditada (0 P0 · 0 P1 · 2 P2). A-73 (§7) está auditada (0 P0 · 1 P1). El P1 se corrigió con A-75 (§8), con reauditoría solicitada.
- **Autorización:** A-71, [registro en #43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7071778285).
- **Origen:** la [reauditoría de D-I8](https://github.com/ratatecuala/calculadora-de-costos-log/issues/53#issuecomment-7071695047) y la observación de [22 §16.3](22-diseno-integracion-cotizador.md): un número finito pero enorme, como `1e308`, escrito en cualquier campo, podía hacer fallar el motor y cerrar la calculadora.

**Sin cambios en:**
- el motor ni sus fórmulas (`src/engine`, casos dorados 64/64);
- `src/server`, `src/shared` y Supabase;
- las flags, que siguen apagadas;
- staging, despliegues y merge: no hubo ninguno.

## 1. Problema

`parseAmount` acepta cualquier número finito ≥ 0. El motor sí valida, pero lo hace **lanzando una excepción**:
- `buildCostItems` lanza `InvalidTripInputError` con km, minutos, ayudantes o carga y descarga negativos o no finitos;
- `computeMeasures` lanza `InvalidAmountError` si una partida es infinita;
- `computeMeasures` lanza `InvalidMarginError` si el margen está fuera de 0–80 %.

Como la calculadora llamaba al motor durante el dibujo de la pantalla, la excepción la cerraba.

**Ejemplos verificados antes de la corrección:**
- 1e308 km → combustible infinito;
- un rendimiento de 1e-300 km/L con combustible a $1e10 → combustible infinito;
- una «carga y descarga» de 1e308 → gastos fijos infinitos.

## 2. Auditoría de las entradas numéricas y límites técnicos

| Campo | Antes | Límite técnico (A-71) | Faltante (vacío) | Cero | Fundamento |
|---|---|---|---|---|---|
| Km por tramo, manual o corrección | Cualquier finito ≥ 0 | 0–100.000 km | Tramo incompleto: sin costo | Dato válido | Mismo tope que A-70; supera cualquier viaje por carretera |
| Minutos por tramo | Cualquier finito ≥ 0 | 0–100.000 min | Tramo incompleto | Válido | ≈ 69 días; mismo tope que A-70 |
| Precio del combustible | Cualquier finito ≥ 0 | 0–100.000 $/L | «No lo sé»: combustible faltante | Válido | Unas 70 veces el precio actual |
| Rendimiento | Cualquier finito ≥ 0 | **0** (sin dato, como hoy) o **0,1–100 km/L** | Combustible faltante | Combustible faltante (comportamiento previo) | El máximo es el del formulario de «Mi vehículo»; el mínimo de 0,1 evita dividir por casi cero |
| Desgaste | Cualquier finito ≥ 0 | 0–10.000 $/km | Faltante | Válido | Igual que el formulario de «Mi vehículo» |
| Gastos fijos | Cualquier finito ≥ 0 | 0–10.000.000 $/h | Faltante | Válido | Holgado |
| Lo que quieres ganar | Cualquier finito ≥ 0 | 0–10.000.000 $/h | Faltante | Válido | Holgado |
| Ayudantes | **Se redondeaba** en silencio (2,5 → 3) | Entero 0–100 | Vacío se muestra como 0 (como hoy) | Sin ayudantes | Ya no se redondea: con decimales es inválido |
| Pago por ayudante | Cualquier finito ≥ 0 | 0–9.999.999.999 $ (`MAX_CLP`) | Faltante si hay ayudantes | Válido | Tope monetario del proyecto |
| Peajes y TAG | Cualquier finito ≥ 0 | 0–`MAX_CLP` | «No lo sé» | «No hay peajes» | Tope monetario |
| Peajes de la comparación sin peajes | Cualquier finito ≥ 0 | 0–`MAX_CLP` | «No lo sé» | Válido | Solo pausa la comparación |
| Carga y descarga | Cualquier finito ≥ 0 | 0–100.000 min | Vacío se muestra como 0 (como hoy) | Válido | Igual que los minutos por tramo |
| Otros gastos | Cualquier finito ≥ 0 | 0–`MAX_CLP` | Vacío se muestra como 0 (como hoy) | Válido | Tope monetario |
| Margen («Otro») | **Se recortaba** en silencio a 0–80 % | 0–80 % | Vacío se muestra como 0 % (como hoy) | Válido | Regla del motor. Ya no se recorta: fuera de rango es inválido |
| Recargos | Cualquier finito ≥ 0 | 0–`MAX_CLP` | Vacío se muestra como 0 (como hoy) | Válido | Tope monetario |
| Precio que vas a cobrar | Cualquier finito ≥ 0 | 0–`MAX_CLP` | Sin precio: no se cotiza | Válido | Coincide con el `CHECK net_price < 10^10` de la base |

**Sin cambios:**
- **Vehículos:** el formulario ya valida con Zod (0 < rendimiento ≤ 100, desgaste ≤ 10.000).
- **Inventario y recursos:** ya validan con sus contratos (`MAX_CLP`, cm enteros, ≤ 24 h, etc.).

**Peor caso** (todos los campos en su tope, 3 tramos): combustible = 300.000 / 0,1 × 100.000 = 3·10^11; ayudantes = 100 × `MAX_CLP` ≈ 10^12. El costo queda en ≈ 1,5·10^12 y el precio sugerido con 80 % de margen en ≈ 7,6·10^12. Todo es finito y está muy por debajo de `Number.MAX_SAFE_INTEGER` (≈ 9·10^15): **ninguna operación intermedia puede dar infinito**. Hay una prueba que lo comprueba con todos los topes a la vez.

## 3. Diseño

| Pieza | Archivo | Qué hace |
|---|---|---|
| Límites | `src/web/numericLimits.ts` | `PARAM_LIMITS`, `LEG_LIMITS`, `MONEY_LIMIT`, `MARGIN_LIMIT`, `limitIssue` (mensaje claro o `null`) y `numericIssues(estado)` (errores por campo). `null` (faltante) nunca es un error |
| Pausa del cálculo | `session.ts` (`safeCompute`) | Con un error que afecta a la ruta, `computation()` devuelve `null`. **Nada se reemplaza:** el valor escrito queda en el estado. Excepción: un precio elegido fuera de rango no pausa el costo (se calcula sin ese precio), pero impide cotizar |
| Barrera | `session.ts` (`computationError`) | Si, pese a los límites, el motor lanzara un error, la excepción queda contenida: `computation()` devuelve `null` y se muestra «No se pudo calcular con estos valores…» |
| Cotizar | `session.ts` (`canQuote`) y `jobs.ts` (`buildJobRecord`) | Con cualquier valor fuera de rango no se puede cotizar, tampoco desde el último paso |
| Interfaz | `Calculator.tsx` | Error junto a cada campo (`aria-invalid` y mensaje), aviso general «Hay valores fuera de rango… no se cambió ningún dato» y textos de ayuda coherentes con la pausa. El campo «Otro» del margen se abre solo si el margen es inválido |
| Valores enormes | `NumberField.tsx` | `1e308` se muestra tal como se escribió, no con 309 dígitos |
| Recuperación del borrador (A-70) | `session.ts` (`computesSafely`) | «Fallaría» incluye ahora los valores fuera de rango: el recorrido recuperado se descarta si los demás datos están fuera de rango, igual que antes |

**Cambios de comportamiento** (todos para no reemplazar valores en silencio):
1. Ayudantes con decimales: antes se redondeaban; ahora se marcan como inválidos.
2. Margen «Otro» fuera de 0–80 %: antes se recortaba; ahora se marca.
3. Rendimiento entre 0 y 0,1 km/L: antes se aceptaba; ahora se marca. El 0 sigue significando «sin dato».

## 4. Compatibilidad

| Caso | Resultado |
|---|---|
| Cotizaciones antiguas (historial, vista, PDF, enlace) | No pasan por el cálculo: **sin cambios** |
| Cotización emitida con valores válidos | **Idéntica** (prueba); casos dorados 64/64 |
| Borradores válidos | Se recuperan igual (prueba) |
| Borrador con un valor fuera de rango | Se recupera con el valor **intacto** y su error a la vista. El recorrido manual se descarta (regla A-70) y la pantalla no se cae |
| Vehículo guardado con un rendimiento menor que 0,1 (su formulario lo permite) | Al aplicarlo, el campo se marca; no se cae |
| Con y sin flags | Probado: E2E en ambos modos; render con y sin el detalle de carga |

## 5. Pruebas (ejecutadas por Claude, 22-11-2026)

**Unitarias nuevas** (`tests/limites-numericos.test.ts`, 32):
- límites exactos, apenas sobre el tope, 1e308, negativos, `NaN` e `Infinity` en cada parámetro;
- enteros en ayudantes; rendimiento entre 0 y 0,1;
- inválido, faltante y cero en peajes;
- **1e308 en cada uno de los 14 campos**: el cálculo queda en pausa sin lanzar, no se puede cotizar, `buildJobRecord` no emite, el valor se conserva y la pantalla se dibuja con el error, con y sin el detalle de carga;
- al corregir el valor, el cálculo vuelve idéntico;
- **todos los topes a la vez: todo finito**;
- combinaciones que desbordan el motor sin límites (y en la sesión no lanzan);
- margen 90 % y 80 %; precio sobre el tope;
- corrección sobre una ruta del proveedor; comparación sin peajes;
- vehículo con 0,05 km/L;
- barrera con un fallo simulado del motor;
- compatibilidad con borradores y cotizaciones.

**E2E nuevo** (`scripts/e2e-numeros.mjs`), **con y sin la flag**, en Pixel 7, iPhone 13 (emulado), 1366 y 1440:
- en cada campo, 1e308 marca el campo con su mensaje, muestra el aviso, pausa la cotización y conserva lo escrito en notación corta; al volver al valor original, todo vuelve;
- km en el tope exacto y justo sobre él; km negativo;
- ayudantes 2,5; rendimiento 0,05 y 0;
- margen 90 % y 80 %; precio sobre el tope, con el costo todavía visible;
- combinación que desbordaría el motor;
- sin desplazamiento horizontal en el teléfono y sin errores de página.

| Prueba | Resultado |
|---|---|
| `npm test` | **600/600** (568 + 32) |
| Casos dorados | **64/64** |
| Typecheck y 3 builds | Sin errores |
| `e2e-numeros.mjs` (con y sin flag) | **540/540** |
| `e2e-integracion.mjs` con la flag | **278/278**, dos corridas |
| `e2e-integracion.mjs --sin-flag` | **24/24** |
| `e2e-modulos.mjs` | **210/210** |
| `e2e-staging-anonimo.mjs` en local, sin y con flag | **54/59** (las 5 fallas de entorno de siempre) |
| `src/engine`, `src/server`, `src/shared`, `supabase/` | **Sin cambios** |

**Defectos reintroducidos a propósito: 15, todos detectados.**

| Defecto | Unitarias | E2E |
|---|---|---|
| Sin tope en el precio del combustible | 3 | — |
| Sin el mínimo de 0,1 en el rendimiento | 3 | — |
| Ayudantes sin exigir enteros | 2 | — |
| Los tramos no se validan | 2 | — |
| Sin la barrera de cálculo | 1 | — |
| Los errores no pausan el cálculo | 17 | — |
| `canQuote` ignora los errores | 1 | — |
| `buildJobRecord` sin la guarda | 1 | — |
| Vuelve el redondeo silencioso de ayudantes | No detectado: el render estático no ejecuta `onChange` | **8 fallas** |
| El campo de desgaste no muestra el error | 1 | — |
| Sin el aviso general | 14 | — |
| Un precio inválido pausa todo el costo | 1 | — |
| Vuelve el recorte silencioso del margen | — | **8 fallas** |
| Sin la notación corta (309 dígitos al salir del campo) | — | **104 fallas** |
| Los tramos no muestran su error | — | **16 fallas** |

## 6. Pendiente y observaciones

- *Estado actual: corregido por A-73 (§7).* **Texto no numérico (A-50, sin cambios en A-71):** un texto que no es un número, como `abc`, `-5` o `1e400` (que se vuelve infinito al leerlo), se avisa en el campo y cuenta como **faltante**, tal como se aprobó en A-50. Los valores numéricos fuera de rango, en cambio, **pausan** el cálculo. Si prefieres que el texto inválido también pause el cálculo, es una decisión aparte.
- *Estado actual: alineado por A-73 (§7).* **Formulario de «Mi vehículo»:** admitía rendimientos entre 0 y 0,1 km/L, que la calculadora marca al aplicarlos. Alinear el mínimo de ese formulario cambiaría su esquema compartido y la lectura de los perfiles guardados, y no se hizo sin tu autorización.
- **No probado:** Safari real, lector de pantalla y staging, que no se desplegó.

## 7. Auditoría de A-71 (0 P0 · 0 P1 · 2 P2) y correcciones de validación (A-73, 22-11-2026)

- **[Auditoría](https://github.com/ratatecuala/calculadora-de-costos-log/issues/53#issuecomment-7072118320):** A-71 es apta para el cierre técnico, con dos P2 y una observación sobre «Mi vehículo».
- **[Autorización (A-73)](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7072135863).**

**Sin cambios en:** el motor, las fórmulas (casos dorados 64/64), `src/server`, Supabase y las flags (siguen apagadas). Sin despliegue ni merge.

### 7.1 Qué se corrigió

| Pedido | Corrección | Archivos |
|---|---|---|
| **1. Texto no numérico:** error y emisión bloqueada, sin confundirlo con vacío ni con cero (P2-2) | `NumberField` con `onInvalidText`: un texto que no es un número, como `abc`, `-5` o `1e400`, **no llama a `onChange`**. El valor anterior no se reemplaza por vacío ni por 0; antes, en ayudantes, carga y descarga, otros gastos, recargos y margen, «abc» se convertía en el acto en «0». La sesión lo registra en `textIssues` con la misma clave que `numericIssues`: **pausa el cálculo** y **bloquea la emisión** (`canQuote` y `buildJobRecord`). Se guarda en el borrador (`invalidTexts`) y se recupera **literalmente**, salvo el del precio (el precio nunca se recupera, D-I8), el de los peajes de la comparación (que no se recupera) y los de tramos que ya no existen. Un texto inválido recuperado **no** descarta el recorrido manual: el campo lo muestra con su error hasta que se corrija. El aviso se sigue anunciando como alerta | `NumberField.tsx`, `session.ts`, `numericLimits.ts`, `draftStore.ts`, `Calculator.tsx`, `jobs.ts` |
| **2. Comparación opcional:** sus errores no bloquean la cotización principal válida (P2-1) | `blocksQuote`: los errores de la comparación sin peajes (sus peajes, sus tramos y sus textos) pausan **solo la comparación**. `canQuote` y `buildJobRecord` usan `quoteBlockers()`. Aviso propio: «La comparación sin peajes queda en pausa por un valor inválido. No afecta a tu cotización principal.» | `numericLimits.ts`, `session.ts`, `jobs.ts`, `Calculator.tsx` |
| **3. «Mi vehículo»:** mínimo de 0,1 km/L, sin perder ni modificar en silencio los vehículos guardados | El esquema de **creación y edición** exige ≥ 0,1 km/L (o vacío). Los vehículos guardados se leen **sin** ese esquema, así que se conservan idénticos. Los antiguos con 0 < rendimiento < 0,1 se marcan con «Revisa el rendimiento…». Editarlos sin corregir se rechaza con el mensaje, sin tocar lo guardado. Un texto inválido en el formulario impide guardar (antes se guardaba como vacío). El `CHECK` de la base (> 0) no cambia | `shared/vehicle.ts`, `VehiclesView.tsx` |

**Regresión encontrada y corregida durante la verificación:** al pasar el aviso de texto inválido como error externo, `NumberField` le quitaba el `role="alert"` de A-50. Lo detectó la suite anónima (54/59 → 50/59); se restauró, y ahora una prueba unitaria lo protege.

### 7.2 Pruebas (Claude, 22-11-2026)

**Unitarias nuevas** (`tests/validacion-a73.test.ts`, 22):
- texto inválido en 7 claves distintas: error, pausa, sin emitir, valor intacto, texto visible tal cual y anunciado como alerta, y corrección;
- precio como texto: el costo sigue visible y no se puede emitir;
- texto inválido de último momento;
- un texto que sí es número, vacío o una clave desconocida no se registran;
- vacío sigue siendo faltante y cero sigue siendo un dato;
- un cambio de recorrido limpia los textos de los tramos;
- borrador:
  - recuperación literal, con el precio y la comparación excluidos y el recorrido conservado;
  - entradas manipuladas filtradas;
  - campo dañado ignorado sin perder el resto;
  - borradores anteriores a A-73;
- comparación inválida (peajes, tramo o texto) que no bloquea, y un error principal que sí;
- vehículo:
  - mínimo, con 0,1 y 100 válidos;
  - uno antiguo de 0,05 listado idéntico y marcado;
  - editarlo sin corregir se rechaza y queda igual;
  - aplicado en la calculadora, se marca.

**E2E** (`scripts/e2e-numeros.mjs`, ampliado, **con y sin flag**, Pixel 7, iPhone 13 emulado, 1366 y 1440):
- «abc» en cada uno de los 13 campos: marcado, conservado tal cual (también en ayudantes y carga y descarga, que antes pasaban a «0») y sin poder cotizar;
- texto inválido de último momento;
- comparación sin peajes con «1e308» y «abc»: la comparación queda en pausa y se puede cotizar;
- borrador con «abc» en peajes: vuelve tal cual y bloqueado (con la flag);
- «Mi vehículo» con 0,05 rechazado y «abc» que no se guarda;
- un vehículo antiguo de 0,05 inyectado en el almacenamiento se lista, se marca y no se modifica.

| Prueba | Resultado |
|---|---|
| `npm test` | **622/622** (600 + 22) |
| Casos dorados | **64/64** |
| Typecheck y 3 builds | Sin errores |
| `e2e-numeros.mjs` | **844/844** (540 + 304 de A-73), varias corridas con servidores nuevos |
| `e2e-integracion.mjs` con la flag / `--sin-flag` | **278/278** (dos corridas) / **24/24** |
| `e2e-modulos.mjs` | **210/210** |
| `e2e-staging-anonimo.mjs` en local, sin y con flag | **54/59** (las 5 fallas de entorno de siempre), tras corregir la regresión del `role="alert"` |

**Defectos reintroducidos: 16, todos detectados.**
- **11 por las unitarias:**
  - el texto no se registra: 11 fallan;
  - los textos no cuentan como error: 9;
  - la comparación vuelve a bloquear: 2;
  - `buildJobRecord` exige que no haya ningún error: 2;
  - el borrador no recupera los textos: 2;
  - un texto recuperado descarta el recorrido: 1;
  - se recupera el texto del precio: 1;
  - un cambio de recorrido no limpia los textos de los tramos: 1;
  - el mínimo «> 0» vuelve al vehículo: 2;
  - el vehículo antiguo no se marca: 1;
  - se acepta un texto que sí es número: 1.
- **4 por el E2E:**
  - `NumberField` vuelve a pasar el texto como vacío o 0;
  - el campo de ayudantes no informa el texto (8 fallas);
  - el texto recuperado no se muestra;
  - el formulario de vehículos guarda pese al texto.
- **1 por una prueba unitaria nueva:** se pierde el `role="alert"` (7 fallan).

**Nota de método:** tras muchas corridas seguidas contra el mismo servidor de desarrollo, se agota el cupo **simulado** de rutas, que vive en memoria. Las corridas que se cortaron por esa causa se repitieron con servidores nuevos.

**Sin probar:** Safari real, lector de pantalla real y staging.

## 8. Auditoría de A-73 (0 P0 · 1 P1) y corrección del P1 (A-75, 22-11-2026)

- **[Auditoría](https://github.com/ratatecuala/calculadora-de-costos-log/issues/53#issuecomment-7072905772).**
- **[Autorización (A-75)](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7077903187).**

**P1:** un error de texto inválido seguía activo después de que una acción **reemplazara** el valor de su campo por otro válido. Pasaba con tres acciones:
- «Cargar ejemplo ficticio» (`setParams`);
- elegir un vehículo o «Restaurar valores del vehículo» (`selectVehicle` y `restoreVehicleValues`);
- un margen predefinido, como 10 %, 15 % o 20 % (`setMargin`).

El campo seguía mostrando «abc» y bloqueaba la cotización aunque el valor ya fuera válido.

**Corrección** (`session.ts`, sin cambiar el motor ni el diseño):
- **Regla:** fijar el valor de un campo, desde el propio campo o con una acción que lo reemplaza, quita el texto inválido de **ese** campo y de ninguno más (`textIssuesWithout`).
- **Dónde se aplica:**
  - `setParams`, solo con las claves que recibe;
  - `selectVehicle`, solo rendimiento y desgaste; elegir «Sin vehículo» no cambia valores ni quita errores;
  - `restoreVehicleValues`;
  - `setMargin`, `setSurcharges`, `setChosenPrice` y `setTollsComparison`;
  - `setLegOverride`, solo el km o los minutos que se fijan.
- **Por qué no se pierde nada escrito:** un texto inválido nunca pasa por estos métodos, porque `NumberField` no llama a `onChange` con él (A-73).
- **Si el valor nuevo está fuera de rango:** por ejemplo, un vehículo de 0,05 km/L. El texto se reemplaza, pero el campo **sigue marcado** con su error de rango; nada se resuelve en silencio.

**Pruebas (Claude, 22-11-2026):**
- **Unitarias nuevas** (`tests/limpieza-a75.test.ts`, 11):
  - combustible «abc» + «Cargar ejemplo» se puede cotizar;
  - el ejemplo no quita los errores de margen, recargos, tramos ni precio, y no cambia otros valores;
  - **margen «abc» + 15 %: deja de bloquear** y se puede emitir; elegir un margen no quita el error de otro campo;
  - el vehículo quita solo sus dos errores; «Restaurar valores» también; «Sin vehículo» no quita nada;
  - un vehículo fuera de rango sigue marcado;
  - en un tramo se quita solo el campo fijado;
  - el borrador ya no guarda el texto antiguo.
- **E2E** (`scripts/e2e-numeros.mjs`, 14 verificaciones por tamaño y modo, con y sin flag, Pixel 7, iPhone 13 emulado, 1366 y 1440):
  - combustible «abc» + «Cargar ejemplo» da 1.050 sin error y se puede cotizar;
  - **margen «abc» + 15 %** deja de bloquear y el campo «Otro» se cierra;
  - el 15 % no quita el error de peajes «x»;
  - rendimiento «abc» + elegir el vehículo da 9 km/L sin error, y peajes sigue marcado;
  - «Restaurar valores del vehículo» da 9 km/L sin error.

| Prueba | Resultado |
|---|---|
| `npm test` | **636/636** (625 + 11) |
| Casos dorados | **64/64** |
| Typecheck y 3 builds | Sin errores |
| `e2e-numeros.mjs` | **900/900** (844 + 56), dos corridas |
| `e2e-integracion.mjs` con la flag / sin flag | **278/278** / **24/24** |
| `e2e-modulos.mjs` | **210/210** |
| Anónimo en local, sin y con flag | **54/59** (5 de entorno) |
| `src/engine`, `src/server`, `src/shared`, `supabase/` | **Sin cambios** |

**Defectos reintroducidos: 9, todos detectados.**
- **7 por las unitarias:**
  - «Cargar ejemplo» no limpia: 3;
  - el margen no limpia: 3;
  - el vehículo no limpia: 2;
  - «Restaurar» no limpia: 1;
  - `setParams` limpia todos los errores (de más): 1;
  - un tramo limpia km y minutos aunque cambie uno: 1;
  - «Sin vehículo» limpia errores: 1.
- **2 también por el E2E:**
  - sin limpieza del margen: 24 fallas de A-75;
  - sin limpieza en «Cargar ejemplo»: 32.

**Nota de método:** tras un reemplazo, el costo puede cambiar y el aviso «Mantener este precio» aparece un render después. Las verificaciones de A-75 esperan a que la pantalla se asiente antes de comprobar.
