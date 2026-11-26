# 30 · Segunda ronda de fase 0 — consolidación y revisión GPT (26-11-2026)

**Estado:** seguimiento documental. No concede nuevas autorizaciones de código, fórmulas, workflows, migraciones, flags, APIs, servicios, despliegues, integración de PR ni piloto. A-88 ejecutada en rama; A-89 aprobada como dirección de producto. Los criterios #12 permanecen pendientes.

## 1. Evidencia y auditorías

| Entrega | Evidencia | Estado |
|---|---|---|
| Deep Research TAG #21 | Informe del 26-11, recibido en el chat del proyecto | Investigación aceptada, integración bloqueada |
| Codex #55 | [61e5214](https://github.com/ratatecuala/calculadora-de-costos-log/commit/61e5214), [segunda revisión GPT](https://github.com/ratatecuala/calculadora-de-costos-log/pull/55#issuecomment-7182451643) | Correcciones principales verificadas por inspección; 23/23 Node reportadas; pendientes A-89, versión e incertidumbre, npm/Vitest/build |
| Codex #56 | [8b7c446](https://github.com/ratatecuala/calculadora-de-costos-log/commit/8b7c446), [revisión GPT](https://github.com/ratatecuala/calculadora-de-costos-log/pull/56#issuecomment-7182452078) | 9/9 Python reportadas; pendiente corregir expectativa M3 sin M4 en verificación SQL y ejecutar restauración Bash completa en PostgreSQL 17 |
| Claude A-88 | [afbe740](https://github.com/ratatecuala/calculadora-de-costos-log/commit/afbe740), [CI](https://github.com/ratatecuala/calculadora-de-costos-log/actions/runs/45753498315/job/139686567205), [revisión GPT](https://github.com/ratatecuala/calculadora-de-costos-log/pull/34#issuecomment-7182498521) | v3 implementada; CI verificada con 716 unitarias, build, E2E manual, A-83/I-2 y nuevo ensayo v3 de 3 y 7 migraciones, sin migración nueva en dichos escenarios. Sin prueba real de staging. Diseño móvil propuesto, no implementado |

GPT no ejecutó pruebas independientes. Ningún PR fusionado; no se modificaron fórmulas. La CI verde de #34 no certifica las ramas #55 y #56.

## 2. TAG y peajes #21

Síntesis del informe de Deep Research; consulta reportada 26-11-2026. Fuentes: [DGC Peajes y Pórticos](https://concesiones.mop.gob.cl/peajes-y-porticos/), [Puntos de Cobro ArcGIS](https://rest-sit.mop.gob.cl/arcgis/rest/services/CCOP/ELEMENTOS/MapServer/9), [tarifas Autopista Central 2026](https://concesiones.mop.gob.cl/uploads/sites/4/2026/03/AUTOPISTA-CENTRAL.pdf), [Google Routes toll fees](https://developers.google.com/maps/documentation/routes/calculate_toll_fees), [RouteModifiers](https://developers.google.com/maps/documentation/routes/reference/rest/v2/RouteModifiers), [pricing](https://developers.google.com/maps/billing-and-pricing/pricing). No se repitió investigación externa.
- DGC publica tablas por concesión y vigencias, con cambios no necesariamente anuales. Capa geográfica oficial documentada, no extracción completa probada ni licencia de redistribución comprobada. No se identificó API tarifaria oficial completa ni API pública consolidada de movimientos TAG personales.
- Categoría contractual varía por concesión: ejes/remolque/clase, dirección, hora local, día y vigencia. Versionar tarifas, identificar fuente y respetar redondeo efectivo por concesión; no inferir cero. Google monetario Chile no demostrado; no comerciales según documentación. No habilitar facturación. Escenarios Google Enterprise del informe: 100/1.000/10.000 usuarios, 10 consultas por usuario/mes: USD 0/135/1485, condicionados a precios y supuestos, sin garantía de cobertura.
- Propuesta: manual asistido → catálogo versionado y selección de pórticos → detección automática solo tras validación y autorización. No obligar al usuario simplificado a enumerar pórticos; conservar importe manual y advertencias. Importación voluntaria de cartola, sin credenciales ni scraping, formatos y conciliación pendientes. Distinguir tránsito, factura, deuda y pago; deduplicar sin eliminar pasos legítimos; validar omisiones, falsos ceros y diferencias en CLP frente a evidencia real.
- Licencia, extracción, precisión, formatos, redondeo y cobertura pendientes. #21 abierto. Informe señala Ley 21.855 y nueva fecha de vigencia de Ley 21.719 (15-10-2027); actualizar referencia legal tras comprobar texto primario en #17, sin relajar privacidad.

## 3. Snapshot v3: siguientes ajustes propuestos

D-A1: diferir unificación v2 carga y economía mientras flags apagadas. D-A2: mostrar procedencia al usuario junto al diseño A-89 (fuente, estimación, exclusiones y faltantes). D-A3: modalidad explícita y exclusiones en futura versión, sin modificar históricos. Revisar origen registrado por evento frente a inferencia por igualdad, fecha real del dato, casos Unicode 3/4 bytes y límites 11000/16384; revisión de retención A-38/#15 por inferencias indirectas y validación en copia/lectura. No considerar una prueba local como aprobación de staging.

## 4. Herramienta privada móvil — decisiones recomendadas, NO aprobadas

- D-1: entorno experimental aislado y protegido; comparar acceso local para ensayo y publicación privada estática sin credenciales ni conexión a Supabase. Una URL oculta o flag no autentica. Despliegue/flag requieren aprobación expresa; no usar staging actual antes de condiciones de seguridad correspondientes.
- D-2: IndexedDB local, copia exportable/importable y recordatorio configurable, prueba de persistencia real y borrado; sin nube ni datos de terceros.
- D-3: foto opcional, no retener por defecto, solo si se elige, local sin metadatos y minimizada.
- D-4: perfil de medición independiente; TRIP para distancia, odómetro absoluto para vincular intervalo cuando disponible. No solicitar datos innecesarios ni forzar equivalencia TRIP/odómetro.
- D-5: CSV compatible con Excel y paquete CLI/backup verificable; sin biblioteca XLSX adicional.
- D-6: avisos no bloqueantes, validar coherencia física, mostrar incertidumbre y última copia; umbrales económicos no inventados. Nunca operar durante conducción.
- D-7: alcance por modalidad A-89: simplificada sin exigir gastos fijos anuales; detallada con gastos de periodo y asignación. No confundir exclusión con cero, desconocido con no aplicable ni referencia estimada con costo medido. Objetivo 10 % acordado; criterio operativo, distribución, muestra y umbral por componente pendientes. Calibración y validación reservadas; incertidumbre y repetición dentro de intervalo reportadas. Cargas parciales habituales, lleno a lleno solo controlado/opcional; sin saldo inicial/final no inferir litros consumidos. Chery metodológico, no evidencia comercial.

## 5. Siguiente ronda — propuesta para aprobación

| Responsable | Tarea | Dependencia |
|---|---|---|
| Codex | #55: alcance por modalidad, huellas/versiones, incertidumbre; extraer contrato puro común y compatibilidad CLI/navegador, importar sin sobrescribir | Definir #12 con GPT; no duplicar motor |
| Codex | #56: distinguir M3/M4 en verificaciones y ejecutar suite real ficticia, preservar invariantes | Entorno PG17 + age; coordinar archivo scripts/verificar-restauracion.sql |
| Codex (o responsable único CI asignado) | CI para #55/#56 dirigida a ramas de desarrollo, runners estándar gratuitos, read-only y sin secretos/servicios remotos | Autorización específica de workflow; evitar duplicar CI #34 |
| Claude | Ajustes de v3 (revisión anterior) | Frente propio sin tocar motor ni archivos de Codex |
| Claude | Diseño A-89 en UX y contrato; implementación de herramienta móvil en rama aislada cuando se autorice, interfaz sobre contrato de Codex | No duplicar cálculo; construir UI/almacenamiento con fixtures mientras se estabiliza contrato; integración posterior |
| Deep Research | Próxima prioridad: rendimiento real y desgaste por km de vehículos livianos; métodos con cargas parciales y evidencia, catálogo C-1; eventualmente benchmark 0C | Nuevo encargo del propietario; no inventar promedios |
| GPT/propietario | Aprobar D-1–D-7 y D-A1–D-A3, protocolo #12 y alcance 0C | Pendiente |

Puerta 0 no aprobada: 0B y 0C sin evidencia suficiente; 0D respaldo real y restauración, privacidad, dispositivos y staging pendientes. No se abren fases por CI verde. Mantener A-82/A-84/A-85/A-86/A-89.
