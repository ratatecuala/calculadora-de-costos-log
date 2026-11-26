# 08 · Hoja de ruta y backlog

> **A-89:** incorporar al diseño de fase 0 dos modalidades con un solo motor: simplificada predeterminada y detallada opcional. Revisar alcance 0A, protocolo 0B y segmento/competitividad 0C tras auditar las entregas vigentes. No cambia puertas ni autoriza programación. [Decisión](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7182307655).

> **Seguimiento 26-11-2026:** [consolidación de primera ronda de fase 0](27-consolidacion-fase-0.md): #20 bloqueado para integración, A-87 aceptada documentalmente, #55 pendiente de correcciones y regresión. Objetivo económico 10 % acordado; protocolo y próximos trabajos propuestos. Las puertas vigentes no cambian.

## Fases y puertas de aprobación (A-84, revisada por A-85)

Decisiones y reglas obligatorias: [07 · A-84 y A-85](07-decisiones.md). Fechas en **hora de Chile**.
- **Nada se autoriza solo:** cumplir los KPI de una fase solo permite **pedir** el avance, y decide el propietario.
- **Presupuestos máximos, plazos y umbrales no aprobados son DATO FALTANTE** hasta que el propietario los fije.

**Tipos de KPI:**
- **T (técnico):** funciona.
- **E (económico):** el costo estimado se acerca al real medido.
- **C (comercial):** se usa, genera valor y es competitivo.
- **F (financiero):** conviene seguir invirtiendo.

Las simulaciones y las pruebas automatizadas **solo** cuentan como T.

### Hipótesis de posicionamiento (A-85, por validar)

Una herramienta de **control económico** para transportistas independientes. Preguntas guía:
- «¿Estás ganando dinero con tus fletes o solamente cubriendo gastos?»
- «¿Sabes cuánto te cuesta cada kilómetro?»
- «¿Estás cobrando lo suficiente por transportar carga?»
- «¿Cuánto gastas en combustible, desgaste y TAG?»

El cotizador es una consecuencia de conocer los costos. **Es una hipótesis:** no se prometen ganancias ni exactitud sin evidencia. Se valida en 0C y en la fase 1.

### Tres tipos de validación (no se confunden)

| Tipo | Cuándo | Quién y con qué | Qué demuestra | Qué NO demuestra |
|---|---|---|---|---|
| **Experimental previa al piloto** | Fase 0 (0B y 0C) | El propietario y pocos transportistas cercanos, con mediciones reales, instrumentos externos y entrevistas | Si el costo estimado se acerca al real y si el precio resultante es plausible frente al mercado | Demanda ni uso sostenido |
| **Comercial** | Fase 1 | Transportistas reales usando el producto | Uso, retención y valor percibido | La precisión de módulos futuros |
| **De funciones futuras** | Fases 2–5 | Cada módulo, después de su puerta | Que el módulo agrega valor medible | — |

**Instrumentos externos permitidos antes de construir módulos (A-85):**
- TRIP y odómetro, cronómetro y boletas de combustible;
- cartola o comprobantes de TAG;
- apps gratuitas de terceros que exporten GPX;
- planillas (`npm run campo`, docs/05 §4);
- un lector OBD-II ya disponible, si existe.

Los datos personales (ubicaciones, domicilios, patentes, boletas) quedan **fuera del repositorio** (`calibracion/`, excluida de Git). **No se contrata ningún servicio** sin autorización.

### Resumen

| Fase | Qué se construye o valida | Estado (25-11-2026) |
|---|---|---|
| **0A** · MVP funcional | Cotizador manual y su flujo completo | **Avanzado:** funciona en local; #52, I-2 paso 1, H1 y precio entero en la base hechos **en local** |
| **0B** · Validación económica y calibración | Costo estimado frente a costo medido, por partida | **Recolección iniciada** (pruebas del Chery); criterios de #12 **pendientes de aprobación** |
| **0C** · Competitividad y posicionamiento | *Benchmark* de precios y prueba de la hipótesis de posicionamiento | No iniciado |
| **0D** · Seguridad, experiencia y piloto | Staging, privacidad, dispositivos reales y plan del piloto | **Bloqueado** en los pasos de staging de [25](25-lista-staging-52.md) y A-59 |
| 1 · Validación comercial | Uso por transportistas reales | Requiere la puerta 0 |
| 2 · Rentabilidad por viaje | Módulo de cierre del servicio en la app | Futura |
| 3 · Rendimiento personalizado | Módulo de cargas y calibración en la app | Futura (los datos se recolectan en 0B) |
| 4 · GPS opcional | Distancia, tiempos y detenciones con el teléfono | Futura |
| 5 · Premium / OBD-II | Telemetría y dispositivo opcional | Futura |

### Fase 0 · cuatro bloques en paralelo

**Preparación técnica (A-87, 26-11-2026):** la matriz por componente económico (combustible, TAG, C-1, C-2, rendimiento, desgaste y procedencia), las instrucciones de staging para el propietario, la coordinación con Codex y el orden recomendado están en [26](26-preparacion-fase-0.md). **PROPUESTO:** cada paso pide su aprobación.

**Dependencias:**
- 0B y 0C pueden avanzar ya, con instrumentos externos.
- 0C usa los resultados de 0B para comparar el precio sugerido con el mercado.
- 0D depende de 0A para las pruebas en dispositivos y de las autorizaciones de staging.
- La puerta 0 exige los cuatro.

**0A · MVP funcional**
- **KPI T:**
  - flujo completo vehículo → recorrido manual → costos → precio → documento → PDF y WhatsApp;
  - 0 P0/P1 abiertos en la última auditoría independiente;
  - pruebas automatizadas y CI en verde.
- **Medición:** informes de auditoría en GitHub y resultados de CI ([09](09-revision-y-aprobacion.md)).

**0B · Validación económica y calibración**
- **Qué se mide por servicio o viaje real** (planilla de campo, con fuente y dato faltante explícitos):
  - **distancia:** TRIP con resolución de 0,1 km;
  - **tiempos:** marcha, espera y carga/descarga, por separado;
  - **combustible:** lleno a lleno, con la fórmula de docs/05 §4;
  - **TAG:** cartola o comprobante de la concesionaria;
  - **desgaste:** gastos reales de neumáticos, aceite y mantención en un periodo, divididos por los km del periodo. Es **ESTIMADO** con su fuente, y el horizonte de medición es DATO FALTANTE;
  - **carga:** tipo y peso aproximado;
  - **recursos:** ayudantes pagados y minutos.
- **Criterios de calibración de [#12](https://github.com/ratatecuala/calculadora-de-costos-log/issues/12)** (**PROPUESTOS, pendientes de aprobación**; ninguna categoría se calibra con datos de otra):
  - distancia ≤ 3 % en el 90 % de los viajes;
  - tiempo de conducción ≤ 15 % o ±10 min;
  - consumo ≤ 10 % en autos y ≤ 15 % en vehículos de carga, con 3 o más vehículos por categoría;
  - peajes 100 % detectados;
  - motor 100 % coincidente con la planilla independiente;
  - comprensión 4 de 5;
  - muestra mínima: 30 viajes en auto y 10 por categoría de carga.
- **Método de variación del consumo** (corrige A-84):
  1. Agrupar los intervalos lleno a lleno en **clases comparables**: tipo de recorrido predominante (urbano, autopista o mixto) × carga (sin, parcial o completa) × aire acondicionado (sí o no). Nunca se mezclan clases.
  2. En cada clase se informan n, media de km/L, desviación estándar, **coeficiente de variación** (desviación ÷ media) y desviación máxima respecto de la media.
  3. Solo se evalúa una clase con **n ≥ 3** intervalos. Con menos, queda «insuficiente», no aprobada.
  4. El umbral (≤ 10 % autos, ≤ 15 % carga, de #12) es **por aprobar**.
- **Tamaño del intervalo** (corrige los 300 km de A-84):
  - el criterio es el **combustible consumido**, no la distancia: cada intervalo debe consumir suficientes litros para que el error de llenado (DATO FALTANTE, por medir repitiendo llenados en la misma bomba) sea a lo sumo la mitad de la tolerancia de la clase;
  - 300 km es solo una **referencia** para autos (#12), no una regla universal: un camión puede consumir mucho en menos km, y un auto eficiente necesita más.
- **KPI E:** la diferencia entre el costo estimado por el motor y el costo medido, **por partida** (combustible, TAG, tiempos, desgaste y recursos), dentro de los umbrales aprobados para cada categoría ensayada.

**0C · Competitividad y posicionamiento**
- ***Benchmark* independiente de precios de mercado:**
  - fuentes públicas fechadas (tarifas publicadas, plataformas y anuncios de fletes) y entrevistas a transportistas;
  - se registran la fuente, la fecha, el tipo de servicio, los km, la carga y los ayudantes;
  - cualquier método de consulta directa a terceros se decide antes con el propietario, para no engañar a nadie;
  - las condiciones de uso de cada fuente se revisan antes de copiar datos.
- **Regla:** el *benchmark* **informa**; **nunca** se ajustan costos, fórmulas ni márgenes para igualar a la competencia. Si el precio sugerido queda sobre el mercado, se analiza la causa: el costo real, un supuesto o un posicionamiento distinto.
- **Posicionamiento:** entrevistas con transportistas sobre las preguntas guía. El número y el guion son DATO FALTANTE.
- **KPI C (experimental):**
  - la distancia entre el precio sugerido y el rango de mercado en los casos ensayados (umbral DATO FALTANTE);
  - el porcentaje de entrevistados que reconoce el problema de control de costos (umbral DATO FALTANTE).

**0D · Seguridad, experiencia y preparación del piloto**
- Respaldo real y simulacro (docs/25), #52 en staging (A-59) y la decisión sobre I-2 en staging, cada uno con su autorización.
- Suites e2e con cuentas en staging (59/59 y flujo completo), y pruebas en **un iPhone y un Android reales**.
- **Privacidad:** aviso (#17) con los requisitos y la vigencia de la Ley 21.719 **verificados en fuentes oficiales** antes de recibir datos de usuarios reales (A-84, regla 6).
- Plan del piloto: dónde se ejecuta (**decisión pendiente**: hoy el staging es privado y no hay producción autorizada), consentimiento, soporte y retiro de datos.

**Puerta 0:**
- **Evidencia requerida:**
  - 0A completo;
  - informe de **0B** con los KPI E por partida y categoría, frente a los umbrales **aprobados**;
  - informe de **0C** (*benchmark* y posicionamiento);
  - 0D completo.

  **Sin la evidencia económica y comercial no se abre el piloto.**
- **Podría autorizarse:** el piloto de la fase 1, con una inversión DATO FALTANTE.
- **Decide:** el propietario.

**Criterio de reevaluación de la fase 0** (corrige «no aplica» de A-84):
- **Si 0B no cumple** en una partida, esa partida se muestra como **declarada o parcial**, no como estimada con precisión. Se corrige el supuesto o se acota el alcance, sin cambiar fórmulas sin la aprobación de A-50.
- **Si 0C muestra** precios sugeridos sistemáticamente fuera del rango de mercado sin una causa explicable, o un posicionamiento que no resuena, se revisa la hipótesis antes del piloto.
- **Si tras un número de iteraciones** (DATO FALTANTE) no se cumple, el propietario decide entre replantear, pausar o reducir el producto a calculadora de costos sin precio sugerido.

### Fase 1 · Validación comercial

- **KPI C:**
  - ≥ 10 transportistas reales;
  - ≥ 30 cotizaciones reales **completadas** (documento emitido o enviado por WhatsApp);
  - ≥ 80 % completadas **sin ayuda**;
  - **retención:** ≥ 40 % vuelve a cotizar en 2–4 semanas;
  - percepción de valor sobre el control de costos, por encuesta breve.
- **KPI F:** costo de operación y soporte dentro del presupuesto (DATO FALTANTE).
- **Medición:**
  - conteos en la base sin analítica invasiva;
  - «sin ayuda», por observación o encuesta;
  - las simulaciones no cuentan.
- **Puerta 1:**
  - **evidencia:** los KPI y los comentarios;
  - **podría autorizarse:** el presupuesto de mejoras y la fase 2 (DATO FALTANTE);
  - **decide:** el propietario.
- **Abandono:** si no se alcanza en el plazo (DATO FALTANTE), se corrige y se repite una vez, o se replantea la propuesta.

### Fase 2 · Rentabilidad por viaje (módulo en la app)

- **Qué:** cierre del servicio **en la app** y conciliación por partida:
  - presupuestado: el snapshot;
  - estimado con el recorrido real: el mismo motor;
  - comprobado: con respaldo.

  **Una sola fuente por partida.** En la fase 0 esto se hace con planillas (0B); aquí se construye en el producto.
- **KPI T:** conciliación sin doble conteo, cubierta por pruebas y casos dorados.
- **KPI C:**
  - ≥ 20 servicios reales registrados;
  - ≥ 80 % con datos suficientes;
  - ≥ 50 % de los usuarios del piloto cierra al menos 2 servicios.
- **Puerta 2:**
  - **evidencia:** los KPI y ejemplos anonimizados;
  - **podría autorizarse:** la fase 3 (DATO FALTANTE);
  - **decide:** el propietario.
  - **Abandono:** si menos de la mitad cierra servicios, se simplifica el cierre o se descarta el módulo.

### Fase 3 · Rendimiento personalizado (módulo en la app)

- **Qué:** registro de cargas **en la app**. El km/L calibrado se **sugiere**, nunca se aplica solo.
- **KPI T:** las clases comparables cumplen el umbral aprobado, con el método de 0B (n ≥ 3 por clase y criterio de litros consumidos).
- **KPI C:** al menos 3 vehículos **de trabajo** (camioneta, furgón y camión liviano). El Chery valida el método, no los valores de vehículos de carga.
- **Puerta 3:**
  - **evidencia:** la serie por clase y el error frente al km/L declarado;
  - **podría autorizarse:** desarrollar la calibración (DATO FALTANTE);
  - **decide:** el propietario.
  - **Abandono:** si no se cumple, o si calibrar no cambia el costo de forma relevante, se mantiene el km/L declarado.

### Fase 4 · GPS opcional

- **KPI T:**
  - continuidad ≥ 95 % del recorrido **mientras se usa Waze** (A-84, regla 5);
  - error de distancia ≤ 5 % frente al TRIP en ≥ 80 % de al menos 20 viajes;
  - batería aceptable.
- **KPI de valor económico** (corrige A-84): por viaje, la **diferencia en pesos y en % del costo** entre el costo calculado con datos del GPS y el calculado con TRIP y reloj. El GPS se justifica solo si:
  - esa diferencia supera un umbral de relevancia (DATO FALTANTE);
  - la mejora esperada, multiplicada por los viajes, supera el costo de construirlo y mantenerlo (KPI F).
- **Puerta 4:**
  - **evidencia:** el informe de continuidad, error, batería y valor;
  - **podría autorizarse:** el prototipo o alternativas, como una app nativa con costos de tienda (DATO FALTANTE);
  - **decide:** el propietario.
  - **Abandono:** si la web no logra la continuidad con Waze, queda como limitación documentada y no se construye la versión web.

### Fase 5 · Premium / OBD-II

- **KPI C:** demanda **comprometida** (preventa o carta de intención).
- **KPI T:** PID de consumo verificados en los vehículos del piloto, y un camino técnico para iPhone (app nativa).
- **KPI F:** margen positivo por dispositivo, incluidos soporte y logística.
- **Puerta 5:**
  - **evidencia:** los tres KPI;
  - **podría autorizarse:** la inversión en hardware o una alianza (DATO FALTANTE);
  - **decide:** el propietario.
  - **Abandono:** sin demanda comprometida o sin margen, no se avanza.

### Paralelismo y coordinación

- Las fases pueden **recolectar datos** en paralelo sin desarrollar (por ejemplo, 0B y la serie de cargas de la fase 3). **Desarrollar** exige la puerta.
- **Seguimiento visual:** un tablero privado de Trello de la fase 0 (A-85), para el propietario, Claude, Codex y GPT. **GitHub es la fuente de verdad técnica.** El enlace del tablero no se publica en el repositorio.

## Estado vigente (20-11-2026, hasta `2f8e112`)

Las secciones siguientes son la hoja de ruta del **16-11-2026** y se conservan como **historia**: varias olas ya ocurrieron (el motor, la calculadora con rutas simuladas, las cuentas y el staging gratuito, A-44 a A-46). El estado de cada función está en el [README](../README.md) y las decisiones en [07](07-decisiones.md).

| Frente | Estado | Siguiente paso | Requiere |
|---|---|---|---|
| Calculadora, cotizador, PDF, historial, vehículos y cuentas | **Funciona** en local y en el staging privado del 18-11 ([13](13-staging.md)) | Cliente OAuth de Google y primer respaldo real (A-52, A-53) | Acciones del propietario |
| Validación del motor (#24) | Casos dorados 64/64; C-1 a C-4 corregidos (A-50) | Correcciones Doc-1 a Doc-6 de [03](03-motor-de-costos.md) | Aprobación |
| IVA (#16, #37) | «Precio total» y leyenda (A-51); opción B sin implementar | Informe de GPT Deep Research ([18](18-encargo-deep-research-iva.md)) | El propietario ejecuta el encargo |
| Cotizador ampliado (épica #42, [19](19-plan-cotizador-ampliado.md)) | Planificación aprobada (A-55 a A-60); diseño #45 aprobado (A-61, A-62) | — | — |
| ↳ Fase 0: contratos ([21 §16](21-diseno-datos-cotizador.md)) | **Cerrada** (A-63) | — | — |
| ↳ Fase 1: editores de inventario #47 y recursos #51 ([21 §17](21-diseno-datos-cotizador.md)) | **Cerrada técnicamente**, flag `VITE_FF_CARGA_RECURSOS` apagada (A-66) | — | — |
| ↳ Integración I-1 + I-1b (#53, [22](22-diseno-integracion-cotizador.md)) | **Cerrada técnicamente**: 0 P0 · 0 P1 ([22 §14](22-diseno-integracion-cotizador.md)); flag `VITE_FF_INTEGRACION_CARGA` apagada (A-68) | Decisión **D-I8** (km y minutos manuales en el borrador) | Tu decisión |
| ↳ Encender la flag para transportistas | **No autorizado** | Cuentas reales y 59/59 en staging, Safari en iPhone real, lector de pantalla (D-I8 parcial ya implementada, A-69, [22 §15](22-diseno-integracion-cotizador.md)) | Autorización de staging y de la flag |
| ↳ #52 → I-2 (M3, M4: inventario en la cuenta) | **No autorizado.** Migración de #52 implementada **solo en el repositorio y en local** (A-74, [23 §11](23-revision-52-insert-directo.md)), sin aplicar en Supabase | Migración aprobada técnicamente (A-76); seguir [25](25-lista-staging-52.md): primer respaldo real, verificaciones de solo lectura (autorización aparte), revisión y A-59 para aplicarla en staging; respaldo real; autorización por migración (A-59) | Autorizaciones individuales |
| ↳ I-3: recursos en el costo | **No autorizado** | Aprobar las fórmulas de [21 §4.3–§4.4](21-diseno-datos-cotizador.md) y casos dorados nuevos | Aprobación de fórmulas |
| ↳ Catálogo #46 y costo según carga #48 | **Sin empezar** | Ejecutar C-1 y C-2 ([20](20-encargos-deep-research-cotizador.md)); D-2b y D-5 | El propietario ejecuta las investigaciones |
| Google Routes real (#49) | **Apagado** (proveedor simulado) | D-10 | Autorización expresa |
| Producción, facturación, merge del PR #34 | **No existen ni están autorizados** | — | Aprobación expresa |

---

## Hoja de ruta del 16-11-2026 (histórica)

**Estado (16-11-2026):** la dirección visual v4 está aprobada; los criterios A-21 a A-29 están comunicada por el propietario, pendiente de ratificación en PR #34. El **16-11-2026** el backlog se actualizó por encargo del propietario (A-30) **sin cerrar ni renumerar issues**: las épicas conservan sus números y su etiqueta de etapa, con el contenido alineado a esta hoja. La arquitectura sigue **propuesta** ([02 §8](02-arquitectura.md)). No autoriza programación.

### Secuencia propuesta

| Frente | Entregable | Condición para avanzar |
|---|---|---|
| **Preparación y diseño (E0, #1)** | Diseño v4 **aprobado**; arquitectura propuesta (#35); viabilidad de APIs (#15, #18, #19); IVA (#16); casos dorados (#24); nombre pendiente | Aprobación de la arquitectura y riesgos; **el nombre puede seguir pendiente** |
| **Motor y calculadora manual (E1, #2)** | Motor aislado probado, perfil mínimo de vehículo, base→A→B→regreso, costo parcial como cotas, IVA configurable (#37), separación de la cotización (#38), términos sencillos (#39); acceso anónimo | Pruebas matemáticas independientes y sin APIs de pago |
| **Cuentas y vehículos (E4, #5)** | Google login, almacenamiento seguro por usuario, varios vehículos, historial básico y respaldo | Proveedor y privacidad aprobados |
| **Mapas y rutas comparables (E2, #3)** | Mapa de una ruta a la vez (A-22), dos comparaciones económicas, Routes/Embed si se aprueban; tráfico actualizado **bajo demanda (A-23)**, contingencia manual | Términos Google, SKU de tráfico, cuotas, gastos y política de datos aprobados |
| **Combustibles, TAG y calidad de cifras (E3, #4)** | Fuente oficial editable, peajes manuales y automatización verificada si es viable; pruebas con transportistas | No afirmar resultados completos con componentes ausentes |
| **Cotizador e historial (E4, #5)** | PDF/compartir seguro, estados del documento, registro manual de viajes y combustible, **cotización indicativa posible aun con costo parcial**, IVA según usuario | Privacidad y reglas tributarias verificadas |
| **Validación y lanzamiento gratuito (E5, #6)** | Pruebas móviles y de comprensión, seguridad, casos reales, publicación autorizada, medición de uso y recurrencia | Aprobación expresa del propietario |
| **Después del lanzamiento (futuro, #36)** | Estudiar Pro, IA, fotos, rentabilidad avanzada; marketplace vs. logística elástica | Evidencia de uso real y nuevo alcance aprobado |

**No fijar fechas ni dividir obligatoriamente en microissues.** Se pueden desarrollar varios frentes en paralelo si sus dependencias, responsables, archivos y pruebas están controlados.

### Puertas de aprobación

1. **Diseño:** dirección v4 aprobada; A-21 a A-29 pendientes de ratificación en el PR #34. Backlog actualizado.
2. **Arquitectura:** se elige proveedor de autenticación y datos, se verifica costo y respaldo; toda cuenta debe ser del propietario.
3. **Motor:** se construyen casos dorados antes de depender de resultados visuales.
4. **Integraciones:** solo servicios autorizados; cuota agotada → modo manual; sin garantía de $0 cuando exista facturación.
5. **Publicación:** seguridad, documentos y cumplimiento revisados. El propietario autoriza el lanzamiento.
6. **Validación real:** medir registro → primer cálculo → primera cotización → retorno y uso repetido.

> **17-11-2026:** el propietario autorizó en el PR #34 las fases 1 (documentación), 2 (candado de consumo) y 3 (cotizador con datos simulados) (A-44). Conectar Google Routes, crear cuentas, desplegar e integrar siguen sin autorización.

### Orden de implementación propuesto (requiere autorización de programación)

| Ola | Trabajo | En paralelo | Bloqueantes | Gasto |
|---|---|---|---|---|
| **0 · Cierre de E0** | Integrar PR #34 con ratificación de A-21 a A-29; casos dorados (#24); reglas de IVA (#16) | Investigaciones #15, #17 y #18 | OK del propietario | Ninguno |
| **1 · Motor (E1, #2)** | Un issue grande y cohesivo: #26 → #27 → #28 + #29, y luego #37, #38 y #31 | #30 (pruebas) avanza junto al motor; #39 (textos) en paralelo, sin tocar el motor | Autorización de E1; G1 a G10 calculados | Ninguno: se prueba en local y en CI |
| **2 · Calculadora manual (E1)** | #32 y #33 sobre el motor ya probado | Puede empezar con el contrato de tipos del motor congelado | Cuenta de Cloudflare (#8) solo para la vista previa | Plan gratuito |
| **3 · Rutas (E2, #3)** | Worker de Routes, contador, interruptor, mapa Embed, tráfico bajo demanda | E4 puede empezar en paralelo | #9 (cuota elegida), #19 (experimento autorizado), #18 (contador), #15 | Tramo gratuito; riesgo acotado según #9 |
| **3 · Cuentas y cotización (E4, #5)** | Supabase, RLS, `client_quotes`, PDF, enlace, historial | En paralelo con E2: archivos distintos (`supabase/`, `src/web` de cuentas) | #35 aprobado, #17, #16 | Plan gratuito; Pro solo con aprobación |
| **4 · Combustible y peajes (E3, #4)** | CNE y peajes | Independiente | #20, #21, #10 | Por definir |
| **5 · Validación (E5, #6)** | Calibración, comprensión, seguridad, publicación | — | #12, #13, #7, #14 | Por aprobar |

**Puede empezar sin contratar servicios ni gastar**, una vez autorizado:
- motor, pruebas y casos dorados;
- textos y glosario;
- esquemas Zod y `toClientQuote()`;
- migraciones SQL y pruebas de RLS contra un Postgres **local** (sin crear el proyecto en Supabase);
- plantilla de solicitudes de Routes con respuestas simuladas;
- investigaciones de términos, IVA y privacidad.

**Regla de paralelismo:** dos frentes en paralelo no tocan los mismos archivos; el contrato de tipos del motor se congela antes de que la interfaz lo consuma.

### Backlog actualizado el 16-11-2026

Las etiquetas de etapa (E0–E5) se conservan como identificadores de épica; el orden real lo da la tabla anterior, y varios frentes pueden avanzar en paralelo.

| Épica | Contenido actual |
|---|---|
| **#1 E0** | Decisiones e investigaciones; suma #35 (Supabase) y el IVA por perfil (#16) |
| **#2 E1** | Motor y calculadora manual en un solo modo (transportista); suma #37 IVA, #38 separación y #39 términos sencillos; #29 y #32 reescritas |
| **#3 E2** | Renombrada: «Rutas, mapa y comparación de rutas»; tráfico bajo demanda, sin hora de reinicio, modo manual |
| **#4 E3** | Combustible y peajes (sin cambios de alcance) |
| **#5 E4** | Renombrada: «Cuentas, vehículos, cotización profesional e historial» |
| **#6 E5** | Validación y lanzamiento (sin cambios de alcance) |
| **#36 Futuro** | Nueva: comparador para clientes, subcontratación, Pro; contiene #11 y #22 |

Otros cambios: comentarios de verificación en #8, #9, #15, #16, #18, #19, #21 y #23. **#24** (casos dorados) debe incluir casos con datos faltantes y rutas alternativas; las pruebas de tercerización no son bloqueantes. **#26–#33** siguen vigentes con los ajustes de #29 y #32.

No se autoriza aún crear Trello, código, cuentas ni despliegues.
