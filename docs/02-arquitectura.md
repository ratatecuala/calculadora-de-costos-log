# 02 · Arquitectura y tecnologías

Estado: **aprobada** (TypeScript, React, Vite, Cloudflare, motor independiente y proyecto único). Los puntos marcados _por verificar_ dependen de la investigación #18.

## Vista general

```
Navegador (React SPA)
 ├─ Motor de costos (TypeScript puro; corre en el navegador)
 ├─ Perfiles y direcciones recientes en localStorage (opcional, del usuario)
 └─ /api/*  →  Cloudflare Worker (mismo dominio)
                ├─ /api/route  → Google Routes (clave solo en el servidor)
                ├─ /api/fuel   → caché ← tarea diaria ← API CNE           (E3)
                └─ /api/tolls  → tablas de peajes versionadas            (E3, según #10)
```

**Principio:** los cálculos se hacen en el navegador. El servidor **solo intermedia datos externos**. Costos, sueldos y vehículo **nunca se envían a un servidor**.

## Decisiones técnicas

| Tema | Decisión | Por qué | Descartado |
|---|---|---|---|
| Lenguaje | **TypeScript estricto** | En un motor de dinero, mezclar unidades (km/L con L/100 km, neto con bruto) es el error más probable. Los tipos lo previenen. | JavaScript sin tipos |
| Interfaz | **React + Vite** (SPA estática) | La calculadora es interactiva y no necesita renderizado en servidor. Pocas piezas y alojamiento gratuito. | Next.js: SSR innecesario y adaptadores adicionales. El plan Hobby de Vercel no admite uso comercial. |
| Servidor mínimo | **Cloudflare Worker** que sirve la app y `/api` | Las claves deben vivir en el servidor. El plan gratuito alcanza _(por verificar, #18)_. | Servidor propio (mantenimiento); Vercel Hobby (no comercial) |
| Estructura | **Proyecto único** con módulos aislados por reglas de importación | Menos configuración para un equipo de una persona. El motor se puede extraer a un paquete después. | Tres paquetes (*workspaces*), por exceso de configuración |
| Validación | **Zod**, esquemas compartidos entre navegador y Worker | Una sola definición de entradas válidas | — |
| Base de datos | **Ninguna en v1** | No hay cuentas ni datos que guardar en servidor | Supabase u otras, que se evalúan solo si llegan las cuentas |
| PDF | **Impresión del navegador** ("Guardar como PDF") | Cero dependencias | Librerías de PDF |
| Autenticación | **Ninguna en v1** | Calculadora anónima | — |
| Pruebas | Vitest, fast-check, Playwright, axe | Ver [05](05-pruebas-y-calibracion.md) | — |

## Estructura del código (prevista para E1)

```
src/engine/   ← motor de costos: sin imports de web, worker, red ni DOM (regla de lint + prueba en CI)
src/shared/   ← esquemas Zod y tipos de dominio
src/web/      ← interfaz React
src/worker/   ← Cloudflare Worker
data/         ← catálogos versionados con fuente (categorías, peajes si aplica)
docs/         ← esta documentación
```

## Integraciones externas

| Servicio | Uso | Etapa | Control de costo |
|---|---|---|---|
| Google Routes API (Compute Routes **Essentials**) | Distancia y duración | E2 | Cuotas diarias ≈ tramo gratuito, límite propio en el Worker, Turnstile y límite por IP |
| Google Places Autocomplete | **Solo si** el experimento #19 lo justifica | E2 | Ídem |
| Enlaces de Google Maps | "Abrir / verificar ruta" | E2 | Sin API _(por verificar)_ |
| API CNE | Precios de combustible | E3 | Sin costo conocido (#20) |
| Peajes | Según la decisión #10 | E3 | Según la opción elegida |

**Restricción aprobada:** **no hay cargos variables de APIs autorizados**. Si se agota una cuota, la app pasa a **modo manual** con aviso.

## Lo que NO se usa (y por qué)

- **IA:** no hay justificación técnica para la v1.
- **Microservicios o infraestructura compleja:** un Worker basta.
- **Herramientas de pago:** ninguna sin una justificación concreta y la aprobación del propietario.
- **Mapas de otros proveedores con resultados de Google:** lo prohíben los términos de Google.
