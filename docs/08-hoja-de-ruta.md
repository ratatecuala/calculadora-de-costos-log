# 08 · Hoja de ruta y backlog

## Fases y puertas de aprobación (A-84)

Decisión y reglas obligatorias: [07 · A-84](07-decisiones.md). **Ninguna fase se autoriza sola:** cumplir sus KPI solo permite **pedir** el avance, y decide el propietario. Los **presupuestos máximos y plazos son DATO FALTANTE** hasta que los fije el propietario. Los umbrales son **iniciales** y se pueden ajustar con datos, también con aprobación.

**Tipos de KPI:**
- **T (técnico):** funciona;
- **C (comercial):** se usa y genera valor;
- **F (financiero):** conviene seguir invirtiendo.

Las simulaciones y las pruebas automatizadas **solo** cuentan como T.

### Resumen

| Fase | Qué se construye o valida | Estado (26-11-2026) |
|---|---|---|
| 0 · MVP funcional | Cotizador manual, seguridad, pruebas y staging | **En curso** (#52, I-2 local y H1 hechos; faltan los pasos de staging de [25](25-lista-staging-52.md)) |
| 1 · Validación comercial | Uso por transportistas reales | No iniciada. Requiere la puerta 0 |
| 2 · Rentabilidad por viaje | Cierre del servicio: presupuestado, estimado con el recorrido real y gastos comprobados | No iniciada |
| 3 · Rendimiento personalizado | Registro de cargas de combustible y calibración de km/L | **Solo recolección experimental** con el Chery (A-84, regla 8) |
| 4 · GPS opcional | Distancia, tiempos y detenciones con el teléfono | No iniciada |
| 5 · Premium / OBD-II | Telemetría y dispositivo opcional | No iniciada |

### Fase 0 · MVP funcional

- **KPI T:**
  - 0 P0/P1 abiertos en la última auditoría independiente;
  - e2e en verde **en staging**, con la suite de cuentas 59/59 y el flujo completo;
  - respaldo real y simulacro hechos (docs/25);
  - #52 aplicada con A-59;
  - probado en **un iPhone y un Android reales**.
- **Requisito legal:** aviso de privacidad publicado (#17) **antes** de recibir datos de usuarios reales, con los requisitos verificados en fuentes oficiales (A-84, regla 6).
- **Medición:** informes de auditoría en GitHub, resultados de las suites en staging y la lista de docs/25.
- **Puerta 0:**
  - **evidencia:** lo anterior;
  - **podría autorizarse:** abrir el piloto a usuarios invitados (dónde se ejecuta es una **decisión pendiente**: hoy el staging es privado y no hay producción autorizada);
  - **inversión:** DATO FALTANTE;
  - **decide:** el propietario.
- **Abandono:** no aplica (es la base del producto). Ante bloqueos se corrige el alcance.

### Fase 1 · Validación comercial

- **KPI C:**
  - ≥ 10 transportistas reales;
  - ≥ 30 cotizaciones reales **completadas** (documento emitido o enviado por WhatsApp);
  - ≥ 80 % completadas **sin ayuda**;
  - **retención:** ≥ 40 % vuelve a cotizar en 2–4 semanas.
- **KPI F:** costo de operación y soporte del piloto dentro del presupuesto (DATO FALTANTE).
- **Medición:**
  - conteos en la base sin analítica invasiva (cuentas, cotizaciones emitidas y fechas);
  - «sin ayuda», por observación o una encuesta breve;
  - las simulaciones no cuentan.
- **Puerta 1:**
  - **evidencia:** los KPI medidos y el resumen de comentarios;
  - **podría autorizarse:** el presupuesto de mejoras y la fase 2;
  - **inversión y plazo:** DATO FALTANTE;
  - **decide:** el propietario.
- **Abandono:** si no se alcanzan los KPI en el plazo (DATO FALTANTE), se corrige el producto y se repite una vez, o se replantea la propuesta antes de invertir más.

### Fase 2 · Rentabilidad por viaje

- **Qué:** cierre manual del servicio (km del odómetro, minutos, TAG y pagos reales) y conciliación por partida:
  - presupuestado: el snapshot;
  - estimado con el recorrido real: el mismo motor con los km y minutos reales;
  - comprobado: con respaldo.

  Cada partida tiene **una sola fuente**: comprobado si existe; si no, estimado. Así se evita contarla dos veces.
- **KPI T:** conciliación sin doble conteo, cubierta por pruebas y casos dorados.
- **KPI C:**
  - ≥ 20 servicios reales registrados;
  - ≥ 80 % con datos suficientes para evaluar el costo;
  - ≥ 50 % de los usuarios del piloto cierra al menos 2 servicios.
- **Medición:** registros de cierre en la base y su completitud por campo.
- **Puerta 2:**
  - **evidencia:** los KPI y ejemplos anonimizados de diferencias entre lo presupuestado y lo real;
  - **podría autorizarse:** la fase 3 y mejoras de conciliación;
  - **inversión:** DATO FALTANTE;
  - **decide:** el propietario.
- **Abandono:** si menos de la mitad de los usuarios cierra servicios, se simplifica el cierre o se descarta el módulo.

### Fase 3 · Rendimiento personalizado

- **Qué:** registro de cargas por vehículo (fecha, odómetro, litros, monto y si se llenó el estanque). El km/L calibrado se **sugiere**, nunca se aplica solo.
- **KPI T:**
  - ≥ 5 intervalos de estanque lleno por vehículo piloto, cada uno de ≥ 300 km;
  - variación ≤ 10 % **solo entre intervalos comparables** (mismo tipo de recorrido, carga y aire acondicionado; A-84, regla 4).
- **KPI C:** al menos 3 vehículos **de trabajo** (camioneta, furgón y camión liviano). El Chery valida el método, no los valores de vehículos de carga.
- **Medición:** planillas de campo fuera del repositorio cuando contengan datos personales (`scripts/campo/`).
- **Puerta 3:**
  - **evidencia:** la serie de intervalos por tipo de recorrido y el error frente al km/L declarado;
  - **podría autorizarse:** el desarrollo de la calibración en la app;
  - **inversión:** DATO FALTANTE;
  - **decide:** el propietario.
- **Abandono:** si la variación entre intervalos comparables supera el umbral, o si calibrar no cambia el costo de forma relevante, se queda con el km/L declarado.

### Fase 4 · GPS opcional

- **KPI T:**
  - **continuidad ≥ 95 % del recorrido mientras se usa Waze** (A-84, regla 5);
  - error de distancia ≤ 5 % frente al TRIP en ≥ 80 % de al menos 20 viajes de prueba;
  - consumo de batería aceptable.
- **KPI de valor:** el GPS cambia la conclusión de costo o precio en un porcentaje mínimo de viajes (umbral: DATO FALTANTE).
- **Medición:** pruebas reales en teléfonos y comparación con el TRIP. Ninguna promesa de funcionamiento en segundo plano sin evidencia.
- **Puerta 4:**
  - **evidencia:** el informe de continuidad, el error y la batería;
  - **podría autorizarse:** el prototipo dentro del producto, o evaluar alternativas como una app nativa (con costos de tienda);
  - **inversión:** DATO FALTANTE;
  - **decide:** el propietario.
- **Abandono:** si la web no alcanza la continuidad con Waze en uso, se documenta como limitación y no se construye la versión web.

### Fase 5 · Premium / OBD-II

- **KPI C:** demanda **comprometida** (preventa o carta de intención), no solo interés declarado.
- **KPI T:**
  - PID de consumo verificados en los vehículos más comunes del piloto;
  - camino técnico para iPhone (sin Web Bluetooth: app nativa).
- **KPI F:** margen positivo por dispositivo, incluidos soporte y logística.
- **Puerta 5:**
  - **evidencia:** los tres KPI;
  - **podría autorizarse:** la inversión en hardware o una alianza;
  - **inversión:** DATO FALTANTE;
  - **decide:** el propietario.
- **Abandono:** sin demanda comprometida o sin margen, no se avanza.

### Paralelismo permitido

Las fases pueden **recolectar datos** en paralelo sin desarrollar. Por ejemplo, las cargas del Chery (fase 3) mientras se cierra la fase 0. **Desarrollar** una fase siempre exige su puerta.

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
