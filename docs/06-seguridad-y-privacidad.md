# 06 · Protocolo de seguridad y privacidad

Estado: los **principios están aprobados**. Los detalles legales están pendientes de #15 (términos de Google) y #17 (Ley 21.719).

## 1. Reglas de oro

1. **Ninguna clave, token ni contraseña en el repositorio.** El repositorio es **público**.
2. **Ningún cargo variable de APIs** sin autorización expresa del propietario (#9).
3. **Las cuentas de servicios son del propietario.** Claude recibe solo accesos mínimos y revocables (#8).
4. **No se procesan más datos personales de los necesarios.** Lo que puede quedarse en el navegador, se queda ahí.
5. **Nada se publica** en una URL pública sin la autorización del propietario (#14).

## 2. Claves de API y cuentas

| Control | Detalle | Etapa |
|---|---|---|
| Claves solo en el servidor | Secretos del Worker de Cloudflare. Nunca en el código ni en el navegador. | E2 |
| Restricción de claves | Cada clave limitada a las APIs que usa | E2 |
| Archivos locales ignorados | `.env`, `.dev.vars` y similares en `.gitignore` | E1 |
| Escaneo de secretos | Activar *secret scanning* y *push protection* de GitHub. El propietario lo hace en Settings → Code security. | E1 |
| Dependencias | Dependabot activado | E1 |
| Rotación | Procedimiento documentado. Si una clave se expone, se revoca de inmediato. | E2 |

## 3. Protección contra cobros y abuso

| Control | Detalle |
|---|---|
| Cuotas diarias en Google Cloud | ≈ tramo gratuito ÷ 30, menos 10 %. Es el **tope duro**. |
| Límite diario propio | En el Worker, por debajo de la cuota de Google, para degradar con aviso antes de llegar al límite |
| Turnstile | Verificación anti-bots al iniciar un cálculo _(gratuidad por verificar, #18)_ |
| Límite por IP | Sin guardar la IP. Solo en memoria y por poco tiempo. |
| Alertas de presupuesto | 1 USD, como aviso adicional (no detienen el cobro) |
| Modo degradado | Si la cuota se agota o la API falla, la calculadora funciona en modo manual con aviso |
| Interruptor de apagado | Una variable de configuración desactiva Google por completo |

## 4. Inventario de datos personales

| Dato | ¿Sale del navegador? | Destino | ¿Lo guardamos? | Control |
|---|---|---|---|---|
| Direcciones y comuna | Sí, solo para calcular la ruta | Worker (de paso) y Google | **No.** Los logs no registran el contenido de las solicitudes. | Aviso de privacidad que nombra a Google y Cloudflare |
| Coordenadas y trazado de la ruta | No (vuelven al navegador) | — | No | Se descartan |
| Vehículo, sueldos, costos y precios | **No** | — | Solo en el navegador, si el usuario lo decide | Botón "Borrar mis datos" |
| Direcciones recientes | No | — | En el navegador, **solo si el usuario lo activa** | Desactivado por defecto |
| IP y navegador | Sí, de forma inevitable | Cloudflare y Turnstile | No en nuestros logs. Retención mínima en la plataforma _(por verificar, #18)_ | — |
| Consulta de precio de combustible | Sí | Worker | No | Solo envía la región |
| Métricas de uso | Sí | Worker | Solo contadores agregados | Sin IP ni direcciones |
| Archivo exportado | Lo controla el usuario | — | — | Aviso: "contiene direcciones" |
| Datos de calibración | Sí | Almacenamiento **privado** | Sí, a nivel de comuna | Consentimiento escrito; **nunca en este repositorio** |

**Minimización:** la interfaz indicará que **no se necesita el número exacto de la dirección**. Una esquina o intersección basta para estimar costos.

**Pendiente legal (#17):**
- papel de Google y Cloudflare (encargados o terceros);
- transferencia internacional de datos;
- contenido del aviso de privacidad;
- consentimiento de los participantes de la calibración.

## 5. Datos de Google (pendiente de #15)

- No se cachean ni se exportan km, duración ni trazados de Google.
- Los place ID y las direcciones escritas por el usuario pueden guardarse en su navegador.
- Las coordenadas se guardan como máximo 30 días.
- Los resultados de Google no se muestran en mapas de otros proveedores.

## 6. Registros técnicos

- Se registran: tipo de error, código, latencia e identificador anónimo de solicitud.
- **No se registran:** direcciones, coordenadas, IP, montos ingresados por el usuario.

## 7. Respaldo

- **Código y documentación:** GitHub es la fuente de verdad.
- **Perfiles del usuario:** viven en su navegador; se ofrece exportar e importar un archivo y se avisa de cambios sin respaldar.
- **Riesgo conocido:** Safari puede borrar el almacenamiento de sitios que no se visitan en 7 días (por verificar en un iPhone real). Mitigaciones: pedir almacenamiento persistente, recordar exportar y sugerir instalar la app en la pantalla de inicio.

## 8. Controles por etapa

| Indispensable antes de… | Controles |
|---|---|
| E1 (motor manual) | `.gitignore` de secretos, escaneo de secretos, Dependabot, CI obligatoria |
| E2 (APIs) | Claves en el servidor, cuotas verificadas, Turnstile, límite por IP, logs sin datos personales, modo degradado |
| E5 (publicación) | Revisión de seguridad sin hallazgos críticos, aviso de privacidad aprobado, runbook de incidentes |
