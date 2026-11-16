# 04 · Fuentes de datos y restricciones de uso

Convención: **[H]** hecho verificado (con fuente y forma de verificación) · **[S]** suposición pendiente de verificar (con el issue que la verifica).

> La mayoría de los hechos se obtuvieron mediante un buscador que resume páginas oficiales, el 16-11-2026, porque la red de la sesión de planificación no permitía leerlas directamente. Las cifras de Google marcadas "ChatGPT" fueron leídas directamente en la tabla oficial. **Antes de implementar, cada fuente se confirma con lectura directa** en su issue de investigación.

## Google Maps Platform

### Precios (tabla oficial, verificada por ChatGPT el 11-11-2026)

| SKU | Gratis al mes | Precio por 1.000 adicionales |
|---|---|---|
| Compute Routes Essentials | 10.000 | 5 USD |
| Compute Routes Pro (tráfico, 11–25 paradas) | 5.000 | 10 USD |
| Autocomplete Requests | 10.000 | 2,83 USD |
| Place Details Essentials | 10.000 | 5 USD |

- [H] El SKU lo define la característica más cara de la solicitud. El cálculo de **peajes** es del SKU **Enterprise**.
- [H] El modo camión (`TRUCK`) existe solo en EE. UU. y Japón. **No está disponible en Chile.**
- [H] Routes acepta **direcciones en texto** y entrega `geocodingResults` con `partialMatch`. Google recomienda usar place ID por precisión.
- [S] Que la geocodificación interna de Routes no tenga cargo adicional (#19).
- [S] Que Google calcule peajes en Chile (#21).
- [H] Las alertas de presupuesto **no detienen** el cobro. Solo las **cuotas diarias** ponen un tope duro, y se aplican con retraso.

### Restricciones de uso (vía buscador; lectura directa en #15)

- [H] No se pueden mostrar resultados de Routes en **mapas que no sean de Google**. Si se muestran sin mapa, se exige atribución.
- [H] Está prohibido **exportar o extraer** contenido de Google para usarlo fuera de los servicios (los ejemplos incluyen resultados de rutas y distancias). El caché solo se permite donde lo autorizan los términos específicos.
- [H] Las **coordenadas** se pueden guardar hasta 30 días. Los **place ID** se pueden guardar indefinidamente.
- **Postura conservadora aprobada mientras se resuelve #15:**
  - no se guardan ni exportan km, duración ni polilíneas de Google;
  - la calibración usa el odómetro como dato propio;
  - las estimaciones de Google se conservan un máximo de 30 días y después solo quedan métricas agregadas.

## Combustibles: Comisión Nacional de Energía (CNE)

- [H] Existe una API oficial (`api.cne.cl`, documentada en `apidocs.cne.cl`) con autenticación Bearer mediante un token obtenido tras registrarse.
- [S] El token expira. Faltan por confirmar los términos de uso, la licencia, la frecuencia de actualización y los límites (#20).
- [H] Bencina en Línea es la plataforma oficial de la CNE. Los distribuidores deben informar sus precios.
- Uso previsto: precio de referencia por región o comuna, con **fecha visible** y **editable** por el usuario.

## Peajes y TAG

- [H] El MOP (Dirección General de Concesiones) publica fichas de tarifas por concesión, en PDF.
- [H] Las autopistas urbanas usan las bandas **TBFP** (fuera de punta), **TBP** (punta) y **TS** (saturación), y distinguen días laborales de sábados.
- [H] Las tarifas se reajustan en enero (en promedio +3,4 % en 2026). En 2026 el MOP negociaba rebajas con las concesionarias, así que **pueden cambiar durante el año**.
- [H] No se encontró ninguna API pública oficial de tarifas.
- [S] Existen proveedores comerciales que dicen cubrir Chile; su calidad y precio están sin verificar (#21).
- Solución: **pendiente** (#10). El ingreso manual existe siempre.

## Rendimientos vehiculares

- [H] consumovehicular.cl es el portal oficial del etiquetado vehicular del Ministerio de Energía. Cubre vehículos livianos y medianos y usa el ciclo WLTC desde octubre de 2025.
- [S] Si permite descarga o reutilización de sus datos (#22).
- [H] No existe una fuente oficial de rendimiento para camiones. Se usará el dato del usuario o un rango por categoría con fuente, rotulado "no calibrado".

## Hosting

- [S] Plan gratuito de Cloudflare Workers: 100.000 solicitudes al día y 10 ms de CPU, sin restricción comercial (fuente secundaria; #18).
- [H] El plan Hobby de Vercel es solo para uso personal no comercial (fuente secundaria). Por eso no se usa.

## Marco legal relevante

- [H] La Ley 21.719 de protección de datos entra en vigencia el 1-12-2026, salvo que se apruebe el proyecto de postergación que estaba en trámite en noviembre de 2026 (#17).
- [S] IVA del flete, crédito fiscal, recuperación del impuesto al diésel, licencias por peso bruto vehicular y restricciones de circulación (#16).
