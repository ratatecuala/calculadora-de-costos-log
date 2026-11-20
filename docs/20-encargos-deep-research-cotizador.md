# 20 · Encargos para GPT Deep Research: cotizador ampliado

**Versión 2 · 20-11-2026** · **Plan:** [19](19-plan-cotizador-ampliado.md) · **Regla:** [AGENTS.md](../AGENTS.md) §1.6. Las investigaciones profundas las ejecuta el propietario en GPT Deep Research; Claude solo prepara los encargos y contrasta los informes.
**Qué no autoriza:** cargar datos, cambiar fórmulas ni implementar funciones. Cada resultado se revisa y se aprueba aparte.

| Encargo | Issue | Bloquea | Puede ejecutarse |
|---|---|---|---|
| **C-1** Catálogo de vehículos comerciales en Chile | [#22](https://github.com/ratatecuala/calculadora-de-costos-log/issues/22) | Catálogo piloto (#46) | Ya, en paralelo con C-2 y con el informe de IVA |
| **C-2** Costo según la carga y recursos | [#44](https://github.com/ratatecuala/calculadora-de-costos-log/issues/44) | Fórmulas según carga (#48) | Ya |
| IVA | [#16](https://github.com/ratatecuala/calculadora-de-costos-log/issues/16), [18](18-encargo-deep-research-iva.md) | IVA (#37) | **En curso; no se duplica** (§3) |

**Cómo usarlos:**
1. Copia el bloque completo de cada encargo en una conversación nueva de GPT Deep Research.
2. Pega el informe en su issue (#22 o #44). No incluyas datos personales.
3. Pide a Claude que lo contraste con el plan.

## C-1 · Catálogo de vehículos comerciales livianos y medianos en Chile

```text
CONTEXTO
Herramienta web gratuita en Chile para transportistas independientes que hacen fletes, mudanzas
y traslados punto A → B (sobre todo en Santiago). Necesito construir un CATÁLOGO PILOTO de
vehículos de primera etapa: camionetas (pick-up y utilitarias), furgones de carga y camiones
livianos y medianos usados en Chile. Excluir camiones pesados, tractocamiones, automóviles,
motocicletas y vehículos especializados. No investigues impuestos ni IVA (hay otra
investigación en curso sobre eso).

REGLAS
1. Usa fuentes oficiales o primarias: sitios de marcas e importadores en Chile, fichas técnicas
   oficiales, consumovehicular.cl (Ministerio de Energía), homologación del MTT (3CV), INE,
   Registro Civil (vehículos motorizados), informes de ventas del gremio automotriz.
2. Cita URL y fecha de consulta para CADA dato. Para cada fuente indica su licencia o
   condiciones de reutilización (¿se puede copiar el dato a la base de datos de un servicio
   gratuito?).
3. NO inventes rankings de popularidad ni clasificaciones. Si no hay estadísticas por modelo,
   dilo explícitamente.
4. NO completes datos faltantes con estimaciones o valores "típicos". Si una fuente oficial no
   publica un dato, escribe "no disponible" y sigue. No se necesita ficha completa.
5. Marca cada valor como: VERIFICADO (fuente oficial), SECUNDARIO (otra fuente) o NO DISPONIBLE.

PREGUNTAS
1. Estadísticas públicas de ventas o parque de camionetas, furgones y camiones livianos y
   medianos en Chile y en la Región Metropolitana, por marca y modelo: periodo, granularidad,
   formato y licencia. ¿Cómo se piden datos del Registro de Vehículos Motorizados por
   transparencia (Ley 20.285)?
2. Clasificación oficial chilena que separa vehículo liviano, mediano y pesado (peso bruto
   vehicular u otro criterio): norma, valores y dónde está establecida.
3. Con las fuentes de (1), ¿qué marcas y modelos tienen presencia comprobable en Chile en cada
   segmento? Para cada candidato confirma o descarta su presencia y su SEGMENTO REAL (pick-up,
   furgón, cabina con caja, camión liviano o mediano), según el peso bruto y la ficha oficial.
   Candidatos (segmento tentativo, a verificar): Toyota Hilux, Mitsubishi L200, Nissan Navara,
   Ford Ranger, Chevrolet D-Max, Maxus T60 y T90, JAC T6/T8, Great Wall; Peugeot Partner,
   Citroën Berlingo, Renault Kangoo, Fiat Fiorino, Chevrolet N300 Max y N400; Peugeot Boxer,
   Citroën Jumper, Fiat Ducato, Mercedes-Benz Sprinter, Ford Transit, Maxus Deliver 9 y V80,
   Hyundai H-1 / Staria Cargo, Toyota Hiace, Renault Master; Hyundai Porter, Kia Frontier, JAC,
   Foton, JMC; Hyundai HD65/HD78, Isuzu/Chevrolet NLR, NMR, NPR, NQR, Mitsubishi Fuso Canter,
   Hino 300. Agrega otros modelos con presencia comprobable que falten.
4. Para HASTA 10–15 versiones de presencia comprobada (si hay datos de presencia, prioriza esas),
   entrega una tabla con: marca, modelo, versión, años, motor, combustible, rendimiento
   homologado (valor, unidad, ciclo WLTP/WLTC o NEDC; urbano, carretera o mixto), peso vacío, peso
   bruto vehicular, carga útil, volumen de carga, largo/ancho/alto del espacio de carga y
   apertura de puertas. Fuente y fecha POR CAMPO; "no disponible" cuando corresponda.
5. ¿Existe alguna fuente pública o de fabricante sobre el rendimiento de camiones livianos y
   medianos en Chile? Si no, dilo.
6. ¿Los datos de consumovehicular.cl se pueden descargar o reutilizar? ¿Qué cambió con el paso a
   WLTC/WLTP y cómo afecta comparar versiones de distintos años?

ENTREGA
a) Lista de fuentes con licencia o condiciones de reutilización.
b) Clasificación oficial liviano, mediano o pesado, con la norma.
c) Tabla de presencia por segmento (sin ranking inventado) y segmento real de cada candidato.
d) Tabla piloto de hasta 10–15 versiones con fuente y fecha por campo.
e) Vacíos de información y cómo cubrirlos.
```

## C-2 · Costo de un flete según la carga y los recursos

```text
CONTEXTO
La misma herramienta. Hoy el costo de combustible usa un rendimiento único (km/L) para todo el
recorrido, el desgaste es un $/km fijo, el tiempo de carga y descarga lo declara el usuario y los
ayudantes se pagan por servicio. Quiero saber, con evidencia, cómo deberían influir el peso, el
volumen, la manipulación, los pisos y la capacidad del vehículo en el costo, SIN coeficientes
inventados ni recargos porcentuales arbitrarios. No investigues impuestos ni IVA (hay otra
investigación en curso sobre eso).

REGLAS
1. Fuentes técnicas o académicas verificables: estudios de consumo de vehículos comerciales,
   normas, guías oficiales de seguridad laboral, datos de fabricantes y estadísticas oficiales.
   Cita URL y fecha.
2. Separa EVIDENCIA (dato medido o norma) de SUPOSICIÓN. Si un coeficiente o rango no tiene
   respaldo, dilo y no lo propongas como valor por defecto.
3. Para cada relación, indica su rango de validez (tipo de vehículo, condiciones urbano o
   carretera) y su incertidumbre.

PREGUNTAS
1. Consumo de combustible de camionetas, furgones y camiones livianos y medianos vacíos frente a
   cargados: ¿qué evidencia existe? ¿Es razonable modelar el consumo por km como aproximadamente
   lineal en la masa transportada? Rangos medidos por segmento, con condiciones.
2. Desgaste y mantención (neumáticos, frenos, suspensión) según la carga: ¿hay modelos de costo
   por km con respaldo? Si no, dilo.
3. Tiempos de carga y descarga en mudanzas y fletes: ¿hay estudios o estándares de tiempo por
   tipo de objeto (refrigerador, lavadora, sofá, cajas), por piso sin ascensor y por distancia de
   acarreo? ¿Cómo estiman las empresas de mudanza el tiempo y el número de personas? Indica si
   son prácticas comerciales o datos medidos.
4. Pesos y volúmenes típicos de objetos de mudanza (electrodomésticos, muebles, cajas estándar)
   con fuente (fichas de fabricantes o guías con metodología).
5. Capacidad: ¿qué tan útil es estimar el número de viajes con peso total / carga útil y
   volumen total / volumen de carga? ¿Hay evidencia sobre el aprovechamiento real del volumen
   (factor de llenado) en mudanzas? Explica por qué esa estimación no garantiza que la carga
   quepa (forma, acomodo, apertura de puertas).
6. Chile: límites legales de carga (carga útil, peso por eje) para estos vehículos, y normas de
   manipulación manual de carga (Ley 20.001 y su reglamento: kg máximos por trabajador) que
   determinen cuántos ayudantes se necesitan.
7. Pago de ayudantes en Chile: ¿se paga por servicio o por hora? ¿Qué horas se suelen pagar
   (solo carga y descarga, o también el traslado si el ayudante viaja)? Fuentes oficiales o
   estudios; si solo hay práctica informal, dilo.

ENTREGA
a) Por partida (combustible, desgaste, manipulación, mano de obra y capacidad): evidencia
   disponible, fórmula candidata respaldada (o "sin respaldo suficiente"), datos de entrada
   necesarios y límites de validez.
b) Tabla de pesos y volúmenes de objetos de mudanza con fuente por fila.
c) Normas chilenas aplicables (carga y manipulación manual) con el artículo.
d) Lista explícita de lo que NO tiene respaldo y debería declararlo el transportista.
```

## 3 · IVA: sin investigación duplicada

La investigación tributaria **ya está en curso** con el encargo de [18](18-encargo-deep-research-iva.md) (#16). C-1 y C-2 **excluyen** expresamente impuestos e IVA. La pregunta sobre las opciones exactas «Sin IVA» / «Agregar IVA (19 %)» quedó como **complemento del mismo encargo** ([comentario en #16](https://github.com/ratatecuala/calculadora-de-costos-log/issues/16#issuecomment-7039629780)). No es una investigación nueva: si el informe de #16 ya responde, no hace falta repetirla.

## Qué se hará con los informes

| Informe | Claude hace (sin autorización adicional) | Requiere tu aprobación |
|---|---|---|
| C-1 | Contrastar fuentes, licencias y segmentos; proponer el piloto del catálogo con fuente por campo y `null` donde no haya dato | Cargar el catálogo (migración, D-8 y D-9) |
| C-2 | Proponer fórmulas concretas con casos dorados recalculados; marcar lo que debe declarar el transportista | Cada fórmula (D-5) y la modalidad de ayudantes (D-6) |
| IVA (#16) | Ajustar docs/19 §6 | Textos, redondeo y diseño (D-7), e implementación |
