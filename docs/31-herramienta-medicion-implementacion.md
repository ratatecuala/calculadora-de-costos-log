# 31 · Herramienta privada de medición: implementación (A-90, Frente A)

**Estado (26-11-2026, hora de Chile):** implementada **solo en local**, en la rama `claude/medicion-telefono`, con la flag `VITE_FF_MEDICION` **apagada por defecto**. No se desplegó nada (ni staging), no hay Supabase, APIs externas ni red. El diseño está en [29](29-herramienta-medicion.md); este documento registra lo que se construyó, cómo se probó y qué falta. Reglas: A-82, A-84, A-85, A-86, A-88, A-89, A-90.

## 1. Qué se implementó frente a docs/29

| docs/29 | Implementado | Diferencia o pendiente |
|---|---|---|
| §2 Módulo en `/medicion` dentro de la app | **Entrada de Vite separada** (`medicion/`, `vite.medicion.config.ts`, salida `dist-medicion/`) | D-1 de A-90: aislamiento total; el paquete comercial no cambia (§5) |
| §3 Vehículo propio | `VehiculoMedicion` (alias `veh-NNN`, tipo de #55, combustible, resolución TRIP y odómetro, estanque opcional, valores por defecto con procedencia) | D-4 |
| §3 Presupuesto sellado | `{datos, sha256}` con `datos` en la forma de `presupuesto-original.json` de #55 (`version: 2`) + `procedencia` por parámetro y `origen` | Corregir = sellar uno nuevo y anular el anterior |
| §3 Viaje | Lecturas TRIP/odómetro separadas, tramos por botones de estado, detalles, comprobantes y cobertura | Minutos derivados, nunca tipeados |
| §3 Foto | Opcional, `capture="environment"`; **no se conserva por defecto**; si se conserva, re-codificada en canvas (sin EXIF) | D-3; sin OCR |
| §3 Cargas e intervalos | Recargas parciales normales; intervalos lleno a lleno derivados y opcionales, con uso calibración/validación | km/L: pendiente de Codex |
| §4 Flujo 1–9 | Completo, teléfono y PC | — |
| §5 Comparación | Tres columnas (sellado, recalculado, referencia) por partida; sin «aprobado» | Combustible y CLP: **pendientes del contrato de Codex** (§3) |
| §6 Almacenamiento A+B | IndexedDB `medicion.v1` + respaldo JSON con fusión por `id`, `navigator.storage.persist()`, «última copia hace N días», «borrar todo» con confirmación propia | D-2 |
| §7 Exportación | `viajes.csv`, `cargas.csv`, `comparacion.csv` (BOM, `;`, coma decimal) y `paquete-medicion.json` | D-5 |
| §9 Pruebas | Vitest + Playwright (§4) | Teléfono real: bloqueado por D-1 |

**Experiencia:** barra inferior Viaje · Combustible · Historial · Vehículo; botones de 44–64 px; vehículo elegido solo si hay uno; fecha, hora y zona automáticas; diferencia de km automática; total de la carga automático (editable si la boleta difiere). Aviso visible «No manipules el teléfono mientras conduces»: todo lo que se toca durante el viaje es opcional y las horas de inicio, fin y carga se pueden escribir después (se marca `horaEditada` y los tiempos pasan a DECLARADO). No se piden SOAP, permisos, seguros, mantenciones ni gastos anuales; los gastos fijos están en un bloque plegado «Modalidad detallada (opcional)».

**Validaciones (D-6), todas no bloqueantes:** lectura final menor que la inicial (con «el TRIP se reinició» y km declarados), odómetro que retrocede (frente al inicial y al último conocido), sugerencia de TRIP en cero, litros ≤ 0 (la carga queda fuera de intervalos y del paquete), litros sobre la capacidad declarada, carga con fecha anterior (se reordena y avisa), odómetro de carga fuera de orden, «completa» sin línea de comprobante. Umbrales de velocidad media implícita, desvío de km, viaje abierto y recordatorio de copia: **vacíos por defecto y desactivados mientras estén vacíos**; no hay valores sugeridos (DATO FALTANTE).

**A-89 / D-7:** las recargas parciales quedan como gasto registrado; sin saldo inicial y final no se infieren litros por viaje. Excluido, desconocido y cero se distinguen: `null` = DATO FALTANTE (p. ej., espera sin botones de estado), 0 solo si se escribió o se midió. Los criterios estadísticos de #12 se muestran «por aprobar».

## 2. Arquitectura

- **Archivos:** `medicion/index.html` y `medicion/entrada.ts` (raíz de Vite); `src/medicion/**` (modelo, tiempo, cálculos, almacén, sello, presupuesto, exportación, repositorio, foto, contrato provisional, pantallas, CSS); `vite.medicion.config.ts`; scripts `dev:medicion` y `build:medicion`; `scripts/e2e-medicion.mjs`; `tests/medicion-*.test.ts`.
- **Flag:** `VITE_FF_MEDICION`. Sin `=1`, `build:medicion` termina con error y el servidor de desarrollo muestra «Herramienta de medición desactivada» sin abrir IndexedDB. `envPrefix: 'VITE_FF_MEDICION'`: ninguna otra variable `VITE_*` (p. ej., de staging) llega al paquete.
- **Una flag o una ruta oculta no son control de acceso.** Quien tenga el archivo compilado o la URL puede abrirlo; el acceso real depende de §7.
- **Seguridad del build:** CSP `default-src 'self'; connect-src 'self'; …`, `noindex`, `no-referrer`, sin mapas de código. El paquete no contiene `supabase`, `clientQuote` ni URLs externas (comprobado con `grep`).
- **Almacenamiento:** interfaz `Almacen` con `AlmacenIndexedDB` (navegador) y `AlmacenMemoria` (pruebas; sin dependencias nuevas). `repositorio.ts` aplica las reglas: sello inmutable (solo se acepta sellado → anulado con los mismos datos y huella), foto solo con consentimiento y re-codificación, fusión por `id` (gana el `editadoEl` más reciente; un sello alterado no se importa; «anulado» prevalece).
- **Motor:** el presupuesto llama a `buildCostItems`, `computeMeasures` y `displayAmount` de `src/engine` tal cual. El adaptador anula las partidas que dependen de un dato faltante (mismo criterio que `presupuesto()` de #55) y no calcula si faltan km o minutos de marcha (no se sella sin ellos). No hay fórmulas nuevas.
- **Versión del motor:** `vite.medicion.config.ts` calcula al compilar la misma huella que `versionMotor()` de #55 (etiqueta de `ENGINE_VERSION` + sha256 de los cuatro archivos del motor) y la inyecta en el sello.
- **Sin conexión:** service worker propio generado en el build (`sw.js`, sin dependencias): precarga `index.html` y los recursos con huella, responde desde la caché y renueva la caché con cada build. Solo existe en el build (en desarrollo no se registra).

## 3. Contrato provisional y qué se espera de Codex

`src/medicion/contrato-provisional.ts` está marcado **CONTRATO PROVISIONAL**. Define `ContratoCampo` con las firmas que la interfaz necesita de #55: `diferencia`, `cobertura`, `rendimiento`, `informe`, `resumenClases`. La implementación `presentacionProvisional` solo hace presentación: diferencias previsto − observado de **km y minutos** (error firmado de [27 §1](27-consolidacion-fase-0.md), PROPUESTO) y el conteo de cobertura. `rendimiento`, `informe` y `resumenClases` devuelven `{pendiente: 'comparación pendiente del contrato de Codex'}`: **no se reimplementaron**. Las partidas en CLP muestran sellado, recalculado (motor vigente con lo observado: no es validación) y la referencia disponible, sin calcular su diferencia.

Otras piezas provisionales que se reemplazarán por importación:
- `huella()` en `sello.ts` (`sha256(JSON.stringify(datos))`, igual que `archivo.js` de #55) → `huellaCanonica` de Codex;
- la tabla `CLASE_A_CAMPO` en `presupuesto.ts` → la tabla única en `procedencia.ts` o en el contrato de Codex (docs/29 §3);
- la forma de `paquete-medicion.json` (`{formato: 1, viajes: [{id, ficha, original}], sha256}`, alineada con `src/shared/campo/tipos.ts` de `f153a36`) → el tipo `Paquete` y la acción `importar` definitivos.

**Comprobación cruzada (ejecutada, fuera del repositorio):** con los archivos de `scripts/campo/` de `origin/codex/fase-0b-instrumento-campo` (`f153a36`) copiados a una carpeta temporal, tres fichas exportadas por la herramienta (con presupuesto, sin presupuesto y simulación) pasan `validarFicha` y `compararFicha`; la huella del original coincide con `crypto` de Node. Observaciones para Codex: (a) `informe` compara CLP solo si `plan.baseClp` coincide con `observacion.baseClp`; la herramienta no captura aún la base (neto/con IVA), así que esas comparaciones quedan «sin comparación» hasta decidirlo; (b) su `diferencia` no redondea restos de coma flotante (`-2.3000000000000007`); la presentación provisional redondea a 9 decimales.

## 4. Pruebas (ejecutadas por Claude, 26-11-2026)

- **Vitest, focalizadas:** `tests/medicion-calculos.test.ts` (20), `tests/medicion-datos.test.ts` (29), `tests/medicion-aislamiento.test.ts` (94, la mayoría una por archivo comercial). Cubren: minutos desde tramos (cambio de día y de desfase −03:00 → −04:00, tramo inválido), km con resolución, reinicio del TRIP, TRIP incoherente → odómetro, odómetro que retrocede, recargas parciales y lleno a lleno, reordenamiento, litros ≤ 0, capacidad, umbrales vacíos que no avisan (control negativo) y fijados que sí (control positivo), motor = llamada directa, faltante ≠ 0, clase del precio según su fuente, valor simulado excluido en uso personal, cotización v3 ficticia (valida contra `snapshotV3Schema` y reproduce su costo), v1/v2 con faltantes, versiones desconocidas, sello (huella Node = `crypto.subtle`, datos congelados, alterado rechazado, anulado irreversible), foto no conservada por defecto y conservada solo re-codificada, CSV (BOM, `;`, coma decimal, escapado, protección de fórmulas), paquete con las claves exactas de la plantilla de #55, respaldo (fusión idempotente, edición más reciente, sello alterado no importado, sin fotos por defecto, archivos ajenos rechazados), comparación (sin presupuesto, error firmado, cronología sin verificar, peajes solo con cobertura completa, nunca «aprobado») y aislamiento (la app comercial no importa la herramienta, la herramienta no importa la app, la nube, Supabase ni scripts de Codex; sin `fetch`, `alert` ni `confirm`).
- **Regresión completa:** `npm test` → **45 archivos, 864 pruebas en verde** (721 previas + 143 nuevas). `npx tsc --noEmit -p .` sin errores.
- **Build comercial:** `npm run build` → `dist/assets/index-*.js` 587,66 kB. **Idéntico byte a byte** (sha256 de todos los archivos) con y sin `src/medicion` en el disco: la herramienta no entra en el paquete comercial.
- **Build de medición:** sin flag, `npm run build:medicion` falla con «Herramienta de medición DESACTIVADA» (código 1). Con `VITE_FF_MEDICION=1`: `index.html` 0,8 kB, JS 292 kB (88 kB gzip; incluye React y zod, que trae `procedencia.ts`), CSS 6,8 kB, `sw.js` 1 kB.
- **Playwright** (`scripts/e2e-medicion.mjs`, Chromium; Pixel 7 emulado y PC 1366×768, zona America/Santiago, reloj controlado), contra `vite preview` del build en `localhost:5195` y el servidor de desarrollo sin flag en `localhost:5196`: **64 comprobaciones, 0 fallas.** Flujo 1–9 completo (cotización ficticia en el teléfono, presupuesto nuevo en PC), foto no conservada por defecto, foto conservada **sin EXIF ni GPS** (JPEG con APP1 «Exif» de prueba), minutos derivados (35/5/10), km 20,3, comparación (previo al viaje, subestimación, combustible pendiente, «por aprobar en #12»), recargas parcial y llena con total automático, filtros, cuatro descargas verificadas, respaldo e importación «0 nuevos» (sin duplicados), persistencia tras recargar, **modo sin conexión** (`context.setOffline(true)`, recarga y registro de una carga), «borrar todo» con confirmación propia (cancelar y confirmar), sin desplazamiento horizontal, 0 errores de consola, 0 diálogos nativos, 0 peticiones fuera de localhost, y sin flag «desactivada» sin crear la base local.

**No se pudo probar:** el teléfono real del propietario (cámara, permiso de almacenamiento persistente, expulsión de datos, «Compartir» un archivo), Safari/iOS y Firefox, ni la instalación en la pantalla de inicio (no hay manifiesto). Todo depende de D-1 (§7).

## 5. Limitaciones

- Los datos viven solo en el navegador que los creó: borrar sus datos o perder el teléfono los pierde. Mitigación: respaldo JSON y «última copia hace N días». La persistencia la decide el navegador (POR VALIDAR en el teléfono).
- El modo sin conexión exige abrir una vez la versión compilada con conexión, desde un origen seguro (`https://` o `localhost`). En desarrollo no hay service worker. No funciona desde `file://`.
- Los códigos `viaje-NNN` son por dispositivo: si se registran viajes en dos equipos sin fusionar antes, puede haber códigos repetidos con distinto `id` (la fusión no los pierde, pero la CLI los vería repetidos).
- La comparación de combustible, desgaste y fijos y las diferencias en CLP esperan el contrato de Codex; la base de IVA (`baseClp`) no se captura todavía.
- Sin OCR, GPS ni sincronización entre equipos (fuera del alcance).

## 6. Cómo probarla en local (sin desplegar)

1. `VITE_FF_MEDICION=1 npm run build:medicion`
2. `npx vite preview --config vite.medicion.config.ts --port 5195 --strictPort`
3. Abrir `http://localhost:5195` en el computador (o `node scripts/e2e-medicion.mjs http://localhost:5195`).

## 7. Propuesta de acceso seguro desde el teléfono (D-1) — PROPUESTO, no ejecutado

Requisitos: sin terminal en el teléfono, sin pagos, aislado de la app comercial y con un control de acceso real (no una URL oculta).

| Alternativa | Cómo | Ventajas | Límites y riesgos | Costo |
|---|---|---|---|---|
| **A. Worker de Cloudflare propio y aislado, con usuario y contraseña** (recomendada) | Un Worker **nuevo** en la cuenta Cloudflare del propietario que sirve solo `dist-medicion/` y exige usuario y contraseña con el **mismo mecanismo** que ya protege el staging (`STAGING_BASIC_AUTH`, [13](13-staging.md)), con secreto propio. `noindex`, `no-referrer`. | Reutiliza un patrón ya implementado y revisado en el repo; HTTPS (origen seguro: service worker y `crypto.subtle` funcionan); el teléfono solo abre una URL y escribe la contraseña una vez; los datos siguen solo en el teléfono | Es un despliegue nuevo y un secreto nuevo; contraseña compartida (no por persona); hay que entregarla como archivo privado | Plan gratuito de Workers: condiciones y cuotas **POR VALIDAR** en la cuenta del propietario |
| B. Igual que A, protegido con Cloudflare Access | Mismo Worker, con una aplicación de Access que pide un código enviado al correo del propietario | Acceso por persona, sin contraseña compartida | Requiere activar Zero Trust en la cuenta; si el plan gratuito pide medio de pago u otras condiciones: **POR VALIDAR** | **POR VALIDAR** |
| C. Archivo único abierto desde el teléfono | Un `.html` con todo incrustado, copiado al teléfono | Sin servidor ni cuenta | En `file://` no hay service worker; IndexedDB, `crypto.subtle` (el sello) y la cámara son inestables o no disponibles según el navegador móvil (**POR VALIDAR**); abrir archivos locales en Android/iOS no es directo; cada versión hay que copiarla a mano | $0 |

No se recomienda publicar la herramienta dentro del staging comercial existente: mezclaría los paquetes que A-90 pide aislar.

**Recomendación:** A. Es la más sencilla de usar desde el teléfono y reutiliza un control de acceso que el proyecto ya tiene. B queda como mejora si el propietario prefiere acceso por persona y se confirma que no exige pago.

**Autorización exacta que se necesitaría (texto propuesto):**

> **SOLICITUD DE OK**
> Acción concreta: crear en mi cuenta de Cloudflare un Worker **nuevo y separado** (nombre propuesto `medicion-privada`) que sirva solo el build de `dist-medicion/` (rama `claude/medicion-telefono`), con `VITE_FF_MEDICION=1` **solo en ese build**, protegido con usuario y contraseña propios (mecanismo de `STAGING_BASIC_AUTH`, secreto nuevo entregado como archivo privado), `noindex`, en un subdominio `workers.dev` sin publicar la URL en el repositorio.
> Archivos / servicios afectados: un archivo de Worker y una configuración `wrangler` nuevos para la herramienta (sin tocar `wrangler.jsonc` ni el Worker de staging); un secreto en Cloudflare. Sin Supabase, sin APIs externas, sin migraciones.
> Incluye / excluye: incluye el despliegue de ese Worker y su secreto. Excluye producción, dominio propio, cambios al staging existente, Supabase, sincronización, merge del PR y cualquier plan de pago.
> Costo máximo y posibilidad de cobro: $0; plan gratuito de Workers (condiciones POR VALIDAR antes de desplegar; si exige pago, se detiene).
> Riesgo y cómo revertir: exposición de la herramienta a quien tenga la contraseña (los datos siguen solo en el teléfono); se revierte borrando el Worker y su secreto.
> Cómo probar: abrir la URL en el teléfono, ingresar la contraseña, registrar un viaje ficticio, activar el modo avión, recargar y comprobar que sigue funcionando; exportar el CSV y abrirlo en Excel.

## 8. Bloqueos y siguiente paso

- **D-1:** la prueba en el teléfono real requiere la autorización de §7.
- **Contrato de Codex (#55):** integrar `src/shared/campo/` cuando esté publicado y auditado; reemplazar `contrato-provisional.ts`, `huella()` y la tabla de clases por importaciones.
- **#12:** criterios estadísticos por aprobar; base de IVA (`baseClp`) por decidir para la comparación en CLP.
- **Revisión independiente** (Codex o GPT) del módulo antes de cualquier publicación.
