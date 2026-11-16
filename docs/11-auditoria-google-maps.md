# 11 · Auditoría documental de Google Maps Platform (Deep Research, 16-11-2026)

**Estado:** informe externo recibido del propietario y revisado para documentación. Es **evidencia de investigación**, no aprobación de proveedor, uso de datos, interpretación jurídica, facturación ni prueba real. **No se ejecutaron APIs**. Investigación profunda adicional **solo con autorización previa del propietario y mediante GPT Deep Research**.

**Fuente base:** Deep Research facilitado por el propietario («Auditoría integral de Google Maps Platform para una calculadora gratuita de fletes en Chile», 16-11-2026). El informe señala documentación oficial al 11-11-2026. Las conclusiones contractuales son **interpretación preliminar, no dictamen jurídico**. Para el texto completo, conservar el material aportado por el propietario fuera del repositorio público si contiene material no autorizado.

## 1. Compatibilidad técnica documentada

| Requisito | Resultado del informe | Condición |
|---|---|---|
| Mapa integrado | Maps Embed API, SKU sin cargo por evento | Cuenta/proyecto con facturación y clave API, controles y atribución |
| Base → A → B → Base | `computeRoutes` con Base como origen y destino; A/B como intermediarios; tres `RouteLeg` | Verificar caso real cuando se autorice |
| Dos criterios de ruta | Dos solicitudes: normal y `routeModifiers.avoidTolls=true` | Evitar peajes es **preferencia**, no garantía de TAG $0 |
| Comparación de kilómetros/tiempos | `routes.legs[].distanceMeters` y `duration` | Datos estructurados vienen de Routes, **no** del Embed |
| Tráfico | `TRAFFIC_AWARE` activa Pro | Solicitud expresa del usuario; no actualizar al teclear |
| Precio TAG en Chile | **No hay cobertura de precios de peajes chilena documentada** en la lista verificada | TAG manual con fuente/procedencia, nunca cero implícito |
| Ruta para camión grande | `TRUCK` no disponible para Chile según documentación consultada | No prometer cumplimiento de restricciones de carga/peso |
| Mapa vs ruta calculada | Embed reconstruye camino por sus propios parámetros | Mapa orientativo; **no garantizar identidad geométrica** |

**Importante:** `computeAlternativeRoutes=true` no sustituye la segunda solicitud cuando existen puntos intermedios. No extrapolar el resultado a itinerarios con optimización de múltiples entregas (fuera de v1).

**Fuentes oficiales mencionadas:**
- [Routes: computeRoutes](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes)
- [Routes: estructura de respuestas](https://developers.google.com/maps/documentation/routes/understand-route-response)
- [Routes: modificadores](https://developers.google.com/maps/documentation/routes/reference/rest/v2/RouteModifiers)
- [Maps Embed](https://developers.google.com/maps/documentation/embed/embedding-map)
- [Tráfico](https://developers.google.com/maps/documentation/routes/config_trade_offs)
- [Peajes y cobertura](https://developers.google.com/maps/documentation/routes/calculate_toll_fees)

## 2. Precios y protección de presupuesto

Tarifas que el informe atribuye a la lista oficial del **11-11-2026** (USD, por 1.000 eventos adicionales; sujetas a cambios y verificación antes de contratar):

| SKU | Tramo sin cargo mensual | Tarifa inicial adicional |
|---|---:|---:|
| Maps Embed | Ilimitado por evento | $0 |
| Compute Routes Essentials | 10.000 | $5 |
| Compute Routes Pro | 5.000 | $10 |
| Compute Routes Enterprise | 1.000 | $15 |

- El **nivel de SKU se determina por las características de cada solicitud**: tráfico `TRAFFIC_AWARE` o `OPTIMAL` implica Pro; `extraComputations:["TOLLS"]` implica Enterprise. Evitar activar funciones Enterprise accidentalmente.
- El informe plantea **dos solicitudes por cotización completa** (normal + evitando peajes), y solicitudes Pro **solo si el usuario pulsa «Actualizar tráfico»**.
- **Los presupuestos de Google no detienen facturación**. Quotas y límites propios ayudan, pero **no garantizan $0**; prohibido habilitar servicios sin autorización expresa.
- Las peticiones fallidas y reintentos pueden afectar consumo o costo según error. Reservar cupo *antes* de llamar al proveedor; contador atómico y persistente, deduplicación, cuotas por sesión/usuario, apagado y modo manual.
- **No prometer 3.800 cálculos/mes**: es estimación basada en 2 llamadas/cálculo y otros supuestos. Tampoco prometer hora fija de restablecimiento.
- El informe cita que cuotas diarias pueden reiniciar a medianoche del Pacífico en configuraciones específicas; no usar esa afirmación en UI sin verificar consola y límites reales.

Fuentes: [precios](https://developers.google.com/maps/billing-and-pricing/pricing), [Routes uso y facturación](https://developers.google.com/maps/documentation/routes/usage-and-billing), [SKU de Routes](https://developers.google.com/maps/billing-and-pricing/sku-details/routes), [reportes](https://developers.google.com/maps/reporting-and-monitoring/reporting).

## 3. Restricciones de almacenamiento y documentos — RIESGO ABIerto

El Deep Research identifica **posibles impedimentos contractuales importantes** en los [Términos generales de Google Maps Platform](https://cloud.google.com/maps-platform/terms), sección **3.2.3** (restricciones de exportación, caching y contenido derivado), y sus [términos específicos](https://cloud.google.com/maps-platform/terms/maps-service-terms), cláusula **Routes 19.3** reportada.

**Postura conservadora mientras no haya aclaración contractual:**

| Dato | Tratamiento provisional |
|---|---|
| Dirección original escrita por usuario, peajes manuales, odómetro, litros | Dato aportado por usuario; almacenar sujeto a privacidad general |
| Place ID autorizado por Google | Almacenamiento con condiciones de Google |
| Coordenadas derivadas de Routes | El informe señala cacheo máximo de 30 días; revisar versión contractual aplicable |
| Distancias, duraciones, tráfico, polilíneas de Routes | **No diseñar persistencia permanente ni exportación** antes de resolución jurídica / confirmación Google |
| Precio total comercial del transportista | **Punto jurídicamente no resuelto:** Google restringe contenido derivado; **NO** afirmar ni que siempre está prohibido ni que siempre está permitido almacenar/compartir precio decidido por el usuario |

**Preguntas bloqueantes para una implementación de historial/cotización basada en Routes:**
1. ¿Puede guardarse y compartirse **el precio final propio**, calculado con km obtenidos de Google, sin violar 3.2.3(c)?
2. ¿Pueden exportarse/almacenarse distancia y duración calculadas en el PDF o historial, y en qué condiciones?
3. ¿Qué restricciones aplican a visualización, atribución y mezcla de datos de Google con mapas de terceros?
4. ¿Existe una licencia o excepción comercial pertinente para un cotizador de fletes?

No confundir análisis del informe con dictamen legal. No resolver por simple inferencia; remitir al issue **#15** para revisión de cláusulas exactas, asesoría jurídica y/o confirmación contractual de Google.

## 4. Investigaciones y pruebas pendientes

- **#9 (facturación/cuotas):** validar nivel de cobro, topes reales por método/proyecto, consumo por errores, tratamiento de reintentos y mecanismos de control; sin gasto autorizado.
- **#15 (condiciones):** cerrar almacenamiento, impresión, contenido derivado, historial y cotizaciones, evitando afirmar licencias no verificadas.
- **#19 (precisión de direcciones y pruebas):** medir direcciones chilenas reales con muestra privada, diferencias Embed vs Routes, Base-A-B-Base, discrepancias de `avoidTolls` y SKU facturado; solo cuando el propietario autorice explícitamente API/experimento.

**Referencia relacionada:** [comparación preliminar de proveedores](12-alternativas-mapas.md). Las alternativas se evalúan antes de aprobar un proveedor definitivo.

## 5. Regla operativa de investigación

Toda **investigación profunda adicional**, incluida una aclaración sobre estos términos o comparaciones exhaustivas de proveedores, se hará **mediante GPT Deep Research y después de aviso/autorización del propietario**. La recopilación de este documento no autoriza Claude a realizar nuevas investigaciones autónomas. No activar Google, no crear cuentas, no programar, no integrar PR.
