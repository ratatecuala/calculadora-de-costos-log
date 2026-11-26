# 32 · Diseño de las modalidades simplificada y detallada (A-89, A-90 Frente B)

**Estado:** PROPUESTO (26-11-2026, hora de Chile). Diseño técnico, funcional y visual. **No autoriza implementar.** No cambia fórmulas, el motor, el snapshot, la base de datos ni las flags. Autorización del diseño: [A-90 en #43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7182615758). Decisión de producto: [A-89](07-decisiones.md). Maqueta estática con datos ficticios: [diseno/a89-maqueta.html](diseno/a89-maqueta.html) (descargar y abrir en el navegador).

> Todos los montos son **ficticios**: reutilizan el ejemplo v4 de [10 §7](10-diseno-ux.md) y los casos G1 y G4 de [03 §3F](03-motor-de-costos.md).

## 1. Objetivo y límites

**Objetivo.** Ofrecer dos formas de usar la misma calculadora:

- **Simplificada (predeterminada):** el transportista independiente calcula el **costo operativo del servicio** con pocos datos, sin contabilidad anual.
- **Detallada (opcional):** independientes, negocios y empresas suman sus costos de periodo (fijos, seguros, permisos, mantenciones, depreciación) para obtener el **costo económico completo**.

**Límites de este diseño:**

- Un solo motor: `buildCostItems` y `computeMeasures` no cambian. Las modalidades solo deciden **qué partidas entran** y **cómo se rotulan**.
- No se escriben fórmulas nuevas en la interfaz. Toda cifra mostrada sale de `computeMeasures` (§6).
- Lo que exige una fórmula nueva queda **BLOQUEADO** y se lista en §4.2, con sus casos dorados pendientes.
- La modalidad se guarda en un snapshot **v4** futuro (D-A3); v1, v2 y v3 no se tocan ni se reinterpretan.
- La cotización del cliente no cambia: ni la modalidad ni las exclusiones ni la procedencia llegan al cliente.
- Fuera de alcance: IVA, rutas reales, la herramienta de medición (Frente A) y las correcciones de v3 (Frente C).

## 2. Matriz de partidas

Partidas de `buildCostItems` (`src/engine/inputs.ts`), con su categoría en el motor y su fórmula vigente en [03](03-motor-de-costos.md). «S» es la simplificada y «Det.» la detallada.

| Partida (`id`) | Cat. | Fórmula vigente | S | Det. | Origen de datos | Si falta |
|---|---|---|---|---|---|---|
| Combustible (`combustible`) | D | km ÷ `kmPerL` × `fuelPricePerL` | Sí | Sí | km y min: ruta (manual, simulada o proveedor). Rendimiento: «Mi vehículo», el usuario o, en el futuro, medición 0B. Precio: el usuario o, en el futuro, la referencia CNE con fecha y versión | Chip «Sin dato» en el campo que falta. La partida queda desconocida y el costo pasa a «Costo parcial» (cota inferior) |
| Peajes y TAG (`peajes`) | D | `tolls` declarado | Sí | Sí | El usuario. En el futuro, el catálogo #21 (versionado, con vigencia) | «Sin dato · ¿no hay peajes? escribe 0». Costo parcial. Nunca se asume 0 |
| Ayudantes (`ayudantes`) | D | `helpers` × `helperFee` (0 si no hay ayudantes) | Sí, si corresponde | Sí | El usuario | Con 0 ayudantes: «No aplica». Con ayudantes y sin pago: «Sin dato» y costo parcial |
| Otros gastos (`otros`) | D | `otherCosts` declarado | Sí | Sí | El usuario (estacionamiento, materiales, embalaje) | Parte en 0 «Valor inicial». No admite «desconocido» porque el motor lo exige numérico (§3.3) |
| Desgaste (`desgaste`) | W | km × `wearPerKm` | Sí, **con evidencia** | Sí | «Mi vehículo» o el usuario. En el futuro, la medición 0B o la referencia C-1 | «Sin dato», costo parcial, más la acción «No incluir en esta cotización» (excluido por el usuario, D-M3) |
| Gastos fijos (`gastosFijos`) | CF | `fixedPerHour` × (min de conducción + carga) ÷ 60 | **No** (excluido por modalidad) | Sí | El usuario, en CLP/h ya prorrateado (§4) | En S: «No se suma en la simplificada» (no es un faltante). En Det.: «Sin dato» y costo parcial |
| Tu remuneración (`remuneracion`) | R | `ownerPerHour` × horas | Sí | Sí | El usuario. Es una meta, no un pago | «Sin dato»: costo parcial y precio «al menos» |
| Carga y descarga (`loadMinutes`, entrada) | — | Suma horas a CF y R, una vez por ruta | Sí | Sí | El usuario | Parte en 0 «Valor inicial» |
| Margen deseado `m` y recargos | — | Precio sugerido = ⌈C ÷ (1 − m) + recargos⌉₁₀₀₀ | Sí | Sí | El usuario | Margen y recargos parten de un valor inicial visible |

**Distancia y tiempo:** son entradas del recorrido, no partidas. Mantienen su procedencia del snapshot v3 (`economia.recorrido`) y la retención A-38.

### 2.1 Qué cubre cada modalidad

- **Simplificada.** D (combustible, peajes y TAG, ayudantes, otros) + W (si hay evidencia o el usuario no lo excluye) + R + margen.
  - Se rotula **«Costo operativo del viaje»**.
  - Está completa respecto de su alcance cuando no faltan partidas incluidas.
  - **No** es el costo económico completo, y la interfaz lo dice en una línea.
- **Detallada.** D + W + CF + R + margen: es el «Costo del viaje» actual de [03](03-motor-de-costos.md) y [10](10-diseno-ux.md). Más adelante sumará los desgloses bloqueados de §4.2.

## 3. Estados por partida

### 3.1 Los seis estados

| Estado | Significado | Qué recibe el motor | Efecto en el total | Indicador |
|---|---|---|---|---|
| `incluido` | La partida entra con un valor conocido mayor que 0 | La partida con su monto | Suma | Monto, más el chip de procedencia si no lo escribió el usuario |
| `ceroDeclarado` | El usuario **escribió** 0 (p. ej., «no hay peajes») | La partida con monto 0 | Suma 0; el total sigue completo | «$0 · declarado» |
| `noAplica` | Es 0 por estructura (0 ayudantes) o por el valor inicial aceptado | La partida con monto 0 | Suma 0 | «No aplica» |
| `desconocido` | DATO FALTANTE: `null` | La partida con `amount: null` | El costo pasa a cota inferior («Costo parcial») | «Sin dato» |
| `excluidoModalidad` | La modalidad no considera la partida (CF en la simplificada) | **Nada:** la partida se quita de la lista | No suma ni es faltante; cambia el **alcance** | «No se suma en la simplificada» |
| `excluidoUsuario` | El usuario decidió no incluirla en esta cotización (solo desgaste o gastos fijos) | **Nada:** la partida se quita de la lista | Igual que el anterior | «No incluido por ti» |

### 3.2 Por qué no se confunden

- **Excluir no es poner `null`.** Con `null` el motor marcaría un faltante y rotularía el costo como parcial, aunque la persona no pretenda contar esa partida.
- **Excluir no es poner 0.** Con 0 el resultado se presentaría como «completo» con un cero inventado (A-18).
- **La exclusión quita la partida** del arreglo que recibe `computeMeasures`. El motor no cambia: suma las categorías de las partidas que recibe (`sumCategory`). Ver la regla de alcance en §6.
- El estado se **guarda explícitamente**, nunca se deduce del valor:
  - en la sesión y el borrador, mediante `exclusiones` y `origins` (A-88);
  - en el snapshot v4, mediante `estadoPartidas`.

### 3.3 Limitaciones del contrato actual (sin cambiar el motor)

- **Otros gastos** es `number`, con 0 inicial, en `TripParams`. No puede representar «desconocido». Se distingue «valor inicial» de «0 escrito por el usuario» mediante `origins` (A-88).
  - Volverlo anulable cambia `TripParams` y `buildCostItems`: es un cambio de motor y queda **BLOQUEADO** (D-M10).
- **Ayudantes** y **carga y descarga** parten en 0. Se usan `declaredZeros` y `origins` para distinguir `ceroDeclarado` de `noAplica`.

## 4. Lo detallado con el motor actual, y lo que queda bloqueado

### 4.1 Cubierto sin cambiar fórmulas

| Concepto pedido | Cómo se cubre hoy | Regla |
|---|---|---|
| Gastos fijos, seguros, SOAP, permiso de circulación, revisión técnica, patente | Un campo **«Gastos fijos por hora» (CLP/h)**, ya prorrateado por el usuario (`fixedPerHour`), más una **lista de composición declarativa**: casillas que indican qué incluye ese valor | Las casillas **no suman**: documentan lo incluido y alimentan los avisos anti-duplicación (§5) |
| Depreciación | Casilla «Depreciación» en la composición de gastos fijos | Va solo en CF, nunca en desgaste ([03 §3](03-motor-de-costos.md), §3E) |
| Mantenciones, neumáticos, aceite | Campo **«Desgaste por km» (CLP/km)** (`wearPerKm`), con su lista de composición (neumáticos, aceite, mantenciones periódicas, reparaciones) | Las mantenciones van en W, no en CF |
| Horas productivas | Implícitas en el CLP/h que declara el usuario. Se muestra la ayuda «Divide tus gastos del año por las horas que trabajas con clientes» | La app **no** divide (§4.2, B-1) |
| Otros costos del servicio | «Otros gastos» (CLP por servicio) | Una vez por ruta |
| Sueldo fijo de un conductor contratado | Casilla en la composición de gastos fijos | Va en CF, no en D ([03 §3E](03-motor-de-costos.md)) |

### 4.2 BLOQUEADO: requiere cambiar o ampliar fórmulas

Cada punto requiere autorización del propietario, casos dorados calculados por una persona distinta de quien programa, revisión de GPT y un responsable del motor (Codex o Claude, coordinado según A-86).

| # | Cambio | Fórmula | Casos dorados pendientes |
|---|---|---|---|
| B-1 | Calcular CF desde los gastos del periodo y las horas productivas | CF = (F_anual ÷ H_prod_año) × H_viaje. Está documentada en [03 §2](03-motor-de-costos.md), pero **no implementada**: el motor recibe CLP/h | GB-1a: escenario A de [03 §4](03-motor-de-costos.md) (1.800.000 ÷ 1.200 = 1.500/h × 3 h = 4.500). GB-1b: H_prod = 0 o vacía, con CF desconocido y sin división. GB-1c: periodos mensuales frente a anuales |
| B-2 | Calcular el desgaste desde los costos y la vida útil de cada componente | c_km = Σ costo ÷ km de vida útil | GB-2a: 400.000/50.000 + 80.000/10.000 + 300.000/20.000 = 31 CLP/km. GB-2b: componente sin vida útil, que queda desconocido |
| B-3 | Partidas personalizadas por km, por hora o por servicio | Nuevas `CostItem` con su categoría | GB-3a: partida por km. GB-3b: partida por hora con carga y descarga sin duplicar horas. GB-3c: límite de partidas y snapshot ≤ 11000 bytes |
| B-4 | Conductor contratado por servicio u hora (escenario B) | Nueva partida D | GB-4: escenario B de [03 §4](03-motor-de-costos.md) (C = 65.980) |
| B-5 | «Otros gastos» desconocido (anulable) | Cambia `TripParams.otherCosts` | GB-5: `null` frente a 0 declarado |
| B-6 | Una medida nueva en el motor para el excedente operativo, si no se acepta la regla de alcance de §6 | P − D − W como campo de `Measures` | GM-1 a GM-3 (§6.3) |

Hasta entonces, la detallada muestra estos desgloses solo como **ayuda de texto**, no como calculadoras.

## 5. Regla anti-duplicación

Cada concepto vive en **una sola** partida. La composición declarada sirve para detectarlo.

| Riesgo | Regla | Aviso (no bloqueante) |
|---|---|---|
| Fijos por hora frente a gastos del periodo prorrateados | Hoy solo existe el CLP/h. Cuando se habilite B-1, el usuario elige **uno**: CLP/h directo o gastos del periodo con horas productivas, nunca ambos | «Ya indicaste gastos fijos por hora; si usas tus gastos del año, reemplazarán ese valor» |
| Desgaste por km frente a mantenciones | Las mantenciones van en W. Si la composición de CF marca «Mantenciones», se avisa | «Marcaste mantenciones en gastos fijos y en desgaste: cuéntalas en un solo lugar» |
| Desgaste frente a depreciación | La depreciación va solo en CF ([03 §3](03-motor-de-costos.md)). Si la composición de W la marca, se avisa | «La depreciación se cuenta en gastos fijos, no en desgaste» |
| Peajes frente a otros gastos | Los peajes van solo en «Peajes y TAG» | La ayuda de «Otros gastos» dice «no incluyas peajes» |
| Ayudante pagado frente a remuneración | R es solo del dueño ([03 §3E](03-motor-de-costos.md)) | La ayuda lo indica |
| Carga y descarga | Se cuenta una vez por ruta y suma horas a CF y R, nunca por tramo | Sin cambio |
| Cambio de modalidad | CF excluido en la simplificada **no** se mueve a otra partida ni se reparte en «Otros gastos» | Al volver a la detallada, CF reaparece con su valor conservado |

Los avisos son de coherencia, sin umbrales económicos (D-6 de A-90).

## 6. Excedente operativo y utilidad económica integral

### 6.1 Definiciones

Las medidas se calculan sobre el precio elegido P.

| Medida | Definición | UI (copy por validar, D-M9) | Simplificada | Detallada |
|---|---|---|---|---|
| Saldo tras desembolsos | P − D | «Te queda después de pagar el viaje» | Sí | Sí |
| **Excedente operativo** | P − D − W (W solo si está incluido) | «Te queda para tu trabajo y tus gastos fijos» | Sí, línea principal | Sí |
| Ingreso tras todos los costos | P − D − W − CF | «Te queda después de todos los costos» | **No se muestra** (sería falso: CF no se contó) | Sí |
| Sobre tu meta (alcance operativo) | P − D − W − R | «Sobre lo que querías ganar · sin gastos fijos» | Sí | — |
| **Utilidad económica integral** | P − (D + W + CF + R) | «Resultado después de todos los costos y tu meta» | **No calculada**: «Requiere la modalidad detallada» | Sí, solo con CF incluido (conocido o cota) |

Reglas de presentación:

- Con faltantes, todas son **cotas superiores** «como máximo» ([03 §3C](03-motor-de-costos.md)). Nunca se usa color de éxito ni las palabras «ganancia real» o «rentable».
- En la detallada con CF excluido por el usuario, la utilidad integral se muestra como «No calculada: excluiste los gastos fijos».

### 6.2 Cómo se obtiene sin una fórmula nueva (regla de alcance)

Se propone el adaptador puro `medidasPorAlcance` (§9). **No hace aritmética.** Solo:

1. llama a `buildCostItems` una vez;
2. quita las partidas excluidas (estado `excluido*`);
3. llama a `computeMeasures` para el **alcance de la modalidad**. De ahí salen el costo, el precio sugerido, P − D y `afterAllCosts`, que en la simplificada **es** el excedente operativo, y `overGoal`;
4. solo en la detallada, llama a `computeMeasures` otra vez **sin** las partidas `fijo` para obtener el excedente operativo como su `afterAllCosts`.

**Advertencia de aprobación.** Aunque `measures.ts` e `inputs.ts` no cambian, quitar CF cambia **lo que significa** el costo de la simplificada. Hoy, CF vacío da «Costo parcial» (G4); en la simplificada, el mismo caso da «Costo operativo» completo. Se recomienda tratarlo **como un cambio de fórmula a efectos de aprobación**, con casos dorados y revisión de GPT (D-M1). La alternativa B-6 (una medida nueva en el motor) también queda bloqueada.

### 6.3 Casos dorados propuestos (por calcular de forma independiente)

Datos base del caso G1:

- 57,4 km y 74 min de conducción, más 60 min de carga y descarga (H = 2,2333 h);
- 12 km/L a $1.050/L (combustible $5.022,5);
- peajes $4.200, un ayudante a $15.000 y otros $0;
- desgaste 31 CLP/km ($1.779,4);
- gastos fijos 1.500 CLP/h ($3.350);
- remuneración 6.000 CLP/h ($13.400);
- m = 15 % y P = 55.000.

| # | Caso | Esperado |
|---|---|---|
| GM-1 | **Simplificada**, CF excluido por modalidad | Costo operativo 39.402 (**estimado**). Sugerido ⌈46.355,2⌉ = **47.000**. P − D 30.777. Excedente operativo **28.998**. Sobre la meta (sin fijos) **+15.598**. Utilidad integral: no calculada |
| GM-2 | **Contraste con G4**: detallada con CF desconocido | Mismas cifras que GM-1, pero como **cotas**: «39.402 o más», «al menos 47.000», «como máximo 28.998». Prueba que exclusión ≠ faltante |
| GM-3 | **Detallada** completa (= G1) | Costo 42.752. Sugerido 51.000. P − D 30.777. Excedente operativo 28.998. Después de todos los costos 25.648. Utilidad integral **+12.248** |
| GM-4 | Simplificada con desgaste desconocido | «37.623 o más». «Al menos 45.000». P − D 30.777 (estimado). Excedente como máximo 30.777. Sobre la meta como máximo +17.377 |
| GM-5 | Simplificada con desgaste excluido por el usuario | Costo operativo 37.623 (estimado). Sugerido 45.000. Excedente operativo = P − D = 30.777, rotulado «sin desgaste (no incluido por ti)» |
| GM-6 | Peajes con 0 declarado frente a desconocido | Con 0: total estimado. Con `null`: cota inferior y aviso «Falta: peajes» |
| GM-7 | Ida y vuelta: detallada → simplificada → detallada | Medidas idénticas al peso a GM-3. `fixedPerHour` se conserva |
| GM-8 | Propiedad: completar un dato o pasar de la simplificada a la detallada **nunca baja** el costo ni **sube** el excedente | Prueba de propiedades sobre el adaptador |

## 7. Cambio de modalidad

| Aspecto | Simplificada → detallada | Detallada → simplificada |
|---|---|---|
| Datos compartidos (recorrido, vehículo, combustible, peajes, ayudantes, carga, otros, desgaste, remuneración, margen, recargos, precio elegido) | Se conservan | Se conservan |
| Gastos fijos y su composición | Reaparecen con el valor conservado, o «Sin dato» si nunca se llenaron | **Se ocultan, no se borran.** Quedan en la sesión y el borrador. Estado `excluidoModalidad` |
| Exclusiones del usuario (p. ej., desgaste) | Se conservan | Se conservan |
| Total | Sube en CF o pasa a «Costo parcial» si falta CF. Aviso: «Ahora incluye tus gastos fijos: + $3.350» | Baja y cambia el rótulo a «Costo operativo». Aviso: «Los gastos fijos no se suman en la simplificada (se conservan)» |
| Precio elegido | Se conserva. Se activa el aviso existente «El costo cambió después de que escribiste tu precio» (`priceNeedsConfirmation`) | Igual |
| Procedencia (`origins`) | Sin cambios: cambiar de modalidad no es un evento de valor | Igual |

**Valores por defecto:**

- Una sesión nueva parte en la simplificada.
- La última modalidad elegida se recuerda en el dispositivo como preferencia, no como inferencia.
- Un borrador anterior a A-89, sin modalidad, se abre en la **detallada**, que equivale a la calculadora actual. Así el total que la persona veía no cambia en silencio (D-M4).

## 8. Procedencia y precisión visibles (D-A2)

### 8.1 Indicador por campo

Es un chip pequeño, con texto (no depende solo del color), a la derecha de la etiqueta del campo.

**Solo aparece cuando el valor no lo escribió el usuario.** El caso más frecuente no muestra nada, para no sobrecargar.

| `origins` / procedencia | Chip | Estilo |
|---|---|---|
| `ejemplo` · `simulado` | «Ejemplo» | Aviso (ámbar sobrio) |
| `vehiculo` · `declarado` | «Tu vehículo» | Azul suave |
| `valorInicial` | «Sin cambiar» | Gris |
| `faltante` | «Sin dato» | Borde punteado |
| Excluido | «No se suma» / «No incluido» | Gris tachado suave |
| `usuario` · `declarado` | (sin chip) | — |
| Futuro: `medicion` · `medido` | «Medido» | Azul |
| Futuro: `comprobante` · `comprobado` | «Comprobado» | Azul |
| Futuro: `referencia` · `estimado` | «Referencia · fecha» | Gris |

### 8.2 Detalle al tocar

El chip es un botón. Al tocarlo se abre, en el teléfono, una hoja inferior y, en el escritorio, un globo anclado. Muestra:

- clase y fuente en palabras («Lo copiamos de tu vehículo “Furgón ficticio”»);
- la fecha del dato, o «fecha no registrada» (nunca se inventa);
- vigencia y versión, si existen;
- la precisión disponible:
  - hoy, siempre «valor único, sin rango ni calibración»;
  - en el futuro, el rango o la incertidumbre que entregue la medición 0B o la referencia, **sin umbrales inventados**;
- acciones: «Editar» y, para desgaste o gastos fijos, «No incluir en esta cotización».

### 8.3 Resumen de cobertura en el resultado

Una línea bajo el costo, plegable:

> **Datos:** 5 tuyos · 2 de tu vehículo · 1 ejemplo · 1 sin cambiar · gastos fijos no se suman

- Al desplegar se ve la lista por partida, con su estado y chip.
- Si hay un «Ejemplo», el resumen avisa: «Incluye valores de ejemplo ficticios».
- No se calcula un «porcentaje de confianza»: no hay método aprobado (criterios #12 pendientes).
- La cotización del cliente **no** muestra nada de esto.

## 9. Contratos propuestos (solo documento; no implementados)

```ts
// src/shared/modalidad.ts — contrato único compartido (coordinar con Codex #55, D-M8)
export const MODALIDADES = ['simplificada', 'detallada'] as const;
export type Modalidad = (typeof MODALIDADES)[number];

/** Partidas que se pueden excluir. Los desembolsos nunca: si no se conocen, quedan `desconocido`. */
export const PARTIDAS_EXCLUIBLES = ['desgaste', 'gastosFijos'] as const;
export type PartidaExcluible = (typeof PARTIDAS_EXCLUIBLES)[number];
export type MotivoExclusion = 'modalidad' | 'usuario';

export type EstadoPartida =
  | 'incluido'
  | 'ceroDeclarado'
  | 'noAplica'
  | 'desconocido'
  | 'excluidoModalidad'
  | 'excluidoUsuario';

/** Qué excluye cada modalidad por sí misma. */
export const EXCLUIDAS_POR_MODALIDAD: Record<Modalidad, readonly PartidaExcluible[]> = {
  simplificada: ['gastosFijos'],
  detallada: [],
};

/** Composición declarativa (no suma nada; solo para la anti-duplicación y la ayuda). */
export type ComponenteFijo = 'seguro' | 'soap' | 'permiso' | 'revisionTecnica' | 'patente' | 'depreciacion' | 'sueldoConductor' | 'mantenciones' | 'otro';
export type ComponenteDesgaste = 'neumaticos' | 'aceite' | 'mantenciones' | 'reparaciones' | 'depreciacion' | 'otro';

/**
 * Función pura: estado de cada partida a partir de los ítems del motor, la modalidad,
 * las exclusiones del usuario y los orígenes (A-88). Sin aritmética.
 */
export declare function estadoDePartidas(input: {
  items: readonly CostItem[];
  modalidad: Modalidad;
  exclusionesUsuario: Partial<Record<PartidaExcluible, true>>;
  origins: OrigenesDatos;
  declaredZeros: readonly ('helpers' | 'loadMinutes')[];
}): Record<ItemId, EstadoPartida>;
```

```ts
// src/shared/alcance.ts — adaptador sobre el motor (regla de §6.2). Sin aritmética propia.
export interface MedidasPorAlcance {
  modalidad: Modalidad;
  /** Medidas del alcance de la modalidad (partidas excluidas quitadas). */
  alcance: Measures;
  /** Excedente operativo P − D − W, tomado de `afterAllCosts` de una corrida sin partidas `fijo`. */
  excedenteOperativo: Bounded | null;
  /** P − C con CF incluido; `null` en la simplificada o si el usuario excluyó CF. */
  utilidadIntegral: Bounded | null;
  estados: Record<ItemId, EstadoPartida>;
}
export declare function medidasPorAlcance(
  items: readonly CostItem[],
  modalidad: Modalidad,
  exclusionesUsuario: Partial<Record<PartidaExcluible, true>>,
  measureInput: Omit<MeasureInput, 'items'>,
  ctx: { origins: OrigenesDatos; declaredZeros: readonly ('helpers' | 'loadMinutes')[] },
): MedidasPorAlcance;
```

```ts
// src/web/session.ts — extensión del estado de la sesión y del borrador
interface SessionStateA89 {
  modalidad: Modalidad;                                         // nueva sesión: 'simplificada'
  exclusionesUsuario: Partial<Record<PartidaExcluible, true>>;  // sobreviven al cambio de modalidad
  composicion: { fijos: ComponenteFijo[]; desgaste: ComponenteDesgaste[] };
  // Se conservan sin cambios: params (incluido fixedPerHour aunque esté oculto), origins, declaredZeros.
}
// Borrador sin `modalidad` (anterior a A-89) → 'detallada' (D-M4). Claves desconocidas se descartan.
```

```ts
// src/shared/snapshot.ts — v4 (D-A3). v1, v2 y v3 sin cambios.
const estadoPartidaSchema = z.enum(['incluido', 'ceroDeclarado', 'noAplica', 'desconocido', 'excluidoModalidad', 'excluidoUsuario']);

export const economiaV4Schema = economiaSchema
  .extend({
    modalidad: z.enum(MODALIDADES),
    /** Estado de las 7 partidas, explícito (no se deduce del monto). */
    estadoPartidas: z.record(z.enum(ITEM_IDS), estadoPartidaSchema),
    /** Exclusiones con su motivo. Redundante con `estadoPartidas` a propósito: se valida la coherencia. */
    exclusiones: z.array(z.object({ partida: z.enum(PARTIDAS_EXCLUIBLES), motivo: z.enum(['modalidad', 'usuario']) }).strict()).max(2),
    composicion: z.object({ fijos: z.array(z.enum(COMPONENTES_FIJO)).max(9), desgaste: z.array(z.enum(COMPONENTES_DESGASTE)).max(6) }).strict(),
    /**
     * Parámetros: igual que v3, pero los que alimentan SOLO partidas excluidas (`fixedPerHour` y `wearPerKm`)
     * se OMITEN (D-M5): el snapshot registra lo usado, sin valores ocultos ni ceros inventados.
     */
    parametros: parametrosV4Schema, // = v3 con `fixedPerHour` y `wearPerKm` opcionales
  })
  .strict();

export const snapshotV4Schema = z
  .object({ schemaVersion: z.literal(4), formulaVersion, ...commonShape, missing, vehicle: vehicleV2Schema.nullable(), economia: economiaV4Schema })
  .strict()
  // Se conservan todas las reglas de v3: versiones, margen, vehículo coherente, A-38 y ≤ 11000 bytes UTF-8.
  .refine(/* modalidad 'simplificada' ⇔ exclusiones contiene {gastosFijos, modalidad} */)
  .refine(/* parámetro omitido ⇔ su partida está excluida */)
  .refine(/* estadoPartidas coherente con exclusiones y con `partidas` (desconocido ⇔ monto null) */)
  .refine(/* partida excluida ⇒ no aparece en `partidas` ni en `missing` */);
// Con `vehicle` y desgaste excluido: el refine de coherencia con el vehículo compara solo los parámetros presentes.
```

**Regla de lectura de los históricos:**

- `readSnapshot` devuelve `sourceVersion: 1 | 2 | 3 | 4` y, en la vista, `modalidad: Modalidad | null`.
- **v1, v2 y v3 se leen como `modalidad: null`, que se muestra como «sin modalidad registrada».** No se infiere nada de `fixedPerHour` vacío ni de los faltantes.
- No se recalculan, no se migran y no se reescriben.
- Una v4 manipulada no se recalcula: se muestra lo guardado o se declara ilegible (igual que v3).

**Qué versión se emite:**

| Situación | Versión |
|---|---|
| Flags de carga apagadas y A-89 implementada | v4 |
| Antes de implementar A-89 | v3, sin cambios |
| `VITE_FF_INTEGRACION_CARGA` encendida | v2, sin cambios (D-A1) |

**Cotización del cliente:** la lista blanca de `clientQuote.ts` no cambia.

## 10. Propuesta visual (resumen; ver la maqueta)

- **Teléfono (390 px), una columna desplazable** ([10 §1](10-diseno-ux.md)):
  - control segmentado «Simplificada | Detallada» en la tarjeta «Costos del viaje»;
  - en la simplificada, los campos principales: vehículo, rendimiento, combustible, peajes y TAG, ayudantes, carga y descarga, desgaste, otros y «Lo que quieres ganar» (sale de «Opciones avanzadas»);
  - en la detallada, debajo, la tarjeta «Costos de tu negocio»: gastos fijos por hora con su composición, composición del desgaste y la ayuda de horas productivas;
  - el resultado sigue en la misma pantalla.
- **Escritorio (1366 px), dos columnas:**
  - a la izquierda, formulario y modalidad;
  - a la derecha, fija al desplazar: desglose, precio, resultado y cobertura;
  - el recorrido queda resumido arriba;
  - la tercera columna v4 (recorrido completo) se conserva cuando corresponde.
- **Paleta v4:** blanco, superficies `#F7F8FA`, azul `#33507A`, grafito `#1F2933`; aviso `#FBF7EE`/`#6B4E16`. Tokens con modo oscuro. Botones de 48 px y chips de al menos 24 px, con el área táctil ampliada a 44 px.

## 11. Archivos afectados al implementar (no ahora)

| Archivo | Cambio |
|---|---|
| `src/shared/modalidad.ts` (nuevo) | Tipos, constantes y `estadoDePartidas` |
| `src/shared/alcance.ts` (nuevo) | `medidasPorAlcance` (regla de §6.2) |
| `src/web/session.ts`, `src/web/draftStore.ts` | Modalidad, exclusiones y composición; borradores antiguos en la detallada |
| `src/web/components/Calculator.tsx` | Conmutador, campos por modalidad, resultado con excedente y utilidad, y cobertura. Componentes nuevos: `ModalidadSwitch.tsx`, `ProcedenciaChip.tsx`, `DetalleProcedencia.tsx`, `CoberturaDatos.tsx` |
| `src/web/styles.css` | Chips, hoja inferior, columna fija y modo oscuro de los nuevos tokens |
| `src/shared/snapshot.ts`, `src/web/jobs.ts` | v4 y emisión v4. Lectura `modalidad: null` para v1 a v3 |
| `src/web/cloud/*` (mapeadores, `migration.ts`) | Clasificar y validar v4 igual que v3 |
| Vista «Mis trabajos» | Etiqueta de modalidad o «sin modalidad registrada» |
| `src/shared/clientQuote.ts` | **Sin cambios** (se prueba) |
| `src/engine/*` | **Sin cambios.** Si se elige B-6 o B-1 a B-5: cambio de motor, con autorización y casos dorados |
| Docs | 03 (alcance por modalidad y «costo operativo»), 10 (copy y chips), 28 (v4), 07, README |

**Coordinación:**

- Frente C (correcciones de v3) toca `snapshot.ts`, `jobs.ts` y `session.ts`. **La implementación de A-89 va después y en secuencia**, no en paralelo.
- `src/shared/campo/` es de Codex (#55, «alcance por modalidad»): `Modalidad` debe tener **una sola** definición (D-M8).

## 12. Pruebas necesarias al implementar

**Unitarias:**

- `estadoDePartidas` (seis estados, incluidos `ceroDeclarado` frente a `noAplica` y los valores iniciales);
- `medidasPorAlcance`:
  - GM-1 a GM-8;
  - **sin aritmética propia:** cada cifra es igual a un campo de un `computeMeasures` real;
- sesión: cambio de modalidad ida y vuelta sin pérdida, exclusiones persistentes, borrador antiguo abierto en la detallada y claves desconocidas descartadas;
- snapshot v4: ida y vuelta, rechazos estrictos, lectura de v1 a v3 con `modalidad: null`, tamaño ≤ 11000 bytes con caracteres de 2, 3 y 4 bytes y A-38 con ruta no retenida.

**Casos dorados:** GM-1 a GM-8, calculados en una planilla independiente. B-1 a B-6 solo si se autorizan.

**Controles negativos y mutaciones:**

- tratar la exclusión como `null` (el costo se volvería parcial en la simplificada);
- tratar la exclusión como 0 (desaparecería el estado);
- mostrar «Te queda después de todos los costos» en la simplificada;
- mostrar la utilidad integral en la simplificada;
- inferir la modalidad de una v3;
- borrar `fixedPerHour` al pasar a la simplificada;
- incluir la modalidad, las exclusiones o la procedencia en la cotización del cliente;
- un chip de procedencia en un valor escrito por el usuario;
- un chip «Ejemplo» que persiste después de editar el campo.

**E2E (Pixel 7 y PC 1366, sin flags y con la flag de A-89 apagada o encendida en local):**

- recorrido simplificado completo hasta la cotización y el historial;
- cambio a la detallada y vuelta;
- detalle de procedencia al tocar (teclado y foco visibles en el escritorio);
- resumen de cobertura;
- sin desplazamiento horizontal a 390 px;
- modo oscuro;
- la regresión completa existente (`e2e-flujo-completo`, `e2e-integracion`, `e2e-precio-entero`) sin cambios de cifras con la flag apagada.

**Accesibilidad:** los chips con texto y `aria-label`, la hoja con foco atrapado y cierre con Escape, y el contraste AA en ambos temas.

## 13. Decisiones pendientes del propietario

| ID | Decisión | Recomendación |
|---|---|---|
| D-M1 | Regla de alcance: quitar las partidas excluidas antes de `computeMeasures` y rotular «Costo operativo» en la simplificada | **Aprobar**, tratándolo como cambio de fórmula a efectos de control: casos dorados GM-1 a GM-8 y revisión de GPT antes de implementar |
| D-M2 | Excedente operativo = P − D − W en ambas modalidades; utilidad integral solo en la detallada con CF incluido | **Aprobar**. En la simplificada, la utilidad integral se muestra como «no calculada», nunca como 0 ni como cota |
| D-M3 | Desgaste sin evidencia en la simplificada | **Desconocido por defecto** (costo parcial), con la acción de un toque «No incluir en esta cotización» (excluido por el usuario, visible en la cobertura) |
| D-M4 | Borradores sin modalidad (anteriores a A-89) | **Abrir en la detallada**, que equivale a la calculadora actual. La sesión nueva parte en la simplificada y se recuerda la última elección en el dispositivo |
| D-M5 | Valores ocultos de partidas excluidas en el snapshot v4 | **Omitirlos** (se conservan solo en la sesión y el borrador). Menos datos y menos superficie de inferencia (D-A4) |
| D-M6 | Chips de procedencia | **Solo para valores que no escribió el usuario**, más «Sin dato». Detalle al tocar. Sin «porcentaje de confianza» hasta #12 |
| D-M7 | Desgloses de la detallada (B-1 prorrateo de periodo y horas productivas, B-2 desgaste por componentes, B-3 partidas personalizadas, B-4 conductor) | **Mantener bloqueados.** Pedir casos dorados y asignar el responsable del motor. Mientras tanto, CLP/h y CLP/km con composición declarativa |
| D-M8 | Dueño del tipo `Modalidad` | **Un solo contrato con #55.** Codex ya publicó un contrato A-89 en `src/shared/campo/` (rama de #55): la app comercial debe reutilizar esa definición o una común acordada, nunca una segunda. Acordarlo con Codex mediante GPT antes de implementar, sin activar flags |
| D-M9 | Textos de excedente y utilidad | Provisionales: «Te queda para tu trabajo y tus gastos fijos» y «Resultado después de todos los costos y tu meta». Validar en las pruebas de comprensión, sin cambiar el significado |
| D-M10 | «Otros gastos» desconocido | **Ajustado tras la revisión de GPT:** pedir que el usuario **confirme expresamente** 0 o «desconocido»; el 0 inicial no implica «no aplica» confirmado. Estudiar B-5 con un caso dorado antes de implementar, sin inferir ausencia |

## 14. Riesgos

| Riesgo | Mitigación |
|---|---|
| Que la persona confunda el costo operativo de la simplificada con el costo completo y cobre por debajo de sus fijos | Rótulo «Costo operativo», línea fija «No incluye gastos fijos» y utilidad integral «no calculada». No se usa color de éxito |
| Que la regla de alcance se vea como un «segundo motor» | El adaptador no tiene aritmética (prueba explícita). Revisión de Codex o GPT |
| Doble conteo entre CF, desgaste y otros | Composición declarativa y avisos (§5). Mutaciones |
| Que la modalidad se infiera en históricos | Lectura `modalidad: null`, con prueba negativa |
| Que v4 crezca por encima de 11000 bytes | Topes de arreglos (exclusiones ≤ 2, composición ≤ 15 en total), prueba con caracteres de 4 bytes y rechazo explícito sin guardar a medias |
| Conflicto con el Frente C o con Codex #55 | Implementación secuencial tras el Frente C y un único tipo compartido (D-M8) |
| Sobrecarga visual | Chips solo para valores que no escribió el usuario, cobertura plegada y detalle bajo demanda |
| Inferencia A-38 con la ruta no retenida | v4 hereda la regla de `partidas: null`. D-M5 reduce los parámetros guardados. D-A4 sigue abierta y no se reabre aquí |
| Precisión afirmada sin método | «Valor único, sin rango ni calibración» hasta que #12 y 0B entreguen incertidumbre |

## 15. Ajustes tras la revisión de GPT (26-11-2026)

[Revisión de GPT sobre `10dd269`](https://github.com/ratatecuala/calculadora-de-costos-log/pull/34#issuecomment-7183175628): el diseño se acepta como propuesta, con estos ajustes, que prevalecen sobre §6 y §13 donde difieran:

| Medida | Definición ajustada |
|---|---|
| **Costo operativo** | D + W (sin CF). Es lo que mide la simplificada |
| Remuneración objetivo R | Se suma **aparte**, al costo objetivo o base de precio. **No** es desembolso ni entra en el KPI de #12 |
| **Costo integral antes de la meta** | D + W + CF (detallada) |
| **Utilidad sobre la meta** | P − D − W − CF − R |

- Una cifra con una **exclusión voluntaria** nunca se rotula «completa» sin un aviso visible de lo excluido.
- Un **valor inicial 0** no implica «no aplica» confirmado (ver D-M10).
- B-1 a B-4 y B-6 quedan diferidos. La fecha comercial UTC (hallazgo de [28 §8](28-snapshot-v3-procedencia.md)) y cualquier cambio de alcance o del motor requieren aprobación del propietario.
