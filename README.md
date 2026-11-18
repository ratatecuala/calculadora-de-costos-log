# Calculadora y cotizador de fletes — nombre pendiente

> **Nombre comercial:** PENDIENTE DE DECISIÓN. Se descartó el nombre usado en documentos anteriores. El nombre técnico del repositorio no representa la marca futura.

Herramienta web para **transportistas independientes y fletes livianos en Chile**. El primer lanzamiento será una **calculadora gratuita de costos, rutas y cotizaciones profesionales**, diseñada prioritariamente para teléfono móvil.

**Propuesta de valor:** ayudar a calcular cuánto cuesta ejecutar un traslado, comparar alternativas de ruta y decidir qué precio cobrar, sin presentar estimaciones como datos exactos.

## Estado real

| Elemento | Estado |
|---|---|
| Etapa actual | Prototipo en **staging privado** (18-11-2026), en revisión en el PR #34. Sin lanzamiento |
| Aplicación | Prototipo funcional con **datos de ruta simulados**. **Staging privado** (Cloudflare Workers + Supabase, planes gratuitos) desde el 18-11-2026, protegido con usuario y contraseña ([13](docs/13-staging.md)). **Sin producción** |
| Diseño | **Diseño v4 completo aprobado** (16-11-2026): blanco, azul sobrio y grafito, navegación móvil y escritorio de tres columnas ([guía UX](docs/10-diseno-ux.md)) |
| Arquitectura | Implementada en staging: Worker + Durable Object (contador) y Supabase con RLS ([02](docs/02-arquitectura.md), [13](docs/13-staging.md), #35). Pendiente de aprobación para lanzamiento |
| Repositorio | Público, con documentación propuesta en PR [#34](https://github.com/ratatecuala/calculadora-de-costos-log/pull/34) |
| Nombre comercial y dominio | **Pendientes**, decisión del propietario (#13) |
| Licencia | Pendiente (#7) |
| Cargos variables de APIs | **Ninguno autorizado**. Cuenta de facturación posible, pero activación/consumo sujetos a aprobación |
| Publicación | Requiere aprobación expresa (#14) |

## Producto inicial gratuito — dirección aprobada

- **Probar sin cuenta**; ingresar con Google para guardar información. Alternativa por correo a resolver.
- Perfil de transportista y **varios vehículos** (tipo, marca, modelo, año, motorización, combustible; rendimiento urbano/carretera opcional).
- Calculadora para un servicio **base opcional → origen A → destino B → regreso opcional a la base**. No es un planificador de múltiples entregas.
- **A→B automático con Google Routes Essentials** (base y regreso opcionales): kilómetros y minutos, enlace «Ver ruta en Google Maps», sin mapa integrado. Comparación **habitual / evitando peajes opcional** (3 al día, 10 al mes por usuario). Tráfico en vivo fuera de la primera versión. **Hoy funciona con datos simulados.**
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
| [13 · Staging](docs/13-staging.md) | Recursos de Cloudflare y Supabase, RLS, pruebas reales, interruptores, respaldo y pasos manuales |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Ramas, issues grandes, trabajo paralelo y controles |
| [SECURITY.md](SECURITY.md) | Reporte de incidentes |

## Cómo trabajamos

- **Propietario:** decide alcance, marca, servicios, facturación, gastos y fusiones a `main`.
- **Claude:** diseña y desarrolla **solo lo autorizado**, con pruebas y PR.
- **ChatGPT:** coordina y revisa críticamente diseños, fórmulas, riesgos y entregables.
- Se permiten **issues grandes y varias tareas en paralelo** si están coordinadas y se pueden verificar sin confusiones.
- Ningún gasto, despliegue, API de pago o integración a `main` se activa sin autorización explícita.
- GitHub es la fuente técnica; Trello solo se organiza posteriormente y con autorización.

**Hecho:** diseño v4 aprobado (16-11-2026); prototipo con datos de ruta simulados y staging privado en Cloudflare + Supabase (18-11-2026, [13](docs/13-staging.md)). **Ahora:** auditoría de ChatGPT del PR #34, decisiones pendientes del propietario (Google OAuth, numeración de cotizaciones, plan de Supabase) y plan de prueba de Google Routes. **Finalmente:** lanzar la herramienta gratuita **solo con aprobación** y validar uso real antes de evaluar Pro.


## Probar localmente (datos simulados)

Requiere Node 20 o superior. No usa cuentas, claves ni servicios externos.

```bash
npm install
npm test        # 140 pruebas sin red: candado de consumo, motor, sesión, SKU, secretos, auditorías, vehículos, nube y Worker
npm run dev     # abre http://localhost:5173
```

Las distancias y los tiempos son **simulados** y la app lo indica en cada resultado. Google Routes no está conectado: hace falta la autorización del propietario (A-44).
