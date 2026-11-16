# 10 · Guía de diseño UX/UI — v4

**Nombre comercial: PENDIENTE.** Usar `[Marca]` en los prototipos y textos hasta aprobación explícita. **No reutilizar** el nombre de trabajo descartado.

**Estado de aprobación (16-11-2026):** el propietario aprobó expresamente la **dirección visual v4** y las pantallas **inicio** + **calculadora con comparación integrada**. Claude entregó posteriormente las demás pantallas en la misma línea visual (documento visual v4 completo, cinco páginas); ChatGPT las revisó y recomendó usarlas como referencia, **pero todavía no consta aprobación expresa del propietario para esa extensión ni autorización para programar**.

## 1. Sistema visual

- Base: **blanco**, superficies gris muy claro, **azul sobrio** en acciones principales y acentos, **grafito** para tipografía.
- Jerarquía: cifras clave grandes, etiquetas legibles, controles amplios y accesibles; sin saturar la pantalla de campos.
- Aspecto: herramienta profesional de trabajo, no mensajería. Sin amarillo ni verde como color principal.
- Tarjetas de borde discreto, esquinas moderadas y espaciado consistente.
- Tipografía e iconografía claras; si un icono no es inequívoco, acompañarlo con texto.
- Los tonos exactos, tipografía definitiva y componentes **se fijarán con el diseño final**; no inferir un design system cerrado de capturas ilustrativas.
- En móvil, una experiencia fluida con **formulario y resultados en una pantalla desplazable** para la calculadora; no exigir una pantalla por pregunta. En escritorio, **formulario + mapa/alternativas + desglose/precio/cotización** en columnas.

## 2. Pantallas

| Vista | Contenido previsto | Estado |
|---|---|---|
| Inicio | Propuesta de valor, secuencia de uso, «Calcular un flete», «Continuar con Google», información de gratuidad | **Dirección y muestra aprobadas** |
| Calculadora y rutas | Vehículo, base opcional, A, B, regreso opcional, hora de salida, ayudantes, tiempos; botón calcular y resultados debajo | **Dirección y muestra aprobadas** |
| Panel del transportista | Vehículos, pendientes, cotizaciones enviadas, por realizar y por cobrar, alertas por datos faltantes | Extensión v4 entregada; aprobación final pendiente |
| Mi vehículo | Tipo, marca, modelo, año, motor, combustible; rendimientos/costos/dimensiones opcionales, editables | Extensión v4 entregada; aprobación final pendiente |
| Desglose | Tramos, gastos desembolsados, desgaste, gastos fijos, remuneración objetivo, procedencia de datos | Extensión v4 entregada; aprobación final pendiente |
| Mi precio | Margen, sugerido si procede, precio decidido por transportista, comparación con meta | Extensión v4 entregada; aprobación final pendiente |
| Cotización para cliente | Datos autorizados, precio, IVA si corresponde, condiciones, vigencia, PDF, WhatsApp, enlace protegido | Extensión v4 entregada; aprobación final pendiente |
| Mis trabajos | Borradores/enviadas/aceptadas/realizadas/rechazadas y pagos confirmados por separado | Extensión v4 entregada; aprobación final pendiente |
| Errores y datos parciales | Falta rendimiento/TAG/fijos; comparación indeterminada; mapa fallido; límite agotado y modo manual | Extensión v4 entregada; aprobación final pendiente |
| Escritorio | Misma experiencia en 3 columnas, sin duplicar cálculos ni reglas | Extensión v4 entregada; aprobación final pendiente |

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

- **Cálculo ordinario:** la ruta más rápida/habitual frente a una con preferencia por evitar peajes. El usuario compara km, duración, combustible, TAG, desgaste, tiempo y precio estimado.
- **Mapa:** alternancia de camino visible y enlace «Abrir en Google Maps»; Maps Embed es candidato pendiente de evaluación técnica/términos.
- **Tráfico actualizado:** **recomendación técnica pendiente de ratificación**: pedirlo **solo bajo acción expresa** para proteger las cuotas y evitar solicitudes en cada modificación del formulario. Las tarifas/SKU Pro y disponibilidad real deben verificarse. No confundir `duration - staticDuration` con minutos de congestión observados.
- **Costo de rutas:** cuando faltan peajes/TAG o consumos comparables, **no** mostrar una ruta como la más barata con certeza; comunicar el dato faltante y, cuando proceda, un umbral matemático condicionado.

## 5. Copy claro y precisión económica

La presentación al usuario puede usar palabras cotidianas, conservando el concepto técnico completo en ayuda contextual:

| Interfaz de usuario (criterio recomendado) | Definición técnica |
|---|---|
| «Lo que pagas en el viaje» | Gastos desembolsados estimados (D) |
| «Desgaste del vehículo» | Costo de desgaste devengado (W) |
| «Parte de tus gastos fijos» | Costos fijos asignados (CF) |
| «Lo que quieres ganar por tu trabajo» | Remuneración objetivo (R), **una meta, no pago** |
| «Te queda después de pagar el viaje» | Saldo estimado tras desembolsos (P−D) |
| «Te queda después de todos los costos» | Ingreso estimado después de costos (P−D−W−CF) |
| «Sobre lo que querías ganar» | Diferencia respecto de R |

**No llamar «ganancia real», «saldo bancario» ni «dinero cobrado» a valores estimados.**

### Cuando falta información

- Mostrar importes conocidos, faltantes y procedencia: **«Costo parcial»**.
- **Recomendación revisada, pendiente de ratificación:** no impedir que el usuario prepare una cotización con **precio manual** aunque falten algunos datos, especialmente gastos fijos; marcarlo como **indicativo** y no inventar precio sugerido o ganancia completa.
- Separar la advertencia interna de costos faltantes de los documentos que recibe el cliente; el cliente no ve el cálculo privado.

### IVA y estado comercial

- IVA **según situación tributaria verificada**, nunca 19 % para todos por defecto. Ver investigación #16.
- Cotización **aceptada ≠ servicio realizado ≠ pagado**. No computar una cotización aceptada como ingreso cobrado.

## 6. Cuota, errores y modos manuales

- Si falla el mapa, permitir introducir km/minutos **por tramo**, con atribución «declarado por ti» y enlace a Google Maps.
- Si se agota la cuota, modo manual; **no prometer que volverá a las 05:00 o a una hora fija** sin confirmación del límite aplicado.
- El modo de tráfico actualizado se implementaría solo después de aprobar las llamadas, precio y límite efectivo.
- No afirmar «sin costo para el proyecto» solo porque el servicio tenga un tramo gratuito: el gasto técnico depende de cuota, retrasos y facturación.

## 7. Ejemplo ilustrativo de referencia

**Todos los importes son ficticios**, no tarifas de mercado. Ruta con autopista: 57,4 km, 74 min de conducción, 60 min de carga/descarga; combustible $5.023, peajes $4.200, ayudante $15.000; D = **$24.223**. Desgaste W = **$1.779**; fijos CF = **$3.350**; remuneración objetivo R = **$13.400**. Costo total = **$42.752**; margen propuesto 15 %, precio sugerido redondeado **$51.000**; transportista decide cobrar **$55.000 netos**. Saldo después de desembolsos **$30.777**, ingreso estimado después de costos **$25.648**, diferencia sobre la meta **+$12.248**.

Alternativa evitando peajes: **$44.199 estimados** con los supuestos del prototipo. La afirmación «autopista $1.447 menos» solo es válida **condicionada a los peajes y rendimientos declarados**.

## 8. Antes de programar

- Confirmación del propietario para **todas las pantallas extendidas y el copy final**.
- Decisión de arquitectura de cuentas, alojamiento, respaldo, URLs compartidas y permisos.
- Verificar Maps Embed/Routes, SKU de tráfico y control de consumo sin exceder el gasto autorizado.
- Definir impuestos y condiciones jurídicas de la cotización.
- Reconciliar los issues y épicas antiguos; **no cerrar ni renumerar todavía sin orden explícita**.
- **Nombre comercial pendiente**.
- Programación, despliegue y merge de PR siempre requieren autorización expresa del propietario.

La guía es una **especificación documental**, no permiso de crear cuentas, escribir funcionalidades, desplegar, activar facturación o integrar `main`.
