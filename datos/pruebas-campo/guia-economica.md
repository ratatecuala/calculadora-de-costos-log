# Registrar un viaje de fase 0B

Usa la rama del instrumento desde la raíz del proyecto, con las dependencias instaladas (`npm ci`). Cada viaje tiene un código, por ejemplo `viaje-001`. Las fichas, los originales y los informes se guardan en `calibracion/`, excluida de Git. Conserva los comprobantes aparte y asígnales códigos. El CSV anterior sigue disponible con `npm run campo -- datos/pruebas-campo/escenarios.csv`.

1. **Antes de salir**, ejecuta `npm run campo -- fase0 iniciar viaje-001`. Abre `calibracion/viaje-001/ficha.json` en un editor de texto. El comando copia la [plantilla](plantilla-economica.json).
2. Completa `uso` (`personal`, `flete_real` o `simulacion`), un código de vehículo como `veh-001` y `tipoVehiculo` (`auto`, `camioneta`, `furgon`, `camion_liviano` u `otro`). En `plan`, anota lo que sabías al presupuestar. Guarda y ejecuta `npm run campo -- fase0 sellar viaje-001` **antes de partir**. Se crea un original fechado con las entradas y el resultado del motor. El comando rechaza un segundo sellado.
3. **Después del viaje**, completa solo `observacion`. Anota la hora real de salida con zona (por ejemplo, `2026-11-20T08:00:00-03:00`). Separa marcha, espera detenida durante el servicio, carga y descarga. El taco ya incluido en marcha se cuenta una vez. Registra la resolución del contador en km. Un odómetro que solo cambia cada kilómetro tiene resolución 1.
4. Ejecuta `npm run campo -- fase0 comparar viaje-001` y abre el archivo que indica. Puedes completar faltantes y repetir la comparación. Cada informe queda fechado y el presupuesto se conserva. Si ya hiciste el viaje sin presupuesto, omite el paso de sellado. Obtendrás observaciones y gastos respaldados sin reconstruir una predicción.
5. Para revisar todos los intervalos de combustible guardados, ejecuta `npm run campo -- fase0 resumen`. El archivo agrupa por uso, tipo de vehículo, vehículo, recorrido, nivel de carga y aire acondicionado.

## Cómo llenar la ficha

En campos numéricos escribe el valor y su evidencia, por ejemplo `[12.4, "MEDIDO"]`. Usa punto decimal y pesos chilenos. `null` significa **DATO FALTANTE**. Un cero necesita evidencia igual que cualquier otro valor.

| Evidencia | Cuándo usarla |
|---|---|
| MEDIDO | Lectura de TRIP, odómetro, cronómetro o surtidor. |
| COMPROBADO | Un documento respalda ese valor, por ejemplo el precio por litro o el pago de un cliente. |
| DECLARADO | Información informada por la persona, sin comprobante. |
| ESTIMADO | Pronóstico, asignación o referencia. |
| SIMULADO | Todos los valores de un ensayo ficticio. Los resultados conservan esta identificación. |
| DATO FALTANTE | Escribe `null` cuando falta el valor. |

- **Plan.** `kmL` es km por litro. `desgasteKm`, `fijoHora` y `trabajoHora` son pesos por km, por hora productiva y por hora propia. `pagoAyudante` es por persona y servicio. `otros` excluye TAG, combustible, ayudantes, mantención y fijos. `margenPct` está en porcentaje. `recargos` está en pesos. `cotizado` es el precio que se ofreció. En un viaje personal deja los precios comerciales vacíos. El sugerido se obtiene del motor cuando están los datos necesarios.
- **Precio por litro.** Indica el importe y `fuentePrecio`. Usa `boleta` con COMPROBADO, `surtidor` con MEDIDO, `declaracion` con DECLARADO o `referencia_publicada` / `supuesto` con ESTIMADO. En simulación usa SIMULADO. La ficha admite el precio conocido al cotizar y el conocido después.
- **Carga y recursos.** `tipoCarga` admite `sin`, `muebles`, `mudanza`, `paquetes`, `materiales` u `otra`. Anota `pesoKg`, número de ayudantes, minutos-persona totales y equipo (`ninguno`, `carro`, `rampa`, `elevador`, `varios`, `otro`). Marca el recorrido como `urbano`, `autopista` o `mixto`, el nivel de carga como `sin`, `parcial` o `completa` y el aire como `true` o `false`. Usa `null` si lo desconoces.
- **Dinero respaldado.** Para una línea de cartola TAG, por ejemplo, agrega `{"ref":"doc-001-01","partida":"peajes","clp":600}` en la lista `comprobantes`. Las otras partidas son `ayudantes` y `otros`. Asigna un alias estable por documento y línea. Una línea pertenece a un solo viaje y partida. En `cobertura` indica `"completa"` cuando verificaste toda la partida, `"parcial"` cuando falta respaldo, o `null` cuando lo desconoces. Un cero comprobado también requiere una referencia. El cobro al cliente va solo en `cobrado`.
- **Gastos de periodo.** En `mantencion` admite, por ejemplo, `{"periodo":"2026-10-01/2026-10-31","gastoClp":[10000,"COMPROBADO"],"kmPeriodo":[400,"MEDIDO"]}`. Suma aceite, neumáticos y mantenciones del vehículo en ese periodo. En `fijos` usa el mismo formato con `horasProductivas` en lugar de `kmPeriodo`, y el total de gastos fijos en `gastoClp`. Conserva el desglose privado. Cada numerador y denominador corresponde al mismo periodo. Sus asignaciones al viaje siguen siendo ESTIMADO.
- **Intervalo lleno a lleno.** El siguiente bloque ilustra únicamente el formato con cifras ficticias. En una ficha real usa los valores que efectivamente mediste. Registra **todas** las cargas en orden; en el primer lleno puedes dejar los litros en `null`. Si falta una carga, marca `registroCompleto` como `false`. Guarda el mismo intervalo con idénticas lecturas cuando aparezca en más de una ficha.

```json
{
  "vehiculo": "veh-001", "recorrido": "urbano", "carga": "sin", "aire": false,
  "registroCompleto": true, "muestra":"validacion", "zona":"America/Santiago",
  "resolucionKm":null, "resolucionLitros":null, "incertidumbreLitros":null,
  "recargas": [
    {"fecha":"2026-10-01","lleno":true,"odometro":[100,"MEDIDO"],"litros":null},
    {"fecha":"2026-10-02","lleno":false,"odometro":[200,"MEDIDO"],"litros":[10,"COMPROBADO"]},
    {"fecha":"2026-10-03","lleno":true,"odometro":[400,"MEDIDO"],"litros":[20,"COMPROBADO"]}
  ]
}
```

## Cómo leer el informe

Antes de salir reserva el uso de la muestra en `plan.muestraPrevista` (`calibracion` o `validacion`). El informe exige que el sello previo y el intervalo observado coincidan en `validacion` para asignar sus litros al viaje.

**Antes de sellar** indica la base de los importes (`baseClp`: `neto` o `con_iva`) y cómo obtuviste el rendimiento. En `ajusteHasta` usa `"sin_ajuste"` si no utilizaste una muestra para ajustar el rendimiento. Si sí la utilizaste, anota el último día y el mayor odómetro empleados, por ejemplo `{"fecha":"2026-09-30","odometro":100}`. Un `null` deja la independencia pendiente. Indica también la resolución e incertidumbre de distancia si las conocías. El original v2 guarda los parámetros, la versión del producto y la huella SHA-256 de los fuentes del motor. Los originales v1 siguen legibles con versión desconocida y se conservan intactos.

**Después del viaje** completa `inicio` y `fin` con fecha, hora y zona local, los dos odómetros, los km TRIP, su resolución e incertidumbre y la base tributaria efectiva. En cada intervalo agrega `"muestra":"calibracion"` o `"muestra":"validacion"`. Registra `resolucionKm`, `resolucionLitros` e `incertidumbreLitros` con el formato de valor y evidencia. El último campo es la incertidumbre del total de litros del intervalo, incluida la variación del llenado. Un dato desconocido queda en `null`. No se supone una precisión a partir del número de decimales.

El viaje debe quedar dentro de las fechas y odómetros del intervalo de validación, en la misma clase. Los km TRIP se contrastan con la diferencia de odómetros admitiendo la resolución e incertidumbre informadas. Los intervalos de validación comienzan después del día final del ajuste; pueden compartir la lectura de odómetro del llenado que hace de frontera. Con cronología ambigua se conserva la medición del intervalo y se omite su asignación al viaje.

| Resultado | Interpretación |
|---|---|
| Presupuesto original | Entradas, importe, partidas y fecha guardados antes del viaje. El sello local detecta ediciones accidentales. La fecha depende del reloj del equipo. |
| Recalculado | Usa km y tiempos observados con los precios y supuestos del presupuesto original. Las horas del motor incluyen marcha, carga y descarga. La espera de servicio queda visible en el tiempo total observado y fuera del costo modelado. |
| Gastos respaldados | Subtotal de líneas disponibles. Cada partida completa permite comparar. Una cartola parcial conserva su subtotal y deja abierta la diferencia. |
| Espera fuera del motor | Minutos previstos y observados, costo fijo potencial y meta de trabajo propia asociada. Un importe desconocido queda abierto. El efecto se muestra por separado y el costo modelado queda parcial cuando hay espera económicamente relevante o desconocida. |
| Conciliación independiente | Contrasta el presupuesto operativo con TAG, ayudantes y otros respaldados, más combustible, desgaste y fijos asignados con evidencia independiente. Los fijos de referencia incluyen la espera observada. La meta de remuneración propia se informa aparte. Solo se calcula el error total con las seis partidas comparables, base tributaria coincidente y un presupuesto verificable. Los subtotales parciales identifican las partidas cubiertas. |
| Comparaciones | Diferencia con signo = previsto − referencia. La absoluta usa la misma unidad sin signo. La porcentual divide la diferencia con signo por la referencia y solo aparece si es distinta de cero. Positivo indica sobreestimación, negativo subestimación. Los importes por partida conservan la precisión del motor, el costo mostrado se redondea a pesos. |
| Referencias estimadas | El km/L se mide para el intervalo completo. Para estimar litros de un viaje se exige coincidencia de vehículo, recorrido, carga y aire. El precio observado permite valorar esos litros. La recarga completa nunca se agrega como gasto de un solo viaje. |
| Completitud | Número de campos presentes sobre los revisados y lista de faltantes. Una cota inferior conserva lo conocido. La comparación de costos totales modelados requiere dos resultados completos; el subtotal de comprobantes se compara por partida. |

El objetivo del propietario es un error económico absoluto máximo del 10 %. El error entre presupuesto y referencia independiente es descriptivo. La variación entre dos salidas del motor solo mide cuánto cambió la estimación al conocer el recorrido. El protocolo estadístico, la muestra comercial, el error de llenado y el horizonte representativo de mantención siguen pendientes en [#12](https://github.com/ratatecuala/calculadora-de-costos-log/issues/12).

El resumen de combustible deduplica intervalos y separa calibración, validación y registros históricos sin asignar. Con menos de tres intervalos por grupo muestra «insuficiente». Un grupo con tres o más sigue siendo descriptivo. Los viajes personales sirven para ensayar el método.

### Contrato para la futura captura privada

La [plantilla](plantilla-economica.json) y los validadores en `scripts/campo/evidencia.js` definen el formato. La API pura de `scripts/campo/contrato.js` funciona sin disco, red ni interfaz:

- `validarFicha(ficha)` comprueba campos, unidades, clases de evidencia, fechas y límites.
- `crearPresupuesto(ficha, id, fechaUtc, versionMotor)` devuelve una copia v2 con las entradas y el costo sellado. El adaptador de almacenamiento suministra la versión del motor que ejecuta.
- `compararFicha(ficha, original, ultimoAjuste)` genera el informe. El adaptador debe verificar previamente la huella del original, su identidad, referencias compartidas y solapamientos de su archivo. El tercer argumento lleva el último corte aplicable de otras fichas del mismo vehículo. El adaptador local implementa esas comprobaciones en `archivo.js`. La huella local detecta alteraciones accidentales; quien controla el equipo también controla su reloj y sus archivos.

La captura móvil puede guardar los mismos registros en forma local y presentar estos resultados. El contrato de campo es independiente del snapshot comercial de cotizaciones.
