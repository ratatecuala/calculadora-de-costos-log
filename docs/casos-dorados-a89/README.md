# Casos dorados de costos y precios para A-89

Abre [la planilla](modalidades.xlsx) en Excel o LibreOffice. **Resultados** tiene 23 casos en CLP netos y **Entradas** permite cambiar un dato y ver su efecto. Los valores son ficticios. La [tabla CSV](modalidades.csv) contiene los resultados fijados para la revisión. Cambiar la planilla nunca actualiza esos esperados.

La auditoría de GPT y docs/32 §15–16 prevalecen sobre los rótulos anteriores de §6.3. En GM-1 el costo operativo es **$26.002**. Los **$39.402** incluyen la meta de remuneración del propietario y son la base para sugerir un precio. En GM-2, aunque se desconoce CF, el excedente operativo sigue siendo **$28.998**. [Diseño aprobado](../32-diseno-modalidades-a89.md) · [Auditoría](https://github.com/ratatecuala/calculadora-de-costos-log/pull/34#issuecomment-7183175628)

## Reproducir

Desde esta carpeta ejecuta `python verificar.py` con Python 3. El verificador usa fracciones exactas y comprueba los importes de la planilla CSV, los vectores de ampliación y las cotas. Los archivos viven fuera de la aplicación. Las fórmulas de Excel y las operaciones en Python parten de las mismas entradas documentadas. Los resultados esperados son literales que ninguno de los verificadores regenera. El uso de estos casos para evaluar el producto requiere ejecutar la futura implementación y cotejar sus salidas.

## Cómo leer cada medida

| Medida | Simplificada | Detallada |
|---|---|---|
| Costo operativo | D + W | D + W |
| Costo económico antes de la meta | No se calcula | D + W + CF |
| Base para sugerir precio | D + W + R | D + W + CF + R |
| Saldo tras desembolsos | P − D | P − D |
| Excedente operativo | P − D − W | P − D − W |
| Resultado antes de meta, incluidos los fijos | No se calcula | P − D − W − CF |
| Resultado sobre meta | P − D − W − R, sin fijos | P − D − W − CF − R |

D incluye combustible, peajes, ayudantes y otros desembolsos atribuibles. W es la reserva de desgaste. CF es la asignación de fijos. R es la remuneración que el propietario quiere obtener y P el precio elegido, independiente del sugerido. En GM-3 se comprueba D = 5.023 + 4.200 + 15.000 = 24.223, W = 1.779, CF = 3.350 y R = 13.400. La base es $42.752. Con margen de 15 % el cociente es $50.296,47… y el sugerido es $51.000. Con P de $55.000 quedan $25.648 antes de la meta y $12.248 sobre ella.

El sugerido es el techo a $1.000 de la base dividida por (1 − margen), más el recargo total en CLP **antes** del techo. Un margen de 15 % representa un porcentaje sobre el precio. El precio confirmado se conserva aunque cambie el sugerido. El CSV utiliza punto decimal y separador de coma.

| Entrada | Significado y salida esperada |
|---|---|
| Importe | Estimación puntual de lo incluido. Un resultado calculado con un valor comprobado conserva la naturaleza estimada del resto. |
| `?` | Partida desconocida, aplicable y no negativa. Se informa qué falta. Solo las medidas que dependen de ella pasan a cota. |
| `I0` | Cero inicial sin confirmar, tratado como desconocido. |
| `0D` / `0C` | Cero declarado expresamente / respaldado por comprobante. Igual valor, distinta procedencia. El comprobante del caso es ficticio. |
| `NA` en entradas | Partida no aplicable por estructura, p. ej., recorrido sin peaje acreditado por el itinerario. Conservar el motivo. |
| `X` | Exclusión expresa. En GM-5 se muestra «sin desgaste, excluido por ti». En simplificada CF se excluye por modalidad incluso si se conserva un valor. En EX-CF-excluido el aviso identifica la decisión del usuario y el resultado integral queda sin calcular. |
| `NA` en resultados | Medida sin cálculo en ese alcance. `>=` y `<=` indican piso de costo y techo de excedente respectivamente. |

Al presentar un monto puntual se toma el peso más cercano, con mitades hacia arriba. Para una cota inferior se usa piso y para una superior techo, también en pérdidas. Se redondea al final. Con recargo $248 y margen cero la base de $42.752 da $43.000 exactos. Un peso más de recargo da $44.000. El límite de margen de 80 % está incluido. −0,01 %, 80,01 % y 100 % se rechazan. El precio elegido inferior al costo produce resultados negativos que conservan su signo.

## Transiciones, históricos y KPI

- **GM-6.** El mismo peaje numéricamente nulo tiene cuatro lecturas distintas. El adaptador debe mantener las etiquetas de procedencia y cobertura de la fila. Un total puntual con exclusión siempre muestra lo excluido.
- **GM-7.** En [los pasos del cambio de modalidad](historicos-y-cambio.json) un precio de $55.000 previamente confirmado pasa por detallada, simplificada y detallada. El operador lo reconfirma en la simplificada. Cada cambio de alcance pide confirmación de nuevo. Se mantienen P, el valor guardado de CF/h, la procedencia de los datos y las exclusiones manuales. El costo vuelve al peso original. El borrador es editable. Las cotizaciones ya emitidas conservan sus valores históricos.
- **GM-8.** Con P constante y sin cambiar las demás entradas, completar un costo no negativo mantiene o eleva el piso de costos y mantiene o reduce el techo de excedentes que lo incluyen. Hay igualdad si se completa con cero. Incluir CF conserva el excedente operativo. No se compara el resultado de dos precios elegidos distintos.
- **H1, H2 y H3.** El mismo archivo contiene tres registros ficticios de entrada. H1 conserva la forma v1 sin `schemaVersion`. H2 y H3 tienen montos guardados deliberadamente fuera del redondeo actual. Abrir cada registro en modo de solo lectura, capturar sus bytes antes y después y contar escrituras y llamadas al cálculo. Se esperan cero en ambos contadores, `modalidad: null`, la versión de origen y los importes originales. La prueba futura deberá observar tanto la vista como el registro persistido.
- **KPI de #12.** Referencia detallada ficticia del mismo alcance: $25.000 de gastos, $2.000 de desgaste y $3.000 de fijos, estos últimos asignados desde periodo. El costo pronosticado de $29.352 difiere en −$648, magnitud $648, o −2,16 % respecto de $30.000. Cambiar R de $13.400 a $0 o cambiar P deja ese error intacto. En simplificada se comparan solo D + W en ambos lados. Una referencia parcial identifica las partidas comparables. Con denominador cero no hay porcentaje. Estas cifras ilustran el método y carecen de valor como medición del piloto.

## Cotejar una implementación posterior

`python cotejar.py captura.json` exige cuatro secciones. La sección cobertura contiene por ID los estados observados de peajes, otros, W, CF y R según la correspondencia de coverage() en el cotejador. `medidas` contiene un objeto por ID de la planilla con los ocho campos de salida como texto, incluidas sus cotas y `NA`. `historicos` contiene H1–H3 con la forma de `esperado` y `bytesIntactos` calculado comparando los bytes reales. `cambioModo` contiene los cuatro pasos observados, en orden, con los mismos campos del contrato. El verificador identifica cada diferencia y devuelve un código de salida distinto de cero. El evaluador del producto debe generar esta captura observando el producto sin copiar los valores esperados.

[Contratos y casos B-1 a B-6](costos-personalizados.md). La revisión de GPT y la autorización del propietario para cambiar fórmulas comerciales quedan pendientes.
