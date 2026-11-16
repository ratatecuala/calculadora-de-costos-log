# 04 · Fuentes de datos y restricciones de uso

**Estado:** guía de investigación para la primera calculadora gratuita. **No habilita ninguna API ni facturación**. Las cifras, cuotas, licencias y cobertura deben verificarse antes de implementar. Nombre comercial pendiente.

Convención: **VERIFICADO CON ENLACE** · **PROPUESTO** · **POR VALIDAR**. Fuente externa y fecha visibles al usuario cuando afectan el cálculo.

## 1. Rutas y mapa de Google

| Necesidad | Servicio candidato | Qué puede ofrecer | Restricción |
|---|---|---|---|
| Mostrar ruta A → B en pantalla | **Maps Embed API** | Mapa incrustado, indicaciones y preferencia `avoid=tolls` o `avoid=highways` | **No** proporciona km/minutos como respuesta estructurada para los cálculos |
| Calcular km y duración por trayecto | **Google Routes API** | `distanceMeters` y `duration`; `staticDuration` y datos de tráfico según preferencia solicitada | Requiere facturación, control de SKU, campos y cuotas |
| Elegir alternativa evitando peajes | Routes `routeModifiers.avoidTolls` | Preferencia de ruta, **no garantía de cero peajes** | Si no hay ruta comparable, mostrarlo claramente |
| Dibujar dos rutas superpuestas | Posible alternativa técnica de mapas dinámicos | Por evaluar con datos de Routes y condiciones de Google | **No suponer que Embed admite esta visualización** |

Fuentes oficiales para consulta: [Maps Embed directions](https://developers.google.com/maps/documentation/embed/embedding-map), [Compute Routes](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes), [Tráfico](https://developers.google.com/maps/documentation/routes/config_trade_offs), [Precios](https://developers.google.com/maps/billing-and-pricing/pricing).

**Precisión:** Google puede devolver duraciones distintas según `TRAFFIC_UNAWARE`, `TRAFFIC_AWARE` o `TRAFFIC_AWARE_OPTIMAL`. La diferencia entre `duration` y `staticDuration` **no es una medición directa del tiempo perdido en un taco**. No convertirla automáticamente en litros adicionales.

**Costos:** Maps Embed aparece en la tabla oficial como **SKU Embed con uso ilimitado sin cargo por evento**, aunque requiere configuración y facturación en Google Cloud. Routes tiene SKUs y límites gratuitos **diferentes según capacidades**; tráfico y peajes pueden cambiar la clasificación. **No presupuestar solamente dos consultas por cotización**: base→A, A→B y B→base opcional, cada uno con preferencias distintas, pueden requerir múltiples solicitudes.

**Presupuesto del propietario:** cargos variables = **$0 autorizados inicialmente**. El hecho de que una cuenta pueda tener facturación no es permiso de consumir servicios. Alertas y cuotas pueden retrasarse; implementar control de consumo propio, modo manual y apagado antes de activar cualquier llamada.

**Rutas alternativas:** el usuario puede elegir una ruta más rápida o una que evita peajes si existen opciones válidas. No mostrar «X pesos más barata» cuando TAG, rendimiento u otros componentes pueden cambiar el resultado.

## 2. Dirección, términos y persistencia

- Entrada escrita o place ID según experimento chileno #19. Verificar comuna y coincidencia geográfica incluso cuando Google no marque `partialMatch`.
- Las rutas de Embed y Routes pueden **no coincidir exactamente**; la interfaz no debe afirmar que son idénticas sin verificación.
- **No hacer scraping** de la web/app de Google Maps para extraer tráfico, peajes o kilómetros.
- No guardar, redistribuir ni incluir en PDF datos derivados de Google sin análisis formal de sus términos (#15). Mientras tanto, favorecer guardar el **importe en pesos calculado por nuestro motor**, parámetros confirmados por usuario, y datos propios, no polilíneas/tiempos originales de Google.
- No mostrar resultados de Google en mapas de otros proveedores sin analizar las restricciones aplicables.
- El enlace «Abrir en Google Maps» permanece disponible aun si se agota la cuota de cálculo.

## 3. Combustible: Chile / CNE

- Fuente candidata: Comisión Nacional de Energía (Bencina en Línea y API CNE). Verificar endpoint, registro, licencia, cobertura, vigencia y cuota en #20.
- Mostrar **fuente, fecha, zona y tipo de combustible**, con edición manual.
- El cálculo usa km/rendimiento del usuario o una referencia justificada y etiquetada. No inferir consumo en taco, carga o carretera solo por velocidad.
- Sin dato confiable de rendimiento, el gasto de combustible queda **incompleto**, no igual a cero.

## 4. Peajes y TAG

- Investigar tablas oficiales de concesionarias y MOP (#10/#21), por **pórtico, sentido, horario, categoría y fecha**.
- No asumir que `avoidTolls` significa TAG = 0.
- Sin cobertura comprobada, **ingreso manual**, con estados diferenciados: confirmado en cero / monto declarado / monto desconocido.
- La automatización de peajes solo se activa cuando costos, cobertura, fuente y permisos estén aprobados.

## 5. Catálogo vehicular

- Categorías iniciales: vehículos de flete/mudanza livianos, con características reales del vehículo ingresadas por su dueño.
- Marca, modelo, año, motorización y combustible: usuario o catálogo propio verificable; fuente oficial por investigar (#22).
- El portal chileno de consumo vehicular puede aportar **referencias de homologación**, no rendimiento real de ese ejemplar. Verificar condiciones de reutilización.
- La viabilidad de motocicletas y camiones livianos se analiza por separado; alto tonelaje fuera de v1.
- Cualquier tipo de energía no modelable en litros requiere tratamiento explícito.

## 6. Hosting, identidad y privacidad

- Cloudflare Worker/Pages y Supabase Auth/Postgres son **candidatos**, todavía no aprobados. Investigar límites gratuitos, respaldo, continuidad, reglas de seguridad y responsabilidades del proveedor (#8/#17/#18).
- Los datos personales/vehiculares y económicos privados deben tener acceso autenticado, con protección por propietario.
- Las cotizaciones públicas son **vistas minimizadas**; nunca deben revelar costos internos ni direcciones privadas por accidente.

## 7. Regulación

- Validar IVA, documentos tributarios y tributación del servicio en Chile (#16). **No aplicar IVA a todos los usuarios por defecto**.
- Revisar Ley 21.719 y cambios de vigencia, obligaciones de privacidad, transferencias internacionales y datos de cuentas (#17).
- Toda afirmación legal o tarifaria exige fuente oficial actualizada antes de publicación.
