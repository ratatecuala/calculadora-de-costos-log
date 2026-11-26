# Calculadora de fletes (nombre pendiente) — Reglas obligatorias para agentes

Este archivo es la **puerta de entrada operativa** para Claude, ChatGPT, Codex y cualquier otro agente que trabaje en este repositorio. Se inspira en el flujo de LIVIO 2.0, VetPo y Voli, adaptado exclusivamente a este proyecto. El nombre comercial aún no ha sido elegido.

## 1. Antes de trabajar

1. Leer, en orden: [README.md](README.md), este archivo, [decisiones](docs/07-decisiones.md), [hoja de ruta](docs/08-hoja-de-ruta.md) y [protocolo de revisión](docs/09-revision-y-aprobacion.md).
2. Consultar el issue asignado, los PR abiertos y el estado de `main`. Leer la documentación técnica específica del cambio.
3. Identificar la tarea concreta, sus archivos afectados, cómo se comprobará y **qué aprobación permite ejecutarla**.
4. Si no existe autorización expresa para el alcance, **detenerse y pedirla**. Que un issue exista, una propuesta esté documentada o una IA la recomiende no equivale a permiso.
5. Al detectar contradicciones, priorizar una decisión reciente y explícita del propietario, dejar evidencia en el issue y proponer la actualización documental. No presentar como aprobado algo que todavía no lo está.
6. **Regla de investigación:** no iniciar investigaciones externas profundas sin aviso y autorización previa del propietario. El canal acordado para investigaciones profundas es **GPT Deep Research**; Claude recibe el informe, comprueba su encaje y ejecuta solo tareas documentales o técnicas autorizadas. Una comparación preliminar no constituye aprobación del proveedor ni habilitación de APIs. Leer [auditoría de Google](docs/11-auditoria-google-maps.md) y [alternativas de mapas](docs/12-alternativas-mapas.md).

## 2. Situación y alcance vigente

- **Producto inicial:** calculadora y cotizador **gratuitos para transportistas de fletes livianos en Chile**. Permitir cálculo anónimo; registro con Google para vehículos e historial. El modo «Necesito transportar», el marketplace y la logística elástica **no forman parte del primer lanzamiento**.
- **Fase:** prototipo funcional con staging gratuito (las etiquetas E0–E5 son identificadores de épica, ver [08](docs/08-hoja-de-ruta.md)). **Paridad teléfono/computador (A-49):** toda función debe estar completa y cómoda tanto en teléfono como en PC/notebook; «mobile-first» es solo técnica de maquetación. La dirección visual **v4 (blanco, azul sobrio y grafito)** está aprobada como **dirección general**; las pantallas de la extensión son referencia. El 16-11-2026 el propietario comunicó por chat a Claude los criterios funcionales: mapa con un camino a la vez, tráfico bajo demanda, comparación de rutas en la versión gratuita, términos sencillos, resultados parciales, sin hora fija de reinicio, IVA configurable y separación de la cotización (A-21 a A-29). **Están pendientes de ratificación escrita en el PR #34** (ver [07](docs/07-decisiones.md)). El propietario encargó **cerrar la arquitectura, verificar integraciones y actualizar el backlog** (A-30). El **17-11-2026** el propietario seleccionó **Google Routes Essentials** y autorizó, **solo dentro del PR #34**, las fases 1 (documentación), 2 (candado de consumo) y 3 (cotizador con **datos simulados**) (A-31 a A-44). **Siguen sin autorización:** activar APIs de Google, crear cuentas, facturación, despliegue y merge. El **18-11-2026** el propietario autorizó por chat integrar **Cloudflare y Supabase en un entorno gratuito de staging** (A-46, pendiente de ratificación escrita en el PR #34); **no** autorizó producción pública, planes de pago, facturación, Google Routes real ni merge. Ver [13 · Staging](docs/13-staging.md).
- **Estado vigente (25-11-2026, hora de Chile):** el producto avanza por **fases con puertas de aprobación** (A-84 y A-85, [08](docs/08-hoja-de-ruta.md)). La fase 0 tiene cuatro bloques: 0A MVP, 0B validación económica, 0C competitividad y 0D seguridad y piloto. Hechos **solo en local**, sin aplicar en Supabase:
  - #52 (A-74 y A-76);
  - I-2 paso 1, detrás de `VITE_FF_CARGA_NUBE` apagada (A-81);
  - precio entero en el cliente (A-81) y en la base (A-83).

  **Siguen sin autorización:**
  - aplicar migraciones en Supabase, desplegar y encender flags;
  - los pasos de staging de [25](docs/25-lista-staging-52.md) (A-59);
  - I-3, Google Routes real e IVA automático;
  - producción y merge del PR #34.

  Ninguna fase se desbloquea sola. El párrafo siguiente conserva el estado del 21-11 como **historia**.
- **Estado del 21-11-2026 (histórico):** decisiones A-47 a A-69 **aprobadas** y registradas por escrito en GitHub; A-21 a A-29 y A-31 a A-46 siguen comunicadas, pendientes de ratificación escrita ([07](docs/07-decisiones.md)). Cotizador ampliado: fase 0 cerrada (A-63), fase 1 cerrada técnicamente (A-66) e integración **I-1 + I-1b cerrada técnicamente** (0 P0 · 0 P1), todo detrás de **flags apagadas** y sin cambiar el costo ([22 §14](docs/22-diseno-integracion-cotizador.md)). D-I8 parcial (solo recorrido manual) implementada con A-69 ([22 §15](docs/22-diseno-integracion-cotizador.md)). **Siguen sin autorización:** encender las flags, el punto 2 de D-I8, implementar #52 (solo su revisión documental está autorizada), I-2, I-3, migraciones, despliegues (staging incluido), Google Routes real, IVA automático, producción y merge del PR #34. El párrafo anterior conserva el contexto histórico de cada autorización.
- **Tecnología:** motor puro y aislado; TypeScript + React + Vite + Cloudflare como punto de partida. **Autenticación y almacenamiento son ahora necesarios** para cuentas, vehículos y cotizaciones; Supabase es un candidato, no proveedor aprobado *(estado vigente: A-52 aprobó Supabase en plan gratuito con respaldo propio para el staging; no autoriza producción ni planes de pago)*.
- **Hay un staging privado (gratuito) y ninguna producción.** Distinguir siempre «funciona en staging», «preparado» y «bloqueado» ([13](docs/13-staging.md)). No afirmar que existe un lanzamiento.
- **Cargos variables de APIs: $0 autorizados**. El propietario acepta evaluar Google Cloud con cuenta de facturación, pero **no autorizó activar APIs con riesgo de cargos ni consumirlas**. Límites de cuota no garantizan $0.
- **Repositorio público**; licencia aún pendiente. Ningún documento privado o secreto debe incorporarse.
- Cuentas técnicas a nombre y bajo control del propietario.
- **Dentro de v1:** rutas A→B automáticas (base/regreso opcionales) con enlace a Google Maps y **sin mapa integrado**, combustible, TAG, costos, PDF y registros manuales de viajes/cargas; cuentas Google para guardar. **Fuera:** solicitudes y ofertas a clientes, marketplace/logística elástica, alto tonelaje, IA, pagos y Pro. La comparación de categorías/tercerización para clientes queda pospuesta.
- La fuente de decisiones es [docs/07-decisiones.md](docs/07-decisiones.md); el alcance y fórmulas están en [docs/01-alcance.md](docs/01-alcance.md) y [docs/03-motor-de-costos.md](docs/03-motor-de-costos.md).

## 3. Responsabilidades y sistema de trabajo

| Participante | Responsabilidad |
|---|---|
| **Propietario** | Decide alcance, prioridades, gastos, cuentas, despliegues y aprobaciones de PR |
| **Claude / Claude Code** | Arquitectura, implementación de tareas autorizadas, pruebas, documentación y entrega |
| **ChatGPT** | Coordinación, revisión crítica independiente de PR, requisitos, fórmulas y pruebas |

- **GitHub:** fuente de verdad de código, documentación, decisiones e issues.
- **Trello:** tablero privado de la fase 0 (A-85), para la coordinación visual entre el propietario, Claude, Codex y GPT. **GitHub es la fuente de verdad técnica**. No duplicar cada issue como una tarjeta y no publicar el enlace del tablero en el repositorio. Reorganizarlo sigue requiriendo autorización (§5).
- **Se permiten issues grandes y varios issues en paralelo.** No hay un tamaño máximo artificial: se elige según cohesión funcional, dependencias, capacidad de probar y claridad del seguimiento.
- Antes de paralelizar, identificar responsables, archivos afectados, dependencias y posibles conflictos. Si se solapan archivos, fórmulas, migraciones o contratos, coordinar el orden o trabajar secuencialmente sobre esa parte. **No trabajar dos agentes sobre el mismo archivo o rama a la vez sin coordinación expresa.** Como máximo **dos agentes secundarios simultáneos**, con integración secuencial; las tareas pequeñas se hacen directamente (§11).
- Los cambios hechos por otro agente deben inspeccionarse antes de continuar. Cada avance debe dejar evidencia y estado actualizado en su issue.
- No copiar reglas técnicas de VetPo, LIVIO o Voli que no correspondan a este producto.

## 4. Estados que deben distinguirse

- **APROBADO:** decisión expresa del propietario, registrada con referencia.
- **ACORDADO TÉCNICAMENTE:** postura recomendada por los agentes, sujeta a autorización cuando corresponda.
- **PROPUESTO:** puede debatirse; no autoriza ejecución.
- **POR VALIDAR:** depende de fuentes, mediciones o pruebas.
- **BLOQUEADO / NO AUTORIZADO:** no ejecutar.

Para cifras y datos: **HECHO VERIFICADO** (fuente y fecha), **ESTIMACIÓN**, **SUPUESTO** o **DATO FALTANTE**. No convertir supuestos en hechos ni sustituir `null` por cero.

## 5. Autorizaciones y límites

**Sin autorización específica se permite:** lectura, auditoría, investigaciones sin gasto, documentación y preparación de issues o PR documentales dentro del alcance autorizado.

**Requiere aprobación específica del propietario:** iniciar programación E1; integrar cualquier PR a `main`; habilitar facturación o gastos; crear/conectar cuentas o servicios; publicar una URL; cambiar fórmulas, fuentes de datos, alcance o arquitectura; incorporar datos reales de terceros; modificar textos legales; renombrar/eliminar repositorios, ramas o documentos; reorganizar Trello.

**Prohibido sin autorización:** cambios directos en `main`, auto-merge, force-push, eliminación de información, migraciones o cambios en producción, exposición de credenciales, activación de APIs con riesgo de gasto, comunicaciones a terceros en nombre del propietario.

La aprobación de **documentación no autoriza programación**, y la de un PR no autoriza trabajos futuros distintos.

## 6. Ciclo de trabajo por tarea

1. Elegir **uno o varios issues autorizados**, comprobar dependencias, prioridad y estado del repositorio. Se pueden ejecutar en paralelo si el trabajo es independiente o la coordinación evita conflictos.
2. Antes de editar, presentar al propietario en lenguaje simple: **tarea, archivos a tocar, cambio exacto, cómo se probará y qué queda fuera**. Esperar autorización cuando no exista.
3. Trabajar en **rama propia por frente coherente**. Un issue o PR puede abarcar varios archivos o funcionalidades relacionadas, y varios issues pueden avanzar simultáneamente. **Dividir solo cuando el tamaño, el acoplamiento o el riesgo dificulten revisar, probar, revertir o integrar sin confusiones.** No hacer refactorizaciones ni mejoras «por si acaso»; no agregar dependencias sin justificación.
4. Ejecutar pruebas pertinentes: casos matemáticos resueltos independientemente, pruebas automatizadas y verificación en **teléfono y escritorio** si se cambia la interfaz (A-49). Registrar también lo que **no pudo** probarse. Qué pruebas correr en cada momento: §11.3.
5. Abrir PR, preferentemente **draft** hasta completar la revisión, con **Refs #N** (no `Closes`/`Cierra` automático), resumen, archivos, riesgos, resultados y 3–6 pasos para probar **sin comandos** desde la web cuando sea posible.
6. Solicitar revisión técnica de ChatGPT cuando cambie motor, seguridad, privacidad, proveedores, costos o arquitectura. Una revisión de IA no sustituye la aprobación del propietario.
7. **No integrar a `main` hasta que el propietario escriba una aprobación inequívoca para ese PR**. Si el autor es la misma cuenta GitHub, registrar el OK mediante comentario en el PR.
8. Después de la integración autorizada, actualizar estado, decisiones, documentación e issues según corresponda. No cerrar un issue por anticipado.

**Criterio de tamaño y simultaneidad:** priorizar entregables funcionales completos, aunque sean grandes. No fragmentar por costumbre; dividir cuando los componentes sean independientes o aumente materialmente el riesgo de fallos, conflictos o pérdida de trazabilidad. Mantener un responsable y un estado claro por issue, con pruebas y puntos de integración definidos.

**Definición de terminado:** resultado comprobado, criterios de aceptación cumplidos, pruebas en verde o limitaciones explicadas, documentación sincronizada, revisión técnica y aprobación del propietario para integrar.

## 7. Seguridad, matemáticas y calidad

- Jamás copiar o imprimir tokens, contraseñas, claves, `.env`, datos de calibración privados ni domicilios reales en issues, PR o código público.
- El motor debe distinguir dinero desembolsado, desgaste, costos fijos asignados, sueldo objetivo y comparación de tercerización; mantener fuentes, versiones e incertidumbre.
- Toda modificación de fórmulas exige **casos dorados**, pruebas y revisión explícita; no confundir costo faltante con costo cero.
- No introducir coeficientes de rendimiento o velocidad sin fuentes y calibración.
- Las cuotas y alertas de Google **reducen riesgo, pero no garantizan gasto cero**. Respetar el presupuesto autorizado y el modo manual.
- El primer producto **no recomienda compatibilidad de vehículos para clientes** ni calcula precios de mercado ajenos. Si se plantea en el futuro, no afirmar compatibilidad sin dimensiones, peso y restricciones verificadas.
- Consultar [seguridad y privacidad](docs/06-seguridad-y-privacidad.md), [pruebas](docs/05-pruebas-y-calibracion.md) y la [guía UX v4](docs/10-diseno-ux.md). Antes de programar confirmar con propietario tanto arquitectura como todos los puntos de diseño pendientes.

## 8. Cómo pedir aprobación

Publicar en el issue o PR y explicar al propietario:

> **SOLICITUD DE OK**  
> Acción concreta: …  
> Archivos / servicios afectados: …  
> Incluye / excluye: …  
> Costo máximo y posibilidad de cobro: …  
> Riesgo y cómo revertir: …  
> Cómo probar: …

Si existen alternativas pagadas, mostrar primero la gratuita y sus límites. **Nunca solicitar claves por chat**.

## 9. Cierre de sesión y continuidad

Antes de finalizar una sesión:
1. Verificar el estado real del PR/issue; no declarar terminado algo sin prueba.
2. Actualizar únicamente los documentos relevantes y registrar decisiones nuevas aprobadas mediante PR.
3. Indicar en pocas líneas: **hecho, pendiente, bloqueado, siguiente paso y autorización requerida** (formato compacto: §11.4).
4. Dejar un resumen copiable:

```text
SYNC CALCULADORA DE FLETES
Repo: ratatecuala/calculadora-de-costos-log
Issue/PR:
Hecho:
Pendiente:
Bloqueado:
Siguiente acción:
¿Requiere aprobación del propietario?:
```

## 10. README como fuente de continuidad (regla permanente, A-48)

1. **Cada avance material** (función terminada, decisión, cambio de arquitectura, despliegue, prueba, bloqueo o hito) actualiza [README.md](README.md) **en el mismo PR o commit**. Cuando proceda, también [07 · Decisiones](docs/07-decisiones.md) y los documentos técnicos afectados, sin duplicar lo que ya está en otro documento o issue: enlazarlo (§11.5).
2. El README debe mostrar siempre, fechado:
   - objetivo;
   - estado real, distinguiendo «funciona», «simulado», «preparado» y «bloqueado»;
   - arquitectura a alto nivel;
   - rama, PR y commit activos;
   - pruebas, indicando cuáles **ejecutó** quién y cuáles solo se **revisaron**;
   - decisiones con su estado, riesgos, siguiente acción y límites de autorización;
   - la sección **«Estado para retomar en otro chat»**.
3. **Nada que envejezca:** no dejar etapas superadas («E0», «falta programar»), conteos de pruebas antiguos ni estados contradictorios.
4. **Portada pública (`main`):** el README de `main` no se actualiza solo desde una rama. Tras cada hito, el agente que trabaja en el repositorio:
   - genera la versión de portada con `node scripts/readme-portada.mjs`, que convierte los enlaces relativos en enlaces a la rama de desarrollo mientras esos archivos no existan en `main`;
   - la propone en un **PR exclusivamente documental contra `main`**, que solo contiene `README.md`;
   - deja que lo fusione **solo el propietario**.
5. No afirmar monitorización automática: la actualización ocurre cuando un agente trabaja en el repositorio.
6. **Nunca** publicar en el README URLs privadas de staging, secretos, identificadores de cuentas ni datos personales.

## 11. Eficiencia: contexto, paralelismo y pruebas (regla permanente, A-82)

Objetivo: menos tokens y menos tiempo **sin** bajar las pruebas, la seguridad ni la calidad. Esta sección **no cambia** autorizaciones, restricciones ni estados (§2, §4, §5).

1. **Contexto mínimo:**
   - leer primero el estado resumido (README, «Estado para retomar»), las decisiones vigentes y solo los archivos necesarios;
   - preferir búsquedas específicas, `git diff` y rangos de líneas;
   - no releer archivos que no cambiaron ni repetir el historial de decisiones o auditorías;
   - mantener un resumen operativo breve (estado, commit, tarea, bloqueos y siguiente paso). Al compactar el contexto, conservar decisiones, dependencias y problemas abiertos.
2. **Paralelismo:**
   - un agente coordinador y **como máximo dos agentes secundarios** simultáneos;
   - cada secundario recibe una tarea delimitada, sus archivos y su propio *worktree*, sin el repositorio ni el historial completos;
   - dos agentes nunca revisan los mismos archivos (§3);
   - cada secundario entrega un informe breve: archivos, pruebas, hallazgos y commit;
   - la integración es secuencial y resuelve los conflictos antes de seguir;
   - una tarea pequeña se hace directamente, sin otro agente.
3. **Pruebas:**
   - durante el desarrollo, solo las relacionadas con los archivos cambiados;
   - **tras integrar varios frentes, siempre la regresión completa**, que no se repite sin un cambio que la justifique;
   - se repiten ante fallos intermitentes, cambios críticos o inestabilidad;
   - los controles negativos, las mutaciones y las pruebas de seguridad se mantienen;
   - **la cobertura nunca baja** para ahorrar;
   - un cambio solo de documentación no exige correr las suites.
4. **Resultados compactos:**
   - informar solo resúmenes y errores relevantes; los registros largos van a archivos temporales locales;
   - no explicar cada comando;
   - reportar de inmediato los bloqueos reales y las decisiones que requieren aprobación (§8).
5. **Documentación y auditorías:**
   - actualizar solo los documentos afectados, sin duplicar entre README, documentos, issues y comentarios: enlazar las decisiones anteriores;
   - pedir auditoría independiente al cerrar un bloque significativo o ante un riesgo concreto. **Las auditorías obligatorias de §6.6 se mantienen**;
   - no abrir ciclos de refactorización o auditoría sin una justificación verificable.
6. **Prioridades:** lo que acerca la primera versión gratuita, con soluciones sencillas, mantenibles y sin servicios de pago. Nunca a costa de la seguridad, la precisión económica, el aislamiento de usuarios o la consistencia de los datos.

Estas reglas se aplican a todos los agentes; ningún agente puede ampliarse permisos a sí mismo.
