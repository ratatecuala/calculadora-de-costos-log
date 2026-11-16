# 12 · Alternativas a Google Maps para el cotizador de fletes — exploración preliminar

**Fecha:** 16-11-2026. **Estado:** exploración acotada autorizada por el propietario para revisar Mapbox, Waze y otros proveedores. **No sustituye una investigación profunda con GPT Deep Research** ni una prueba real de precisión. No hay proveedor de mapas/rutas aprobado, API consumida, cuenta creada ni facturación habilitada.

## 1. Decisión de producto que buscamos

Para la v1 chilena: **Base opcional → A → B → regreso opcional**, kilómetros/minutos por tramo, comparación ruta habitual vs evitando peajes, tráfico bajo demanda, un camino visible a la vez, cotizaciones PDF y almacenamiento propio sujeto a contrato. Peajes/TAG manuales mientras no haya fuente chilena verificable.

**Criterios de selección:** (1) precisión de geocodificación y tiempos **en Chile**; (2) costo de extremo a extremo, incluyendo mapa y búsqueda de direcciones, no solo rutas; (3) licencia de persistencia de precio final y/o kilómetros; (4) seguridad contra cargos y abuso; (5) rutas/tramos y evitación de peajes; (6) integración simple.

## 2. Comparación de proveedores con fuentes primarias

| Proveedor | Rutas: umbral gratuito anunciado | Capacidades documentadas | Incertidumbre / inconveniente |
|---|---:|---|---|
| **Google** Maps Embed + Routes | Essentials 10.000/mes; Pro tráfico 5.000/mes; Embed sin cargo por evento | Recorrido con 3 `legs`, dos llamadas para normal/evitar peajes, tráfico Pro | Interpretación contractual **abierta** de persistencia de distancias y precio derivado. Requiere facturación; $0 no garantizados |
| **Mapbox** Directions | **100.000 solicitudes/mes**; mapa web con GL JS **50.000 cargas/mes** sin cargo | Hasta 25 coordenadas en una petición; `distance`, `duration`, `legs`; perfil `driving-traffic`; `exclude=toll`. **Chile figura en cobertura oficial de tráfico** | La cuota web de mapa es distinta de la de rutas; geocodificación/búsqueda se factura aparte o bajo reglas específicas. **Permisos de retención/redistribución de Routes y precio derivado requieren análisis contractual** |
| **TomTom** Routing | **20.000 solicitudes/mes** indicadas en la página oficial; mapa de mosaicos vectoriales **200.000 solicitudes/mes** sin cargo (no equivalen a 200.000 mapas abiertos) | Cálculo de rutas, tráfico (live/historical), evitación `tollRoads`, distancia/duración; rutas con waypoints | Confirmar coste total de visualización, búsqueda y condiciones de conservación; **precisión y cobertura local sin medir** |
| **HERE** Routing v8 | El plan **Limited** oficial anuncia **1.000 solicitudes diarias** con límites particulares; precios del plan Base no quedaron suficientemente claros | Modos de transporte, segmentos, ETA, restricciones de peajes; soporte de camiones en API | Analizar **exclusiones de uso comercial/gestión de activos** del Limited y contratos, y costos precisos; sin prueba de Chile |
| **GraphHopper** Hosted | 500 créditos/día en Free; **Free es solo no comercial** | Rutas multitramos sobre OSM, distancias y tiempos, perfil de vehículo | Free no válido para lanzamiento comercial; planes comerciales con costo mensual; tráfico en vivo no confirmado equivalente |
| **Waze** | No hay API pública general de cotización comparable | Aplicación para abrir navegación por enlace; Navigation Connect para **seguimiento de viajes ya activos** | El viejo Transport SDK **dejó de estar disponible el 01-11-2026**; no es sustituto directo para calcular rutas en una web antes de salir |

### Fuentes oficiales de cada proveedor

**Google:** [precios](https://developers.google.com/maps/billing-and-pricing/pricing), [Routes usage](https://developers.google.com/maps/documentation/routes/usage-and-billing); [auditoría dedicada](11-auditoria-google-maps.md).

**Mapbox:**
- [precios oficiales](https://www.mapbox.com/pricing): Directions 100.000 solicitudes/mes gratis; luego tarifa inicial anunciada **USD 2/1.000**; Mapbox GL JS web 50.000 cargas/mes gratis, luego **USD 5/1.000** iniciales.
- [Directions API v5](https://docs.mapbox.com/api/navigation/directions/): 2–25 coordenadas, múltiples tramos en una solicitud; `exclude=toll` y perfiles `driving`/`driving-traffic`; una petición multitramos cuenta como una solicitud.
- [Cobertura de tráfico](https://docs.mapbox.com/help/dive-deeper/directions/): **Chile incluido** en lista de tráfico con datos actuales/típicos; **esto NO demuestra precisión en cada comuna o autopista**.
- [Geocoding permanente/temporal](https://docs.mapbox.com/help/dive-deeper/understand-temporary-vs-permanent-geocoding/): resultados temporales no se pueden almacenar para usos posteriores; modalidad permanente tiene reglas/condiciones distintas. **No confundir licencia de geocodificación con licencia de Directions ni concluir que se pueden guardar distancias/ETA automáticamente**.
- [términos generales](https://www.mapbox.com/legal/tos): deben leerse los permisos específicos de caché, rutas, cotización, exportación y restricciones de mostrar en mapas ajenos antes de decidir.

**TomTom:** [precios](https://docs.tomtom.com/pricing), [Routing Orbis v3](https://docs.tomtom.com/routing-api/documentation/tomtom-orbis-maps/v3/calculate-route), [productos Routing](https://www.tomtom.com/products/routing-apis/). Documenta `tollRoads` y opciones de tráfico actual/histórico. **Los 200.000 mosaicos no equivalen a 200.000 vistas de mapa**; evaluar consumo real.

**HERE:** [Routing v8](https://docs.here.com/routing/docs/routing-v8-intro), [restricciones del plan Limited](https://www.here.com/get-started/pricing/limited-plan-restrictions), [precios generales](https://www.here.com/get-started/pricing). Confirmar si el uso específico del cotizador está permitido en el plan seleccionado.

**GraphHopper:** [precios](https://www.graphhopper.com/pricing/), [documentación](https://docs.graphhopper.com/openapi). **Advertencia: plan gratis solo no comercial**, no elegir para producción comercial sin otra licencia.

**Waze:** [SDK histórico y aviso de fin](https://developers.google.com/waze/intro-transport), [Navigation Connect](https://developers.google.com/maps/documentation/navigation/connect/overview). Navigation Connect busca seguimiento/ETA de conductores que usan Maps/Waze, **no es la API de rutas previas a cotización**.

## 3. Precisión — qué se puede y no se puede afirmar

**No existe aquí benchmark real Chile**. Una cifra de consultas gratis, un ETA «con tráfico» y la presencia en lista de cobertura **no demuestran** que un proveedor calcule mejor tiempos/distancias que otro. No asignar puestos de precisión por reputación.

Para comparar, el mismo conjunto de rutas debe medirse posteriormente, con aprobación: (a) Santiago con TAG/autopistas urbanas, (b) comunas periféricas y direcciones ambiguas, (c) parcelas y sectores rurales, (d) interurbano; registrar origen/destino verificados, km, minutos típicos, minutos con tráfico, ruta evitación, errores de geocodificación y variación respecto a viajes reales. Separar **precisión geométrica (km)** de **precisión de ETA (minutos)**. No utilizar datos de un proveedor para entrenar/calibrar otro sin licencia.

## 4. Implicación clave para el producto

**Mapbox y TomTom merecen comparación profunda antes de cerrar Google.** Mapbox sobresale documentalmente por amplio tramo gratuito, tráfico listado para Chile y `exclude=toll`; TomTom por tráfico y atributos de rutas. **No se puede concluir todavía que ninguno permita almacenar/exportar mejor las cotizaciones o el precio derivado:** revisar contrato específico.

**No mezclar Mapbox Routes con Google Maps Embed ni el inverso como solución automática**: hay restricciones contractuales, atribución y consistencia cartográfica que requieren validación. Evaluar **ecosistema completo** de cada proveedor: geocoding/autocomplete + rutas + mapa + tráfico + derechos de datos.

**Recomendación provisional:** no aprobar proveedor definitivo ni activar cuentas; preparar **una única investigación profunda con GPT Deep Research**, cuando el propietario la autorice, que confronte Google, Mapbox, TomTom y HERE en costo integral, precisión chilena demostrable y licencias de almacenamiento del precio/cotizaciones. Waze se mantiene como enlace opcional de navegación y GraphHopper no es viable con su Free no comercial.

## 5. Dependencias y autorizaciones

- **#9:** costos/riesgos de Google y comparación de presupuesto con alternativas.
- **#15:** uso comercial y permisos de persistencia/exportación. **Incluye revisión contractual del proveedor finalmente elegido**.
- **#19:** futura prueba controlada de direcciones y rutas chilenas: idealmente **multiplataforma** y con autorización de cada API.
- **#8:** titularidad de cuentas si se decide crear alguna.

**Regla de gobernanza:** toda nueva investigación profunda será desarrollada por **GPT Deep Research con aviso y autorización previa del propietario**. Claude no inicia búsquedas amplias ni integra proveedores por iniciativa propia. **No programar, no contratar, no activar facturación, no fusionar PR.**
