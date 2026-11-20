# 20 · Encargos para GPT Deep Research: cotizador ampliado

**Fecha:** 20-11-2026 · **Plan:** [19](19-plan-cotizador-ampliado.md) · **Regla:** [AGENTS.md](../AGENTS.md) §1.6. Las investigaciones profundas las ejecuta el propietario en GPT Deep Research; Claude solo prepara el encargo y después contrasta el informe.
**Qué no autoriza:** cargar datos al catálogo, cambiar fórmulas ni implementar funciones. Cada resultado se revisa y se aprueba aparte.

Ejecutar **C-1** primero: el catálogo depende de él. **C-2** puede ir en paralelo. **§3** es una pregunta adicional para el informe de IVA en curso (docs/18).

## C-1 · Catálogo de vehículos de carga liviana y mediana en Chile

```text
Contexto: herramienta web gratuita (Chile) para transportistas de fletes, mudanzas y traslados
punto A → B en Santiago. Necesito construir un catálogo de vehículos de PRIMERA ETAPA:
camionetas de trabajo (pick-up y utilitarias), furgones de carga y camiones livianos y medianos.
No incluir camiones pesados, tractocamiones, automóviles, motos ni vehículos especializados.

Reglas:
- Usa fuentes oficiales o primarias: sitios de marcas e importadores en Chile, fichas técnicas
  oficiales, consumovehicular.cl (Ministerio de Energía), homologación del MTT (3CV), INE,
  Registro Civil (vehículos motorizados), informes del gremio automotriz (ANAC u otro).
- Cita URL y fecha de consulta para cada dato. Indica licencia o condiciones de reutilización
  de cada fuente (¿se puede copiar el dato a una base de datos de un servicio gratuito?).
- NO inventes rankings de popularidad. Si no hay estadísticas por modelo, dilo explícitamente.
- Marca cada valor: verificado en fuente oficial / fuente secundaria / no encontrado.

Preguntas:
1. ¿Qué estadísticas públicas existen sobre ventas o parque de camionetas, furgones y camiones
   livianos y medianos en Chile y en la Región Metropolitana, por marca y modelo? Periodo,
   granularidad, formato y licencia. ¿Cómo pedir datos del Registro de Vehículos Motorizados por
   transparencia (Ley 20.285)?
2. Con esas fuentes, ¿qué marcas y modelos tienen presencia relevante en Chile en cada segmento?
   Candidatos a confirmar o descartar: Hyundai Porter, Kia Frontier, Chevrolet N300 Max y N400,
   Peugeot Partner y Boxer, Citroën Berlingo y Jumper, Renault Kangoo y Master, Fiat Fiorino y
   Ducato, Mercedes-Benz Sprinter, Ford Transit y Ranger, Toyota Hilux y Hiace, Mitsubishi L200 y
   Fuso Canter, Nissan Navara, Chevrolet D-Max, Maxus (T60, Deliver 9, V80), JAC, Foton, JMC,
   Great Wall, Hyundai H-1/Staria Cargo, HD65/HD78, Isuzu/Chevrolet NLR, NMR, NPR, NQR, Hino 300.
3. ¿Cuál es la clasificación oficial chilena que separa vehículo liviano, mediano y pesado
   (peso bruto vehicular), y dónde está establecida?
4. Para 10 a 15 modelos y versiones de presencia confirmada (prioriza los de mayor presencia si
   hay datos), entrega una tabla: marca, modelo, versión, años, motor, combustible, rendimiento
   homologado (valor, unidad, ciclo WLTP/NEDC, urbano/carretera/mixto), peso vacío, peso bruto
   vehicular, carga útil, volumen de carga, largo/ancho/alto del espacio de carga, apertura de
   puertas; fuente y fecha para cada campo.
5. Rendimiento de camiones livianos y medianos: ¿existe alguna fuente pública o de fabricante?
   Si no, dilo.
6. ¿consumovehicular.cl permite descargar o reutilizar sus datos? ¿Qué cambió con WLTC/WLTP?

Entrega: lista de fuentes con licencia; tabla de presencia (sin ranking inventado); tabla piloto
de 10–15 versiones con fuente por campo; vacíos de información y cómo cubrirlos.
```

## C-2 · Costo de un flete según la carga: consumo, manipulación y mano de obra

```text
Contexto: el mismo cotizador. Hoy el costo de combustible usa un rendimiento único (km/L) para
todo el recorrido y el tiempo de carga y descarga lo declara el usuario. Quiero saber cómo
deberían influir el peso, el volumen, la manipulación y la capacidad del vehículo, SIN usar
recargos porcentuales arbitrarios.

Reglas: fuentes técnicas o académicas verificables (estudios de consumo de vehículos comerciales,
normas, guías de seguridad laboral, datos de fabricantes). Cita URL y fecha. Separa evidencia
de suposición. Si un coeficiente no tiene respaldo, dilo.

Preguntas:
1. ¿Cómo varía el consumo de combustible de camionetas, furgones y camiones livianos y medianos
   entre vacío y con carga? ¿Hay evidencia de una relación aproximadamente lineal con la masa
   transportada (consumo por km)? Rangos por segmento, con condiciones (urbano, carretera).
2. ¿Cómo afecta la carga al desgaste (neumáticos, frenos, suspensión) y a la mantención? ¿Hay
   modelos de costo por km según la carga?
3. Tiempos de carga y descarga en mudanzas y fletes: ¿existen estándares o estudios de tiempo por
   tipo de objeto (refrigerador, lavadora, sofá, cajas), por piso sin ascensor y por distancia de
   acarreo? ¿Cómo estiman las empresas de mudanza el tiempo y el número de personas?
4. Pesos y volúmenes típicos de objetos de mudanza (electrodomésticos, muebles, cajas estándar),
   con fuente (fichas de fabricantes, guías de mudanza con metodología).
5. Factor de llenado del espacio de carga: ¿qué porcentaje del volumen se aprovecha en la
   práctica en mudanzas? ¿Hay fuentes?
6. En Chile: límites legales de carga (carga útil, peso por eje) aplicables a estos vehículos y
   normas de manipulación manual de carga (Ley 20.001, límite de kg por trabajador) que afecten
   cuántos ayudantes se necesitan.
7. Modalidades habituales de pago de ayudantes en Chile (por servicio o por hora): ¿hay fuentes?

Entrega: para cada partida (combustible, desgaste, manipulación, mano de obra, capacidad), la
evidencia disponible, una fórmula candidata respaldada, los datos de entrada necesarios y sus
límites; tabla de pesos y volúmenes de objetos con fuente; lista de lo que no tiene respaldo.
```

## 3 · Pregunta adicional para el informe de IVA (#16, docs/18)

Si el encargo de docs/18 ya está en curso, agregar o hacer en un segundo paso:

```text
Pregunta adicional: el transportista elegirá en cada cotización entre (a) «Sin IVA»: no se agrega
monto de IVA al precio, y (b) «Agregar IVA (19 %)»: se muestra precio base, IVA y total. La app
NO emite documentos tributarios. ¿Qué textos mínimos debe llevar el presupuesto en cada caso para
no confundirse con una factura o boleta ni sugerir una exención? ¿La opción (a) dirigida a un
consumidor final es compatible con el art. 30 de la Ley 19.496 (precio total con impuestos) si el
transportista es contribuyente de IVA? ¿Cómo se redondea el IVA de un presupuesto para que
coincida con el documento tributario posterior?
```

## Qué se hará con los informes

| Informe | Claude hace (sin autorización adicional) | Requiere tu aprobación |
|---|---|---|
| C-1 | Contrastar fuentes y licencias; proponer el piloto del catálogo con fuente por campo | Cargar datos (migración del catálogo, D-8 y D-9) |
| C-2 | Proponer fórmulas concretas con casos dorados recalculados | Cada fórmula (D-5) |
| IVA §3 | Ajustar el diseño de docs/19 §5 | Textos y diseño (D-7) e implementación |
