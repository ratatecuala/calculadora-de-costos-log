# 31 · Herramienta privada de medición: implementación (A-90, Frente A)

**Estado (26-11-2026, hora de Chile):** implementada **solo en local**, en la rama `claude/medicion-telefono`, con la flag `VITE_FF_MEDICION` **apagada por defecto**. No se desplegó nada (ni staging), no hay Supabase, APIs externas ni red. El diseño está en [29](29-herramienta-medicion.md); este documento registra lo que se construyó, cómo se probó y qué falta. Reglas: A-82, A-84, A-85, A-86, A-88, A-89, A-90.

**Segunda iteración (26-11-2026): correcciones P1 de la revisión de GPT sobre el PR #57.** La herramienta ya **no** tiene contrato provisional: integra el contrato **publicado y auditado** de Codex (#55, `src/shared/campo/`, commit `89c9139`) mediante un **merge** de `origin/codex/fase-0b-instrumento-campo` en esta rama, sin editar ningún archivo de Codex. Por eso **el PR #57 depende de #55**: mientras #55 no se integre, el diff de #57 incluye también los commits de Codex; cuando #55 se integre en la rama base, ese diff desaparece y queda solo el de la herramienta. Resumen de cada P1 en §3.

## 1. Qué se implementó frente a docs/29

| docs/29 | Implementado | Diferencia o pendiente |
|---|---|---|
| §2 Módulo en `/medicion` dentro de la app | **Entrada de Vite separada** (`medicion/`, `vite.medicion.config.ts`, salida `dist-medicion/`) | D-1 de A-90: aislamiento total; el paquete comercial no cambia (§5) |
| §3 Vehículo propio | `VehiculoMedicion` (alias `veh-NNN`, tipo de #55, combustible, resolución TRIP y odómetro, estanque opcional, valores por defecto con procedencia) | D-4 |
| §3 Presupuesto sellado | `{datos, sha256}` = el `Original` de `envolverOriginal(crearPresupuesto(…, VERSION_MOTOR))` del contrato (`version: 3`, huella canónica). La procedencia por parámetro y el origen van en `meta`, **fuera** de lo sellado | Corregir = sellar uno nuevo y anular el anterior. Los sellos del formato anterior se conservan tal cual (§3) |
| §3 Viaje | Lecturas TRIP/odómetro separadas, tramos por botones de estado, detalles, comprobantes y cobertura | Minutos derivados, nunca tipeados |
| §3 Foto | Opcional, `capture="environment"`; **no se conserva por defecto**; si se conserva, re-codificada en canvas (sin EXIF) | D-3; sin OCR |
| §3 Cargas e intervalos | Recargas parciales normales; intervalos lleno a lleno derivados y opcionales, con uso calibración/validación, aire, registro completo e incertidumbres declaradas | km/L con `medirIntervalo` del contrato |
| §4 Flujo 1–9 | Completo, teléfono y PC | — |
| §5 Comparación | Informe de `compararFicha` (con `revisarReferencias`): recorrido, partidas en CLP (sellado, recalculado, referencia), conciliación independiente y combustible; sin «aprobado» | Criterios estadísticos de #12: por aprobar |
| §6 Almacenamiento A+B | IndexedDB `medicion.v1` + respaldo JSON **todo o nada** (§3), `navigator.storage.persist()`, «última copia hace N días», «borrar todo» con confirmación propia | D-2 |
| §7 Exportación | `viajes.csv`, `cargas.csv`, `comparacion.csv` (BOM, `;`, coma decimal) y `paquete-medicion.json` armado con `crearPaquete` (pasa `verificarPaquete` y la importación de la CLI) | D-5 |
| §9 Pruebas | Vitest + Playwright (§4) | Teléfono real: bloqueado por D-1 |

**Experiencia:** barra inferior Viaje · Combustible · Historial · Vehículo; botones de 44–64 px; vehículo elegido solo si hay uno; fecha, hora y zona automáticas; diferencia de km automática; total de la carga automático (editable si la boleta difiere). Aviso visible «No manipules el teléfono mientras conduces»: todo lo que se toca durante el viaje es opcional y las horas de inicio, fin y carga se pueden escribir después (se marca `horaEditada` y los tiempos pasan a DECLARADO). No se piden SOAP, permisos, seguros, mantenciones ni gastos anuales. **Modalidad (A-89):** el presupuesto nuevo es **simplificada** (no suma gastos fijos; lo decide `alcancePartida` del contrato); la **detallada** muestra y suma los gastos fijos por hora; una cotización entra como detallada porque el cotizador suma los fijos. Un bloque plegado «Base de los montos y precisión» pide, sin suponer nada, la base tributaria (neto o con IVA), cómo se obtuvo el rendimiento (`ajusteHasta`: sin ajuste o corte fecha/odómetro), la reserva del intervalo (`muestraPrevista`) y la incertidumbre de los km.

**Validaciones (D-6), todas no bloqueantes:** lectura final menor que la inicial (con «el TRIP se reinició» y km declarados), odómetro que retrocede (frente al inicial y al último conocido), sugerencia de TRIP en cero, litros ≤ 0 (la carga queda fuera de intervalos y del paquete), litros sobre la capacidad declarada, carga con fecha anterior (se reordena y avisa), odómetro de carga fuera de orden, «completa» sin línea de comprobante. Umbrales de velocidad media implícita, desvío de km, viaje abierto y recordatorio de copia: **vacíos por defecto y desactivados mientras estén vacíos**; no hay valores sugeridos (DATO FALTANTE).

**A-89 / D-7:** las recargas parciales quedan como gasto registrado; sin saldo inicial y final no se infieren litros por viaje. Excluido, desconocido y cero se distinguen: `null` = DATO FALTANTE, 0 solo si se escribió o se midió; «excluida» (fijos en simplificada) la informa el contrato. **Sin botones de estado, el tiempo total del viaje no se convierte en marcha:** marcha, espera, carga y descarga quedan DATO FALTANTE y el total se muestra aparte como «sin desglosar», salvo que el usuario declare «todo fue marcha» (DECLARADO, §3.1). Los criterios estadísticos de #12 se muestran «por aprobar».

## 2. Arquitectura

- **Archivos:** `medicion/index.html` y `medicion/entrada.ts` (raíz de Vite); `src/medicion/**` (modelo, tiempo, cálculos, almacén, **campo** —integración con el contrato—, sello, presupuesto, exportación, repositorio, foto, pantallas, CSS); `vite.medicion.config.ts`; scripts `dev:medicion` y `build:medicion`; `scripts/e2e-medicion.mjs`; `tests/medicion-*.test.ts`. La herramienta importa el contrato **solo** por su entrada pública `src/shared/campo/index.js` (comprobado por prueba).
- **Flag:** `VITE_FF_MEDICION`. Sin `=1`, `build:medicion` termina con error y el servidor de desarrollo muestra «Herramienta de medición desactivada» sin abrir IndexedDB. `envPrefix: 'VITE_FF_MEDICION'`: ninguna otra variable `VITE_*` (p. ej., de staging) llega al paquete.
- **Una flag o una ruta oculta no son control de acceso.** Quien tenga el archivo compilado o la URL puede abrirlo; el acceso real depende de §7.
- **Seguridad del build:** CSP `default-src 'self'; connect-src 'self'; …`, `noindex`, `no-referrer`, sin mapas de código. El paquete no contiene `supabase`, `clientQuote` ni URLs externas (comprobado con `grep`).
- **Almacenamiento:** interfaz `Almacen` con `AlmacenIndexedDB` (navegador) y `AlmacenMemoria` (pruebas; sin dependencias nuevas), con `guardarLote` = **una transacción** (todo o nada). `repositorio.ts` aplica las reglas: sello inmutable (solo se acepta sellado → anulado con los mismos datos, huella y metadata), foto solo con consentimiento y re-codificación, respaldo todo o nada (§3).
- **Motor:** la herramienta **no** llama a `src/engine` ni tiene adaptador propio: el presupuesto y su vista previa salen de `crearPresupuesto` del contrato, y el recalculado con lo observado, de `compararFicha`. Una prueba verifica que `src/medicion` no importa `engine/inputs|measures|rounding` ni usa `crypto.subtle`.
- **Versión del motor:** `VERSION_MOTOR` del contrato. La prueba de navegador importa el paquete con la CLI de Codex y obtiene «motores idénticos».
- **Sin conexión:** service worker propio generado en el build (`sw.js`, sin dependencias): precarga `index.html` y los recursos con huella, responde desde la caché y renueva la caché con cada build. Solo existe en el build (en desarrollo no se registra).

## 3. Integración con el contrato de #55 y correcciones P1 (revisión de GPT)

**Merge, no copia.** `git merge --no-ff origin/codex/fase-0b-instrumento-campo` (sin conflictos). No se editó nada en `src/shared/campo/`, `scripts/campo/`, `scripts/simulacro/` ni `.github/workflows/`. Se eliminaron `contrato-provisional.ts`, la huella propia de `sello.ts`, la tabla `CLASE_A_CAMPO`, el adaptador del motor de `presupuesto.ts` y la huella del motor que calculaba `vite.medicion.config.ts`. `src/medicion/campo.ts` solo traduce registros locales a la `Ficha` del contrato y llama a sus funciones.

**P1 · contrato final.**
- Sello: `envolverOriginal(crearPresupuesto(ficha, código, fechaUTC, VERSION_MOTOR))`; la huella cubre el original v3 completo. El paquete se arma con `crearPaquete` (huella del sobre `{formato, viajes}`, no solo de los viajes) y pasa `verificarPaquete`.
- El original contiene **solo** las claves del contrato. Procedencia por parámetro y origen de la cotización van en `meta`, fuera de lo sellado. Una prueba muestra que un original con una clave extra no verifica.
- El plan expresa `modalidad`; en simplificada el contrato excluye los fijos (prueba: con la misma tarifa de fijos, la detallada suma exactamente la partida de fijos y la simplificada no). Se capturan `baseClp`, `ajusteHasta`, `muestraPrevista`, `resolucionKm` e `incertidumbreKm` (plan y observación) y, en el intervalo, zona, resoluciones e incertidumbres de litros y km; nada se supone.
- **Sellos históricos:** los presupuestos del formato anterior (registro `formato: 1`, `datos.version: 2` con procedencia dentro) **no se migran ni se vuelven a sellar**: se verifican con su huella original y se muestran «formato anterior, no comparable» (sin original en el paquete, sin comparación). El respaldo los importa conservando el JSON exacto.

**P1 · respaldo todo o nada.** `leerRespaldo` valida con esquemas estrictos (zod) cada registro: claves exactas, tipos, rangos y formatos. `fusionarRespaldo`, **antes de escribir**: ids únicos; cada sello verificado con el contrato (`crearPaquete` de un viaje) o, si es del formato anterior, con su huella original; integridad referencial sobre el estado resultante (viaje → vehículo, viaje → presupuesto con mismo vehículo, código y uso, presupuesto → vehículo con el mismo alias sellado, carga → vehículo, cierre de intervalo solo en carga llena, foto → viaje); conflictos. Un sello distinto con el mismo `id` es un error. Otro registro distinto con el mismo `id` es un **conflicto**: se lista y no se escribe **nada** hasta que el usuario elige «tomar la versión más reciente» o cancela. Ante cualquier error se muestra la lista y no se escribe nada; si todo está bien, una sola transacción de IndexedDB. Se mantiene un único cambio admitido en un sello: pasar a «anulado».

**Colisiones `viaje-NNN` / `veh-NNN` entre dispositivos:** no se toca ningún sello. La interfaz y los CSV usan un **alias de presentación local** (`viaje-001 · a1b2c3`); el paquete excluye los viajes con código o vehículo repetido e informa el motivo (la CLI los confundiría).

**P1 · clasificación honesta.** La independencia de una referencia es la de `conciliacionIndependiente` del contrato (`comparable`), nunca «referencia no nula» (prueba: un comprobante completo sin partida prevista queda «no comparable»). Medido y declarado se distinguen por lectura; TRIP reiniciado y horas escritas después son DECLARADO. Los litros solo entran a un intervalo con boleta (COMPROBADO) o surtidor (MEDIDO); «lo recuerdo» deja los litros faltantes. Sin base tributaria no hay diferencia en pesos (motivo del contrato). Tiempos sin desglosar: §1.

### 3.1 Cierre de la integración (A-91, 26-11-2026)

Estado de los diez puntos que pidió el propietario:

| # | Requisito | Estado |
|---|---|---|
| 1 | Sin contrato provisional ni adaptadores duplicados | Hecho (round anterior); `tests/medicion-aislamiento.test.ts` lo vigila. |
| 2 | Modalidad simplificada (por defecto) y detallada, sin perder datos al cambiar | Hecho. Los fijos se ocultan en simplificada y se conservan en el formulario. |
| 3 | Comparación de combustible, costos, incertidumbre y cobertura | Hecho. En la ficha: rendimiento del intervalo, litros asignados, rango de incertidumbre (litros y CLP) y entradas que faltan, gastos pagados con cobertura por partida, datos faltantes y error del total frente al objetivo exploratorio. |
| 4 | Base CLP neta o con IVA sin inventar la tasa | Hecho. El usuario elige en el plan y en el viaje; sin base no hay diferencia en pesos. |
| 5 | Calibración y validación separadas | Hecho, lo decide `vincularIntervalo` del contrato. La pantalla de combustible lo explica. Pruebas: validación posterior al ajuste es utilizable (12 km/L; 1,75 L asignados); «calibración» no valida; un intervalo no posterior al ajuste no valida. |
| 6 | Litros asignados nunca presentados como consumo medido | Hecho. En pantalla: «ESTIMADO (asignación proporcional), no es consumo medido del viaje». El km/L se rotula «medido sobre el intervalo». En `comparacion.csv`, filas `rendimientoIntervalo`, `litrosAsignados` («ESTIMADO (asignado, no medido)») y `combustibleRango`. |
| 7 | Formatos, huellas y exportaciones compatibles con la CLI | Hecho. El e2e importa el paquete con la CLI y `probar-interoperabilidad.mjs` pasa. |
| 8 | Respaldo validado completo, sin importaciones parciales, sellos intactos | Hecho (round anterior). Se mantienen las pruebas negativas; la CI de Codex añade `scripts/ci-medicion/atomicidad.mjs`. |
| 9 | «No aplica» y «todo fue marcha» | Hecho. Ver la nota de este punto después de la tabla. |
| 10 | Uso personal sencillo y sin contabilidad | Hecho. Ver la nota de este punto después de la tabla. |

**Punto 9.**
- **«No aplica»:**
  - En el plan hay una casilla por partida directa (TAG, ayudantes, otros). La partida sale del plan y sus campos se conservan en el formulario.
  - En el viaje hay otra casilla por partida. Al marcarla se borra la cobertura. Si la partida tiene líneas pagadas, la casilla queda bloqueada.
  - Si se contradice con una línea pagada, el contrato da un error y no hay informe.
- **«Todo fue marcha»:**
  - Hay un botón en los viajes cerrados sin estados.
  - Marcha = total, y espera, carga y descarga = 0, todo **DECLARADO**, nunca MEDIDO.
  - Con estados la declaración se ignora.
  - Nuevas columnas en `viajes.csv`: `solo_marcha_declarada` y `no_aplica`.

**Punto 10.**
- En uso personal la modalidad es siempre la simplificada.
- No se piden ni entran al plan remuneración, margen, recargos ni gastos fijos. Lo que ya estaba escrito se conserva por si se pasa a simulación.
- Una cotización comercial se reproduce como simulación.

**Objetivos de #12 (exploratorios).** En el historial, «Calcular con los viajes cerrados» (`src/medicion/objetivos.ts`) muestra:
- revisados y denominador (solo los viajes con total comparable);
- incompletos con su motivo;
- MAPE, porcentaje dentro de ±10 %, subestimaciones mayores al 10 % y sesgo;
- error en CLP cuando la referencia es 0.

Metas orientativas: MAPE ≤ 5 %, ≥ 90 % dentro de ±10 % y 0 subestimaciones mayores al 10 %. Siempre se rotulan «objetivos exploratorios: orientativos, no son una aprobación ni una certificación». Sin denominador no se muestra un 0 %.

**e2e contra el Worker privado.** Con `MEDICION_AUTH="usuario:contraseña"`, `scripts/e2e-medicion.mjs`:
- usa `httpCredentials` en todos los contextos;
- admite el origen de las URL dadas en el control «0 peticiones fuera del origen».

El valor nunca se imprime. Sin la variable, el e2e sigue aceptando solo `localhost` o `127.0.0.1`.

## 4. Pruebas (ejecutadas por Claude, 26-11-2026, sobre el HEAD con el merge de #55)

**Cierre A-91 (sobre `e79849d` más los cambios de este round):**
- `npx tsc --noEmit -p .`: sin errores.
- `npm test`: **46 archivos, 934 pruebas en verde.** `tests/medicion-datos.test.ts` tiene ahora 54 pruebas. Las 10 nuevas cubren:
  - «no aplica» en el plan y en el viaje, con la contradicción;
  - «todo fue marcha» DECLARADO;
  - uso personal sin datos contables;
  - simplificada↔detallada;
  - validación frente a calibración y frente a un intervalo no posterior al ajuste;
  - el resumen de objetivos y su leyenda.
- `npm run build`: comercial de 587,88 kB, sin cambios.
- `VITE_FF_MEDICION=1 npm run build:medicion`: JS de 348 kB (104 kB gzip).
- `scripts/ci-medicion/paquetes.mjs` (builds con `--sourcemap=hidden`): paquetes separados.
- `node scripts/campo/probar-interoperabilidad.mjs`: OK en ambos sentidos.
- `bash scripts/ci-medicion/navegador.sh`, el mismo guion de la CI de Codex, en local (servidor estático en 5195 y servidor sin flag en 5196):
  - e2e: **84 comprobaciones, 0 fallas**;
  - «sin conexión: recarga y registro OK» en los dos perfiles;
  - `atomicidad.mjs`: los cinco rechazos sin escrituras y la reimportación idéntica, OK.

Lo que sigue es el registro de la iteración anterior.


- **Vitest, focalizadas:** `tests/medicion-datos.test.ts` (44), `tests/medicion-calculos.test.ts` (20), `tests/medicion-aislamiento.test.ts` (108, la mayoría una por archivo comercial). Nuevas en esta iteración: resultado = `crearPresupuesto`; simplificada sin fijos y detallada con fijos; captura de base, ajuste y precisión, con rechazo de un corte posterior al sello; huella = `envolverOriginal` = canónica v3; metadata fuera del original; original con clave extra que no verifica; sello del formato anterior conservado byte a byte y «no comparable»; tiempos no desglosados → DATO FALTANTE y total aparte; minutos MEDIDO o DECLARADO; km DECLARADO con lectura declarada o TRIP reiniciado; litros solo con boleta o surtidor; independencia no automática; base tributaria; paquete que pasa `verificarPaquete` y paquete alterado rechazado; colisión de alias con sellos intactos; respaldo inválido sin escrituras (sello alterado, referencia rota, sello distinto con el mismo id, clave desconocida, tipo inválido, id repetido); conflicto que bloquea hasta decidir; lote atómico; comparación (sin presupuesto, previo, cronología sin verificar, sello alterado).
- **Regresión completa:** `npm test` → **46 archivos, 923 pruebas en verde** (incluye las de Codex: `tests/campo-economico.test.ts` 29 y `tests/pruebas-campo.test.ts` 5). `npx tsc --noEmit -p .` sin errores.
- **Build comercial:** `npm run build` → `dist/assets/index-*.js` 587,88 kB. **Idéntico byte a byte** (sha256) con y sin `src/medicion` en el disco: la herramienta no entra en el paquete comercial. Sin cadenas de la herramienta ni del contrato en `dist/`.
- **Build de medición:** sin flag, `npm run build:medicion` falla (código 1). Con `VITE_FF_MEDICION=1`: `index.html` 0,82 kB, JS 338 kB (101 kB gzip; incluye React, zod y el contrato con el motor), CSS 6,8 kB, `sw.js` 1 kB. Sin URLs externas salvo las de comentarios de licencias de React.
- **Playwright** (`scripts/e2e-medicion.mjs`, Chromium; Pixel 7 emulado y PC 1366×768, zona America/Santiago, reloj controlado), contra `vite preview` del build en `localhost:5195` y el servidor sin flag en `localhost:5196`: **77 comprobaciones, 0 fallas.** Además de lo anterior: modalidad (detallada desde la cotización, simplificada por defecto sin campo de fijos), base neta en plan y viaje (peajes «igual», fijos «excluida»), sin base no hay diferencia en pesos, informe del contrato en pantalla y en `comparacion.csv`, **paquete descargado importado con la CLI de Codex** en una carpeta temporal (original idéntico, motores idénticos, reimportación idempotente) y **respaldo con un sello alterado que no importa nada** (ni un viaje nuevo válido del mismo archivo).
- **Pruebas de Codex que corre su workflow:** `node scripts/campo/probar-interoperabilidad.mjs` → «Chromium → paquete → CLI: original idéntico y reimportación idempotente» y «CLI → Chromium: huella canónica y versión real del motor idénticas». Vitest y build: arriba.

**CI independiente (resuelto por Codex).** Codex creó `.github/workflows/fase0-medicion.yml` y `scripts/ci-medicion/` (`e79849d`), con estos pasos:
- typecheck, `npm test`, los dos builds y la separación de paquetes;
- interoperabilidad con la CLI;
- Chromium sin red con el e2e;
- importación atómica.

Según el coordinador, la corrida sobre `e79849d` salió en verde. Claude no modificó esos archivos. La corrida remota sobre el HEAD nuevo no se esperó.

**No se pudo probar:** el teléfono real del propietario (cámara, permiso de almacenamiento persistente, expulsión de datos, «Compartir» un archivo), Safari/iOS y Firefox, ni la instalación en la pantalla de inicio (no hay manifiesto). Todo depende de D-1 (§7).

## 5. Limitaciones

- Los datos viven solo en el navegador que los creó: borrar sus datos o perder el teléfono los pierde. Mitigación: respaldo JSON y «última copia hace N días». La persistencia la decide el navegador (POR VALIDAR en el teléfono).
- El modo sin conexión exige abrir una vez la versión compilada con conexión, desde un origen seguro (`https://` o `localhost`). En desarrollo no hay service worker. No funciona desde `file://`.
- Los códigos `viaje-NNN` son por dispositivo: si se registran viajes en dos equipos sin fusionar antes, puede haber códigos repetidos con distinto `id`. La fusión no los pierde ni toca sus sellos; se muestran con alias de presentación y quedan fuera del paquete hasta exportarlos desde su equipo de origen.
- «Todo fue marcha» es una declaración del usuario (DECLARADO): no reemplaza los botones de estado y no se ofrece si hubo estados.
- Los litros que el contrato asigna a un viaje son una estimación proporcional del intervalo, nunca consumo medido; solo existen con un intervalo de validación posterior al ajuste.
- **IndexedDB depende del origen** (esquema, dominio y puerto): si cambia la URL de la herramienta, el navegador abre una base vacía. Antes de cambiar de origen hay que **exportar la copia** y luego importarla en el nuevo.
- **La caché sin conexión y los datos quedan en el teléfono:** revocar o cambiar la contraseña de acceso (§7) **no borra** la copia de la aplicación en la caché del service worker ni los datos de IndexedDB de un teléfono que ya la abrió. Para retirarlos hay que borrar los datos del sitio en ese navegador (o usar «Borrar todo»).
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

**Condiciones obligatorias antes de publicar (P1 de GPT):**
1. **La autenticación cubre todo:** `index.html`, cada archivo de `assets/`, `sw.js`, cualquier ruta y cualquier respuesta de error; **sin respaldo público** (ninguna ruta sirve archivos sin pedir credenciales, tampoco un 404 con contenido). Se comprueba pidiendo sin credenciales `/`, `/sw.js`, un asset y una ruta inexistente: los cuatro deben responder 401.
2. **Secretos fuera del repositorio:** la contraseña vive solo como secreto del Worker en Cloudflare y se entrega al propietario como archivo privado; nunca en código, `wrangler.*`, issues, PR, README ni el paquete del navegador.
3. **Caché sin conexión:** revocar la contraseña impide nuevas descargas, pero **no borra** la copia de la aplicación ni los datos de un teléfono que ya la abrió (§5).
4. **Cambio de origen:** exportar la copia de seguridad antes de cambiar la URL (§5).
5. **CI independiente sobre el HEAD integrado** (unitarias, build, Chromium y CLI, importación y exportación) en verde y revisión independiente del módulo (Codex o GPT).

**Autorización exacta que se necesitaría (texto propuesto):**

> **SOLICITUD DE OK**
> Acción concreta: crear en mi cuenta de Cloudflare un Worker **nuevo y separado** (nombre propuesto `medicion-privada`) que sirva solo el build de `dist-medicion/` (rama `claude/medicion-telefono`), con `VITE_FF_MEDICION=1` **solo en ese build**, protegido con usuario y contraseña propios (mecanismo de `STAGING_BASIC_AUTH`, secreto nuevo guardado solo como secreto del Worker y entregado como archivo privado) que se exige en **todas** las rutas, recursos, `sw.js` y respuestas de error, sin respaldo público; `noindex`, en un subdominio `workers.dev` sin publicar la URL en el repositorio. Antes de desplegar: CI independiente en verde sobre el HEAD integrado.
> Archivos / servicios afectados: un archivo de Worker y una configuración `wrangler` nuevos para la herramienta (sin tocar `wrangler.jsonc` ni el Worker de staging); un secreto en Cloudflare. Sin Supabase, sin APIs externas, sin migraciones.
> Incluye / excluye: incluye el despliegue de ese Worker y su secreto. Excluye producción, dominio propio, cambios al staging existente, Supabase, sincronización, merge del PR y cualquier plan de pago.
> Costo máximo y posibilidad de cobro: $0; plan gratuito de Workers (condiciones POR VALIDAR antes de desplegar; si exige pago, se detiene).
> Riesgo y cómo revertir: exposición de la herramienta a quien tenga la contraseña (los datos siguen solo en el teléfono); se revierte borrando el Worker y su secreto. Revocar la contraseña **no borra** la copia en caché ni los datos de un teléfono que ya la abrió; para eso se borran los datos del sitio en ese navegador. Si la URL cambia, exportar la copia antes (IndexedDB depende del origen).
> Cómo probar: sin credenciales, `/`, `/sw.js`, un asset y una ruta inexistente responden 401; con la contraseña, abrir la URL en el teléfono, registrar un viaje ficticio, activar el modo avión, recargar y comprobar que sigue funcionando; exportar el CSV y abrirlo en Excel; exportar el paquete e importarlo con la CLI.

## 8. Bloqueos y siguiente paso

- **D-1:** la prueba en el teléfono real requiere la autorización de §7.
- **Dependencia de #55:** el PR #57 incluye el merge de la rama de Codex; su diff se reduce cuando #55 se integre en la base. Si Codex publica otra versión del contrato, se vuelve a hacer merge (nunca rebase de commits ajenos).
- **CI para #57:** resuelta por Codex con `fase0-medicion.yml` (§4). Falta confirmar la corrida remota sobre el HEAD que incluye A-91.
- **#12:** criterios estadísticos por aprobar. Los objetivos que se muestran son exploratorios.
- **Revisión independiente** (Codex o GPT) del módulo antes de cualquier publicación.
