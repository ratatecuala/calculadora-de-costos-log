# 01 · Alcance funcional

Estado: **aprobado** en las rondas de planificación técnica, salvo lo marcado como _pendiente_.

## Qué construimos

Una aplicación web gratuita, sin registro, para **Chile**, en **pesos chilenos (CLP)**, con dos modos que comparten el mismo motor de cálculo:

| Modo | Pregunta que responde | Salidas principales |
|---|---|---|
| **Soy fletero** | ¿Cuánto me cuesta, cuánto cobro y cuánto gano? | Dinero de bolsillo, desgaste, parte de gastos fijos, sueldo objetivo (meta), ganancia adicional, precio sugerido y resultado sobre el precio cobrado |
| **Necesito transportar algo** | ¿Cuánto cuesta y qué me conviene? | Costo con vehículo propio, comparación de categorías aptas y evaluación de una cotización externa real |

**Sin vehículo propio** en el segundo modo, se muestra un _"costo mínimo de operar"_ por categoría, que **no es un precio de mercado**. El texto exacto está pendiente (#11).

### Vocabulario de los fleteros (referencia funcional)

| Término | Cómo entra al cálculo |
|---|---|
| Distancia | Ruta calculada o km manual |
| Tiempo | Conducción más carga y descarga |
| Ayudantes | Cantidad × tarifa (por servicio, por hora o sueldo fijo) |
| Pisos | Como **tiempo** de carga y descarga ingresado. Opcionalmente, un recargo por piso definido por el fletero. **Sin factor por defecto.** |
| Dificultad de carga | Como tiempo y número de ayudantes |
| Embalaje | Material comprado (caja) y tiempo |
| Urgencia | **Recargo sobre el precio** definido por el usuario. No es un costo, salvo que genere costos reales. |

## Alcance de la v1.0

**Incluye:**
- Los dos modos, con las cinco medidas del motor (ver [03](03-motor-de-costos.md)).
- Ruta con origen, **hasta 2 paradas intermedias**, destino y regreso opcional.
- Botón **"Abrir / verificar ruta en Google Maps"** (obligatorio).
- **Modo manual** completo cuando falla o se agota una API.
- Precio de combustible desde la CNE con fecha, editable.
- Peajes: **ingreso manual siempre** más la automatización que se apruebe (#10).
- Comparador de categorías con **4 estados de compatibilidad**.
- Evaluador de cotización externa con la fórmula de tercerización.
- Estados de completitud ("costo parcial") y etiquetas de procedencia.
- Perfiles guardados **solo en el navegador**, con exportar e importar.
- Resultados reproducibles (versiones de fórmulas y datos).
- Página "Cómo calculamos", vista imprimible y textos legales.
- Protecciones contra cobros, abuso y fuga de datos.

**Excluye de la v1.0:**
- Cuentas de usuario e historial en la nube.
- Mapa incrustado. Se evalúa después de la v1.
- Más de 2 paradas y optimización del orden de paradas.
- Factores de consumo según carga y de velocidad según categoría, hasta tener datos de calibración.
- PDF con diseño propio. Se usa la impresión del navegador.
- Ruteo específico para camiones (Google no lo ofrece en Chile).
- Marketplace, IA, GPS, integración con ERP, app nativa, multi-país.

## Preparación para el futuro marketplace (sin construirlo)

- Los esquemas de datos (`TripRequest`, `CargoSpec`, `VehicleCapability`, `Quote`) llevan `schemaVersion` y están documentados.
- No se construye backend, publicación de vehículos, *matching* ni pagos.
- **No se inventan ofertas ni precios de transportistas.**

## Reglas transversales (aprobadas)

1. **Ninguna estimación se presenta como exacta.** Los rangos se muestran solo donde existe una base. En los demás casos se indica un valor con su procedencia.
2. **Un dato faltante nunca se reemplaza por 0** sin que el usuario lo declare. Si falta un componente, el resultado se titula **"Costo parcial"**.
3. **Los valores por defecto** solo se usan con fuente citada y la etiqueta "PREDETERMINADO, no calibrado", y son editables.
4. **Nunca se usan las palabras "seguro" ni "recomendado"** para una alternativa de vehículo.
5. La **remuneración del dueño** es una **meta**, no un pago realizado.
