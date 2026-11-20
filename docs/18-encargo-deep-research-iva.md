# 18 · Encargo para GPT Deep Research: IVA en cotizaciones de fletes (#16)

**Fecha:** 18-11-2026 · **Decisión:** A-54 (el propietario eligió validar la tributación con **GPT Deep Research** antes de implementar la opción B de [16](16-iva-cotizaciones.md)).
**Quién lo ejecuta:** el propietario, en GPT Deep Research (regla de investigación de [AGENTS.md](../AGENTS.md) §1.6). Claude solo prepara el encargo y, después, contrasta el informe con el código y los documentos.
**Qué no autoriza:** implementar reglas tributarias, cambiar `data/tax-rules.json` a `verified: true` ni modificar textos legales. Eso requiere una decisión posterior del propietario con el informe a la vista.

## Cómo usarlo

1. Copiar el bloque «Encargo» completo en GPT Deep Research.
2. Guardar el informe resultante y pegarlo en el PR #34 o en el issue #16. No pegar datos personales ni de clientes.
3. Pedir a Claude que lo contraste con [16](16-iva-cotizaciones.md), proponga los cambios concretos y marque qué queda pendiente de un contador.

## Encargo

```text
Contexto: herramienta web gratuita (Chile) para que transportistas independientes y pequeñas
empresas de fletes livianos (camionetas, furgones, camiones livianos) calculen costos y envíen a
sus clientes una COTIZACIÓN (presupuesto comercial, no documento tributario). Necesito saber cómo
debe presentarse el IVA en esa cotización según el tipo de transportista y de cliente.

Reglas de la investigación:
- Usa fuentes oficiales primarias: sii.cl (normativa, circulares, oficios/jurisprudencia
  administrativa, preguntas frecuentes), bcn.cl/leychile.cl (DL 825, DL 824, Ley 21.420,
  Ley 21.210, Ley 19.496) y sernac.cl. Cita URL y fecha de consulta en cada afirmación.
- Distingue: (a) texto legal vigente, (b) criterio administrativo del SII, (c) interpretación.
- Si algo no está resuelto en fuentes oficiales, dilo explícitamente; no lo completes con supuestos.
- Indica cambios vigentes a noviembre de 2026.

Preguntas:
1. ¿El transporte terrestre de carga nacional está afecto a IVA (19 %) tras la Ley 21.420?
   Cita el hecho gravado (DL 825 arts. 2 N° 2 y 8) y las exenciones del art. 12 relevantes
   (transporte internacional, exportación). ¿La exención para quien «trabaja solo» (art. 12 E N° 12)
   alcanza a quien explota vehículos de carga?
2. Por tipo de transportista —persona natural con inicio de actividades en renta presunta (art. 34
   LIR); régimen Pro Pyme (art. 14 D); régimen general; persona sin inicio de actividades; giro
   exento—: ¿está afecto a IVA?, ¿qué documento debe emitir (factura electrónica, boleta
   electrónica, otro)?, ¿puede usar boleta de honorarios para fletes?
3. Si un cliente empresa contrata a una persona sin inicio de actividades, ¿corresponde boleta de
   terceros (BTE) o factura de compra? ¿Qué pasa con el IVA?
4. ¿Hay retención de IVA o cambio de sujeto aplicable al flete (en general o en rubros/listas
   específicas del SII)?
5. Al consumidor final, ¿la Ley 19.496 (art. 30) exige informar el precio total con impuestos
   incluidos también en un presupuesto o cotización? Entre empresas, ¿hay alguna norma sobre
   mostrar neto + IVA en un presupuesto?
6. ¿Cuál es la regla oficial de redondeo del IVA en factura y boleta electrónica (por documento o
   por línea; mitad hacia arriba)?
7. ¿Cuándo nace el débito fiscal en un servicio de flete (prestación, facturación, pago)? ¿Cambia
   con un anticipo pagado al aceptar la cotización?
8. ¿Qué leyendas conviene (o se exige) incluir en una cotización para no confundirla con un
   documento tributario? ¿Alguna norma prohíbe o exige textos específicos?
9. Servicios accesorios (peonetas, embalaje, espera): ¿mismo tratamiento de IVA que el flete
   (servicio único) o partidas distintas?
10. Para el cálculo de costos (no de la cotización): ¿qué transportistas pueden usar el IVA del
    diésel como crédito fiscal y recuperar el Impuesto Específico al diésel? Condiciones y fuente.

Entrega:
- Tabla por tipo de transportista: régimen, ¿afecto a IVA?, documento, cómo presentar el precio en
  la cotización a un cliente empresa y a un consumidor final.
- Lista de normas y criterios con URL oficial y estado (texto legal / criterio SII / interpretación).
- Puntos que requieren confirmación de un contador.
```

## Qué se hará con el informe

| Paso | Responsable | Autorización |
|---|---|---|
| Contrastar el informe con [16](16-iva-cotizaciones.md) §7 y el código (`src/engine/tax.ts`, `data/tax-rules.json`, `QuoteView.tsx`, `clientQuote.ts`) | Claude | No requiere (documental) |
| Proponer los cambios concretos de la opción B (perfil tributario, tipo de cliente, leyendas, redondeo) | Claude | No requiere (propuesta) |
| Implementar la opción B y marcar reglas como `verified: true` | Claude | **Requiere aprobación del propietario** (D-IVA-1 a D-IVA-10 de docs/16 §7.5) |
| Confirmar con un contador los puntos que el informe deje abiertos | Propietario | — |

Mientras tanto rige **A-51**: «Precio total» y la leyenda «Esta cotización no es factura ni boleta.», como estado transitorio de staging.
