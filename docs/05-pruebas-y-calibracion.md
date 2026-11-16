# 05 · Plan de pruebas y calibración

Estado: el **enfoque está aprobado**. Los **criterios numéricos finales están pendientes** de la decisión del propietario (#12).

## 1. Pruebas automatizadas

| Tipo | Herramienta | Qué verifica | Cuándo |
|---|---|---|---|
| Casos dorados | Vitest | 10 viajes resueltos en una planilla independiente (#24). El motor debe coincidir **al peso**. | Cada PR (CI) |
| Propiedades | fast-check | Monotonía (más km nunca reduce el costo), no negatividad, invariantes de las cinco medidas, Δ = A − Q cuando B = G = S = 0 | Cada PR |
| Validación | Vitest + Zod | Entradas válidas, inválidas y faltantes. Un faltante nunca se convierte en 0. | Cada PR |
| Integración del Worker | Vitest con simulaciones | Errores, tiempos de espera y cuota agotada de Google y CNE, y modo degradado | Desde E2 |
| Extremo a extremo | Playwright | Flujo principal en móvil (360 px) y escritorio | Desde E2 |
| Accesibilidad | axe-core más revisión manual | Sin violaciones críticas y navegación por teclado | Desde E1 |

- **Cobertura mínima del motor:** 90 % de líneas y de ramas.
- **Prueba de sensibilidad:** cada PR que toca el motor demuestra que un cambio deliberado en una fórmula hace fallar al menos un caso dorado.

## 2. Dimensiones que se validan por separado

| Dimensión | Cómo se mide | Criterio **propuesto** (pendiente #12) | Vehículos válidos |
|---|---|---|---|
| Distancia | Google frente al odómetro, misma ruta | Error ≤ 3 % en el 90 % de los viajes | Cualquiera |
| Tiempo | Conducción cronometrada, separada de carga y descarga | Error ≤ 15 % o ±10 min | **Solo la categoría medida** |
| Consumo | Llenado a tope en tramos acumulados de 300 km o más | ≤ 10 % en autos y ≤ 15 % en vehículos de carga | **Solo esa categoría, con 3 o más vehículos** |
| Peajes | Detección por pórtico y monto | 100 % detectados; monto exacto con banda conocida | Categoría del vehículo usado |
| Motor matemático | Casos dorados y propiedades | 100 % al peso | No aplica |
| Comprensión | 5 o más usuarios con tareas guiadas | 4 de 5 distinguen "dinero de bolsillo" de "ganancia" y deciden bien el caso de tercerización | No aplica |

**Reglas aprobadas:**
- **Ninguna categoría se declara calibrada con datos de otra.** Los automóviles **no** validan rendimientos de camiones.
- Una categoría sin calibrar se publica con la etiqueta **"no calibrado"** o no se publica. Lo decide el propietario en #11.

## 3. Protocolo de calibración

1. **Preregistro:** la estimación se genera y se congela **antes** del viaje.
2. **Dos conjuntos de datos:** uno de calibración (se usa para ajustar) y otro de validación (solo para medir).
3. **Separar errores:** se distingue el error del modelo de la divergencia de ruta (si el conductor tomó otra ruta, se registra aparte).
4. **Instrumentos:** odómetro, computador de a bordo, track GPS del teléfono, llenado a tope con boleta, cartolas TAG y boletas de peaje, cronómetro de carga y descarga.
5. **Consentimiento** escrito de cada participante (#17).

### Registro por viaje

ID · fecha · categoría · carga (kg) · comuna de origen y destino (**sin dirección exacta**) · hora de salida · km estimado y real · duración estimada y real · litros (tramo acumulado) · peajes estimados y cobrados · costo estimado y observado · ¿ruta seguida igual? · observaciones.

### Almacenamiento

- Los datos de calibración se guardan en **almacenamiento privado del propietario**, **nunca en este repositorio**.
- Las estimaciones de Google se conservan un máximo de 30 días; después solo quedan métricas agregadas (postura conservadora, #15).

### Muestra mínima propuesta

30 viajes en automóvil (urbano, interurbano, en punta y fuera de punta) y 10 viajes por categoría de carga.

## 4. Datos que justificarían introducir factores (hoy prohibidos)

| Factor | Datos necesarios |
|---|---|
| Consumo según carga | Por vehículo: pares de viajes vacío/cargado en la misma ruta, en 3 o más niveles de carga, con 5 o más pares por nivel y llenado a tope en tramos de 300 km o más. Por categoría: 3 o más vehículos. |
| Velocidad de camión frente a auto | 20 o más viajes por categoría con track GPS en rutas estimadas por Google, separando urbano de interurbano |
