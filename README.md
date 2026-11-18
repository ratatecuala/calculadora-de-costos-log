# Calculadora y cotizador de fletes — nombre pendiente

> **Versión de portada.** El desarrollo vive en la rama `claude/determined-volta-q9xvli` ([PR #34](https://github.com/ratatecuala/calculadora-de-costos-log/pull/34)); los enlaces apuntan a esa rama hasta que el propietario autorice integrarla a `main`.

> **Nombre comercial:** PENDIENTE DE DECISIÓN (#13). El nombre técnico del repositorio no es la marca.

Herramienta web **gratuita** para **transportistas independientes y fletes livianos en Chile**: calcula cuánto cuesta un traslado, ayuda a decidir el precio y genera una **cotización profesional** para el cliente sin revelarle los costos internos.

**Para teléfono y computador por igual (A-49):** diseñada para utilizarse plenamente tanto en teléfonos como en computadores (PC o notebook), con interfaz adaptable (*responsive*) a cada tamaño de pantalla y **las mismas funciones** en ambos: cálculo, cotización, PDF, historial, vehículos y cuenta. En el teléfono, controles táctiles cómodos; en el computador, un diseño que aprovecha el ancho de la pantalla. Maquetar «primero para móvil» es solo una técnica de CSS: **no** significa que el escritorio sea secundario.

---

## Estado para retomar en otro chat

**Actualizado: 18-11-2026.** Esta sección es el punto de continuidad: un chat o colaborador nuevo debe poder seguir desde aquí sin memorias privadas.

| Dato | Valor |
|---|---|
| Rama de desarrollo | `claude/determined-volta-q9xvli` |
| PR de trabajo | [#34](https://github.com/ratatecuala/calculadora-de-costos-log/pull/34): **abierto, sin merge**. Ahí están el código, las auditorías de ChatGPT y las decisiones escritas del propietario |
| Punto de partida | **Siempre la punta (último commit) de la rama de desarrollo**, en su [historial](https://github.com/ratatecuala/calculadora-de-costos-log/commits/claude/determined-volta-q9xvli) |
| Rama de trabajo de la sesión del 18-11 | `claude/nice-brown-hxu4m5`, adelantada a la rama de desarrollo por *fast-forward* al cerrar la sesión |
| Último cambio de código | Correcciones de experiencia de usuario en teléfono y PC (docs/14), 18-11-2026. **El motor económico no cambió** desde A-47 |
| Auditorías de ChatGPT | 7 rondas sobre el flujo general, más una revisión focalizada de A-47: **aceptada técnicamente para staging, sin hallazgos P0/P1**. ChatGPT revisa **por inspección**; no ejecuta las pruebas |
| `main` | Solo publica este README de continuidad. **El código y los documentos técnicos siguen en la rama del PR #34, que no está integrado.** Toda fusión requiere aprobación del propietario |
| Conflicto con `main` | **Resuelto en la rama**: se integró `main` conservando el README de desarrollo (`main` solo tenía el README de portada) |
| Siguiente acción | Decisiones del propietario de la sesión del 18-11 (abajo, «Riesgos y pendientes») y redespliegue de staging con las correcciones de experiencia de usuario |

**Cómo retomar:** leer este README → [AGENTS.md](https://github.com/ratatecuala/calculadora-de-costos-log/blob/claude/determined-volta-q9xvli/AGENTS.md) (reglas y autorizaciones) → [07 · Decisiones](https://github.com/ratatecuala/calculadora-de-costos-log/blob/claude/determined-volta-q9xvli/docs/07-decisiones.md) → [13 · Staging](https://github.com/ratatecuala/calculadora-de-costos-log/blob/claude/determined-volta-q9xvli/docs/13-staging.md) → los últimos comentarios del PR #34.

## Estado real

| Área | Estado |
|---|---|
| Calculadora y cotizador (motor de costos, precio, PDF, WhatsApp) | **Funciona** (local y staging) |
| Experiencia en teléfono y en PC/notebook (A-49) | **Paridad verificada en local** del 320 al 1440 px (10 problemas corregidos, [14](https://github.com/ratatecuala/calculadora-de-costos-log/blob/claude/determined-volta-q9xvli/docs/14-qa-ux.md)) y **en staging redesplegado** el 18-11: PC 1440/1366 y teléfono Pixel 7/iPhone 13, **59/59** sin cuenta |
| Validación independiente del motor (#24) | **Casos dorados 64/64** por recálculo independiente; sin errores de fórmula. Los 4 hallazgos de entradas y textos (C-1 a C-4) **corregidos** con tu aprobación (A-50), sin cambiar fórmulas ([15](https://github.com/ratatecuala/calculadora-de-costos-log/blob/claude/determined-volta-q9xvli/docs/15-validacion-motor.md)) |
| IVA en la cotización (#16) | La cotización muestra **«Precio total»** y la leyenda **«Esta cotización no es factura ni boleta.»** (A-51). Las reglas por tipo de transportista y de cliente (opción B) siguen **sin implementar**, a la espera de validación tributaria ([16](https://github.com/ratatecuala/calculadora-de-costos-log/blob/claude/determined-volta-q9xvli/docs/16-iva-cotizaciones.md)) |
| Distancias y tiempos de ruta | **Simulados**. La app lo indica en cada resultado. Google Routes **no está conectado** |
| Uso sin cuenta (historial en el navegador) | **Funciona**, con aviso de que no hay respaldo en la nube |
| Cuentas, vehículos y cotizaciones en la nube (Supabase) | **Funciona en staging** con usuarios de prueba (correo y contraseña, solo staging) |
| Inicio de sesión con Google | **Preparado, bloqueado**: falta el cliente OAuth en el Google Cloud del propietario |
| Enlace público de la cotización (sin costos internos, revocable) | **Funciona en staging** |
| Numeración de cotizaciones única por cuenta (A-47) | **Funciona en staging**: la asigna la base de forma atómica |
| Contador de consultas e interruptor de emergencia (Cloudflare) | **Funciona en staging** |
| Respaldo y restauración de Supabase | **Script cifrado y ensayado en local** (restauración idéntica). El primer respaldo real lo hace el propietario: requiere la contraseña de la base ([17](https://github.com/ratatecuala/calculadora-de-costos-log/blob/claude/determined-volta-q9xvli/docs/17-supabase-seguridad-respaldo.md)) |
| Producción pública, facturación, planes de pago | **No existen ni están autorizados** |

**Staging:** privado (usuario y contraseña), en los planes **gratuitos** de Cloudflare Workers y Supabase. Su URL y los identificadores de las cuentas **no se publican** en este repositorio.

## Arquitectura (alto nivel)

- **Navegador:** React + TypeScript + Vite. El motor de costos es puro y aislado (`src/engine`), sin red ni base de datos.
- **Cloudflare Worker:** sirve la app y `/api/route`. Las rutas pasan por un **contador de presupuesto** en un Durable Object: reserva antes de consultar, cierra ante falla, tiene interruptor en caliente y no repite consultas al editar costos o precios.
- **Supabase:**
  - Auth y Postgres con **RLS por dueño** en todas las tablas.
  - `jobs` guarda los costos internos; `client_quotes` guarda **solo** lo que ve el cliente.
  - Los enlaces públicos usan tokens de 256 bits, de los que se guarda solo el hash.
  - Las migraciones están en [`supabase/migrations/`](https://github.com/ratatecuala/calculadora-de-costos-log/tree/claude/determined-volta-q9xvli/supabase/migrations/).
- **Google Routes Essentials:** proveedor elegido. Está **desconectado** hasta que el propietario lo autorice. La política de cupo es: objetivo de 7.000 consultas al mes, corte en 8.000, y 3 comparaciones al día y 10 al mes por usuario.

Detalle: [02 · Arquitectura](https://github.com/ratatecuala/calculadora-de-costos-log/blob/claude/determined-volta-q9xvli/docs/02-arquitectura.md) y [13 · Staging](https://github.com/ratatecuala/calculadora-de-costos-log/blob/claude/determined-volta-q9xvli/docs/13-staging.md).

## Pruebas

| Prueba | Resultado | Quién la ejecutó |
|---|---|---|
| `npm test` (sin red) | **249/249** (18-11-2026). Sin `it.fails` activos: los defectos C-1 a C-4 se corrigieron con tu aprobación (A-50) | Claude (ejecutadas) |
| Recálculo independiente de los casos dorados (`scripts/verificar-casos-dorados.mjs`) | **64/64** | Claude (ejecutadas) |
| Teléfono y PC en navegador local (10 tamaños de pantalla) | 10 hallazgos, 10 corregidos; montos idénticos antes y después (también tras A-50); cotización con «Precio total» y leyenda | Claude (ejecutadas) |
| Ensayo local de respaldo y restauración (datos ficticios) | **Idéntica** (`diff` = 0). **No** equivale a un respaldo real ni a restaurar staging | Claude (ejecutadas) |
| RLS real en Supabase con dos usuarios y un visitante anónimo (`scripts/verificar-rls.mjs`) | **39/39** | Claude (ejecutadas) |
| Numeración real en Supabase: concurrencia desde 2 dispositivos, importación y conflictos (`scripts/verificar-numeracion.mjs`) | **17/17** | Claude (ejecutadas) |
| Cloudflare real: reserva, concurrencia estricta, apagado, reintentos, contador caído (`scripts/verificar-cloudflare.mjs`) | **8/8 y 2/2** | Claude (ejecutadas) |
| Navegador real contra staging **sin cuenta**, PC y teléfono (`scripts/e2e-staging-anonimo.mjs`, versión del 18-11) | **59/59**: acceso privado, flujo completo, aviso de texto inválido, margen, «Precio total» y leyenda, PDF, controles ≥ 44 px, 0 errores, 0 dominios externos | Claude (ejecutadas) |
| Navegador real contra staging **con cuentas** (`scripts/e2e-staging.mjs`) | **41/41** el 17-11. **No repetido** sobre la versión del 18-11: faltan las contraseñas de los usuarios de prueba, que estaban en el contenedor de una sesión anterior | Claude (ejecutadas) |
| Revisión independiente del código | 7 auditorías, más la [revisión de los cinco frentes del 18-11](https://github.com/ratatecuala/calculadora-de-costos-log/pull/34#issuecomment-6970465877) (sin bloqueos nuevos; PR #41 apto para tu decisión) | ChatGPT, **por inspección**: no reproduce las ejecuciones |

Las credenciales de los scripts se leen siempre de archivos **fuera** del repositorio.

## Decisiones

Fuente: [07 · Decisiones](https://github.com/ratatecuala/calculadora-de-costos-log/blob/claude/determined-volta-q9xvli/docs/07-decisiones.md). Una decisión está **APROBADA** cuando el propietario la deja por escrito en GitHub.

- **APROBADAS por escrito (PR #34):**
  - **A-47:** numeración de cotizaciones única, correlativa y atómica por cuenta, que conserva el número emitido.
  - **A-48:** este README como fuente de continuidad, actualizado con cada avance.
- **APROBADAS por escrito el 18-11 ([registro de ratificación en el PR #34](https://github.com/ratatecuala/calculadora-de-costos-log/pull/34#issuecomment-6971449761)), implementadas:**
  - **A-50:** margen sobre el precio de venta con rótulo corregido; validación de entradas, con aviso en el campo si se escribe algo que no es número; sin «$-0»; margen con decimales visible. No incluye recargos ni precio negativos (NE-1 y NE-10, sin decidir).
  - **A-51:** «Precio total» y leyenda «Esta cotización no es factura ni boleta.» **Transitorio:** no habilita cotizaciones comerciales reales hasta validar la política tributaria.
- **APROBADA por escrito (PR #40 y PR #34):**
  - **A-49:** paridad teléfono y computador: mismas funciones, interfaz adaptable a cada pantalla.
- **Comunicadas por el propietario, pendientes de ratificación escrita en el PR #34:**
  - A-21 a A-29: diseño v4, criterios funcionales y separación de la cotización.
  - A-31 a A-45: Google Routes Essentials, política de cupo, fases 1 a 3 y «Mi vehículo».
  - A-46: staging gratuito en Cloudflare y Supabase.

## Riesgos y pendientes

- **Decisiones pendientes de la sesión del 18-11 (detalle en cada documento):**
  - **Motor (15):** C-1 a C-4 **resueltos** (A-50). Siguen pendientes las correcciones Doc-1 a Doc-6 de docs/03 y los puntos «no especificado» (descuentos, empates, topes, etc.).
  - **IVA (16):** leyenda y «Precio total» **implementados** (A-51). Pendiente: validación tributaria (contador o SII) antes de implementar la opción B (perfil tributario del transportista y tipo de cliente).
  - **Supabase (17):** plan antes de usuarios reales, frecuencia y lugar de los respaldos, registro por correo cuando exista Google y privilegios por defecto.
  - **Experiencia de usuario (14):** filtro del historial, precio fijo en el teléfono y propuestas menores.
- **Decisiones del propietario (anteriores):**
  - Google OAuth (crear el cliente).
  - Cerrar el registro por correo en staging. La protección de contraseñas filtradas **requiere el plan Pro** (verificado en docs/17).
  - Plan de Supabase antes de lanzar: el gratuito **se pausa** con poca actividad y **no tiene respaldos automáticos**.
  - Dominio y nombre comercial.
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

Reglas completas en [AGENTS.md](https://github.com/ratatecuala/calculadora-de-costos-log/blob/claude/determined-volta-q9xvli/AGENTS.md).

## Documentación

| Archivo | Contenido |
|---|---|
| [AGENTS.md](https://github.com/ratatecuala/calculadora-de-costos-log/blob/claude/determined-volta-q9xvli/AGENTS.md) | Reglas de trabajo y autorización para todos los agentes |
| [01 · Alcance](https://github.com/ratatecuala/calculadora-de-costos-log/blob/claude/determined-volta-q9xvli/docs/01-alcance.md) | Funciones gratuitas, flujo y exclusiones |
| [02 · Arquitectura](https://github.com/ratatecuala/calculadora-de-costos-log/blob/claude/determined-volta-q9xvli/docs/02-arquitectura.md) | Arquitectura, política de consultas e implementación |
| [03 · Motor de costos](https://github.com/ratatecuala/calculadora-de-costos-log/blob/claude/determined-volta-q9xvli/docs/03-motor-de-costos.md) | Fórmulas, cotas y casos dorados |
| [05 · Pruebas](https://github.com/ratatecuala/calculadora-de-costos-log/blob/claude/determined-volta-q9xvli/docs/05-pruebas-y-calibracion.md) | Pruebas automáticas y reales |
| [06 · Seguridad y privacidad](https://github.com/ratatecuala/calculadora-de-costos-log/blob/claude/determined-volta-q9xvli/docs/06-seguridad-y-privacidad.md) | Datos, cotizaciones compartidas y control de cargos |
| [07 · Decisiones](https://github.com/ratatecuala/calculadora-de-costos-log/blob/claude/determined-volta-q9xvli/docs/07-decisiones.md) | Registro de decisiones y su estado |
| [10 · Diseño UX/UI v4](https://github.com/ratatecuala/calculadora-de-costos-log/blob/claude/determined-volta-q9xvli/docs/10-diseno-ux.md) | Diseño aprobado |
| [11 · Auditoría Google Maps](https://github.com/ratatecuala/calculadora-de-costos-log/blob/claude/determined-volta-q9xvli/docs/11-auditoria-google-maps.md) | Costos y condiciones de Google |
| [13 · Staging](https://github.com/ratatecuala/calculadora-de-costos-log/blob/claude/determined-volta-q9xvli/docs/13-staging.md) | Recursos, RLS, pruebas reales, interruptores, respaldo y pasos manuales |
| [14 · QA de experiencia de usuario](https://github.com/ratatecuala/calculadora-de-costos-log/blob/claude/determined-volta-q9xvli/docs/14-qa-ux.md) | Teléfono y PC/notebook: hallazgos, correcciones y paridad por flujo |
| [15 · Validación del motor](https://github.com/ratatecuala/calculadora-de-costos-log/blob/claude/determined-volta-q9xvli/docs/15-validacion-motor.md) | Recálculo independiente, hallazgos y decisiones (#24) |
| [16 · IVA en las cotizaciones](https://github.com/ratatecuala/calculadora-de-costos-log/blob/claude/determined-volta-q9xvli/docs/16-iva-cotizaciones.md) | Normativa chilena, documento tributario vs cotización y propuesta (#16) |
| [17 · Supabase: seguridad y respaldo](https://github.com/ratatecuala/calculadora-de-costos-log/blob/claude/determined-volta-q9xvli/docs/17-supabase-seguridad-respaldo.md) | Auditoría, ajustes de Auth, respaldo y restauración, Google OAuth (#35) |

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

Es una **regla permanente** (A-48, ver [AGENTS.md](https://github.com/ratatecuala/calculadora-de-costos-log/blob/claude/determined-volta-q9xvli/AGENTS.md) §10):
- Cada avance material (función, decisión, arquitectura, despliegue, prueba, bloqueo o hito) actualiza este README en el mismo PR o commit.
- La versión de la portada de GitHub (`main`) se sincroniza con un **PR exclusivamente documental**, que fusiona solo el propietario.
- No hay monitorización automática: lo actualiza el agente cada vez que trabaja en el repositorio.
