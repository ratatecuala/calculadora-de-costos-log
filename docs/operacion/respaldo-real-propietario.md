# Respaldo cifrado y prueba local para el propietario

**Estado de A-52.** La captura del origen real y su restauración local siguen pendientes. La prueba aceptada de #56 usó PostgreSQL 17.12 y datos ficticios. Pasaron 11 pruebas de Python y 111 controles del simulacro. Esta guía cubre la preparación. Reserva los pasos 2 a 5 para la ventana que el propietario decida y autorice. [Evidencia del ensayo](https://github.com/ratatecuala/calculadora-de-costos-log/issues/52#issuecomment-7182682511) · [Lista del propietario](../25-lista-staging-52.md).

## 1. Preparar sin acceder al origen

- En Windows, abre **Ubuntu en WSL2**. Usa tu usuario normal y una carpeta privada de Linux fuera de OneDrive y del repositorio. Necesitas Bash, Git, Python 3, age con age-keygen, tar, sha256sum y PostgreSQL 17 completo (cliente y servidor). Sigue la fase 0 de la lista del propietario. Protege con cifrado de disco tanto el directorio de respaldo como el espacio temporal. Deja espacio para el volcado en claro, el paquete cifrado y la base local restaurada.
- Prepara dos ubicaciones distintas para las copias cifradas. Guarda la clave privada de age en tu gestor de contraseñas u otro lugar recuperable separado de ambas. Reutiliza tu clave existente. Si es tu primera copia, sigue el paso de creación de clave de la fase 0 y comprueba que puedes recuperar su copia.
- Usa los scripts de la revisión aceptada de #56. Mientras su integración está pendiente, puedes abrirla en una carpeta independiente. Desde la raíz de tu copia del repositorio en Ubuntu, con la carpeta de destino libre, ejecuta estas líneas en orden y detente si alguna falla.

```bash
git fetch origin refs/pull/56/head
git worktree add --detach ~/calculadora-respaldo-56 499654550f3d3868408361fabbf638f32b715f9b
cd ~/calculadora-respaldo-56
git rev-parse HEAD
```

El resultado debe ser `499654550f3d3868408361fabbf638f32b715f9b`. Ejecuta los pasos siguientes desde esa carpeta. Si el origen incorporó cambios posteriores a los cinco estados de la sección 4, solicita una revisión del restaurador.

## 2. Confirmar el origen y proteger las credenciales

1. Confirma en tu panel cuál es el proyecto y entorno del que quieres guardar los datos. Anota en privado el entorno y el horario. Acuerda una ventana sin escrituras de la app, de Auth ni cambios de esquema. El script captura esquema, datos y controles en consultas separadas. Si hubo actividad durante la captura, repítela en una ventana estable.
2. Sigue el paso 1.3 de la lista del propietario para guardar y validar la CA del proyecto en `~/.config/cotizador/supabase-ca.crt`. Usa el **Session pooler, puerto 5432**. Introduce los datos solo en el asistente local, que pide la contraseña sin mostrarla y guarda los archivos privados con permisos 600. La carpeta debe tener permisos 700. Evita pegar la cadena en órdenes, capturas, chats o issues.
3. Ejecuta estas dos órdenes, una por vez. Continúa únicamente si ves `TLS verificado` y la versión esperada. Comprueba que tu `pg_dump --version` y el servidor de restauración local tienen una versión mayor o igual a la del origen. La combinación ensayada es PostgreSQL 17. Ante un servidor de otra versión mayor, revisa la compatibilidad antes de proseguir.

```bash
python3 scripts/conexion/configurar-conexion.py
bash scripts/conexion/probar-conexion.sh
```

## 3. Crear la copia y comprobar el segundo ejemplar

En Ubuntu, usa el destinatario **público** derivado de tu clave. El directorio de trabajo contendrá temporalmente datos en claro.

```bash
umask 077
mkdir -p ~/respaldos-cotizador
chmod 700 ~/respaldos-cotizador
destinatario="$(age-keygen -y ~/.config/cotizador/clave-respaldo.txt)" &&
  BACKUP_DIR="$HOME/respaldos-cotizador" BACKUP_AGE_RECIPIENT="$destinatario" bash scripts/respaldo-supabase.sh pgdump
```

Espera la salida correcta `Respaldo listo` y guarda en privado la ruta exacta del archivo que acaba en `.tar.age`. Copia ese archivo cifrado a la segunda ubicación. Escribe las rutas absolutas de ambos ejemplares cuando se te pidan (sin comillas). Guarda las dos sumas SHA-256 en tu registro privado y comprueba que coinciden. Si hay error o difieren, conserva el original y repite la copia.

```bash
read -r -p "Ruta del respaldo recién generado: " original
read -r -p "Ruta de la copia en el segundo medio: " copia
sha256sum -- "$original" "$copia"
```

## 4. Restaurar el segundo ejemplar en una base desechable

Usa la misma terminal, con el segundo medio disponible y la ruta exacta elegida antes. Puedes desconectar la red. El restaurador crea un clúster privado en el disco local, escucha solo por socket Unix y lo elimina al terminar. Esta orden elige PostgreSQL 17 de Ubuntu.

```bash
PG_BIN=/usr/lib/postgresql/17/bin RESPALDO="$copia" CLAVE_AGE="$HOME/.config/cotizador/clave-respaldo.txt" bash scripts/simulacro/simulacro-restauracion.sh
```

El programa detecta el estado a partir del esquema e invariantes del **origen respaldado** y reproduce solo ese prefijo en la base temporal.

| Origen respaldado | Migraciones en la base local |
| --- | --- |
| Anterior a #52 | 3 iniciales |
| Con #52 | 4, incluida #52 |
| Con #52 y M3 | 5, incluidas las líneas de carga |
| Con #52, M3 y M4 | 6, incluido guardado v2 |
| Con las anteriores y precio entero | 7, con controles de históricos y del precio entero en entradas nuevas |

Espera código de salida cero, `RESULTADO: DATOS VERIFICADOS` y el mensaje de limpieza. El programa comprueba las sumas internas del manifiesto, el esquema cubierto por el simulacro, datos y conteos de la app y las dos tablas de Auth, numeración y privilegios. En el quinto estado ejecuta además los controles de precios. La prueba cubre la recuperación local de esos datos. El inicio de sesión, Storage y la recuperación completa del servicio alojado quedan fuera de su alcance.

## 5. Cerrar o tratar un fallo

- **Éxito.** Registra en #52 solo fecha UTC, revisión del script, versiones mayores, estado detectado, cantidad de controles, resultado de ambas copias y limpieza. Conserva ambas copias cifradas y la clave resguardada. Las verificaciones adicionales en staging y cualquier aplicación de #52 tienen sus propias autorizaciones (fases 3 a 5 de la lista).
- **Error de conexión, TLS, permisos o espacio.** Detén la captura. Revisa proyecto, CA, permisos y espacio. Conserva la última copia verificada y trata cualquier archivo parcial como fallido. Si hay que comunicar el fallo, comparte solo la etapa y el mensaje saneado. Si se expuso una credencial, trátala como comprometida y rótala por el canal del propietario.
- **Clave, suma, esquema, estado, tipo Auth o datos incompatibles.** Conserva los archivos cifrados. Revisa que sean del mismo intento y que la clave sea la correcta. Ante `HAY DIFERENCIAS`, registra el nombre del control afectado y detente. Corrige la causa antes de generar otra copia o reintentar en un clúster nuevo. Mantén intactos el respaldo y la comparación originales.
- **Interrupción del equipo.** Comprueba que el clúster temporal haya parado y que su carpeta y la carpeta intermedia de captura se hayan retirado. Ante restos con datos en claro, restringe el acceso y limpia únicamente las rutas temporales identificadas de ese intento. La captura solo lee el origen. La reversión del ensayo consiste en descartar su base temporal y conservar el último respaldo válido. Una recuperación en el servicio real requiere una decisión separada.

Nunca adjuntes archivos de respaldo, claves, volcados, direcciones del servidor, identificadores personales o contenido de filas al issue.
