# 05 · Pruebas, calibración y validación del lanzamiento gratuito

**Estado vigente (22-11-2026, con D-I8 parcial, A-70, A-71, A-73 y la migración local de #52, A-74):** `npm test` **636/636** y casos dorados **64/64**; detalle por archivo en «Pruebas del cotizador ampliado» y cifras vigentes al final. Las metas numéricas de validación real se aprobarán en #12; **no** se han hecho viajes de validación con transportistas.

*Estado original (16-11-2026, histórico): estrategia de control propuesta, sin código ni viajes de validación ejecutados.*

## 1. Motor matemático — primer requisito

- **Casos dorados calculados independientemente** (#24): al menos 10 casos representativos del **producto gratuito vigente**, no del comparador de tercerización aplazado.
- Invariantes: la misma entrada/versiones produce el mismo resultado; ningún costo se contabiliza dos veces; `null` ≠ 0; precio y recargos consistentes; impuestos según caso.
- Casos obligatorios: solo A→B; base→A→B; regreso; opción con autopista; opción evitando peajes; TAG desconocido; combustible/rendimiento faltantes; ayudante; costos fijos incompletos; cotización con precio distinto al sugerido. **Si faltan gastos fijos u otros componentes, el usuario puede continuar con precio propio para una cotización indicativa, con advertencia y sin presentar precio recomendado/utilidad como completos.**
- Precisión del motor **al peso**, sin redondeos intermedios; distinguir valor exacto interno y presentación redondeada.
- Pruebas de propiedad y de sensibilidad; un cambio incorrecto en fórmula debe hacer fallar pruebas.
- **No implementar** el comparador de tercerización, matching o marketplace en el primer lanzamiento.

## 2. Integraciones y rutas

- Dirección A/B y base: confirmar que el resultado corresponde al lugar y comuna realmente indicados; casos urbanos/rurales y ambiguos.
- Distancia y duración para cada tramo, con/sin peajes, cálculo del total sin duplicaciones.
- El tráfico influye en el **tiempo**, no crea litros por sí mismo. Probar opción de tráfico actualizado **bajo solicitud expresa**, sin nuevas llamadas en cada edición; controlar cuota y degradación sin asegurar una hora fija de recuperación.
- `avoidTolls` no garantiza no pasar por pórticos: probar casos con peajes y sin alternativa.
- Comparación con TAG o rendimiento desconocido: salida **parcial**, no afirmar alternativa ganadora.
- Mapas Embed y Routes: verificar y **advertir si difieren visualmente**.
- Documentar número de llamadas y SKU por flujo, incluidos reintentos y cambios de ruta. Ensayar cuotas agotadas y apagado, siempre conservando entrada manual.
- **No hacer pruebas facturables reales sin autorización**.

## 3. Acceso, seguridad y cotización

- Flujo **sin cuenta**: calcular sin cargar historial privado ajeno.
- Registro con Google: alta y retorno a sesión; guardado de vehículos, costos e historial por usuario; pruebas de aislamiento entre dos cuentas.
- Borrador, enviada, aceptada, rechazada; distinguir aceptación de **ingreso efectivamente cobrado**.
- PDF/compartir: verifica precio, fecha, servicio y condiciones; **no** expone costos internos, márgenes, remuneración, direcciones exactas no autorizadas ni datos de otro usuario. **IVA solo si corresponde**, con estado tributario comprobable, sin 19 % automático.
- Compartir enlace: controles de adivinación/revocación/expiración según diseño autorizado.
- Compatibilidad y accesibilidad en móvil (teclado, tamaño de controles, contraste, flujo de ida y vuelta sin pérdida de datos). Contrastar la implementación con la **línea visual v4**: blanco, azul sobrio, grafito, inicio/calculadora en una pantalla desplazable, una ruta visible a la vez; la extensión de las demás pantallas sirve de referencia (A-21, dirección general aprobada).
- Pruebas de respaldo/restauración, límites de almacenamiento y eliminación de cuenta.

## 4. Registros manuales de viajes y combustible

El registro **manual** es gratis; la lectura automática de fotografías y análisis avanzado son futuros.

- Capturar odómetro inicial/final o km medidos por el usuario, tiempos y litros realmente repostados.
- Calibración «lleno a lleno»: `rendimiento = km entre llenados completos / litros del llenado final` con ajuste explícito de cargas parciales intermedias.
- **Dos fotografías de odómetro no determinan el combustible consumido**.
- No mezclar rutas urbanas y carretera como rendimientos separados sin observaciones suficientes y criterio aprobado.
- Los valores de homologación **no equivalen** a consumo real.
- Los datos de calibración privada no deben subirse al repositorio público.

## 5. Validación con transportistas reales

**Hipótesis a validar:** usuarios que calculan un flete y vuelven a usar la aplicación para cotizaciones reales.

Métricas recomendadas (datos mínimos y consentidos):
1. Visita → primer cálculo terminado.
2. Primer cálculo → registro opcional.
3. Cálculo → cotización creada y compartida.
4. Uso repetido por semana/mes, sin atribuir identidad a usuarios anónimos sin necesidad.
5. Errores, abandono de campos, comprensión de costo parcial y de utilidad estimada.

Antes de publicación: pruebas con personas de distinto nivel digital, varios vehículos livianos y casos reales documentados; definir umbrales de aprobación en #12. **No usar altas de usuarios como única prueba de éxito.**

## 6. Herramientas candidatas

Vitest / pruebas de propiedades para motor; pruebas de integración para Workers y permisos; Playwright para rutas completas; accesibilidad automatizada más revisión manual. Elegir la suite definitiva después de aprobar arquitectura.


## Pruebas implementadas en el PR #34 (17-11-2026)

Se ejecutan con `npm test` (Vitest), sin red ni servicios externos.

| Archivo | Qué demuestra |
|---|---|
| `tests/budget.limits.test.ts` | **1.** Nunca se autoriza nada por encima del límite global; ritmo diario; corte de emergencia para los reintentos; comparaciones 3/día y 10/mes; límites por usuario y origen |
| `tests/budget.concurrency.test.ts` | **2.** 500 reservas simultáneas no superan el cupo, más un control negativo que muestra que, sin serialización, sí lo superarían; 200 solicitudes HTTP simultáneas; doble clic |
| `tests/routeHandler.test.ts` | **3.** Contador caído o colgado = cierre. **4.** Los reintentos consumen presupuesto. **7.** Cupo agotado = modo manual sin hora de reinicio. Interruptor y validación estricta |
| `tests/sku.test.ts` | **5.** Pro y Enterprise bloqueados antes de llamar; el adaptador Google envía solo la plantilla Essentials (con `fetch` falso) |
| `tests/session.test.ts` | **6.** Editar precio o parámetros no repite la consulta. **7.** Modo manual en el navegador |
| `tests/secrets.test.ts` | **8.** Se compila la app con una clave falsa en el entorno y no aparece en el paquete; las respuestas no la incluyen |
| `tests/engine.golden.test.ts` | Casos dorados G1–G10, escenarios A y B, y propiedades de las cotas |
| `tests/vehicles.test.ts` | «Mi vehículo»: crear, editar y eliminar; validación; predeterminado; recuperar tras recargar y con datos dañados; cargar los datos correctos al cambiar de vehículo; ajustar una cotización sin alterar el perfil; valores faltantes como costo parcial; el vehículo no llega a la cotización del cliente |
| `tests/regression.audit.test.ts` | Hallazgos de la auditoría de ChatGPT (commit `6f73aaa`): ruta de direcciones anteriores, respuesta tardía, retención por campo de km y minutos, validación de la respuesta del proveedor, copia del emisor. **Fallaban con la versión auditada** (14 de 15) |
| `tests/regression.audit2.test.ts` | Segunda auditoría de ChatGPT: reintento explícito tras error del servicio o del contador (consume una reserva nueva y conserva los km escritos); sin repetición con cupo o límites agotados; interruptor en caliente en el contador y en el Worker (mismo isolate), ruta de administración con token; deduplicación estable; confirmación del precio al cambiar el costo; errores de guardado visibles. **Las pruebas de los dos P1 fallaban con la versión auditada** (4 de 4) |
| `tests/regression.review3.test.ts` | Tercera revisión de ChatGPT: modo manual elegido durante una consulta pendiente (la respuesta tardía no lo reemplaza); reintento fallido conserva lo escrito; rotación de la clave de Google del mismo largo en el mismo isolate (con `fetch` falso); reconfirmar el precio ante cambios de parámetros o vehículo aunque el costo redondeado no cambie. **Fallaban con la versión revisada** (5 de 5; la sexta es un control) |
| `tests/cloud.mappers.test.ts` | Conversión app ↔ Supabase: la fila de `client_quotes` tiene exactamente los 16 campos de la lista blanca y ningún costo; ida y vuelta de trabajos; valores faltantes siguen siendo `null` |
| `tests/regression.audit5.test.ts` | Quinta auditoría: vehículos de otra cuenta que llegan tarde se descartan y una carga fallida deja la lista vacía; reglas de reinicio del borrador; la copia del historial se detiene si cambia la sesión y no se marca completa; el cliente fijado envía siempre el token de quien inició la copia; el guardado exige el precio confirmado. **Las 3 regresiones de código existente fallaban con `514ceda`** |
| `tests/regression.audit6.test.ts` | Sexta auditoría: cambio a B mientras se guardan los datos comerciales de A → no se llama a `create_job_with_quote` y nada viaja por el cliente compartido; la secuencia antigua (número → datos → crear) se niega con B activa; con sesión estable todo usa el token fijado; sesión ajena al empezar → nada se escribe; el modo sin cuenta sigue igual; filtros por dueño en el render. **7 de 7 fallaban con `974deb3`** |
| `tests/numbering.test.ts` | Numeración (A-47): el documento muestra siempre el número emitido; conversión de `issued_number`; al importar viajan el número emitido y el `local_id`; guardar en la nube usa el número que asigna la base |
| `tests/staging.worker.test.ts` | Staging protegido (401 sin credenciales), encabezados de seguridad, estado administrativo, falla inyectada del contador, marcas del simulador, archivos incrustados y la regresión del *stub* del Durable Object (hallazgo en Cloudflare real) |

### Pruebas del cotizador ampliado (20 y 21-11-2026)

Agregadas en la fase 0 (A-63), la fase 1 (A-66), la integración I-1 + I-1b (A-68) y D-I8 parcial (A-69). Se ejecutan con `npm test`, sin red.

| Archivo | Pruebas | Qué demuestra |
|---|---|---|
| `tests/contratos.cargo.test.ts` | 44 | Contrato Zod del inventario: fixtures compartidas con el servidor (C3), volumen calculado o declarado coherente, límites (200 líneas, cm enteros) y valores por defecto |
| `tests/contratos.resources.test.ts` | 22 | Recursos: una modalidad por ayudante (A-58), paradas solo A y B (T-3), equipamiento, tiempo de carga incompleto (§4.4) y límites provisionales (T-7) |
| `tests/contratos.snapshot.test.ts` | 30 | Cotizaciones v1 actuales intactas, snapshot v2, `toCloudPayload` con D-4 = (b) y ningún objeto perdido en silencio al copiar a la cuenta |
| `tests/inventario.test.ts` | 39 | Resumen y totales del inventario, comprobación de peso y volumen, estimación de capacidad (solo aviso), texto sugerido del servicio sin recursos internos y editor |
| `tests/recursos.test.ts` | 57 | Ayudantes y equipamiento sin doble contabilización, el costo del motor no cambia (§4.3), conversión de ayudantes históricos y validación con el esquema completo |
| `tests/modulos.estado.test.ts` | 17 | Interfaz plegable: estado de cada objeto, apertura al agregar, separación de datos de la carga (cliente) y recursos internos (transportista), filas inválidas |
| `tests/modulos.flag.test.ts` | 7 | La flag `VITE_FF_CARGA_RECURSOS` está apagada por defecto; el mismo marcado sirve a teléfono y PC |
| `tests/integracion.test.ts` | 63 | I-1 + I-1b: versión del snapshot según la flag y el repositorio, emisión v2, costo idéntico con editores vacíos o llenos (D-I1), «Servicio» e «Incluye» (D-I5), copia mixta v1/v2 con diferidas (C2), borrador aislado por dueño (C1), interfaz idéntica con la flag apagada y autoguardado con temporizadores controlados |
| `tests/limpieza-a75.test.ts` | 11 | A-75: reemplazar un valor (ejemplo, vehículo, restaurar, margen predefinido, campo o tramo) quita el error de texto solo de ese campo; margen «abc» + 15 % deja de bloquear; sin cambiar otros valores; el borrador no guarda el texto antiguo ([24 §8](24-robustez-numerica.md)) |
| `tests/sin-escritura-directa.test.ts` | 3 | #52 (A-74): `src/` no escribe directamente en `jobs` ni en `client_quotes` y solo guarda por la función RPC |
| `tests/validacion-a73.test.ts` | 22 | Validación A-73: texto no numérico (pausa, bloquea, no reemplaza, recuperación literal del borrador y alerta accesible), comparación opcional que no bloquea y mínimo de «Mi vehículo» sin perder los guardados ([24 §7](24-robustez-numerica.md)) |
| `tests/limites-numericos.test.ts` | 32 | Robustez numérica (A-71): límites por campo, inválido ≠ faltante ≠ cero, 1e308 en los 14 campos, todos los topes a la vez sin infinitos, barrera ante fallos del motor y compatibilidad con borradores y cotizaciones ([24](24-robustez-numerica.md)) |
| `tests/recorrido-manual.test.ts` | 40 | D-I8 parcial (A-69) y su P2 (A-70: valores negativos, extremos o de otro tipo descartan solo el recorrido y la calculadora no falla): recorrido manual de 1, 2 y 3 tramos recuperado con su aviso; invalidación al cambiar direcciones; nunca precio ni datos del proveedor (también con borradores manipulados); cotización emitida idéntica e historial intacto byte a byte |

**Suma:** 249 (18-11) + 96 de la fase 0 (44 + 22 + 30) + 120 de la fase 1 (39 + 57 + 17 + 7) + 63 de la integración + 40 de D-I8 + 32 de A-71 + 22 de A-73 + 3 de #52 + 11 de A-75 = **636**.

**Navegador local (Playwright; Pixel 7, iPhone 13 emulado, 1366 y 1440):**

| Script | Resultado (22-11-2026, Claude) |
|---|---|
| `scripts/e2e-modulos.mjs` (editores de la fase 1, con y sin flag) | **210/210** |
| `scripts/e2e-integracion.mjs` (I-1 + I-1b y D-I8 con la flag) | **278/278** (134 + 104 de D-I8 + 40 de A-70); repetida tras A-71, dos corridas |
| `scripts/e2e-numeros.mjs` (A-71, A-73 y A-75, con y sin flag) | **900/900** |
| `scripts/e2e-integracion.mjs --sin-flag` | **24/24** |
| `scripts/e2e-staging-anonimo.mjs` contra el servidor local | **54/59**: las 5 restantes son propias de staging (acceso privado 401 y `localhost` contado como dominio externo) |
| Borradores M3/M4 en PostgreSQL local desechable (`scripts/diseno/`) | **18/18** y 3 controles negativos; C3 **27/27**; medición de 16 KB **10/10** ([21 §11](21-diseno-datos-cotizador.md)) |
| Migración de #52 (A-74) en PostgreSQL local desechable (`scripts/diseno/ensayo-52/` y `probar-borradores.sh`), sin tocar Supabase | **65 OK** y **24/24** (22-11). Cubre la migración real, la idempotencia, la reversión sin pérdida de datos, las verificaciones de solo lectura (psql y editor, con paridad), M3/M4 con T6c y T6d y `verificar-restauracion.sql` antes y después con datos reales. Controles C1–C5 y «contador actual», más 5 mutaciones: detectados ([23 §11](23-revision-52-insert-directo.md)). `verificar-rls.mjs` y `verificar-numeracion.mjs` adaptados **sin ejecutar** (requieren staging) |

### Pruebas contra servicios reales (staging, 18-11-2026)

Detalle en [13 · Staging](13-staging.md) §5. Se ejecutan con credenciales desde archivos **fuera** del repositorio.

| Script | Resultado |
|---|---|
| `scripts/verificar-rls.mjs` (Supabase real, dos usuarios y anónimo) | **39/39** |
| `scripts/verificar-cloudflare.mjs principal` (Worker y Durable Object reales) | **8/8** (concurrencia estricta: 30 simultáneas → exactamente 20 autorizadas, 10 rechazadas, 0 fallas, Δ=20) |
| `scripts/verificar-cloudflare.mjs falla` (contador caído en el objeto real) | **2/2** |
| `scripts/verificar-numeracion.mjs` (Supabase real, dos dispositivos de A y la cuenta B) | **17/17**: concurrencia, importación repetida y simultánea, conflicto de número, documento histórico, cambios prohibidos, cuentas independientes |
| `scripts/e2e-staging.mjs` (navegador, móvil y escritorio) | **41/41** (incluye aislamiento entre sesiones y número emitido conservado al copiar) |

### Verificaciones del 18-11-2026 (sin servicios externos, salvo consultas de solo lectura a Supabase)

> **Cifras de esa fecha (históricas).** Hoy `npm test` da **528/528** y `tests/engine.validation.test.ts` tiene 51 pruebas sin `it.fails` (los defectos se corrigieron con A-50). Ver «Cifras vigentes» al final.

| Verificación | Resultado | Detalle |
|---|---|---|
| `npm test` (sin red) | **249/249**, typecheck y build sin errores | 154 previas + 46 de validación del motor + 25 de experiencia de usuario + 11 de A-50/A-51 + 13 de texto inválido en campos (auditoría de `ff8286e`). **Sin `it.fails` activos**: C-1 a C-4 corregidos (A-50) |
| Recalculo independiente de los casos dorados (`scripts/verificar-casos-dorados.mjs`, aritmética racional, no importa el motor) | **64/64** coinciden con [03](03-motor-de-costos.md) | G1–G10 y escenarios A, B y C. Hallazgos de validación de entradas y textos (sin errores de fórmula) en [15](15-validacion-motor.md) |
| `tests/engine.validation.test.ts` | 37 pruebas normales + **9 `it.fails`** que documentan defectos C-1 a C-3 | Pasan mientras el defecto exista; avisan cuando se corrija |
| Experiencia de usuario en navegador local (Playwright: Pixel 7, iPhone 13, 360, 320, 768, 820, 1024, 1280, 1366 y 1440 px) | 10 hallazgos, **10 corregidos**; sin desplazamiento horizontal ni controles táctiles < 44 px | [14](14-qa-ux.md) |
| Montos de la interfaz antes y después de las correcciones de experiencia de usuario y de A-50 (mismas entradas, PC y teléfono) | **Idénticos** ($25.106 / $1.224 / $26.330; sugerido $31.000) | Control del coordinador: ni el formato chileno ni A-50 alteran los valores |
| Cotización generada en navegador (PC y teléfono) | «Precio total» y leyenda en el documento y en WhatsApp; margen 12,5 % mostrado como «12,5» | A-50 y A-51 |
| Texto inválido en un campo (PC y teléfono) | «-5000» y «abc» → error en el campo (`aria-invalid`, `role=alert`); vacío → sin aviso («No lo sé»); corregido a «3500» → sin error | P2 de la auditoría de `ff8286e` |
| Ensayo local de respaldo y restauración (Postgres desechable, datos ficticios) | Ruta B **idéntica** al origen (`diff` = 0) | [17](17-supabase-seguridad-respaldo.md) §6. No tocó Supabase |
| Auditoría de Supabase staging (solo lectura) | RLS 6/6, 17 políticas, `anon` sin privilegios de tabla, invariantes correctos | [17](17-supabase-seguridad-respaldo.md) §2 |

**Staging redesplegado el 18-11-2026** con todos los cambios de esta ronda y verificado con `scripts/e2e-staging-anonimo.mjs`: **59/59** en PC 1440 y 1366 y en teléfono Pixel 7 e iPhone 13 (acceso privado, flujo anónimo completo, A-50, A-51, PDF, controles táctiles, 0 errores, 0 dominios externos).

**Con cuentas, sobre la versión del 18-11** (tras restablecer las contraseñas de los 2 usuarios de prueba, autorizado): `scripts/e2e-staging.mjs` **41/41** (PC y teléfono), `scripts/verificar-numeracion.mjs` **17/17**, `scripts/verificar-rls.mjs` **39/39** (40/40 tras la corrección que restaura el vehículo predeterminado). Los datos existentes no cambiaron (huellas md5 antes y después). Detalle en [13](13-staging.md) §5.4 bis.

**Antes del redespliegue (histórico):** no se habían repetido `scripts/e2e-staging.mjs` ni los scripts contra Cloudflare. El staging **no** se redesplegó con las correcciones de experiencia de usuario, porque esta sesión no tiene el token de Cloudflare: hasta redesplegar, el staging muestra la versión anterior.

**No probado todavía:**
- el candado en **producción** (sí probado en staging real, plan gratuito, con proveedor simulado; ver [13](13-staging.md));
- el inicio de sesión **con Google** (falta el cliente OAuth del propietario); se probó con usuarios de prueba por contraseña;
- el respaldo **real** de Supabase (ensayado solo localmente; requiere la contraseña de la base del propietario y un cliente PostgreSQL 17 o Docker);
- la confirmación de direcciones: qué ubicación interpretó Google y la comprobación con la línea recta quedan pendientes para el experimento de #19;
- el abuso real: el identificador anónimo del navegador se puede reemplazar, y lo contienen el límite por origen y el techo global;
- Google Routes real (no autorizado);
- la planilla de casos dorados hecha **por una persona** (§3F de [03](03-motor-de-costos.md)); el recálculo independiente por script ya coincide 64/64;
- la accesibilidad con un lector de pantalla real (sí se revisaron nombres accesibles, foco y anuncios con Playwright);
- impresión del PDF desde un teléfono físico.

El flujo completo se verificó en navegador (móvil y escritorio) contra el servidor local, sin solicitudes externas.

## Cifras vigentes (22-11-2026, D-I8 parcial y A-70)

| Verificación | Resultado | Quién |
|---|---|---|
| `npm test` | **636/636**, typecheck y builds sin errores | Claude (ejecutadas) |
| Casos dorados por recálculo independiente | **64/64** | Claude (ejecutadas) |
| E2E locales del cotizador ampliado | 210/210, 278/278, 900/900, 24/24 y 54/59 (tabla anterior) | Claude (ejecutadas) |
| Staging real (versión del 18-11) | 59/59 sin cuenta, 41/41 con cuentas, RLS 40/40, numeración 17/17, Cloudflare 8/8 y 2/2 | Claude (ejecutadas el 18-11) |
| Auditoría final de I-1 + I-1b | **0 P0 · 0 P1** ([22 §14](22-diseno-integracion-cotizador.md)) | ChatGPT, por inspección |
| D-I8 parcial ([22 §15](22-diseno-integracion-cotizador.md)) | Auditada (0 P0 · 0 P1 · 1 P2); P2 corregido (A-70, [22 §16](22-diseno-integracion-cotizador.md)): 7 defectos reintroducidos más, todos detectados. **Nueva auditoría solicitada** | Claude (ejecutadas) |

**No probado todavía (cotizador ampliado):** la flag encendida en staging (no autorizado ni desplegado), cuentas reales con el inventario, Safari en un iPhone real y un lector de pantalla real.

