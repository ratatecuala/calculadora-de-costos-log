# 02 · Arquitectura: propuesta de cierre (pendiente de aprobación)

**Estado:** la arquitectura anterior «sin cuentas, sin BD y sin mapa» quedó **superada** por el nuevo alcance. La dirección visual v4 está aprobada como dirección general, y los criterios funcionales A-21 a A-29 fueron comunicados por el propietario y están pendientes de ratificación en el PR #34. Por encargo del propietario (A-30), la **§8 propone el cierre de la arquitectura**; las cifras de proveedores, leídas vía buscador, están en [04](04-fuentes-de-datos.md) y §8.2. **Proveedores, cuotas y gastos siguen sin aprobar** hasta el OK del propietario a este documento y a #35. No autoriza crear cuentas, código, despliegues ni facturación.

## 1. Principios que se conservan

- Código simple y mantenible; **un proyecto** en vez de microservicios prematuros.
- **Motor de cálculo puro, determinista y probado**, separado de pantalla, red, proveedor de rutas, autenticación y base de datos.
- Preferencia previa: **TypeScript estricto + React + Vite**. Confirmación final del stack con diseño/arquitectura revisada.
- Integraciones externas en un servidor/proxy para restringir claves y controlar consumo.
- El **nombre comercial no está definido**. No usar el nombre anterior en el producto.

## 2. Componentes necesarios para la primera versión

```text
Web responsive — acceso anónimo o con cuenta
   ├─ Motor de costos aislado: cálculos reproducibles y modo manual
   ├─ Vehículos, cotizaciones, historial y cargas de combustible (cuenta)
   ├─ PDF local y vista pública separada de los costos privados
   ├─ Mapa de una ruta a la vez: Maps Embed (candidato de implementación)
   └─ API/Worker controlado
         ├─ Routes: tramos y preferencias de ruta, km, duración, tráfico
         ├─ Fuente de combustible CNE / datos versionados, si hay permisos
         └─ Peajes/TAG: catálogo verificable o ingreso manual
   └─ Autenticación Google + almacenamiento privado por usuario
         └─ proveedor por decidir (Supabase candidato; alternativas por comparar)
```

## 3. Decisiones técnicas abiertas

| Tema | Dirección provisional | Validación pendiente |
|---|---|---|
| Login | Google OAuth; modo anónimo para probar | Implementación segura; alternativa correo; límites |
| Base de datos | **Supabase Auth + PostgreSQL es candidato**, no decisión final | Plan gratuito, respaldos, disponibilidad, RLS, mantenimiento y propiedad de cuenta |
| Hosting/API | Cloudflare es candidato | Plan aplicable, costos, límites, secreto de API y riesgo de abuso (#18) |
| Rutas | Google Routes para datos; Maps Embed para visualización | Costos/SKU, permisos, mapa/ruta coherente, contraste de tráfico, condiciones (#15/#19) |
| Documentos | PDF generado en navegador | Control de impresión y de enlaces públicos, impuestos (#16) |
| Fotos/IA | Ninguna en v1 | Investigación para Pro, después de validar gratis |
| Marketplace | No construir | Marketplace, logística elástica o mezcla siguen indefinidos |

## 4. Rutas y consumo

- **Trayectos:** base→A opcional; A→B obligatorio; B→base opcional. Calcular cada tramo relevante y **no contabilizar dos veces** combustible, kilómetros, horas, peajes ni ayudantes.
- **Alternativas:** ruta usual/rápida vs. evitando peajes. El mapa visible presenta **una opción a la vez**, y las dos fichas de resultados quedan disponibles para comparar. «Evitar» es preferencia, no garantía de cero TAG; si no hay alternativa válida, indicarlo.
- **Maps Embed (directions)** permite visualizar rutas y preferencia de evitar peajes/autopistas, pero **no entrega kilómetros y minutos como datos estructurados para el motor**.
- **Routes** proporciona distancia y duración. **Tráfico bajo demanda (A-23, comunicada por el propietario, pendiente de ratificación en PR #34):** solo con una acción expresa y visible del usuario. Según la documentación (vía buscador): `TRAFFIC_AWARE` activa el SKU **Pro** (5.000 gratis/mes); `TRAFFIC_UNAWARE` queda en **Essentials** (10.000 gratis/mes). La diferencia entre duraciones **no equivale necesariamente a minutos de congestión medidos**.
- Dibujar dos líneas superpuestas no es capacidad garantizada de Embed; **alternar el mapa** es opción válida. Si se necesita un mapa dinámico con polilíneas habrá que investigar otro SKU y sus condiciones.
- Recalcular en el servidor es distinto de usar la interfaz pública Google Maps; **no scraping**. La fuente y fecha se exponen al usuario.
- Los rendimientos ciudad/carretera son datos opcionales **del vehículo** o referencias identificadas. Nunca estimar litros adicionales de «tacos» con un multiplicador sin calibración.
- Con tres tramos y dos preferencias de ruta pueden ser necesarias **varias consultas**, no asumir 2 llamadas por cotización; contabilizar el peor caso antes de habilitar APIs. **No recalcular con tráfico en cada edición de campo** ni mostrar un horario exacto de restablecimiento de cuota salvo evidencia del proveedor y contador propio.

## 5. Persistencia y separación de datos

- Sin login: sesión temporal; informar claramente que no hay respaldo remoto. Si faltan costos fijos, desgaste o peajes, el sistema mantiene disponible **la creación de una cotización indicativa por precio elegido manualmente**, con alerta visible de «Costo parcial» y sin presentarla como rentabilidad validada.
- Con login: perfil, vehículos, parámetros, cotizaciones y registros reales **privados por usuario**; mínimos datos posibles.
- La **cotización pública** debe ser una vista independiente con solo datos elegidos para compartir y acceso controlado. Nunca exponer el modelo privado completo ni rutas/direcciones innecesarias.
- Guardado/exportación de contenido proveniente de Google condicionado a revisión formal de términos (#15); cálculos locales solo pueden reproducir entradas autorizadas.
- RLS/controles server-side y respaldo/restitución sujetos a prueba antes de publicar.

## 6. Presupuesto y controles

El propietario acepta evaluar una **cuenta de Google Cloud con facturación habilitada**, pero **no ha autorizado cargos variables**. El nivel gratuito no garantiza un resultado de $0. Antes de activar: identificar SKU y precio real, probar límites/alertas, implementar rate limiting, degradar a kilómetros manuales, control por usuario y mecanismos de desactivación. Ninguna API se activa por el simple hecho de estar documentada.

## 7. Pruebas previstas

Vitest (casos dorados, propiedades), pruebas de aislamiento del motor y de rutas/contratos, controles de identidad/permiso, pruebas de documento PDF, accesibilidad móvil, flujos anónimo/Google y contingencias de Google, CNE y peajes. Las herramientas finales se confirman con la arquitectura.

## 8. Propuesta de cierre de arquitectura (A-30, PROPUESTO)

Esta sección convierte las candidaturas anteriores en una propuesta concreta. **No autoriza crear cuentas, activar APIs ni programar.**

### 8.1 Componentes

| Capa | Propuesta | Por qué | Alternativa descartada |
|---|---|---|---|
| Interfaz | React + Vite + TypeScript estricto, SPA | Interactiva, sin SSR | Next.js |
| Alojamiento y proxy | **Cloudflare Workers** con *static assets* y `/api` | Un despliegue; claves en el servidor; plan gratuito de 100.000 solicitudes/día (#18) | Vercel Hobby (no comercial) |
| Cuentas y datos | **Supabase**: Auth con Google y Postgres con RLS (#35) | Login, base relacional y reglas por fila sin un backend propio | Firebase; base propia detrás del Worker |
| Mapa | **Maps Embed** `directions`, un camino a la vez | Sin cargo y sin límite; clave de navegador restringida | Maps JavaScript dinámico |
| Rutas | **Routes `computeRoutes`** desde el Worker | Km y minutos por tramo | Directions (heredada) |
| PDF | Generado en el navegador desde la cotización al cliente | Sin servidor; nunca recibe costos internos | Generación en servidor |
| WhatsApp | Enlace `wa.me` con texto y enlace de la cotización | Sin API ni cuenta de empresa | WhatsApp Business API |

### 8.2 Rutas: solicitudes, respuestas y número de llamadas

**Hechos de la documentación oficial** (leídos vía buscador el 16-11-2026, porque la red de la sesión no permitió leer las páginas directamente; se confirman en #19):

| # | Hecho | Fuente |
|---|---|---|
| R1 | Cada **tramo (`leg`)** corresponde al trayecto entre dos puntos no `via`. Con origen, 2 intermedios y destino hay **3 tramos** | computeRoutes / "Review the route response" |
| R2 | Cada tramo trae `distanceMeters`, `duration` y `staticDuration`. Con `TRAFFIC_UNAWARE`, `duration` = `staticDuration` | computeRoutes |
| R3 | El inicio de un tramo puede ajustarse al camino más cercano y no coincidir exactamente con la dirección ingresada | computeRoutes |
| R4 | **No se devuelven rutas alternativas** si la solicitud tiene puntos intermedios. Por eso «sin peajes» requiere **otra solicitud** | "Get alternative routes" |
| R5 | `avoidTolls` **evita peajes "donde sea razonable"**: es una preferencia, no una garantía. Puede incluir peajes si no hay alternativa práctica, y se aplica a toda la ruta | RouteModifiers / "Specify route features to avoid" |
| R6 | `departureTime` está pensado para los modos con tráfico; con `TRAFFIC_UNAWARE` no aporta | "Set the level of traffic data" |
| R7 | SKU: Essentials hasta 10 intermedios sin funciones avanzadas; **Pro** con `TRAFFIC_AWARE` o `TRAFFIC_AWARE_OPTIMAL`; **Enterprise** con peajes (`extraComputations: TOLLS`). Un SKU por solicitud | "Routes API Usage and Billing" |
| R8 | El evento facturable de Compute Routes es una **solicitud exitosa**, pero una página general de reportes indica que algunos errores 4xx también son facturables y consumen cuota | "Routes SKU details"; "Reporting" |

**Por verificar en #19 (sin llamadas facturables hasta autorizar):**
- que el **origen y el destino puedan ser el mismo punto** (Base → … → Base);
- que la *field mask* elegida no cambie el SKU;
- el comportamiento con direcciones ambiguas (`geocodingResults` y `partialMatch`).

**Solicitud 1, ruta habitual** (el Worker la construye desde una **plantilla fija**; el navegador nunca envía campos de Google):

```http
POST https://routes.googleapis.com/directions/v2:computeRoutes
X-Goog-Api-Key: <secreto del Worker>
X-Goog-FieldMask: routes.distanceMeters,routes.duration,routes.staticDuration,routes.legs.distanceMeters,routes.legs.duration,routes.legs.staticDuration,geocodingResults

{
  "origin":       { "address": "[base], Maipú, Chile" },
  "intermediates": [
    { "address": "[calle] 1234, Ñuñoa, Chile" },
    { "address": "[calle] 567, Las Condes, Chile" }
  ],
  "destination":  { "address": "[base], Maipú, Chile" },
  "travelMode": "DRIVE",
  "routingPreference": "TRAFFIC_UNAWARE",
  "routeModifiers": { "avoidTolls": false },
  "languageCode": "es-419", "regionCode": "CL", "units": "METRIC"
}
```

**Respuesta esperada (ilustrativa, cifras del ejemplo v4):**

```json
{ "routes": [ {
    "distanceMeters": 57400, "duration": "4440s", "staticDuration": "4440s",
    "legs": [
      { "distanceMeters": 18200, "duration": "1440s", "staticDuration": "1440s" },
      { "distanceMeters": 13200, "duration": "1200s", "staticDuration": "1200s" },
      { "distanceMeters": 26000, "duration": "1800s", "staticDuration": "1800s" } ] } ],
  "geocodingResults": { "origin": {}, "destination": {}, "intermediates": [ {}, {} ] } }
```

**Solicitud 2, evitando peajes:** igual, con `"avoidTolls": true`. Respuesta esperada: 3 tramos de 19,6 + 14,3 + 28,4 = 62,3 km y 100 min.

**Tráfico bajo demanda (A-23):** se repiten las solicitudes con `"routingPreference": "TRAFFIC_AWARE"` y un `departureTime` futuro (SKU Pro). `duration` incluye tráfico y `staticDuration` no. La diferencia **no** es una medición de minutos de taco ni se convierte en litros.

**Variantes del recorrido:**

| Recorrido | Origen | Intermedios | Destino | Tramos |
|---|---|---|---|---|
| Solo A → B | A | — | B | 1 |
| Base → A → B | Base | A | B | 2 |
| A → B → Base | A | B | Base | 2 |
| Base → A → B → Base | Base | A, B | Base | 3 |

**Validaciones del motor sobre la respuesta:**
- cantidad de tramos = la esperada;
- suma de los tramos = total de la ruta (tolerancia de 1 m y 1 s);
- km > 0 en cada tramo;
- si `geocodingResults` marca `partialMatch`, se avisa y se pide revisar la comuna.

Si algo falla, el resultado no se usa y se pasa a modo manual.

**Solicitudes por cálculo:**

| Escenario | Solicitudes Essentials | Pro (solo si se pide tráfico) |
|---|---|---|
| **Habitual**: Base → … → Base permitido en una solicitud | **2** | 2 |
| Si no se admite origen = destino: se separa B → Base | 4 | 4 |
| **Peor caso**: lo anterior con 1 reintento por solicitud (solo ante error 5xx o tiempo de espera) | **8** | 8 |

Cada intento cuenta en el contador propio, aunque falle (R8).

**Capacidad: es una ESTIMACIÓN, no una garantía.** Cálculos al mes ≈ 10.000 ÷ (solicitudes por cálculo × factor de recálculo). Con 2 solicitudes y ningún recálculo serían ≈ 5.000; con un promedio de 2,6, ≈ 3.800; con 4, ≈ 2.500; en el peor caso de 8, ≈ 1.250. Con tráfico: ≈ 5.000 ÷ solicitudes. La cifra real depende del uso, de los reintentos, de las funciones usadas y de las cuotas aplicadas.

**Maps Embed frente a Routes:**

| Aspecto | Maps Embed (`directions`) | Routes |
|---|---|---|
| Costo | Sin cargo y sin límite | Essentials / Pro según la solicitud |
| Puntos intermedios | Hasta 20 | Hasta 10 en Essentials |
| Evitar peajes | `avoid=tolls`, como **sesgo** | `avoidTolls`, como preferencia |
| Tráfico y hora de salida | No figuran en los parámetros | `TRAFFIC_AWARE` + `departureTime` |
| Datos estructurados | No entrega km ni minutos | Sí, por tramo |

Son servicios distintos y **pueden trazar caminos diferentes**. Regla de interfaz: el mapa es **referencial**; los km y minutos del cálculo son los de Routes y se muestran por tramo, con «Abrir en Google Maps» para verificar.

**Qué se puede guardar o exportar (postura conservadora hasta cerrar #15):**

| Dato | Regla |
|---|---|
| Latitud y longitud de Google | Caché temporal de hasta **30 días** (términos específicos de servicio). No se guardan en el historial. |
| Place ID | Se pueden guardar indefinidamente (políticas de Routes) |
| Km, minutos y polilíneas de Google | **No** se guardan ni exportan. Los términos solo exceptúan lat/lng y place ID. |
| Direcciones escritas por el usuario | Dato del usuario; se guardan con su cuenta |
| Montos calculados por nuestro motor | Se guardan como resultado propio. **Por confirmar en #15** si se consideran contenido derivado. |
| PDF y enlace del cliente | Sin km ni minutos de Google |
| Mapa | Resultados de Routes solo sobre mapas de Google o con atribución |

### 8.3 Control de consumo (detalle en #9)

| Capa | Propuesta | Límite de la capa |
|---|---|---|
| Plantilla fija en el Worker | Solo `TRAFFIC_UNAWARE`, o `TRAFFIC_AWARE` desde el botón de tráfico; **nunca** `TOLLS` ni más de 2 intermedios | Evita SKUs no previstos; un error de código se detecta con pruebas |
| Clave restringida | La clave del Worker solo habilita Routes API; la del iframe, solo Maps Embed y el dominio | Limita el daño si una clave se filtra |
| Cuota de Google Cloud | Por API y método (`computeRoutes`), **no por SKU** (por confirmar en la consola). Se fija con el peor caso: todo Pro | Se aplica con retraso; **no garantiza $0** |
| Contador propio persistente y atómico | Reserva antes de llamar a Google; no se devuelve si falla; cupos separados para Essentials y Pro; por usuario, por origen y global diario/mensual | Si su almacenamiento no responde, **se cierra** (modo manual) |
| Antiabuso | Turnstile para anónimos; límite por cuenta y por origen | — |
| Interruptor | `ROUTES_ENABLED` y `TRAFFIC_ENABLED` se revisan en cada solicitud. En emergencia, deshabilitar la API o la clave en Google Cloud | — |
| Alertas de presupuesto | Solo avisan; **no detienen la facturación** | — |
| Modo manual | Km y minutos por tramo y «Abrir en Google Maps». **Sin hora de reinicio** (A-27) | — |

**Las cuotas y los límites internos reducen el riesgo económico, pero no garantizan un gasto de $0.**
### 8.4 Datos y separación de la cotización (A-29)

| Tabla | Contenido | Acceso |
|---|---|---|
| `profiles` | Datos comerciales que el transportista decide mostrar, perfil tributario, numeración | Solo el dueño |
| `vehicles` | Categoría, modelo, combustible, rendimientos, costos, con procedencia | Solo el dueño |
| `jobs` | **Costos internos:** entradas, resultados del motor con su completitud, versiones, ruta elegida, estado, pago, km y combustible reales | Solo el dueño |
| `client_quotes` | **Solo lo que ve el cliente:** número, cliente, fechas, servicio, incluye, condiciones, neto, IVA, total, token del enlace, revocación | El dueño; el público solo mediante `get_public_quote(token)` |

Reglas:
1. `client_quotes` **no tiene columnas** de costos, márgenes, rendimiento ni meta de remuneración.
2. Se llena solo con `toClientQuote()` (`src/shared`), que copia campos de una **lista blanca**; una prueba falla si aparece un campo no autorizado (#38).
3. PDF, texto de WhatsApp y página pública salen de `client_quotes`, nunca de `jobs`.
4. RLS en todas las tablas, `GRANT` explícitos (requisito de Supabase desde 2026) y pruebas con dos cuentas.
5. Datos de Google: `jobs` guarda direcciones del usuario e importes calculados; **no** km, minutos ni polilíneas de Google mientras #15 no lo permita.

### 8.5 Estructura del código

```
src/engine/   motor puro (sin red, DOM ni base de datos; regla de lint + prueba)
src/shared/   esquemas Zod, tipos, toClientQuote()
src/web/      interfaz React y textos (glosario de la guía UX)
src/worker/   Cloudflare Worker (/api/routes, /api/fuel, /api/q/:token)
supabase/     migraciones SQL: tablas, GRANT, RLS, funciones y pruebas de políticas
data/         reglas de IVA y catálogos versionados con fuente
```

### 8.6 Supabase: hallazgos y condiciones (#35)

Leídos vía buscador sobre la documentación oficial el 16-11-2026; se confirman con lectura directa.

| Tema | Hallazgo | Consecuencia |
|---|---|---|
| Plan gratuito | 500 MB de base por proyecto, 50.000 usuarios activos al mes, 5 GB de egreso, 1 GB de archivos, 2 proyectos gratuitos activos (los pausados no cuentan) | Suficiente para la beta |
| Pausa | Se pausa tras ~1 semana de baja actividad; los planes pagados no se pausan. Se reanuda desde el panel (ventana de 1 año según la documentación actual; un aviso de 2024 decía 90 días). Pasada la ventana, se puede descargar el respaldo antes de que se elimine | Riesgo para una app pública poco usada: decisión de plan antes de publicar |
| Respaldos | El plan gratuito **no tiene respaldos automáticos descargables**; Supabase recomienda exportar con `supabase db dump` y guardar copias fuera. Pro: 7 días de respaldos diarios. PITR es un complemento pagado | Respaldo propio obligatorio |
| Restauración | Documentado: restaurar un respaldo descargado en una instancia local o en un proyecto nuevo | Simulacro antes de la beta |
| Claves | Clave **publicable** para el navegador, limitada por RLS. Clave **secreta** solo en el servidor, porque **salta RLS**. Las claves `anon`/`service_role` se retiran a fines de 2026 | Usar solo las claves nuevas; el Worker no necesita la secreta |
| Exposición | Las tablas nuevas requieren `GRANT` explícito; RLS se configura aparte | Migraciones con `GRANT` + RLS + pruebas |
| Región | Existe **South America (São Paulo) `sa-east-1`** | Menor latencia; sigue siendo transferencia internacional (#17) |

**Propuesta:** aprobar Supabase **técnicamente, condicionado** a:
1. Políticas RLS por dueño en `profiles`, `vehicles`, `jobs` y `client_quotes`, con `GRANT` explícitos y pruebas con dos cuentas que fallen ante cualquier acceso cruzado.
2. El público solo usa `get_public_quote(token)`: token aleatorio de ≥ 128 bits, revocable y con expiración opcional.
3. Respaldo propio: `supabase db dump` programado (esquema, datos y los datos de Auth que la guía indique), cifrado y guardado en almacenamiento **del propietario**, nunca en este repositorio público. Restauración de prueba mensual en local o en un segundo proyecto, con conteo de filas.
4. Cuenta a nombre del propietario con MFA; Claude con el rol mínimo; clave secreta solo si llega a ser necesaria, guardada como secreto del Worker.
5. Proyecto en `sa-east-1`; Google OAuth con los alcances `openid`, `email` y `profile`, desde un proyecto de Google Cloud del propietario.
6. Antes de publicar, decidir entre seguir en el plan gratuito con riesgo de pausa o pasar a Pro (gasto que requiere aprobación).

### 8.7 Riesgos conocidos

- Supabase gratuito: pausa por inactividad y sin respaldos descargables; mitigación en §8.6.
- Embed y Routes pueden trazar caminos distintos; la interfaz no afirma que sean idénticos.
- Las cuotas de Google se aplican con retraso: por eso el contador propio corta antes.



## 9. Proveedor seleccionado y política de consultas (17-11-2026)

**Decisión (A-32):** se desarrolla con **Google Routes API, SKU Essentials** (`computeRoutes`, `TRAFFIC_UNAWARE`). **Sin mapa integrado** (A-35): ni Maps Embed ni Maps JavaScript; solo un enlace «Ver ruta en Google Maps» construido con Maps URLs, sin clave. Esta sección reemplaza la anterior «selección pendiente»; las secciones §8.2 (Embed) y §8.6 se conservan como antecedente. MapLibre + PMTiles + Valhalla quedó **descartado como punto de partida** (ver [07](07-decisiones.md)).

**Restricciones conocidas de Google (registro de riesgo, sin bloquear el desarrollo, A-38):** según [11](11-auditoria-google-maps.md), los km, minutos y polilíneas de Routes no deben guardarse de forma permanente ni exportarse. Hay caché temporal de lat/lng hasta 30 días, y los Place ID se pueden guardar. La implementación por eso:
- conserva en el historial solo los **datos propios**: direcciones escritas por el usuario, parámetros, cálculos comerciales, precio y cotización;
- marca cada valor de ruta con su **procedencia** (`simulado`, `google`, `declarado`) y una **política de retención por campo**;
- excluye de la cotización al cliente los km y minutos de Google.

### 9.1 Política de consultas (A-39 a A-42)

| Control | Valor | Dónde |
|---|---|---|
| Objetivo operativo mensual | **7.000** solicitudes Essentials, con ritmo diario acumulativo ⌊7.000 × d / D⌋ | `src/server/budget/policy.ts` |
| Corte de emergencia mensual | **8.000** (lo usan los reintentos; nada lo supera) | Ídem |
| Comparaciones por usuario | **3 al día y 10 al mes**; cada una es 1 solicitud adicional | Ídem |
| Rutas por usuario | **Provisional:** 20 al día por usuario y 40 por origen de red (por confirmar) | Ídem |
| SKU | Solo Essentials. Pro y Enterprise rechazados **antes** de cualquier solicitud | `src/server/google/template.ts` |
| Contador | Persistente y atómico: reserva antes de llamar, no se devuelve, serializado | `src/server/budget/ledger.ts` |
| Falla del contador | Cierre: sin solicitud y en modo manual | `src/server/routeHandler.ts` |
| Reintentos | Máximo 1, solo ante 5xx o tiempo de espera; consume presupuesto | Ídem |
| Interruptor global | `ROUTES_ENABLED` | Ídem |
| Sin consultas al escribir ni al editar parámetros | El cálculo solo se dispara con «Calcular ruta»; la economía se recalcula en el navegador | `src/web/session.ts` |
| Período | Mes y día en `America/Los_Angeles`, para alinearse con el mes de facturación de Google **[por verificar]** | `src/server/budget/period.ts` |

**No se promete gasto cero.** Estos límites son protecciones propias; no sustituyen las cuotas ni las condiciones del proveedor.

### 9.2 Implementación en el PR #34 (datos simulados)

```
src/engine/   motor económico puro (medidas, cotas, redondeo, comparación, IVA)
src/shared/   tipos y esquemas compartidos, toClientQuote(), enlace de Google Maps
src/server/   handler /api/route, presupuesto, proveedores (simulado y Google)
src/web/      interfaz React, sesión de cálculo, historial local, PDF por impresión, WhatsApp
tests/        pruebas Vitest (presupuesto, concurrencia, SKU, motor, sesión, secretos)
```

- **Proveedor activo:** `simulado`. Las respuestas llevan `fuente: "simulado"` y la interfaz lo dice en cada resultado.
- **Proveedor Google:** existe la plantilla de solicitud y su validación. **No está conectado**: exige `ROUTES_PROVIDER=google`, `GOOGLE_ROUTES_ENABLED=true` y una clave de servidor que no existe. Las pruebas usan un `fetch` falso.
- **Contador en producción:** clase Durable Object (`src/server/budget/durableObject.ts`) con el mismo libro serializado. **No se ha ejecutado en Cloudflare**, porque no hay cuenta autorizada.
- **Historial:** en el navegador (localStorage), detrás de `QuoteRepository`; migrable a Supabase cuando se apruebe #35.
