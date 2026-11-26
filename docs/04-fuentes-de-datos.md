# 04 · Fuentes de datos y restricciones de uso

> **Actualización 26-11-2026 (#20):** Deep Research confirma documentalmente CNE/Bencina en Línea; autenticación real y licencia específica de reutilización pendientes. Jerarquía, caché y contingencia propuestas en [27 §2](27-consolidacion-fase-0.md#2-deep-research-20--combustible). No autoriza integración ni uso automático.

**Estado:** guía de investigación para la primera calculadora gratuita. **No habilita ninguna API ni facturación**. Las cifras, cuotas, licencias y cobertura deben verificarse antes de implementar. Nombre comercial pendiente.

Convención: **VERIFICADO CON ENLACE** · **PROPUESTO** · **POR VALIDAR**. Fuente externa y fecha visibles al usuario cuando afectan el cálculo.

## 1. Rutas y mapa de Google

| Necesidad | Servicio candidato | Qué puede ofrecer | Restricción |
|---|---|---|---|
| Mostrar ruta A → B en pantalla | **Maps Embed API** | Mapa incrustado, indicaciones y preferencia `avoid=tolls` o `avoid=highways`; en UX v4 se muestra **una ruta a la vez** | **No** proporciona km/minutos como respuesta estructurada para los cálculos |
| Calcular km y duración por trayecto | **Google Routes API** | `distanceMeters` y `duration`; `staticDuration` y datos de tráfico según preferencia solicitada | Requiere facturación, control de SKU, campos y cuotas |
| Elegir alternativa evitando peajes | Routes `routeModifiers.avoidTolls` | Preferencia de ruta, **no garantía de cero peajes** | Si no hay ruta comparable, mostrarlo claramente |
| Dibujar dos rutas superpuestas | Posible alternativa técnica de mapas dinámicos | Por evaluar con datos de Routes y condiciones de Google | **No suponer que Embed admite esta visualización** |

Fuentes oficiales para consulta: [Maps Embed directions](https://developers.google.com/maps/documentation/embed/embedding-map), [Compute Routes](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes), [Tráfico](https://developers.google.com/maps/documentation/routes/config_trade_offs), [Precios](https://developers.google.com/maps/billing-and-pricing/pricing).

**Revisado el 16-11-2026, vía buscador sobre páginas oficiales.** La red de la sesión no permitió leer las páginas directamente, así que se confirman con lectura directa en #19. Detalle de solicitudes y respuestas en [02 §8.2](02-arquitectura.md).

| Hecho | Fuente |
|---|---|
| `TRAFFIC_UNAWARE` (por defecto) → SKU **Compute Routes Essentials**: 10.000 gratis/mes y luego 5 USD por 1.000; hasta 10 puntos intermedios | "Routes API Usage and Billing"; lista de precios |
| `TRAFFIC_AWARE` o `TRAFFIC_AWARE_OPTIMAL` → SKU **Compute Routes Pro**: 5.000 gratis/mes y luego 10 USD por 1.000 | Ídem |
| Se cobra **un solo SKU por solicitud**, el de la función más cara | Ídem |
| **Maps Embed:** sin cargo, sin límites diarios ni por segundo; requiere clave | "Maps Embed API Usage and Billing" |
| Cuotas diarias: las páginas de Geocoding y Places Aggregate dicen que se renuevan a medianoche, hora del Pacífico. **No se encontró la misma frase para Routes.** Por eso no se anuncia ninguna hora (A-27). | Páginas de uso de esas APIs |
| Peajes de Routes: "ciudades seleccionadas" (referencia `TollPass`); **Chile no aparece** en los resultados revisados. Sin precio, Routes indica "peaje con monto desconocido". | "Calculate toll fees" |

**Precisión:** Google puede devolver duraciones distintas según `TRAFFIC_UNAWARE`, `TRAFFIC_AWARE` o `TRAFFIC_AWARE_OPTIMAL`. La diferencia entre `duration` y `staticDuration` **no es una medición directa del tiempo perdido en un taco**. No convertirla automáticamente en litros adicionales. **Decisión UX propuesta:** consulta actualizada de tráfico solo con acción expresa, no en cada recálculo; comprobar por separado si el modo básico elegido genera o no cobros y qué datos de tráfico puede mostrar de forma legítima.

**Costos:** Maps Embed aparece en la tabla oficial como **SKU Embed con uso ilimitado sin cargo por evento**, aunque requiere configuración y facturación en Google Cloud. Routes tiene SKUs y límites gratuitos **diferentes según capacidades**; tráfico y peajes pueden cambiar la clasificación. **No presupuestar solamente dos consultas por cotización**: base→A, A→B y B→base opcional, cada uno con preferencias distintas, pueden requerir múltiples solicitudes.

**Presupuesto del propietario:** cargos variables = **$0 autorizados inicialmente**. El hecho de que una cuenta pueda tener facturación no es permiso de consumir servicios. Alertas y cuotas pueden retrasarse; implementar control de consumo propio, modo manual y apagado antes de activar cualquier llamada. **No prometer reinicio a las 05:00 ni a otra hora específica** salvo que esté verificada por el proveedor y por el mecanismo propio del proyecto.

**Rutas alternativas:** el usuario puede elegir una ruta más rápida o una que evita peajes si existen opciones válidas. No mostrar «X pesos más barata» cuando TAG, rendimiento u otros componentes pueden cambiar el resultado.

## 2. Dirección, términos y persistencia

- Entrada escrita o place ID según experimento chileno #19. Verificar comuna y coincidencia geográfica incluso cuando Google no marque `partialMatch`.
- Las rutas de Embed y Routes pueden **no coincidir exactamente**; la interfaz no debe afirmar que son idénticas sin verificación.
- **No hacer scraping** de la web/app de Google Maps para extraer tráfico, peajes o kilómetros.
- No guardar, redistribuir ni incluir en PDF datos derivados de Google sin análisis formal de sus términos (#15). Mientras tanto, favorecer guardar el **importe en pesos calculado por nuestro motor**, parámetros confirmados por usuario, y datos propios, no polilíneas/tiempos originales de Google.
- No mostrar resultados de Google en mapas de otros proveedores sin analizar las restricciones aplicables.
- El enlace «Abrir en Google Maps» permanece disponible aun si se agota la cuota de cálculo.

## 3. Combustible: Chile / CNE

- **Verificado el 25-11-2026.** La Comisión Nacional de Energía ofrece acceso gratuito mediante registro a precios de combustibles vehiculares por estación. [Portal oficial de la CNE](https://api.cne.cl/).
- **Propuesta para #4.** Actualizar una vez al día una referencia nacional en CLP/L para cada producto (bencina 93, 95 y 97 octanos, y petróleo diésel). Usar el producto elegido para el vehículo. Si una ficha solo dice «gasolina», pedir el octanaje. Calcular y guardar las referencias una sola vez para todas las cotizaciones del día.
- Mostrar producto, fuente, zona y fecha de la referencia. Permitir escribir el precio efectivamente pagado y conservarlo al actualizar los promedios. Cada cotización emitida conserva el importe usado. Si falla la actualización, mostrar la fecha de la última consulta exitosa. Si nunca hubo datos válidos para ese producto, solicitar el precio manual.
- **Pendiente en #20 antes de activar.** Confirmar condiciones de reutilización, cuotas y campos disponibles. Documentar qué estaciones y modalidades entran al promedio para que sea reproducible. El registro y la primera consulta autenticada dependen de la autorización de #8.
- El cálculo usa km/rendimiento del usuario o una referencia justificada y etiquetada. No inferir consumo en taco, carga o carretera solo por velocidad.
- Sin dato confiable de rendimiento, el gasto de combustible queda **incompleto**, no igual a cero.

## 4. Peajes y TAG

- Investigar tablas oficiales de concesionarias y MOP (#10/#21), por **pórtico, sentido, horario, categoría y fecha**.
- No asumir que `avoidTolls` significa TAG = 0. Solo concluir «ruta más barata» cuando no existan costos relevantes desconocidos que puedan invertir el resultado.
- Sin cobertura comprobada, **ingreso manual**, con estados diferenciados: confirmado en cero / monto declarado / monto desconocido.
- La automatización de peajes solo se activa cuando costos, cobertura, fuente y permisos estén aprobados.

## 5. Catálogo vehicular

- Categorías iniciales: vehículos de flete/mudanza livianos, con características reales del vehículo ingresadas por su dueño.
- Marca, modelo, año, motorización y combustible: usuario o catálogo propio verificable; fuente oficial por investigar (#22).
- El portal chileno de consumo vehicular puede aportar **referencias de homologación**, no rendimiento real de ese ejemplar. Verificar condiciones de reutilización.
- La viabilidad de motocicletas y camiones livianos se analiza por separado; alto tonelaje fuera de v1.
- Cualquier tipo de energía no modelable en litros requiere tratamiento explícito.

## 6. Hosting, identidad y privacidad

- **Revisado el 16-11-2026 (vía buscador, documentación oficial):** plan gratuito de Cloudflare Workers con 100.000 solicitudes/día, 1.000/min y 10 ms de CPU por invocación; reinicio a las 00:00 UTC; al exceder, error (documentación oficial "Workers · Limits"). Por validar: *static assets* fuera del límite y uso comercial (#18).
- **Revisado el 16-11-2026 (vía buscador, documentación oficial de Supabase):**
  - las tablas nuevas **no se exponen automáticamente** a la Data API: hacen falta `GRANT` explícitos, y RLS se configura aparte (changelog del 28-04-2026, obligatorio para todos los proyectos desde el 30-10-2026);
  - plan gratuito: 500 MB, 50.000 usuarios activos al mes, 5 GB de egreso, 1 GB de archivos y 2 proyectos gratuitos activos;
  - pausa tras ~1 semana de baja actividad;
  - **sin respaldos automáticos descargables** en el plan gratuito;
  - región `sa-east-1` disponible;
  - claves publicables y secretas (la secreta salta RLS).

  Detalle y condiciones en [02 §8.6](02-arquitectura.md) y #35.
- Cloudflare Worker/Pages y Supabase Auth/Postgres son la **propuesta de cierre** ([02 §8](02-arquitectura.md)), todavía no aprobada. Investigar límites gratuitos, respaldo, continuidad, reglas de seguridad y responsabilidades del proveedor (#8/#17/#18).
- Los datos personales/vehiculares y económicos privados deben tener acceso autenticado, con protección por propietario.
- Las cotizaciones públicas son **vistas minimizadas**; nunca deben revelar costos internos ni direcciones privadas por accidente.

## 7. Regulación

- Validar IVA, documentos tributarios y tributación del servicio en Chile (#16). **No aplicar IVA a todos los usuarios por defecto**; el IVA es configurable (A-28).
- **Hallazgos del 16-11-2026** (vía buscador; confirmar en #16): según las preguntas frecuentes del SII, la exención de IVA para quienes trabajan solos **no aplica** a quienes exploten vehículos de transporte de carga; en jurisprudencia del SII sobre una empresa de carga, los fletes se facturan afectos a IVA. El transporte de pasajeros está exento, pero no aplica aquí. Falta confirmar el documento que corresponde a cada perfil de persona natural.
- Revisar Ley 21.719 y cambios de vigencia, obligaciones de privacidad, transferencias internacionales y datos de cuentas (#17).
- Toda afirmación legal o tarifaria exige fuente oficial actualizada antes de publicación.


## 8. Auditoría Google Maps y evaluación de proveedores alternativos (16-11-2026)

- **[Deep Research Google Maps](11-auditoria-google-maps.md):** corrobora documentalmente Base→A→B→Base con tres legs y dos solicitudes para normal/evitando peajes; Google Maps Embed visualiza, pero no suministra los km al motor. **Abre un riesgo contractual no resuelto** sobre persistencia de resultados de Routes y precios derivados: ver #15; no declarar almacenamiento permitido ni prohibición absoluta sin interpretación suficiente.
- **[Comparación preliminar Mapbox / TomTom / HERE / Waze / GraphHopper](12-alternativas-mapas.md):** Mapbox Directions anuncia 100.000 solicitudes gratuitas/mes, 50.000 cargas web de mapa y cobertura de tráfico declarada para Chile; TomTom anuncia 20.000 solicitudes de rutas/mes; HERE ofrece plan Limited con restricciones; Waze no ofrece una API pública de cotización equivalente; GraphHopper Free es no comercial. **El precio de rutas no equivale al costo total** de mapa, búsqueda y almacenamiento.
- **No elegir proveedor hasta verificar:** exactitud de direcciones/ETA en Chile, condiciones de uso comercial, tratamiento y exportación de distancias/precios comerciales, riesgo de facturación, cuota y costo total.
- **No mezclar** resultados de Google Maps con mapas de otro proveedor hasta revisar los permisos de las respectivas licencias.
- Las **investigaciones profundas futuras serán por GPT Deep Research, con aviso y autorización previa del propietario**. Esta actualización no autoriza código, cuentas, experimentos, API ni gastos.
