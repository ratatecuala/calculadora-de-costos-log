# Aceptación independiente de A-89

Los 23 escenarios, ocho medidas por caso y cinco estados de cobertura por caso se cotejan contra el CSV aprobado de #59. El oráculo queda en Python. El proceso Node solo recibe los datos ficticios de entrada. El puente no carga el motor ni calcula importes. Quien implemente A-89 conectará el adaptador a las operaciones públicas de la aplicación. Las reglas y los importes de #59 permanecen en [la planilla y su documentación](../../docs/casos-dorados-a89/README.md).

## Ejecutar

1. Para comprobar el montaje, ejecutar `python docs/casos-dorados-a89/test_aceptar.py`.
2. Para comprobar los históricos con el lector actual, ejecutar `npm ci` y `npx --no-install vitest run tests/a89-historicos-aceptacion.test.ts`.
3. Cuando exista la implementación comercial, ejecutar `python docs/casos-dorados-a89/aceptar.py ruta/al/adaptador.mjs` desde la raíz con Node 22. El código de salida 0 requiere coincidencia completa, 1 significa error y 2 indica un adaptador ausente o una invocación incompleta.

La CI en este borrador verifica el montaje y la lectura histórica. La aceptación comercial sigue pendiente hasta ejecutar el paso 3 con un adaptador que observe el producto. Un doble empleado para probar el montaje no certifica el producto.

## Interfaz del adaptador

Las funciones pueden ser asíncronas. Usar los puntos de entrada reales, sin consultar la planilla, reproducir fórmulas ni completar un dato ausente. Mantener la salida estándar del proceso disponible para la captura.

| Función | Estímulo | Observación obligatoria |
|---|---|---|
| `evaluar(caso, comunes)` | Sesión nueva por fila. Los diez campos de entrada proceden de la planilla. `comunes` aporta combustible de $5.023 y ayudante de $15.000. | Objeto con `medidas` y `cobertura` leídas del producto. |
| `abrirHistorico(archivo)` | Ruta a una copia temporal de un original v1, v2 o v3. Leer mediante el repositorio/lector real. Instrumentar sus escrituras y llamadas de recálculo. | `sourceVersion`, `modalidad` explícitamente nula, `costEstimate`, `suggestedPrice`, `escrituras` y `recalculos`. El coordinador verifica también los bytes desde disco. |
| `iniciarSesion(inicial, entrada, comunes)` | Borrador detallado con P confirmado, gastos fijos y parámetros de GM-7. Se crea una sola vez. | Objeto con `elegirModalidad('S' o 'D')`, `confirmarPrecio()` y `observar()`. Este último devuelve `estado`, `medidas` y `cobertura` de la misma sesión. |

Los nombres de las ocho medidas son `operativo`, `antes_meta_costo`, `base`, `sugerido`, `saldo`, `excedente`, `antes_meta_resultado` y `sobre_meta`. Usar el importe mostrado al peso como texto, con los prefijos `>=` y `<=` si corresponde, o `NA` si la medida no se calcula. Una exclusión debe quedar visible en la cobertura incluso si la cifra coincide con una cota. Mantener las pérdidas con signo.

La cobertura se informa por `peajes`, `otros`, `W`, `CF` y `R`. Sus valores son `incluido`, `cero_inicial_sin_confirmar`, `cero_declarado`, `cero_comprobado`, `desconocido`, `no_aplicable`, `excluido_usuario` o `excluido_modalidad`. Los códigos compactos de entrada están definidos en el README de #59.

En GM-7, `estado` contiene `modo`, `P`, `fixedPerHour` y `priceNeedsConfirmation`. Se observa la misma sesión al abrir, al cambiar a simplificada, al reconfirmar el precio y al volver a detallada. Se comparan las cifras **y** la cobertura en las cuatro observaciones. Los históricos tienen importes guardados que permiten detectar un recálculo accidental. El lector anterior a A-89 puede carecer de la propiedad de modalidad; en el futuro adaptador se exige el valor nulo observado.

La salida de error usa índices desde cero dentro de `casos` (orden de filas del CSV), `historicos` (H1–H3) y `pasos` (orden de acciones).
