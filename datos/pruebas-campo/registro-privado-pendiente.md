# Registro de campo privado — entrega para #12

El propietario autorizó consolidar las observaciones de circulación personal para su procesamiento. GPT preparó un CSV privado descargable desde el chat del proyecto. No se incluye el contenido en este repositorio público: `calibracion/` está excluido de Git por diseño. Este documento es únicamente un registro de entrega, no el conjunto de datos.

## Próximo paso de Codex

1. Recibir el CSV directamente del propietario en `calibracion/` del equipo privado; no adjuntarlo a un issue, commit, log de CI ni PR.
2. Contrastar con registros locales previos y deduplicar por alias, lecturas y fecha; conservar las observaciones originales y los campos faltantes. El CSV es un registro de observaciones, no un respaldo JSON de la herramienta ni una entrada CLI validada.
3. Preparar un mapeo local a la plantilla vigente de #55, sin alterar snapshots históricos. Conservar por separado horas de tablero, horas locales aproximadas, tiempo transcurrido y tiempo efectivo de marcha. No rellenar los faltantes con cero ni aplicar un desfase de otro día.
4. No calcular rendimiento real ni gasto real a partir de kilometraje o aguja de combustible. No reconstruir presupuestos previos como si fueran originales. Las estimaciones retrospectivas deben etiquetarse como tales.
5. Registrar futuras cargas con litros, precio y kilometraje; separar circulación personal, simulaciones y fletes comerciales. El próximo viaje debe tener una estimación previa si se quiere contrastar prospectivamente.

**Estado:** consolidación privada preparada; recepción local, importación, pruebas contra la herramienta y validación económica pendientes. No hay autorización adicional para código, despliegue, merge, cambios de fórmulas ni publicación de datos reales.
