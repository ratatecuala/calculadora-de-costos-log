# 22 · Diseño de integración: inventario y recursos en el cotizador (puerta P2)

**Versión 1 · 20-11-2026 · Estado: DISEÑO PROPUESTO, no autorizado.** Nada de este documento está implementado. Cada etapa requiere tu autorización por separado.

**Base:**
- [docs/21](21-diseno-datos-cotizador.md): contratos (§3–§6), plan por puertas (§15), fase 1 (§17).
- [Reauditoría de la fase 1](https://github.com/ratatecuala/calculadora-de-costos-log/issues/45#issuecomment-7049771363): 0 P0, 0 P1. Sus 2 P2 están corregidos (docs/21 §17.7).
- Decisiones vigentes: A-47 (numeración e inmutabilidad), A-58 (ayudantes), A-61 (D-4 = b), A-62 (T-1 a T-6), A-64 (T-7), A-65 (T-8).

**No cambia:** el motor económico, las fórmulas, el IVA, Google Routes, producción ni el PR #34.

## 0. Resumen

| Etapa | Qué hace | Migraciones | Cambia el costo | Requiere |
|---|---|---|---|---|
| **I-1 · Integración en el navegador** | Editores dentro del flujo de cotizar; snapshot v2 guardado **en el navegador**; texto sugerido como botón | **No** | **No** | Tu autorización de I-1 y las decisiones D-I1 a D-I7 |
| **I-2 · Integración en la cuenta (nube)** | Guardar y copiar líneas con `create_job_with_quote_v2` y `job_cargo_items` | **Sí (M3, M4)** | No | **#52 resuelto antes**, verificación de esquemas expuestos, respaldo real y autorización por migración (A-59) |
| **I-3 · Recursos en el costo** | Ayudantes por hora o servicio, minutos por parada y equipamiento como entradas del motor (adaptador `costInputs`) | No | **Sí** | Aprobación de docs/21 §4.3–§4.4, casos dorados nuevos y la auditoría de C-2 o D-5 que corresponda |

**Recomendación:** autorizar primero **I-1** solo para el modo **sin cuenta** (D-I2). En ese modo nada se pierde, porque todo queda en el navegador. Con cuenta, los editores se habilitan en I-2.

## 1. Fuente única de cada costo: cómo se evita duplicar

**Regla:** cada concepto tiene **una sola** fuente que alimenta el motor. En I-1 esa fuente es **la misma de hoy**. Los editores nuevos describen, pero **no suman**.

| Concepto | Fuente del costo en I-1 (sin cambios) | Qué aporta el editor nuevo en I-1 | Control anti-duplicado | En I-3 (si se aprueba) |
|---|---|---|---|---|
| Ayudantes | Campos actuales «Ayudantes» × «Pago por ayudante» (`TripParams.helpers`, `helperFee`) | Detalle por ayudante, solo informativo | Si el detalle difiere de los campos del costo (cantidad o suma), se avisa: «El costo usa 2 × $15.000; tu detalle suma $36.000. **No se suma dos veces**: ajusta el costo si corresponde». Nunca se corrige solo | El detalle reemplaza los campos actuales mediante el adaptador; los campos antiguos se ocultan y no queda doble entrada |
| Tiempo de carga y descarga | Campo actual «Carga y descarga» (`loadMinutes`) | Minutos por origen y destino, informativos | Aviso si la suma A + B difiere del campo del costo | `handlingTime` alimenta el motor con la regla de completitud de §4.4 |
| Equipamiento y embalaje | Campo actual «Otros gastos» (`otherCosts`) | Líneas declaradas, informativas | Texto fijo: «Si ya lo incluiste en Otros gastos, no lo repitas»; aviso si la suma del equipamiento supera «Otros gastos» | Líneas propias en el desglose; «Otros gastos» queda solo para lo demás |
| Inventario (peso, volumen) | — (no es costo) | Estimación de viajes como **cota inferior** | Nunca entra al precio (A-65, docs/21 §3.2) | Solo con D-5 (fórmulas según carga), no autorizado |
| Frágil y manejo especial | — | Notas sin verificar (T-8) | Prohibido usarlos para costos o seguridad (A-65) | Sin cambios |

**Pruebas que lo garantizan en I-1:**
- casos dorados **64/64** con los editores llenos y vacíos;
- prueba de igualdad: el `computation('habitual')` de la sesión es idéntico con y sin datos en los editores;
- prueba estática: `src/engine` y `buildCostItems` no importan `cargo`, `resources` ni `modules/*` (ya existe para la fase 1 y se mantiene).

## 2. Conservación de los datos

### 2.1 Mientras se cotiza (borrador)

- **Dónde vive:** el inventario y los recursos viven en la **sesión de cotización** (`QuoteSession`), igual que hoy viven las direcciones y los parámetros. **Solo en memoria**, como el resto del borrador actual (D-I4).
- **Reinicio:** se reinician con las mismas reglas del borrador actual: al cerrar sesión o cambiar de cuenta se descartan y nunca se muestran a otra identidad (sexta auditoría).
- **Recalcular la ruta o cambiar el vehículo** no borra el inventario ni los recursos.
- **Cambiar entre Rápido y Detallado** nunca borra líneas (fase 1, P2-2). Si queda «Rápido» con una lista, **no se puede emitir** hasta volver a «Detallado» o descartar la lista.

### 2.2 Al emitir la cotización (snapshot)

- **Flag apagada:** `buildJobRecord` produce el registro **v1 actual, sin ningún cambio** (prueba de igualdad con el comportamiento de hoy).
- **Flag encendida:** produce un **v2** (docs/21 §6.1):
  - `cargo.totals` **se recalcula** con `cargoSummary` a partir de las líneas en ese instante, sin copiar el resumen de la pantalla (seguimiento P2 de la fase 0), y se verifica con `cargoTotalsIssue`;
  - `cargo.handling` sale de `handlingTime`, y los datos inválidos no suman (fase 1, P1-2);
  - `resources` se guarda validado con el esquema completo (P2-A y P2-B);
  - `formulaVersion` es igual a la versión del motor, porque las fórmulas no cambian.
- **Con datos inválidos** en el inventario o los recursos: **no se emite** y se muestra qué revisar (D-I3). Nunca se emite «sin inventario» en silencio.
- **Lista vacía:** si no hay inventario ni recursos, `cargo: null` y `resources: null`.

### 2.3 En el navegador (historial local)

- **Clave:** la misma clave `cotizador.trabajos.v1`, con la versión **por registro** (T-4). Los v1 existentes no se tocan.
- **Escritura:** todo o nada. Si el navegador está lleno, se muestra el error de guardado existente y **no** queda una cotización a medias (L5). Una cotización de 200 líneas pesa ~60 KB.
- **Lectura:** siempre con `readSnapshot`. Un registro ilegible se muestra como hoy, con el aviso «no se pudo leer el detalle», y **nunca** se reescribe.

### 2.4 En la cuenta (nube)

- **I-1 (sin migraciones):** con sesión iniciada, los editores **no se muestran** (D-I2). La copia del historial local a la cuenta (`migrateLocalToCloud`) usa `toCloudPayload`:
  - **v1:** se copia igual que hoy (L1);
  - **v2 sin líneas:** se copia con la función v1 y el `internal` v2 resumido. Cabe en 16 KB por el tope de 11.000 bytes;
  - **v2 con líneas:** **no se copia**. Queda en el navegador con el aviso «Esta cotización tiene detalle de carga que la cuenta aún no puede guardar; sigue en este navegador». Nunca se sube sin sus líneas.
- **I-2 (con M3 y M4):** `create_job_with_quote_v2` guarda la cotización y sus líneas en **una** transacción, con la misma numeración e idempotencia de la v1. Así se habilitan los editores con cuenta y la copia de v2 con líneas (L2, L3).

## 3. Protección de las cotizaciones históricas

| Riesgo | Protección | Prueba |
|---|---|---|
| Recalcular o reinterpretar una v1 | `readSnapshot` lee v1 **tal cual**: sin inventario ni recursos y sin reinterpretar «carga y descarga 0» (§4.4) | C2 y H4 (ya existen) |
| Reescribir una v1 al leerla o copiarla | Ninguna ruta de lectura escribe. La copia a la nube usa `toCloudPayload`, idéntico al flujo actual para v1 | C2 (entrada congelada), L1 |
| Convertir ayudantes v1 recortando | `helpersFromV1` rechaza con motivo (más de 20, cantidades o montos inválidos) y el dato v1 queda intacto | P1-1 (fase 1) |
| Cambiar el PDF, el enlace o WhatsApp de una v1 | Lista blanca `CLIENT_QUOTE_KEYS` sin cambios; el inventario **no** va al PDF (D-I7) | Prueba de lista blanca existente + fixtures v1 |
| Cambiar números internos o emitidos | Sin cambios en numeración (A-47); en I-2 la v2 reutiliza la v1 | T8, T12, T14 de los borradores |
| Mostrar datos internos al cliente | `service_description` solo con una sugerencia que el usuario **acepta** (D-I5), sin ayudantes ni montos (P1-3) | S1 y prueba estática de la llamada |
| Cotizaciones de la nube escritas antes de I-2 | El lector de la nube (`mappers.ts`) **aceptará** v1 y v2 resumido sin exigir líneas (tarea 9 de I-1) | Prueba de mapeo con ambos formatos |

## 4. Tareas por etapa

### 4.1 I-1 · sin migraciones (se puede implementar sin resolver #52)

| # | Tarea | Archivos | Pruebas |
|---|---|---|---|
| 1 | Ranuras de inventario y recursos en la sesión, con reinicio por identidad | `src/web/session.ts` | Borrador por dueño; recalcular la ruta no borra |
| 2 | Editores plegables dentro de «Cotizar», debajo de los costos y **cerrados por defecto**, detrás de la flag | `Calculator.tsx`, componentes de la fase 1 | e2e teléfono y PC; costo idéntico con y sin datos |
| 3 | Avisos anti-duplicado (§1) | `Calculator.tsx`, `modules/estado.ts` | Unitarias de cada aviso; ningún valor se corrige solo |
| 4 | Botón «Usar texto sugerido» en el formulario, nunca automático | `QuoteForm.tsx` | S1; el texto escrito por el usuario no se pisa |
| 5 | Registro v2 al emitir (flag encendida): totales recalculados, bloqueo con datos inválidos | `jobs.ts` | v1 idéntico con la flag apagada; v2 válido con `snapshotV2Schema`; `cargoTotalsIssue` nulo |
| 6 | Historial local v2 todo o nada; error de cuota | `storage.ts` | L5; lectura mixta v1 y v2 |
| 7 | Vista de la cotización y el historial: resumen de la carga para v2 (interno); v1 igual | `QuoteView.tsx`, `History.tsx` | Fixtures v1 sin cambios visibles |
| 8 | Copia a la cuenta: v2 con líneas no se sube y avisa | `cloud/migration.ts` | L1, L4 y «v2 con líneas queda local» |
| 9 | Lector de la nube tolerante a v2 resumido | `cloud/mappers.ts` | Mapeo v1 y v2 |
| 10 | Regresión completa | — | `npm test`, casos dorados 64/64, e2e de cotizar existente + e2e de módulos |

**Responsable único** de `session.ts`, `Calculator.tsx`, `jobs.ts` y `saveQuote.ts` (docs/21 §9). **Reversión:** basta con apagar la flag. Los registros v2 ya guardados en el navegador se siguen leyendo, porque `readSnapshot` está activo con o sin flag.

### 4.2 I-2 · requiere migraciones (**primero #52**)

1. **#52:** impedir el `INSERT` directo en `jobs` (v1 como `SECURITY DEFINER` con `search_path` vacío y revocar `INSERT`). Requiere diseño, ensayo local, auditoría específica de privilegios y tu autorización.
2. **Verificación previa** (docs/21 §8): esquemas expuestos por la Data API sin `private`; respaldo real; autorización individual de M3 y de M4.
3. **M3** `job_cargo_items` y **M4** `create_job_with_quote_v2`, copiadas de los borradores ya probados (18/18 y C3 27/27) y ajustadas a lo que resulte de #52.
4. **Cliente:**
   - `cloud/quotes.ts` llama a la v2 con `toCloudPayload`;
   - `cloud/migration.ts` copia v2 con líneas (L2, L3);
   - se leen las líneas de la nube para mostrarlas;
   - los editores se habilitan con cuenta.
5. **Pruebas:** T1–T15 contra staging de prueba con usuarios ficticios, L1–L6 y e2e con cuentas A y B.

**Por qué #52 va primero:** M4 se apoya en la v1 (`create_job_with_quote`). Si #52 cambia la v1 a `SECURITY DEFINER`, la v2 y la función privada deben ajustarse a ese modelo. Hacer M3/M4 antes obligaría a rehacerlas.

### 4.3 I-3 · recursos en el costo (requiere aprobar fórmulas)

- **Adaptador `src/shared/costInputs.ts`** (docs/21 §4.3–§4.4):
  - ayudantes desde el detalle, con «servicio» igual a la v1;
  - minutos por parada con completitud: partidas faltantes en CF y R y cota inferior;
  - equipamiento como líneas declaradas.
- **Requisitos:**
  - casos dorados **nuevos** revisados (H1–H3) y los 64 actuales iguales con «servicio»;
  - comparación de rutas «no concluyente» si depende del tiempo faltante;
  - trabajos de más de 24 h según el diseño T-7 (docs/21 §4.5), si se autoriza implementarlo.

## 5. Decisiones pendientes (para autorizar por separado)

| ID | Decisión | Recomendación |
|---|---|---|
| **D-I1** | Fuente del costo en I-1 | Mantener los campos actuales del cotizador como **única** fuente; editores informativos con avisos anti-duplicado (§1) |
| **D-I2** | Alcance de I-1 | Solo **sin cuenta** (navegador). Con cuenta, en I-2 |
| **D-I3** | Emitir con datos inválidos en el inventario o los recursos | **Bloquear** la emisión y mostrar qué revisar |
| **D-I4** | Persistencia del borrador antes de emitir | Solo en memoria, como hoy; evaluar `sessionStorage` más adelante |
| **D-I5** | Texto para el cliente | Botón «Usar texto sugerido»; nunca reemplazo automático; sin ayudantes (P1-3) |
| **D-I6** | Flag de la integración | Una flag nueva `VITE_FF_INTEGRACION_CARGA`, apagada por defecto e independiente de la vista previa; desplegarla en staging requiere tu autorización |
| **D-I7** | Inventario en el PDF, el enlace o WhatsApp | **No** en esta etapa: solo `service_description` (lista blanca intacta) |
| — | Autorizar la etapa I-1 | Tras decidir D-I1 a D-I7 |
| — | #52, M3 y M4 | Por separado, en ese orden |
| — | docs/21 §4.3–§4.4 y T-7 (más de 24 h) | Por separado, para I-3 |

## 6. Lo que este diseño NO hace

No implementa la integración, no modifica el motor ni las fórmulas, no crea ni ejecuta migraciones, no cambia el IVA, no activa Google Routes, no habilita formularios públicos para clientes (docs/21 §18), no despliega y no fusiona el PR #34.
