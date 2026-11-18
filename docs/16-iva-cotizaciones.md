# 16 · IVA y tributación en las cotizaciones (issue #16)

**Fecha:** 18-11-2026 · **PR:** #34 (sin merge) · **Frente:** D — IVA y tributación chilena · **Estado:** **PROPUESTA. No se implementa nada sin aprobación del propietario.**

> **Advertencia.** Este documento **no constituye asesoría tributaria ni legal**. Resume normativa y criterios públicos para diseñar la aplicación. Cada transportista debe validar su situación con un **contador** o con el **SII** (sii.cl, Mesa de Ayuda, oficinas). La aplicación tampoco debe asesorar: solo debe presentar los montos según lo que el usuario declare y remitir al SII o a un contador (docs/03 §3D).

**Alcance.** Servicio de **transporte terrestre de carga nacional** prestado por transportistas independientes y pequeñas empresas con camionetas, furgones y camiones livianos (docs/01). Se analiza: si el servicio está afecto a IVA, qué documento corresponde según el perfil del transportista, cómo presentar el precio en una **cotización** (que no es un documento tributario) y qué hace hoy la aplicación. Fuera de alcance: transporte de pasajeros, transporte internacional como producto, tributación de la renta más allá de lo necesario, Impuesto Específico al diésel (mencionado solo como pregunta abierta).

**Cómo se investigó y límites.**

- Desde esta sesión **no se pudo abrir sii.cl ni bcn.cl/leychile.cl** (la red de la sesión los bloquea: «host not allowed» / DNS no resuelto). Todo lo que se cita del SII proviene de **fragmentos indexados por el buscador** de páginas oficiales, sin abrir la página completa. Por eso **ningún punto se marca como «HECHO VERIFICADO» pleno**.
- Etiquetas usadas:
  - **VERIFICADO VÍA BUSCADOR** — el texto aparece en un fragmento de una página **oficial** (sii.cl, sernac.cl) devuelto por el buscador el 18-11-2026, con su URL. Falta abrir la página y confirmar texto completo y vigencia.
  - **POR VALIDAR** — dato de fuente secundaria (consultoras, prensa, blogs) o de memoria, que debe confirmarse en la fuente oficial.
  - **INTERPRETACIÓN** — conclusión propia a partir de lo anterior; debe validarla un contador.
- Los enlaces a leychile/bcn de las leyes se dan como referencia **sin haberlos podido abrir**; los identificadores `idNorma` deben comprobarse.
- **Regla del propietario (docs/07, «Evaluación de proveedores de mapas»):** las investigaciones externas **profundas** requieren aviso previo y se hacen con **GPT Deep Research**. Esta fue una verificación **acotada** encargada por el coordinador del PR #34. Si el propietario la considera investigación profunda, este documento debe tratarse como **insumo preliminar** para ese procedimiento.

---

## 1. Resumen ejecutivo

- **El flete terrestre de carga dentro de Chile está afecto a IVA (19 %)** por las reglas generales; el SII lo ha sostenido desde antes de la Ley 21.420 (Oficio/JA 178 de 2001), y desde el 01-01-2023 la Ley 21.420 grava además todos los servicios salvo exención. *(VERIFICADO VÍA BUSCADOR; la tasa del 19 % (art. 14 DL 825) es POR VALIDAR en el texto vigente.)*
- **La exención para quien «trabaja solo» (art. 12 E N° 12 DL 825) no alcanza a quienes explotan vehículos de transporte de carga**, según preguntas frecuentes del SII. Un fletero que trabaja solo con su camioneta **no** queda exento por eso. *(VERIFICADO VÍA BUSCADOR.)*
- **Solo el flete internacional (del exterior a Chile y viceversa) está exento** (art. 12 E N° 2). El tramo nacional, incluido el flete de mercadería de exportación hasta el puerto de embarque, **sigue afecto**. *(VERIFICADO VÍA BUSCADOR.)*
- **El régimen de renta (renta presunta del art. 34 LIR, Pro Pyme 14 D, régimen general) no cambia la condición de afecto a IVA**; cambia cómo se paga el impuesto a la renta. *(INTERPRETACIÓN; no se encontró una fuente oficial que lo diga en esos términos.)*
- **Documento:** el contribuyente de IVA emite **factura electrónica** a otros contribuyentes (cliente empresa, que puede usar el crédito fiscal) y **boleta electrónica** a consumidores finales (art. 53 DL 825). La **boleta de honorarios** es de segunda categoría y, en principio, **no corresponde** a la actividad de transporte de carga. *(Lo primero VERIFICADO VÍA BUSCADOR en su estructura general; lo de honorarios es INTERPRETACIÓN.)*
- **Al consumidor final, el precio informado debe ser el total con impuestos incluidos** (art. 30 Ley 19.496, publicado por SERNAC). Entre empresas, la práctica es «neto + IVA». *(Art. 30: VERIFICADO VÍA BUSCADOR; práctica B2B: INTERPRETACIÓN.)*
- **No existe cambio de sujeto ni retención de IVA sobre el flete**: según una pregunta frecuente del SII, al transportista de carga terrestre no se le puede retener el IVA del flete. *(VERIFICADO VÍA BUSCADOR.)* Sí existen obligaciones de **portar y exhibir** la documentación de la mercadería transportada (Res. Ex. SII N° 110 de 2024 y N° 154 de 2025). *(POR VALIDAR en detalle.)*
- **Hoy la app muestra todo en «Valor neto»** sin aviso de que la cotización no es factura. Para un cliente persona eso puede inducir a error. Se recomienda la **opción B** (§7): perfil tributario del transportista + tipo de cliente por cotización, con leyendas fijas.

---

## 2. Marco normativo

| # | Norma / fuente | Qué dice (resumen) | Estado | Enlace |
|---|---|---|---|---|
| N1 | **DL 825**, Ley sobre Impuesto a las Ventas y Servicios (LIVS), art. 2 N° 2 y art. 8 | Hecho gravado «servicio»; el art. 8 enumera operaciones gravadas | Texto **no abierto** (bcn.cl bloqueado). Estructura POR VALIDAR | https://www.bcn.cl/leychile/navegar?idNorma=6369 *(id por confirmar)* |
| N2 | **Ley 21.420** (2022), art. 6 N° 1 y 2 | Amplía el hecho gravado «servicio»: desde el **01-01-2023** se gravan los servicios en general (antes solo los vinculados a art. 20 N° 3 y 4 LIR) y modifica exenciones del art. 12 E | **VERIFICADO VÍA BUSCADOR** (Circular SII N° 50 de 27-10-2022) | https://www.sii.cl/normativa_legislacion/circulares/2022/circu50.pdf |
| N3 | Jurisprudencia SII, **Oficio/JA 178 de 2001** | «El transporte de carga por vía terrestre que se preste dentro del territorio nacional se encuentra afecto a IVA de acuerdo a las reglas generales»; la franquicia es solo para el transporte internacional | **VERIFICADO VÍA BUSCADOR** (fragmento). Criterio antiguo, coherente con N2 | https://www.sii.cl/pagina/jurisprudencia/adminis/2001/ventas/ja178.htm |
| N4 | Jurisprudencia SII (dictamen citado por el buscador) | «En lo que se refiere al transporte de carga, no rige ninguna exención y quedan sujetas por lo tanto al pago de ese gravamen» | **VERIFICADO VÍA BUSCADOR** (fragmento; el buscador no identificó con certeza el número del dictamen; aparece junto a JA 2715 de 2007) | https://www.sii.cl/pagina/jurisprudencia/adminis/2007/ventas/ja2715.htm |
| N5 | **Art. 12 E N° 2 DL 825** | Exentos «los fletes marítimos, fluviales, lacustres, aéreos y terrestres, del exterior a Chile y viceversa» y los pasajes internacionales | **VERIFICADO VÍA BUSCADOR** (reproducido en JA 2715/2007 y JA 178/2001) | ídem N3, N4 |
| N6 | **FAQ SII**: flete de mercadería a exportar hasta el puerto de embarque | Afecto a IVA según arts. 2 y 8 LIVS | **VERIFICADO VÍA BUSCADOR** (título y respuesta en el fragmento) | https://www.sii.cl/preguntas_frecuentes/impuestos_mensuales/001_130_4124.htm |
| N7 | **Art. 12 E N° 12 DL 825** + **FAQ SII** «¿Una persona que trabaja sola puede solicitar el beneficio de exención del IVA?» | Sí puede, con requisitos, **excepto** quienes exploten vehículos motorizados destinados al transporte de carga | **VERIFICADO VÍA BUSCADOR** (la exclusión aparece en el fragmento; requisitos completos no leídos) | https://www.sii.cl/preguntas_frecuentes/impuestos_mensuales/001_130_1036.htm |
| N8 | **Art. 53 DL 825** | Letra a): facturas en operaciones con otros contribuyentes (vendedores, prestadores de servicios, empresas); letra b): **boletas** en los demás casos (consumidores finales) | **VERIFICADO VÍA BUSCADOR** solo en su estructura general (citada por resoluciones SII, p. ej. Res. Ex. 121 de 2024). Texto literal POR VALIDAR | https://www.sii.cl/normativa_legislacion/resoluciones/2024/reso121.pdf |
| N9 | **Art. 54 DL 825** (Ley 20.727) | Facturas, notas de crédito y débito: **solo electrónicas** | VERIFICADO VÍA BUSCADOR (fuente secundaria que transcribe la ley). POR VALIDAR en texto oficial | — |
| N10 | **Ley 21.210** (2020), art. 3° | Modificó el DL 825; boletas electrónicas obligatorias y con **IVA informado por separado** (plazo de transición hasta el 28-02-2021, según fuente secundaria) | **POR VALIDAR** (solo fuentes secundarias: Círculo Verde, Buk) | Circular SII N° 26 de 2021 (no abierta): https://www.sii.cl/normativa_legislacion/circulares/2021/circu26.pdf |
| N11 | **Art. 23 DL 825** — crédito fiscal | El crédito fiscal se respalda con **facturas**; las facturas electrónicas requieren además acuse de recibo (Circular 4 de 2017) | Estructura **VERIFICADO VÍA BUSCADOR** (Circular 4/2017). Que la **boleta no da derecho a crédito**: **INTERPRETACIÓN** (consistente con la norma, no leído en fuente oficial) | https://www.sii.cl/normativa_legislacion/circulares/2017/circu4.pdf |
| N12 | **FAQ SII** «¿A los transportistas de carga terrestre se les puede retener el IVA y exigir guías de despacho por el flete prestado?» | **No**: no hay cambio de sujeto aplicable al flete; la guía de despacho la emite el vendedor o prestador que contrató el transporte | **VERIFICADO VÍA BUSCADOR** (respuesta inicial del fragmento) | https://www.sii.cl/preguntas_frecuentes/impuestos_mensuales/001_130_1204.htm |
| N13 | **Res. Ex. SII N° 110** (28-11-2024) y **N° 154** (2025) | Transportistas de carga deben **exhibir** guía, factura o boleta de las especies afectas a IVA que trasladan cuando el SII lo requiera | **POR VALIDAR** (noticia SII y prensa; resoluciones no abiertas) | https://www.sii.cl/noticias/2024/021224noti02smn.htm · https://www.sii.cl/normativa_legislacion/resoluciones/2025/reso154.pdf |
| N14 | **DL 824** (LIR), **art. 34** — renta presunta | Transporte terrestre de carga puede optar a renta presunta: **10 % del valor corriente en plaza** de cada vehículo (con remolque/acoplado); límite de ingresos anuales **5.000 UF** (ejercicio anterior, sumando relacionados); solo personas naturales y ciertas entidades formadas solo por personas naturales | **POR VALIDAR** (fuentes secundarias y presentación SII de 2014; Oficio SII N° 2346 de 02-08-2022 vía vLex). Régimen reemplazado por Ley 20.780 desde 01-01-2016 | https://www.bcn.cl/leychile/navegar?idNorma=6368 *(id por confirmar)* |
| N15 | **Art. 14 D LIR** — Régimen Pro Pyme (N° 3 general, N° 8 transparente) | Régimen de **renta**; no se encontró regla que cambie el IVA | Estructura VERIFICADO VÍA BUSCADOR (Circular SII N° 62 de 2020). Efecto nulo en IVA: **INTERPRETACIÓN** | https://www.sii.cl/normativa_legislacion/circulares/2020/circu62.pdf |
| N16 | **Boleta de honorarios** (segunda categoría, art. 42 N° 2 LIR) | La emiten contribuyentes con inicio de actividades en **segunda categoría** (profesionales, ocupaciones lucrativas). Los de primera categoría que contratan a personas sin inicio de actividades emiten **BTE** (boleta de prestación de servicios de terceros) | **VERIFICADO VÍA BUSCADOR** (FAQ SII sobre BHE; ficha ChileAtiende sobre BTE). Que el flete **no** pueda documentarse con BHE: **INTERPRETACIÓN** | https://www.sii.cl/preguntas_frecuentes/boleta_honorario_electr/001_120_3474.htm · https://www.chileatiende.gob.cl/fichas/12101-boleta-de-prestacion-de-servicios-de-terceros-electronica-bte |
| N17 | **DL 830** (Código Tributario), **art. 68** | Aviso de inicio de actividades dentro de los **dos meses** siguientes al comienzo; sanción según art. 97 N° 1 | **VERIFICADO VÍA BUSCADOR** (FAQ SII) | https://www.sii.cl/preguntas_frecuentes/rut_inicio_actividades/001_105_2030.htm |
| N18 | **Ley 19.496** (consumidor), **art. 30** | Los proveedores deben informar al público el precio de bienes y servicios; el precio debe comprender el valor total, **incluidos los impuestos correspondientes** | **VERIFICADO VÍA BUSCADOR** (articulado publicado por SERNAC). Texto vigente completo POR VALIDAR | https://sernac.cl/portal/609/w3-propertyvalue-58774.html · https://www.bcn.cl/leychile/navegar?idNorma=61438 *(id por confirmar)* |
| N19 | Formato DTE del SII (MntNeto, IVA, MntTotal) | Los montos de factura y boleta van en **pesos enteros**; la regla exacta de redondeo del IVA no se pudo leer | **POR VALIDAR** | https://www.sii.cl/factura_electronica/formato_dte.pdf · https://www.sii.cl/factura_electronica/factura_mercado/formato_boleta_electronica.pdf |

**No verificado / no encontrado:** el texto literal de los arts. 2 N° 2, 8, 14, 23 y 53 del DL 825; la regla oficial de redondeo del IVA en los DTE; si existe alguna resolución que obligue a retener IVA a un transportista **individual** (el buscador mostró que el SII puede incluir contribuyentes específicos en listas de retención, pero no una regla general para fleteros — **POR VALIDAR**).

---

## 3. Respuestas a las preguntas del encargo

### 3.1 ¿El transporte terrestre de carga nacional está afecto a IVA?

**Sí (VERIFICADO VÍA BUSCADOR: N3, N4, N6, N7).** El SII ha sostenido que el transporte de carga dentro del país está afecto según las reglas generales y que no rige exención para él. La Ley 21.420 (N2) no cambia esa conclusión: la refuerza, porque desde el 01-01-2023 todo servicio está gravado salvo exención expresa.

Exenciones del art. 12 E revisadas:

- **N° 2 (fletes del exterior a Chile y viceversa):** exentos. Solo para el transporte internacional; el tramo interno se factura con IVA (N3, N5). Fuera del alcance de la app.
- **N° 12 (persona que trabaja sola):** **no aplica** a quien explota vehículos de carga (N7). Es el hallazgo más importante para el público objetivo: un fletero independiente no queda exento por trabajar solo.
- **Flete de mercadería de exportación hasta el puerto:** **afecto** (N6).
- **Transporte de pasajeros:** exento según el art. 12 E (docs/04); no aplica a carga.

### 3.2 ¿Qué documento corresponde según el tipo de transportista?

Ver la tabla de §4. Puntos clave:

- **Contribuyente de IVA** (cualquiera sea su régimen de renta): **factura electrónica** si el cliente es contribuyente (empresa, pyme, comercio con RUT y giro) y **boleta electrónica** si es consumidor final (N8, N9). El cliente empresa puede usar el IVA de la factura como **crédito fiscal** si cumple el art. 23 (N11).
- **Renta presunta (art. 34 LIR):** cambia solo la renta. **INTERPRETACIÓN:** sigue afecto a IVA y emite factura/boleta como cualquier contribuyente de IVA. *POR VALIDAR con contador.*
- **Pro Pyme (14 D):** idem; es un régimen de renta (N15). *INTERPRETACIÓN.*
- **Boleta de honorarios:** documento de segunda categoría (N16). El transporte de carga es una actividad de primera categoría (el propio régimen de renta presunta del art. 34 se dirige a quienes «explotan» vehículos de carga). **INTERPRETACIÓN:** documentar fletes con boleta de honorarios **probablemente no corresponde**; el cliente empresa además no podría usar crédito fiscal. *Pregunta abierta P3.*
- **Sin inicio de actividades (informal):** no puede emitir documentos tributarios; la ley exige dar aviso de inicio dentro de dos meses (N17). La app no debe incentivar la informalidad ni presentar un precio «sin IVA» como si fuera legalmente exento.
- **Giro exento:** solo si existe una exención aplicable (en la práctica, flete internacional). Emite factura/boleta **exenta**. Para el público objetivo es un caso raro.

### 3.3 Precio con IVA incluido al consumidor vs neto + IVA entre empresas

- **Consumidor final:** el art. 30 de la Ley 19.496 exige informar el precio total **incluidos los impuestos** (N18, VERIFICADO VÍA BUSCADOR en sernac.cl). **INTERPRETACIÓN:** un fletero que cotiza a una persona (mudanza, retiro de un mueble) actúa como proveedor habitual y debería informar el **total con IVA incluido**. Mostrar «$50.000 neto» y luego cobrar $59.500 expone a reclamos ante SERNAC.
- **Entre empresas:** la Ley 19.496 en principio no rige; la práctica comercial es **neto + IVA**, porque el cliente recupera el IVA como crédito fiscal y compara precios en neto (docs/03 ya lo supone en el escenario B). **INTERPRETACIÓN; no se encontró obligación legal específica.**

### 3.4 Cotización comercial vs documento tributario

Ver §5. En síntesis (**INTERPRETACIÓN**, coherente con N8, N9 y N11): la cotización es una **oferta comercial**; no está en el catálogo de documentos del art. 53, no genera débito fiscal ni da crédito fiscal, no se timbra ni se envía al SII. El débito nace con la prestación del servicio documentada en factura o boleta.

### 3.5 Retenciones y cambio de sujeto

**No hay retención ni cambio de sujeto del IVA del flete** (N12, VERIFICADO VÍA BUSCADOR). Las resoluciones de 2024–2025 (N13) imponen al transportista **exhibir** la documentación de la mercadería, no retener ni soportar retención. **POR VALIDAR:** si existe alguna resolución vigente que nombre a transportistas específicos como sujetos de retención (el buscador mostró una resolución de 2025 que **excluía** a una empresa de transporte de una lista, lo que sugiere listas nominativas, no una regla general).

---

## 4. Tabla por tipo de transportista

| Perfil | Régimen de renta (referencia) | ¿Afecto a IVA? | Documento que emite | Cómo presentar el precio en la cotización | Riesgos |
|---|---|---|---|---|---|
| **1. Contribuyente de IVA, cliente empresa** | General, Pro Pyme 14 D N° 3 u 8, o renta presunta art. 34 | **Sí, 19 %** (N3, N4, N7) | **Factura electrónica afecta** (N8, N9) | **Neto + IVA (19 %) = Total**, los tres montos visibles | Cotizar en neto y olvidar el IVA al cobrar; IVA con redondeo distinto al de la factura (§7.4) |
| **2. Contribuyente de IVA, cliente persona** | Ídem | **Sí, 19 %** | **Boleta electrónica** (N8), con IVA informado por separado (N10, POR VALIDAR) | **Total con IVA incluido** como cifra principal; desglose opcional «incluye IVA $X» | Mostrar solo el neto a un consumidor (art. 30 Ley 19.496, N18) |
| **3. Renta presunta (art. 34)** | Renta presunta: 10 % del valor del vehículo, tope 5.000 UF (N14, POR VALIDAR) | **Sí** — el régimen de renta no altera el IVA (**INTERPRETACIÓN**) | Factura o boleta, según cliente (perfiles 1 y 2) | Como perfiles 1 y 2 | Creer que «renta presunta» exime de IVA o de emitir documentos |
| **4. Pro Pyme (14 D)** | Pro Pyme (N15) | **Sí** (**INTERPRETACIÓN**) | Factura o boleta, según cliente | Como perfiles 1 y 2 | Ídem |
| **5. Persona natural con boleta de honorarios** | Segunda categoría (N16) | La BHE no lleva IVA; pero el flete es actividad de primera categoría y está afecto (**INTERPRETACIÓN**) | **No debería** documentar fletes con BHE (**INTERPRETACIÓN**, P3) | La app **no debería ofrecer** este perfil como opción válida; si el usuario lo declara, mostrar «Precio total» sin IVA y un aviso **solo al transportista** sugiriendo consultar a su contador | Documento incorrecto; el cliente empresa no obtiene crédito fiscal; posible rechazo del gasto |
| **6. Sin inicio de actividades (informal)** | — | El **servicio** está gravado, pero la persona no está inscrita (N17) | **Ninguno**. Eventualmente el cliente empresa podría emitir una BTE (N16; aplicación a fletes **POR VALIDAR**, P4) | **«Precio total»**, sin la palabra «neto» y **sin afirmar** que está exento o que «no lleva IVA» | La app puede parecer avalar la informalidad; el cliente empresa no puede respaldar el gasto ni usar crédito; multa por no dar aviso de inicio (N17) |
| **7. Giro o servicio exento** | — | **No**, solo si existe exención aplicable (en la práctica, flete internacional, N5) | Factura o boleta **exenta** | **«Total — exento de IVA»** con la norma de exención que indique el contador | Declarar exento un flete nacional (no hay exención: N4, N7) |

---

## 5. Cotización comercial vs documento tributario

| Aspecto | Cotización / presupuesto (lo que genera la app) | Documento tributario electrónico (factura, boleta) |
|---|---|---|
| Naturaleza | Oferta comercial: precio, servicio, condiciones, vigencia | Documento exigido por el DL 825 (arts. 53–54) |
| Emisión | Libre, en cualquier formato, sin folio del SII | Con folio autorizado, firma electrónica y envío al SII |
| Efecto en IVA | **Ninguno**: no genera débito ni da crédito fiscal | Débito fiscal para el emisor; la factura da crédito al cliente contribuyente (N11) |
| Numeración | Interna de la cuenta (A-47) | Folio del SII |
| Cuándo | Antes de acordar el servicio | Al prestar o cobrar el servicio, según las reglas de devengo (POR VALIDAR, P6) |

*(Toda la tabla es INTERPRETACIÓN, coherente con N8, N9 y N11.)*

**Leyendas propuestas** (texto fijo, no editable por el usuario; requieren aprobación del propietario, que además está a cargo de los textos legales, AGENTS §5):

- **Siempre**, al pie del documento, del PDF y del enlace público:
  > «Este documento es una cotización. No es factura ni boleta y no reemplaza al documento tributario que corresponda emitir.»
- **Perfil afecto, cliente empresa:**
  > «Valores en pesos chilenos. El IVA (19 %) se detallará en la factura electrónica.»
- **Perfil afecto, cliente persona:**
  > «Precio total con IVA incluido.»
- **Exento (solo si el usuario declaró una exención):**
  > «Servicio exento de IVA según lo declarado por el emisor.»
- **Sin perfil o sin documentos tributarios:** sin leyenda tributaria. Solo «Precio total». **No** escribir «sin IVA», «no afecto» ni «neto».
- **WhatsApp:** agregar al final del texto una versión breve: «Cotización, no es factura ni boleta.»

Fuera del documento del cliente (solo el transportista lo ve): aviso de que la app **no** emite documentos tributarios y enlace al sistema gratuito de facturación del SII (enlace exacto **POR VALIDAR**).

---

## 6. Qué hace la app hoy (según el código)

Fuentes leídas: `data/tax-rules.json`, `src/engine/tax.ts`, `src/shared/clientQuote.ts`, `src/web/components/QuoteView.tsx` (`QuoteDocument`), `PublicQuote.tsx`, `Calculator.tsx` (línea del IVA), `supabase/migrations/20261118000100_esquema_inicial.sql` (restricción del total).

**Lo que está bien**

1. **No suma 19 % por defecto** (A-28, docs/01 §7.7): la regla `iva-afecto-19` tiene `verified: false`, así que `selectableRules` no la ofrece y la cotización va sin IVA. Es coherente con este informe, porque **no todos** los transportistas emiten documentos afectos (perfiles 5–7).
2. **La tasa no está en el código del motor**: viene de `data/tax-rules.json`, versionado, con fuente y fecha (P-06).
3. **El precio elegido es neto** y el IVA es un cálculo aparte: correcto para el motor de márgenes, porque el IVA no es ingreso del transportista.
4. **Redondeo del IVA al peso** (`Math.round(neto × tasa)`) e invariante `total = neto + IVA` reforzada en la base (`client_quotes_total_check`). Para montos enteros, `Math.round` redondea la mitad hacia arriba, que es la práctica habitual (POR VALIDAR, N19).
5. **Los avisos tributarios van al transportista y no al cliente** (`TaxResult.notice`), y la cotización al cliente usa una lista blanca (A-29).
6. El documento se titula **«COTIZACIÓN»**, con número interno y vigencia: no se presenta como factura.

**Lo que podría inducir a error**

1. **«Valor neto» como único monto** (`QuoteDocument` y `whatsappText`) cuando no hay perfil. Para un **cliente persona**, «neto» sugiere que se agregará IVA, o es un precio incompleto según el art. 30 (N18). Para un transportista **sin documentos** (perfil 6), sugiere un IVA que nunca se cobrará. En ambos casos conviene decir **«Precio total»**.
2. **Falta la leyenda** «no es factura ni boleta» en pantalla, PDF, enlace público y WhatsApp (§5).
3. **No se distingue el tipo de cliente** (empresa vs persona). Con la regla afecta activada, el documento mostraría «Neto / IVA / Total» también a consumidores, cuando lo esperable es destacar el total con IVA incluido.
4. **La etiqueta del IVA no indica la tasa** («IVA» en lugar de «IVA (19 %)»).
5. **La opción de `tax-rules.json` «Emito documento afecto a IVA (19 %)» no cubre a quien emite factura y boleta según el cliente**, ni ofrece alternativas («no emito documentos», «exento»).
6. **Reproducibilidad:** `JobRecord.tax` guarda `ruleId` y `amount`, pero no la **tasa** ni la `dataVersion` de las reglas. docs/03 §3D pide que la cotización «conserve la regla con que se calculó»; si la regla cambia, no se podría reconstruir. Es menor (el monto queda guardado), pero conviene guardar `rate` y `dataVersion`.
7. **Etiqueta «Precio que vas a cobrar (neto)»** en `Calculator.tsx`: un usuario que no emite documentos o que cotiza a personas puede escribir el **total** que quiere recibir. Si después se activa el perfil afecto, ese número se trataría como neto y el cliente vería un total 19 % mayor. El riesgo opuesto también existe: escribir un total pensando que es neto subestima el IVA. Esta es la razón principal de la pregunta del perfil (§7.3).

---

## 7. Propuesta fundamentada (NO implementar sin aprobación del propietario)

### 7.1 Opciones

**Opción A — Mantener «siempre neto» y agregar solo el perfil tributario.**
El usuario elige su perfil una vez. Si es afecto: «Neto + IVA (19 %) = Total» para todo cliente. Si no: «Precio total».

- A favor: cambio mínimo sobre lo existente (`applyTax` ya lo hace); motor sin cambios.
- En contra: a un consumidor final le muestra el desglose B2B; la cifra destacada para personas no es el total con IVA incluido (riesgo frente al art. 30, N18).

**Opción B — Perfil tributario + tipo de cliente en cada cotización (recomendada).**
El precio que escribe el transportista sigue siendo **neto** (el motor no cambia). En cada cotización se pregunta «¿A quién le cotizas?»: **Empresa o negocio** (puede pedir factura) o **Persona** (consumidor final).

- Perfil afecto + empresa → «Neto · IVA (19 %) · **Total**».
- Perfil afecto + persona → «**Total con IVA incluido** $X» como cifra principal y, en letra menor, «incluye IVA $Y».
- Sin documentos tributarios / sin perfil → «**Precio total** $X», sin palabras tributarias.
- Exento declarado → «**Total** $X — exento de IVA según lo declarado por el emisor».
- Siempre: leyenda «no es factura ni boleta» (§5).
- A favor: respeta el art. 30 para personas y la práctica neto + IVA entre empresas; el total es exactamente `neto + round(neto × 0,19)`, igual al que calcularía una factura con la misma regla; la restricción `total = neto + IVA` de la base sigue valiendo; reutiliza `applyTax`.
- En contra: una pregunta más por cotización (se puede recordar la última respuesta o asociarla al cliente); para personas el total queda «disparejo» (p. ej., $65.450 para un neto de $55.000).

**Opción C — Permitir escribir el precio con IVA incluido.**
Además de B, un interruptor «Mi precio ya incluye IVA». Se calcula `neto = round(total / 1,19)` e `IVA = total − neto`.

- A favor: coincide con cómo piensan muchos fleteros («cobro 60 lucas») y permite totales redondos para personas.
- En contra: **el motor de márgenes debe usar el neto derivado** (más superficie de errores); **cerca del 16 % de los totales enteros no se pueden obtener** como `neto + round(neto × 0,19)` (calculado en esta sesión para totales entre $1.000 y $200.000). Ejemplo: total $60.004 → neto $50.424 e IVA por diferencia $9.580, pero `round(50.424 × 0,19)` = $9.581, que da un total de $60.005. Si el transportista luego emite la factura desde el neto, el total difiere en $1 de la cotización.

### 7.2 Recomendación

**Opción B**, dejando **C** como mejora posterior solo si el uso real muestra que los transportistas piden totales redondos. Si se adopta C, mostrar al transportista (no al cliente) el aviso «el documento tributario puede diferir en $1 por redondeo». Mientras un contador no valide los perfiles, **mantener `verified: false`** y mostrar «Precio total» (no «Valor neto») en lugar del estado actual.

### 7.3 Datos que hay que preguntar al usuario

1. **Perfil (una vez, en «Mi cuenta» o en la primera cotización):** «¿Cómo documentas tus servicios?»
   - «Emito factura y/o boleta electrónica con IVA» → regla afecta (perfiles 1–4). Ayuda: «Aplica también si estás en renta presunta o Pro Pyme».
   - «Mis servicios están exentos de IVA (lo confirmó mi contador)» → regla exenta (perfil 7).
   - «Todavía no emito documentos tributarios» → sin IVA (perfil 6), con aviso al transportista y enlace al SII.
   - «No sé» → igual que sin perfil, con el aviso «Consulta al SII o a tu contador».
   - **No** ofrecer «boleta de honorarios» como opción válida para fletes hasta que un contador lo confirme (P3).
2. **Tipo de cliente (por cotización):** «Empresa o negocio» / «Persona». Valor por defecto: la última elección.
3. **Opcional, a decidir:** mostrar el **RUT del emisor** en la cotización. Ayuda al cliente empresa a verificar que podrá recibir factura, pero es un dato personal (docs/06); por defecto, desactivado.

### 7.4 Redondeo del IVA

- **Propuesta:** IVA = `round(neto × tasa)` al **peso entero**, mitad hacia arriba (lo que hace hoy `applyTax`); `total = neto + IVA`. El neto sigue siendo la fuente de verdad.
- **POR VALIDAR (N19, P5):** que el SII, en el formato DTE vigente, calcule el IVA sobre el neto total del documento con redondeo al entero (y no línea por línea). La cotización tiene una sola línea, así que la diferencia práctica es mínima.
- **No confundir** con el redondeo de **pagos en efectivo** a múltiplos de $10 (Ley 20.956, POR VALIDAR): se aplica al pago, no al IVA ni a la cotización.
- Guardar en el registro la **tasa** y la `dataVersion` usadas (§6, punto 6).

### 7.5 Decisiones que requiere el propietario

| ID propuesto | Decisión | Opciones |
|---|---|---|
| D-IVA-1 | Modelo de presentación del IVA | A / **B (recomendada)** / B + C |
| D-IVA-2 | ¿Basta este informe (fuentes SII vía buscador) o se exige validación por contador, o GPT Deep Research según la regla del propietario, antes de poner `verified: true`? | Contador / Deep Research / ambos / basta este informe |
| D-IVA-3 | Texto exacto de las **leyendas** de §5 (texto legal: requiere aprobación, AGENTS §5) | Aprobar / modificar |
| D-IVA-4 | Mientras no haya perfil: ¿cambiar «Valor neto» por **«Precio total»** en documento, PDF, enlace y WhatsApp? | Sí (recomendado) / mantener |
| D-IVA-5 | Opciones del perfil tributario (§7.3.1), incluida la exclusión de «boleta de honorarios» | Aprobar / modificar |
| D-IVA-6 | Preguntar el **tipo de cliente** por cotización | Sí / no |
| D-IVA-7 | Mostrar el **RUT del emisor** en la cotización | No por defecto (recomendado) / opcional / obligatorio |
| D-IVA-8 | Regla de redondeo (§7.4) y guardar `rate` + `dataVersion` en el registro | Aprobar / modificar |
| D-IVA-9 | Ampliar `data/tax-rules.json` con reglas «afecta 19 %», «exenta» y «sin documento tributario», con fuentes de §2 | Aprobar / modificar |
| D-IVA-10 | ¿Incluir un enlace informativo al SII (inicio de actividades, facturación gratuita) en la ayuda del transportista? | Sí / no |

Hasta que el propietario decida, **no se modifica** código, datos (`data/tax-rules.json`), textos de la interfaz ni otros documentos.

---

## 8. Preguntas abiertas para un contador

- **P1.** ¿Confirma que un fletero persona natural en **renta presunta (art. 34)** o en **Pro Pyme** está afecto a IVA por el flete nacional y debe emitir factura o boleta electrónica según el cliente?
- **P2.** ¿Hay algún caso de flete **nacional** liviano exento de IVA (p. ej., servicios a zonas francas o a exportadores) que la app deba contemplar?
- **P3.** ¿Puede un transportista documentar un flete con **boleta de honorarios**? Si lo hace, ¿qué consecuencias tiene para él y para el cliente empresa?
- **P4.** Si una empresa contrata un flete a una persona **sin inicio de actividades**, ¿corresponde que la empresa emita una **BTE**? ¿Qué pasa con el IVA de ese servicio?
- **P5.** ¿Cuál es la regla oficial de **redondeo del IVA** en factura y boleta electrónica (sobre el total neto del documento o por línea; mitad hacia arriba)?
- **P6.** ¿Cuándo nace el **débito fiscal** en un flete: al prestar el servicio, al facturar o al cobrar? ¿Cambia algo si se cobra un anticipo al aceptar la cotización?
- **P7.** ¿Hay **retención de IVA** o cambio de sujeto en algún caso de flete (p. ej., clientes grandes, rubros como chatarra, ganado o productos agrícolas, o transportistas incluidos en listas del SII)?
- **P8.** Para el consumidor final, ¿basta mostrar «total con IVA incluido» en la cotización o conviene desglosar el IVA como en la boleta?
- **P9.** ¿El flete de un **fletero que además cobra peonetas o embalaje** tiene el mismo tratamiento de IVA (servicio único afecto) o hay partidas con otro tratamiento?
- **P10.** ¿Algún cambio tributario de 2025–2026 (por ejemplo, el «Plan de Reconstrucción Nacional» citado por fuentes secundarias para Pro Pyme) altera estas conclusiones?
- **P11.** (Fuera de la cotización, para el motor de costos, docs/03 §3B) ¿Qué transportistas pueden **recuperar el IVA del diésel** como crédito fiscal y el **Impuesto Específico al diésel** (FAQ SII 001_130_1542, no abierta)? Afecta si el costo de combustible se modela neto o bruto.

---

## 9. Fuentes consultadas (18-11-2026)

Páginas oficiales obtenidas **solo como fragmentos del buscador** (no se pudieron abrir: sii.cl y bcn.cl bloqueados en la red de esta sesión):

- SII, Circular N° 50 de 2022 (Ley 21.420): https://www.sii.cl/normativa_legislacion/circulares/2022/circu50.pdf
- SII, JA 178 de 2001 (transporte de carga nacional afecto): https://www.sii.cl/pagina/jurisprudencia/adminis/2001/ventas/ja178.htm
- SII, JA 2715 de 2007 (art. 12 E N° 2, transporte internacional): https://www.sii.cl/pagina/jurisprudencia/adminis/2007/ventas/ja2715.htm
- SII, FAQ flete de exportación hasta el puerto: https://www.sii.cl/preguntas_frecuentes/impuestos_mensuales/001_130_4124.htm
- SII, FAQ persona que trabaja sola (art. 12 E N° 12): https://www.sii.cl/preguntas_frecuentes/impuestos_mensuales/001_130_1036.htm
- SII, FAQ retención de IVA a transportistas de carga: https://www.sii.cl/preguntas_frecuentes/impuestos_mensuales/001_130_1204.htm
- SII, noticia Res. Ex. 110 de 2024: https://www.sii.cl/noticias/2024/021224noti02smn.htm
- SII, Res. Ex. 154 de 2025: https://www.sii.cl/normativa_legislacion/resoluciones/2025/reso154.pdf
- SII, Res. Ex. 121 de 2024 (art. 53): https://www.sii.cl/normativa_legislacion/resoluciones/2024/reso121.pdf
- SII, Circular N° 4 de 2017 (crédito fiscal, acuse de recibo): https://www.sii.cl/normativa_legislacion/circulares/2017/circu4.pdf
- SII, Circular N° 62 de 2020 (Pro Pyme): https://www.sii.cl/normativa_legislacion/circulares/2020/circu62.pdf
- SII, FAQ boleta de honorarios: https://www.sii.cl/preguntas_frecuentes/boleta_honorario_electr/001_120_3474.htm
- SII, FAQ inicio de actividades: https://www.sii.cl/preguntas_frecuentes/rut_inicio_actividades/001_105_2030.htm
- ChileAtiende, BTE: https://www.chileatiende.gob.cl/fichas/12101-boleta-de-prestacion-de-servicios-de-terceros-electronica-bte
- SERNAC, articulado Ley 19.496: https://sernac.cl/portal/609/w3-propertyvalue-58774.html

Fuentes secundarias usadas solo como pista (**POR VALIDAR**): Transtecnia (renta presunta, cambio de sujeto), Círculo Verde (boleta electrónica e IVA separado, motoboys), Buk y Nubox (Ley 21.210, boleta electrónica), vLex (Oficio SII N° 2346 de 2022), Simplo (campos DTE).

Leyes de referencia en leychile (no abiertas; identificadores por confirmar): DL 825 (`idNorma=6369`), DL 824 (`idNorma=6368`), Ley 19.496 (`idNorma=61438`), DL 830 Código Tributario, Ley 21.420, Ley 21.210, Ley 20.727.
