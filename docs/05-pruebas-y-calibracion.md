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
- Compatibilidad y accesibilidad en móvil (teclado, tamaño de controles, contraste, flujo de ida y vuelta sin pérdida de datos). Contrastar la implementación con la **línea visual v4**: blanco, azul sobrio, grafito, inicio/calculadora en una pantalla desplazable, una ruta visible a la vez; la extensión de las demás pantallas fue aprobada el 16-11-2026 (A-21).
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
