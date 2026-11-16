# 01 · Alcance funcional — primer lanzamiento gratuito

**Estado:** dirección funcional actualizada el 16-11-2026. El propietario aprobó **la identidad blanca/azul/grafito y las pantallas inicial y calculadora de v4**; y el 16-11-2026 el propietario aprobó la **extensión completa del diseño v4** y los criterios funcionales (decisiones A-21 a A-29 en [07](07-decisiones.md)). La arquitectura y las cuotas están propuestas en [02](02-arquitectura.md) y esperan aprobación. Nombre comercial **PENDIENTE**. Ver [guía UX v4](10-diseno-ux.md).

## 1. Qué se construye primero

Una herramienta web **gratuita para cotizar fletes y mudanzas pequeñas o medianas en Chile**, orientada a transportistas que utilizan auto, camioneta, furgón u otro vehículo liviano de trabajo. **Camiones de alto tonelaje quedan fuera del alcance inicial.** La inclusión y reglas específicas de motocicletas y camiones livianos necesitan validación técnica.

**No es todavía un marketplace ni una plataforma de logística elástica.** El usuario principal inicial es el transportista que fija precios para sus propios clientes.

## 2. Acceso y perfiles

- **Calcular sin cuenta:** permitir probar la calculadora, con datos temporales y sin historial en nube.
- **Registro gratuito con Google:** cuenta de transportista para guardar vehículos, parámetros e historial; alternativa por correo **por especificar**.
- Perfil: datos comerciales necesarios para una cotización y preferencias de presentación; minimizar datos personales.
- Varios vehículos por cuenta. Registro progresivo, sin exigir información desconocida para comenzar.
- Vehículo: categoría, marca, modelo, año, motorización y combustible; **km/L urbano y carretera opcionales**, además de capacidad y dimensiones de carga cuando sea pertinente.
- Para cada costo faltante, mostrar su efecto y permitir completarlo más adelante. No inventar rendimientos.
- Combustible no expresado en litros (por ejemplo, eléctrico): requiere modelo de cálculo específico y aprobación; no aplicar por defecto fórmulas de gasolina/diésel.

## 3. Crear y cotizar un traslado

**Recorrido simple:** base opcional → **A (recogida)** → **B (entrega)** → regreso opcional a base. No hay múltiples entregas, optimización de paradas ni rutas de alto tonelaje en la v1.

El transportista puede introducir y revisar:

1. Vehículo, origen A, destino B, base y regreso opcionales, fecha/hora de salida.
2. Ruta usual o rápida y ruta evitando peajes, **cuando el proveedor devuelva opciones válidas**.
3. Distancia y duración estimadas por tramo, y enlace para verificar en Google Maps. **Tráfico actualizado bajo demanda (A-23, comunicada por el propietario, pendiente de ratificación en PR #34):** botón visible, nunca en cada cambio del formulario; sin él se usa la duración habitual y siempre existe el modo manual. Activa el SKU Pro de Routes (ver [04](04-fuentes-de-datos.md)).
4. Precio de combustible de fuente oficial con fecha **o declarado por el usuario**, editable; rendimiento propio o referencia correctamente identificada, si existe y puede usarse.
5. Peajes/TAG por ruta y horario cuando haya datos confiables; siempre con entrada manual y opción «no sé» distinta de «0».
6. Tiempo de trabajo, carga/descarga, pisos como minutos declarados, ayudantes, estacionamiento, materiales, urgencia como recargo y otros costos.
7. Desgaste, gastos fijos asignables, remuneración objetivo y margen deseado, sin doble contabilización.
8. Precio sugerido cuando exista base suficiente, precio propio definido por el transportista y resultado económico estimado con **estado de completitud**. Si faltan datos, permitir **cotización manual/indicativa bajo advertencia explícita**, sin fingir una ganancia comprobada.

**Dos rutas, dos cálculos comparables:** si un componente relevante falta, la interfaz muestra «Costo parcial» y no asegura cuál ruta es más barata. El tráfico afecta la duración; **no implica inventar litros adicionales** por congestión. El rendimiento urbano/carretera/mixto se elige o valida con datos suficientes.

El diseño v4 **muestra un camino a la vez** y compara los importes de las dos alternativas debajo; no necesita dos polilíneas superpuestas. **Maps Embed** es candidato para esa visualización, y **Routes** lo es para km/duración estructurados. La coherencia de ambos resultados y condiciones de Google se verificará antes de programar. La alternancia es la decisión A-22 (comunicada por el propietario, pendiente de ratificación en PR #34).

El modo manual funciona cuando fallan APIs o se agotan cuotas. No usar scraping de Google Maps.

## 4. Cotización para el cliente

Generar **PDF o documento compartible** con precio fijado por el transportista, fecha, descripción del servicio, inclusiones/exclusiones, condiciones y vigencia. Puede enviar por WhatsApp o descargarlo.

- La **vista del cliente** no revela desglose de combustible, peajes internos, desgaste, gastos fijos, sueldo objetivo, márgenes ni información privada innecesaria.
- Enlaces compartidos: acceso, expiración, revocación y minimización de datos **por diseñar**.
- IVA y tipo de documento conforme a situación tributaria; **no aplicar 19 % automáticamente a todos** (#16).
- El historial puede distinguir borrador/enviada/aceptada/rechazada; **aceptada ≠ servicio ejecutado ni dinero recibido**.
- El cálculo y PDF básicos son gratis. Marca/plantillas personalizadas avanzadas podrían ser Pro posteriormente.

## 5. Funciones gratuitas para validar el mercado

Incluye obligatoriamente: calculadora, mapas/rutas según viabilidad y cuotas, costos editables, guardado de vehículos, cotizador PDF, historial básico, y **registro manual de viajes reales y cargas de combustible**. Rendimiento «lleno a lleno» calculado con información confirmada por el transportista puede ser gratuito.

**Meta del lanzamiento:** saber si los transportistas lo utilizan para cotizaciones reales, regresan, generan documentos y reportan que los cálculos les ayudan. No medir solo registros.

## 6. Fuera del primer lanzamiento

- Marketplace de solicitudes y ofertas, despacho de trabajos o logística elástica.
- Comparador para quien «necesita transportar» basado en ofertas inexistentes, comparador de categorías y evaluador de cotizaciones externas como producto para particulares.
- Pagos, cobro por servicio, suscripciones operativas, IA, lectura automática de fotos, calibración avanzada Pro.
- Flotas empresariales complejas, optimización de entregas, mapa para camiones de alto tonelaje, GPS de seguimiento, ERP y aplicación nativa.

**Evolución futura sin escoger modelo:** (A) marketplace de fletes, (B) logística elástica o (C) combinación. No construir backend de despacho prematuramente.

## 7. Reglas transversales

1. Datos **MEDIDOS, DECLARADOS, OFICIALES con fecha, ESTIMADOS o FALTANTES** deben distinguirse; un dato desconocido nunca equivale a cero.
2. «Costo estimado» si hay cobertura suficiente; **«Costo parcial»** si falta algún componente importante. La falta de gastos fijos no bloqueará por sí sola el avance: se puede cotizar bajo advertencia, con resultado parcial, sin precio recomendado como plenamente fundamentado.
3. La remuneración del propietario es una **meta**, no desembolso realizado.
4. Las rutas y el tráfico son estimaciones externas; el resultado matemático debe ser auditable y su versión reproducible. **No prometer hora concreta de reinicio de cuota** hasta verificarla en el proveedor y los controles propios.
5. Reducir campos de ingreso con progresividad, **sin sacrificar transparencia**.
6. La interfaz usa **lenguaje sencillo en primer nivel**, con definición formal en ayudas («Qué es») y documentos: por ejemplo, «Lo que pagas en el viaje» = gastos desembolsados, «Lo que quieres ganar» = remuneración objetivo. No llamar «ganancia real» a una estimación.
7. El IVA es **condicional a situación tributaria validada** (#16); no se suma 19 % a todos los transportistas por defecto.
8. La versión gratuita debe ser utilizable cotidianamente; Pro es futuro, no condición para calcular.
9. Facturación técnica en Google Cloud **es aceptable como posibilidad**, pero habilitar APIs con riesgo de cobro necesita autorización y controles; inicialmente **$0 de cargos variables autorizados**.
