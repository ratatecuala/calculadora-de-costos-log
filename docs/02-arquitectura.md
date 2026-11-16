# 02 · Arquitectura candidata — pendiente de aprobación

**Estado:** la arquitectura anterior «sin cuentas, sin BD y sin mapa» quedó **superada** por el nuevo alcance. La dirección visual v4 blanco/azul/grafito y las pantallas inicial/calculadora fueron aprobadas; la extensión del diseño ya se entregó y se revisó, pero resta confirmación del propietario. **Proveedores, modos de tráfico, cuotas y gastos todavía no están aprobados.** No autoriza crear cuentas, código, despliegues ni facturación.

## 1. Principios que se conservan

- Código simple y mantenible; **un proyecto** en vez de microservicios prematuros.
- **Motor de cálculo puro, determinista y probado**, separado de pantalla, red, proveedor de rutas, autenticación y base de datos.
- Preferencia previa: **TypeScript estricto + React + Vite**. Confirmación final del stack con diseño/arquitectura revisada.
- Integraciones externas en un servidor/proxy para restringir claves y controlar consumo.
- El **nombre comercial no está definido**. No usar el nombre anterior en el producto.

## 2. Componentes necesarios para la primera versión

```text
Web responsive — acceso anónimo o con cuenta
   ├─ Motor de costos aislado: cálculos reproducibles y modo manual
   ├─ Vehículos, cotizaciones, historial y cargas de combustible (cuenta)
   ├─ PDF local y vista pública separada de los costos privados
   ├─ Mapa de una ruta a la vez: Maps Embed (candidato de implementación)
   └─ API/Worker controlado
         ├─ Routes: tramos y preferencias de ruta, km, duración, tráfico
         ├─ Fuente de combustible CNE / datos versionados, si hay permisos
         └─ Peajes/TAG: catálogo verificable o ingreso manual
   └─ Autenticación Google + almacenamiento privado por usuario
         └─ proveedor por decidir (Supabase candidato; alternativas por comparar)
```

## 3. Decisiones técnicas abiertas

| Tema | Dirección provisional | Validación pendiente |
|---|---|---|
| Login | Google OAuth; modo anónimo para probar | Implementación segura; alternativa correo; límites |
| Base de datos | **Supabase Auth + PostgreSQL es candidato**, no decisión final | Plan gratuito, respaldos, disponibilidad, RLS, mantenimiento y propiedad de cuenta |
| Hosting/API | Cloudflare es candidato | Plan aplicable, costos, límites, secreto de API y riesgo de abuso (#18) |
| Rutas | Google Routes para datos; Maps Embed para visualización | Costos/SKU, permisos, mapa/ruta coherente, contraste de tráfico, condiciones (#15/#19) |
| Documentos | PDF generado en navegador | Control de impresión y de enlaces públicos, impuestos (#16) |
| Fotos/IA | Ninguna en v1 | Investigación para Pro, después de validar gratis |
| Marketplace | No construir | Marketplace, logística elástica o mezcla siguen indefinidos |

## 4. Rutas y consumo

- **Trayectos:** base→A opcional; A→B obligatorio; B→base opcional. Calcular cada tramo relevante y **no contabilizar dos veces** combustible, kilómetros, horas, peajes ni ayudantes.
- **Alternativas:** ruta usual/rápida vs. evitando peajes. El mapa visible presenta **una opción a la vez**, y las dos fichas de resultados quedan disponibles para comparar. «Evitar» es preferencia, no garantía de cero TAG; si no hay alternativa válida, indicarlo.
- **Maps Embed (directions)** permite visualizar rutas y preferencia de evitar peajes/autopistas, pero **no entrega kilómetros y minutos como datos estructurados para el motor**.
- **Routes** proporciona distancia y duración. Como criterio de ahorro, **el tráfico actualizado no se pide continuamente**: se contempla una acción expresa del usuario para consultarlo y actualizar cifras, previa verificación de SKU, precios y cuota. La diferencia entre duraciones **no equivale necesariamente a minutos de congestión medidos**.
- Dibujar dos líneas superpuestas no es capacidad garantizada de Embed; **alternar el mapa** es opción válida. Si se necesita un mapa dinámico con polilíneas habrá que investigar otro SKU y sus condiciones.
- Recalcular en el servidor es distinto de usar la interfaz pública Google Maps; **no scraping**. La fuente y fecha se exponen al usuario.
- Los rendimientos ciudad/carretera son datos opcionales **del vehículo** o referencias identificadas. Nunca estimar litros adicionales de «tacos» con un multiplicador sin calibración.
- Con tres tramos y dos preferencias de ruta pueden ser necesarias **varias consultas**, no asumir 2 llamadas por cotización; contabilizar el peor caso antes de habilitar APIs. **No recalcular con tráfico en cada edición de campo** ni mostrar un horario exacto de restablecimiento de cuota salvo evidencia del proveedor y contador propio.

## 5. Persistencia y separación de datos

- Sin login: sesión temporal; informar claramente que no hay respaldo remoto. Si faltan costos fijos, desgaste o peajes, el sistema mantiene disponible **la creación de una cotización indicativa por precio elegido manualmente**, con alerta visible de «Costo parcial» y sin presentarla como rentabilidad validada.
- Con login: perfil, vehículos, parámetros, cotizaciones y registros reales **privados por usuario**; mínimos datos posibles.
- La **cotización pública** debe ser una vista independiente con solo datos elegidos para compartir y acceso controlado. Nunca exponer el modelo privado completo ni rutas/direcciones innecesarias.
- Guardado/exportación de contenido proveniente de Google condicionado a revisión formal de términos (#15); cálculos locales solo pueden reproducir entradas autorizadas.
- RLS/controles server-side y respaldo/restitución sujetos a prueba antes de publicar.

## 6. Presupuesto y controles

El propietario acepta evaluar una **cuenta de Google Cloud con facturación habilitada**, pero **no ha autorizado cargos variables**. El nivel gratuito no garantiza un resultado de $0. Antes de activar: identificar SKU y precio real, probar límites/alertas, implementar rate limiting, degradar a kilómetros manuales, control por usuario y mecanismos de desactivación. Ninguna API se activa por el simple hecho de estar documentada.

## 7. Pruebas previstas

Vitest (casos dorados, propiedades), pruebas de aislamiento del motor y de rutas/contratos, controles de identidad/permiso, pruebas de documento PDF, accesibilidad móvil, flujos anónimo/Google y contingencias de Google, CNE y peajes. Las herramientas finales se confirman con la arquitectura.
