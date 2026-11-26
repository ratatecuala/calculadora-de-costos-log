# Registrar un viaje de fase 0B

Usa la rama del instrumento desde la ra�z del proyecto, con las dependencias instaladas (`npm ci`). Cada viaje tiene un c�digo, por ejemplo `viaje-001`. Las fichas, los originales y los informes se guardan en `calibracion/`, excluida de Git. Conserva los comprobantes aparte y as�gnales c�digos. El CSV anterior sigue disponible con `npm run campo -- datos/pruebas-campo/escenarios.csv`.

1. **Antes de salir**, ejecuta `npm run campo -- fase0 iniciar viaje-001`. Abre `calibracion/viaje-001/ficha.json` en un editor de texto. El comando copia la [plantilla](plantilla-economica.json).
2. Completa `uso` (`personal`, `flete_real` o `simulacion`), un c�digo de veh�culo como `veh-001` y `tipoVehiculo` (`auto`, `camioneta`, `furgon`, `camion_liviano` u `otro`). En `plan`, anota lo que sab�as al presupuestar. Guarda y ejecuta `npm run campo -- fase0 sellar viaje-001` **antes de partir**. Se crea un original fechado con las entradas y el resultado del motor. El comando rechaza un segundo sellado.
3. **Despu�s del viaje**, completa solo `observacion`. Anota la hora real de salida con zona (por ejemplo, `2026-11-20T08:00:00-03:00`). Separa marcha, espera detenida durante el servicio, carga y descarga. El taco ya incluido en marcha se cuenta una vez. Registra la resoluci�n del contador en km. Un od�metro que solo cambia cada kil�metro tiene resoluci�n 1.
4. Ejecuta `npm run campo -- fase0 comparar viaje-001` y abre el archivo que indica. Puedes completar faltantes y repetir la comparaci�n. Cada informe queda fechado y el presupuesto se conserva. Si ya hiciste el viaje sin presupuesto, omite el paso de sellado. Obtendr�s observaciones y gastos respaldados sin reconstruir una predicci�n.
5. Para revisar todos los intervalos de combustible guardados, ejecuta `npm run campo -- fase0 resumen`. El archivo agrupa por uso, tipo de veh�culo, veh�culo, recorrido, nivel de carga y aire acondicionado.

## C�mo llenar la ficha

En campos num�ricos escribe el valor y su evidencia, por ejemplo `[12.4, "MEDIDO"]`. Usa punto decimal y pesos chilenos. `null` significa **DATO FALTANTE**. Un cero necesita evidencia igual que cualquier otro valor.

| Evidencia | Cu�ndo usarla |
|---|---|
| MEDIDO | Lectura de TRIP, od�metro, cron�metro o surtidor. |
| COMPROBADO | Un documento respalda ese valor, por ejemplo el precio por litro o el pago de un cliente. |
| DECLARADO | Informaci�n informada por la persona, sin comprobante. |
| ESTIMADO | Pron�stico, asignaci�n o referencia. |
| SIMULADO | Todos los valores de un ensayo ficticio. Los resultados conservan esta identificaci�n. |
| DATO FALTANTE | Escribe `null` cuando falta el valor. |

- **Plan.** `kmL` es km por litro. `desgasteKm`, `fijoHora` y `trabajoHora` son pesos por km, por hora productiva y por hora propia. `pagoAyudante` es por persona y servicio. `otros` excluye TAG, combustible, ayudantes, mantenci�n y fijos. `margenPct` est� en porcentaje. `recargos` est� en pesos. `cotizado` es el precio que se ofreci�. En un viaje personal deja los precios comerciales vac�os. El sugerido se obtiene del motor cuando est�n los datos necesarios.
- **Precio por litro.** Indica el importe y `fuentePrecio`. Usa `boleta` con COMPROBADO, `surtidor` con MEDIDO, `declaracion` con DECLARADO o `referencia_publicada` / `supuesto` con ESTIMADO. En simulaci�n usa SIMULADO. La ficha admite el precio conocido al cotizar y el conocido despu�s.
- **Carga y recursos.** `tipoCarga` admite `sin`, `muebles`, `mudanza`, `paquetes`, `materiales` u `otra`. Anota `pesoKg`, n�mero de ayudantes, minutos-persona totales y equipo (`ninguno`, `carro`, `rampa`, `elevador`, `varios`, `otro`). Marca el recorrido como `urbano`, `autopista` o `mixto`, el nivel de carga como `sin`, `parcial` o `completa` y el aire como `true` o `false`. Usa `null` si lo desconoces.
- **Dinero respaldado.** Para una l�nea de cartola TAG, por ejemplo, agrega `{"ref":"doc-001-01","partida":"peajes","clp":600}` en la lista `comprobantes`. Las otras partidas son `ayudantes` y `otros`. Asigna un alias estable por documento y l�nea. Una l�nea pertenece a un solo viaje y partida. En `cobertura` indica `"completa"` cuando verificaste toda la partida, `"parcial"` cuando falta respaldo, o `null` cuando lo desconoces. Un cero comprobado tambi�n requiere una referencia. El cobro al cliente va solo en `cobrado`.
- **Gastos de periodo.** En `mantencion` admite, por ejemplo, `{"periodo":"2026-10-01/2026-10-31","gastoClp":[10000,"COMPROBADO"],"kmPeriodo":[400,"MEDIDO"]}`. Suma aceite, neum�ticos y mantenciones del veh�culo en ese periodo. En `fijos` usa el mismo formato con `horasProductivas` en lugar de `kmPeriodo`, y el total de gastos fijos en `gastoClp`. Conserva el desglose privado. Cada numerador y denominador corresponde al mismo periodo. Sus asignaciones al viaje siguen siendo ESTIMADO.
- **Intervalo lleno a lleno.** El siguiente bloque ilustra �nicamente el formato con cifras ficticias. En una ficha real usa los valores que efectivamente mediste. Registra **todas** las cargas en orden; en el primer lleno puedes dejar los litros en `null`. Si falta una carga, marca `registroCompleto` como `false`. Guarda el mismo intervalo con id�nticas lecturas cuando aparezca en m�s de una ficha.

```json
{
  "vehiculo": "veh-001", "recorrido": "urbano", "carga": "sin", "aire": false,
  "registroCompleto": true,
  "recargas": [
    {"fecha":"2026-10-01","lleno":true,"odometro":[100,"MEDIDO"],"litros":null},
    {"fecha":"2026-10-02","lleno":false,"odometro":[200,"MEDIDO"],"litros":[10,"COMPROBADO"]},
    {"fecha":"2026-10-03","lleno":true,"odometro":[400,"MEDIDO"],"litros":[20,"COMPROBADO"]}
  ]
}
```

## C�mo leer el informe

| Resultado | Interpretaci�n |
|---|---|
| Presupuesto original | Entradas, importe, partidas y fecha guardados antes del viaje. El sello local detecta ediciones accidentales. La fecha depende del reloj del equipo. |
| Recalculado | Usa km y tiempos observados con los precios y supuestos del presupuesto original. Las horas del motor incluyen marcha, carga y descarga. La espera de servicio queda visible en el tiempo total observado y fuera del costo modelado. |
| Gastos respaldados | Subtotal de l�neas disponibles. Cada partida completa permite comparar. Una cartola parcial conserva su subtotal y deja abierta la diferencia. |
| Comparaciones | Diferencia con signo = previsto - referencia. La absoluta usa la misma unidad sin signo. La porcentual divide la diferencia con signo por la referencia y solo aparece si es distinta de cero. Positivo indica sobreestimaci�n, negativo subestimaci�n. Los importes por partida conservan la precisi�n del motor, el costo mostrado se redondea a pesos. |
| Referencias estimadas | El km/L se mide para el intervalo completo. Para estimar litros de un viaje se exige coincidencia de veh�culo, recorrido, carga y aire. El precio observado permite valorar esos litros. La recarga completa nunca se agrega como gasto de un solo viaje. |
| Completitud | N�mero de campos presentes sobre los revisados y lista de faltantes. Una cota inferior conserva lo conocido. La comparaci�n de costos totales modelados requiere dos resultados completos; el subtotal de comprobantes se compara por partida. |

El resumen de combustible deduplica intervalos, rechaza solapamientos contradictorios e informa media, desviaci�n est�ndar muestral, coeficiente de variaci�n y desviaci�n m�xima. Con menos de tres intervalos muestra �insuficiente�. Los viajes personales sirven para ensayar el m�todo. La muestra comercial, el error de llenado, el horizonte representativo de mantenci�n y los umbrales aprobados de [#12](https://github.com/ratatecuala/calculadora-de-costos-log/issues/12) siguen pendientes.
