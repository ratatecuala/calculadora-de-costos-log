# Ensayo interurbano de dos días

Todos los valores son **SIMULADOS**. El mismo furgón recorre 240 km entre el 10 y el 11 de noviembre de 2026. El intervalo incluye ciudad y autopista, con carga parcial y el aire acondicionado apagado. Un antecedente separado del 7 al 8 de noviembre termina en el km 1120 y aporta 120 km / 15 L = 8 km/L al presupuesto sellado el día 9.

| Día | Odómetro (km) | Carga | Litros | Precio ficticio (CLP/L) |
| --- | ---: | --- | ---: | ---: |
| 10 | 1120 | Lleno inicial | 35 | 1100 |
| 10 | 1160 | Parcial | 4 | 1200 |
| 11 | 1260 | Parcial | 8 | 1400 |
| 11 | 1360 | Lleno final | 12 | 1500 |

El intervalo posterior aporta una sola muestra de **240 km / 24 L = 10 km/L**. Las compras desde el lleno inicial, sin contar ese primer llenado, suman **34.000 CLP**. El contrato de #55 guarda los litros por recarga y un precio de referencia por viaje. Los precios individuales de las cuatro compras figuran en el libro auxiliar ficticio del ensayo. La asignación por viaje usa su precio de referencia y se mantiene separada de las compras.

| Día y clase del viaje | Km | Presupuesto a 8 km/L | Litros asignados desde el intervalo | Referencia de combustible |
| --- | ---: | ---: | ---: | ---: |
| 10 · urbano | 20 | 2,5 L | Sin asignación | Sin asignación |
| 10 · mixto | 80 | 10 L | 8 L | 9600 CLP a 1200 CLP/L |
| 11 · interurbano por autopista | 100 | 12,5 L | Sin asignación | Sin asignación |
| 11 · mixto | 40 | 5 L | 4 L | 6000 CLP a 1500 CLP/L |

Los dos viajes de una sola clase conservan la medida global del estanque. El informe identifica la incompatibilidad con el intervalo mixto y deja sin calcular los litros atribuibles a esos viajes. En los cuatro viajes falta un comprobante directo de gasto. El informe mantiene pendiente la comparación económica integral.

## Comprobaciones

1. Agrupar cuatro fichas del mismo intervalo produce tres repeticiones y una muestra de validación. El antecedente constituye una muestra distinta de calibración. En ambos grupos la desviación muestral queda vacía.
2. Las resoluciones de distancia de los dos viajes mixtos son 1 km y 0,1 km. Sus incertidumbres ficticias son ±0,5 y ±0,05 km. Las del intervalo son ±1 km y ±0,25 L. Las pruebas verifican los extremos calculados con esas entradas, sin convertirlos en niveles de confianza. Si falta la incertidumbre del viaje o la de los litros, el rango queda vacío. Si la distancia mínima del intervalo llega a cero, el límite superior queda abierto.
3. El ensayo comprueba el rechazo de un intervalo de calibración presentado como validación, de un corte superpuesto, de un viaje que termina fuera de fecha y de dos versiones contradictorias de las cargas del mismo intervalo.
4. Eliminar el lleno final, dejar desconocidos los litros de una parcial o declarar el registro incompleto impide calcular el rendimiento. Un odómetro final de viaje ausente bloquea la asignación al viaje. Un precio desconocido permite conservar los litros estimados y deja sin calcular el monto en pesos.

Para reproducir con las dependencias del proyecto instaladas, desde la raíz ejecuta:

```sh
npm test -- tests/campo-dos-dias.test.ts
```

Los seis casos ejercitan las funciones públicas de #55 sobre la plantilla del proyecto. Los precios y las incertidumbres del ensayo describen únicamente sus datos ficticios. La aprobación del objetivo económico y los criterios estadísticos siguen pendientes en [#12](https://github.com/ratatecuala/calculadora-de-costos-log/issues/12).
