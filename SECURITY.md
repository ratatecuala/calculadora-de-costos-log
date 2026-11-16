# Seguridad

## Reportar un problema de seguridad

Si encuentras una clave expuesta, una forma de generar cobros abusivos, una fuga de datos personales u otra vulnerabilidad:

- **No abras un issue público** con los detalles.
- Usa **"Report a vulnerability"** en la pestaña **Security** de este repositorio (reporte privado de GitHub).
- Si esa opción no está disponible, abre un issue con el título "Contacto de seguridad", **sin detalles**, y el propietario te contactará.

## Alcance

El protocolo completo está en [docs/06-seguridad-y-privacidad.md](docs/06-seguridad-y-privacidad.md).

## Si se expone una clave

1. Revocarla de inmediato en la consola del servicio, una tarea del propietario.
2. Emitir una nueva y guardarla solo en los secretos del Worker.
3. Revisar el consumo y los cobros del período.
4. Registrar el incidente sin incluir la clave.
