# Calculadora y cotizador de fletes — nombre pendiente

> **Nombre comercial:** PENDIENTE DE DECISIÓN (#13). El nombre técnico del repositorio no es la marca.

Herramienta web **gratuita** para **transportistas independientes y fletes livianos en Chile**: calcula cuánto cuesta un traslado, ayuda a decidir el precio y genera una **cotización profesional** para el cliente sin revelarle los costos internos.

**Para teléfono y computador por igual (A-49):** diseñada para utilizarse plenamente tanto en teléfonos como en computadores (PC o notebook), con interfaz adaptable (*responsive*) a cada tamaño de pantalla y **las mismas funciones** en ambos: cálculo, cotización, PDF, historial, vehículos y cuenta. En el teléfono, controles táctiles cómodos; en el computador, un diseño que aprovecha el ancho de la pantalla. Maquetar «primero para móvil» es solo una técnica de CSS: **no** significa que el escritorio sea secundario.

---

## Estado para retomar en otro chat

**Actualizado: 20-11-2026.** Esta sección es el punto de continuidad: un chat o colaborador nuevo debe poder seguir desde aquí sin memorias privadas.

| Dato | Valor |
|---|---|
| Rama de desarrollo | `claude/determined-volta-q9xvli` |
| PR de trabajo | [#34](https://github.com/ratatecuala/calculadora-de-costos-log/pull/34): **abierto, sin merge**. Ahí están el código, las auditorías de ChatGPT y las decisiones escritas del propietario |
| Punto de partida | **Siempre la punta (último commit) de la rama de desarrollo**, en su [historial](https://github.com/ratatecuala/calculadora-de-costos-log/commits/claude/determined-volta-q9xvli) |
| Rama de trabajo de la sesión del 18-11 | `claude/nice-brown-hxu4m5`, adelantada a la rama de desarrollo por *fast-forward* al cerrar la sesión |
| Último cambio de código | 18-11-2026: A-50 (validación de entradas del motor y rótulo del margen, **sin cambiar fórmulas**: casos dorados 64/64), A-51 («Precio total» y leyenda), aviso de texto inválido en los campos y correcciones de experiencia de usuario (docs/14). Staging redesplegado con esa versión |
| Auditorías de ChatGPT | 7 rondas sobre el flujo general, más una revisión focalizada de A-47: **aceptada técnicamente para staging, sin hallazgos P0/P1**. ChatGPT revisa **por inspección**; no ejecuta las pruebas |
| `main` | Solo publica este README de continuidad. **El código y los documentos técnicos siguen en la rama del PR #34, que no está integrado.** Toda fusión requiere aprobación del propietario |
| Conflicto con `main` | **Resuelto en la rama**: se integró `main` conservando el README de desarrollo (`main` solo tenía el README de portada) |
| Siguiente acción | Revisar y aprobar el **plan del cotizador ampliado** (docs/19, épica #42, decisiones D-1 a D-10 en #43); lanzar los encargos de Deep Research (docs/20 y docs/18); crear el cliente OAuth de Google y hacer el primer respaldo real |

**Cómo retomar:** leer este README → [AGENTS.md](AGENTS.md) (reglas y autorizaciones) → [07 · Decisiones](docs/07-decisiones.md) → [13 · Staging](docs/13-staging.md) → los últimos comentarios del PR #34.

## Estado real

| Área | Estado |
|---|---|
| Calculadora y cotizador (motor de costos, precio, PDF, WhatsApp) | **Funciona** (local y staging) |
| Experiencia en teléfono y en PC/notebook (A-49) | **Paridad verificada en local** del 320 al 1440 px (10 problemas corregidos, [14](docs/14-qa-ux.md)) y **en staging redesplegado** el 18-11: PC 1440/1366 y teléfono Pixel 7/iPhone 13, **59/59** sin cuenta |
| Validación independiente del motor (#24) | **Casos dorados 64/64** por recálculo independiente; sin errores de fórmula. Los 4 hallazgos de entradas y textos (C-1 a C-4) **corregidos** con tu aprobación (A-50), sin cambiar fórmulas ([15](docs/15-validacion-motor.md)) |
| Cotizador ampliado: inventario, recursos, catálogo de vehículos, costo según carga, IVA en dos opciones y rutas reales | **Propuesta, versión 2, en espera de aprobación** ([19](docs/19-plan-cotizador-ampliado.md), épica #42, decisiones en #43, ninguna aprobada). Nada implementado |
| IVA en la cotización (#16) | La cotización muestra **«Precio total»** y la leyenda **«Esta cotización no es factura ni boleta.»** (A-51). Las reglas por tipo de transportista y de cliente (opción B) siguen **sin implementar**, a la espera de validación tributaria ([16](docs/16-iva-cotizaciones.md)) |
| Distancias y tiempos de ruta | **Simulados**. La app lo indica en cada resultado. Google Routes **no está conectado** |
| Uso sin cuenta (historial en el navegador) | **Funciona**, con aviso de que no hay respaldo en la nube |
| Cuentas, vehículos y cotizaciones en la nube (Supabase) | **Funciona en staging** con usuarios de prueba (correo y contraseña, solo staging) |
| Inicio de sesión con Google | **Preparado, bloqueado**: falta el cliente OAuth en el Google Cloud del propietario |
| Enlace público de la cotización (sin costos internos, revocable) | **Funciona en staging** |
| Numeración de cotizaciones única por cuenta (A-47) | **Funciona en staging**: la asigna la base de forma atómica |
| Contador de consultas e interruptor de emergencia (Cloudflare) | **Funciona en staging** |
| Respaldo y restauración de Supabase | **Script cifrado y ensayado en local** (restauración idéntica). El primer respaldo real lo hace el propietario: requiere la contraseña de la base ([17](docs/17-supabase-seguridad-respaldo.md)) |
| Producción pública, facturación, planes de pago | **No existen ni están autorizados** |

**Staging:** privado (usuario y contraseña), en los planes **gratuitos** de Cloudflare Workers y Supabase. Su URL y los identificadores de las cuentas **no se publican** en este repositorio.

## Arquitectura (alto nivel)

- **Navegador:** React + TypeScript + Vite. El motor de costos es puro y aislado (`src/engine`), sin red ni base de datos.
- **Cloudflare Worker:** sirve la app y `/api/route`. Las rutas pasan por un **contador de presupuesto** en un Durable Object: reserva antes de consultar, cierra ante falla, tiene interruptor en caliente y no repite consultas al editar costos o precios.
- **Supabase:**
  - Auth y Postgres con **RLS por dueño** en todas las tablas.
  - `jobs` guarda los costos internos; `client_quotes` guarda **solo** lo que ve el cliente.
  - Los enlaces públicos usan tokens de 256 bits, de los que se guarda solo el hash.
  - Las migraciones están en [`supabase/migrations/`](supabase/migrations/).
- **Google Routes Essentials:** proveedor elegido. Está **desconectado** hasta que el propietario lo autorice. La política de cupo es: objetivo de 7.000 consultas al mes, corte en 8.000, y 3 comparaciones al día y 10 al mes por usuario.

Detalle: [02 · Arquitectura](docs/02-arquitectura.md) y [13 · Staging](docs/13-staging.md).

## Pruebas

| Prueba | Resultado | Quién la ejecutó |
|---|---|---|
| `npm test` (sin red) | **249/249** (18-11-2026). Sin `it.fails` activos: los defectos C-1 a C-4 se corrigieron con tu aprobación (A-50) | Claude (ejecutadas) |
| Recálculo independiente de los casos dorados (`scripts/verificar-casos-dorados.mjs`) | **64/64** | Claude (ejecutadas) |
| Teléfono y PC en navegador local (10 tamaños de pantalla) | 10 hallazgos, 10 corregidos; montos idénticos antes y después (también tras A-50); cotización con «Precio total» y leyenda | Claude (ejecutadas) |
| Ensayo local de respaldo y restauración (datos ficticios) | **Idéntica** (`diff` = 0). **No** equivale a un respaldo real ni a restaurar staging | Claude (ejecutadas) |
| RLS real en Supabase con dos usuarios y un visitante anónimo (`scripts/verificar-rls.mjs`) | **40/40** (18-11; ahora restaura el vehículo predeterminado y no modifica datos existentes: huellas idénticas antes y después) | Claude (ejecutadas) |
| Numeración real en Supabase: concurrencia desde 2 dispositivos, importación y conflictos (`scripts/verificar-numeracion.mjs`) | **17/17** (repetida el 18-11) | Claude (ejecutadas) |
| Cloudflare real: reserva, concurrencia estricta, apagado, reintentos, contador caído (`scripts/verificar-cloudflare.mjs`) | **8/8 y 2/2** | Claude (ejecutadas) |
| Navegador real contra staging **sin cuenta**, PC y teléfono (`scripts/e2e-staging-anonimo.mjs`, versión del 18-11) | **59/59**: acceso privado, flujo completo, aviso de texto inválido, margen, «Precio total» y leyenda, PDF, controles ≥ 44 px, 0 errores, 0 dominios externos | Claude (ejecutadas) |
| Navegador real contra staging **con cuentas A y B**, PC y teléfono (`scripts/e2e-staging.mjs`, versión del 18-11) | **41/41**: inicio y cierre de sesión, cambio de cuenta, vehículos, cotizaciones, importación del historial local, otro dispositivo, enlaces públicos | Claude (ejecutadas) |
| Revisión independiente del código | 7 auditorías, más la [revisión de los cinco frentes del 18-11](https://github.com/ratatecuala/calculadora-de-costos-log/pull/34#issuecomment-6970465877) (sin bloqueos nuevos; PR #41 apto para tu decisión) | ChatGPT, **por inspección**: no reproduce las ejecuciones |

Las credenciales de los scripts se leen siempre de archivos **fuera** del repositorio.

## Decisiones

Fuente: [07 · Decisiones](docs/07-decisiones.md). Una decisión está **APROBADA** cuando el propietario la deja por escrito en GitHub.

- **APROBADAS por escrito (PR #34):**
  - **A-47:** numeración de cotizaciones única, correlativa y atómica por cuenta, que conserva el número emitido.
  - **A-48:** este README como fuente de continuidad, actualizado con cada avance.
- **APROBADAS por escrito el 18-11 ([registro de ratificación en el PR #34](https://github.com/ratatecuala/calculadora-de-costos-log/pull/34#issuecomment-6971449761)), implementadas:**
  - **A-50:** margen sobre el precio de venta con rótulo corregido; validación de entradas, con aviso en el campo si se escribe algo que no es número; sin «$-0»; margen con decimales visible. No incluye recargos ni precio negativos (NE-1 y NE-10, sin decidir).
  - **A-51:** «Precio total» y leyenda «Esta cotización no es factura ni boleta.» **Transitorio:** no habilita cotizaciones comerciales reales hasta validar la política tributaria.
- **APROBADAS el 18-11 ([registro de decisiones en el PR #34](https://github.com/ratatecuala/calculadora-de-costos-log/pull/34#issuecomment-6972739332)):**
  - **A-52:** Supabase en plan gratuito con respaldo propio. El primer respaldo real lo ejecutas tú.
  - **A-53:** Google OAuth en modo *Testing*. Tú creas el cliente OAuth.
  - **A-54:** validación del IVA con GPT Deep Research ([encargo](docs/18-encargo-deep-research-iva.md)).
- **APROBADA por escrito (PR #40 y PR #34):**
  - **A-49:** paridad teléfono y computador: mismas funciones, interfaz adaptable a cada pantalla.
- **Comunicadas por el propietario, pendientes de ratificación escrita en el PR #34:**
  - A-21 a A-29: diseño v4, criterios funcionales y separación de la cotización.
  - A-31 a A-45: Google Routes Essentials, política de cupo, fases 1 a 3 y «Mi vehículo».
  - A-46: staging gratuito en Cloudflare y Supabase.

## Riesgos y pendientes

- **Pendientes (detalle en cada documento):**
  - **Motor (15):** C-1 a C-4 **resueltos** (A-50). Siguen pendientes las correcciones Doc-1 a Doc-6 de docs/03 y los puntos «no especificado» (descuentos, empates, topes, etc.).
  - **IVA (16, A-54):** «Precio total» y leyenda implementados (A-51). La opción B espera el informe de **GPT Deep Research** ([encargo](docs/18-encargo-deep-research-iva.md)), que ejecutas tú.
  - **Supabase (17, A-52):** se queda en el plan gratuito con respaldo propio. Pendiente el **primer respaldo real**, que haces tú porque requiere la contraseña de la base, y elegir el segundo lugar donde guardar los respaldos.
  - **Google OAuth (A-53):** pendiente que **crees el cliente** en modo *Testing*. El registro por correo queda abierto mientras Google esté en *Testing*; antes de abrir al público se cerrará con un *hook*. La protección de contraseñas filtradas **requiere el plan Pro**.
  - **Experiencia de usuario (14):** filtro del historial, precio fijo en el teléfono y propuestas menores.
  - **Antes de lanzar:** dominio, nombre comercial y aviso de privacidad (#17).
- **Antes de usar Google Routes real:**
  - autorización expresa;
  - plan de prueba con cupos y credenciales;
  - las cuotas **no garantizan gasto cero**.
- **Pendientes técnicos y legales:** decisión de IVA (#16, propuesta lista), planilla humana de casos dorados (#24, recálculo por script ya hecho), confirmación de direcciones (#19), aviso de privacidad (#17) y redespliegue de staging con las correcciones de experiencia de usuario (requiere el token de Cloudflare).

## Límites de autorización

**No autorizado sin orden expresa del propietario:**
- merge a `main`;
- producción pública;
- Google Routes real;
- facturación o planes de pago;
- crear cuentas o servicios nuevos;
- publicar secretos;
- cambiar las fórmulas del motor.

Reglas completas en [AGENTS.md](AGENTS.md).

## Documentación

| Archivo | Contenido |
|---|---|
| [AGENTS.md](AGENTS.md) | Reglas de trabajo y autorización para todos los agentes |
| [01 · Alcance](docs/01-alcance.md) | Funciones gratuitas, flujo y exclusiones |
| [02 · Arquitectura](docs/02-arquitectura.md) | Arquitectura, política de consultas e implementación |
| [03 · Motor de costos](docs/03-motor-de-costos.md) | Fórmulas, cotas y casos dorados |
| [05 · Pruebas](docs/05-pruebas-y-calibracion.md) | Pruebas automáticas y reales |
| [06 · Seguridad y privacidad](docs/06-seguridad-y-privacidad.md) | Datos, cotizaciones compartidas y control de cargos |
| [07 · Decisiones](docs/07-decisiones.md) | Registro de decisiones y su estado |
| [10 · Diseño UX/UI v4](docs/10-diseno-ux.md) | Diseño aprobado |
| [11 · Auditoría Google Maps](docs/11-auditoria-google-maps.md) | Costos y condiciones de Google |
| [13 · Staging](docs/13-staging.md) | Recursos, RLS, pruebas reales, interruptores, respaldo y pasos manuales |
| [14 · QA de experiencia de usuario](docs/14-qa-ux.md) | Teléfono y PC/notebook: hallazgos, correcciones y paridad por flujo |
| [15 · Validación del motor](docs/15-validacion-motor.md) | Recálculo independiente, hallazgos y decisiones (#24) |
| [16 · IVA en las cotizaciones](docs/16-iva-cotizaciones.md) | Normativa chilena, documento tributario vs cotización y propuesta (#16) |
| [17 · Supabase: seguridad y respaldo](docs/17-supabase-seguridad-respaldo.md) | Auditoría, ajustes de Auth, respaldo y restauración, Google OAuth (#35) |
| [18 · Encargo de Deep Research sobre IVA](docs/18-encargo-deep-research-iva.md) | Preguntas para validar la tributación antes de la opción B (#16, A-54) |
| [19 · Plan del cotizador ampliado](docs/19-plan-cotizador-ampliado.md) | Catálogo de vehículos, inventario de carga, costo según carga, IVA en dos opciones y rutas reales: etapas, datos y decisiones (épica #42, **propuesta**) |
| [20 · Encargos de Deep Research del cotizador](docs/20-encargos-deep-research-cotizador.md) | C-1 catálogo y mercado, C-2 costo según carga y recursos; listos para ejecutar (el IVA no se duplica) |

## Probar localmente (sin cuentas ni servicios externos)

Requiere Node 20 o superior.

```bash
npm install
```

```bash
npm test
```

```bash
npm run dev
```

La app abre en `http://localhost:5173`, con rutas **simuladas** y el historial guardado solo en el navegador.

## Cómo se mantiene este README

Es una **regla permanente** (A-48, ver [AGENTS.md](AGENTS.md) §10):
- Cada avance material (función, decisión, arquitectura, despliegue, prueba, bloqueo o hito) actualiza este README en el mismo PR o commit.
- La versión de la portada de GitHub (`main`) se sincroniza con un **PR exclusivamente documental**, que fusiona solo el propietario.
- No hay monitorización automática: lo actualiza el agente cada vez que trabaja en el repositorio.
