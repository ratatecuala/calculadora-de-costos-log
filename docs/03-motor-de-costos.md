# 03 · Motor de costos: fórmulas y ejemplos

Estado: **acordado en planificación** (tres rondas entre propietario, Claude y ChatGPT). Su aprobación formal es la del PR que integra este documento (#23). Cualquier cambio posterior de fórmula requiere un PR, nueva versión del motor y aprobación del propietario.

> **Todos los montos de ejemplo son ficticios.** Sirven para ilustrar y probar el motor; no son datos de mercado.

## 1. Clasificación de cada partida de costo

Cada partida lleva tres atributos, y las medidas se calculan filtrando por ellos:

| Atributo | Valores |
|---|---|
| `momento` | **caja** (se paga por este viaje) · **devengado** (desgaste que se pagará después) · **fijo** (existe aunque no haya viajes) |
| `contrato` | por servicio · por hora · sueldo fijo · propio (dueño) |
| `incluidoEnCotizacion` | sí · no · no aplica (solo en la comparación de tercerización) |

## 2. Las cinco medidas

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

(3) Comparación de tercerización
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
    Te queda en efectivo         = P − D
    Ingreso real del dueño       = P − D − W − CF
    Diferencia frente a tu meta  = (P − D − W − CF) − R    → "por encima / por debajo de tu meta"
```

### Reglas de la comparación de tercerización

- Un servicio necesario **en ambas opciones** (por ejemplo, un ayudante que se paga igual) **sale de ambos lados**: no entra ni en A ni en S.
- Si la cotización incluye algo que el usuario no necesita, **no se descuenta**.
- Las diferencias no expresables en pesos (plazo, riesgo, confianza) se **listan aparte, sin valor en pesos**.
- B usa el beneficio **neto**, nunca el ingreso bruto. Vale **0** salvo que el usuario declare un trabajo alternativo concreto.

### Cómo se presenta el resultado al usuario

| Línea | Qué es | ¿Se pagó en este viaje? |
|---|---|---|
| 1. Dinero que sale de tu bolsillo (D) | Combustible, peajes, ayudantes, conductor pagado, otros | **Sí** |
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
- **Redondeo:** solo al final, a 1.000 CLP. El precio sugerido se redondea hacia arriba.
- **Procedencia** de cada valor: MEDIDO · OFICIAL (fuente y fecha) · DECLARADO · PREDETERMINADO (no calibrado) · CALCULADO.

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
  - te quedan en efectivo **29.000**;
  - ingreso real del dueño **22.020** (7.340/h);
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
- **Si cobra 60.000:** te quedan en efectivo 4.000 y quedas 5.980 por debajo de cubrir desgaste, fijos y tu meta.
- **Mensaje que muestra la app:** "Mínimo para no perder: 65.980."

**Prueba:** si el conductor tiene **sueldo fijo mensual**, su costo sale de D, entra en CF y **no** entra en A al comparar con una cotización.

### Escenario C: pyme con furgón y chofer de planta frente a una cotización externa

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

## 5. Pruebas obligatorias de la comparación de tercerización

| Prueba | Datos | Resultado ingenuo | Resultado correcto |
|---|---|---|---|
| **T1.** Los gastos nuevos invierten la decisión | A = 16.369, B = 30.000, Q = 45.000. Además G = 0,5 h de coordinación × 10.000 + seguro de carga 2.000 = 7.000 | Δ = +1.369 (tercerizar) | Δ = 46.369 − 52.000 = **−5.631** (propio) |
| **T2.** Servicio no incluido | Q = 30.000 sin carga y descarga. El ayudante propio (15.000 por servicio) se necesita igual | A con ayudante = 31.369, Δ = +1.369 | Ayudante fuera de A: Δ = 16.369 − 30.000 = **−13.631** |
| **T3.** Beneficio bruto en vez de neto | Trabajo alternativo: ingreso 30.000, costos 12.000, así que B = 18.000. Q = 45.000 | Δ = +1.369 | Δ = 34.369 − 45.000 = **−10.631** |
| **T4.** Empate | Δ dentro del rango de incertidumbre | — | Muestra "empate técnico" |
| **T5.** Invariante | B = 0, G = 0, S = 0 | — | Δ = A − Q exacto |

Estos escenarios, más otros casos, forman los **10 casos dorados** (#24). El código debe coincidir con ellos **al peso**.

## 6. Reproducibilidad

- **Motor:** con las mismas entradas numéricas y las mismas `engineVersion` y `dataVersion`, el resultado es idéntico al peso. Lo garantizan las pruebas.
- **Ruta externa:** **no se garantiza.** Google cambia sus datos, el tráfico y la geocodificación.
- **Archivo de cálculo:** incluye las entradas del usuario, precios con fuente y fecha, versiones y resultados. Los km y la duración se incluyen **solo si los ingresó el usuario**. Si vienen de Google, el archivo dice "obtenida de Google el <fecha>; no incluida". Es una postura conservadora pendiente de la lectura de términos (#15).

## 7. Pendiente

- Reglas de IVA, crédito fiscal y diésel por tipo de usuario: #16.
- Umbrales de "margen estrecho" del comparador y texto del "costo mínimo de operar": #11.
