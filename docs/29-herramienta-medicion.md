# 29 · Diseño de la herramienta privada de medición (A-88, Frente B)

**Estado:** PROPUESTO (26-11-2026, hora de Chile). Diseño técnico y documental autorizado por el propietario. **No autoriza implementación**, migraciones, despliegues (staging incluido), flags encendidas ni servicios. Base: commit `3379433`; PR #55 de Codex revisado en `8b04332` (3 P1 según [27 §4](27-consolidacion-fase-0.md)); su punta actual `61e5214` declara corregirlos (evidencia independiente, muestras reservadas) y agrega `contrato.js` y `referencia.js`: **pendiente de revisión independiente**, no se revisó aquí para no duplicar a GPT. Reglas: A-82, A-84, A-85, A-86, A-87.

## 1. Objetivo y límites

**Objetivo.** El propietario registra sus viajes cotidianos con el Chery (0B, [08](08-hoja-de-ruta.md)) **desde el teléfono**, sin terminal, comandos ni JSON. El presupuesto queda sellado antes de salir y se compara después con lo observado, partida por partida, con la convención de [27 §1](27-consolidacion-fase-0.md).

**Dentro:** vehículos de medición, presupuesto sellado, viaje con tiempos separados, lecturas TRIP/odómetro con foto opcional, cargas de combustible, intervalos lleno a lleno, comparación, historial y exportación CSV/Excel.

**Fuera (esta ronda):** OCR obligatorio, GPS, IA, API CNE, integraciones comerciales (Copec u otras), datos de terceros, piloto con transportistas, cambios de fórmulas, un segundo motor, servicios de pago y cualquier promesa de que «el sistema aprende». No se inventan cifras: todo umbral sin fuente queda como **DATO FALTANTE** o **POR VALIDAR**.

## 2. Arquitectura

**Recomendación (PROPUESTO):** un **módulo privado dentro de la misma app web** (React + Vite), en una ruta propia (`/medicion`), detrás de una flag nueva **apagada** `VITE_FF_MEDICION`, sin enlace desde la interfaz pública y con los datos **solo en el dispositivo** (IndexedDB) en la etapa 1.

Por qué:
- reutiliza el motor `src/engine` (`buildCostItems`, `computeMeasures`, `displayAmount`) y las funciones puras del PR #55 sin copiarlas;
- teléfono y computador usan el mismo código (A-49), sin instalar nada;
- la cotización comercial, el PDF, WhatsApp y el enlace público no se tocan: el módulo no importa `clientQuote.ts`, `saveQuote.ts` ni `cloud/`.

**Alternativas descartadas:** app nativa (instalación y tiendas); hoja de cálculo compartida (requiere servicio externo y edición manual, que es lo que se quiere evitar); un HTML suelto abierto desde archivos (IndexedDB y cámara en `file://` son inestables en navegadores móviles: POR VALIDAR, sirve solo como plan C).

**Bloqueo de acceso (decisión D-1).** Sin desplegar, el teléfono no puede abrir la ruta. Opciones: (a) publicar el módulo en el **staging gratuito existente** con la flag encendida solo allí: es un despliegue y requiere autorización; los datos siguen solo en el teléfono; (b) servidor local del PC en la red de la casa: exige terminal, contradice el encargo; (c) HTML suelto: plan C POR VALIDAR. Recomendado: (a), cuando se autorice.

### 2.1 Qué se reutiliza del PR #55

| Pieza de #55 | Uso en el teléfono | Acción |
|---|---|---|
| `evidencia.js`: `valor`, `clase`, `tiempos`, `partidasDirectas`, `validarContexto/Plan/Observacion` | Validar cada ficha antes de sellar o comparar | **Tal cual**, mover a módulo compartido |
| `comparar.js`: `presupuesto`, `diferencia`, `cobertura`, `rendimiento`, `informe` | Presupuesto sellado, lleno a lleno y comparación | **Tal cual** (ya es puro e importa solo `src/engine`) |
| `clases.js`: `resumenClases` | Pantalla de clases comparables | **Tal cual** |
| `archivo.js`: `guardar`, `leerSello`, `huella`, `revisarReferencias` | Solo la lógica (sello inmutable, huella, referencias únicas) | Separar: la parte pura (huella canónica, verificación de sello, referencias) a compartido; `fs`/`crypto` de Node quedan en `scripts/campo` |
| `plantilla-economica.json` | Forma exacta de la ficha que exporta el teléfono | Tal cual |
| `contrato.js`, `referencia.js` (nuevos en `61e5214`) | Contrato de la ficha y referencias independientes | Revisar tras la auditoría de #55; mismo criterio: lo puro a compartido |

**Movimiento propuesto (lo hace Codex, después de cerrar los P1 de #55):** `scripts/campo/{evidencia,comparar,clases}.js` → `src/shared/campo/` (TS o JS con `.d.ts`), y `scripts/campo/*` los reexporta, para que CLI y teléfono usen **la misma función**. La huella pasa a `huellaCanonica(datos, sha256)` con el hash inyectado (Node `crypto` en CLI, `crypto.subtle` en el navegador) y una serialización con orden de claves fijo, para que el sello del teléfono verifique igual en la CLI.

**Hallazgo para Codex (P2), ya corregido:** en `8b04332`, 4 líneas de `comparar.js`, 13 de `evidencia.js` y 3 de `archivo.js` tenían el carácter de reemplazo U+FFFD en lugar de tildes. En `61e5214` hay 0 (comprobado con `grep`). Conviene una prueba que lo impida al mover el código a `src/shared/campo/`.

## 3. Modelo de datos

Todos los registros llevan `id` (UUID), `creadoEl`/`editadoEl` (ISO con zona) y `formato` (versión del esquema). Las cifras usan la tupla de #55 `[valor, clase]` o `null`; las clases se alinean con el contrato de procedencia de `src/shared/procedencia.ts` ([28 §2](28-snapshot-v3-procedencia.md#2-contrato-de-procedencia-srcsharedprocedenciats)): `medido`, `comprobado`, `declarado`, `estimado`, `simulado`, `faltante` ↔ `MEDIDO`, `COMPROBADO`, `DECLARADO`, `ESTIMADO`, `SIMULADO`, `DATO FALTANTE`. Debe existir **una sola tabla de equivalencia** en `procedencia.ts`; ni el teléfono ni la CLI la redefinen.

- **Vehículo de medición** (se ingresa una vez): alias `veh-001`, `tipoVehiculo` con el enum de #55 (`auto`, `camioneta`, `furgon`, `camion_liviano`, `otro`), combustible, resolución del TRIP (0,1 km u otra) y del odómetro, capacidad del estanque (opcional), valores por defecto del plan (precio y su fuente, km/L y su origen, desgaste, fijos). **No** reutiliza `VehicleProfile` de la app: su tipo no admite `auto` y está ligado a la nube (decisión D-4). Sin patente ni datos personales.
- **Presupuesto sellado:** `{datos, sha256}` con `datos` en el formato de `presupuesto-original.json` de #55 (`version`, `id` del viaje, `uso`, `vehiculo`, `tipoVehiculo`, `fecha`, `plan`, `resultado`) **más** lo que pide la revisión GPT (P2): versión del motor, resolución/incertidumbre de lectura y procedencia por parámetro. Si el plan se recuperó de una cotización, guarda `origen: {tipo: 'cotizacion', schemaVersion, folio}` y los `params` del snapshot v3 ([28](28-snapshot-v3-procedencia.md)). Inmutable: corregir = sellar uno nuevo y anular el anterior con motivo; nunca editar.
- **Viaje:** `vehiculo`, `presupuestoId` (o `null` = sin presupuesto previo), `uso` (`personal` | `simulacion`), lectura inicial y final (`{tipo: 'trip'|'odometro', valor, clase, fotoId|null, confirmadaEl}`), `eventos` de tiempo (`marcha`, `espera`, `carga`, `descarga`, cada uno con inicio/fin), `recorrido` (urbano/autopista/mixto), `nivelCarga`, `aire`, comprobantes TAG/otros con referencia `doc-NNN-NN` y monto, cobertura por partida, estado (`borrador` | `en curso` | `cerrado` | `anulado`). Los minutos de #55 (`marchaMin`, `esperaMin`, …) se **derivan** de los eventos; no se tipean.
- **Foto (opcional):** Blob reducido y re-codificado **solo en el dispositivo**, con `id` y `viajeId`. Nunca se exporta en CSV ni se sincroniza por defecto (§8).
- **Carga de combustible:** `vehiculo`, fecha y hora, litros, precio por litro, total pagado (calculado, editable si la boleta difiere), fuente del precio (`boleta`, `surtidor`, …), odómetro, `lleno` sí/no, `referencia` a boleta opcional.
- **Intervalo lleno a lleno:** derivado (no se tipea) entre dos cargas llenas consecutivas del mismo vehículo; contiene las parciales intermedias y los viajes cuyo odómetro cae dentro. Lleva la clase comparable (recorrido × carga × aire) que el propietario confirma al cerrarlo, y `uso: calibracion | validacion` (ver §5, P1 de independencia).
- **Clase comparable:** clave de `resumenClases`; n < 3 = «insuficiente»; umbrales «por aprobar en #12».

## 4. Flujo de usuario (teléfono primero, igual de completo en PC)

Una barra inferior con **Viaje · Combustible · Historial · Vehículo**. Botones grandes, un dato por pantalla en los pasos de manejo.

**1. Seleccionar vehículo.** Si hay uno solo, se elige solo. Primera vez: asistente corto con los datos permanentes; después no se piden más.
```
[ Chery (veh-001) ✓ ]   [ + Agregar vehículo ]
Último odómetro conocido: 48.213 km (carga 24-11)
```

**2. Presupuesto previo.** Tres caminos: *Nuevo* (formulario prellenado con los valores por defecto del vehículo y el último precio pagado, marcados con su procedencia); *Desde una cotización guardada* (lista local; v3 trae parámetros y procedencia, v1/v2 no los tienen y esos campos quedan **faltantes**, nunca recalculados); *Sin presupuesto* (el viaje se registra igual, pero la comparación dirá «sin presupuesto previo»). Botón **Sellar**: muestra el resumen del motor y la hora; después no se edita.
```
km previstos [ 18 ]  (estimado)     minutos de marcha [ 35 ]
km/L [ 12,4 ] origen: intervalos I-03, I-04 (medido)
precio/L [ 1.290 ] boleta 24-11 (comprobado)
Costo estimado: $ … (partidas faltantes: ninguna)    [ Sellar presupuesto ]
```

**3. Iniciar viaje.** Un toque: guarda fecha, hora y zona automáticamente y abre el registro de la lectura inicial. Si el presupuesto no está sellado, avisa y ofrece sellarlo o seguir sin él.

**4. Lectura inicial (foto opcional).** Botón *Fotografiar* (cámara trasera) o *Escribir*. La foto solo sirve para que el propietario lea y confirme el número; **no hay OCR**. Validaciones: número ≥ 0 con la resolución del vehículo; si es odómetro, ≥ último odómetro conocido; si es TRIP, sugerir ponerlo en cero y registrar 0,0. Durante el viaje, botones de estado **En marcha · Espera · Carga · Descarga · Pausa**: cada toque cierra el tramo anterior y abre otro, sin escribir minutos.
```
En marcha 00:23:10   [ Espera ] [ Carga ] [ Descarga ] [ Finalizar ]
```

**5. Finalizar viaje.** Guarda la hora; cierra el tramo abierto.

**6. Lectura final.** Igual que 4. Calcula la diferencia de km automáticamente. Bloquea final < inicial (salvo que el usuario marque «el TRIP se reinició» y escriba los km). Avisa, sin bloquear, si los km implican una velocidad media sobre un umbral **que fija el propietario** (sin valor por defecto: DATO FALTANTE) o si difieren del previsto más que ese umbral. Pide recorrido, nivel de carga y aire (un toque cada uno) y comprobantes TAG/otros con su cobertura (`completa` exige al menos una línea, aunque sea $0, como en #55). Recordatorio si un viaje lleva abierto más de X horas (X configurable).

**7. Comparar.** Ejecuta `informe()` de #55 sobre la ficha y el sello (§5). Muestra una tarjeta por partida, nunca un «aprobado» del total.

**8. Combustible.** Formulario: litros, precio/L, odómetro, *lleno / parcial*, fuente del precio. Automático: fecha y hora, total, km desde la carga anterior y, al cerrar un intervalo lleno a lleno, `rendimiento()` de #55 con su clase. Validaciones: litros > 0; odómetro ≥ el de la carga anterior; si se registra una carga con fecha anterior, se reordena y se avisa si algún intervalo cambia. Si la capacidad del estanque está declarada, avisa cuando los litros la superen.
```
Litros [ 31,82 ]  $/L [ 1.290 ]  Total $ 41.048   Odómetro [ 48.512 ]
(•) Lleno  ( ) Parcial    Intervalo I-05 cerrado: 299 km / 31,82 L → 9,40 km/L
```

**9. Historial y exportación.** Lista por fecha con filtros (vehículo, estado, clase). Cada viaje abre su ficha, su sello (con la huella abreviada) y su comparación. Botones **Exportar CSV/Excel**, **Exportar paquete para la CLI** y **Copia de seguridad** (§6–7).

## 5. Comparación predicción frente a observación

Convención de [27 §1](27-consolidacion-fase-0.md) (PROPUESTA, por aprobar en #12): **error firmado = (estimación previa − referencia independiente) / referencia × 100**; con referencia 0 se informa la diferencia en CLP; negativo = subestimación. Se muestra por partida y para cada una se dice qué tipo de referencia es:

| Partida | Referencia | Clase de la referencia |
|---|---|---|
| Distancia, minutos de marcha/espera/carga/descarga | TRIP/odómetro y eventos del viaje | medido |
| Peajes/TAG, ayudantes, otros | comprobantes con cobertura `completa` | comprobado; si falta, **sin comparación** |
| Combustible | km/L de un intervalo **comparable e independiente** × km medidos × precio pagado | **estimado** (asignación: litros de un intervalo no son litros de un viaje) |
| Desgaste y fijos | gastos de un periodo ÷ km u horas del periodo | estimado; sin periodo, DATO FALTANTE |
| Remuneración propia | ninguna: es meta, no pago | no se compara como desembolso |

Compatibilidad con los P1 de GPT sobre #55:
- **Espera excluida del costo:** la herramienta mide la espera, la muestra con la etiqueta «registrada; el motor vigente no la costea» y la incluye en la cobertura. No se propone fórmula.
- **Sin referencia total independiente:** se separan tres columnas: *presupuesto sellado*, *recalculado con la ruta observada* (misma fórmula, otra entrada: **no es validación**) y *referencia independiente por partida*. No existe «PASS de costo total»; si falta una partida material, el total se muestra como **comparación parcial** con su cobertura (p. ej. «4 de 7 partidas»).
- **Independencia intervalo/viaje:** cada intervalo se marca *calibración* o *validación*. El km/L del presupuesto debe venir de intervalos cerrados **antes** del sello y marcados calibración; la referencia de combustible del viaje usa el intervalo que lo contiene, que debe ser de validación y no figurar en el origen del km/L. Si se solapan, la tarjeta dice «no independiente» y no cuenta para el KPI.

Además: el sello prueba integridad, **no** la hora (el reloj es del teléfono). La cronología se declara «previa al viaje» solo si `fecha del sello ≤ inicio del viaje`, como en #55; un sello de respaldo exportado antes de salir (§6) es opcional.

**Ajuste por A-89 (26-11):** las recargas parciales son el hábito normal y la herramienta no exige llenados completos. Sin inventario inicial y final suficiente, una carga parcial **no** se convierte en litros consumidos por un viaje: queda como gasto registrado. Los intervalos lleno a lleno son una metodología controlada y opcional para calibrar, que el propietario activa cuando quiera medir. La comparación se hace por modalidad (simplificada o detallada) y solo entre partidas del mismo alcance.

## 6. Almacenamiento y sincronización (sin contratar nada)

| Opción | Pros | Contras / riesgo | Privacidad | Autorización |
|---|---|---|---|---|
| **A. Solo navegador (IndexedDB) + exportar/importar archivo** | Sin servicios, sin cuenta, funciona sin señal | Se pierde si se borran los datos del navegador o el teléfono; algunos navegadores pueden expulsar datos de sitios poco usados (POR VALIDAR en el teléfono del propietario); sincronización manual | Máxima: nada sale del equipo | Ninguna para los datos (el acceso al módulo depende de D-1) |
| **B. A + carpeta que el propietario ya usa** (Drive/iCloud/correo a sí mismo, vía «Compartir» del teléfono) | Respaldo y paso al PC sin integrar APIs; el PC importa el archivo | Manual; versiones duplicadas si se exporta dos veces (se resuelve con fusión por `id`) | Depende de la cuenta del propietario; nada en el repo | Ninguna (no hay integración; el propietario elige dónde guardar) |
| **C. Supabase staging, tablas privadas con RLS** | Sincronización automática teléfono↔PC | Requiere migración nueva, encender flags, sesión Google y un proyecto que es de pruebas; datos personales en un staging | Media; exige revisión #17 | **Migración, despliegue y flag: autorización expresa** |
| D. Sincronización directa por red local/QR | Sin nube | Complejo y frágil | Alta | Ninguna, pero no compensa |

**Recomendación por etapas (PROPUESTO):** etapa 1 = **A + B**: registros como eventos con `id` único (agregar, anular; nunca sobrescribir), lo que permite **fusionar** archivos del teléfono y del PC sin conflictos; `navigator.storage.persist()` solicitado; recordatorio de copia semanal (configurable) y aviso de «última copia hace N días». Etapa 2, solo si el propietario lo autoriza: C, sin fotos, con su propia migración y revisión de privacidad. El fallo de una copia nunca borra datos locales.

## 7. Exportación CSV / Excel

- **CSV para Excel:** UTF-8 con BOM, separador `;`, coma decimal opcional (como `plantilla.csv`), sin separador de miles. Excel lo abre sin dependencias nuevas; un `.xlsx` real exigiría una librería (decisión D-5, no recomendado ahora).
  - `viajes.csv`: `id_viaje; vehiculo; uso; fecha_inicio; hora_inicio; fecha_fin; hora_fin; lectura_tipo; lectura_ini; lectura_fin; km; marcha_min; espera_min; carga_min; descarga_min; recorrido; nivel_carga; aire; tag_clp; tag_cobertura; otros_clp; otros_cobertura; presupuesto_id; sello_sha256_12; intervalo_id; intervalo_uso; costo_previsto_clp; …`, una columna `*_clase` por cifra.
  - `cargas.csv`: `id; vehiculo; fecha; hora; litros; precio_l; total_clp; fuente_precio; odometro; lleno; intervalo_id`.
  - `comparacion.csv`: una fila por viaje y partida: `previsto; recalculado; referencia; clase_referencia; diferencia_clp; error_pct; sentido; independiente`.
- **Paquete para la CLI de #55:** un archivo `paquete-medicion.json` con, por viaje, la `ficha` (forma exacta de `plantilla-economica.json`) y el `presupuesto-original` `{datos, sha256}`. Codex añadiría una acción `importar` que lo desarma en `calibracion/viaje-NNN/` reutilizando `guardar()` y `leerSello()` (sin sobrescribir). Así `comparar` y `resumen` corren igual en el PC. Para viajes personales simples también se puede exportar en el formato de `plantilla.csv` (`npm run campo` vigente).
- **Copia de seguridad:** todo en JSON (opcionalmente con fotos), importable por la misma herramienta.

## 8. Privacidad y seguridad

- Fotos: la de cámara puede traer EXIF con GPS y modelo del equipo. Por defecto **no se guarda** la foto (solo se usa para leer). Si el propietario elige guardarla: se re-codifica en un `canvas` (descarta EXIF), se reduce a lo necesario para leer el número y queda solo en IndexedDB. Nunca en CSV, paquete CLI ni nube.
- Sin domicilios, patentes, nombres ni números de boleta: alias `veh-NNN`, `viaje-NNN`, `doc-NNN-NN` (como #55). Campo libre de notas: no se exporta por defecto y avisa «no escribas direcciones».
- Ningún dato real ni foto en el repositorio (`calibracion/` sigue excluida). Pruebas solo con datos ficticios.
- El módulo no comparte almacenamiento con la cotización: claves/BD propias (`medicion.v1`), sin acceso desde `clientQuote.ts`, PDF, WhatsApp ni enlace público.
- Borrado: botón «borrar todo de este dispositivo» con confirmación y recordatorio de exportar. Datos de terceros: fuera hasta definir consentimiento y retención (#17).

## 9. Pruebas cuando se implemente

- **Unitarias (Vitest):** derivación de minutos desde eventos (incluye tramos abiertos, cambio de día y de horario de verano en Chile), diferencias de km con resolución, reinicio de TRIP, intervalos lleno a lleno con parciales y cargas reordenadas, independencia calibración/validación, huella canónica idéntica en Node y navegador (mismo `sha256` para la misma ficha), equivalencia de clases con `procedencia.ts`, exportación (BOM, `;`, comas decimales, escapado) y **la ficha exportada pasa `validarContexto/Plan/Observacion` de #55**.
- **Controles negativos:** lectura final < inicial, odómetro que retrocede, litros ≤ 0, sello alterado (huella distinta), editar un viaje sellado, comprobante repetido, partida `completa` sin línea, foto con EXIF de prueba que queda limpia, ningún dato de medición aparece en PDF/WhatsApp/enlace público.
- **Integración:** recuperar presupuesto desde snapshot v3 y desde v1/v2 (campos faltantes, sin recalcular); fusión de dos copias (teléfono + PC) sin duplicados; funcionamiento con todas las flags de carga apagadas y con `VITE_FF_MEDICION` apagada (la ruta no existe en el paquete).
- **E2E (A-49):** Playwright en viewport de teléfono y de escritorio para los pasos 1–9, más prueba manual en el teléfono real del propietario (cámara, persistencia tras cerrar el navegador, compartir archivo). Registrar lo que no se pudo probar.
- Regresión completa solo al integrar (§11.3); el motor no cambia, así que los casos dorados deben seguir iguales.

## 10. Reparto de trabajo (cuando se autorice)

| Responsable | Archivos exclusivos | Depende de |
|---|---|---|
| **Codex** | `scripts/campo/**` (corrección P1/P2, U+FFFD, acción `importar`), nuevo `src/shared/campo/**` (funciones movidas desde #55), sus pruebas | Cierre de revisión de #55 |
| **Claude** | `src/shared/procedencia.ts`, `src/shared/snapshot.ts` (Frente A, implementado: [28](28-snapshot-v3-procedencia.md)); luego `src/web/medicion/**` (pantallas, IndexedDB, exportación), entrada de ruta en `App.tsx`, flag en `featureFlags.ts`, pruebas e2e | `procedencia.ts` estable; `src/shared/campo/**` publicado por Codex |
| GPT | Revisión independiente del diseño y de las comparaciones; criterios #12 | — |
| Propietario | D-1 a D-7; prueba en su teléfono | — |

Orden: (1) Frente A estabiliza `procedencia.ts` (hecho en esta ronda); (2) Codex cierra #55 y mueve las funciones puras; (3) Claude construye la interfaz encima. **Riesgos:** que Codex y Claude editen `src/shared/` a la vez (mitigación: Codex solo `src/shared/campo/`, Claude solo `procedencia.ts`/`snapshot.ts`/`src/web/medicion/`); que la huella difiera entre Node y navegador (prueba cruzada obligatoria); que la tabla de clases de #55 y la de `procedencia.ts` diverjan (una sola fuente); que el `informe` cambie al corregir los P1 (la interfaz solo lo presenta, no lo reimplementa).

## 11. Decisiones pendientes del propietario y bloqueos

- **D-1 · Acceso desde el teléfono:** publicar el módulo en el staging existente con `VITE_FF_MEDICION` (despliegue: requiere autorización) / plan C con HTML suelto (POR VALIDAR). **Bloquea la prueba en el teléfono.**
- **D-2 · Almacenamiento:** etapa 1 solo dispositivo + archivo (recomendado) / Supabase staging (migración y flag: autorización aparte).
- **D-3 · Fotos:** no guardar (recomendado) / guardar solo en el teléfono sin EXIF.
- **D-4 · Vehículo:** perfil propio del módulo (recomendado; admite `auto`) / ampliar `VehicleProfile` de la app (toca nube y migración).
- **D-5 · Excel:** CSV compatible con Excel (recomendado) / `.xlsx` con nueva dependencia.
- **D-6 · Umbrales de aviso** (velocidad media implícita, desvío de km, viaje abierto, copia de seguridad): DATO FALTANTE; los fija el propietario o #12.
- **D-7 · Criterios de #12** (KPI, tamaño de muestra, exclusiones): PROPUESTOS en [27 §1](27-consolidacion-fase-0.md), pendientes de aprobación; la herramienta muestra «por aprobar» mientras tanto.
- **Bloqueos técnicos:** correcciones de los P1 de #55 (`61e5214`) sin revisión independiente; funciones de #55 aún en `scripts/campo` (no compartibles); la implementación misma requiere autorización expresa.
