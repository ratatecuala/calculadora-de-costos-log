# 05 · Pruebas, calibración y validación del lanzamiento gratuito

**Estado:** estrategia de control propuesta. Las metas numéricas concretas se aprobarán en #12. No hay código ni viajes de validación ejecutados todavía.

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

**No probado todavía:**
- el Durable Object en Cloudflare (no hay cuenta); el candado **no está probado en producción**;
- la confirmación de direcciones: qué ubicación interpretó Google y la comprobación con la línea recta quedan pendientes para el experimento de #19;
- el abuso real: el identificador anónimo del navegador se puede reemplazar, y lo contienen el límite por origen y el techo global;
- Google Routes real (no autorizado);
- la verificación independiente de los casos dorados (#24);
- la accesibilidad con lector de pantalla.

El flujo completo se verificó en navegador (móvil y escritorio) contra el servidor local, sin solicitudes externas.
