# 10 · Guía de diseño UX/UI — v4

**Nombre comercial: PENDIENTE.** Usar `[Marca]` en los prototipos y textos hasta aprobación explícita. **No reutilizar** el nombre de trabajo descartado.

**Estado de aprobación (16-11-2026):** el propietario aprobó expresamente la **dirección visual v4** y las pantallas **inicio** + **calculadora con comparación integrada**. Claude entregó después las demás pantallas en la misma línea visual y ChatGPT las revisó. El 16-11-2026 el propietario comunicó que la v4 completa (navegación móvil y escritorio de tres columnas) es la **dirección general aprobada**, que las pantallas sirven de referencia y que **no se necesitan más exploraciones visuales**. Los criterios A-21 a A-29 están pendientes de ratificación escrita en el PR #34. Programar sigue sin autorización.

## 1. Sistema visual

- Base: **blanco**, superficies gris muy claro, **azul sobrio** en acciones principales y acentos, **grafito** para tipografía.
- Jerarquía: cifras clave grandes, etiquetas legibles, controles amplios y accesibles; sin saturar la pantalla de campos.
- Aspecto: herramienta profesional de trabajo, no mensajería. Sin amarillo ni verde como color principal.
- Tarjetas de borde discreto, esquinas moderadas y espaciado consistente.
- Tipografía e iconografía claras; si un icono no es inequívoco, acompañarlo con texto.
- Valores de las maquetas aprobadas, que sirven de punto de partida para los *tokens* de la implementación:

| Uso | Valor |
|---|---|
| Fondo / superficies | `#FFFFFF` / `#F7F8FA` |
| Azul principal / oscuro / suave | `#33507A` / `#253C5E` / `#EEF2F8` |
| Texto / secundario | `#1F2933` / `#52606D` |
| Bordes / campos | `#E4E7EC` / `#CBD2D9` |
| Aviso / error | `#FBF7EE` con `#6B4E16` / `#FDF0EF` con `#7A231C` |
| Tipografía | Inter; cifras con `tabular-nums` |
| Radios | Tarjetas 12 px; botones y campos 10 px; botones de 48–52 px de alto |

  Un ajuste de contraste por accesibilidad no cuenta como rediseño.
- **Paridad teléfono/computador (A-49, aprobada):** la app se diseña para usarse **plenamente en teléfonos y en computadores (PC/notebook)**, con las mismas funciones principales (cálculo, cotización, PDF, historial, vehículos, cuenta y sincronización). Teléfono: controles táctiles cómodos (≥ 44 px) y sin desplazamiento horizontal. Computador: diseño que aprovecha el ancho, con navegación por teclado y foco visible. Maquetar *mobile-first* es una técnica de CSS y **no** implica prioridad funcional ni comercial del móvil. Sin rediseñar la v4.
- En móvil, una experiencia fluida con **formulario y resultados en una pantalla desplazable** para la calculadora; no exigir una pantalla por pregunta. En escritorio, **formulario + mapa/alternativas + desglose/precio/cotización** en columnas.

## 2. Pantallas

| Vista | Contenido previsto | Estado |
|---|---|---|
| Inicio | Propuesta de valor, secuencia de uso, «Calcular un flete», «Continuar con Google», información de gratuidad | **Aprobada** (A-20) |
| Calculadora y rutas | Vehículo, base opcional, A, B, regreso opcional, hora de salida, ayudantes, tiempos; botón calcular y resultados debajo | **Aprobada** (A-20) |
| Panel del transportista | Vehículos, pendientes, cotizaciones enviadas, por realizar y por cobrar, alertas por datos faltantes | Referencia (A-21) |
| Mi vehículo | Tipo, marca, modelo, año, motor, combustible; rendimientos/costos/dimensiones opcionales, editables | Referencia (A-21) |
| Desglose | Tramos, gastos desembolsados, desgaste, gastos fijos, remuneración objetivo, procedencia de datos | Referencia (A-21) |
| Mi precio | Margen, sugerido si procede, precio decidido por transportista, comparación con meta | Referencia (A-21) |
| Cotización para cliente | Datos autorizados, precio, IVA si corresponde, condiciones, vigencia, PDF, WhatsApp, enlace protegido | Referencia (A-21) |
| Mis trabajos | Borradores/enviadas/aceptadas/realizadas/rechazadas y pagos confirmados por separado | Referencia (A-21) |
| Errores y datos parciales | Falta rendimiento/TAG/fijos; comparación indeterminada; mapa fallido; límite agotado y modo manual | Referencia (A-21) |
| Escritorio (PC/notebook) | Misma experiencia y **mismas funciones** que en el teléfono, aprovechando el ancho (columnas), sin duplicar cálculos ni reglas | Referencia (A-21); paridad **aprobada** (A-49) |

**Importante:** el mockup no es código funcional ni evidencia de que Google admita mapas con varias polilíneas, peajes exactos o cobertura de tráfico en toda ruta.

## 3. Recorrido base

1. El usuario puede **calcular sin cuenta** o iniciar sesión con Google para guardar.
2. Selecciona o registra vehículo; los datos avanzados pueden completarse después.
3. Indica origen A, destino B, **base → A** opcional y **B → base** opcional. No se agregan paradas adicionales ni se optimiza un itinerario.
4. Define hora, carga/descarga, ayudantes y servicios.
5. Obtiene comparativa de **dos rutas cuando Google las proporciona**, con mapa visible **de una sola ruta a la vez** y las dos fichas de resultados.
6. Revisa desglose y completa costos desconocidos o mantiene el estado **«Costo parcial»**.
7. Elige el precio que cobra y genera una cotización que **no incluye costos internos**.
8. Si inició sesión, guarda vehículo, cotizaciones, estados y registros manuales de viajes y combustible.

## 4. Comparador y tráfico

> **Actualización del 17-11-2026:** sin mapa integrado (A-35), comparación opcional con cupo (A-36) y tráfico en vivo fuera de la primera implementación (A-37). Los puntos de esta sección sobre mapa y tráfico quedan como antecedente.

- **Cálculo ordinario:** la ruta más rápida/habitual frente a una con preferencia por evitar peajes. El usuario compara km, duración, combustible, TAG, desgaste, tiempo y precio estimado.
- **Mapa (A-22, pendiente de ratificación):** un camino visible a la vez con selector, y enlace «Abrir en Google Maps». Maps Embed está propuesto ([02 §8](02-arquitectura.md)); sus términos se revisan en #15.
- **Tráfico actualizado (A-23, pendiente de ratificación):** botón claramente visible «Actualizar con tráfico»; **nunca** se consulta en cada modificación del formulario. Sin él, la duración se rotula «duración habitual»; con él, «con tráfico de las HH:MM» (hora de la consulta). Activa el SKU Pro de Routes (verificado, ver [04](04-fuentes-de-datos.md)). Se mantiene el modo manual. No confundir `duration - staticDuration` con minutos de congestión observados.
- **Costo de rutas:** cuando faltan peajes/TAG o consumos comparables, **no** mostrar una ruta como la más barata con certeza; comunicar el dato faltante y, cuando proceda, un umbral matemático condicionado.

## 5. Copy claro y precisión económica

La presentación al usuario puede usar palabras cotidianas, conservando el concepto técnico completo en ayuda contextual:

| Interfaz de usuario (A-25) | Definición técnica |
|---|---|
| «Lo que pagas en el viaje» | Gastos desembolsados estimados (D) |
| «Desgaste del vehículo» | Costo de desgaste devengado (W) |
| «Parte de tus gastos fijos» | Costos fijos asignados (CF) |
| «Lo que quieres ganar por tu trabajo» | Remuneración objetivo (R), **una meta, no pago** |
| «Te queda después de pagar el viaje» | Saldo estimado tras desembolsos (P−D) |
| «Te queda después de todos los costos» | Ingreso estimado después de costos (P−D−W−CF) |
| «Sobre lo que querías ganar» | Diferencia respecto de R |
| «Costo parcial» | Cota inferior del costo: faltan datos y el costo real puede ser mayor |
| «Declarado por ti» | Procedencia: DECLARADO |

**A-25 (pendiente de ratificación):** términos sencillos con una explicación breve en pantalla; los formales quedan en «Qué es», «Cómo calculamos» y la documentación (#39).

**No llamar «ganancia real», «saldo bancario» ni «dinero cobrado» a valores estimados.**

### Cuando falta información

- Mostrar importes conocidos, faltantes y procedencia: **«Costo parcial»**.
- **A-26 (pendiente de ratificación):** no impedir que el usuario cotice aunque falten datos, especialmente gastos fijos. Se muestran el costo como «$X o más», el precio sugerido como «al menos $X» (marcado como indicativo) y lo que queda como «como máximo». Nunca se presenta como rentabilidad segura. Reglas exactas en [03 §3C](03-motor-de-costos.md).
- Separar la advertencia interna de costos faltantes de los documentos que recibe el cliente; el cliente no ve el cálculo privado.

### IVA y estado comercial

- IVA **configurable (A-28)** según el perfil tributario y solo con reglas verificadas (#16, #37); nunca 19 % para todos por defecto. Sin perfil, la cotización muestra el neto. Detalle en [03 §3D](03-motor-de-costos.md).
- Cotización **aceptada ≠ servicio realizado ≠ pagado**. No computar una cotización aceptada como ingreso cobrado.

## 6. Cuota, errores y modos manuales

- Si falla el mapa, permitir introducir km/minutos **por tramo**, con atribución «declarado por ti» y enlace a Google Maps.
- Si se agota la cuota, modo manual; **no se anuncia ninguna hora de reinicio (A-27)**. Texto: «El cálculo automático de rutas no está disponible por ahora. Puedes seguir ingresando los kilómetros de cada tramo.»
- El modo de tráfico actualizado se implementaría solo después de aprobar las llamadas, precio y límite efectivo.
- No afirmar «sin costo para el proyecto» solo porque el servicio tenga un tramo gratuito: el gasto técnico depende de cuota, retrasos y facturación.

## 7. Ejemplo ilustrativo de referencia

**Todos los importes son ficticios**, no tarifas de mercado. Ruta con autopista: 57,4 km, 74 min de conducción, 60 min de carga/descarga; combustible $5.023, peajes $4.200, ayudante $15.000; D = **$24.223**. Desgaste W = **$1.779**; fijos CF = **$3.350**; remuneración objetivo R = **$13.400**. Costo total = **$42.752**; margen propuesto 15 %, precio sugerido redondeado **$51.000**; transportista decide cobrar **$55.000 netos**. Saldo después de desembolsos **$30.777**, ingreso estimado después de costos **$25.648**, diferencia sobre la meta **+$12.248**.

Alternativa evitando peajes: **$44.199 estimados** con los supuestos del prototipo. La afirmación «autopista $1.447 menos» solo es válida **condicionada a los peajes y rendimientos declarados**.

## 8. Antes de programar

> **Estado vigente (20-11-2026):** la programación se autorizó por etapas (A-44 y siguientes) y la lista de abajo se conserva como antecedente del 16-11. La interfaz plegable del inventario y los recursos (pedido del propietario) está en [21 §17.5](21-diseno-datos-cotizador.md) y su integración en «Cotizar» en [22 §10](22-diseno-integracion-cotizador.md), detrás de flags apagadas.

- Dirección v4 completa comunicada como aprobada (A-21); **ratificar en el PR #34**. El copy final se ajusta en las pruebas de comprensión sin cambiar el significado.
- Aprobar la **propuesta de arquitectura** ([02 §8](02-arquitectura.md)) y el proveedor de cuentas (#35).
- Verificar en el proyecto real Maps Embed/Routes, SKU de tráfico y control de consumo (#19), sin exceder el gasto autorizado.
- Definir reglas de IVA verificadas (#16) y condiciones jurídicas de la cotización (#17).
- Backlog actualizado el 16-11-2026 sin cerrar ni renumerar (ver [08](08-hoja-de-ruta.md)).
- **Nombre comercial pendiente**.
- Programación, despliegue y merge de PR siempre requieren autorización expresa del propietario.

**Nota sobre las maquetas:** algunas usan todavía términos formales («Gastos desembolsados», «Remuneración objetivo»); en la implementación mandan los términos de la §5. La pantalla de estados se corrigió el 16-11-2026 con A-26 y A-27.

La guía es una **especificación documental**, no permiso de crear cuentas, escribir funcionalidades, desplegar, activar facturación o integrar `main`.
