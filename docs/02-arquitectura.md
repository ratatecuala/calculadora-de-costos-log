# 02 · Arquitectura: propuesta de cierre (pendiente de aprobación)

**Estado:** la arquitectura anterior «sin cuentas, sin BD y sin mapa» quedó **superada** por el nuevo alcance. El diseño v4 completo y sus criterios funcionales están **aprobados** (A-21 a A-29). Por encargo del propietario (A-30), la **§8 propone el cierre de la arquitectura**; las cifras de proveedores están verificadas en [04](04-fuentes-de-datos.md). **Proveedores, cuotas y gastos siguen sin aprobar** hasta el OK del propietario a este documento y a #35. No autoriza crear cuentas, código, despliegues ni facturación.

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
- **Routes** proporciona distancia y duración. **Tráfico bajo demanda (APROBADO, A-23):** solo con una acción expresa y visible del usuario. Verificado: `TRAFFIC_AWARE` activa el SKU **Pro** (5.000 gratis/mes); `TRAFFIC_UNAWARE` queda en **Essentials** (10.000 gratis/mes). La diferencia entre duraciones **no equivale necesariamente a minutos de congestión medidos**.
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

### 8.2 Llamadas a Routes por cálculo

- Solo al presionar **"Calcular rutas"**; nunca mientras se escribe.
- **Diseño base: 2 solicitudes** por cálculo (preferencia habitual y `avoidTolls`), cada una con A y B como puntos intermedios para recibir los tres tramos (`legs`) en una sola respuesta. *Field mask* mínima, sin polilínea.
- **Peor caso a presupuestar:** 6 solicitudes si fuera necesario pedir cada tramo por separado. #19 verifica cuál aplica.
- **Tráfico (A-23):** el botón repite las solicitudes con `TRAFFIC_AWARE` (SKU Pro), con su propio cupo. Si cambia el recorrido, el resultado con tráfico se marca desactualizado.
- **Capacidad orientativa del tramo gratuito** (≈ 2,6 solicitudes por cálculo, con recálculos y errores): ≈ 3.800 cálculos y ≈ 1.900 consultas de tráfico al mes. Con el peor caso, la capacidad es de un tercio. **Las cuotas reducen el riesgo, pero no garantizan $0.**

### 8.3 Cupos y modo manual

| Control | Propuesta |
|---|---|
| Cuota diaria en Google Cloud por SKU | ≈ tramo gratuito ÷ 31, menos 10 %: Essentials ≈ 290/día; Pro ≈ 145/día |
| Contador propio | Persistente y atómico, por debajo de la cuota de Google; mecanismo por definir en #18 (Durable Objects o función SQL en Supabase) |
| Abuso | Turnstile y límite por usuario y por origen |
| Agotado o error | Modo manual con km y minutos por tramo, "Abrir en Google Maps" y el texto: "El cálculo automático de rutas no está disponible por ahora". **Sin hora de reinicio** (A-27). |
| Apagado | Variable que desactiva Google por completo |

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

### 8.6 Riesgos conocidos

- Supabase gratuito: pausa tras 7 días sin actividad y 2 proyectos activos (fuentes secundarias; confirmar en #35). Un plan pagado requiere aprobación.
- Embed y Routes pueden trazar caminos distintos; la interfaz no afirma que sean idénticos.
- Las cuotas de Google se aplican con retraso: por eso el contador propio corta antes.

