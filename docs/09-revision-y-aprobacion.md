# 09 · Cómo revisar y aprobar cambios (guía para el propietario)

No necesitas programar ni ejecutar comandos. Todo se hace desde la web de GitHub, también en el teléfono.

## Estado actual de las aprobaciones

> **Estado vigente (26-11-2026, hora de Chile):**
> - Las decisiones aprobadas llegan hasta **A-92** ([07](07-decisiones.md)). A-82 (protocolo de eficiencia) está en [AGENTS.md §11](../AGENTS.md); A-21 a A-29 y A-31 a A-46 siguen pendientes de ratificación escrita.
> - A-86 fija los roles permanentes: Deep Research investiga, GPT evalúa y coordina, Claude y Codex implementan tareas autorizadas; el propietario decide. Ver [AGENTS.md §3](../AGENTS.md#3-responsabilidades-y-sistema-de-trabajo).
> - Cada avance de fase pasa por una **puerta de aprobación** tuya ([08](08-hoja-de-ruta.md)).
> - **Ya hay CI:** el workflow [`a83.yml`](../.github/workflows/a83.yml) corre en los PR hacia `main` las pruebas unitarias, la compilación y los ensayos de precio entero e I-2 con PostgreSQL 17 desechable. Las pruebas de navegador y de staging las sigue ejecutando un agente y se informan en el PR o el issue.
> - El seguimiento visual de la fase 0 está en un tablero privado de Trello; GitHub sigue siendo la fuente de verdad.
>
> El párrafo siguiente es el estado del 20-11 (histórico):
>
> **Estado del 20-11-2026 (histórico):** las decisiones aprobadas por escrito llegan hasta **A-68** ([07](07-decisiones.md)); A-21 a A-29 y A-31 a A-46 siguen pendientes de ratificación escrita. Supabase está aprobado en plan gratuito para el staging (A-52). Cuando el autor del PR es tu misma cuenta, Claude registra literalmente tu aprobación en un comentario (AGENTS.md §6.7). **Todavía no hay CI ni vista previa automática por PR:** las pruebas las ejecuta Claude y sus resultados se informan en el PR o la issue; los pasos 2 y 3 del ciclo describen lo previsto. El párrafo siguiente es el estado del 16-11 (histórico).

La documentación del **PR #34** refleja el **alcance actualizado**. La **dirección visual v4 blanco/azul/grafito y las muestras de inicio/calculadora** están aprobadas por el propietario. El 16-11-2026 el propietario comunicó a Claude, por chat, la aprobación de la dirección v4 completa y de los criterios funcionales A-21 a A-29; **falta ratificarlos con un comentario en el PR #34** (ver [07](07-decisiones.md)). El **backlog se actualizó** ese día (ver [08](08-hoja-de-ruta.md)). Siguen pendientes **nombre comercial, aprobación de la arquitectura propuesta (proveedor de cuentas, Supabase #35) y límites de API**. Ver [guía UX v4](10-diseno-ux.md). Aprobar un documento no autoriza código, cuentas, despliegues, suscripciones ni cargos. 

## El ciclo de un cambio

1. **Claude trabaja en una rama** y abre un **pull request (PR)**: una propuesta de cambio que todavía no afecta a `main`.
2. **GitHub ejecuta las pruebas automáticamente** (desde E1). En el PR verás:
   - ✅ verde: las pruebas pasaron;
   - ❌ rojo: algo falló. Claude debe corregirlo antes de que lo revises.
3. **Vista previa** (desde E1): el PR incluye un enlace para abrir la versión de prueba en tu teléfono.
4. **Sección "Cómo probar"**: cada PR trae de 3 a 6 pasos con el resultado esperado. Por ejemplo: _"Ingresa 80 km y 10 km/L; debe decir 8 L."_
5. **ChatGPT revisa** el contenido técnico y deja sus observaciones.
6. **Tú decides:**
   - **Aprobar:** comenta en el PR _"Aprobado, puedes integrar"_. Los PR de Claude aparecen creados con tu cuenta, porque Claude actúa a través de la app de GitHub conectada a ella, y GitHub no permite aprobar formalmente un PR propio. Por eso **tu comentario es la aprobación oficial**.
   - **Pedir cambios:** comenta qué no funciona o qué no entiendes. No hace falta usar lenguaje técnico.
7. **Integración:** solo después de tu aprobación expresa, el PR se integra a `main`, ya sea con el botón **Merge pull request** o lo hace Claude por instrucción tuya.

## Qué revisar en un PR de documentación

- ¿Refleja lo que acordamos?
- ¿Lo **pendiente** aparece claramente como pendiente?
- ¿Hay algún dato personal, clave o documento privado? Si lo hay, **no apruebes** y avísalo.

## Qué revisar en un PR de código (desde E1)

- ✅ verde en las pruebas.
- Seguiste los pasos de "Cómo probar" y obtuviste lo esperado.
- Los textos se entienden sin conocimientos contables.
- El trayecto A → B y base/regreso opcionales no duplican kilómetros ni costos.
- La ruta más barata se afirma únicamente cuando se conocen componentes importantes como peajes.
- Se comprueban acceso anónimo, guardado con Google y PDF sin costos internos, según el alcance del PR.

## Qué siempre requiere tu autorización

1. Cualquier gasto o medio de pago.
2. Crear cuentas o asignar su titularidad.
3. Cambiar la visibilidad del repositorio.
4. Publicar en una URL pública.
5. Cambiar las definiciones o fórmulas del motor.
6. Cambiar o agregar fuentes de datos.
7. Ampliar el alcance.
8. Borrar o reorganizar el repositorio o Trello.
9. Los textos legales.
10. Calibrar con datos de terceros.
11. Integrar a `main` cualquier PR.

## Decisiones pendientes

Las encuentras filtrando los issues por la etiqueta **`decisión del propietario`**. Para decidir, comenta en el issue tu elección. Claude la registrará en [07 · Decisiones](07-decisiones.md) mediante un PR.
