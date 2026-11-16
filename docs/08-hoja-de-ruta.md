# 08 · Hoja de ruta y backlog

**Estado:** el diseño v4 completo está aprobado (A-21 a A-29). El **16-11-2026** el backlog se actualizó por encargo del propietario (A-30) **sin cerrar ni renumerar issues**: las épicas conservan sus números y su etiqueta de etapa, con el contenido alineado a esta hoja. La arquitectura sigue **propuesta** ([02 §8](02-arquitectura.md)). No autoriza programación.

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

1. **Diseño:** ✅ aprobado el 16-11-2026 (A-20 a A-29). Backlog actualizado.
2. **Arquitectura:** se elige proveedor de autenticación y datos, se verifica costo y respaldo; toda cuenta debe ser del propietario.
3. **Motor:** se construyen casos dorados antes de depender de resultados visuales.
4. **Integraciones:** solo servicios autorizados; cuota agotada → modo manual; sin garantía de $0 cuando exista facturación.
5. **Publicación:** seguridad, documentos y cumplimiento revisados. El propietario autoriza el lanzamiento.
6. **Validación real:** medir registro → primer cálculo → primera cotización → retorno y uso repetido.

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
