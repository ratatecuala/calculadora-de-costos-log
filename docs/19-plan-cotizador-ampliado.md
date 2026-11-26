# 19 · Plan del cotizador ampliado: vehículo, carga, recursos, recorrido y precio

**Versión 2 · 20-11-2026.** Corrige la versión 1 (`da62659`) según la [revisión de ChatGPT](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7039891866) y las prioridades del propietario.
**Estado al publicar (histórico):** **PROPUESTA.** Ninguna decisión estaba aprobada (§12). No autorizaba programar, cambiar fórmulas, crear o ejecutar migraciones, importar datos ni activar servicios.
**Estado vigente (20-11-2026, hasta `2f8e112`):** la **planificación** está aprobada (D-1, D-2, D-3, D-6, D-8 y D-9 → A-55 a A-60; D-4 → A-61). Inventario (#47) y recursos (#51) avanzaron por sus puertas: fase 0 cerrada (A-63), fase 1 cerrada técnicamente (A-66) e integración I-1 + I-1b cerrada técnicamente detrás de una flag apagada (A-68; [22 §14](22-diseno-integracion-cotizador.md)). Siguen pendientes D-2b, D-5, D-7 y D-10; C-1 y C-2 esperan su ejecución en GPT Deep Research. Catálogo (#46), costo según carga (#48), IVA (#37) y rutas reales (#49) **no han comenzado**.
**Base:** PR #34, motor `motor-1.0.1`, esquema Supabase de 3 migraciones, decisiones hasta A-54.
**Investigación:** [20 · Encargos C-1 y C-2](20-encargos-deep-research-cotizador.md). El IVA tiene su propia investigación en curso ([18](18-encargo-deep-research-iva.md), #16) y no se duplica.

## 0. Resumen

### 0.1 Prioridad funcional del propietario (orden de desarrollo)

| # | Función | Issue | Complejidad | Se puede empezar cuando… |
|---|---|---|---|---|
| — | **Diseño de datos** (base técnica de todo lo demás; solo diseño) | [#45](https://github.com/ratatecuala/calculadora-de-costos-log/issues/45) | M | Apruebes el plan (D-1) |
| 1 | **Inventario:** objetos, cantidades, dimensiones y peso | [#47](https://github.com/ratatecuala/calculadora-de-costos-log/issues/47) | L | Esté el diseño #45 |
| 2 | **Recursos:** ayudantes (por hora o por servicio), pisos, ascensores y tiempo de carga y descarga | [#51](https://github.com/ratatecuala/calculadora-de-costos-log/issues/51) | M | Esté el diseño #45 (en paralelo con 1) |
| 3 | **Catálogo piloto** de vehículos comerciales y vínculo con «Mis vehículos» | [#46](https://github.com/ratatecuala/calculadora-de-costos-log/issues/46) | L | Estén #45 y el informe C-1 (#22) |
| 4 | **Cálculo según la carga**, solo con fórmulas aprobadas | [#48](https://github.com/ratatecuala/calculadora-de-costos-log/issues/48) | L | Estén 1 y 2, el informe C-2 (#44) y tu aprobación de cada fórmula |
| 5 | **IVA opcional**: «Sin IVA» / «Agregar IVA (19 %)» | [#37](https://github.com/ratatecuala/calculadora-de-costos-log/issues/37) | M | Esté el informe tributario (#16) y lo apruebes |
| 6 | **Google Routes real** | [#49](https://github.com/ratatecuala/calculadora-de-costos-log/issues/49) | M | Autorices facturación y activación (#9) |
| ∀ | Paridad teléfono/PC y e2e de cada entrega | [#50](https://github.com/ratatecuala/calculadora-de-costos-log/issues/50) | M | Cada entrega |

Complejidad relativa: **S** = horas a 1 día · **M** = 2 a 4 días · **L** = 1 a 2 semanas.

### 0.2 Dependencias técnicas y carriles paralelos

El orden de desarrollo (0.1) no es una cadena estricta. Cuando una función está desbloqueada, avanza en su propio carril:

```text
Carril D (datos):        #45 diseño ──┬──────────────┬──────────────┐
                                      ▼              ▼              ▼
Carril 1 (inventario):           #47 inventario  Carril 2: #51  Carril 3: #46 catálogo ◄── #22 informe C-1
                                      │          recursos            │
                                      └──────┬───────┘               │
                                             ▼                       │
Carril 4 (costo por carga):  #44 informe C-2 ──► #48 fórmulas aprobadas ◄┘ (usa carga útil y volumen si existen)
Carril 5 (IVA):              #16 informe ──► D-7 ──► #37
Carril 6 (rutas):            #9 autorización + #19 + #15 ──► #49
Transversal:                 #50 pruebas en teléfono y PC en cada carril
```

- **Primero en el tiempo:** el **diseño** de datos #45. No requiere migraciones, porque solo diseña. Las migraciones se ejecutan por separado y con autorización.
- **En paralelo tras #45:** inventario (#47) y recursos (#51). No dependen del catálogo: funcionan con datos que declara el usuario.
- **El catálogo (#46) no bloquea** el inventario ni los recursos. Si un vehículo no tiene carga útil o volumen, la verificación de capacidad simplemente no se hace.
- **Carriles 5 y 6:** independientes del resto. Avanzan solo cuando lleguen el informe o la autorización.
- **Investigaciones:** C-1 y C-2 pueden ejecutarse ya, en paralelo con el informe de IVA en curso.

## 1. Auditoría: qué existe y qué falta

| Área | Existe hoy (PR #34) | Falta |
|---|---|---|
| Vehículo | «Mi vehículo»: nombre, tipo (camioneta, furgón, camión liviano), combustible, km/L y desgaste $/km; varios por cuenta; predeterminado; copia en cada cotización | Catálogo global; marca, modelo, año, versión, motor; carga útil, peso vacío, volumen y dimensiones; fuente y confianza; tipo «camión mediano» (límite por verificar) |
| Carga | Minutos de «carga y descarga» declarados, ayudantes con pago por servicio, «otros gastos» y recargos en $ | Inventario de objetos (tipo, cantidad, peso, dimensiones, volumen); fragilidad y manipulación |
| Recursos | Ayudantes (cantidad × pago por servicio) | Modalidad por hora con horas pagadas explícitas; pisos, ascensor, escaleras y acceso; embalaje y equipamiento |
| Motor | Combustible = km / km/L × precio; desgaste = km × $/km; gastos fijos y meta por hora; margen sobre el precio, P = C/(1−m); cotas con datos faltantes; validación de entradas (A-50) | Solo lo que se apruebe después de C-2 (§5) |
| Recorrido | Base → A → B → regreso opcionales; tramos con km y minutos; corrección manual; procedencia simulado / declarado / mixto; contador y presupuesto | Google Routes real (hoy simulado, rotulado como tal) |
| Precio e IVA | Precio elegido; «Precio total» y leyenda «no es factura ni boleta» (A-51, transitorio) | «Sin IVA» / «Agregar IVA (19 %)», tras el informe |
| Datos | `vehicles`, `jobs` (`internal` jsonb ≤ 16 KB), `client_quotes` (lista blanca, inalterable), RLS, numeración A-47 | Catálogo global de solo lectura; columnas opcionales; versión de esquema en el snapshot (#31) |

## 2. Inventario de carga (prioridad 1)

### 2.1 Qué se declara

| Elemento | Datos (todos opcionales, salvo la descripción) |
|---|---|
| Objeto o grupo | Tipo (lista abierta: refrigerador, lavadora, sofá, cama, cajas, otro), descripción, **cantidad** |
| Medidas | Peso por unidad (kg) y dimensiones (cm), si se conocen; **volumen** calculado (largo × ancho × alto) o declarado |
| Manipulación | Frágil (sí/no); dificultad (normal, pesado, voluminoso, requiere 2 o más personas) |

### 2.2 Principios

- **Dos niveles:** «rápido» (un objeto o una descripción libre, por ejemplo «mudanza de departamento de 2 dormitorios») y «detallado» (lista de objetos).
- **Plantillas de objetos con nombre y sin valores precargados.** Los pesos y volúmenes de referencia solo se agregan con fuente (informe C-2). Hasta entonces los escribe el usuario.
- **Nada bloquea la cotización.** Un dato desconocido queda como faltante (null ≠ 0).
- **Sin efecto en el precio** en esta entrega: el inventario informa y alimenta la verificación de capacidad (§2.3). El efecto económico llega solo con fórmulas aprobadas (§5).
- **Teléfono:** tarjetas con «+ objeto» y teclado numérico. **PC:** tabla editable. Mismas funciones (A-49).
- **Cliente:** ve solo una descripción del servicio, nunca pesos internos ni costos.

### 2.3 Verificación de capacidad: estimación, no garantía

- Con los datos conocidos se compara el peso total con la carga útil y el volumen total con el volumen de carga del vehículo.
- Resultado: **aviso**, por ejemplo «la carga declarada supera la carga útil registrada» o «podrían requerirse al menos N viajes».
- **Es una cota inferior, no una garantía:**
  - N = máx(⌈peso / carga útil⌉, ⌈volumen / volumen de carga⌉) no considera la forma de los objetos, cómo se acomodan ni la apertura de puertas;
  - un resultado de 1 viaje **no** asegura que todo quepa.
- **No** emite una tarifa de varios viajes. **Nunca** recomienda sobrecargar.
- Sin carga útil o volumen del vehículo, la verificación no se hace y se informa por qué.

## 3. Recursos necesarios (prioridad 2)

| Recurso | Datos |
|---|---|
| Accesibilidad en origen y destino | Piso, ascensor (sí, no o el objeto no cabe), escaleras, distancia de acarreo y restricciones de acceso o estacionamiento |
| Ayudantes | Cantidad y, **para cada ayudante, una sola modalidad**: por servicio (monto fijo) o por hora (tarifa × horas pagadas) |
| Horas pagadas (modalidad por hora) | El transportista marca qué paga: solo manipulación (carga y descarga) o manipulación más traslado si el ayudante viaja |
| Tiempo de carga y descarga | Minutos **declarados** por origen y destino. Pisos y ascensor se muestran como referencia, **sin coeficientes automáticos** |
| Embalaje y equipamiento | Líneas de gasto declaradas en $ (materiales, arriendo de carro, correas, mantas, rampa) |

**Regla contra la doble contabilización:**
- El **tiempo del transportista** (conducción + carga y descarga) alimenta gastos fijos y meta por hora, igual que hoy.
- Los **ayudantes** son un desembolso aparte: por servicio **o** por hora, nunca ambos para el mismo ayudante.
- Las horas de un ayudante no se suman al tiempo del transportista.
- Con la modalidad por servicio y los mismos montos, el resultado es **idéntico al actual**.

## 4. Catálogo de vehículos (prioridad 3)

### 4.1 Alcance

- **Ahora:** camionetas (*pick-up* y utilitarias), furgones, y camiones livianos y medianos usados en Chile para fletes, mudanzas y traslados A → B.
- **Después, sin desarrollar ahora:** camiones pesados, tractocamiones, automóviles, motocicletas y vehículos especializados.
- **Tipos:** `camioneta`, `furgon`, `camionLiviano` (actuales) y `camionMediano` (propuesto). El límite entre liviano y mediano **queda pendiente** de una clasificación chilena verificable (C-1, pregunta 3); hasta entonces no se crea el tipo.

### 4.2 Modelos candidatos (NO es un ranking ni una clasificación confirmada)

Lista de trabajo. **Cada modelo y su segmento se verifican en C-1** (versiones vendidas en Chile, tipo comercial y peso bruto) antes de cargarlo.

| Segmento tentativo | Candidatos (marca y modelo) |
|---|---|
| Camioneta (*pick-up*) | Toyota Hilux, Mitsubishi L200, Nissan Navara, Ford Ranger, Chevrolet D-Max, Maxus T60 y T90, JAC T6/T8, Great Wall (Wingle/Poer) |
| Utilitario pequeño (furgón o cabina) | Peugeot Partner, Citroën Berlingo, Renault Kangoo, Fiat Fiorino, Chevrolet N300 Max y **N400** *(verificar si sus versiones son furgón o cabina con caja: no clasificarlo como camión)* |
| Furgón mediano y grande | Peugeot Boxer, Citroën Jumper, Fiat Ducato, Mercedes-Benz Sprinter, Ford Transit, Maxus Deliver 9 / V80, Hyundai H-1 / Staria Cargo, Toyota Hiace, Renault Master |
| Camión liviano | Hyundai Porter, Kia Frontier, JAC (línea liviana), Foton (Aumark / Midi), JMC |
| Camión liviano a mediano | Hyundai HD65 / HD78, Isuzu / Chevrolet NLR, NMR, NPR, NQR, Mitsubishi Fuso Canter, Hino serie 300, Foton Aumark de mayor tonelaje |

*Corrección de la versión 1:* la Chevrolet N400 salió de «camión liviano» y la Maxus T90 de los camiones, porque es una *pick-up*. Ambas clasificaciones siguen sujetas a C-1.

**Limitación:** no conozco estadísticas públicas de flota de fletes **por modelo y comuna**. Formas de validarlo:
1. Ventas por modelo del gremio automotriz.
2. Parque por tipo, marca y región (INE; Registro de Vehículos Motorizados, por solicitud de transparencia).
3. **Encuesta propia** en la beta.
4. Conteo de los vehículos «no incluidos» que registran los usuarios.

### 4.3 Datos de cada versión: calidad antes que completitud

| Campo | Nota |
|---|---|
| Marca, modelo, versión, años, motorización | Texto normalizado |
| Combustible | Gasolina, diésel, eléctrico, híbrido o GNC. Los no líquidos **no** usan la fórmula de litros |
| Rendimiento de referencia | Valor, unidad y **ciclo** (WLTP/WLTC o NEDC). Referencial, no calibrado |
| Peso vacío, peso bruto vehicular, carga útil | kg |
| Volumen y dimensiones de carga | m³; largo, ancho, alto y apertura (mm) |
| **Fuente por campo** | URL o documento, fecha y confianza (alta, media o baja) |

- **No se exige ficha completa.** Si una fuente oficial no publica un dato (por ejemplo, el rendimiento de un camión), el campo queda `null` («sin dato») y la versión igual puede incorporarse.
- **Ningún valor sin fuente.** No hay registros inventados ni valores «típicos» sin respaldo.
- **Piloto de hasta 10 a 15 versiones.** Calidad primero; se amplía por demanda (vehículos «no incluidos» que registren los usuarios).

### 4.4 Catálogo global frente a «Mis vehículos»

- **Catálogo:** de solo lectura y mantenido por el proyecto.
- **Mis vehículos:**
  - elegir del catálogo: se copian los datos y cada uno se puede ajustar («ajustado por ti»);
  - registrar uno no incluido (marca y modelo libres);
  - los actuales siguen funcionando sin cambios.
- Si el catálogo cambia, se ofrece «hay datos nuevos»; **no** se aplican solos.

## 5. Cálculo económico según carga (prioridad 4): candidatas, ninguna aprobada

**Reglas:**
- Las fórmulas actuales (casos dorados G1–G10, 64/64) se mantienen hasta tu aprobación expresa de cada cambio.
- **No hay coeficientes inventados** para combustible, desgaste ni manipulación.
- **Todas las fórmulas nuevas esperan el informe C-2** (#44) y sus casos dorados.
- Sin los datos nuevos, el resultado es el actual.

| Partida | Candidata (estructura, sin valores) | Datos que la harían posible | Si faltan |
|---|---|---|---|
| Combustible por tramo | Σ km_t / R(estado_t) × precio. Estado vacío o cargado según el tramo (base → A y B → base, vacío; A → B, cargado) | R vacío y R cargado **declarados** por el transportista o con fuente de C-2 | R único (fórmula actual) |
| Interpolación por fracción de carga | 1/R(f) = 1/R_vacío + f × (1/R_lleno − 1/R_vacío) | Evidencia de C-2 de que la relación es válida | No se usa |
| Desgaste | $/km vacío y cargado | Declarados o con fuente | $/km único (actual) |
| Manipulación | Suma de tiempos **declarados** por objeto o grupo | Tiempos del transportista; referencias solo con fuente (C-2) | Minutos declarados (actual) |
| Mano de obra | Ayudantes: por servicio o por hora × horas pagadas (§3) | Modalidad y tarifa declaradas | Por servicio (actual) |
| Varios viajes | **Solo estimación informativa** (§2.3); nunca tarifa automática | — | — |
| Gastos adicionales | Líneas declaradas en $ (embalaje, equipos, estacionamiento, peajes) | Montos declarados | «Otros gastos» (actual) |

Cada fórmula aprobada se implementa con:
- nuevos casos dorados recalculados en forma independiente;
- nueva `engineVersion`;
- prueba de que, sin datos nuevos, el resultado es idéntico al actual.

## 6. IVA opcional (prioridad 5): en espera del informe tributario

- **Opciones exactas:** **«Sin IVA»** y **«Agregar IVA (19 %)»**. Son una preferencia comercial del transportista para presentar su presupuesto, sin afirmar exención ni alterar obligaciones tributarias.
- **«Agregar IVA (19 %)»:** muestra precio base, IVA y total. **«Sin IVA»:** no agrega ningún monto.
- **Se difieren al informe de #16:** textos, regla de redondeo y política. Los textos propuestos en la versión 1 (leyenda A-51 y advertencia para el transportista) son **borradores**.
- **Persistencia propuesta:** `tax_mode` y `tax_rate` en la cotización emitida; se reflejan en el historial, PDF, enlace y WhatsApp. Las cotizaciones históricas (`tax_mode` nulo) se muestran como hoy.

## 7. Rutas reales (prioridad 6): sin activar

- **Épica:** #3. **Activación en staging:** #49.
- **Bloqueado:** sin autorización de facturación ni de activación de Google Routes (#9).
- **Antes de pedir la autorización, Claude presentará:**
  - costo máximo mensual;
  - restricciones de la clave (API y origen);
  - seguridad (secreto del Worker);
  - plan de prueba con presupuesto bajo y apagado de emergencia.
- **Se conserva:**
  - base y regreso opcionales;
  - corrección manual;
  - procedencia real / declarado / simulado;
  - contador y presupuesto.
- **Mientras tanto,** las distancias siguen rotuladas como **simuladas** y nunca se presentan como reales (A-43).

## 8. Datos: diseño de cambios a Supabase (solo diseño)

**Aprobación propuesta (D-8):** solo el **diseño** de las migraciones.
- Cada migración en staging requiere **tu autorización individual** y un **respaldo real previo** (A-52).
- Todo es aditivo y no destructivo.

| Objeto | Propuesta |
|---|---|
| `vehicle_catalog` (nueva) | Una fila por versión; columnas tipadas; `sources jsonb` con fuente, fecha y confianza **por campo**; `data_version`. `SELECT` para todos; sin escritura por la API |
| `vehicles` (existente) | Columnas opcionales: `catalog_id` (FK, `on delete set null`), marca, modelo, año, versión, carga útil, peso vacío, volumen, dimensiones, rendimiento y desgaste cargado |
| Inventario: **opciones en evaluación (D-4)** | **(a)** Snapshot en `jobs.internal`: un solo documento, inmutable, pero limitado a 16 KB. **(b)** Tabla `job_cargo_items`: escala con listas grandes, **más** un resumen inmutable en el snapshot del documento emitido. Antes de decidir: medir el tamaño de un inventario de mudanza realista frente a 16 KB |
| Recursos | Dentro del mismo snapshot (accesibilidad, ayudantes con modalidad y horas, equipamiento) |
| `client_quotes` (existente) | Columnas opcionales `tax_mode`, `tax_rate` y `service_summary`. Sigue **sin** `UPDATE` (A-47) |

## 9. Compatibilidad: cotizaciones históricas inalterables

- Las cotizaciones emitidas **nunca** se recalculan, reescriben ni migran en contenido (A-47). Se muestran con sus datos guardados.
- `internal` sin `schemaVersion` = versión 1; `tax_mode` nulo = cotización histórica (A-51).
- Los vehículos actuales funcionan sin catálogo; vincularlos es opcional.
- El historial local (sin cuenta) se lee en la versión 1 y se convierte al copiarse a la cuenta, sin pérdida.
- **Pruebas en cada entrega:**
  - los casos dorados actuales se mantienen;
  - una cotización histórica se ve igual antes y después;
  - cada migración se ensaya en local antes de staging.

## 10. Paridad teléfono y PC (A-49)

Cada entrega se acepta solo si:
- su e2e pasa en **Pixel 7, iPhone 13, 1366 y 1440** (#50);
- no hay desplazamiento horizontal;
- los controles miden 44 px o más;
- se puede usar solo con teclado en PC;
- tiene las mismas funciones en ambos formatos.

## 11. Fuentes necesarias para el catálogo

| Dato | Fuentes candidatas (por verificar en C-1) |
|---|---|
| Modelos y versiones vendidos en Chile | Sitios oficiales de marcas e importadores; informes del gremio automotriz |
| Rendimiento homologado | consumovehicular.cl (Ministerio de Energía; WLTC/WLTP); homologación |
| Pesos, carga útil, volumen y dimensiones | Fichas técnicas oficiales; certificados de homologación del MTT (3CV) |
| Rendimiento de camiones | Si no hay fuente pública: `null` y lo declara el usuario |
| Presencia en flota | INE; Registro de Vehículos Motorizados (transparencia); encuesta propia |

Antes de copiar datos se verifican la licencia y las condiciones de reutilización.

## 12. Decisiones: estado

> **Actualización 20-11-2026:** el propietario **aprobó** D-1, D-2, D-3, D-6, D-8 y D-9 ([ratificación en #43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7041864905)), registradas como **A-55 a A-60** en [07](07-decisiones.md), con el alcance limitado que indica cada una. Siguen pendientes D-2b, D-4, D-5, D-7 y D-10. El diseño de #45 está en [21](21-diseno-datos-cotizador.md).

Tabla original de la versión 2 (estado al proponer):

| ID | Decisión | Estado | Recomendación |
|---|---|---|---|
| D-1 | Plan por etapas con el orden de §0.1 y los carriles de §0.2 | **Pendiente de tu aprobación** | Aprobar la **planificación** (no el desarrollo) |
| D-2 | Segmentos: camionetas, furgones y camiones livianos/medianos usados en Chile | **Pendiente de tu aprobación** | Aprobar los segmentos |
| D-2b | Límite de `camionMediano` | **Depende de investigación** (C-1, pregunta 3) | No crear el tipo hasta tener la clasificación chilena |
| D-3 | Ejecutar C-1 y C-2 en GPT Deep Research | **Pendiente de tu aprobación** (lo ejecutas tú) | Ejecutar ambas, en paralelo con el IVA |
| D-4 | Inventario: snapshot en `internal` o tabla `job_cargo_items` | **Pendiente**; requiere medición en el diseño (#45) | Decidir después de medir; documento emitido siempre con snapshot inmutable |
| D-5 | Fórmulas nuevas según la carga | **Depende de investigación** (C-2) y luego de tu aprobación, una por una | Posponer todas hasta C-2 y casos dorados |
| D-6 | Ayudantes por servicio y por hora, una modalidad por ayudante y horas pagadas explícitas (§3) | **Pendiente de tu aprobación** | Aprobar ambas modalidades con la regla contra duplicados |
| D-7 | IVA con «Sin IVA» / «Agregar IVA (19 %)»; textos, redondeo y política | **Depende de investigación** (#16) y luego de tu aprobación | Mantener las opciones exactas y diferir el resto al informe |
| D-8 | Migraciones: aprobar solo el diseño; cada ejecución con autorización individual y respaldo previo | **Pendiente de tu aprobación** | Aprobar solo el diseño |
| D-9 | Piloto de hasta 10–15 versiones, con campos `null` permitidos | **Pendiente de tu aprobación**; contenido según C-1 | Aprobar el criterio de calidad |
| D-10 | Facturación y activación de Google Routes | **No autorizado**; se pedirá con costo máximo, restricciones, seguridad y plan de prueba | Mantener bloqueado |

## 13. Riesgos

- **Datos técnicos sin fuente:** campo `null`, nunca inventado.
- **Falsa precisión:** sin coeficientes inventados; sin datos, fórmula actual.
- **Capacidad mal interpretada:** el número de viajes es una estimación con aviso explícito, no una garantía.
- **Doble cobro de ayudantes:** una modalidad por ayudante y horas pagadas explícitas.
- **Tamaño de `internal`:** se mide antes de D-4.
- **IVA:** riesgo de confundir el presupuesto con un documento tributario; leyenda fija y diseño final según el informe.
- **Rutas:** costos de Google; bloqueado hasta autorización.

## 14. Organización en GitHub

| Prioridad | Issue | Carril | Bloqueado por |
|---|---|---|---|
| Épica | [#42](https://github.com/ratatecuala/calculadora-de-costos-log/issues/42) | — | — |
| Decisiones | [#43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43) D-1 a D-10 | — | — |
| Base técnica | [#45](https://github.com/ratatecuala/calculadora-de-costos-log/issues/45) Diseño de datos y compatibilidad | D | D-1 |
| 1 | [#47](https://github.com/ratatecuala/calculadora-de-costos-log/issues/47) Inventario | 1 | #45 |
| 2 | [#51](https://github.com/ratatecuala/calculadora-de-costos-log/issues/51) Recursos | 2 | #45 |
| 3 | [#22](https://github.com/ratatecuala/calculadora-de-costos-log/issues/22) Investigación C-1 → [#46](https://github.com/ratatecuala/calculadora-de-costos-log/issues/46) Catálogo piloto | 3 | Informe C-1, #45, D-9 |
| 4 | [#44](https://github.com/ratatecuala/calculadora-de-costos-log/issues/44) Investigación C-2 → [#48](https://github.com/ratatecuala/calculadora-de-costos-log/issues/48) Fórmulas | 4 | Informe C-2, #47, #51, D-5 |
| 5 | [#37](https://github.com/ratatecuala/calculadora-de-costos-log/issues/37) IVA | 5 | #16, D-7 |
| 6 | [#49](https://github.com/ratatecuala/calculadora-de-costos-log/issues/49) Google Routes | 6 | #9, #19, #15, D-10 |
| ∀ | [#50](https://github.com/ratatecuala/calculadora-de-costos-log/issues/50) Paridad teléfono/PC y e2e | — | Cada entrega |
| Integración | [#53](https://github.com/ratatecuala/calculadora-de-costos-log/issues/53) Inventario y recursos en el cotizador ([22](22-diseno-integracion-cotizador.md)); I-1 + I-1b cerradas técnicamente (flag apagada) | 1 y 2 | I-2: #52, M3/M4; I-3: fórmulas (§4.3–§4.4 de [21](21-diseno-datos-cotizador.md)) |
| Antes de P3 | [#52](https://github.com/ratatecuala/calculadora-de-costos-log/issues/52) Impedir el `INSERT` directo en `jobs` | — | Tu autorización |

*Filas de #53 y #52 agregadas en la sincronización del 20-11-2026.*

Enlazados en otras épicas: #3 (rutas), #16 (IVA, investigación en curso), #31 (versionado), #5 (cuentas y vehículos), #20 y #21 (combustible y peajes, fuera de esta épica).
