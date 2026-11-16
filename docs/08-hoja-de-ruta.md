# 08 · Hoja de ruta y backlog

**Estado:** la dirección visual v4 está aprobada; los criterios A-21 a A-29 están comunicada por el propietario, pendiente de ratificación en PR #34. El **16-11-2026** el backlog se actualizó por encargo del propietario (A-30) **sin cerrar ni renumerar issues**: las épicas conservan sus números y su etiqueta de etapa, con el contenido alineado a esta hoja. La arquitectura sigue **propuesta** ([02 §8](02-arquitectura.md)). No autoriza programación.

## Secuencia propuesta

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

## Puertas de aprobación

1. **Diseño:** dirección v4 aprobada; A-21 a A-29 pendientes de ratificación en el PR #34. Backlog actualizado.
2. **Arquitectura:** se elige proveedor de autenticación y datos, se verifica costo y respaldo; toda cuenta debe ser del propietario.
3. **Motor:** se construyen casos dorados antes de depender de resultados visuales.
4. **Integraciones:** solo servicios autorizados; cuota agotada → modo manual; sin garantía de $0 cuando exista facturación.
5. **Publicación:** seguridad, documentos y cumplimiento revisados. El propietario autoriza el lanzamiento.
6. **Validación real:** medir registro → primer cálculo → primera cotización → retorno y uso repetido.

## Orden de implementación propuesto (requiere autorización de programación)

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

## Backlog actualizado el 16-11-2026

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
