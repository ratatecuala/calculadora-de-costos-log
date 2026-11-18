# 15 · Validación independiente del motor económico (#24)

**Fecha:** 18-11-2026 · **Rama de partida:** `claude/nice-brown-hxu4m5` en `6dac008` (PR #34) · **Issue:** #24
**Estado:** REVISIÓN TÉCNICA hecha por un agente (Frente C). **No cambia fórmulas ni código**: solo agrega pruebas, este documento y un script de verificación. Cada corrección propuesta **requiere aprobación del propietario** antes de aplicarse.

> Todos los montos son ficticios, como en [03](03-motor-de-costos.md).

## 1. Alcance

Revisado:

- `src/engine/` completo: `inputs.ts` (partidas), `measures.ts` (D, W, CF, R, costo, precio sugerido, resultados sobre P), `rounding.ts` (techo a 1.000, piso/techo de cotas, umbrales), `compare.ts` (comparación de rutas), `tax.ts` (IVA, **solo cómo está implementado**; la política tributaria la revisa otro frente), `types.ts`.
- Uso del motor en `src/web/session.ts` (tramos, km/minutos simulados o declarados, comparación, huella del precio), `src/web/format.ts` (lectura de números y textos de cotas), el bloque «Tu precio» de `src/web/components/Calculator.tsx`, `src/shared/clientQuote.ts` y `data/tax-rules.json`.
- Documentación: [03](03-motor-de-costos.md) §2–§4 y §3C–§3F; [05](05-pruebas-y-calibracion.md) §1; [07](07-decisiones.md) (A-26, A-28, A-29, A-45).
- Pruebas existentes: `tests/engine.golden.test.ts` y las que usan el motor a través de la sesión.

Fuera de alcance: la política de IVA (qué perfiles, qué tasa, #16), rutas reales de Google, la interfaz salvo donde muestra montos o el margen.

## 2. Método

1. **Recálculo independiente sin el motor.** `scripts/verificar-casos-dorados.mjs` **no importa nada de `src/`**: recalcula G1–G10 y los escenarios A, B y C (y T1–T3) a partir de las definiciones escritas en docs/03, con **aritmética racional exacta (BigInt)**, sin coma flotante, y compara cada número con el que declara el documento. Resultado: **64/64 coinciden**. Ejecutar con `node scripts/verificar-casos-dorados.mjs` (sin red ni dependencias; sale con código 1 si algo no coincide).
2. **Contraste con el motor.** `tests/engine.validation.test.ts` comprueba que el motor devuelve esos mismos valores (y su tipo: estimado o cota), sin tomar los esperados del propio motor.
3. **Revisión de código y casos límite** (0 km, km enormes, márgenes 0 %, 80 %, > 80 %, ≥ 100 % y negativos, combustible 0, rendimiento 0 o negativo, NaN/Infinity, coma decimal, enteros grandes, ida y vuelta y tramos múltiples, km/minutos simulados).
4. **Errores** como `it.fails(...)`: pasan mientras el error exista y avisan cuando se corrija. Lo que la documentación no define se registra como **«no especificado»** (NE), con una prueba que documenta el comportamiento actual **sin aprobarlo**.
5. **Corrección propuesta verificada en una copia aislada** (fuera del repositorio): con el diff de §6, los 9 `it.fails` pasan a cumplirse y el resto de la suite sigue en verde. El repositorio **no** se modificó.

**Limitación.** docs/03 §3F pide que los casos los calcule «una persona distinta de quien programa» en una planilla. Este recálculo lo hizo otro agente con un script independiente; si el propietario quiere además la planilla humana, el script deja cada valor intermedio para contrastarla.

## 3. Casos dorados G1–G10

«Doc» = valor esperado en docs/03 §3F; «Test» = lo que espera `tests/engine.golden.test.ts`; «Motor» = lo que devuelve hoy el código (comprobado en `tests/engine.validation.test.ts`); «Recalc.» = script independiente.

| # | Medida | Doc | Test | Motor | Recalc. | ¿Coincide? |
|---|---|---|---|---|---|---|
| G1 | C · sugerido · P−D · P−D−W−CF · P−C | 42.752 · 51.000 · 30.777 · 25.648 · +12.248 | igual | igual, todo «estimado» | igual (C/0,85 = 50.296,5) | Sí |
| G2 | sugerido con C = 44.199, m = 15 % | 52.000 (51.998,8) | 52.000 | 52.000 | 52.000 (51.998,8) | Sí |
| G3 | faltan peajes y CF | «35.202 o más», «al menos 42.000», como máximo 34.977 / 33.198 / +19.798 | igual | igual; D y CF también rotulados cota | igual (41.414,1 → 42.000) | Sí |
| G4 | falta solo CF | «39.402 o más», «al menos 47.000», 30.777 **estimado**, como máximo 28.998 / +15.598 | igual | igual | igual | Sí |
| G5 | umbral y veredictos | 5.647; 4.200 → autopista; 6.000 → sin peajes; 5.647 → empate | igual | igual (diferencias 1.447 y 353) | igual | Sí |
| G6 | umbral de tarifa común | no concluyente; autopista si combustible > 798/4,9 ≈ 162,9 $/km | ≈ 798/4,9 | umbral exacto 1.140/7 = 162,857…, a favor de la autopista | 1.140/7 | Sí (la interfaz muestra «supera $163», techo: lado seguro) |
| G7 | redondeo de cotas | 35.201 (piso), 34.978 (techo) | igual + umbral 5.647 | igual | igual | Sí |
| G8 | IVA | sin perfil: neto 55.000, IVA nulo; regla 19 % verificada: 10.450 → 65.450 | igual | igual | igual | Sí |
| G9 | separación de la cotización | sin 24.223, 1.779, 3.350, 13.400, 42.752, margen ni palabras internas | comprueba números **sin** separador de miles | no aparecen ni con ni sin separador | n/a (lista derivada de G1) | Sí (prueba reforzada) |
| G10 | solo A → B | un tramo; H = conducción + carga una vez | solo revisa `buildCostItems` | 1 tramo A→B en la sesión; R 8.000, CF 2.000 con H = 4/3 h | igual | Sí (prueba reforzada) |

**Escenarios §4:** A (D 31.000, C 55.980, sugerido 63.000, 29.000 / 22.020 / 7.340 por hora / +4.020), B (C 65.980, 73.311,1 → 74.000, 4.000, faltan 5.980) y C con T1–T3 (A = 16.369; Δ −28.631, +1.369, −5.631, −13.631, −10.631): **todos coinciden** (C y T1–T3 solo como aritmética del documento; están fuera de v1).

**Conclusión:** no hay discrepancias numéricas entre documentación, pruebas y motor en G1–G10. Las fórmulas de D, W, CF, R, C, precio sugerido, resultados sobre P, cotas y comparación **son correctas para entradas válidas**. Los hallazgos de §4 son de **validación de entradas, presentación y textos**.

## 4. Hallazgos

> **Estado al 18-11-2026: C-1, C-2, C-3 (solo texto) y C-4 CORREGIDOS** con aprobación del propietario (A-50, docs/07). Las 9 pruebas `it.fails` pasaron a ser pruebas normales que protegen la corrección; NE-8 quedó resuelto (carga y descarga negativa se rechaza). Los casos dorados siguen en **64/64**: ninguna fórmula cambió. Las correcciones de documentación Doc-1 a Doc-6 y los puntos «no especificado» siguen **pendientes**.
>
> **Auditoría de `ff8286e` (P2, corregido):** al **escribir** «-5000» o «abc» en el formulario, el campo lo trataba igual que vacío y el aviso no aparecía. Ahora el propio campo muestra «No es un número válido… No se usó» (`aria-invalid`, `role=alert`); el campo vacío sigue significando «No lo sé». **Límites:** los recargos negativos (NE-1) y el precio elegido negativo (NE-10) **no** forman parte de C-1 y siguen sin decidir.

Severidad: **Alta** = puede llevar a cobrar de menos con datos válidos; **Media** = contrato o texto que puede inducir a error en dinero; **Baja** = cosmético o latente.

| ID | Sev. | Entrada | Actual | Esperado | Impacto para el transportista | Prueba | Corrección propuesta | ¿Cambia fórmula? |
|---|---|---|---|---|---|---|---|---|
| **C-1** | Media | El motor recibe montos **negativos o no finitos**: peajes −5.000 (a), combustible −1.000 $/L (b), partida NaN (c), recargos NaN (d), partida Infinity (e), minutos de conducción −120 (f), precio NaN (g) | Los acepta: partida −5.000 que **baja** el costo; NaN o Infinity rotulados «estimado» («$NaN», «$∞»); gastos fijos −3.000. Inconsistente: «otros» negativo sí se lleva a 0 | Rechazar (lanzar) o tratar el valor como **faltante** (`null`), nunca como monto. §3C se apoya en «toda partida ≥ 0»; con negativos dejan de valer las cotas | **Hoy $0 por la interfaz**: `parseAmount` solo deja pasar números finitos ≥ 0 y el vehículo valida `kmPerL > 0`. Latente si otro llamador usa el motor: un peaje de −5.000 baja el precio sugerido ≈ 5.882 (5.000/0,85) | `C-1a` … `C-1g` (`it.fails`) | §6.1 y §6.2: `declared()` en `buildCostItems` (inválido → `null`), errores `InvalidTripInputError` e `InvalidAmountError` | **No** (validación). Requiere aprobación: toca `src/engine` |
| **C-2** | Baja | Costo 0 completo (0 km o todas las tarifas declaradas en 0) | `ceilTo(0, 1000)` devuelve **−0** y la interfaz muestra «Precio sugerido **$-0**» | «$0» | $0; cosmético, confunde | `C-2` (`it.fails`) | §6.3: `+ 0` en `ceilTo` y normalizar −0 en `formatClp` | **No**. Requiere aprobación |
| **C-3** | Media | Bloque «Tu precio» (`Calculator.tsx`): rótulo «Ganancia extra **sobre el costo**» | El motor aplica m **sobre el precio**: P = C/(1 − m) (docs/03 §2 (4), correcto según el documento) | Rótulo y fórmula deben describir lo mismo | Quien lea «15 % sobre el costo» espera ⌈42.752 × 1,15⌉ = **50.000** y la app sugiere **51.000** (+$1.000); con 20 %: 54.000 frente a 52.000 (+$2.000); con 80 %: 214.000 frente a 77.000. El error es hacia **más** precio (no hace perder dinero, sí competitividad y confianza) | `C-3` (`it.fails`, lee el texto de la interfaz) | §6.4: rótulo «Ganancia extra (como % del precio)» **o**, si el propietario prefiere recargo sobre el costo, cambiar la fórmula (decisión D-1) | Rótulo: **no**. Recargo sobre costo: **sí** → aprobación |
| **C-4** | Baja | Margen «Otro» = 12,5 % | El campo muestra `Math.round(margen × 100)` = **13** y reescribe lo tecleado, pero el motor usa **12,5 %** | Mostrar el mismo margen que se usa | G1: el usuario ve 13 % (que daría 50.000) y recibe 49.000 (−$1.000 respecto de lo que ve) | **No automatizable** sin entorno DOM (no se agregan dependencias). Reproducción: «Tu precio» → «Otro» → escribir «12,5» → el campo pasa a «13» | §6.5: `value={Math.round(s.margin * 10000) / 100}` en el campo «Otro» | **No**. Requiere aprobación (`src/web`) |

### Errores en la documentación (propuestas para docs/03; no se editó)

| ID | Dónde | Problema | Corrección propuesta |
|---|---|---|---|
| Doc-1 | §3E regla 2 | «Si K_Y ≤ K_X, Y es más barata con seguridad»: con **igualdad** y peajes faltantes iguales a 0 hay empate. El motor responde «conviene Y, ahorras $0» (NE-2) | «Si K_Y < K_X, Y es más barata con seguridad; si K_Y = K_X, Y **no es más cara** (empate si los peajes son 0)» |
| Doc-2 | §3C, tabla de redondeo | Falta la fila del umbral de tarifa «conviene si **supera** $X» (G6). La interfaz ya usa techo, que es el lado seguro | Agregar: «Umbral “si supera $X” → **hacia arriba** (techo)» |
| Doc-3 | §2, tabla línea 5 | «U = m · P» solo vale sin recargos y antes del techo a 1.000 | «U = P − C; con el precio sugerido sin redondear y sin recargos, U = m · P» |
| Doc-4 | §2 (2) y escenario B | R = H_dueño · valor_hora, pero el motor usa las **horas del viaje** (NE-7): el escenario B (0,5 h del dueño) no se puede armar desde datos brutos | Decidir si v1 admite H_dueño distinto (ver NE-7) y alinear el texto |
| Doc-5 | [05](05-pruebas-y-calibracion.md), «No probado todavía» | Lista «la verificación independiente de los casos dorados (#24)» como pendiente | Tras aprobar este PR: «verificación independiente por agente con script exacto (docs/15); planilla humana opcional» |
| Doc-6 | docs/03 | El orden de secciones es 3C, 3E, 3D | Renumerar o reordenar (cosmético) |

## 5. Casos límite revisados

| Caso | Comportamiento actual | Veredicto | Prueba |
|---|---|---|---|
| 0 km, 0 min | Combustible y desgaste 0; CF y R solo por carga y descarga | Correcto | «0 km y 0 min» |
| Km enormes (1.000.000) | Proporcional y finito; sugerido múltiplo de 1.000 | Correcto | «km enormes» |
| Margen 0 % / 80 % | 43.000 / 214.000 con C = 42.752 | Correcto | «acepta 0 % y 80 %» |
| Margen > 80 %, ≥ 100 %, negativo, NaN, ±Infinity | Lanza `InvalidMarginError` (la interfaz recorta a 0–80) | Correcto | ídem |
| Monotonía del sugerido en C y en m | No baja; nunca menor que C/(1 − m) | Correcto | «monotonía» (400 casos) |
| Recargos | Se suman después de dividir por (1 − m): ⌈50.296,5 + 2.000⌉ = 53.000 | Correcto según §2 (4) | «los recargos se suman DESPUÉS» |
| Techo a 1.000 | Múltiplos exactos no suben; 51.000,000…007 (coma flotante) → 51.000 | Correcto | «múltiplos exactos» |
| Redondeo de cotas | Inferior → piso, superior → techo, umbral «menos de» → piso (1.000 casos aleatorios) | Correcto | «una cota mostrada sigue siendo cota» |
| Combustible a $0 declarado | Combustible 0, estimado | Correcto (0 declarado ≠ faltante) | «rendimiento 0…» |
| Rendimiento 0, negativo o NaN | Combustible **faltante** (no 0) | Correcto en dinero; ver NE-13 | ídem |
| Peajes `null` / 0 | Faltante / declarado | Correcto | «null ≠ 0» |
| Ayudantes > 0 sin pago | Faltante | Correcto | «ayudantes > 0 sin pago» |
| Negativos, NaN, Infinity | Aceptados | **Error C-1** | `C-1a…g` |
| Costo 0 completo | «$-0» | **Error C-2** | `C-2` |
| Números con coma decimal | `parseAmount`: «12,5» → 12,5; «1.050» → 1.050; «1.234.567,89» → 1.234.567,89; «-5» → `null` | Correcto para uso chileno; ver NE-14 | revisión de código y sondeo |
| Enteros muy grandes | Sin tope; sobre 2^53 se pierde el peso | NE-9 | NE-9 |
| Ida y vuelta (base → A → B → base) | 3 tramos; km y min sumados una vez; carga, ayudantes y otros una vez por ruta | Correcto | «ida y vuelta manual» |
| Tramos simulados + comparación | Km = Σ distancia/1.000, min = Σ duración/60; la ruta sin peajes usa sus propios km, min y peajes; umbral 368 y luego «conviene sin peajes» al declarar 0 | Correcto | «base → A → B → base con km/minutos simulados» |
| IVA 19 % | `Math.round(neto × 0,19)` = redondeo exacto «mitad hacia arriba» para todo neto de 1 a 1.000.000; sin regla verificada → neto | Correcto (implementación) | «Math.round(neto × 0,19)…» |
| Reproducibilidad | Mismas entradas → mismo resultado | Correcto | «reproducibilidad» |
| Invariantes | C = D + W + CF + R; (P − D) − W − CF − R = P − C | Correcto | «invariantes» |
| Huella del precio (`session.ts`) | Incluye recorrido, tramos, vehículo, parámetros y costo; excluye margen y recargos (intencional). Precio escrito antes de calcular → exige confirmar | Correcto. Observación: `JSON.stringify` confunde NaN con `null`, irrelevante si se aplica C-1 | revisión de código |

## 6. Correcciones propuestas (APLICADAS el 18-11-2026 por A-50)

Diferencias con la propuesta original: (a) un dato opcional inválido queda marcado (`invalid: true`) y la interfaz lo avisa en «Costo parcial»; (b) ayudantes y carga y descarga negativos se **rechazan** en vez de llevarse a 0; (c) «otros gastos» negativo pasa a faltante con aviso en vez de llevarse a 0 en silencio.

> **Recomendaciones de la [revisión de ChatGPT del 18-11](https://github.com/ratatecuala/calculadora-de-costos-log/pull/34#issuecomment-6970465877)** (no son aprobación del propietario):
> - **C-3:** mantener la fórmula de margen sobre el precio de venta, P = C/(1−m), que coincide con docs/03 y con los casos dorados, y corregir **solo el texto** de la interfaz a «Margen objetivo (% del precio de venta)», con una ayuda clara. No cambiar la fórmula por confundir «margen» con «recargo sobre el costo».
> - **C-1:** distinguir entre tratar un dato **opcional** inválido como faltante (`null`, con aviso) y **rechazar** una entrada **requerida** inválida. No ocultar valores negativos sin avisar.
> - **C-1, C-2 y C-4** son correcciones defensivas y de presentación razonables, pero tocan `src/engine` y la interfaz: requieren autorización.
> - Las **225 pruebas en verde incluyen 9 `it.fails`**, que documentan defectos **no corregidos**. El verde **no** significa que C-1 a C-4 estén resueltos.

Verificadas en una copia aislada: con estos cambios, `tsc` queda sin errores, los 9 `it.fails` pasan a cumplirse (hay que cambiarlos a `it`) y las demás pruebas siguen en verde.

### 6.1 `src/engine/inputs.ts` (C-1a, b, f) — no cambia fórmulas

```diff
+export class InvalidTripInputError extends Error {}
+
+/** Un valor declarado negativo o no finito no es un dato: se trata como faltante (null), nunca como 0. */
+function declared(v: number | null): number | null {
+  return v === null || !Number.isFinite(v) || v < 0 ? null : v;
+}
+
 export function buildCostItems(km: number, driveMinutes: number, p: TripParams): CostItem[] {
+  for (const [name, v] of [['km', km], ['minutos', driveMinutes]] as const) {
+    if (!Number.isFinite(v) || v < 0) throw new InvalidTripInputError(`${name} debe ser un número ≥ 0`);
+  }
+  for (const [name, v] of [['ayudantes', p.helpers], ['carga y descarga', p.loadMinutes], ['otros gastos', p.otherCosts]] as const) {
+    if (!Number.isFinite(v)) throw new InvalidTripInputError(`${name} debe ser un número`);
+  }
   const hours = (driveMinutes + Math.max(0, p.loadMinutes)) / 60;
-  const fuel = p.kmPerL !== null && p.kmPerL > 0 && p.fuelPricePerL !== null ? (km / p.kmPerL) * p.fuelPricePerL : null;
-  const helpers = p.helpers <= 0 ? 0 : p.helperFee === null ? null : p.helpers * p.helperFee;
+  const kmPerL = declared(p.kmPerL);
+  const fuelPrice = declared(p.fuelPricePerL);
+  const fuel = kmPerL !== null && kmPerL > 0 && fuelPrice !== null ? (km / kmPerL) * fuelPrice : null;
+  const helperFee = declared(p.helperFee);
+  const helpers = p.helpers <= 0 ? 0 : helperFee === null ? null : p.helpers * helperFee;
+  const wearPerKm = declared(p.wearPerKm);
+  const fixedPerHour = declared(p.fixedPerHour);
+  const ownerPerHour = declared(p.ownerPerHour);
   return [
     { id: 'combustible', label: 'Combustible', category: 'desembolso', amount: fuel },
-    { id: 'peajes', label: 'Peajes y TAG', category: 'desembolso', amount: p.tolls },
+    { id: 'peajes', label: 'Peajes y TAG', category: 'desembolso', amount: declared(p.tolls) },
     …
-    { id: 'desgaste', …, amount: p.wearPerKm === null ? null : km * p.wearPerKm },
-    { id: 'gastosFijos', …, amount: p.fixedPerHour === null ? null : p.fixedPerHour * hours },
+    { id: 'desgaste', …, amount: wearPerKm === null ? null : km * wearPerKm },
+    { id: 'gastosFijos', …, amount: fixedPerHour === null ? null : fixedPerHour * hours },
     …
-      amount: p.ownerPerHour === null ? null : p.ownerPerHour * hours,
+      amount: ownerPerHour === null ? null : ownerPerHour * hours,
```

La sesión solo entrega km y minutos ya validados (`parseAmount` o `checkLegs` del servidor), así que el `throw` no se alcanza desde la interfaz.

### 6.2 `src/engine/measures.ts` (C-1c, d, e, g) — no cambia fórmulas

```diff
 export class InvalidMarginError extends Error {}
+export class InvalidAmountError extends Error {}
 …
-  const surcharges = Math.max(0, input.surcharges ?? 0);
+  const rawSurcharges = input.surcharges ?? 0;
+  if (!Number.isFinite(rawSurcharges)) throw new InvalidAmountError('Los recargos deben ser un número');
+  if (input.price != null && !Number.isFinite(input.price)) throw new InvalidAmountError('El precio debe ser un número');
+  for (const it of input.items) {
+    if (it.amount !== null && !(Number.isFinite(it.amount) && it.amount >= 0)) throw new InvalidAmountError(`Partida inválida: ${it.id}`);
+  }
+  const surcharges = Math.max(0, rawSurcharges);
 …
+  if (!Number.isFinite(cost.value / (1 - m) + surcharges)) throw new InvalidAmountError('Monto fuera de rango');
   // Válido como cota inferior del precio sugerido completo por monotonía del techo (§3C).
```

### 6.3 `src/engine/rounding.ts` (C-2) — no cambia fórmulas

```diff
 export function ceilTo(value: number, step: number): number {
-  return Math.ceil(value / step - 1e-9) * step;
+  // `+ 0` convierte −0 en 0 (C-2).
+  return Math.ceil(value / step - 1e-9) * step + 0;
 }
 …
 export function formatClp(value: number): string {
-  return `$${clp.format(value)}`;
+  // −0 se muestra como 0 (C-2).
+  return `$${clp.format(value === 0 ? 0 : value)}`;
 }
```

### 6.4 `src/web/components/Calculator.tsx` (C-3) — texto, no fórmula

```diff
-      <span className="field-label">Ganancia extra sobre el costo</span>
+      <span className="field-label">Margen objetivo (% del precio de venta)</span>
```

Alternativa que **sí cambia la fórmula** (solo con aprobación y nuevos casos dorados): P = C·(1 + m) + recargos.

### 6.5 `src/web/components/Calculator.tsx` (C-4) — presentación

```diff
-        <NumberField label="Ganancia extra" suffix="%" value={pct} onChange={…} />
+        <NumberField label="Ganancia extra" suffix="%" value={Math.round(s.margin * 10000) / 100} onChange={…} />
```

`pct` se mantiene solo para marcar los botones 10 / 15 / 20 %.

## 7. No especificado: requiere decisión del propietario

Cada punto tiene una prueba `NE-n` que documenta el comportamiento **actual** (no lo aprueba).

| ID | Pregunta | Hoy |
|---|---|---|
| NE-1 | ¿Se permiten descuentos (recargos negativos)? ¿Existen recargos **porcentuales** («urgencia %», §2 (4))? ¿Se aplican antes o después del margen? | Negativos → 0; solo recargo fijo en $, sumado después de dividir por (1 − m) |
| NE-2 | Con faltantes y K iguales, ¿«conviene Y» o «empate posible»? (ver Doc-1) | «Conviene Y: ahorras $0» |
| NE-3 | ¿Tolerancia para declarar empate (p. ej., < $1)? | Sin tolerancia: 0,1 + 0,2 frente a 0,3 no es empate |
| NE-4 | Con **dos** tarifas comunes faltantes (combustible y desgaste, o CF y R), ¿se combinan? | No concluyente (conservador, aunque el signo sea seguro) |
| NE-5 | Redondeo de mitades negativas en un estimado | −1.234,5 → −1.234 (hacia +∞) |
| NE-6 | ¿Ayudantes fraccionarios? | El motor acepta 1,5; la interfaz redondea |
| NE-7 | ¿R con horas del dueño distintas de las del viaje (escenario B)? ¿Campo para conductor pagado por servicio? | R = valor/hora × horas del viaje; el conductor solo cabe en «otros» |
| NE-8 | Carga y descarga negativa | El costo la lleva a 0, pero `session.comparisonResult()` usa el valor crudo (inalcanzable desde la interfaz) |
| NE-9 | ¿Tope de magnitud para montos y km? | Sin tope; sobre 2^53 se pierde el peso |
| NE-10 | Precio elegido 0, negativo o menor que el costo | Se acepta; lo que queda sale negativo sin aviso del motor |
| NE-11 | «Carga y descarga» vacía: ¿0 declarado o **faltante**? Afecta CF y R. Choca con «null ≠ 0» (§3) | La interfaz la toma como 0 (marcador «0»); `TripParams.loadMinutes` no admite `null` |
| NE-12 | ¿Rendimiento por tramo (cargado/vacío, §3 y §3A)? | Un solo rendimiento para todos los tramos |
| NE-13 | Rendimiento 0 o negativo: ¿faltante silencioso o error visible? | Faltante («Falta: combustible») |
| NE-14 | Lectura de números (`parseAmount`): «1.5» = 1,5 pero «1.500» = 1.500; acepta «1e3» y «0x10»; texto inválido = «no lo sé» sin aviso; margen vacío = 0 %; margen > 80 se recorta a 80 sin aviso | Como se describe |
| NE-15 | Umbral de tarifa «si supera $X»: ¿techo? (ver Doc-2) | La interfaz usa techo |
| NE-16 | IVA (solo implementación): la cotización guarda `ruleId` y monto, pero no `dataVersion` ni tasa (§3D: «conserva la regla con que se calculó»). Hoy `tax` siempre es `null` | Pendiente de #16 / #37 |

## 8. Pruebas agregadas

`tests/engine.validation.test.ts`: **46 pruebas**.

- 10 casos G1–G10 contra el recálculo independiente;
- 17 de comportamiento correcto (margen, techo, cotas, faltantes, km límite, tramos, simulados, IVA, reproducibilidad, invariantes);
- **9 `it.fails`**: C-1a a C-1g, C-2 y C-3. Pasan mientras el error exista;
- 10 «no especificado» (NE-1 a NE-10).

Con la suite completa: `npm test` → 200 pruebas en verde (154 anteriores + 46). `npm run typecheck` sin errores.

Al aprobar y aplicar una corrección, la prueba `it.fails` correspondiente empezará a fallar: hay que cambiarla a `it(...)` en el mismo commit.
