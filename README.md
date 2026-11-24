# Calculadora y cotizador de fletes — nombre pendiente

> **Nombre comercial:** PENDIENTE DE DECISIÓN (#13). El nombre técnico del repositorio no es la marca.

Herramienta web **gratuita** para **transportistas independientes y fletes livianos en Chile**: calcula cuánto cuesta un traslado, ayuda a decidir el precio y genera una **cotización profesional** para el cliente sin revelarle los costos internos.

**Para teléfono y computador por igual (A-49):** diseñada para utilizarse plenamente tanto en teléfonos como en computadores (PC o notebook), con interfaz adaptable (*responsive*) a cada tamaño de pantalla y **las mismas funciones** en ambos: cálculo, cotización, PDF, historial, vehículos y cuenta. En el teléfono, controles táctiles cómodos; en el computador, un diseño que aprovecha el ancho de la pantalla. Maquetar «primero para móvil» es solo una técnica de CSS: **no** significa que el escritorio sea secundario.

---

## Estado para retomar en otro chat

- **Pruebas de campo.** [Registro privado de circulación y cinco escenarios ficticios de flete](docs/05-pruebas-y-calibracion.md#primera-prueba-de-campo). Reproducibles con el motor del cotizador desde el notebook.

- **Catálogo C-1.** [Seguimiento de las versiones y sus límites de uso](datos/catalogo-c1/notas.md#seguimiento-de-versiones-desde-el-notebook).

- **Cotización manual (PR #34).** El ingreso de km y minutos es la acción principal. El ejemplo pide confirmación si sustituye costos. El precio final se escribe en pesos o se copia con «Usar precio sugerido» cuando el cálculo está completo. La CI prueba el flujo hasta PDF y WhatsApp en teléfono emulado y escritorio con datos ficticios.

**Actualizado: 24-11-2026.** Esta sección es el punto de continuidad: un chat o colaborador nuevo debe poder seguir desde aquí sin memorias privadas.

| Dato | Valor |
|---|---|
| Rama de desarrollo | `claude/determined-volta-q9xvli` |
| PR de trabajo | [#34](https://github.com/ratatecuala/calculadora-de-costos-log/pull/34): **abierto, sin merge**. Ahí están el código, las auditorías de ChatGPT y las decisiones escritas del propietario |
| Punto de partida | **Siempre la punta (último commit) de la rama de desarrollo**, en su [historial](https://github.com/ratatecuala/calculadora-de-costos-log/commits/claude/determined-volta-q9xvli) |
| Rama de trabajo de las sesiones del 18 al 21-11 | `claude/nice-brown-hxu4m5`, adelantada a la rama de desarrollo por *fast-forward* tras cada entrega (nunca *force-push*) |
| Último avance | **A-83, correcciones locales P1/P2** sobre `30730c5`. La base exige precios enteros también al importar. Los históricos en la base conservan estado editable y precio original. El navegador conserva los fraccionarios pendientes de copia y muestra su motivo. Ensayo y regresión pendientes de ejecución en PostgreSQL local. [Autorización](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7143060565) |
| Hito anterior de la app (A-75) | 22-11-2026: **A-75**, **cerrada técnicamente** (Frente A, corrige el P1 de A-73: un reemplazo de valor quita el error de texto de ese campo; [24 §8](docs/24-robustez-numerica.md)); commit «fix(#53): A-75» en el [historial](https://github.com/ratatecuala/calculadora-de-costos-log/commits/claude/determined-volta-q9xvli). Antes, `ed30534` (A-73) y `2dd580e`/`33ee8ba` (migración local de #52, aprobada técnicamente: A-76) |
| Hito anterior del recorrido manual (A-69) | 21-11-2026: **D-I8 parcial (A-69)**: al recuperar el borrador vuelven los km y minutos escritos **a mano**, con el aviso «Recorrido recuperado: revisa los kilómetros y minutos»; cambiar las direcciones los invalida; nunca vuelve el precio ni se guardan datos del proveedor ([22 §15](docs/22-diseno-integracion-cotizador.md)). Misma flag **apagada**. Antes, 20-11-2026: **integración I-1 + I-1b** (A-68): inventario y recursos en «Cotizar» solo sin cuenta, snapshot v2 en el navegador, copia mixta a la cuenta y recuperación del borrador, detrás de la flag `VITE_FF_INTEGRACION_CARGA` **apagada**; el costo no cambia y staging no se redesplegó. **Cerrada técnicamente** por la [auditoría final](https://github.com/ratatecuala/calculadora-de-costos-log/issues/53#issuecomment-7052650743) (0 P0 · 0 P1). Antes, 18-11-2026: A-50 (validación de entradas del motor y rótulo del margen, **sin cambiar fórmulas**: casos dorados 64/64), A-51 («Precio total» y leyenda), aviso de texto inválido en los campos y correcciones de experiencia de usuario (docs/14). Staging redesplegado con esa versión |
| Auditorías de ChatGPT | **Flujo general:** 7 rondas y una revisión focalizada de A-47, aceptado técnicamente para staging, sin P0/P1. **Cotizador ampliado:** diseño #45 (auditoría y reauditoría), fase 0 (auditoría y cierre), fase 1 (auditoría y cierre), diseño de integración y tres rondas de I-1 + I-1b; la [final](https://github.com/ratatecuala/calculadora-de-costos-log/issues/53#issuecomment-7052650743), sobre `2f8e112`, dio **0 P0 · 0 P1 · 1 P2 de producto (D-I8)**. **D-I8 parcial:** [auditada](https://github.com/ratatecuala/calculadora-de-costos-log/issues/53#issuecomment-7071423796) (0 P0 · 0 P1 · 1 P2); P2 corregido (A-70) y nueva auditoría solicitada. **#52:** [revisión](https://github.com/ratatecuala/calculadora-de-costos-log/issues/52#issuecomment-7071428749) con un riesgo nuevo de desbordamiento del contador, rediseñado en docs/23. ChatGPT revisa **por inspección**; no ejecuta las pruebas |
| `main` | Solo publica este README de continuidad. **El código y los documentos técnicos siguen en la rama del PR #34, que no está integrado.** Toda fusión requiere aprobación del propietario |
| Conflicto con `main` | **Resuelto en la rama**: se integró `main` conservando el README de desarrollo (`main` solo tenía el README de portada) |
| Siguiente acción | Validar A-83 en [GitHub Actions](https://github.com/ratatecuala/calculadora-de-costos-log/pull/34/checks). El [workflow](.github/workflows/a83.yml) usa Node 22 y PostgreSQL 17 desechable para pruebas unitarias, compilación, ensayo de precio y ocho mutaciones, ensayo I-2 e ida y vuelta. Revisar fallos en [#53](https://github.com/ratatecuala/calculadora-de-costos-log/issues/53). C-1 sigue fuera de la app: 6 versiones parciales y 9 pendientes. |

**Cómo retomar:** leer este README → [AGENTS.md](AGENTS.md) (reglas y autorizaciones) → [07 · Decisiones](docs/07-decisiones.md) → [13 · Staging](docs/13-staging.md) → los últimos comentarios del PR #34.

## Estado real

| Área | Estado |
|---|---|
| Calculadora y cotizador (motor de costos, precio, PDF, WhatsApp) | **Funciona** (local y staging) |
| Experiencia en teléfono y en PC/notebook (A-49) | **Paridad verificada en local** del 320 al 1440 px (10 problemas corregidos, [14](docs/14-qa-ux.md)) y **en staging redesplegado** el 18-11: PC 1440/1366 y teléfono Pixel 7/iPhone 13, **59/59** sin cuenta |
| Validación independiente del motor (#24) | **Casos dorados 64/64** por recálculo independiente; sin errores de fórmula. Los 4 hallazgos de entradas y textos (C-1 a C-4) **corregidos** con tu aprobación (A-50), sin cambiar fórmulas ([15](docs/15-validacion-motor.md)) |
| Cotizador ampliado: inventario, recursos, catálogo de vehículos, costo según carga, IVA en dos opciones y rutas reales | **Planificación aprobada** (A-55 a A-60). **Diseño #45 versión 3 aprobado** (D-4 = b y T-1 a T-6: A-61, A-62). **Fase 0 cerrada** (A-63). **Fase 1 cerrada** (A-66). **Integración I-1 + I-1b implementada y cerrada técnicamente** (A-67, A-68; 0 P0 · 0 P1, [22 §14](docs/22-diseno-integracion-cotizador.md)): en «Cotizar» solo sin cuenta, snapshot v2 en el navegador, copia mixta a la cuenta y borrador recuperable, detrás de la flag **apagada**. **D-I8 parcial implementada** (A-69, [22 §15](docs/22-diseno-integracion-cotizador.md)): el borrador recupera el recorrido manual; auditada, con el P2 de validación corregido (A-70, [22 §16](docs/22-diseno-integracion-cotizador.md)) (no visible para nadie); el costo no cambia. D-I8 **pendiente de tu decisión**. Encender la flag, I-2 (requiere #52, M3 y M4), I-3, migraciones, despliegue y cambios de costo **no autorizados** |
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
| `npm test` (sin red) | **687/687** reportadas por Claude en `30730c5`. Codex no pudo ejecutar Vitest sobre la corrección P1/P2. | Claude (versión anterior) |
| A-83 P1/P2 | **2/2 pruebas locales con Node** del flujo de copia con transporte simulado: cotizaciones mixtas, aviso, conservación y reintento con ambas configuraciones de carga. Dos mutaciones del filtro del cliente detectadas. PostgreSQL, las ocho mutaciones y la regresión completa siguen pendientes. | Codex |
| Recálculo independiente de los casos dorados (`scripts/verificar-casos-dorados.mjs`) | **64/64** | Claude (ejecutadas) |
| Teléfono y PC en navegador local (10 tamaños de pantalla) | 10 hallazgos, 10 corregidos; montos idénticos antes y después (también tras A-50); cotización con «Precio total» y leyenda | Claude (ejecutadas) |
| Ensayo local de respaldo y restauración (datos ficticios) | **Idéntica** (`diff` = 0). **No** equivale a un respaldo real ni a restaurar staging | Claude (ejecutadas) |
| RLS real en Supabase con dos usuarios y un visitante anónimo (`scripts/verificar-rls.mjs`) | **40/40** (18-11; ahora restaura el vehículo predeterminado y no modifica datos existentes: huellas idénticas antes y después) | Claude (ejecutadas) |
| Numeración real en Supabase: concurrencia desde 2 dispositivos, importación y conflictos (`scripts/verificar-numeracion.mjs`) | **17/17** (repetida el 18-11) | Claude (ejecutadas) |
| Cloudflare real: reserva, concurrencia estricta, apagado, reintentos, contador caído (`scripts/verificar-cloudflare.mjs`) | **8/8 y 2/2** | Claude (ejecutadas) |
| Navegador real contra staging **sin cuenta**, PC y teléfono (`scripts/e2e-staging-anonimo.mjs`, versión del 18-11) | **59/59**: acceso privado, flujo completo, aviso de texto inválido, margen, «Precio total» y leyenda, PDF, controles ≥ 44 px, 0 errores, 0 dominios externos | Claude (ejecutadas) |
| Navegador real contra staging **con cuentas A y B**, PC y teléfono (`scripts/e2e-staging.mjs`, versión del 18-11) | **41/41**: inicio y cierre de sesión, cambio de cuenta, vehículos, cotizaciones, importación del historial local, otro dispositivo, enlaces públicos | Claude (ejecutadas) |
| Borradores M3 y M4 del diseño #45 en PostgreSQL **local desechable** (`scripts/diseno/probar-borradores.sh`), **sin tocar Supabase** | **18/18** y 3 controles negativos que fallan como corresponde (20-11). **C3** (fixtures compartidas con Zod): **27/27**, tras corregir en M3 un `CHECK` que dejaba pasar líneas con dos medidas. Medición de 16 KB con aserciones: **10/10** (`scripts/diseno/medir-16kb.sh`) | Claude (ejecutadas) |
| Integración I-1 + I-1b en navegador local (`scripts/e2e-integracion.mjs`): Pixel 7, iPhone 13 emulado, 1366 y 1440 | **278/278** con la flag (22-11, tres corridas; incluye emitir < 1 s después del último cambio y recargar, 104 verificaciones de D-I8 —recorridos manuales de 1 y 3 tramos, invalidación al cambiar direcciones, precio no recuperado y ruta del proveedor no guardada— y 40 de A-70: borrador manipulado sin errores de página) y **24/24** sin ella; además `e2e-staging-anonimo.mjs` en local 54/59 (5 fallas propias de staging: 401 y `localhost` como dominio externo). Sin cuentas reales ni Safari real | Claude (ejecutadas) |
| Robustez ante números extremos (A-71) en navegador local, **con y sin flag** (`scripts/e2e-numeros.mjs`): Pixel 7, iPhone 13 emulado, 1366 y 1440 | **900/900** (22-11; 540 de A-71 + 304 de A-73 + 56 de A-75, sobre los reemplazos de valor (ejemplo, vehículo y margen 15 %); A-73 cubre texto no numérico en cada campo, comparación opcional que no bloquea, borrador con texto inválido y mínimo de «Mi vehículo»): 1e308 en cada campo, topes exactos, negativos, decimales en ayudantes, margen 90 %, precio sobre el tope y combinaciones que desbordarían el motor. El campo se marca, el cálculo queda en pausa, no se reemplaza nada y no hay errores de página. 15 + 16 + 9 defectos reintroducidos, todos detectados ([24](docs/24-robustez-numerica.md)) | Claude (ejecutadas) |
| Migración de #52 (A-74) en PostgreSQL **local desechable** (`scripts/diseno/ensayo-52/ensayar.sh` y `probar-borradores.sh`), **sin tocar Supabase** | **65 OK** y **24/24** (22-11). Cubre:<br>• huecos H1–H4 sobre las migraciones anteriores;<br>• la migración real: privilegios (también `anon`, `service_role` y `PUBLIC`), aislamiento, concurrencia, idempotencia (aplicada dos veces), límites de `INTEGER` y reintentos;<br>• X1–X8;<br>• verificaciones de solo lectura en sus dos versiones, con paridad;<br>• M3/M4 con T6c y T6d;<br>• reversión ensayada sin pérdida de datos;<br>• `verificar-restauracion.sql` antes y después, con datos reales.<br>Controles C1–C5 y «contador actual», más 5 mutaciones: todos detectados ([23 §11](docs/23-revision-52-insert-directo.md)) | Claude (ejecutadas) |
| Respaldo, conexión segura (con TLS verificado) y simulacro de restauración (A-77 a A-79; `scripts/simulacro/probar-simulacro.sh`). Servidor PostgreSQL temporal propio, con TLS de una CA de prueba, contraseña `scram-sha-256` y zona horaria `America/Santiago`, Auth representativo y **credenciales ficticias** | **98/98** (24-11). Cubre:<br>• **T** (A-79), TLS: `verify-full` con la CA correcta conecta y respalda; se rechazan otra CA (la contraseña no llega al servidor), un nombre de servidor distinto, un certificado faltante, inválido o que no es CA, los modos `disable`/`allow`/`prefer`/`require`/`verify-ca` editados a mano, las claves repetidas, `PGSSL*` y la excepción de prueba fuera de loopback; 8 mutaciones TLS detectadas;<br>• **A**, credenciales: la contraseña nunca aparece en argumentos, entorno, `/proc`, salida, respaldo, resultado de solo lectura ni repositorio; rechazos explícitos y errores saneados;<br>• **E**, simulacro antes y después de #52 y con volcado completo: «DATOS VERIFICADOS», contenido de 8 tablas;<br>• **B**, alterar cliente, precio, JSON interno, vehículo, correo o hash de contraseña → `HAY DIFERENCIAS`; 11 formatos no reconocidos → error explícito;<br>• **C**, un enlace vencido entre el respaldo y el simulacro no da una diferencia falsa;<br>• controles de A-77 y limpieza.<br>9 mutaciones de A-78 detectadas. **No probado:** Windows/WSL, PostgreSQL 17 (el contenedor tiene 16), un respaldo real de Supabase y que Supabase Auth funcione tras restaurar ([25 §7](docs/25-lista-staging-52.md)) | Claude (ejecutadas) |
| Flujo completo en navegador local (A-80, `scripts/e2e-flujo-completo.mjs`, sin flags): Pixel 7 y PC 1366. Cubre vehículo → recorrido manual de 3 tramos sin red → costos → precio → cotización guardada → PDF (modo impresión) → enlace de WhatsApp | **84/84** (24-11; dos corridas del agente y una de Claude). El texto de WhatsApp coincide con el documento, sin datos internos. **H1:** con un precio con decimales, el PDF y WhatsApp difieren | Claude (ejecutadas) |
| Integración de I-2 cliente↔servidor en PostgreSQL local (A-80, `scripts/diseno/i2/probar-i2.sh`) | **49/49**: 7 cotizaciones del cliente real guardadas con los borradores M3/M4 sobre las 4 migraciones y leídas de vuelta campo por campo. **Control:** M4 sin ajustar a #52 falla (`permission denied for schema private`) | Claude (ejecutadas) |
| Editores de inventario y recursos (fase 1, interfaz plegable) en navegador local, con y sin flag (`scripts/e2e-modulos.mjs`): Pixel 7, iPhone 13 emulado, 1366 y 1440 | **210/210** (20-11), con capturas; incluye foco al cerrar, cambio de modo y totales con datos inválidos. No probado en Safari real ni con lector de pantalla | Claude (ejecutadas) |
| Revisión independiente del código | Flujo general: 7 auditorías y la [revisión de los cinco frentes del 18-11](https://github.com/ratatecuala/calculadora-de-costos-log/pull/34#issuecomment-6970465877). Cotizador ampliado: auditorías del diseño, de las fases 0 y 1 y de la integración; [final de I-1 + I-1b](https://github.com/ratatecuala/calculadora-de-costos-log/issues/53#issuecomment-7052650743): **0 P0 · 0 P1** | ChatGPT, **por inspección**: no reproduce las ejecuciones |

Las credenciales de los scripts se leen siempre de archivos **fuera** del repositorio.

## Decisiones

Fuente: [07 · Decisiones](docs/07-decisiones.md). Una decisión está **APROBADA** cuando el propietario la deja por escrito en GitHub.

- **APROBADAS por escrito (PR #34):**
  - **A-47:** numeración de cotizaciones única, correlativa y atómica por cuenta, que conserva el número emitido.
  - **A-48:** este README como fuente de continuidad, actualizado con cada avance.
- **APROBADAS por escrito el 18-11 ([registro de ratificación en el PR #34](https://github.com/ratatecuala/calculadora-de-costos-log/pull/34#issuecomment-6971449761)), implementadas:**
  - **A-50:** margen sobre el precio de venta con rótulo corregido; validación de entradas, con aviso en el campo si se escribe algo que no es número; sin «$-0»; margen con decimales visible. No incluye recargos ni precio negativos (NE-1 y NE-10, sin decidir).
  - **A-51:** «Precio total» y leyenda «Esta cotización no es factura ni boleta.» **Transitorio:** no habilita cotizaciones comerciales reales hasta validar la política tributaria.
- **APROBADAS el 20-11** ([ratificación en #43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7041864905)): **A-55 a A-60**, que aprueban la planificación del cotizador ampliado (no su desarrollo), el alcance inicial de vehículos, las investigaciones C-1 y C-2, los ayudantes por hora o por servicio, solo el diseño de migraciones y el catálogo piloto de hasta 15 versiones.
- **APROBADAS el 20-11** (comunicadas por chat y registradas literalmente en #43 por la misma cuenta, AGENTS.md §6.7):
  - **A-61 y A-62:** diseño #45 versión 3, con D-4 = (b) y T-1 a T-6 ([registro](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7044997471)).
  - **A-63:** fase 0 (contratos y pruebas). **Cerrada.**
  - **A-64 y A-65:** T-7 (límites provisionales de recursos) y T-8 (`fragile` y `handling` no sirven para costos ni seguridad) ([registro](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7045847482)).
  - **A-66:** fase 1, editores de inventario y recursos detrás de una flag apagada. **Cerrada técnicamente.**
  - **A-67 y A-68:** D-I1 a D-I7 e implementación de I-1 + I-1b con C1 y C2 ([registro](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7050929523)). **Cerrada técnicamente** (0 P0 · 0 P1).
- **APROBADA el 21-11** ([registro en #43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7071050495)):
  - **A-69:** D-I8 **parcial**, solo el recorrido manual (no las correcciones sobre rutas automáticas). **Implementada y auditada** (0 P0 · 0 P1 · 1 P2). Incluye la revisión **documental** de #52, sin implementarla.
- **APROBADA el 22-11** ([registro en #43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7071441529)):
  - **A-70:** corregir el P2 de D-I8 (**hecho**, [22 §16](docs/22-diseno-integracion-cotizador.md)) y rediseñar solo en documento el contador de #52. D-52-1 y D-52-2 aceptadas como orientación técnica; D-52-3, criterio futuro; D-52-4 requiere rediseño; D-52-5, provisional.
- **APROBADAS el 22-11** ([registro en #43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7071778285)):
  - **A-71:** robustez ante números extremos (Frente A). **Implementada y auditada** (0 P0 · 0 P1 · 2 P2, corregidos por A-73).
  - **A-72:** diseño de #52 aprobado. **D-52-4 v2 / N1**, incluido el cambio de numeración, más **D-52-1** y **D-52-2** como criterios de diseño. D-52-3, reservado para M4; D-52-5, provisional; D-52-4b, solo si aparecen contadores inflados. **Implementar #52 sigue sin autorizar.**
- **APROBADAS el 22-11** ([registro en #43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7072135863)):
  - **A-73:** texto no numérico que bloquea la emisión, comparación opcional que no bloquea y mínimo de rendimiento en «Mi vehículo». **Implementadas y auditadas** (0 P0 · 1 P1, corregido por A-75).
  - **A-74:** migración de #52 **solo en el repositorio y en PostgreSQL local** ([23](docs/23-revision-52-insert-directo.md)); auditoría solicitada. **No** autoriza ejecutarla en Supabase.
- **APROBADAS el 22-11** ([registro en #43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7077903187)):
  - **A-75:** al reemplazar un valor (ejemplo, vehículo o margen predefinido) se quita el error de texto de ese campo y de ninguno más. **Implementada y cerrada técnicamente** ([24 §8](docs/24-robustez-numerica.md)).
  - **A-76:** migración local de #52 **aprobada técnicamente**, sin modificarla. Se preparó **solo** la [lista de comprobación para staging](docs/25-lista-staging-52.md). **Ninguna operación remota.**
  - **A-77:** procedimiento de respaldo y restauración reproducible, **solo documentación y herramientas locales**. Incluye:
    - el nombre de migración corregido;
    - un simulacro que crea Auth con las columnas del propio respaldo y elige las migraciones según el estado de #52;
    - psql como única verificación formal de solo lectura;
    - instrucciones para Windows 11 que protegen los archivos descifrados.

    **Implementada y probada con datos ficticios.** Su reauditoría dio 0 P0 · 2 P1 · 1 P2, corregidos por A-78.
  - **A-78:** se corrigen esos hallazgos, **solo en herramientas locales y documentación**:
    - conexión segura con `pg_service.conf` y `pgpass` (`600`), sin contraseña en argumentos ni en registros;
    - huellas del contenido completo, con Auth reconstruido con sus tipos y el mensaje «DATOS VERIFICADOS», que aclara que no prueba Supabase Auth;
    - errores explícitos ante formatos no reconocidos;
    - instante de referencia para los enlaces que vencen.

    **Implementada y probada con credenciales ficticias (60/60).** Su reauditoría dio 0 P0 · 1 P1 (TLS sin verificación del servidor), corregido por A-79.
  - **A-79:** TLS con identidad verificada:
    - `sslmode=verify-full` y `sslrootcert` con el certificado raíz del panel de Supabase;
    - se rechazan los modos inseguros (también editados a mano), las claves repetidas, los parámetros extra y las variables `PGSSL*`;
    - las pruebas locales sin TLS van solo con una excepción explícita de loopback.

    **Implementada y probada (98/98)**; nueva auditoría solicitada. **POR CONFIRMAR** el menú del panel y que el certificado oficial valide el Session pooler.
- **PENDIENTES de tu decisión:** tras la auditoría de A-74, autorizar la ejecución de #52 en staging (requiere el primer respaldo real y A-59, [23](docs/23-revision-52-insert-directo.md)); D-52-4b, solo si aparecen contadores inflados; la política de D-52-5 antes de un lanzamiento público; D-2b, D-5, D-7, D-10 y el punto 2 de D-I8 (correcciones sobre rutas automáticas, para cuando haya rutas reales).
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
  - **Supabase (17, A-52):** se queda en el plan gratuito con respaldo propio. Pendientes:
    - el **primer respaldo real** y su simulacro, que haces tú porque requieren la contraseña de la base; los pasos para Windows 11 están en [25](docs/25-lista-staging-52.md);
    - elegir el segundo lugar donde guardar los respaldos.

    El ensayo del 18-11 usó un *stub* de Auth que **no** puede cargar un respaldo real (A-77); lo reemplaza `scripts/simulacro/`. La conexión se configura con `scripts/conexion/configurar-conexion.py`, que nunca pone la contraseña en la línea de comandos (A-78).
  - **Google OAuth (A-53):** pendiente que **crees el cliente** en modo *Testing*. El registro por correo queda abierto mientras Google esté en *Testing*; antes de abrir al público se cerrará con un *hook*. La protección de contraseñas filtradas **requiere el plan Pro**.
  - **Cotizador ampliado (22 §14):** antes de encender la flag para transportistas faltan e2e con cuentas reales y la suite 59/59 en un staging autorizado, Safari en un iPhone real y un lector de pantalla real (D-I8 ya está decidida, implementada y auditada; su P2 se corrigió con A-70). #52 debe resolverse antes de M3/M4: la revisión ([23](docs/23-revision-52-insert-directo.md)) encontró además que un documento emitido se puede reemplazar borrándolo e insertándolo de nuevo (H3); la propuesta lo cierra.
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
- encender `VITE_FF_CARGA_RECURSOS` o `VITE_FF_INTEGRACION_CARGA` fuera de pruebas locales;
- implementar #52, I-2 o I-3, o el punto 2 de D-I8 (correcciones sobre rutas automáticas);
- ejecutar migraciones o redesplegar staging;
- cambiar el IVA o activar reglas tributarias.

Reglas completas en [AGENTS.md](AGENTS.md).

## Documentación

| Archivo | Contenido |
|---|---|
| [AGENTS.md](AGENTS.md) | Reglas de trabajo y autorización para todos los agentes |
| [01 · Alcance](docs/01-alcance.md) | Funciones gratuitas, flujo y exclusiones |
| [02 · Arquitectura](docs/02-arquitectura.md) | Arquitectura, política de consultas e implementación |
| [03 · Motor de costos](docs/03-motor-de-costos.md) | Fórmulas, cotas y casos dorados |
| [04 · Fuentes de datos](docs/04-fuentes-de-datos.md) | Fuentes de datos y restricciones de uso |
| [05 · Pruebas](docs/05-pruebas-y-calibracion.md) | Pruebas automáticas y reales; inventario por archivo y cifras vigentes |
| [06 · Seguridad y privacidad](docs/06-seguridad-y-privacidad.md) | Datos, cotizaciones compartidas y control de cargos |
| [07 · Decisiones](docs/07-decisiones.md) | Registro de decisiones y su estado |
| [08 · Hoja de ruta](docs/08-hoja-de-ruta.md) | Estado vigente por frente y hoja de ruta histórica del 16-11 |
| [09 · Revisión y aprobación](docs/09-revision-y-aprobacion.md) | Protocolo de revisión y aprobación |
| [10 · Diseño UX/UI v4](docs/10-diseno-ux.md) | Diseño aprobado |
| [11 · Auditoría Google Maps](docs/11-auditoria-google-maps.md) | Costos y condiciones de Google |
| [12 · Alternativas de mapas](docs/12-alternativas-mapas.md) | Comparación preliminar de proveedores (no aprobada) |
| [13 · Staging](docs/13-staging.md) | Recursos, RLS, pruebas reales, interruptores, respaldo y pasos manuales |
| [14 · QA de experiencia de usuario](docs/14-qa-ux.md) | Teléfono y PC/notebook: hallazgos, correcciones y paridad por flujo |
| [15 · Validación del motor](docs/15-validacion-motor.md) | Recálculo independiente, hallazgos y decisiones (#24) |
| [16 · IVA en las cotizaciones](docs/16-iva-cotizaciones.md) | Normativa chilena, documento tributario vs cotización y propuesta (#16) |
| [17 · Supabase: seguridad y respaldo](docs/17-supabase-seguridad-respaldo.md) | Auditoría, ajustes de Auth, respaldo y restauración (§5.2–§5.3: conexión segura, A-78; §5.6: simulacro automático, A-77 y A-78), Google OAuth (#35) |
| [18 · Encargo de Deep Research sobre IVA](docs/18-encargo-deep-research-iva.md) | Preguntas para validar la tributación antes de la opción B (#16, A-54) |
| [19 · Plan del cotizador ampliado](docs/19-plan-cotizador-ampliado.md) | Catálogo de vehículos, inventario de carga, costo según carga, IVA en dos opciones y rutas reales: etapas, datos y decisiones (épica #42; planificación **aprobada**, A-55 a A-60) |
| [20 · Encargos de Deep Research del cotizador](docs/20-encargos-deep-research-cotizador.md) | C-1 catálogo y mercado, C-2 costo según carga y recursos; listos para ejecutar (el IVA no se duplica) |
| [21 · Diseño de datos del cotizador ampliado](docs/21-diseno-datos-cotizador.md) | Diseño técnico de #45, **versión 3, aprobado** (A-61 a A-63; fase 0 cerrada en §16, fase 1 cerrada en §17; corrige la auditoría y los 5 P2 de la reauditoría): módulos, contratos, inmutabilidad con 4 capas, persistencia local, medición de 16 KB con aserciones, borradores M3 y M4 ensayados en local (18/18 y 3 controles negativos), carriles paralelos y **plan de implementación por puertas** (§15) |
| [22 · Diseño de integración con el cotizador](docs/22-diseno-integracion-cotizador.md) | **Versión 2**, D-I1 a D-I7 aprobadas e **I-1 + I-1b implementadas** (§10) y **cerradas técnicamente** (§14, 0 P0 · 0 P1); **D-I8 parcial implementada** (§15, A-69, en auditoría). Puerta P2: v2 solo en el navegador; copia mixta v1/v2 con diferidas; recuperación del borrador (I-1b) antes de habilitar a usuarios; «Incluye» con casilla explícita; I-1 en el navegador sin migraciones, I-2 en la cuenta tras #52 y M3/M4, I-3 recursos en el costo con aprobación de fórmulas; fuente única de cada costo, conservación de datos, protección de históricos y decisiones D-I1 a D-I7 |
| [23 · #52: escritura directa, documentos emitidos y contador](docs/23-revision-52-insert-directo.md) | **Versión 4:** diseño aprobado (A-72) y **migración implementada en el repositorio y ensayada solo en local** (A-74, §11), **no aplicada en Supabase**. La migración incluye D-52-1 (DEFINER y escritura directa revocada), D-52-2 (sin acceso a `private`) y N1, y se puede aplicar dos veces sin cambiar nada. Tiene reversión ensayada, verificaciones de solo lectura en dos versiones (psql y editor SQL de Supabase) y adapta `verificar-rls.mjs` y `verificar-numeracion.mjs` (sin ejecutar). Ensayo local: **65 OK** |
| [24 · Robustez ante números extremos](docs/24-robustez-numerica.md) | **Implementada** (A-71, 22-11): auditoría de todas las entradas numéricas, límites técnicos por campo, inválido ≠ faltante ≠ cero, pausa del cálculo con error en el campo, barrera ante fallos del motor y compatibilidad; sin cambiar fórmulas |
| [25 · Lista de comprobación para staging de #52](docs/25-lista-staging-52.md) | **Versión 4 (A-79, 24-11): preparada; nada ejecutado contra Supabase.** Pasos para el propietario con Windows 11:<br>• preparar el equipo (WSL, PostgreSQL 17, age y clave);<br>• descargar el **certificado raíz** de Supabase y copiarlo a Ubuntu, para una conexión con TLS verificado (`verify-full`);<br>• confirmar que nada aplica migraciones solo;<br>• configurar la **conexión segura** con un asistente que no muestra la contraseña;<br>• el respaldo real cifrado;<br>• el **simulacro automático** de restauración (`scripts/simulacro/`), que borra los archivos descifrados;<br>• las verificaciones de solo lectura **con psql** (`scripts/verificar-solo-lectura.sh`; el editor solo es informativo) y cómo leer V1–V17;<br>• la revisión antes de pedir A-59.<br>También las pruebas con datos y credenciales ficticios (98/98) y sus limitaciones |

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
