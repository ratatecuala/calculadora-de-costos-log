# Calculadora y cotizador de fletes — nombre pendiente

> **Nombre comercial:** PENDIENTE DE DECISIÓN. Se descartó el nombre usado en documentos anteriores. El nombre técnico del repositorio no representa la marca futura.

Herramienta web para **transportistas independientes y fletes livianos en Chile**. El primer lanzamiento será una **calculadora gratuita de costos, rutas y cotizaciones profesionales**, diseñada prioritariamente para teléfono móvil.

**Propuesta de valor:** ayudar a calcular cuánto cuesta ejecutar un traslado, comparar alternativas de ruta y decidir qué precio cobrar, sin presentar estimaciones como datos exactos.

## Estado real

| Elemento | Estado |
|---|---|
| Etapa actual | E0: redefinición del producto, UX/UI y validaciones técnicas |
| Aplicación | **No hay código funcional ni despliegue** |
| Diseño | **Diseño v4 completo aprobado** (16-11-2026): blanco, azul sobrio y grafito, navegación móvil y escritorio de tres columnas ([guía UX](docs/10-diseno-ux.md)) |
| Arquitectura | **Propuesta de cierre** en revisión ([02 §8](docs/02-arquitectura.md), #35) |
| Repositorio | Público, con documentación propuesta en PR [#34](https://github.com/ratatecuala/calculadora-de-costos-log/pull/34) |
| Nombre comercial y dominio | **Pendientes**, decisión del propietario (#13) |
| Licencia | Pendiente (#7) |
| Cargos variables de APIs | **Ninguno autorizado**. Cuenta de facturación posible, pero activación/consumo sujetos a aprobación |
| Publicación | Requiere aprobación expresa (#14) |

## Producto inicial gratuito — dirección aprobada

- **Probar sin cuenta**; ingresar con Google para guardar información. Alternativa por correo a resolver.
- Perfil de transportista y **varios vehículos** (tipo, marca, modelo, año, motorización, combustible; rendimiento urbano/carretera opcional).
- Calculadora para un servicio **base opcional → origen A → destino B → regreso opcional a la base**. No es un planificador de múltiples entregas.
- **Mapa con un camino a la vez** y comparación **ruta habitual/rápida vs. evitando peajes**; kilómetros y duración. Tráfico actualizado bajo consulta expresa como **criterio recomendado sujeto a verificación de costo**, no por cada edición de formulario.
- Combustible y peajes con procedencia verificable, editables; modo manual ante errores o límites de API.
- Costos de ayudantes, carga/descarga, materiales, desgaste, gastos fijos, tiempo propio y precio sugerido.
- **Cotización profesional exportable en PDF o compartible**, sin revelar costos ni márgenes al cliente.
- **Historial básico** y registro **manual** de viajes y cargas de combustible.
- Avisos de **costo parcial**, incertidumbre y origen/fecha de los valores.

La comparación detallada entre categorías de vehículos para clientes y el evaluador de tercerización **no están incluidos en el primer lanzamiento**. Los futuros modelos de marketplace y logística elástica **no se han elegido**.

**Después de validar la versión gratuita:** evaluar funciones Pro (calibración avanzada, análisis de rentabilidad, marca propia, lectura de fotografías y asistente de IA), sin implementar pagos ni IA todavía.

## Documentación

| Archivo | Contenido |
|---|---|
| [AGENTS.md](AGENTS.md) | Reglas de autorización y trabajo para Claude, ChatGPT y otros agentes |
| [CLAUDE.md](CLAUDE.md) | Entrada a las reglas comunes |
| [01 · Alcance](docs/01-alcance.md) | Funciones gratuitas, flujo, exclusiones y evolución futura |
| [02 · Arquitectura](docs/02-arquitectura.md) | Arquitectura candidata y decisiones aún abiertas |
| [03 · Motor de costos](docs/03-motor-de-costos.md) | Fórmulas, trazabilidad y escenarios de prueba |
| [04 · Fuentes](docs/04-fuentes-de-datos.md) | Google, CNE, peajes y límites de uso |
| [05 · Pruebas](docs/05-pruebas-y-calibracion.md) | Calidad matemática, rutas y validación con transportistas |
| [06 · Seguridad y privacidad](docs/06-seguridad-y-privacidad.md) | Cuentas, datos, cotizaciones compartidas y control de cargos |
| [07 · Decisiones](docs/07-decisiones.md) | Aprobado, propuesta y pendiente |
| [08 · Hoja de ruta](docs/08-hoja-de-ruta.md) | Replanificación por resolver, sin renumerar issues todavía |
| [09 · Revisión y aprobación](docs/09-revision-y-aprobacion.md) | Cómo revisar PR sin programar |
| [10 · Diseño UX/UI v4](docs/10-diseno-ux.md) | Diseño aprobado: pantallas, valores visuales, glosario y estados |
| [11 · Auditoría Google Maps](docs/11-auditoria-google-maps.md) | Informe Deep Research, costos, rutas y condiciones contractuales pendientes |
| [12 · Alternativas de mapas](docs/12-alternativas-mapas.md) | Revisión preliminar de Mapbox, TomTom, HERE, Waze y GraphHopper |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Ramas, issues grandes, trabajo paralelo y controles |
| [SECURITY.md](SECURITY.md) | Reporte de incidentes |

## Cómo trabajamos

- **Propietario:** decide alcance, marca, servicios, facturación, gastos y fusiones a `main`.
- **Claude:** diseña y desarrolla **solo lo autorizado**, con pruebas y PR.
- **ChatGPT:** coordina y revisa críticamente diseños, fórmulas, riesgos y entregables.
- Se permiten **issues grandes y varias tareas en paralelo** si están coordinadas y se pueden verificar sin confusiones.
- Ningún gasto, despliegue, API de pago o integración a `main` se activa sin autorización explícita.
- GitHub es la fuente técnica; Trello solo se organiza posteriormente y con autorización.

**Hecho:** diseño UX/UI v4 aprobado y backlog actualizado (16-11-2026). **Ahora:** aprobar la arquitectura y los costos de servicios, y luego pedir autorización de programación. **Finalmente:** lanzar la herramienta gratuita con aprobación y validar uso real antes de evaluar Pro.
