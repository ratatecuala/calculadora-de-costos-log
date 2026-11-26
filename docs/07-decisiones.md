# 07 · Registro de decisiones — estado actualizado

> **A-89 (26-11-2026):** [aprobación de modalidades simplificada y detallada](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7182307655). Decisión de producto, no autorización de implementación. A-88 ya está registrada en [#43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7182067903) para el trabajo vigente de Claude.

> **Registro 26-11-2026:** [directrices del propietario y primera consolidación](27-consolidacion-fase-0.md) ([#43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7181997317)): objetivo de error económico máximo 10 %, competitividad sin alterar costos, automatización de captura y validación del Chery antes de solicitar piloto experimental. Umbrales operativos, muestras, nuevas funciones y cambios de alcance quedan por aprobar. No modifica A-84/A-85 ni autoriza programación.

**Criterio:** lo aprobado por el propietario se distingue de alternativas propuestas. Este archivo se está actualizando en el **PR #34**, todavía sin fusionar. **Última sincronización: 22-11-2026**, con A-69 (D-I8 parcial: [22 §15](22-diseno-integracion-cotizador.md)) y A-70 (P2 de D-I8 corregido, [22 §16](22-diseno-integracion-cotizador.md); rediseño del contador en #52, [23](23-revision-52-insert-directo.md)) y la [auditoría final de I-1 + I-1b](https://github.com/ratatecuala/calculadora-de-costos-log/issues/53#issuecomment-7052650743). Las secciones antiguas conservan su texto original; cuando su estado cambió, se indica con una nota de estado actual. Nombre comercial **PENDIENTE**; no reutilizar el nombre anterior como marca.

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

## Decisiones del 16-11-2026: evidencia y estado

**Criterio de acreditación:** una decisión cuenta como **APROBADA** cuando el propietario la deja por escrito en GitHub (comentario en el PR o la issue). Las decisiones siguientes las **comunicó el propietario por chat a Claude** el 16-11-2026. Claude no puede acreditarlas en GitHub. Hasta que el propietario las ratifique con un comentario en el PR #34, figuran como **COMUNICADAS, PENDIENTES DE RATIFICACIÓN**, no como confirmadas.

| ID | Decisión | Origen de la propuesta | Evidencia | Estado |
|---|---|---|---|---|
| A-21 | Diseño v4 (blanco, azul sobrio, grafito; navegación móvil y escritorio de tres columnas) como **dirección general**; las pantallas de la extensión son **referencia**; sin nuevas exploraciones visuales | Claude (prototipo), revisado por ChatGPT | Mensajes del propietario a Claude: «aprobamos la dirección visual…» y «está aprobado como dirección general» | Comunicada; ratificar en PR #34 |
| A-22 | Mapa con **un camino a la vez** | Claude / ChatGPT | Mensaje del propietario: «Aprobamos mostrar un camino a la vez» | Comunicada; ratificar |
| A-23 | Tráfico actualizado **bajo demanda** mediante Routes Pro, con opción visible; nunca en cada cambio; se mantienen el modo sin tráfico y el manual | Recomendación de ChatGPT | Mensaje del propietario: «será bajo demanda…»; reiterado: «Mantén tráfico actualizado bajo demanda mediante Routes Pro» | Comunicada; ratificar. SKU verificado vía buscador (#19) |
| A-24 | Comparación de **rutas** en la versión gratuita; comparador para clientes y subcontratación en etapas futuras (#36) | Propietario | Mensaje del propietario, respuesta 3 | Comunicada; ratificar |
| A-25 | Términos sencillos en pantalla; formales en ayuda y documentación | Recomendación de ChatGPT | Mensaje del propietario, respuesta 4 | Comunicada; ratificar |
| A-26 | Resultados parciales sin bloquear la cotización, con advertencias y sin presentar rentabilidad segura | Recomendación de ChatGPT | Mensaje del propietario: «correcciones funcionales» | Comunicada; ratificar. Matemática en [03 §3C](03-motor-de-costos.md) |
| A-27 | No anunciar una hora fija de reinicio de las consultas de Google | ChatGPT | Ídem | Comunicada; ratificar |
| A-28 | IVA configurable, condicionado a reglas verificadas | ChatGPT | Ídem | Comunicada; ratificar. Reglas pendientes (#16) |
| A-29 | Costos internos separados de la cotización al cliente | Acuerdo técnico previo | Ídem | Comunicada; ratificar |
| A-30 | Encargo: cerrar la arquitectura, verificar integraciones y actualizar el backlog, sin programar ni integrar | Propietario | Mensajes del propietario a Claude (dos instrucciones del 16-11-2026) | Encargo en curso |

**Para ratificar:** el propietario comenta en el PR #34, por ejemplo: «Ratifico A-21 a A-29». Puede excluir alguna si no la comparte.

**Recomendaciones de ChatGPT aún no decididas:** acceso por correo además de Google; plan de Supabase al publicar (gratuito con riesgo de pausa o Pro).

## Base técnica conservada para revisar

- Motor puro, determinista y testeado; separación de datos internos y cotización compartida.
- Fórmulas de costos y escenarios A/B del [motor](03-motor-de-costos.md).
- TypeScript + React + Vite + Worker como punto de partida, **no stack final aprobado** con autenticación y base de datos.
- Importancia de reproducibilidad matemática separada de cambios externos de rutas.

## Propuesta de cierre de arquitectura (PROPUESTO, requiere aprobación)

Encargada por el propietario (A-30). Detalle en [02 §8](02-arquitectura.md). Supabase se propone **aprobado técnicamente con condiciones** de seguridad y respaldo ([02 §8.6](02-arquitectura.md)).

| ID | Propuesta | Issue |
|---|---|---|
| P-01 | **Supabase** (Auth con Google y Postgres con RLS) para cuentas y datos; cuenta a nombre del propietario | #35 |
| P-02 | **Cloudflare Workers** sirve la app y el proxy `/api` con claves de servidor | #18 |
| P-03 | **Maps Embed** para el mapa (referencial); **Routes Essentials** (`TRAFFIC_UNAWARE`) para el cálculo, con 2 solicitudes habituales y 8 en el peor caso; **Routes Pro** (`TRAFFIC_AWARE`) solo con el botón de tráfico; sin peajes de Google en v1 | #9, #19 |
| P-07 | Control de consumo en capas: plantilla fija, clave restringida, cuota de Google calculada con el peor caso, contador atómico persistente, interruptor y modo manual | #9, #18 |
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

**El issue #11 (comparador de categorías), #22 y la comparación de tercerización** quedan en la épica futura **#36** (A-24, pendiente de ratificación). No se cerraron ni eliminaron. La comparación de **rutas** permanece en la versión gratuita (#3).

## Control documental

El **16-11-2026**, por encargo del propietario (A-30), el backlog se actualizó **sin cerrar ni renumerar issues**: se reescribieron las épicas #1, #2, #3 y #5, y las issues #29 y #32; se movieron #11 y #22 a la épica futura #36; se crearon #35 a #39 y se agregaron comentarios de verificación en #8, #9, #15, #16, #18, #19, #21 y #23. Detalle en [08](08-hoja-de-ruta.md). La preparación de documentos en PR no autoriza iniciar código.


## Evaluación de proveedores de mapas — NO aprobada

El propietario autorizó el 16-11-2026 **trasladar el informe Deep Research de Google al PR #34 y revisar preliminarmente proveedores alternativos**. Esto **no** equivale a elegir Google, Mapbox, TomTom, HERE, Waze o GraphHopper.

**Hallazgo pendiente:** interpretación contractual del almacenamiento/exportación de datos Routes y del **precio propio calculado con distancias de Google** (#15). No afirmar prohibición o permiso universal. Se añadió la comparación de costos/capacidades de [Mapbox, TomTom y otros](12-alternativas-mapas.md), sin evaluación empírica de precisión chilena.

**Regla del propietario:** antes de **cualquier investigación externa profunda**, avisar y solicitar autorización; dichas investigaciones se harán con **GPT Deep Research**. Claude no debe sustituir este procedimiento por búsquedas autónomas. Sigue sin autorizarse programación, facturación, despliegue o merge.


## Decisiones del 17-11-2026: inicio del desarrollo con Google Routes Essentials

Comunicadas por el propietario a Claude el 17-11-2026, en el mensaje que autoriza las fases 1 a 3 dentro del PR #34. Siguen el mismo criterio de acreditación que A-21 a A-29: deben **ratificarse con un comentario en el PR #34**. Este mensaje **reemplaza** las decisiones anteriores que contradice (ver la tabla de contradicciones más abajo).

| ID | Decisión | Reemplaza a |
|---|---|---|
| A-31 | El producto es una **calculadora profesional de costos y cotizaciones**, no un optimizador de rutas ni una alternativa a Google Maps | — |
| A-32 | **Proveedor seleccionado para desarrollar: Google Routes API Essentials** | P-03 y la §9 de [02](02-arquitectura.md) («proveedor pendiente») |
| A-33 | El transportista escribe **A y B**; el sistema obtiene **km y minutos automáticamente**; **base y regreso opcionales** | — |
| A-34 | La app calcula costos y **recomienda un precio** que el transportista puede modificar; se genera la **cotización** con historial, PDF y WhatsApp | — |
| A-35 | **Sin mapa integrado.** Enlace «Ver ruta en Google Maps» (Maps URLs, sin API) | A-22 (mapa con un camino a la vez) y Maps Embed |
| A-36 | La comparación **habitual / evitando peajes es opcional** | A-24, en lo que se refiere a mostrarla siempre |
| A-37 | **Tráfico en vivo fuera** de la primera implementación; Pro desactivado | A-23 |
| A-38 | Los **cálculos comerciales y las cotizaciones son datos de la aplicación**. Se documentan las restricciones conocidas de Google sin bloquear el desarrollo; no se sigue debatiendo la interpretación contractual (#15 queda como registro de riesgo) | Bloqueo de #15 propuesto en #19 |
| A-39 | **Política de consultas:** objetivo operativo de 7.000 solicitudes Essentials al mes y corte de emergencia de 8.000 | P-07 (cifras) |
| A-40 | **Comparaciones gratuitas:** máximo 3 al día y 10 al mes por usuario; cada una consume una llamada adicional | — |
| A-41 | **Pro y Enterprise completamente desactivados** | — |
| A-42 | Nunca consultar al escribir; no repetir solicitudes al cambiar combustible, ayudantes, margen o precio; contador persistente y atómico; límites por usuario; interruptor global; bloqueo si falla el contador; modo manual al agotarse el cupo. **No se promete gasto cero** | — |
| A-43 | Hasta autorizar Google Cloud: **respuestas simuladas, claramente identificadas**; nunca presentar distancias simuladas como reales | — |
| A-44 | Se autoriza **solo** el trabajo de las fases 1 (documentación), 2 (seguridad económica) y 3 (cotizador con datos simulados) dentro del PR #34. Sin cuentas, APIs, facturación, despliegue ni merge | Amplía A-30 |

### Arquitectura descartada como punto de partida

La contrapropuesta de MapLibre + PMTiles + Valhalla (con geocodificación OSM), debatida en #19, **se descartó como punto de partida** el 17-11-2026, porque el producto no es un planificador de rutas (A-31). Se conserva en #19 y en [12](12-alternativas-mapas.md) como antecedente; solo se reabre si un requisito comprobado lo exige. TomTom y Mapbox quedan como respaldo documentado, sin evaluación activa.

### Contradicciones detectadas y cómo se resolvieron

| Documento o decisión anterior | Contradicción | Resolución |
|---|---|---|
| A-22 y [10](10-diseno-ux.md) §4: «mapa con un camino a la vez» | A-35: sin mapa integrado | Prevalece A-35. La guía UX lo indica |
| A-23: tráfico bajo demanda con Routes Pro | A-37: tráfico fuera; Pro desactivado | Prevalece A-37 |
| A-24: comparación de rutas siempre visible | A-36: comparación opcional con cupo | Prevalece A-36 |
| [02](02-arquitectura.md) §8 (Embed + Routes) y §9 (proveedor pendiente) | A-32 y A-35 | §9 reescrita; los pasajes de §8 sobre Embed quedan como antecedente |
| [02](02-arquitectura.md) §8.3: cuota de 160 o 435 al día (#9) | A-39: 7.000 / 8.000 al mes | Prevalece A-39. El ritmo diario acumulativo es el de #19 |
| [01](01-alcance.md) y README: «mapas/rutas según viabilidad», «mapa con un camino a la vez» | A-35 | Actualizados |
| Supabase (#35) como lugar del historial | No hay autorización para crear cuentas (A-44) | **Pendiente.** El historial se guarda **en el navegador** (localStorage) detrás de una interfaz reemplazable; la migración a la nube espera la decisión de #35 |
| Reglas de IVA (#16) sin verificar | La cotización debería mostrar IVA | **Pendiente.** Sin regla verificada, la cotización muestra el neto (A-28) |
| Límite de rutas por usuario sin cifra | A-42 exige límites por usuario | **Pendiente.** Se implementan valores **provisionales y configurables** (20 rutas al día por usuario y 40 por origen de red), que el propietario debe confirmar |

## Decisión del 17-11-2026: módulo «Mi vehículo»

| ID | Decisión | Fecha |
|---|---|---|
| A-45 | Módulo **«Mi vehículo»**: varios vehículos con nombre, tipo (camioneta, furgón o camión liviano), combustible, rendimiento (km/L) y desgaste ($/km); editar, eliminar y elegir un predeterminado. Al elegirlo se cargan sus datos en la cotización y se pueden ajustar solo para ella. **Sin valores predeterminados inventados.** Guardado local, con una interfaz migrable a Supabase. **Sin cambios en el motor.** Comunicada por el propietario a Claude el 17-11-2026; ratificar en PR #34 | 2026-11-17 |

**Decisión menor de implementación (revisable):** el primer vehículo registrado queda como predeterminado para ahorrar un paso. Eliminar el predeterminado no elige otro automáticamente.

## Decisión del 18-11-2026: integración de Cloudflare y Supabase en staging

| ID | Decisión | Fecha |
|---|---|---|
| A-46 | Se autoriza integrar y probar **Cloudflare** (Worker, Durable Object, interruptor) y **Supabase** (Auth, Postgres con RLS, enlaces públicos) en un entorno **gratuito de desarrollo/staging**, sobre la rama del PR #34, usando recursos exclusivos de este proyecto sin alterar los existentes. **No** se autoriza: producción pública, planes de pago, facturación, Google Routes real ni merge. Comunicada por el propietario a Claude el 18-11-2026; **ratificar en el PR #34** | 2026-11-18 |

**Decisiones menores de implementación (revisables):** proyecto Supabase en `sa-east-1`; usuarios de prueba con contraseña **solo en staging** mientras no exista el cliente OAuth de Google del propietario; staging protegido con usuario y contraseña; enlaces públicos de 30 días; números de cotización conservados al copiar el historial local (pueden repetirse). Detalle y resultados en [13](13-staging.md).

## Decisiones del 17/18-11-2026 aprobadas por escrito en el PR #34

Escritas por el propietario en GitHub ([comentario en el PR #34](https://github.com/ratatecuala/calculadora-de-costos-log/pull/34#issuecomment-6966694338)): **APROBADAS** según el criterio de acreditación.

| ID | Decisión | Estado |
|---|---|---|
| A-47 | **Numeración de cotizaciones:** secuencia propia por cuenta, **única, correlativa y segura ante concurrencia**, asignada **atómicamente en Supabase** (no «máximo + 1» en el navegador), con unicidad por dueño en la base. Al copiar cotizaciones locales se conservan `local_id` y la idempotencia; si el número local está ocupado, se asigna un **número interno nuevo**. **Nunca** se cambia el número de un documento ya emitido: se guarda el número emitido por separado y el documento lo sigue mostrando | **APROBADO**. Implementado y probado en staging ([13](13-staging.md) §10 ter) |
| A-48 | **README como fuente de contexto:** README principal en español con estado real, «Estado para retomar en otro chat», pruebas ejecutadas o revisadas, decisiones, riesgos y límites; **actualizado con cada avance material**; publicado en la portada de `main` mediante un **PR exclusivamente documental**, sin fusionar el PR #34 | **APROBADO**. Regla permanente en [AGENTS.md](../AGENTS.md) §10 |

**Implementación de A-47 (decisiones menores, revisables):**
- Un número local **libre** se conserva tal cual, así que la secuencia puede saltar hasta ese número.
- Los números de cotizaciones borradas **no se reutilizan**.
- El dueño solo puede modificar el **estado** y el **pago** de sus trabajos.

## Decisión del 18-11-2026 aprobada por escrito en el PR #40

Escrita por el propietario en GitHub ([comentario en el PR #40](https://github.com/ratatecuala/calculadora-de-costos-log/pull/40#issuecomment-6968872592)) y repetida en el [PR #34](https://github.com/ratatecuala/calculadora-de-costos-log/pull/34#issuecomment-6968930515): **APROBADA**.

| ID | Decisión | Estado |
|---|---|---|
| A-49 | **Paridad teléfono y computador:** el cotizador se diseña para usarse **plenamente en teléfonos y en PC/notebook**, con interfaz adaptable y las **mismas funciones principales** (cálculo, cotización, PDF, historial, vehículos, cuentas y sincronización). Teléfono: controles táctiles cómodos. Computador: diseño que aprovecha el ancho. *Mobile-first* como técnica de maquetación **no** implica prioridad funcional ni comercial del móvil. Sin rehacer el diseño v4 ni agregar funciones nuevas | **APROBADA** (18-11-2026). Se reemplaza «Pensada primero para el teléfono» en el README |

## Decisiones del 18-11-2026 tras la [revisión de ChatGPT](https://github.com/ratatecuala/calculadora-de-costos-log/pull/34#issuecomment-6970465877) de los cinco frentes

El propietario las eligió en la sesión de Claude del 18-11-2026, sobre las opciones recomendadas en la revisión de ChatGPT, y ordenó ratificarlas en el PR #34 ([registro de ratificación en el PR #34](https://github.com/ratatecuala/calculadora-de-costos-log/pull/34#issuecomment-6971449761)). **APROBADAS**, con el alcance precisado por la [auditoría de `ff8286e`](https://github.com/ratatecuala/calculadora-de-costos-log/pull/34#issuecomment-6970773417).

| ID | Decisión | Estado |
|---|---|---|
| A-50 | **Motor y margen, sin cambiar fórmulas:** (1) **C-3**: se mantiene P = C/(1−m) y solo cambia el rótulo, que pasa a «Margen objetivo (% del precio de venta)», con una ayuda; (2) **C-1**: un dato **opcional** inválido (negativo o no numérico) se trata como faltante y **se avisa**; un dato **requerido** inválido (km, minutos, ayudantes, carga y descarga, partidas negativas o no finitas, recargos y precio **no numéricos**) **se rechaza**. Un texto escrito que no es número se avisa en el propio campo. **No incluye** los recargos negativos llevados a 0 (NE-1) ni el precio elegido negativo (NE-10), que siguen como «no especificado»; (3) **C-2**: nunca «$-0»; (4) **C-4**: el campo del margen muestra el mismo valor que usa el cálculo (12,5 %) | **APROBADA** (18-11-2026). **Implementada** (docs/15 §6) |
| A-51 | **IVA, alcance mínimo:** la cotización sin regla de IVA verificada muestra **«Precio total»** (no «Valor neto») y lleva siempre la leyenda **«Esta cotización no es factura ni boleta.»** (documento, PDF, enlace público y WhatsApp). **Sin reglas tributarias automáticas**: la opción B de docs/16 sigue condicionada a validación de un contador o del SII. **Estado transitorio de staging:** como «Precio total» exige que el emisor incluya cualquier IVA aplicable, no habilita cotizaciones comerciales reales hasta validar e implementar la política tributaria | **APROBADA** (18-11-2026). **Implementada** |

## Decisiones operativas del 18-11-2026

El propietario las eligió en la sesión de Claude, sobre las opciones recomendadas por la revisión de ChatGPT ([registro de decisiones en el PR #34](https://github.com/ratatecuala/calculadora-de-costos-log/pull/34#issuecomment-6972739332)). **APROBADAS.**

| ID | Decisión | Estado |
|---|---|---|
| A-52 | **Supabase en plan gratuito con respaldo propio:** cifrado, fuera del repositorio, antes de cada migración y mensual en staging; semanal con simulacro de restauración mensual en una futura beta ([17](17-supabase-seguridad-respaldo.md) §5). El **primer respaldo real lo ejecuta el propietario**, porque requiere la contraseña de la base. Sin plan Pro ni gastos | **APROBADA**. Pendiente: primer respaldo real |
| A-53 | **Google OAuth en modo *Testing*:** el propietario crea el cliente OAuth en su Google Cloud, sin facturación, y lo carga en Supabase según [17](17-supabase-seguridad-respaldo.md) §7, nunca por chat ni GitHub. Registro abierto mientras Google esté en *Testing* (§7.4, opción a). Después, Claude verifica el flujo y agrega la prueba e2e | **APROBADA**. Pendiente: cliente OAuth del propietario |
| A-54 | **Validación tributaria con GPT Deep Research** antes de implementar la opción B de [16](16-iva-cotizaciones.md). Encargo listo en [18](18-encargo-deep-research-iva.md); lo ejecuta el propietario. Hasta entonces rige A-51 (transitorio) | **APROBADA**. Pendiente: informe de Deep Research |

También se aprobó integrar **solo** el PR #41 (README de portada). No autoriza fusionar el PR #34.

## Propuesta del 20-11-2026: cotizador ampliado (PROPUESTA, no aprobada)

El propietario encargó planificar la ampliación: catálogo de vehículos, inventario de carga, costo según carga, IVA en dos opciones y rutas reales. Plan en [19](19-plan-cotizador-ampliado.md), encargos en [20](20-encargos-deep-research-cotizador.md) y backlog en la épica #42 (sub-issues #43 a #51, más #22 y #37).

**Versión 2 (20-11-2026):** corregida según la revisión de ChatGPT y la prioridad del propietario:
1. inventario;
2. recursos;
3. catálogo;
4. fórmulas;
5. IVA;
6. rutas.

**Estado al publicar la propuesta (histórico):** las decisiones **D-1 a D-10** estaban en #43, cada una con su estado: pendiente de aprobación, dependiente de una investigación o no autorizada; ninguna estaba aprobada. **Estado actual:** D-1, D-2, D-3, D-6, D-8 y D-9 se aprobaron como A-55 a A-60, y D-4 como A-61 (secciones siguientes); siguen pendientes D-2b, D-5, D-7 y D-10. La recomendación de ChatGPT no equivale a aprobación. **No autoriza** programar, cambiar fórmulas, crear o ejecutar migraciones, importar datos ni activar servicios.

## Decisiones del 20-11-2026 sobre el cotizador ampliado, ratificadas por escrito en #43

Escritas por el propietario en GitHub ([ratificación en #43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7041864905)). **APROBADAS.** Corresponden a D-1, D-2, D-3, D-6, D-8 y D-9 del plan [19](19-plan-cotizador-ampliado.md) §12.

| ID | Decisión (ID del plan) | Alcance de la aprobación |
|---|---|---|
| A-55 | **Planificación por etapas y carriles paralelos** (D-1): diseño de datos #45 primero; inventario #47 y recursos #51 en paralelo; catálogo #46; fórmulas #48; IVA #37; rutas #49 | **Planificación, NO desarrollo** |
| A-56 | **Alcance inicial** (D-2): camionetas, furgones y camiones livianos/medianos usados en Chile | Sin el límite liviano/mediano (D-2b, pendiente) |
| A-57 | **Investigaciones C-1 (#22) y C-2 (#44) con GPT Deep Research** (D-3), con los encargos de docs/20 versión 2 | Las ejecuta el propietario; Claude no investiga en profundidad por su cuenta |
| A-58 | **Ayudantes por hora o por servicio** (D-6): una modalidad por ayudante, horas pagadas explícitas y sin costos duplicados | **No autoriza programar** el nuevo cálculo |
| A-59 | **Solo el diseño** de migraciones y cambios de esquema (D-8) | Cada ejecución en staging requiere autorización individual y respaldo real previo |
| A-60 | **Catálogo piloto de hasta 15 versiones** (D-9), con datos verificables y `null` sin fuente | **No autoriza importar datos** |

**Siguen pendientes:**
- D-2b (clasificación de camiones);
- D-5 (fórmulas);
- D-7 (IVA);
- D-10 (Google Routes).
- D-4 quedó resuelta por A-61 (abajo).

**Autorizado además:** el diseño técnico documental de #45 ([21](21-diseno-datos-cotizador.md)). **No autorizado:** implementar, ejecutar migraciones, modificar el motor, activar servicios de pago, importar datos, producción ni merge.

## Decisiones del 20-11-2026 sobre el diseño v3 (#45) y la fase 0

Comunicadas por el propietario por chat a Claude y **registradas literalmente** en [#43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7044997471) (misma cuenta de GitHub, AGENTS.md §6.7). **APROBADAS**, sobre [21](21-diseno-datos-cotizador.md) versión 3 (commit `7b5a95b`).

| ID | Decisión | Alcance de la aprobación |
|---|---|---|
| A-61 | **D-4 = opción (b):** tabla `job_cargo_items` de solo lectura para el dueño, escrita una vez dentro del guardado; `internal` guarda solo el resumen | Diseño de almacenamiento. **No** autoriza ejecutar M3/M4 |
| A-62 | **T-1 a T-6** según docs/21 §12: tope de 200 líneas (interfaz, local y servidor); reutilizar `service_description`; accesibilidad solo en A y B; historial local en la misma clave con versión por registro; fuentes del catálogo en `jsonb` por campo; `create_job_with_quote_v2` que reutiliza la v1 | Contratos y diseño |
| A-63 | **Fase 0 (puerta P0)**, exclusivamente: tipos, contratos y validaciones Zod de inventario y recursos; contratos de snapshot versionado; pruebas de compatibilidad con las cotizaciones actuales; cálculos y casos dorados intactos | **No** autoriza interfaces nuevas, integración al cotizador, migraciones, fórmulas nuevas, cambios tributarios, Google Routes, despliegue ni merge del PR #34. Al terminar: commit, pruebas y revisión técnica antes de pedir la fase 1 |

## Decisiones del 20-11-2026: cierre de la fase 0 y fase 1 de inventario y recursos

Comunicadas por el propietario por chat a Claude y **registradas literalmente** en [#43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7045847482). **APROBADAS.** Base: [auditoría final de la fase 0](https://github.com/ratatecuala/calculadora-de-costos-log/issues/45#issuecomment-7045719529) (0 P0, 0 P1, 2 P2 de seguimiento).

| ID | Decisión | Alcance de la aprobación |
|---|---|---|
| — | **Fase 0 (A-63) cerrada técnicamente** (commit `87119a6`) | Los 2 P2 de seguimiento pasan a criterios de la fase 1 |
| A-64 | **T-7:** se conservan **provisionalmente** los límites técnicos de recursos (≤ 24 h por ayudante, ≤ 20 ayudantes, ≤ 20 elementos de equipamiento, pesos enteros) y se **diseña** una solución para trabajos de más de 24 horas | Diseño (docs/21 §4.5); implementarlo requiere otra aprobación |
| A-65 | **T-8:** `fragile: false` = «no marcado» y `handling: 'normal'` = «sin manejo especial declarado» | **Prohibido** usarlos para automatizar costos o determinar seguridad |
| A-66 | **Fase 1 (puerta P1), solo carriles #47 (inventario) y #51 (recursos):** editores, funciones puras y pruebas; ambos detrás de una **feature flag desactivada**; teléfono y PC; comprobaciones de peso y volumen preparadas para la integración | **Sin** conexión al cotizador ni cambio del resultado económico. Bloqueados: Supabase, migraciones, IVA, Google Routes, producción, merge del PR #34, catálogo #46 e integración (P2) |

## Decisiones del 20-11-2026: integración I-1 + I-1b (docs/22 v2)

Comunicadas por el propietario por chat a Claude y **registradas literalmente** en [#43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7050929523). **APROBADAS.** Base: [docs/22 v2](22-diseno-integracion-cotizador.md) y [su auditoría](https://github.com/ratatecuala/calculadora-de-costos-log/issues/53#issuecomment-7050906514).

| ID | Decisión | Alcance de la aprobación |
|---|---|---|
| A-67 | **D-I1 a D-I7** de docs/22 §6: costos actuales como única fuente; solo sin cuenta; no emitir con datos inválidos; borrador persistente (I-1b); «Servicio» con botón voluntario e «Incluye» con casilla explícita; flag nueva apagada; sin inventario en el PDF, el enlace ni WhatsApp | Diseño de I-1 |
| A-68 | **Implementar I-1 + I-1b juntas**, con **C1** (el borrador local se conserva aislado al iniciar sesión, sin mostrarlo ni mezclarlo con cuentas) y **C2** (a la nube solo el `internal` preparado y validado, con medición en bytes para todos los v2); copia segura de las cotizaciones compatibles y diferidas las que requieren I-2; flag `VITE_FF_INTEGRACION_CARGA` **apagada** | **No** autoriza I-2, I-3, #52, migraciones, motor económico, IVA, Google Routes, despliegues ni merge del PR #34 |

**Tarea independiente:** [#52](https://github.com/ratatecuala/calculadora-de-costos-log/issues/52), impedir el `INSERT` directo en `jobs` que omite la numeración automática. **Debe resolverse antes de autorizar M3/M4 en staging** (puerta P3).

## Estado técnico al 20-11-2026: cierre de I-1 + I-1b (dictamen técnico, no es una decisión nueva)

La [auditoría final de ChatGPT](https://github.com/ratatecuala/calculadora-de-costos-log/issues/53#issuecomment-7052650743) sobre el commit `2f8e112` dictaminó **0 P0 · 0 P1 · 1 P2 de producto (D-I8, sin implementar)**: I-1 e I-1b quedan **aptas para el cierre técnico** de su implementación **detrás de la flag apagada** ([22 §14](22-diseno-integracion-cotizador.md)). Es un dictamen técnico de revisión, **no** una aprobación del propietario: no habilita la flag, staging, producción ni merge.

| Tema | Estado vigente |
|---|---|
| I-1 + I-1b (A-68) | **Implementadas y cerradas técnicamente** (0 P0, 0 P1). Flag `VITE_FF_INTEGRACION_CARGA` **apagada**; el costo no cambia |
| **D-I8:** recuperar en el borrador los km y minutos escritos a mano ([22 §12](22-diseno-integracion-cotizador.md)) | *Estado actual:* **aprobada parcialmente el 21-11 (A-69, abajo)**: solo el modo manual. **Implementada** ([22 §15](22-diseno-integracion-cotizador.md)), en auditoría |
| Encender la flag para transportistas reales | **NO AUTORIZADO.** Puertas que siguen cerradas y deben cumplirse antes de pedirlo: e2e con cuentas reales y la suite 59/59 en un staging autorizado; Safari en un iPhone real; lector de pantalla; decisión D-I8 |
| [#52](https://github.com/ratatecuala/calculadora-de-costos-log/issues/52) (`INSERT` directo en `jobs`) | Registrada como tarea independiente; **implementación no autorizada**. Debe resolverse antes de M3/M4 (puerta P3) |
| I-2 (M3, M4 y copia de v2 con líneas a la cuenta) | **NO AUTORIZADO** |
| I-3 (recursos en el costo) | **NO AUTORIZADO**; requiere aprobar las fórmulas de docs/21 §4.3–§4.4 y casos dorados nuevos |
| Migraciones, despliegues (staging incluido), Google Routes, IVA, producción y merge del PR #34 | **NO AUTORIZADOS** |

## Decisión del 21-11-2026: D-I8 parcial (solo recorrido manual) y revisión de #52

Comunicada por el propietario por chat a Claude y **registrada literalmente** en [#43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7071050495) antes de implementar. **APROBADA.** Base: [22 §12](22-diseno-integracion-cotizador.md) y la [auditoría final de I-1 + I-1b](https://github.com/ratatecuala/calculadora-de-costos-log/issues/53#issuecomment-7052650743).

| ID | Decisión | Alcance de la aprobación |
|---|---|---|
| A-69 | **D-I8 parcial (§12, punto 1):** al restaurar un borrador se recuperan **solo** los km y minutos escritos a mano (recorrido manual), asociados a las direcciones y tramos originales, con el aviso «Recorrido recuperado: revisa los kilómetros y minutos». Si cambian las direcciones, el recorrido anterior queda invalidado y debe revisarse de nuevo | **No** recupera el precio elegido ni su confirmación; **no** guarda datos de proveedores externos; **no** recupera correcciones sobre rutas automáticas (§12, punto 2, sin autorizar). Mantiene intactas seguridad, privacidad y conservación de datos |
| — | **#52:** solo la **revisión técnica documental** (solución, riesgos, pruebas de seguridad y relación con M3/M4) | **Implementación no autorizada**: el propietario revisará y aprobará la solución antes |

**No autoriza:** I-2, I-3, M3/M4, migraciones, fórmulas económicas, IVA, Google Routes, despliegues, activación de flags ni merge del PR #34.

**Estado (21-11):** D-I8 parcial **implementada** (`e5534c7`, [22 §15](22-diseno-integracion-cotizador.md)). Revisión de #52 **entregada** en [23](23-revision-52-insert-directo.md). *Estado actual (22-11): ver A-70.*

## Decisión del 22-11-2026: corrección del P2 de D-I8 y rediseño del contador en #52 (solo diseño)

Comunicada por el propietario por chat a Claude y **registrada literalmente** en [#43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7071441529) antes de ejecutar. **APROBADA.** Base: [auditoría de D-I8](https://github.com/ratatecuala/calculadora-de-costos-log/issues/53#issuecomment-7071423796) y [revisión de #52](https://github.com/ratatecuala/calculadora-de-costos-log/issues/52#issuecomment-7071428749).

| ID | Decisión | Alcance de la aprobación |
|---|---|---|
| A-70 | **D-I8, P2:** un recorrido manual recuperado de un borrador dañado o manipulado no puede reconstruir km o minutos negativos o desbordados ni hacer fallar la calculadora; si se descarta, el resto del borrador se conserva | Corrección con pruebas de regresión, casos extremos y casos dorados; **sin** cambiar la funcionalidad, el diseño ni el motor. Implementada en [22 §16](22-diseno-integracion-cotizador.md) |
| — | **#52, solo diseño:** rediseñar en [23](23-revision-52-insert-directo.md) la protección de `quote_counters` ante importaciones con números muy altos, con pruebas de límites de `INTEGER`, concurrencia y reintentos | **No** autoriza implementar #52 ni crear o ejecutar migraciones |
| — | **D-52-1 y D-52-2:** aceptadas **como orientación técnica**. **D-52-3:** criterio futuro. **D-52-4:** requiere rediseño. **D-52-5:** provisional | No son autorizaciones de implementación |

**No autoriza:** implementar #52, migraciones, flags, despliegues, I-2, I-3, merge del PR #34 ni el PR documental hacia `main`.

**Estado (22-11):** P2 de D-I8 corregido ([22 §16](22-diseno-integracion-cotizador.md)). [23](23-revision-52-insert-directo.md) versión 2: H4 (desbordamiento del contador) y **rediseño N1** con ensayo local 42/42. **D-52-4 v2 y D-52-4b, pendientes de tu decisión.** La implementación de #52 sigue **no autorizada**.

## Decisiones del 22-11-2026: robustez numérica (Frente A) y diseño de #52 aprobado (Frente B)

Comunicadas por el propietario por chat a Claude y **registradas literalmente** en [#43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7071778285) antes de trabajar. **APROBADAS.** Base: [reauditoría de D-I8](https://github.com/ratatecuala/calculadora-de-costos-log/issues/53#issuecomment-7071695047) (0 P0 · 0 P1 · 0 P2: D-I8 parcial apta para el cierre técnico) y [reauditoría de docs/23 v2](https://github.com/ratatecuala/calculadora-de-costos-log/issues/52#issuecomment-7071695410).

| ID | Decisión | Alcance de la aprobación |
|---|---|---|
| A-71 | **Frente A: robustez ante números extremos** en todas las entradas numéricas de la calculadora: km, minutos, combustible, rendimiento, desgaste, ayudantes, gastos fijos, remuneración, peajes, carga y descarga, otros costos, margen y recargos | Implementar límites técnicos por campo y operaciones intermedias sin infinitos; distinguir inválido, faltante y cero; error junto al campo sin cerrar la calculadora. **Sin** reemplazos silenciosos ni cambios de fórmulas. Compatible con cotizaciones antiguas y borradores, con y sin flags. Pruebas unitarias, de límites y E2E en teléfono y PC, con mutaciones |
| A-72 | **Frente B: diseño de #52 aprobado.** Aprobadas como decisiones de diseño:<br>• **D-52-4 v2 / N1**, incluido el cambio de numeración (contador en 12 + importación del N° 5000 → la siguiente nueva es la N° 13; el importado conserva su número);<br>• **D-52-1** y **D-52-2** como criterios de diseño.<br>**D-52-3**, reservado para M4. **D-52-5**, provisional. **D-52-4b**, solo si aparecen contadores inflados, nunca con reparación automática | Consolidar docs/23; revisar los riesgos de DEFINER, privilegios, RLS e identidad; plan de implementación, reversión y pruebas; ampliar los ensayos en PostgreSQL local; preparar verificaciones de **solo lectura** sin ejecutarlas. **No** autoriza implementar #52 en las migraciones reales ni tocar Supabase |

**No autoriza:** despliegues, migraciones reales, ejecución en Supabase, flags, I-2, I-3, IVA, Google Routes ni merge del PR #34.

**Estado (22-11):** A-71 **implementada** ([24](24-robustez-numerica.md)), con auditoría solicitada. A-72: [23](23-revision-52-insert-directo.md) **versión 3** consolidada (diseño aprobado, riesgos de DEFINER, plan por autorizaciones y verificaciones de solo lectura preparadas, sin ejecutar); ensayo local 52/52. **Implementar #52 sigue sin autorizar.**

## Decisiones del 22-11-2026: correcciones de validación (Frente A) e implementación LOCAL de #52 (Frente B)

Comunicadas por el propietario por chat a Claude y **registradas literalmente** en [#43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7072135863) antes de trabajar. **APROBADAS.** Base: [auditoría del Frente A](https://github.com/ratatecuala/calculadora-de-costos-log/issues/53#issuecomment-7072118320) (0 P0 · 0 P1 · 2 P2; A-71 apta para el cierre técnico) y [auditoría del Frente B](https://github.com/ratatecuala/calculadora-de-costos-log/issues/52#issuecomment-7072118724) (A-72 apto para implementación local, con 1 P2 documental).

| ID | Decisión | Alcance de la aprobación |
|---|---|---|
| A-73 | **Frente A, validación:**<br>(1) un texto no numérico muestra error y **bloquea la emisión**, sin confundirse con vacío ni con cero;<br>(2) una comparación opcional con valores inválidos **no** bloquea la cotización principal válida;<br>(3) el rendimiento mínimo de «Mi vehículo» se alinea con el de la calculadora, sin perder ni modificar en silencio los vehículos guardados | Sin cambiar fórmulas ni cotizaciones históricas, con compatibilidad. Pruebas unitarias, E2E y mutaciones |
| A-74 | **Frente B, implementación LOCAL de #52:** migración nueva **en el repositorio** con D-52-1, D-52-2 y N1, ensayada **solo en PostgreSQL local desechable**. Adaptar las pruebas de RLS, numeración y T6c; verificar privilegios, concurrencia, idempotencia y reversión; corregir las instrucciones de las verificaciones de solo lectura para el editor SQL de Supabase | **No** autoriza ejecutar ninguna migración en Supabase. La implementación local **no** equivale a una autorización de ejecución remota, que sigue exigiendo respaldo real y A-59 |

**No autoriza:** ejecutar migraciones en Supabase, modificar staging, flags, despliegues, I-2, I-3 ni merge del PR #34.

**Estado (22-11):** A-73 **implementada** ([24 §7](24-robustez-numerica.md)), con auditoría solicitada. A-74 **implementada solo en el repositorio y en local** ([23 §11](23-revision-52-insert-directo.md)), **no aplicada en Supabase**; auditoría solicitada.

## Decisiones del 22-11-2026: P1 de A-73 (Frente A) y lista de comprobación para staging de #52 (Frente B)

Comunicadas por el propietario por chat a Claude y **registradas literalmente** en [#43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7077903187) antes de trabajar. **APROBADAS.** Base: [auditoría de A-73](https://github.com/ratatecuala/calculadora-de-costos-log/issues/53#issuecomment-7072905772) (0 P0 · 1 P1) y [auditoría de A-74](https://github.com/ratatecuala/calculadora-de-costos-log/issues/52#issuecomment-7072906170) (0 P0 · 0 P1).

| ID | Decisión | Alcance de la aprobación |
|---|---|---|
| A-75 | **Frente A, P1 de A-73:** cuando una acción reemplaza un valor numérico por otro válido (cargar el ejemplo ficticio, seleccionar o restaurar un vehículo, elegir un margen predefinido), se limpian **solo** los errores de texto de los campos reemplazados | Sin limpiar errores de otros campos ni modificar valores en silencio. Pruebas unitarias, E2E y mutaciones, en especial que un error de margen no siga bloqueando tras elegir 15 % |
| A-76 | **Frente B:** la implementación local de #52 queda **aprobada técnicamente** por auditoría | La migración **no** se modifica salvo una incompatibilidad verificable. Se prepara **solo** una lista de comprobación, con instrucciones simples, para el respaldo y las verificaciones previas en staging. **Ninguna operación remota** |

**No autoriza:** migraciones, consultas en Supabase, flags, despliegues, I-2, I-3 ni merge del PR #34.

**Estado (22-11):** A-75 **implementada** ([24 §8](24-robustez-numerica.md)), con reauditoría solicitada. A-76: [25 · Lista de comprobación](25-lista-staging-52.md) **preparada**; nada ejecutado, migración sin cambios.

## Decisión del 22-11-2026: procedimiento reproducible de respaldo y restauración (docs/25 v2)

Comunicada por el propietario por chat a Claude y **registrada literalmente** en [#43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7078172931) antes de trabajar. **APROBADA.** Base: [reauditoría de A-75](https://github.com/ratatecuala/calculadora-de-costos-log/issues/53#issuecomment-7078148135) (0 P0 · 0 P1 · 0 P2) y [auditoría de A-76](https://github.com/ratatecuala/calculadora-de-costos-log/issues/52#issuecomment-7078148568) (0 P0 · 1 P1 · 2 P2).

**A-75 queda cerrada técnicamente.** No se hacen más cambios en ese frente.

| ID | Decisión | Alcance de la aprobación |
|---|---|---|
| A-77 | Corregir **exclusivamente la documentación y las herramientas locales** para que el procedimiento de respaldo y restauración de docs/25 sea realmente reproducible:<br>(1) corregir el nombre de la migración;<br>(2) resolver la incompatibilidad entre el *stub* mínimo de Auth y los datos de un respaldo real, sin presentar como validado un simulacro que no pueda restaurarlos;<br>(3) preparar y probar una restauración local compatible con el estado anterior a #52, sin aplicar por accidente la migración nueva;<br>(4) corregir la contradicción del modo de solo lectura en el editor SQL;<br>(5) adaptar las instrucciones a Windows 11 para un propietario sin conocimientos técnicos, con requisitos previos, comandos exactos y protección de los archivos descifrados;<br>(6) probar con datos ficticios y documentar resultados reales, limitaciones y pendientes | Se permite trabajar en paralelo en worktrees separados si no comparten archivos. **No** se accede a Supabase, **no** se piden credenciales, **no** se ejecutan respaldos reales ni migraciones remotas. **No** se cambian el motor, I-2/I-3, las flags, los despliegues ni el PR #34. Se entregan commits y se pide una **última reauditoría del procedimiento** antes de solicitar autorizaciones para trabajar en staging |

**Estado (24-11):** A-77 **implementada solo en documentación y herramientas locales**; su [reauditoría](https://github.com/ratatecuala/calculadora-de-costos-log/issues/52#issuecomment-7118358999) dio 0 P0 · 2 P1 · 1 P2, corregidos por A-78. Detalle original:: [25 · Lista de comprobación v2](25-lista-staging-52.md) y `scripts/simulacro/`. Probada con datos ficticios en PostgreSQL local (15/15; 6 mutaciones detectadas). Reauditoría solicitada. Nada ejecutado contra Supabase.

## Decisión del 24-11-2026: credenciales, integridad y tiempo en el respaldo y el simulacro (A-78)

Comunicada por el propietario por chat a Claude y **registrada literalmente** en [#43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7118420787) antes de trabajar. **APROBADA.** Base: [reauditoría de A-77](https://github.com/ratatecuala/calculadora-de-costos-log/issues/52#issuecomment-7118358999) (0 P0 · 2 P1 · 1 P2).

| ID | Decisión | Alcance de la aprobación |
|---|---|---|
| A-78 | Corregir los 2 P1 y el P2, **exclusivamente** en las herramientas locales de respaldo, verificación, simulacro y documentación:<br>**Frente A, credenciales:** ninguna contraseña en argumentos de procesos, comandos, registros ni resultados; conexión PostgreSQL con archivos privados, sin contraseña en la línea de comandos; verificar `psql`, `pg_dump`, el respaldo y las comprobaciones de solo lectura; pruebas automáticas con credenciales ficticias.<br>**Frente B, integridad:** comprobar el contenido completo de las tablas de negocio críticas; que alterar un cliente, un costo, el JSON interno o un vehículo provoque una falla; distinguir el simulacro de datos de una restauración funcional completa de Supabase Auth; corregir los mensajes que exageran; errores explícitos ante formatos o datos relevantes no reconocidos.<br>**Frente C, tiempo:** corregir el falso error por enlaces que vencen entre el respaldo y la restauración, y probarlo con datos ficticios | Se permiten agentes y worktrees paralelos si no comparten archivos; las modificaciones comunes se integran en secuencia y las pruebas se ejecutan en conjunto. Windows 11 sigue siendo la plataforma del propietario. Se actualizan docs/17, docs/25, el README y #52 solo según lo comprobado. **No** se modifican la migración de #52, Supabase, el motor económico ni las funciones del cotizador. **Prohibido:** acceder a staging, usar credenciales reales, ejecutar respaldos reales, aplicar migraciones, desplegar, habilitar flags o fusionar el PR #34. Se entregan commits, pruebas, controles negativos y una solicitud de reauditoría independiente |

**Estado (24-11):** A-78 **implementada solo en herramientas locales y documentación**:
- `scripts/conexion/` (nuevo);
- `scripts/verificar-solo-lectura.sh` (nuevo);
- `scripts/respaldo-supabase.sh`;
- `scripts/verificar-restauracion.sql`;
- `scripts/simulacro/`;
- `scripts/diseno/ensayo-52/probar-restauracion.sh`, solo para pasar el instante de referencia.

**Pruebas:** con datos y credenciales ficticios, **60/60**, con 9 mutaciones detectadas ([25 §7](25-lista-staging-52.md)). El ensayo local de #52 sigue en 65 OK y `npm test` en 636/636.

Su [reauditoría independiente](https://github.com/ratatecuala/calculadora-de-costos-log/issues/52#issuecomment-7119520646) dio 0 P0 · 1 P1 (TLS sin verificación de identidad del servidor) · 0 P2. Ese P1 lo corrige A-79. Nada se ejecutó contra Supabase.

## Decisión del 24-11-2026: verificación TLS de la identidad del servidor (A-79)

Comunicada por el propietario por chat a Claude y **registrada literalmente** en [#43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7120135246) antes de trabajar. **APROBADA.** Base: [reauditoría independiente de A-78](https://github.com/ratatecuala/calculadora-de-costos-log/issues/52#issuecomment-7119520646) (0 P0 · 1 P1 · 0 P2).

| ID | Decisión | Alcance de la aprobación |
|---|---|---|
| A-79 | Corregir **únicamente** el P1 de verificación TLS antes de usar credenciales reales:<br>(1) exigir `sslmode=verify-full` en las conexiones remotas a staging;<br>(2) verificar el certificado raíz con `sslrootcert`, según la documentación oficial de Supabase y PostgreSQL;<br>(3) rechazar `disable`, `allow`, `prefer`, `require` y `verify-ca`, también si se editan los archivos a mano;<br>(4) actualizar el asistente y las comprobaciones;<br>(5) mantener las pruebas locales sin TLS solo con una excepción explícita, limitada a pruebas y a conexiones locales;<br>(6) controles negativos: certificado incorrecto, nombre de servidor diferente, archivo faltante y configuración insegura;<br>(7) explicar en docs/25, en lenguaje simple, cómo obtener el certificado en el panel y configurarlo en Windows 11 con WSL | Agentes permitidos si sus cambios son independientes. Pruebas locales, ensayo de #52, regresiones y mutaciones. **Límites:** sin credenciales reales ni conexión a Supabase; sin respaldos reales, consultas remotas, migraciones ni despliegues; sin cambios en el motor ni en las flags; sin merge del PR #34. Al terminar se solicita una nueva auditoría de ChatGPT |

**Estado (24-11):** A-79 **implementada solo en herramientas locales y documentación**:
- `scripts/conexion/sanear.py`: política TLS, analizador estricto y validación del certificado;
- `scripts/conexion/conexion.sh`: rechazo de `PGSSL*`, `PGGSS*`, `PGREQUIRESSL` y `PGSYSCONFDIR`;
- `scripts/conexion/configurar-conexion.py`: `verify-full`, `sslrootcert` y `gssencmode=disable`;
- `scripts/conexion/probar-conexion.sh`: informa el TLS;
- `scripts/simulacro/probar-simulacro.sh`: grupo T y mutaciones MT.

**Pruebas:** **98/98**, con 30 controles TLS y 8 mutaciones TLS. El ensayo de #52 sigue en 65 OK y `npm test` en 636/636.

**Pendiente:**
- **POR CONFIRMAR** el menú del panel y que el certificado oficial valide el Session pooler.
- Nueva auditoría solicitada.

## Decisión del 24-11-2026: preparar I-2, catálogo piloto C-1 y calidad del flujo completo (A-80)

Comunicada por el propietario por chat a Claude y **registrada literalmente** en [#43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7140861257) antes de trabajar. **APROBADA.** A-79 queda **cerrada técnicamente**.

| ID | Decisión | Alcance de la aprobación |
|---|---|---|
| A-80 | **Frente A, preparación de I-2:** revisar el estado de M3 y M4 y su dependencia con #52; pruebas de integración en un PostgreSQL local desechable; compatibilidad de inventario, recursos, vehículos y snapshots v1/v2; cambios concretos y secuencia, separando lo local de lo que requiere Supabase.<br>**Frente B, catálogo C-1:** investigar camionetas, furgones y camiones livianos frecuentes en Chile; piloto de hasta 15 versiones con especificaciones oficiales, fuente y fecha, `null` cuando falte el dato; catálogo estructurado de **candidatos**, sin incorporarlo a producción.<br>**Frente C, calidad funcional:** revisar las pruebas y detectar regresiones que bloqueen una cotización real (vehículo → recorrido manual → carga → costos → precio → cotización → PDF/WhatsApp); agregar pruebas sin cambiar funciones ni reglas comerciales | **No** implementar I-2 ni alterar las migraciones aprobadas: se entrega una propuesta. **No** inventar cifras ni usar datos de terceros no autorizados. Google Routes sigue desconectado. **Sin** flags, despliegues, acceso a Supabase ni migraciones remotas. **Sin** I-3 ni cambios de fórmulas, IVA o márgenes. **Sin** merge del PR #34. Se permiten agentes y *worktrees* paralelos si no comparten archivos. **Excepción a A-57:** el Frente B autoriza a Claude a investigar C-1, solo para este piloto de candidatos |

**Estado (24-11):**
- **Frente A:** propuesta lista para autorizar ([22 §17](22-diseno-integracion-cotizador.md)). La prueba de integración da 49/49. **Hallazgo:** M4 tal como está escrito falla después de #52, y debe ser `SECURITY DEFINER` (D-52-3). I-2 no está implementado.
- **Frente B:** 15 candidatos en `datos/catalogo-c1/`, con **0 campos verificados**. La red bloqueó las fuentes oficiales, así que todo proviene de fragmentos del buscador y las condiciones de reutilización están por revisar. No se cargan en la app.
- **Frente C:** 18 pruebas unitarias y 84/84 controles en el navegador; no hay regresiones que bloqueen una cotización. **H1, para tu decisión:** un precio con decimales se muestra `$87.001` en el PDF y `$87.000,5` en WhatsApp.

## Decisión del 24-11-2026: precio en pesos enteros, I-2 local y verificación de C-1 (A-81)

Comunicada por el propietario por chat a Claude y **registrada literalmente** en [#43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7141648200) antes de trabajar. **APROBADA.** Base: revisiones de ChatGPT en #45, #46 y #53.

| ID | Decisión | Alcance de la aprobación |
|---|---|---|
| A-81 | **Frente A, H1:** el precio final de las cotizaciones **nuevas** se expresa en pesos chilenos enteros. Un precio con decimales se rechaza con un error claro y nunca se redondea en silencio. Los costos internos y los cálculos conservan sus decimales. El PDF, WhatsApp, el historial y los documentos públicos muestran el mismo precio. Los registros históricos con decimales se conservan.<br>**Frente B, I-2:** **solo el paso 1** de [22 §17.5](22-diseno-integracion-cotizador.md): M3′ y M4′ con las correcciones de seguridad y permisos, y la integración cliente-servidor detrás de `VITE_FF_CARGA_NUBE` **apagada**, con `VITE_FF_INTEGRACION_CARGA` también apagada. Pruebas de guardado y lectura v1/v2, inventario, recursos, duplicados y aislamiento. Ensayo solo en PostgreSQL local desechable, sin modificar la migración #52.<br>**Frente C, C-1:** verificar el catálogo con fuentes oficiales primarias. Categorías comerciales para los camiones; los umbrales de `camionMediano` quedan pendientes. Ninguna versión entra a la app sin especificaciones verificadas y sin revisar las condiciones de reutilización | Pruebas unitarias, E2E y mutaciones. Agentes y *worktrees* en paralelo cuando no compartan archivos. **Prohibido:** acceder a Supabase, aplicar migraciones remotas, desplegar, activar flags, modificar fórmulas o IVA, implementar I-3 y fusionar el PR #34 |

## Decisión del 25-11-2026: precio entero en la base y verificación de C-1 (A-83)

Registrada literalmente en [#43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7142526865). **APROBADA.**

| ID | Decisión | Alcance |
|---|---|---|
| A-83 | **Frente A:** proteger la base contra precios finales **nuevos** con decimales en `jobs` y `client_quotes`. Se conservan los históricos y se permite cambiar su estado y pago. Antes de elegir, comparar CHECK, trigger u otras opciones.<br>**Frente B:** volver a verificar C-1 con fuentes oficiales, con evidencia y condiciones de reutilización por campo | **Solo local:** sin migraciones en Supabase, sin datos en la app sin verificación suficiente, con flags apagadas, sin despliegues ni merge |

**Estado del Frente A (25-11), solo local:** `supabase/migrations/20261125130000_precio_entero.sql`.
- **Qué protege:** triggers en INSERT y en `UPDATE OF net_price` (y de `total`/`tax_amount` en `client_quotes`). El error es `23514` y nada se guarda.
- **Excepción:** una copia de una cotización **local** histórica (`local_id`) conserva sus decimales.
- **Por qué no un CHECK:**
  - un CHECK, incluso `NOT VALID`, se vuelve a evaluar en cualquier UPDATE, así que cambiar el estado de un histórico fallaría (control demostrado);
  - un CHECK no puede consultar `jobs` desde `client_quotes`.
- **Ensayo** (`scripts/diseno/precio-entero/ensayar-precio.sh`): **15 OK**. Cubre los RPC v1 y v2 (sin escribir nada ni mover el contador), un documento descuadrado, las copias locales y su repetición, cambiar estado y pago de un histórico, la carga de un respaldo (modo `replica`), los privilegios, las invariantes, la idempotencia, la reversión y el control con CHECK. **4 mutaciones detectadas.**
- **Regresión:** `ensayar-i2` 31 OK, `probar-i2` 49/49 y npm 686/686.

**Estado del Frente B (25-11):** [`datos/catalogo-c1/`](../datos/catalogo-c1/notas.md) v3.
- **Campos:** 62 VERIFICADOS. Cada uno tiene la URL oficial, el sha256 de la página descargada y una cita que contiene el valor; Claude repitió la comprobación por su cuenta (62/62).
- **Versiones:** 6 parciales y 9 sin verificar. Las páginas de Ford, Kaufmann, Maxus y Peugeot respondieron 403, y la API de consumovehicular.cl no está permitida en la red.
- **Condiciones de reutilización:** Toyota, Nissan, Chevrolet y Hyundai **prohíben reproducir** su contenido o sus compilaciones salvo para uso personal. Por eso no se publican los archivos de evidencia y **nada entra a la app**.
- **Prueba de datos:** `tests/catalogo-candidatos.test.ts`, 6/6, exige evidencia por cada VERIFICADO. Detecta 4 mutaciones.

**Corrección local P1/P2 de A-83.** El propietario autorizó corregir los dos hallazgos de [la revisión de #53](https://github.com/ratatecuala/calculadora-de-costos-log/issues/53#issuecomment-7143037115). [Autorización registrada en #43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7143060565). Esta decisión sustituye la excepción de importación del Frente A descrita arriba. Toda escritura nueva de precio por las vías ordinarias exige pesos enteros. Las cotizaciones fraccionarias ya presentes en la base conservan su precio y admiten cambios de estado y pago. Las del navegador se conservan allí con aviso de copia pendiente. El ensayo debe verificar los datos y detectar fallos de restauración, reversión y reaplicación. Resultados y validación pendiente en el [README](../README.md#pruebas).

## Cotización manual · confirmación de costos y elección del precio

El propietario [autorizó estas dos mejoras en el PR #34](https://github.com/ratatecuala/calculadora-de-costos-log/pull/34#issuecomment-7146430428), sobre `93a7b9c`. El ejemplo pide permiso si sustituye costos ingresados. Con un cálculo completo puede copiarse el precio sugerido mostrado al campo final, con confirmación si reemplaza otro valor. Cancelar conserva la cotización. Se mantienen las reglas A-81/A-83.

## Decisión del 25-11-2026 (hora de Chile): desarrollo por fases con puertas de aprobación (A-84)

Registrada en [#43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7179239951). **APROBADA.** Las fases, los KPI, la medición y los criterios de cada puerta están en [08 · Fases y puertas](08-hoja-de-ruta.md#fases-y-puertas-de-aprobación-a-84-revisada-por-a-85).

| ID | Decisión | Alcance |
|---|---|---|
| A-84 | El producto avanza por **fases 0–5**. Cada fase se cierra con una **puerta de aprobación** basada en KPIs verificables | Solo documentación y registro. No autoriza funcionalidades, cambios de fórmulas, Supabase, flags, despliegues ni merge |

**Reglas obligatorias:**
1. **Nada se desbloquea solo.** Cumplir los KPI de una fase solo permite **solicitar** el avance. Cada fase, inversión, despliegue o funcionalidad requiere una aprobación expresa del propietario (§8 de AGENTS.md).
2. **Presupuestos máximos y plazos:** **DATO FALTANTE** hasta que el propietario los fije. Ningún agente propone cifras como si estuvieran aprobadas.
3. **Tres tipos de KPI:**
   - **técnicos:** funciona;
   - **comerciales:** se usa y genera valor;
   - **financieros:** conviene seguir invirtiendo.

   Las **simulaciones y las pruebas automatizadas validan el software, no la demanda**: nunca cuentan como KPI comercial.
4. **Comparabilidad (fase 3):** las variaciones de rendimiento se evalúan solo entre mediciones del mismo tipo (urbano, autopista, con o sin carga, con o sin aire acondicionado). No se mezclan.
5. **GPS web (fase 4):** se comprueba con pruebas reales si registra al menos el 95 % del recorrido mientras se usa Waze. Si no es viable, queda como **limitación documentada** y se evalúan alternativas. Nunca se promete el funcionamiento en segundo plano sin evidencia.
6. **Privacidad:** antes de fijar obligaciones o fechas legales, se verifican la vigencia y los requisitos en **fuentes oficiales** (Diario Oficial y BCN). Hasta entonces, la Ley 21.719 y su fecha de vigencia quedan **POR VALIDAR**.
7. **Cada puerta indica:**
   - la evidencia requerida;
   - la inversión que podría autorizarse (DATO FALTANTE);
   - quién decide: **el propietario**.
8. **Datos del Chery:** se permite recolectarlos solo para experimentación. Nunca se publican datos personales (ubicaciones, domicilios ni placa), y el cotizador no se modifica por ellos.

## Decisión del 25-11-2026 (hora de Chile): revisión de A-84, fase 0 en cuatro bloques (A-85)

Registrada en [#43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7181211142). **APROBADA, solo documentación.** El detalle está en [08 · Fases](08-hoja-de-ruta.md#fases-y-puertas-de-aprobación-a-84-revisada-por-a-85).

| ID | Decisión | Alcance |
|---|---|---|
| A-85 | **Posicionamiento como hipótesis por validar:** herramienta de **control económico** para transportistas independientes; el cotizador es una consecuencia de conocer los costos.<br>**Fase 0 en cuatro bloques en paralelo:**<br>• **0A:** MVP funcional;<br>• **0B:** validación económica y calibración;<br>• **0C:** competitividad y posicionamiento;<br>• **0D:** seguridad, experiencia y preparación del piloto.<br>La **puerta 0 exige evidencia económica (0B) y comercial (0C)** | Solo documentación. No programar, no cambiar fórmulas, no migrar, no activar flags, no contratar servicios, no desplegar ni fusionar |

**Reglas obligatorias (se suman a las de A-84):**
1. **No prometer** ganancias reales ni exactitud sin evidencia. El posicionamiento es una hipótesis hasta validarla en 0C y en la fase 1.
2. **Criterios de calibración de #12:** son la propuesta vigente, **pendiente de aprobación**. Ninguna categoría se calibra con datos de otra.
3. **Variación del consumo:**
   - solo entre intervalos de una misma **clase comparable** (recorrido × carga × aire acondicionado);
   - con **n ≥ 3** por clase, informando el coeficiente de variación y la desviación máxima;
   - el tamaño del intervalo se fija por **litros consumidos** frente al error de llenado; 300 km es solo una referencia para autos.
4. **Benchmark de mercado:** independiente, con fuente y fecha. **Nunca** se ajustan costos, fórmulas ni márgenes para igualar a la competencia. Cualquier consulta directa a terceros se aprueba antes, para no engañar.
5. **Instrumentos externos** (TRIP, boletas, cartola TAG, GPX, planillas, OBD-II propio) se usan **antes** de construir módulos. Los datos personales quedan fuera del repositorio.
6. **Valor del GPS:** se mide en pesos (la diferencia de costo frente a TRIP y reloj) y frente al costo de construirlo (A-84, regla 5, sigue vigente).
7. **Reevaluación de la fase 0:**
   - si 0B no cumple en una partida, esa partida se presenta como declarada o parcial;
   - si 0C no respalda el posicionamiento o la competitividad, se revisa la hipótesis antes del piloto;
   - tras un número de iteraciones (DATO FALTANTE), decide el propietario.
8. **Fechas en hora de Chile.** A-84 se corrige al **25-11-2026**: se registró el 26-11 a las 00:54 UTC, que son las 21:54 del 25-11 en Santiago.
9. **Trello:** el tablero privado de la fase 0 coordina visualmente; **GitHub es la fuente de verdad técnica**. Su enlace no se publica en el repositorio.

**Contradicciones con [01 · Alcance](01-alcance.md), resueltas por la decisión más reciente del propietario (AGENTS.md §1.5):**

| docs/01 | Conflicto con A-84 | Resolución |
|---|---|---|
| §5: el lanzamiento incluye «registro manual de viajes reales y cargas de combustible» | A-84 dejaba el cierre del servicio en la fase 2 y las cargas en la fase 3 | **El registro manual se hace en la fase 0B con instrumentos externos y planillas** (evidencia para la puerta 0). El **módulo en la app** (conciliación y cargas) es de las fases 2 y 3, con su puerta |
| §3 y §5: rutas A→B automáticas con Google Routes Essentials como parte obligatoria | 0A es un cotizador con **recorrido manual**; Google Routes sigue apagado (D-10, $0 autorizados) | Las rutas automáticas **no son requisito de la puerta 0**. Se agregan cuando el propietario autorice Google Routes. Mientras tanto, recorrido manual |
| §5: meta del lanzamiento (uso, regreso, documentos) | La fase 1 define KPI concretos | La meta de docs/01 se mide con los KPI de la fase 1; las métricas de docs/05 §5 son su instrumento |
| §6: fuera del primer lanzamiento, «GPS de seguimiento», «aplicación nativa» y «calibración avanzada Pro» | Las fases 4–5 los contemplan | **Sin contradicción:** son fases posteriores al primer lanzamiento, cada una con su puerta |

## Decisión del 26-11-2026 (hora de Chile): especialización y coordinación permanente de agentes (A-86)

Registrada en [#43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7181563285). **APROBADA, regla documental y operativa.**

| ID | Decisión | Alcance |
|---|---|---|
| A-86 | Deep Research investiga; GPT dirige la estrategia, evalúa evidencia, coordina y audita; Claude Code lidera arquitectura e integración; Codex lidera ingeniería, instrumentos, pruebas y validación técnica. El propietario decide y autoriza. | Reglas permanentes en [AGENTS.md §1 y §3](../AGENTS.md#3-responsabilidades-y-sistema-de-trabajo). No autoriza programación, fórmulas, datos, migraciones, flags, APIs, gastos, despliegues ni merge. |

La investigación externa de fondo se centraliza exclusivamente en **ChatGPT Deep Research**, con autorización previa del propietario, sin duplicarla en Claude o Codex. Estos pueden consultar documentación técnica y comprobar citas concretas para ejecutar tareas autorizadas; cualquier nueva investigación sustantiva se deriva a GPT. Un responsable por entregable, revisión independiente de cambios críticos, GitHub como fuente de verdad y Trello privado como coordinación visual. Se conservan A-82, A-84 y A-85 y sus restricciones. Los roles son una distribución operativa, no una comparación universal de modelos. El flujo y la matriz completos están en AGENTS.md, sin duplicarlos aquí.

## Autorización del 26-11-2026 (hora de Chile): preparación técnica de la fase 0 (A-87)

Registrada literalmente en [#43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7181640658). **APROBADA, solo revisión y documentación.**

| ID | Decisión | Alcance |
|---|---|---|
| A-87 | Revisión técnica y documental de siete componentes económicos (combustible #20, TAG #21, C-1, C-2, rendimiento declarado y calibrado, desgaste y gastos fijos, procedencia de los datos), de los pasos pendientes de staging (docs/25) y de la coordinación con Codex. Entrega: matriz, orden recomendado, bloqueos y tareas posibles mientras llegan los informes de Deep Research | Solo documentación pertinente, README y comentarios en los issues existentes. **Prohibido:** investigación externa independiente, inventar datos o coeficientes, código funcional, fórmulas, migraciones, flags, APIs, servicios, despliegues, merge y repetir auditorías resueltas |

Resultado: [26 · Preparación técnica de la fase 0](26-preparacion-fase-0.md) (**PROPUESTO**). También se corrigieron los pasos 1.1 y 1.2 de [25](25-lista-staging-52.md), que no mencionaban las migraciones de I-2 y de precio entero ni el workflow de CI.

## A-89 · Modalidades simplificada y detallada (26-11-2026)

**APROBADA como dirección de producto y documentación**. [Autorización del propietario](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7182307655).

| Modalidad | Alcance |
|---|---|
| Simplificada (predeterminada) | Transportista independiente; combustible, peajes/TAG, recorrido y tiempo, desgaste con evidencia, carga/descarga, ayudantes y otros costos del servicio cuando corresponda; remuneración/ganancia editable. No exige SOAP, permiso, seguro ni gastos anuales. Mostrar exclusiones y faltantes. |
| Detallada (opcional) | Independientes y negocios/empresas; lo anterior más gastos fijos, mantención, depreciación y costos personalizados por km/horas productivas, sin duplicar partidas. |

Un motor, cotización e historial en ambas; conservar datos compartidos al cambiar de modalidad. Diferenciar desembolsos, remuneración objetivo, excedente operativo y utilidad económica integral. Gratuidad durante validación; no autoriza monetización. Objetivo 10 % por alcance comparable de cada modalidad; metodología, muestras y umbrales específicos pendientes en #12. No exigir llenados completos en uso normal. No autoriza fórmulas, código, migraciones, flags, APIs, gastos, despliegues o merge. Revisar entregables actuales antes de asignar implementación. A-88 se conserva según su autorización registrada en #43.
