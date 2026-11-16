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

## Base técnica conservada para revisar

- Motor puro, determinista y testeado; separación de datos internos y cotización compartida.
- Fórmulas de costos y escenarios A/B del [motor](03-motor-de-costos.md).
- TypeScript + React + Vite + Worker como punto de partida, **no stack final aprobado** con autenticación y base de datos.
- Importancia de reproducibilidad matemática separada de cambios externos de rutas.

## Propuestas técnicas / visuales SIN aprobar

| Tema | Propuesta o discusión |
|---|---|
| Arquitectura | Supabase Auth + PostgreSQL, Cloudflare Worker; comparar alternativas gratuitas y respaldo |
| Diseño | Híbrido de Ruta Clara y Tablero; **Claude prepara una nueva propuesta consolidada** |
| Mapa | Maps Embed + Routes, alternancia de rutas si no pueden superponerse; validar costos y condiciones |
| Alternativas de acceso | Correo electrónico además de Google |
| Límites de uso | Cuotas de Routes, límites por usuario y modo degradado |
| Pro futuro | IA para interpretar datos, lectura de fotos, calibración avanzada, historial/rentabilidad profesional, personalización |
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
| #20, #22 | Combustibles y vehículos | Fuentes oficiales y reutilización |
| #12 | Validación/calibración real | Umbrales y método |
| #14 | Publicación | Solo cuando propietario apruebe |

**El issue #11 (comparador de categorías) y la comparación de tercerización originalmente prevista para E4 quedan aplazados**: no son parte de la primera versión. No se cierran ni eliminan todavía; debe reconciliarse el backlog con el diseño aprobado.

## Control documental

El antiguo roadmap E0–E5 y las descripciones de algunas épicas/issues contienen funcionalidades superadas. **No se renumeran ni se cierran** hasta aprobar el diseño final y la nueva arquitectura. La preparación de documentos en PR no autoriza iniciar código.
