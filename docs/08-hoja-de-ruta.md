# 08 · Hoja de ruta — replanteamiento pendiente

**Estado:** la secuencia anterior E0–E5 ya no refleja el nuevo alcance. **Aún existen épicas #1–#6 con etiquetas antiguas**; no se han reestructurado ni renumerado. Esta hoja es un **orden lógico de entregables**, pendiente de aprobación de arquitectura y del resto de las pantallas v4. La dirección visual y las pantallas de inicio/calculadora ya fueron aprobadas por el propietario. No autoriza programación.

## Secuencia propuesta

| Frente | Entregable | Condición para avanzar |
|---|---|---|
| **Preparación y diseño (E0)** | Nombre pendiente; dirección UX v4 blanco/azul/grafito aprobada para inicio/calculadora; extensión visual presentada; arquitectura de cuentas/almacenamiento; viabilidad APIs; casos dorados | Aprobación explícita de pantallas restantes, arquitectura y riesgos; **el nombre puede seguir pendiente** |
| **Motor y calculadora manual** | Motor aislado probado, perfil mínimo de vehículo, base→A→B→regreso, costo parcial y precio sugerido; acceso anónimo | Pruebas matemáticas independientes y sin APIs de pago |
| **Cuentas y vehículos** | Google login, almacenamiento seguro por usuario, varios vehículos, historial básico y respaldo | Proveedor y privacidad aprobados |
| **Mapas y rutas comparables** | Mapa de una ruta a la vez (UX v4), dos comparaciones económicas, Routes/Embed si se aprueban; tráfico actualizado **bajo demanda como propuesta**, contingencia manual | Términos Google, SKU de tráfico, cuotas, gastos y política de datos aprobados |
| **Combustibles, TAG y calidad de cifras** | Fuente oficial editable, peajes manuales y automatización verificada si es viable; pruebas con transportistas | No afirmar resultados completos con componentes ausentes |
| **Cotizador e historial** | PDF/compartir seguro, estados del documento, registro manual de viajes y combustible, **cotización indicativa posible aun con costo parcial**, IVA según usuario | Privacidad y reglas tributarias verificadas |
| **Validación y lanzamiento gratuito** | Pruebas móviles y de comprensión, seguridad, casos reales, publicación autorizada, medición de uso y recurrencia | Aprobación expresa del propietario |
| **Después del lanzamiento** | Estudiar Pro, IA, fotos, rentabilidad avanzada; marketplace vs. logística elástica | Evidencia de uso real y nuevo alcance aprobado |

**No fijar fechas ni dividir obligatoriamente en microissues.** Se pueden desarrollar varios frentes en paralelo si sus dependencias, responsables, archivos y pruebas están controlados.

## Puertas de aprobación

1. **Diseño:** dirección v4 e inicio/calculadora aprobados; Claude entregó la extensión de pantallas y ChatGPT la revisó. Se confirma con propietario la extensión y tres criterios funcionales pendientes, luego se reconciliará el backlog.
2. **Arquitectura:** se elige proveedor de autenticación y datos, se verifica costo y respaldo; toda cuenta debe ser del propietario.
3. **Motor:** se construyen casos dorados antes de depender de resultados visuales.
4. **Integraciones:** solo servicios autorizados; cuota agotada → modo manual; sin garantía de $0 cuando exista facturación.
5. **Publicación:** seguridad, documentos y cumplimiento revisados. El propietario autoriza el lanzamiento.
6. **Validación real:** medir registro → primer cálculo → primera cotización → retorno y uso repetido.

## Issues actuales y reconciliación

- **#23 / PR #34:** documentación; **no integrar sin OK**.
- **#24:** casos dorados; conservar los del motor aplicable a v1, mover pruebas de tercerización fuera del camino crítico.
- **#15–#22:** investigaciones reutilizables; redefinir alcance según mapa, cuentas, rutas simples, peajes y privacidad.
- **#26–#33:** tareas E1 existentes; verificar cuáles siguen siendo correctas antes de ejecutarlas.
- **#1–#6 y #7–#14:** épicas y decisiones existentes; algunos títulos/descripciones quedarán obsoletos hasta su revisión.

**Reorganizar y actualizar issues/épicas solo después de aprobar el diseño**, conservando trazabilidad. No se autoriza aún crear Trello, código, cuentas ni despliegues.
