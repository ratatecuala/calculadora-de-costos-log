# 06 · Seguridad y privacidad — aplicación gratuita con cuentas

**Estado:** requisitos mínimos y temas por investigar (#15, #17, #18). *Sincronizado el 20-11-2026:* se agregó el inventario de datos guardados en el navegador (§2); el aviso de privacidad (#17) sigue pendiente. La arquitectura, proveedor de identidad y política de datos aún necesitan aprobación. Repositorio público; nombre comercial pendiente.

## 1. Reglas innegociables

1. Ninguna clave, token, contraseña, datos de calibración real o dirección privada en el repositorio, PR o issue público.
2. **$0 en cargos variables autorizados**; la posibilidad de abrir una cuenta con facturación no autoriza consumo o gasto.
3. Todas las cuentas técnicas bajo titularidad/control del propietario, accesos mínimos y revocables para colaboradores.
4. El usuario puede **calcular sin cuenta**. Solo guardar información en nube cuando inicia sesión y lo autoriza.
5. Separar totalmente el **modelo privado de cálculo** de la **cotización visible para el cliente**.
6. Nada de despliegues, pagos o servicios facturables sin permiso del propietario.

## 2. Inventario de datos del nuevo alcance

| Clase | Ejemplos | Regla preliminar |
|---|---|---|
| Cuenta | Identificador, correo y nombre del proveedor de login | Mínimo necesario; acceso y borrado por propietario |
| Perfil de transportista | Nombre comercial, contacto que decide mostrar | Privado por defecto; separar datos visibles al cliente |
| Vehículos | Categoría, año, modelo, combustible, rendimiento y costos | Privado; no exigir patente ni documento si no es imprescindible |
| Cotización interna | Rutas, costos, meta de remuneración, margen y precio | Privado; protegido por cuenta |
| Cotización compartida | Servicio, comunas, condiciones, precio, contacto voluntario | Entidad/documento independiente; URL con control de acceso |
| Viajes reales y combustible | Odómetro, litros, fechas, montos; boletas manuales | Datos privados por usuario, con borrado/exportación |
| Datos de Maps | Origen/destino y respuesta externa | Tránsito mínimo por Worker/Google; almacenamiento restringido según términos |
| Métricas | Uso de flujos, errores y recurrencia | Agregadas o seudónimas, sin rutas personales en logs |
| Fotos | **No se implementan en v1** | Pro futuro: privacidad, permisos y retención por diseñar |

**Datos guardados en el navegador (estado al 20-11-2026):**

| Clave de `localStorage` | Contenido | Regla |
|---|---|---|
| `cotizador.trabajos.v1` | Historial local de cotizaciones (v1 y, solo sin cuenta y con la flag de integración encendida, v2 con inventario y recursos) | Solo en ese navegador; sin respaldo; se avisa al usuario |
| `cotizador.vehiculos.v1` | Perfiles de «Mi vehículo» sin cuenta | Ídem |
| `cotizador.negocio.v1` | Datos comerciales del emisor | Ídem |
| `cotizador.borrador.v1` | Borrador sin emitir (I-1b): direcciones, costos, vehículo, inventario y recursos escritos por el usuario; **nunca** datos del proveedor de rutas | Solo del modo sin cuenta; no se ofrece a otra identidad (C1); se borra al emitir o descartar |
| `cotizador.migracion.v1` | Registro de la copia del historial local a la cuenta: por identificador de cuenta, los identificadores de cotizaciones y vehículos ya copiados, y las diferidas con su número y motivo | No contiene costos, montos ni direcciones |

El inventario y los recursos **no** aparecen en el PDF, el enlace público ni WhatsApp (D-I7, A-67): el cliente ve solo la descripción del servicio.

**No guardar**: datos reales de otros proyectos, contraseñas de Google, credenciales bancarias, fotos con metadatos GPS ni secretos del usuario.

## 3. Identidad y aislamiento

- Login con Google candidato para cuentas; el acceso anónimo solo usa el motor y estado temporal.
- El proveedor final (Supabase u otro) necesita aprobación. Aplicar reglas de acceso por propietario (por ejemplo, RLS) y comprobar con **dos cuentas separadas** que ninguna puede leer, modificar o exportar registros ajenos.
- Todo endpoint de cotización compartida debe producir solo una **proyección pública permitida**, jamás una respuesta con campos privados ocultos únicamente por CSS.
- Propuesta concreta ([02 §8.4](02-arquitectura.md)): tabla `client_quotes` **sin columnas internas**, llenada por `toClientQuote()` con lista blanca (#38), y acceso público solo mediante `get_public_quote(token)`.
- Definir enlaces de alta entropía, expiración/revocación y política de acceso antes de habilitar compartir.
- Exportación, eliminación y copia de respaldo de datos de usuario necesitan diseño y pruebas.

## 4. Claves, proveedores y facturación

- Claves restringidas, server-side para Google Routes y CNE; Maps Embed puede requerir clave pública de navegador **restringida por dominio y API**, no un secreto de servidor expuesto por error.
- Cloudflare/Google/Supabase: acceso mínimo y logs sin direcciones, teléfonos ni montos.
- Facturación de Google **solo tras autorización**: revisar SKU, cuotas por API, presupuesto, latencia de cuotas y riesgo de abuso; **las alertas no cortan el cobro**.
- En el proxy: límites por cuenta y por origen, antiabuso proporcionado, contador persistente/controles que soporten concurrencia, apagado y modo manual. No confiar en un contador solo en memoria.
- Si se agota el presupuesto de consultas: enlace «Abrir en Google Maps» y kilómetros manuales.
- Activar alertas de seguridad, escaneo de secretos y revisión de dependencias donde esté disponible.

## 5. Rutas y documentos

- La interfaz puede mostrar Google Maps, pero **no extraer datos mediante scraping**.
- No conservar/exportar polilíneas, km y tiempos provenientes de Google sin revisión de términos (#15). El documento PDF debe evitar incluir contenido de Google no autorizado.
- Mapa integrado y cálculo pueden diferir; advertirlo. El usuario elige rutas y tarifas sin afirmaciones falsas.
- Los comprobantes de cotización pueden contener datos personales del cliente: reducir alcance, proteger enlaces y permitir eliminar documentos.
- IVA o detalles tributarios se muestran solo conforme a configuración/regla verificada (#16).

## 6. Revisión legal obligatoria antes de lanzamiento

- Ley chilena de protección de datos y su vigencia efectiva, consentimiento cuando corresponda, finalidades y plazo de retención (#17).
- Rol contractual y transferencia internacional a Google/Cloudflare/proveedor de cuenta.
- Privacidad del historial, capacidad de descargar y eliminar datos, información al cliente que recibe cotización.
- Política de errores, incidentes y posibles cobros/abusos; instrucciones de revocación de claves.

## 7. Respaldo y operación

- GitHub solo contiene código/documentos públicos.
- La base de datos privada de producción requiere plan de **respaldos verificables y restauración probada**. No asumir que el plan gratuito lo trae.
- Usuarios sin cuenta: datos temporales y posible pérdida al cerrar navegador; comunicarlo.
- Plan gratuito de alojamiento e identidad: verificar pausas por inactividad, límites y efecto en personas reales.
- Las cifras, logs y registros se almacenan solo durante el tiempo justificado y conforme a la política aprobada.

## 8. Puertas de seguridad

| Antes de | Evidencia necesaria |
|---|---|
| Primera implementación | Autorización E1, reglas de repositorio, pruebas del motor y sin secretos |
| Cuentas | Proveedor aprobado, aislamiento autenticado, eliminación y respaldo |
| Maps Routes/CNE | Términos, SKU y controles de uso aprobados; salida manual |
| Cotizaciones compartidas | Proyección sin costos internos ni fugas, revocación y pruebas cruzadas |
| Lanzamiento gratuito | Pruebas móviles, seguridad, privacidad, textos legales y autorización pública |
| Pro o IA posterior | Nueva revisión por fotos, pagos, privacidad y gastos; no forma parte de v1 |
