# 07 · Registro de decisiones — estado actualizado

**Criterio:** lo aprobado por el propietario se distingue de alternativas propuestas. Este archivo se está actualizando en el **PR #34**, todavía sin fusionar. Nombre comercial **PENDIENTE**; no reutilizar el nombre anterior como marca.

## Aprobado / dirección explícita del propietario

| ID | Decisión | Fecha |
|---|---|---|
| A-01 | Repositorio técnico **público**, bajo titularidad del propietario | 2026-11-16 |
| A-02 | **Ningún cargo variable de APIs autorizado inicialmente**; se puede evaluar una cuenta de Google con facturación, pero activación y cargos requieren aprobación | 2026-11-16 |
| A-03 | Las cuentas técnicas deben permanecer bajo **titularidad y control del propietario** | 2026-11-16 |
| A-04 | Claude desarrolla/diseña lo autorizado; ChatGPT revisa; el propietario decide | 2026-11-16 |
| A-05 | No integrar PR a `main` sin **OK explícito** | 2026-11-16 |
| A-06 | Se permiten **issues grandes, PR coherentes y varias tareas paralelas**, con control de errores, conflictos y dependencias | 2026-11-16 |
| A-07 | **El nombre anterior está descartado**; nuevo nombre **por elegir** | 2026-11-16 |
| A-08 | **Primero lanzar una calculadora gratuita completa** y validar interés, uso recurrente y cotizaciones reales | 2026-11-16 |
| A-09 | La primera versión se dirige a **transportistas y fletes/mudanzas simples**, no alto tonelaje | 2026-11-16 |
| A-10 | Permitir **calcular sin cuenta**; registro Google para conservar datos, vehículos y cotizaciones | 2026-11-16 |
| A-11 | Vehículos con combustible y datos opcionales de rendimiento; ingreso de costos progresivo, con fuente/fecha y corrección manual | 2026-11-16 |
| A-12 | **Base opcional → A → B → regreso opcional**. Sin múltiples paradas/optimización en el primer lanzamiento | 2026-11-16 |
| A-13 | Prioridad a mapa visual y comparación con autopista / evitando peajes, kilómetros, duración, tráfico estimado, combustible y costo | 2026-11-16 |
| A-14 | **Cotizador PDF/compartible** para el cliente; no revelar costos internos | 2026-11-16 |
| A-15 | Historial básico y **registro manual** de viajes/cargas como función gratuita | 2026-11-16 |
| A-16 | **No desarrollar Pro, IA, pagos, marketplace ni logística elástica ahora**. Pro y expansión se evalúan tras validar la herramienta gratuita | 2026-11-16 |
| A-17 | El modelo futuro **no está decidido**: marketplace, logística elástica o combinación | 2026-11-16 |
| A-18 | La remuneración del transportista es **objetivo**, no desembolso; `null` no es 0; los resultados incompletos lo dicen | 2026-11-16 |
| A-19 | La documentación está autorizada en rama de trabajo, pero **no programación ni publicación** | 2026-11-16 |
| A-20 | **Aprobada la dirección visual v4**: fondo blanco, azul sobrio, grafito, estética profesional y las pantallas mostradas de **inicio y calculadora con comparación en una pantalla desplazable** | 2026-11-16 |
| A-21 | **Aprobada la extensión v4 completa**: panel, vehículo, desglose, precio, cotización, mis trabajos, estados especiales, navegación móvil y escritorio de tres columnas. **No se necesitan más rediseños visuales.** | 2026-11-16 |
| A-22 | Mapa: **un camino a la vez**, con selector | 2026-11-16 |
| A-23 | Tráfico actualizado **bajo demanda**, con una opción claramente visible; **no se consulta en cada cambio del formulario**. Se mantienen el modo sin tráfico actualizado y la alternativa manual. | 2026-11-16 |
| A-24 | La **comparación de rutas** es fundamental en la versión gratuita. El **comparador para clientes** y la **evaluación de subcontratación** quedan para etapas futuras (#36) | 2026-11-16 |
| A-25 | **Términos sencillos** con explicaciones breves; los conceptos formales permanecen en la ayuda y la documentación | 2026-11-16 |
| A-26 | **Resultados parciales:** no impedir cotizar si se desconocen los gastos fijos u otro dato; advertencias claras y **nunca presentar cifras incompletas como rentabilidad segura** | 2026-11-16 |
| A-27 | **No anunciar una hora fija** de restablecimiento de las consultas de Google sin conocer el reinicio real | 2026-11-16 |
| A-28 | **IVA configurable**, condicionado a reglas tributarias verificadas (#16, #37) | 2026-11-16 |
| A-29 | **Costos internos y cotización al cliente separados** (#38) | 2026-11-16 |
| A-30 | Siguiente trabajo: **cerrar la arquitectura, verificar integraciones y actualizar el backlog**. No programar ni integrar PR sin autorización. Nombre comercial sigue pendiente. | 2026-11-16 |

## Base técnica conservada para revisar

- Motor puro, determinista y testeado; separación de datos internos y cotización compartida.
- Fórmulas de costos y escenarios A/B del [motor](03-motor-de-costos.md).
- TypeScript + React + Vite + Worker como punto de partida, **no stack final aprobado** con autenticación y base de datos.
- Importancia de reproducibilidad matemática separada de cambios externos de rutas.

## Propuesta de cierre de arquitectura (PROPUESTO, requiere aprobación)

Encargada por el propietario en A-30. Detalle en [02 §8](02-arquitectura.md).

| ID | Propuesta | Issue |
|---|---|---|
| P-01 | **Supabase** (Auth con Google y Postgres con RLS) para cuentas y datos; cuenta a nombre del propietario | #35 |
| P-02 | **Cloudflare Workers** sirve la app y el proxy `/api` con claves de servidor | #18 |
| P-03 | **Maps Embed** para el mapa; **Routes Essentials** (`TRAFFIC_UNAWARE`) para el cálculo; **Routes Pro** (`TRAFFIC_AWARE`) solo con el botón de tráfico; sin peajes de Google en v1 | #9, #19 |
| P-04 | Tablas separadas `jobs` (interno) y `client_quotes` (cliente); `toClientQuote()` con lista blanca; enlace público solo mediante `get_public_quote(token)` | #38 |
| P-05 | PDF generado en el navegador; WhatsApp mediante enlace `wa.me` | — |
| P-06 | Reglas de IVA en `data/tax-rules.json`, versionadas, con fuente por regla | #37 |

## Otras propuestas aún abiertas

| Tema | Propuesta o discusión |
|---|---|
| Alternativas de acceso | Correo electrónico además de Google |
| Pro futuro | IA para interpretar datos, lectura de fotos, calibración avanzada, historial/rentabilidad profesional, personalización (#36) |
| Pagos Pro | Modelo de suscripción o prepago, precios y pasarela por validar |
| Motocicletas/vehículos especiales | Cobertura y método específico de cálculo por verificar |

## Decisiones y verificaciones pendientes

| Issue | Tema | Alcance |
|---|---|---|
| #13 | **Nombre comercial y dominio** | **PENDIENTE**; no bloquear E0 por la marca |
| #7 | Licencia del repositorio | Antes de publicar |
| #8 | Servicios, cuentas y titularidad | Elección de proveedor, autorizaciones |
| #9 | Facturación Google y límites | Sin cargos variables autorizados |
| #10, #21 | Peajes/TAG | Cobertura, tarifas, manual vs automático |
| #15, #19 | Términos Google, direcciones y rutas | Validar precios, tráfico, conservación y mapa |
| #16 | IVA y documentos | Tratamiento según contribuyente |
| #17 | Privacidad y protección de datos | Cuentas, documentos y enlaces compartidos |
| #18 | Hosting y capacidades gratuitas | Cloudflare y alternativas |
| #20 | Combustibles | Fuente oficial y reutilización |
| #12 | Validación/calibración real | Umbrales y método |
| #14 | Publicación | Solo cuando propietario apruebe |
| #35 | **Cuentas y datos: Supabase** | Propuesta P-01 |

**El issue #11 (comparador de categorías), #22 y la comparación de tercerización** quedan en la épica futura **#36** (A-24). No se cerraron ni eliminaron. La comparación de **rutas** permanece en la versión gratuita (#3).

## Control documental

El **16-11-2026**, por encargo del propietario (A-30), el backlog se actualizó **sin cerrar ni renumerar issues**: se reescribieron las épicas #1, #2, #3 y #5, y las issues #29 y #32; se movieron #11 y #22 a la épica futura #36; se crearon #35 a #39 y se agregaron comentarios de verificación en #8, #9, #15, #16, #18, #19, #21 y #23. Detalle en [08](08-hoja-de-ruta.md). La preparación de documentos en PR no autoriza iniciar código.
