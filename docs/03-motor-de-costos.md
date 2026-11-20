# 03 · Motor de costos: fórmulas y ejemplos

**Estado:** las fórmulas básicas del transportista se conservan para el primer lanzamiento, sujetas a casos dorados (#24) y aprobación del PR. La **comparación con una cotización externa / tercerización** se conserva aquí como antecedente matemático, **fuera de la primera versión**. Las rutas «con autopista» y «evitando peajes» no son una comparación de tercerización.

> **Todos los montos de ejemplo son ficticios.** Sirven para ilustrar y probar el motor; no son datos de mercado.

## 1. Clasificación de cada partida de costo

Cada partida lleva tres atributos, y las medidas se calculan filtrando por ellos:

| Atributo | Valores |
|---|---|
| `momento` | **caja** (se paga por este viaje) · **devengado** (desgaste que se pagará después) · **fijo** (existe aunque no haya viajes) |
| `contrato` | por servicio · por hora · sueldo fijo · propio (dueño) |
| `incluidoEnCotizacion` | sí · no · no aplica (solo en la comparación de tercerización) |

## 2. Medidas del motor — núcleo gratuito y extensión futura

```
(1) Dinero desembolsado del viaje
    D = Σ partidas con momento = caja
      (combustible, peajes, ayudantes y conductor pagados por servicio u hora,
       estacionamiento, alimentación, embalaje comprado)

(2) Costo económico completo
    CEC = D + W + CF + R
      W  = desgaste devengado = c_km · km
      CF = gastos fijos asignados = (F_anual / H_prod_año) · H_viaje       [solo si hay datos]
      R  = sueldo objetivo del dueño = H_dueño · valor_hora_dueño          [META, no pago]

(3) FUTURO (NO IMPLEMENTAR EN V1): comparación de tercerización
    Δ = (A + B) − (Q + G + S)
      A = costos propios realmente evitados (solo partidas que desaparecen)
      B = beneficio NETO de un trabajo alternativo concreto (ingreso − costos directos); 0 si no hay
      Q = precio externo comparable (neto si el usuario recupera IVA; bruto si no)
      G = gastos nuevos por contratar (coordinación, comisión/reserva, seguro de carga…)
      S = servicios que la opción propia incluía y la cotización no
    Δ > incertidumbre  → conviene tercerizar
    Δ < −incertidumbre → conviene hacerlo con medios propios
    |Δ| ≤ incertidumbre → "empate técnico"

(4) Precio sugerido
    P_sugerido = (D + W + CF + R) / (1 − m) + recargos     m = margen sobre el precio, 0 ≤ m ≤ 0,8
    recargos = definidos por el usuario (urgencia %, pisos, etc.)
    P_bruto = P_neto · (1 + IVA)   solo si corresponde (reglas pendientes: #16)

(5) Resultado sobre el precio cobrado P
    Saldo tras desembolsos       = P − D
    Ingreso estimado del dueño   = P − D − W − CF
    Diferencia frente a tu meta  = (P − D − W − CF) − R    → "por encima / por debajo de tu meta"
```

### Reglas históricas de la comparación de tercerización (FUERA DE V1)

- Un servicio necesario **en ambas opciones** (por ejemplo, un ayudante que se paga igual) **sale de ambos lados**: no entra ni en A ni en S.
- Si la cotización incluye algo que el usuario no necesita, **no se descuenta**.
- Las diferencias no expresables en pesos (plazo, riesgo, confianza) se **listan aparte, sin valor en pesos**.
- B usa el beneficio **neto**, nunca el ingreso bruto. Vale **0** salvo que el usuario declare un trabajo alternativo concreto.

### Cómo se presenta el resultado al usuario

| Línea | Qué es | ¿Se pagó en este viaje? |
|---|---|---|
| 1. Desembolsos estimados del viaje (D) | Combustible, peajes, ayudantes, conductor pagado, otros | **Sí** |
| 2. Desgaste del vehículo (W) | Lo que conviene reservar para neumáticos, aceite y mantención | No, se pagará después |
| 3. Parte de tus gastos fijos (CF) | Seguro, permiso de circulación y depreciación asignados a este viaje | No, se pagan aunque no viajes |
| 4. Tu sueldo objetivo (R) | Lo que quieres ganar por tus horas | **No es un pago: es tu meta** |
| 5. Ganancia adicional (U = m · P) | Lo que quieres ganar por encima de tu sueldo | No es un pago: es tu meta |

## 3. Reglas de cálculo

- **Combustible:** litros = km ÷ rendimiento ingresado por el usuario (si lo conoce, uno cargado y otro vacío por tramo). **Sin factores de carga ni de velocidad** hasta tener datos de calibración (ver [05](05-pruebas-y-calibracion.md)).
- **Duración en camiones:** se muestra la duración de automóvil, con el aviso "un camión puede tardar más". El usuario puede corregirla.
- **Depreciación:** forma parte de los gastos fijos anuales (no se cobra por km), para no contarla dos veces.
- **Gastos fijos asignados (CF):** solo si el usuario indica los gastos anuales **y** sus horas productivas al año. Si falta alguno de los dos, CF queda "sin datos" y el resultado es **"costo económico incompleto"**.
- **Datos faltantes:** `null` ≠ `0`. Un 0 solo es válido si el usuario lo declara (por ejemplo, "no hay peajes").
- **Rangos:** solo donde hay base (rendimiento declarado con mínimo y máximo, peaje con hora incierta entre TBFP y TS, precio de combustible entre el mínimo y el máximo regional). En los demás casos, valor único con su procedencia.
- **Redondeo:** sin redondeos intermedios. Los montos se muestran **al peso**; solo el **precio sugerido** se redondea hacia arriba al múltiplo de 1.000. Si el valor es una **cota**, el sentido del redondeo lo fija §3C (corregido el 16-11-2026).
- **Procedencia** de cada valor: MEDIDO · OFICIAL (fuente y fecha) · DECLARADO · PREDETERMINADO (no calibrado) · CALCULADO.

**Contrato de entradas (A-50, 18-11-2026):** un dato **opcional** inválido (negativo o no numérico) se trata como **faltante** (`null`) y la partida queda marcada para avisar al usuario; nunca se usa como 0. Un dato **requerido** inválido (km, minutos, ayudantes, carga y descarga, recargos no numéricos, precio no numérico, partida negativa o no finita) **se rechaza** con error. Así se mantiene la premisa de §3C: toda partida es ≥ 0. Ninguna fórmula cambió.

## 3A. Alcance vigente del trayecto y comparación de rutas

La versión gratuita calcula, como máximo, los siguientes tramos **diferentes**:

1. **Base → A**, desplazamiento de aproximación opcional.
2. **A → B**, transporte con carga obligatorio.
3. **B → Base**, regreso opcional.

Cada tramo tiene sus propios kilómetros y minutos, con posible diferencia de rendimiento y peajes. El motor debe sumar **una sola vez** cada kilómetro, hora, peaje, carga/descarga y servicio adicional. Si el usuario solo indica A → B, no se deben inventar desplazamientos extra.

Para cada alternativa válida de ruta (habitual/rápida y evitando peajes) se evalúan **por separado** los desembolsos D, desgaste W, asignación de fijos CF, remuneración objetivo R y precio sugerido. No reutilizar el costo de una ruta para la otra si cambian km, tiempo o peajes.

- El tiempo total incluye **conducción de todos los tramos aplicables más carga y descarga**, sin sumarlos dos veces.
- La alternativa «evitando peajes» **no garantiza TAG = 0**; el usuario puede confirmar 0 o declarar que no conoce el importe.
- La diferencia de duración `duration - staticDuration` es **una referencia comparativa del modelo de rutas** y no un contador medido de minutos de taco. No derivar consumo por congestión de ese valor sin un modelo calibrado.
- El usuario puede declarar rendimiento urbano, carretera o uno mixto respaldado. No inventar porcentajes de ciudad/carretera ni coeficientes de frenado/carga.
- Si falta rendimiento, costo fijo, TAG o cualquier partida material, mostrar qué resultado **sí** se pudo calcular y rotularlo «Costo parcial»; **no afirmar que una ruta es la más barata** cuando lo omitido puede invertir la comparación. **No bloquear automáticamente la creación de cotización**: permitir que el transportista introduzca un precio propio y genere un documento **indicativo**, con aviso de costos internos incompletos; no presentar precio sugerido ni utilidad como completos sin base suficiente.
- Cada valor guarda procedencia, fecha y versión del modelo, respetando las condiciones del proveedor de rutas.

**Salida para el usuario:** términos claros en la interfaz y formales en ayuda: «Lo que pagas en el viaje» (desembolsos estimados), «Lo que quieres ganar por tu trabajo» (remuneración objetivo), «Te queda después de pagar el viaje» (saldo estimado tras desembolsos) y «Te queda después de todos los costos» (ingreso estimado tras costos). **No** llamar a estas cantidades ingreso cobrado ni saldo bancario. Si hay datos incompletos, mostrar explícitamente que la cifra también es parcial.

## 3B. Cotización y registro real

La **cotización para el cliente** tiene un contrato de datos separado del cálculo interno: precio elegido, servicios incluidos, impuestos **solo cuando correspondan según contribuyente y regla validada (#16)**, condiciones y vigencia. No incluir costos internos, margen ni información privada de la cuenta. El documento no debe sugerir que está automáticamente facturado, pagado o aceptado.

El registro gratuito de viaje real y cargas de combustible conserva **lecturas confirmadas por el usuario**. El rendimiento «lleno a lleno» se obtiene mediante kilómetros recorridos entre llenados completos divididos por litros repostados en el segundo llenado (o la suma correspondiente si hubo cargas parciales). Dos fotos de odómetro por sí solas **no miden litros consumidos**. Lectura automática de fotos y calibración avanzada quedan para Pro futuro.

## 3C. Resultados parciales como cotas (A-26)

**Regla:** si el transportista desconoce un dato (por ejemplo, sus gastos fijos o los peajes), **no se le impide calcular ni cotizar**. El resultado se rotula «Costo parcial» y **nunca** se presenta como rentabilidad segura.

### Fundamento

Toda partida de costo es ≥ 0. Sea **K** la suma de las partidas conocidas y **U ≥ 0** la de las faltantes; el costo real es C = K + U ≥ K. Entonces:

| Medida | Definición | Con faltantes | Por qué |
|---|---|---|---|
| Costo del viaje | C = D + W + CF + R | **Cota inferior** K: «$K o más» | C = K + U ≥ K |
| Precio sugerido | P_sug = ⌈C/(1 − m) + recargos⌉₁₀₀₀ | **Cota inferior** ⌈K/(1 − m) + recargos⌉₁₀₀₀: «al menos» | ver demostración |
| Te queda después de pagar el viaje | P − D | Si falta un desembolso: **cota superior** P − D_conocido. Si no falta ninguno: estimado | P − D ≤ P − D_conocido |
| Te queda después de todos los costos | P − D − W − CF | **Cota superior** «como máximo» | se restan costos ≥ los conocidos |
| Sobre lo que querías ganar | P − C | **Cota superior** «como máximo» | P − C ≤ P − K |

**Precio mínimo con faltantes (demostración):** con 0 ≤ m ≤ 0,8 se tiene 1 − m > 0, así que K ≤ C implica K/(1 − m) ≤ C/(1 − m). Sumar los mismos recargos (fijos, o un porcentaje sobre el precio) conserva la desigualdad. Además, la función techo a 1.000 es **no decreciente**: x ≤ y implica ⌈x⌉₁₀₀₀ ≤ ⌈y⌉₁₀₀₀. Por lo tanto, ⌈K/(1 − m) + recargos⌉₁₀₀₀ ≤ P_sug. «Al menos $42.000» es una cota inferior válida **del precio sugerido que la app calcularía con datos completos**. No es una cota inferior de C/(1 − m) sin redondear, y no se presenta así.

### Redondeo de cotas (CORRECCIÓN del 16-11-2026)

La versión anterior decía «cotas inferiores hacia arriba; superiores hacia abajo». **Eso es incorrecto** y queda reemplazado:

| Tipo de valor | Redondeo válido | Contraejemplo de la regla incorrecta |
|---|---|---|
| Cota inferior de un monto (costo «o más») | **Hacia abajo** (piso) | K = 35.202 redondeado hacia arriba a 36.000 afirmaría «costo ≥ 36.000», pero si los peajes faltantes son $298, el costo real es 35.500 < 36.000 |
| Cota superior (lo que queda «como máximo») | **Hacia arriba** (techo) | Lo que queda ≤ 34.977,6; redondearlo hacia abajo a 34.977 afirmaría «como máximo 34.977», pero el valor real puede ser 34.977,6 |
| Precio sugerido «al menos» | **Techo a 1.000** | Válido solo porque P_sug se define con techo a 1.000 (monotonía) |
| Umbral «si los peajes suman menos de $X» | **Hacia abajo** (piso) | Con un umbral exacto de 5.647,4, X = 5.648 diría «conviene» con peajes de 5.648, que superan el umbral |
| Estimado completo | Al peso más cercano | — |

Regla general: **un redondeo preserva una cota solo si la mueve hacia el lado seguro** (una cota inferior hacia abajo y una superior hacia arriba), salvo que la cantidad acotada esté definida con ese mismo redondeo, como el precio sugerido.

### Presentación

1. El motor devuelve cada medida como `{ valor, tipo: "estimado" | "cotaInferior" | "cotaSuperior", faltantes }`. La interfaz no puede mostrar un valor sin su tipo.
2. El aviso nombra **qué falta** y ofrece completarlo, sin bloquear.
3. La cotización al cliente no cambia ni muestra avisos internos. El trabajo queda marcado «costo parcial» en el historial.
4. Una cota superior nunca usa color ni ícono de éxito, ni palabras como «ganancia real», «rentable» o «seguro».
5. Propiedad que se prueba: completar un dato faltante **nunca baja** el costo ni **sube** lo que queda.

**Ejemplo (pantalla de estados v4):** faltan peajes y gastos fijos. Conocido: combustible 5.023 + ayudante 15.000 + desgaste 1.779 + remuneración objetivo 13.400 = **35.202** («$35.202 o más»). Precio: 35.202 / 0,85 = 41.414,1 → **al menos 42.000**. Con P = 55.000:
- te queda después de pagar el viaje, como máximo 55.000 − 20.023 = **34.977**;
- te queda después de todos los costos, como máximo 34.977 − 1.779 = **33.198**;
- sobre lo que querías ganar, como máximo **+19.798**.

## 3E. Cálculo por ruta y comparación con datos faltantes

- Cada alternativa (habitual y evitando peajes) se calcula **por separado**, con sus km y minutos por tramo: D, W, CF y R propios. Carga y descarga, ayudantes por servicio y materiales se cuentan **una vez por ruta**, nunca por tramo.
- **Doble conteo prohibido:**
  - la depreciación va solo en CF, no en W;
  - un conductor con sueldo fijo va en CF, no en D;
  - R es solo del dueño;
  - los peajes van solo en D;
  - el tiempo total H = conducción de los tramos aplicables + carga y descarga, una sola vez.
- **Una ruta X es «más barata con seguridad» que Y solo si** C_X < C_Y para **todo** valor ≥ 0 de los datos faltantes. En la práctica:
  1. Si solo Y tiene faltantes y K_X < K_Y: concluyente (X).
  2. Si X tiene faltantes **propios** (p. ej., peajes de la autopista): no concluyente. Se muestra el umbral `⌊K_Y − K_X⌋` («si los peajes suman menos de $X, conviene…»), siempre que K_Y > K_X. Si K_Y ≤ K_X, Y es más barata con seguridad.
  3. Si el faltante es una **tarifa común** a ambas rutas (rendimiento, valor de gastos fijos por hora), el costo faltante es proporcional a los km o a las horas de cada ruta. Solo es concluyente si la ruta con menor costo conocido también tiene menos km u horas. Si no, se muestra el umbral en esa tarifa.
- Nunca se declara una ruta ganadora con faltantes que puedan invertir el resultado.

## 3D. IVA configurable (A-28)

- La tasa y las reglas **no se escriben en el código del motor**: vienen de `data/tax-rules.json`, versionado, con fuente y fecha de verificación por regla (#37).
- El transportista elige su **perfil tributario**; solo se ofrecen opciones cuya regla esté **verificada** en #16.
- **Sin perfil configurado**, la cotización muestra el **neto** y el transportista ve «Configura cómo emites tus documentos». No se suma IVA por defecto.
- El precio elegido es **siempre neto**; el total con IVA es un cálculo separado, con la regla citada.
- Si una regla cambia, sube `dataVersion`; una cotización emitida conserva la regla con que se calculó.
- La app no asesora: la ayuda remite al SII o a un contador.

## 3F. Casos dorados propuestos para v1 (#24)

Todos los montos son ficticios. Una persona distinta de quien programa debe calcularlos en una planilla independiente. Los resultados indicados aquí sirven para contrastar esa planilla.

| # | Caso | Resultado esperado |
|---|---|---|
| G1 | Ruta con autopista completa: D 24.223, W 1.779, CF 3.350, R 13.400, m = 15 %, P = 55.000 | C = 42.752; sugerido = ⌈50.296,5⌉ = 51.000; te queda 30.777 / 25.648; +12.248 |
| G2 | Ruta sin peajes completa: C = 44.199, m = 15 % | Sugerido = ⌈51.998,8⌉ = 52.000 |
| G3 | Faltan peajes y CF (estado v4), P = 55.000 | «35.202 o más»; «al menos 42.000»; como máximo 34.977 / 33.198 / +19.798 |
| G4 | Falta solo CF, P = 55.000 | «39.402 o más»; «al menos 47.000»; te queda después de pagar el viaje 30.777 (**estimado**, D completo); como máximo 28.998; como máximo +15.598 |
| G5 | Comparación sin peajes de la autopista: K_X = 38.552, C_Y = 44.199 | Umbral 5.647. Peajes 4.200 → autopista; 6.000 → sin peajes; 5.647 → empate |
| G6 | Rendimiento desconocido en ambas rutas (57,4 km frente a 62,3 km) con costos conocidos sin combustible 37.729 frente a 36.931 | **No concluyente**: la autopista conviene solo si el combustible supera 798 / 4,9 ≈ $162,9 por km |
| G7 | Cota inferior interna 35.201,6 y cota superior interna 34.977,4 | Se muestran «35.201 o más» (piso) y «como máximo 34.978» (techo) |
| G8 | IVA: sin perfil / con perfil afecto verificado (tasa de la regla) | Sin perfil: neto 55.000, IVA nulo. Con perfil: 55.000 + 10.450 = 65.450 si la regla verificada fija 19 % |
| G9 | `toClientQuote()` del caso G1 | No contiene 24.223, 1.779, 3.350, 13.400, 42.752, el margen ni las palabras internas |
| G10 | Solo A → B, sin base ni regreso | Un solo tramo; H = conducción A → B + carga y descarga; nada se cuenta dos veces |

Los escenarios A y B de §4 siguen siendo casos válidos del núcleo.

## 4. Escenarios resueltos

**Ruta común:** 40 km de ida con carga más 40 km de regreso vacío, en total 80 km. Conducción 2,0 h, carga y descarga 1,0 h (incluye 2 pisos sin ascensor, como tiempo ingresado). Total H = 3,0 h. Combustible a 1.000 CLP/L.

### Escenario A: fletero independiente que maneja su camioneta

| Partida | Cálculo | CLP | Momento |
|---|---|---|---|
| Combustible | 80 km ÷ 10 km/L (medido) = 8 L × 1.000 | 8.000 | caja |
| Peajes | Confirmados por el usuario | 3.000 | caja |
| Ayudante | Por servicio | 15.000 | caja |
| Estacionamiento | | 2.000 | caja |
| Embalaje (film) | | 3.000 | caja |
| **D** | | **31.000** | |
| Desgaste | c_km = 400.000/50.000 + 80.000/10.000 + 300.000/20.000 = 31 CLP/km × 80 | 2.480 | devengado |
| Gastos fijos | F = 1.800.000/año ÷ 1.200 h/año = 1.500/h × 3 h | 4.500 | fijo |
| Sueldo objetivo (meta) | 6.000/h × 3 h | 18.000 | propio |
| **D + W + CF + R** | | **55.980** | |

- **Precio sugerido** con m = 10 %: 55.980 / 0,9 = 62.200, redondeado hacia arriba a **63.000 neto**.
- **Si cobra 60.000:**
  - saldo estimado tras desembolsos **29.000**;
  - ingreso estimado atribuible al dueño **22.020** (7.340/h);
  - quedas **4.020 por encima de tu meta** de 18.000.

**Prueba de invariante:** (P − D) − W − CF − R = P − (D + W + CF + R), es decir 29.000 − 2.480 − 4.500 − 18.000 = 4.020 ✓.

### Escenario B: fletero con conductor contratado por servicio

Mismo viaje. El dueño no maneja: coordina durante 0,5 h.

| Partida | CLP |
|---|---|
| D del escenario A + conductor por servicio 25.000 | **56.000** |
| W | 2.480 |
| CF | 4.500 |
| R (coordinación: 0,5 h × 6.000, meta) | 3.000 |
| **D + W + CF + R** | **65.980** |

- **Precio sugerido** con m = 10 %: 73.311, redondeado a **74.000 neto**.
- **Si cobra 60.000:** el saldo estimado tras desembolsos es 4.000 y faltan 5.980 para cubrir desgaste, fijos y la remuneración objetivo.
- **Mensaje que muestra la app:** "Para cubrir costos y remuneración objetivo: 65.980."

**Prueba:** si el conductor tiene **sueldo fijo mensual**, su costo sale de D, entra en CF y **no** entra en A al comparar con una cotización.

### Escenario C (FUTURO, fuera de v1): pyme con furgón y chofer de planta frente a una cotización externa

Cotización: **45.000 + IVA**, incluye ayudante y carga y descarga. La pyme recupera IVA (supuesto), así que se compara en neto.

| Partida | CLP | ¿Entra en A? |
|---|---|---|
| Combustible: 80 ÷ 9 km/L = 8,889 L × 1.000 | 8.889 | Sí |
| Peajes | 3.000 | Sí |
| Desgaste: 31 × 80 | 2.480 | Sí |
| Estacionamiento | 2.000 | Sí |
| Chofer con sueldo fijo | — | **No:** se paga igual |
| Gastos fijos del furgón | — | **No** |
| **A** | **16.369** | |

- **Sin trabajo alternativo** (B = 0): Δ = 16.369 − 45.000 = **−28.631**. Conviene hacerlo con medios propios.
- **Con un trabajo alternativo concreto** que deja 30.000 netos (B = 30.000): Δ = 46.369 − 45.000 = **+1.369**. Si eso es menor que la incertidumbre, la app muestra **"empate técnico"**.

## 5. Pruebas de tercerización — conservar como referencia, NO bloqueantes para v1

| Prueba | Datos | Resultado ingenuo | Resultado correcto |
|---|---|---|---|
| **T1.** Los gastos nuevos invierten la decisión | A = 16.369, B = 30.000, Q = 45.000. Además G = 0,5 h de coordinación × 10.000 + seguro de carga 2.000 = 7.000 | Δ = +1.369 (tercerizar) | Δ = 46.369 − 52.000 = **−5.631** (propio) |
| **T2.** Servicio no incluido | Q = 30.000 sin carga y descarga. El ayudante propio (15.000 por servicio) se necesita igual | A con ayudante = 31.369, Δ = +1.369 | Ayudante fuera de A: Δ = 16.369 − 30.000 = **−13.631** |
| **T3.** Beneficio bruto en vez de neto | Trabajo alternativo: ingreso 30.000, costos 12.000, así que B = 18.000. Q = 45.000 | Δ = +1.369 | Δ = 34.369 − 45.000 = **−10.631** |
| **T4.** Empate | Δ dentro del rango de incertidumbre | — | Muestra "empate técnico" |
| **T5.** Invariante | B = 0, G = 0, S = 0 | — | Δ = A − Q exacto |

Los escenarios A y B son referencias para casos dorados del núcleo gratuito (#24). Las pruebas T1–T5 de **tercerización** se conservan para una posible etapa futura y **no deben implementarse en v1**. Los 10 casos dorados de v1 se deben redefinir para abarcar rutas, datos faltantes, recargos y no duplicación de costos.

## 6. Reproducibilidad

- **Motor:** con las mismas entradas numéricas y las mismas `engineVersion` y `dataVersion`, el resultado es idéntico al peso. Lo garantizan las pruebas.
- **Ruta externa:** **no se garantiza.** Google cambia sus datos, el tráfico y la geocodificación.
- **Archivo de cálculo:** incluye las entradas del usuario, precios con fuente y fecha, versiones y resultados. Los km y la duración se incluyen **solo si los ingresó el usuario**. Si vienen de Google, el archivo dice "obtenida de Google el <fecha>; no incluida". Es una postura conservadora pendiente de la lectura de términos (#15).

## 7. Pendiente

- Reglas de IVA, crédito fiscal y diésel por tipo de usuario: #16; no aplicar IVA indiscriminadamente.
- Versión y pruebas de costos por tramo y rutas alternativas, y tratamiento de combustible urbano/carretera.
- Peajes/TAG con tarifa y horario verificables, o declaración de dato faltante (#10/#21).
- Las reglas del comparador de vehículos y tercerización (#11) quedan fuera de v1.
