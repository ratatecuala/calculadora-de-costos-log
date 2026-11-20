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

Las decisiones **D-1 a D-10** están en #43, cada una con su estado: pendiente de aprobación, dependiente de una investigación o no autorizada. **Ninguna está aprobada.** La recomendación de ChatGPT no equivale a aprobación. **No autoriza** programar, cambiar fórmulas, crear o ejecutar migraciones, importar datos ni activar servicios.

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

**Tarea independiente:** [#52](https://github.com/ratatecuala/calculadora-de-costos-log/issues/52), impedir el `INSERT` directo en `jobs` que omite la numeración automática. **Debe resolverse antes de autorizar M3/M4 en staging** (puerta P3).

**Implementación de A-47 (decisiones menores, revisables):**
- Un número local **libre** se conserva tal cual, así que la secuencia puede saltar hasta ese número.
- Los números de cotizaciones borradas **no se reutilizan**.
- El dueño solo puede modificar el **estado** y el **pago** de sus trabajos.
