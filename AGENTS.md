# CamiON Costos — Reglas obligatorias para agentes

Este archivo es la **puerta de entrada operativa** para Claude, ChatGPT, Codex y cualquier otro agente que trabaje en este repositorio. Se inspira en el flujo de LIVIO 2.0, VetPo y Voli, adaptado exclusivamente a CamiON Costos.

## 1. Antes de trabajar

1. Leer, en orden: [README.md](README.md), este archivo, [decisiones](docs/07-decisiones.md), [hoja de ruta](docs/08-hoja-de-ruta.md) y [protocolo de revisión](docs/09-revision-y-aprobacion.md).
2. Consultar el issue asignado, los PR abiertos y el estado de `main`. Leer la documentación técnica específica del cambio.
3. Identificar la tarea concreta, sus archivos afectados, cómo se comprobará y **qué aprobación permite ejecutarla**.
4. Si no existe autorización expresa para el alcance, **detenerse y pedirla**. Que un issue exista, una propuesta esté documentada o una IA la recomiende no equivale a permiso.
5. Al detectar contradicciones, priorizar una decisión reciente y explícita del propietario, dejar evidencia en el issue y proponer la actualización documental. No presentar como aprobado algo que todavía no lo está.

## 2. Situación y alcance vigente

- **Producto:** calculadora web gratuita para fleteros independientes y personas que necesitan mover una carga en Chile; dos modos: «Soy fletero» y «Necesito transportar algo».
- **Fase:** E0, organización e investigación. **La programación de E1 aún no está autorizada.**
- **Tecnologías acordadas provisionalmente:** TypeScript estricto, React + Vite, Cloudflare Workers, motor matemático aislado en un proyecto único.
- **No hay aplicación funcional ni despliegue autorizado.** No afirmar lo contrario.
- **Cargos variables de APIs: $0 autorizados**. No activar facturación ni servicios que puedan generar cargos sin aprobación expresa.
- **Repositorio público**; licencia aún pendiente. Ningún documento privado o secreto debe incorporarse.
- Cuentas técnicas a nombre y bajo control del propietario.
- El marketplace, cuentas de usuarios, IA, ERP y aplicación nativa están **fuera de v1**.
- La fuente de decisiones es [docs/07-decisiones.md](docs/07-decisiones.md); el alcance y fórmulas están en [docs/01-alcance.md](docs/01-alcance.md) y [docs/03-motor-de-costos.md](docs/03-motor-de-costos.md).

## 3. Responsabilidades y sistema de trabajo

| Participante | Responsabilidad |
|---|---|
| **Propietario** | Decide alcance, prioridades, gastos, cuentas, despliegues y aprobaciones de PR |
| **Claude / Claude Code** | Arquitectura, implementación de tareas autorizadas, pruebas, documentación y entrega |
| **ChatGPT** | Coordinación, revisión crítica independiente de PR, requisitos, fórmulas y pruebas |

- **GitHub:** fuente de verdad de código, documentación, decisiones e issues.
- **Trello:** seguimiento visual por fases y entregables, **solo cuando el propietario autorice crearlo/configurarlo**. No duplicar cada issue como una tarjeta.
- No trabajar dos agentes simultáneamente sobre el mismo archivo o rama sin coordinarlo. Los cambios hechos por un agente deben inspeccionarse antes de continuar.
- No copiar reglas técnicas de VetPo, LIVIO o Voli que no correspondan a este producto.

## 4. Estados que deben distinguirse

- **APROBADO:** decisión expresa del propietario, registrada con referencia.
- **ACORDADO TÉCNICAMENTE:** postura recomendada por los agentes, sujeta a autorización cuando corresponda.
- **PROPUESTO:** puede debatirse; no autoriza ejecución.
- **POR VALIDAR:** depende de fuentes, mediciones o pruebas.
- **BLOQUEADO / NO AUTORIZADO:** no ejecutar.

Para cifras y datos: **HECHO VERIFICADO** (fuente y fecha), **ESTIMACIÓN**, **SUPUESTO** o **DATO FALTANTE**. No convertir supuestos en hechos ni sustituir `null` por cero.

## 5. Autorizaciones y límites

**Durante E0 se permite:** lectura, auditoría, investigaciones sin gasto, documentación y preparación de issues o PR documentales dentro del alcance autorizado.

**Requiere aprobación específica del propietario:** iniciar programación E1; integrar cualquier PR a `main`; habilitar facturación o gastos; crear/conectar cuentas o servicios; publicar una URL; cambiar fórmulas, fuentes de datos, alcance o arquitectura; incorporar datos reales de terceros; modificar textos legales; renombrar/eliminar repositorios, ramas o documentos; reorganizar Trello.

**Prohibido sin autorización:** cambios directos en `main`, auto-merge, force-push, eliminación de información, migraciones o cambios en producción, exposición de credenciales, activación de APIs con riesgo de gasto, comunicaciones a terceros en nombre del propietario.

La aprobación de **documentación no autoriza programación**, y la de un PR no autoriza trabajos futuros distintos.

## 6. Ciclo de trabajo por tarea

1. Elegir **un issue autorizado**, confirmar dependencias y estado del repositorio.
2. Antes de editar, presentar al propietario en lenguaje simple: **tarea, archivos a tocar, cambio exacto, cómo se probará y qué queda fuera**. Esperar autorización cuando no exista.
3. Trabajar en **rama propia**, con cambios pequeños y limitados. No hacer refactorizaciones ni mejoras «por si acaso»; no agregar dependencias sin justificación.
4. Ejecutar pruebas pertinentes: casos matemáticos resueltos independientemente, pruebas automatizadas y verificación móvil si se cambia la interfaz. Registrar también lo que **no pudo** probarse.
5. Abrir PR, preferentemente **draft** hasta completar la revisión, con **Refs #N** (no `Closes`/`Cierra` automático), resumen, archivos, riesgos, resultados y 3–6 pasos para probar **sin comandos** desde la web cuando sea posible.
6. Solicitar revisión técnica de ChatGPT cuando cambie motor, seguridad, privacidad, proveedores, costos o arquitectura. Una revisión de IA no sustituye la aprobación del propietario.
7. **No integrar a `main` hasta que el propietario escriba una aprobación inequívoca para ese PR**. Si el autor es la misma cuenta GitHub, registrar el OK mediante comentario en el PR.
8. Después de la integración autorizada, actualizar estado, decisiones, documentación e issues según corresponda. No cerrar un issue por anticipado.

**Definición de terminado:** resultado comprobado, criterios de aceptación cumplidos, pruebas en verde o limitaciones explicadas, documentación sincronizada, revisión técnica y aprobación del propietario para integrar.

## 7. Seguridad, matemáticas y calidad

- Jamás copiar o imprimir tokens, contraseñas, claves, `.env`, datos de calibración privados ni domicilios reales en issues, PR o código público.
- El motor debe distinguir dinero desembolsado, desgaste, costos fijos asignados, sueldo objetivo y comparación de tercerización; mantener fuentes, versiones e incertidumbre.
- Toda modificación de fórmulas exige **casos dorados**, pruebas y revisión explícita; no confundir costo faltante con costo cero.
- No introducir coeficientes de rendimiento o velocidad sin fuentes y calibración.
- Las cuotas y alertas de Google **reducen riesgo, pero no garantizan gasto cero**. Respetar el presupuesto autorizado y el modo manual.
- No afirmar que una categoría de vehículo es segura o compatible cuando faltan dimensiones, peso, restricciones o datos específicos.
- Consultar [seguridad y privacidad](docs/06-seguridad-y-privacidad.md) y [pruebas](docs/05-pruebas-y-calibracion.md) antes de cambios relacionados.

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
3. Indicar en pocas líneas: **hecho, pendiente, bloqueado, siguiente paso y autorización requerida**.
4. Dejar un resumen copiable:

```text
SYNC CAMION COSTOS
Repo: ratatecuala/calculadora-de-costos-log
Issue/PR:
Hecho:
Pendiente:
Bloqueado:
Siguiente acción:
¿Requiere aprobación del propietario?:
```

Estas reglas se aplican a todos los agentes; ningún agente puede ampliarse permisos a sí mismo.
