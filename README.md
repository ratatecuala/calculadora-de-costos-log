# CamiON Costos (nombre provisional)

Calculadora web **gratuita**, sin registro, para estimar el costo de un transporte en Chile y decidir mejor:

- **"Soy fletero":** calcular cuánto me cuesta un viaje, qué precio cobrar y cuánto gano.
- **"Necesito transportar algo":** estimar el costo de un traslado, comparar categorías de vehículo y evaluar una cotización externa real.

Pensada para fleteros independientes, conductores con auto, camioneta, furgón o camión, pequeños transportistas, emprendedores que hacen entregas y personas que necesitan mover algo. Debe ser comprensible para alguien **sin conocimientos de logística, contabilidad ni tecnología**, y funcionar en el teléfono y en el computador.

> **Principio rector:** no presentar estimaciones como cifras exactas. Cada resultado muestra de dónde viene cada dato, qué falta y cuánta incertidumbre tiene.

> **Para Claude, ChatGPT o cualquier agente:** leer primero [AGENTS.md](AGENTS.md), luego [decisiones vigentes](docs/07-decisiones.md), [hoja de ruta](docs/08-hoja-de-ruta.md) y el issue correspondiente. **Ningún PR se integra ni se inicia programación sin autorización expresa del propietario.**

## Estado del proyecto

| | |
|---|---|
| Etapa actual | **E0: decisiones, investigación y preparación** (ver [hoja de ruta](docs/08-hoja-de-ruta.md)) |
| Código de la aplicación | **Todavía no existe.** Se empieza en E1, después de aprobar esta documentación. |
| Publicación | Ninguna. La v1.0 se publica solo con autorización del propietario. |
| Licencia | **Sin licencia definida** (decisión pendiente, issue #7). Mientras no exista licencia, no se concede permiso de reutilización. |

## Documentación

| Documento | Contenido |
|---|---|
| [01 · Alcance](docs/01-alcance.md) | Qué construimos, qué no, y el alcance de la v1 |
| [02 · Arquitectura](docs/02-arquitectura.md) | Tecnologías acordadas y por qué |
| [03 · Motor de costos](docs/03-motor-de-costos.md) | Fórmulas, definiciones y ejemplos resueltos |
| [04 · Fuentes de datos](docs/04-fuentes-de-datos.md) | Google, CNE, MOP y restricciones de uso |
| [05 · Pruebas y calibración](docs/05-pruebas-y-calibracion.md) | Cómo verificamos que los números son correctos |
| [06 · Seguridad y privacidad](docs/06-seguridad-y-privacidad.md) | Protocolo de claves, datos personales y cobros |
| [07 · Decisiones](docs/07-decisiones.md) | Registro de lo **aprobado** y lo **pendiente** |
| [08 · Hoja de ruta](docs/08-hoja-de-ruta.md) | Etapas E0–E5 |
| [09 · Revisión y aprobación](docs/09-revision-y-aprobacion.md) | Cómo revisa y aprueba cambios el propietario (sin comandos) |
| [CONTRIBUTING](CONTRIBUTING.md) | Convenciones de desarrollo, ramas, commits, etiquetas |
| [SECURITY](SECURITY.md) | Cómo reportar un problema de seguridad |

## Reglas de trabajo

- **Propietario:** aprueba prioridades, gastos, cuentas, cambios de alcance y cualquier integración a `main`.
- **Claude:** desarrolla únicamente tareas autorizadas, mediante ramas y PR pequeños con pruebas.
- **ChatGPT:** revisa las decisiones técnicas, las fórmulas y los PR relevantes antes de su aprobación.
- **GitHub:** documentación, código e issues. **Trello:** seguimiento visual una vez autorizado, sin duplicar el backlog.
- **Costo de APIs:** $0 de cargos variables autorizados; nada se activa que pueda generar cobros sin aprobación.
- **Cada entrega:** debe explicar qué cambió, qué no tocó, cómo comprobarlo sin conocimientos técnicos y qué queda pendiente.
- **Sin fusiones automáticas, cambios directos a `main`, secretos, datos privados ni funcionalidades fuera de alcance.**

Reglas completas para cualquier agente: **[AGENTS.md](AGENTS.md)**. Claude también debe consultar **[CLAUDE.md](CLAUDE.md)**.

## Roles

| Rol | Quién | Responsabilidad |
|---|---|---|
| Propietario | Dueño del proyecto | Define prioridades, presupuesto y alcance. **Aprueba** todo cambio visible, gasto, cuenta y publicación. |
| Desarrollador principal | Claude | Propone e implementa, prueba, documenta y explica limitaciones. |
| Contraparte técnica | ChatGPT | Revisa entregables, cuestiona decisiones y verifica cobertura y pruebas. |

## Cómo seguir el trabajo

- **Etapas:** épicas #1 (E0) a #6 (E5).
- **Decisiones pendientes del propietario:** etiqueta `decisión del propietario`.
- **Investigaciones:** etiqueta `investigación`.
