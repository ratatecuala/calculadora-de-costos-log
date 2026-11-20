# 19 · Plan del cotizador ampliado: vehículo, carga, recursos, recorrido y precio

**Fecha:** 20-11-2026 · **Estado:** **PROPUESTA para aprobación del propietario.** No autoriza programar, cambiar fórmulas, crear migraciones ni importar datos.
**Base:** PR #34 (cabeza `6bd72b5`), motor `motor-1.0.1`, esquema Supabase de 3 migraciones, decisiones hasta A-54.
**Encargos de investigación:** [20 · Encargos de Deep Research](20-encargos-deep-research-cotizador.md) (catálogo de vehículos, costo según carga) y [18](18-encargo-deep-research-iva.md) (IVA, en curso).

## 0. Resumen

Objetivo: pasar de una calculadora de traslado A → B a un **cotizador** que considere **vehículo, carga, recursos, recorrido y precio**. Se propone avanzar en **7 etapas**, sin romper lo que ya funciona:

| Etapa | Contenido | Prioridad | Complejidad | Depende de |
|---|---|---|---|---|
| **0** | Decisiones del propietario e informes de Deep Research (catálogo, carga, IVA) | P0 | S (Claude) + investigación externa | — |
| **1** | Modelo de datos y compatibilidad: diseño de catálogo, «Mis vehículos» ampliado, inventario y snapshot versionado | P0 | M | 0 |
| **2** | Catálogo inicial piloto (solo con fuentes verificables) y «Mis vehículos» ampliado | P1 | L | 1 y el informe del catálogo |
| **3** | Inventario de carga y recursos, **sin cambiar el precio**: informativo, verificación de capacidad y tiempos declarados | P1 | L | 1 |
| **4** | Fórmulas económicas según carga (solo las que apruebes), con casos dorados nuevos | P1 | L | 3, el informe de carga y tu aprobación |
| **5** | IVA en dos opciones («Sin IVA» / «Agregar IVA 19 %») | P1 | M | Informe de IVA (#16) y tu aprobación |
| **6** | Rutas reales con Google Routes Essentials | P1 | M | #9, #19 y #15, y tu autorización de facturación |

Complejidad relativa: **S** = horas a 1 día · **M** = 2 a 4 días · **L** = 1 a 2 semanas · **XL** = más. Las etapas 5 y 6 son independientes de la 2 a la 4 y pueden avanzar en paralelo.

## 1. Auditoría: qué existe y qué falta

| Área | Existe hoy (PR #34) | Falta |
|---|---|---|
| Vehículo | «Mi vehículo»: nombre, tipo (camioneta, furgón, camión liviano), combustible, km/L y desgaste $/km; varios por cuenta; predeterminado; copia en cada cotización | Catálogo global; marca, modelo, año, versión, motor; carga útil, peso vacío, volumen y dimensiones; fuente y confianza; **camión mediano** como tipo; rendimiento vacío y cargado |
| Carga | Minutos de «carga y descarga» declarados, ayudantes con pago por servicio, «otros gastos» y recargos en $ | Inventario de objetos (tipo, cantidad, peso, dimensiones, volumen); fragilidad y manipulación; pisos, ascensor, escaleras y accesibilidad; embalaje y equipamiento |
| Motor | Combustible = km / km/L × precio; desgaste = km × $/km; gastos fijos y meta por hora; margen sobre el precio, P = C/(1−m); cotas con datos faltantes; validación de entradas (A-50) | Consumo distinto cargado y vacío por tramo; tiempo de manipulación según la carga; mano de obra por hora; varios viajes si la carga no cabe |
| Recorrido | Base → A → B → regreso opcionales; tramos con km y minutos; corrección manual; procedencia «simulado / declarado / mixto»; contador y presupuesto de consultas | **Google Routes real** (hoy simulado); saber qué tramos van cargados |
| Precio e IVA | Precio elegido; «Precio total» y leyenda «no es factura ni boleta» (A-51, transitorio) | Opción «Agregar IVA (19 %)» con base, IVA y total; guardarla en el historial, PDF, enlace y WhatsApp |
| Datos | `vehicles`, `jobs` (con `internal` jsonb ≤ 16 KB), `client_quotes` (lista blanca), RLS, numeración A-47 | Tabla de catálogo global de solo lectura; columnas nuevas opcionales; versión de esquema en el snapshot (#31) |

## 2. Catálogo de vehículos (primera etapa)

### 2.1 Alcance

- **Ahora:** camionetas de trabajo (en Chile, sobre todo *pick-up* y utilitarias), furgones de carga, y camiones livianos y medianos usados en fletes, mudanzas y traslados A → B en Santiago.
- **Después, sin desarrollar ahora:** camiones pesados, tractocamiones, automóviles, motocicletas y vehículos especializados.
- **Tipos propuestos:** `camioneta`, `furgon`, `camionLiviano` (los tres actuales) y uno nuevo, `camionMediano`. El límite entre liviano y mediano se fija con una fuente: el peso bruto vehicular según la clasificación del MTT o del fabricante. Ver el encargo C-1.

### 2.2 Modelos candidatos (NO es un ranking)

Lista de trabajo para el piloto, sin afirmar cuáles son los más usados en Santiago. Incluye los que mencionaste y otros que circulan en el segmento comercial chileno. **Cada uno debe confirmarse** (presencia en Chile, versiones vendidas, ficha técnica) con el encargo C-1 antes de cargarlo.

| Segmento | Candidatos (marca y modelo) |
|---|---|
| Camioneta de trabajo / *pick-up* | Toyota Hilux, Mitsubishi L200, Nissan Navara, Ford Ranger, Chevrolet D-Max, Maxus T60, JAC T6/T8, Great Wall (Wingle/Poer) |
| Utilitario pequeño | Peugeot Partner, Citroën Berlingo, Renault Kangoo, Fiat Fiorino, Chevrolet N300 Max |
| Furgón mediano y grande | Peugeot Boxer, Citroën Jumper, Fiat Ducato, Mercedes-Benz Sprinter, Ford Transit, Maxus Deliver 9 / V80, Hyundai H-1 / Staria Cargo, Toyota Hiace, Renault Master |
| Camión liviano | Hyundai Porter, Kia Frontier, Chevrolet N400, JAC (línea liviana), Foton (Aumark / Midi), JMC, Maxus EV / T90 *(confirmar)* |
| Camión liviano a mediano | Hyundai HD65 / HD78, Isuzu / Chevrolet NLR, NMR, NPR, NQR, Mitsubishi Fuso Canter, Hino serie 300, Foton Aumark de mayor tonelaje |

**Limitación:** no conozco estadísticas públicas de flota activa de fletes **por modelo y comuna**. Hay estadísticas de ventas por marca y segmento (gremio automotriz) y de parque por tipo y región (INE), pero no del uso en fletes. Formas de validarlo, en el encargo C-1:

1. Ventas por modelo de comerciales livianos y camiones (informes mensuales del gremio, si son públicos y reutilizables).
2. Parque en circulación por tipo, marca y región (INE; Registro Nacional de Vehículos Motorizados por solicitud de transparencia, Ley 20.285).
3. **Encuesta propia** en la beta: «¿qué vehículo usas?», con texto libre que se normaliza contra el catálogo. Es la fuente más directa de los transportistas reales.
4. Conteo de los vehículos «no incluidos en el catálogo» que registran los usuarios (§2.4). Así el catálogo crece por demanda real.

### 2.3 Datos de cada entrada del catálogo

| Campo | Nota |
|---|---|
| Marca, modelo, versión, años (desde/hasta), motorización, transmisión | Texto normalizado |
| Combustible | gasolina, diésel, eléctrico, híbrido o GNC. Los no líquidos **no** usan la fórmula de litros (docs/01) |
| Rendimiento de referencia | Valor, unidad, **ciclo** (WLTP/WLTC o NEDC), urbano, carretera o mixto. **Referencial, no calibrado**; el usuario lo corrige |
| Peso vacío, peso bruto vehicular, **carga útil** | kg |
| Volumen de carga | m³ |
| Dimensiones del espacio de carga | Largo, ancho, alto y apertura de puertas (mm), si existen |
| **Fuente por campo** | URL o documento, tipo (ficha del fabricante o importador, homologación, consumovehicular.cl, otro), fecha de consulta y **confianza** (alta, media o baja) |
| `dataVersion` del catálogo | Cambia con cada actualización |

**Regla:** sin fuente verificable, el campo queda **vacío** («sin dato»), nunca con un valor inventado. Es lo mismo que exige el issue #22.

### 2.4 Catálogo global frente a «Mis vehículos»

- **Catálogo global:** de solo lectura para todos y mantenido por el proyecto. Nunca lo modifica un usuario.
- **Mis vehículos:** el transportista puede:
  - **elegir del catálogo**: se copian los datos y puede ajustar cada uno («ajustado por ti»);
  - **registrar uno que no está** (marca y modelo libres);
  - **conservar los actuales**, que siguen funcionando igual (compatibilidad, §8).
- El vehículo guarda `catalog_id` (opcional) y sus **propios valores**. Si el catálogo cambia, «Mis vehículos» **no** se modifica sin que el usuario lo acepte. Solo se ofrece «hay datos nuevos del catálogo».

## 3. Inventario de carga y recursos

### 3.1 Qué se declara

| Elemento | Datos (todos opcionales, salvo la descripción) |
|---|---|
| Objeto o grupo | Tipo (lista abierta: refrigerador, lavadora, sofá, cama, cajas, otro), descripción, **cantidad** |
| Medidas | Peso por unidad (kg) y dimensiones (cm), si se conocen; **volumen** calculado o declarado |
| Manipulación | Frágil (sí/no); dificultad (normal, pesado, voluminoso, requiere 2 o más personas) |
| Origen y destino | Piso, **ascensor** (sí, no o no cabe), escaleras, distancia del estacionamiento a la puerta, restricciones de acceso |
| Recursos | Ayudantes, **embalaje** (materiales), **equipamiento** (carro, correas, mantas, rampa) y tiempo estimado por el transportista |

### 3.2 Principios de interfaz (PC y teléfono)

- **Dos niveles:** «rápido» (1 objeto o «mudanza pequeña, mediana o grande» como descripción) y «detallado» (lista de objetos).
- Plantillas de objetos **con nombre y sin valores precargados**. Los pesos y volúmenes de referencia solo se agregarán con fuente (encargo C-2). Hasta entonces los escribe el usuario.
- **Nada bloquea la cotización:** un dato desconocido queda como faltante. Si afecta al costo, el resultado se marca **parcial**, igual que hoy (null ≠ 0).
- **Teléfono:** lista en tarjetas con «+ objeto» y campos con teclado numérico. **PC:** tabla editable en la columna del formulario. Mismas funciones (A-49).
- El cliente ve en la cotización solo una **descripción** del servicio («Traslado de refrigerador, 3.er piso sin ascensor»), nunca pesos internos ni costos.

### 3.3 Verificación de capacidad

Con los datos conocidos se compara peso total con carga útil, y volumen total con volumen de carga. Si se excede, la app **avisa** y sugiere más de un viaje u otro vehículo. **No** cambia el precio por sí sola (eso es la etapa 4) y **nunca** recomienda sobrecargar.

## 4. Cálculo económico según carga: fórmulas candidatas (sin aplicar)

**Regla:** se mantienen las fórmulas actuales (docs/03, casos dorados G1 a G10) hasta tu aprobación expresa. **Ningún recargo porcentual arbitrario.** Cada fórmula candidata usa datos que declara el transportista o datos con fuente. Si faltan, se vuelve a la fórmula actual.

| Partida | Hoy | Candidata | Fundamento | Datos necesarios | Límites |
|---|---|---|---|---|---|
| **Combustible por tramo** | km_total / km/L × precio | Σ tramos: km_t / R(e_t) × precio, con e_t ∈ {vacío, cargado}. Tramos base → A y B → base, vacío; A → B, cargado | El consumo crece con la masa transportada (resistencia a la rodadura e inercia) | R_vacío y R_cargado **declarados** por el transportista, o con fuente (C-2) | Sin los dos valores se usa R único (fórmula actual) |
| **Interpolación por fracción de carga** (opcional) | — | 1/R(f) = 1/R_vacío + f × (1/R_lleno − 1/R_vacío), con f = peso / carga útil | Consumo por km aproximadamente lineal en la masa | R_vacío, R_lleno, peso de la carga y carga útil | Requiere validación con datos (C-2); sin ella **no** se activa |
| **Desgaste** | km × $/km | Igual, o $/km cargado y vacío si el usuario los declara | El desgaste de neumáticos y frenos aumenta con la carga | $/km por estado, declarados | Sin datos: fórmula actual |
| **Tiempo de conducción** | Minutos de la ruta | Igual (rutas reales en la etapa 6) | — | — | Sin factor de velocidad por carga (#22: no sin calibración) |
| **Tiempo de manipulación** | Minutos declarados | t = Σ objetos q_i × (t_obj,i + t_piso × pisos_sin_ascensor_i) + t_fijo | La carga y la descarga dependen de unidades, dificultad y pisos | t_obj por tipo de dificultad, t_piso y t_fijo **declarados por el transportista** (su estándar) o con fuente (C-2) | Sin datos: minutos declarados (actual) |
| **Mano de obra** | Ayudantes × pago por servicio | Opción: ayudantes × $/h × (t_manipulación + t_conducción si viajan) | Es el pago habitual por hora o por servicio | Modalidad y tarifa **declaradas** | La modalidad la decides tú (D-6) |
| **Varios viajes** | — | n = máx(⌈peso / carga útil⌉, ⌈volumen / (vol_útil × f_llenado)⌉); los tramos cargados se repiten n veces | Si no cabe, hay que ir de nuevo | Carga útil, volumen y f_llenado (fuente o decisión) | Solo con datos completos; si no, solo aviso |
| **Gastos adicionales** | «Otros gastos» y recargos en $ | Líneas detalladas: embalaje, arriendo de equipo, estacionamiento y peajes, en $ y declaradas | Son desembolsos reales | Montos declarados | Sin porcentajes automáticos |

Cada fórmula que apruebes se implementa con: nuevos **casos dorados** recalculados en forma independiente (como `scripts/verificar-casos-dorados.mjs`), nueva `engineVersion`, y pruebas de que **sin los datos nuevos el resultado es idéntico al actual**.

## 5. IVA opcional en la cotización (diseño, sin implementar)

**En espera del informe de GPT Deep Research (#16, docs/18).** El diseño definitivo se contrasta con sus conclusiones.

- **Control en la pantalla del precio**, elegido por el transportista para cada cotización (puede recordar la última opción):
  - **Sin IVA:** no se agrega ningún monto. El documento muestra «Total» y la leyenda fija.
  - **Agregar IVA (19 %):** muestra **precio base**, **IVA 19 %** y **total**. IVA = redondeo al peso de base × 0,19 (regla por confirmar en el informe).
- **Textos mínimos propuestos** (requieren tu aprobación; son textos legales, AGENTS §5):
  - En **todo** documento, PDF, enlace y WhatsApp: «Esta cotización no es factura ni boleta.» (A-51).
  - Junto al control, **solo para el transportista**: «Elegir "Sin IVA" no declara que tu servicio esté exento. Si emites factura o boleta con IVA, considéralo en tu precio o elige "Agregar IVA". Esta app no emite documentos tributarios ni declara impuestos.»
  - Con «Agregar IVA», en el documento: «Precio base», «IVA (19 %)» y «Total».
- **Persistencia:** `tax_mode` (`sin_iva` o `agregar_iva`), `tax_rate` y montos en la cotización emitida. El historial, el PDF, el enlace público y WhatsApp lo reflejan. Una cotización emitida **no cambia** si después cambia la regla (A-47).
- **Relación con trabajo previo:** reemplaza la «opción B» de docs/16 (perfil tributario + tipo de cliente) por una elección explícita del transportista, más simple. Las dos líneas se contrastan con el informe (pregunta adicional en docs/20 §3).

## 6. Rutas reales (Google Routes Essentials)

Se reutiliza la épica **#3** y las decisiones A-31 a A-43:
- **Se conserva:**
  - base y regreso opcionales;
  - corrección manual por tramo;
  - procedencia **real / declarado / simulado / mixto**;
  - contador atómico con reserva, cupo mensual de 7.000 y corte en 8.000, 3 comparaciones al día y 10 al mes;
  - interruptor en caliente.
- **Pasos:**
  1. decisión de facturación y topes (#9);
  2. experimento de direcciones (#19);
  3. términos de uso: qué se puede guardar (#15);
  4. clave restringida como secreto del Worker;
  5. `ROUTES_PROVIDER=google` **solo en staging** y con cupo bajo;
  6. pruebas reales;
  7. e2e.
- **Nuevo:** marcar qué tramos van **cargados** (A → B) para el combustible por estado (etapa 4).
- **Bloqueado** hasta tu autorización expresa de facturación y activación. No se activa nada.

## 7. Arquitectura y cambios propuestos a Supabase (sin migraciones reales)

Todo es **aditivo y no destructivo**: columnas nuevas opcionales y tablas nuevas. No se renombra ni se borra nada.

| Objeto | Propuesta | RLS y permisos |
|---|---|---|
| `vehicle_catalog` (nueva) | Una fila por marca, modelo, versión y rango de años. Datos técnicos en columnas tipadas; `sources jsonb` con fuente, fecha y confianza **por campo**; `data_version` | `SELECT` para `anon` y `authenticated`; **sin** `INSERT/UPDATE/DELETE` por la API. Se carga con migraciones versionadas revisadas, no importaciones masivas |
| `vehicles` (existente) | Nuevas columnas opcionales: `catalog_id` (FK a `vehicle_catalog`, `on delete set null`), `make`, `model`, `model_year`, `version`, `payload_kg`, `curb_weight_kg`, `cargo_volume_m3`, dimensiones, `km_per_l_loaded`, `wear_per_km_loaded`. Se amplía el `check` de `type` con `camionMediano` | RLS por dueño, igual que hoy |
| `jobs.internal` (existente) | Snapshot ampliado: `schemaVersion`, `vehicle` (con `catalogId` y `catalogDataVersion`), `cargo` (resumen y lista), `resources`, `formulaVersion`. Si el inventario detallado supera el límite de 16 KB, guardarlo en una tabla `job_cargo_items` (decisión D-4) | Sin cambios: solo el dueño |
| `client_quotes` (existente) | Columnas opcionales `tax_mode`, `tax_rate` y `service_summary` (texto para el cliente). Se mantiene `client_quotes_total_check` | Sigue sin `UPDATE`, documentos inalterables (A-47) |
| `get_public_quote` | Devuelve también `tax_mode` y la base, si existen | Lista blanca, ampliada con prueba |

## 8. Compatibilidad e impacto sobre cotizaciones históricas

- **Nunca se recalculan ni se reescriben** las cotizaciones emitidas. Se muestran con los datos guardados (A-47).
- `internal` sin `schemaVersion` se lee como **versión 1** (la actual). La app sabe mostrar ambas.
- `tax_mode` nulo = cotización histórica: se muestra como hoy, con «Precio total» y la leyenda (A-51).
- Vehículos existentes sin `catalog_id`: siguen funcionando igual; se ofrece «vincular a un modelo del catálogo», opcional.
- El modo **sin cuenta** (historial local) recibe el mismo esquema versionado. La copia a la cuenta convierte los datos de la versión 1 sin pérdida.
- **Pruebas obligatorias en cada etapa:**
  - los 64 valores de los casos dorados actuales siguen iguales;
  - una cotización histórica se ve igual antes y después;
  - la migración se ensaya en local por la ruta B de docs/17 antes de aplicarla en staging.

## 9. Paridad teléfono y PC (A-49)

Cada etapa se acepta solo si:
1. pasa el e2e en **Pixel 7, iPhone 13, 1366 y 1440** (`scripts/e2e-staging-anonimo.mjs` y `e2e-staging.mjs`, ampliados);
2. no hay desplazamiento horizontal y los controles miden 44 px o más;
3. el inventario y el catálogo se pueden usar **solo con teclado** en PC;
4. las mismas funciones están en ambos formatos.

## 10. Fuentes necesarias para poblar el catálogo

| Dato | Fuentes candidatas (por verificar en C-1) |
|---|---|
| Modelos y versiones vendidos en Chile | Sitios oficiales de las marcas o importadores en Chile; informes de ventas del gremio automotriz |
| Rendimiento homologado (livianos y medianos) | **consumovehicular.cl** (Ministerio de Energía; cambio a WLTC desde 2025, issue #22); fichas de homologación |
| Peso vacío, peso bruto, carga útil, volumen y dimensiones | Fichas técnicas oficiales del fabricante o importador; certificados de homologación del MTT (3CV) |
| Camiones: rendimiento | Sin homologación pública conocida: **lo declara el usuario**; con fuente solo si C-1 la encuentra |
| Presencia en flota (Santiago) | INE (parque vehicular); Registro de Vehículos Motorizados (solicitud de transparencia); encuesta propia en la beta |

En todos los casos se verifican **licencia y condiciones de reutilización** antes de copiar datos.

## 11. Riesgos

- **Datos técnicos sin fuente o contradictorios** entre fuentes: se usa confianza por campo y se muestra la fuente; ante la duda, «sin dato».
- **Falsa precisión:** fórmulas por carga con coeficientes sin calibrar. Solo se usan datos declarados o con fuente; sin ellos, la fórmula actual.
- **Complejidad de la interfaz** en el teléfono: el nivel «rápido» es obligatorio y el detallado, opcional.
- **Tamaño de `internal`** con inventarios grandes (D-4).
- **IVA:** riesgo de confundir el presupuesto con un documento tributario. Se mitiga con la leyenda fija y la advertencia al transportista; el diseño espera el informe.
- **Rutas:** costos de Google. Ya hay contador y topes, pero sigue bloqueado hasta autorizar facturación (#9).
- **Cambios del catálogo** que alteren cotizaciones: no pasa, porque se usa un snapshot por cotización.

## 12. Decisiones que requiere el propietario

| ID | Decisión | Recomendación |
|---|---|---|
| D-1 | Aprobar este plan, sus 7 etapas y el orden | Aprobar; etapas 1 a 3 primero; 5 y 6 en paralelo cuando haya informe o autorización |
| D-2 | Segmentos iniciales y nuevo tipo `camionMediano`, con su límite de peso bruto según fuente | Aprobar 4 tipos |
| D-3 | Lanzar los encargos C-1 (catálogo y mercado) y C-2 (carga y costos) en GPT Deep Research | Sí, C-1 primero |
| D-4 | Inventario detallado en `internal` (jsonb) o en tabla `job_cargo_items` | Tabla si se esperan mudanzas con muchas líneas |
| D-5 | Fórmulas candidatas de §4 que se implementarán (una por una), con casos dorados | Decidir después del informe C-2 |
| D-6 | Mano de obra: por servicio (hoy) o por hora | Ofrecer ambas, elige el transportista |
| D-7 | Textos de IVA de §5 y elección explícita frente a la «opción B» de docs/16 | Decidir con el informe de #16 |
| D-8 | Autorizar migraciones aditivas en **staging** cuando empiece la etapa 1 | Una autorización por migración |
| D-9 | Piloto del catálogo: 10 a 15 modelos con fuentes completas antes de ampliar | Sí |
| D-10 | Autorizar facturación de Google Cloud y activar Routes en staging (#9) | Cuando decidas; no bloquea las etapas 1 a 4 |

## 13. Organización en GitHub

- **Épica nueva:** «Cotizador ampliado», con un sub-issue por etapa o componente.
- **Issues existentes reutilizados (enlazados, no duplicados):**
  - #22 (catálogo: pasa de «futuro» a esta épica);
  - #16, #37 y docs/18 (IVA);
  - #3, #9, #15 y #19 (rutas);
  - #31 (versionado y reproducibilidad);
  - #20 y #21 (combustible y peajes, fuera de esta épica);
  - #5 (cuentas y vehículos).

| Etapa | Issue | Prioridad | Complejidad | Bloqueado por |
|---|---|---|---|---|
| Épica | [#42](https://github.com/ratatecuala/calculadora-de-costos-log/issues/42) | P1 | — | — |
| 0 · Decisiones | [#43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43) D-1 a D-10 | P0 | S | — |
| 0 · Investigación | [#22](https://github.com/ratatecuala/calculadora-de-costos-log/issues/22) Catálogo (C-1) | P1 | S + investigación | Ejecución del encargo |
| 0 · Investigación | [#44](https://github.com/ratatecuala/calculadora-de-costos-log/issues/44) Costo según carga (C-2) | P1 | S + investigación | Ejecución del encargo |
| 1 | [#45](https://github.com/ratatecuala/calculadora-de-costos-log/issues/45) Modelo de datos y compatibilidad | P0 | M | #43 |
| 2 | [#46](https://github.com/ratatecuala/calculadora-de-costos-log/issues/46) Catálogo piloto y «Mis vehículos» | P1 | L | #45, #22 |
| 3 | [#47](https://github.com/ratatecuala/calculadora-de-costos-log/issues/47) Inventario y capacidad | P1 | L | #45 |
| 4 | [#48](https://github.com/ratatecuala/calculadora-de-costos-log/issues/48) Fórmulas según carga | P1 | L | #47, #44, D-5 |
| 5 | [#37](https://github.com/ratatecuala/calculadora-de-costos-log/issues/37) IVA en dos opciones | P1 | M | #16, D-7 |
| 6 | [#49](https://github.com/ratatecuala/calculadora-de-costos-log/issues/49) Google Routes en staging | P1 | M | #9, #19, #15 |
| Transversal | [#50](https://github.com/ratatecuala/calculadora-de-costos-log/issues/50) Paridad teléfono/PC y e2e | P1 | M | Cada etapa |

**Orden recomendado:** #43 → #22 y #44 en paralelo → #45 → #47 y #46 → #48. #37 y #49 avanzan en paralelo cuando estén el informe o la autorización.
