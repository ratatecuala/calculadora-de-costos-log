# C1 · Notas del catálogo piloto (2026-11-24)

**Estado:** CANDIDATOS PARA REVISIÓN — no cargar en producción.

## 1. Limitación principal: ninguna página pudo abrirse

El proxy de red de la sesión bloqueó todos los hosts probados con WebFetch o `curl`: consumovehicular.cl, sii.cl, bcn.cl, toyota.cl, anac.cl, mitsubishi-motors.cl y web.archive.org (ver [fuentes.md](fuentes.md) §A). Todos los valores provienen de **fragmentos o resúmenes del buscador web**. Por eso:

- **Ningún campo está marcado VERIFICADO.** Todos los valores son **SECUNDARIO**.
- La nota de cada fuente distingue dos casos:
  - «Fuente oficial chilena vista SOLO como fragmento»: marca, importador o distribuidor. Puede elevarse a VERIFICADO tras abrir la página y confirmar el valor.
  - «Fuente secundaria chilena»: Autocosmos o prensa.
- Recomendación: repetir la extracción con los hosts oficiales habilitados en la red de la sesión, o mediante revisión humana.

## 2. Clasificación oficial liviano / mediano / pesado

Ninguna norma pudo leerse en su texto original (bcn.cl y sii.cl están bloqueados). La tabla resume lo que indicaron los fragmentos.

| Criterio | Umbral (PBV) | Fuente (según fragmento) | Estado |
|---|---|---|---|
| Vehículo motorizado **liviano** (emisiones) | < 2.700 kg | DS 211/1991 MTT, «Normas sobre emisiones de vehículos motorizados livianos» (BCN idNorma=11031; copia en anac.cl) | POR VALIDAR |
| Vehículo motorizado **mediano** (emisiones/eficiencia) | ≥ 2.700 y < 3.860 kg | SII cita el «Decreto N°54»; Ministerio de Energía (informe EEE medianos 2026) usa el mismo rango. Un fragmento menciona el DS 241/2014 MTT. | POR VALIDAR: número y fecha del decreto sin confirmar |
| Vehículo motorizado **pesado** (emisiones) | ≥ 3.860 kg | Norma de emisiones para pesados (BCN idNorma=8364) | POR VALIDAR |
| Camión **liviano / mediano / pesado** (estadística de mercado ANAC) | 2.701–6.350 / 6.351–14.968 / ≥ 14.969 kg | Anuario ANAC 2012. Es una clasificación gremial, no una norma. Los informes mensuales ANAC 2025–2026 siguen usando las tres categorías, pero el rango vigente no se confirmó. | POR VALIDAR |

**Conflicto para la decisión del propietario.** Si «mediano» se toma por la norma de emisiones (2.700–3.860 kg), quedarían como `fuera_de_piloto_mediano` casi todas las camionetas y furgones grandes del piloto, además de Porter, Frontier y HD35:

- Maxus T60 (2.850 kg), L200 (2.760), Ranger (3.100) y HD35 (3.500).
- Probablemente también Hilux 4x2 (la ficha 2021 indica 2.810 para DX), Porter y Frontier (3.050–3.390), Boxer y Sprinter (PBV no obtenido).

Por otro lado, esa norma dejaría el Canter 613 (5.700 kg) como «pesado» y no como mediano.

Como el piloto tiene un segmento `camionLiviano` y la instrucción apunta a un futuro `camionMediano`, se aplicó la **tabla de camiones de ANAC** solo a los camiones. Con ella, ningún camión del piloto es mediano. Se excluyeron como `fuera_de_piloto_mediano` el **Hyundai HD65** (6.500 kg) y el **Fuso Canter 815** (7.500 kg). **No se reclasificó** ninguna camioneta ni furgón. Esta elección es del agente y requiere ratificación.

Valores de segmento usados: `camioneta`, `furgon` y `camionLiviano`. Estos identificadores también son PROPUESTOS.

## 3. Método para acreditar presencia en Chile

- Se exigió que la versión o el modelo estuvieran **listados en el sitio chileno** de la marca, del importador o del distribuidor oficial (Kaufmann en Fuso y Mercedes-Benz Vans; Hyundai Camiones & Buses en HD35), o en el catálogo chileno de Autocosmos del año 2024–2025.
- **No se encontraron ventas por modelo ni por versión** de furgones ni de camiones livianos. El anuario ANAC 2026 y los informes mensuales están en anac.cl, que está bloqueado. Los fragmentos solo mostraron totales por segmento, por ejemplo «camiones livianos 591 u. en el primer semestre de 2026».
- Las únicas cifras por modelo vienen de **prensa que cita a ANAC** y son de nivel modelo, no versión:
  - Hilux: modelo más vendido de 2025, con 8.548 unidades (Chocale).
  - L200: líder a junio de 2025, con 4.296 unidades (Meganoticias).
  - Partner: líder de comerciales a mayo de 2025, con 3.015 unidades (Pauta).
- **No se construyó ningún ranking de popularidad.**

## 4. Reglas aplicadas

- No se estimó ningún valor. Si las fuentes se contradecían o el valor no podía asignarse a una versión, quedó `null` y se explicó en la nota. Casos: PBV de Porter y Frontier, carga útil de Navara, Hiace y X200, PBV y carga útil de Sprinter, y peso en vacío de la Hilux SR.
- **No se derivó ninguna carga útil.** En L200, T60, Ranger, Canter 613 y HD35 la carga útil está publicada en la fuente y coincide con PBV − peso en vacío; la nota lo indica. En la N400 se publica 720 kg; el peso de Autocosmos (1.200 kg) no se usó para derivar nada.
- No se usaron datos de otros mercados: fichas de México, Colombia, Argentina, España, Perú o Brasil.
- El «largo carrozable» de chasis (Porter 3.110 mm, HD35 3.400 mm) **no se cargó** como `cargo_length_mm`, porque no es una medida interior de caja. Queda como dato candidato para un campo específico.
- Las medidas de caja de la Maxus T60 (1.485×1.510×530 mm, de una nota de la marca a nivel modelo) no se cargaron para la versión DX.

## 5. Vacíos (campos `null`)

De 225 campos técnicos (15 versiones × 15 campos), **144 quedaron en `null`**:

- **Puertas** (ancho y alto): 15 de 15 sin dato.
- **Año final:** 15 de 15. **Año inicial:** 11 de 15.
- **Medidas interiores de carga:** largo 13, ancho 14 y alto 13 sin dato.
- **Consumo (km/l):** 9 sin valor de referencia. Ninguno proviene de consumovehicular.cl, que está bloqueado. Solo la Ranger indica el ciclo, «CEE, homologado MTT». Hiace cita 3CV a través de prensa.
- **PBV:** 9 sin dato. **Volumen:** 9. **Peso en vacío:** 7. **Carga útil:** 6.

## 6. Pendiente de verificar

1. Abrir cada ficha oficial listada en fuentes.md §B y confirmar valor por valor. Después se puede elevar la confianza a VERIFICADO.
2. Consultar consumovehicular.cl para obtener el consumo homologado y su ciclo en las 15 versiones.
3. Confirmar en LeyChile el texto y el número de los decretos de clasificación (DS 211/1991, DS 54/1994 y la norma de pesados), además de la tabla vigente de camiones de ANAC.
4. Obtener los informes ANAC por modelo para furgones y camiones livianos.
5. Revisar los términos de uso de cada sitio antes de copiar datos (ver fuentes.md).
6. Datos con conflicto interno que conviene revisar:
   - Partner: consumo 22,0 vs 19,0 km/l y potencia 100 vs 75 hp.
   - Boxer: carga útil 1.535 kg vs «hasta 1,3 t».
   - N400: volumen 3,1 vs 4,4 m³ y caja de 5 vs 6 velocidades.
   - Navara: 14,4 vs 14,1 km/l.
   - Hiace: carga útil 1.025 vs 1.155 kg y peso 2.420 vs 2.200 kg.
   - Ranger: el resumen del buscador advirtió que la página podría mezclar versiones.
7. La L200 cargada corresponde a la **ficha de 2020**, una generación anterior. La L200 Euro 6C vigente quedó fuera porque su ficha no permite asignar valores por versión.
