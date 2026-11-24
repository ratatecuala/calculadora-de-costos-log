#!/usr/bin/env python3
"""CONFIGURAR LA CONEXIÓN a la base de Supabase, sin dejar la contraseña a la vista (A-78, docs/25 paso 1.3).

  python3 scripts/conexion/configurar-conexion.py [--servicio cotizador-staging] [--certificado RUTA]

ANTES: descarga el certificado raíz (CA) de tu proyecto desde el panel de Supabase y cópialo a
~/.config/cotizador/supabase-ca.crt (docs/25, paso 1.3). Sin él, el asistente no continúa.

Pide (sin mostrar lo que escribes ni guardarlo en el historial):
  1. la cadena de conexión del «Session pooler» copiada del botón Connect de Supabase; puede traer
     [YOUR-PASSWORD] en vez de la contraseña;
  2. la contraseña de la base, si la cadena no la trae.
Escribe, en ~/.config/cotizador (carpeta 700) y con permisos 600:
  * pg_service.conf: la sección [cotizador-staging] con servidor, puerto, base, usuario y TLS
    verificado: sslmode=verify-full, sslrootcert=<certificado> y gssencmode=disable (A-79), sin
    contraseña. Cualquier sslmode que traiga la cadena se ignora;
  * pgpass: una línea servidor:puerto:base:usuario:contraseña.
Los scripts se conectan luego con `service=cotizador-staging`: la contraseña nunca aparece en la línea
de comandos, en variables de entorno ni en la salida. No se conecta a nada: solo escribe los archivos.
Otra carpeta (solo para pruebas): variable COTIZADOR_CONFIG_DIR. Sin terminal (pruebas automáticas),
lee las respuestas de la entrada estándar, una por línea.
"""
import argparse
import configparser
import getpass
import importlib.util
import io
import os
import re
import sys
from urllib.parse import unquote, urlsplit, parse_qs

# Misma política TLS que comprueban los scripts (sanear.py), cargada por ruta: con `python3 -I` la
# carpeta del script no está en sys.path.
_spec = importlib.util.spec_from_file_location('sanear', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sanear.py'))
sanear = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sanear)

REPO = os.path.realpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))


def fallar(msg):
    raise SystemExit(f'ERROR: {msg}')


def preguntar(texto):
    if sys.stdin.isatty():
        return getpass.getpass(texto)
    linea = sys.stdin.readline()
    if not linea:
        fallar('no se recibió respuesta')
    return linea.rstrip('\r\n')


def escapar_pgpass(v):
    return v.replace('\\', '\\\\').replace(':', '\\:')


def escribir_privado(ruta, contenido):
    tmp = ruta + '.nuevo'
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(contenido)
    os.chmod(tmp, 0o600)
    os.replace(tmp, ruta)


def main():
    ap = argparse.ArgumentParser(description='Configura la conexión segura (sin contraseña a la vista).')
    ap.add_argument('--servicio', default='cotizador-staging')
    ap.add_argument('--certificado', default=None,
                    help='certificado raíz de Supabase (por defecto ~/.config/cotizador/supabase-ca.crt)')
    args = ap.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9_-]+', args.servicio):
        fallar('el nombre del servicio solo admite letras, números, - y _')

    carpeta = os.path.realpath(os.path.expanduser(os.environ.get('COTIZADOR_CONFIG_DIR', '~/.config/cotizador')))
    if carpeta == REPO or carpeta.startswith(REPO + os.sep):
        fallar('la carpeta de configuración no puede estar dentro del repositorio')
    os.makedirs(carpeta, mode=0o700, exist_ok=True)
    os.chmod(carpeta, 0o700)

    cadena = preguntar('Pega la cadena de conexión del Session pooler (no se verá) y pulsa Enter: ').strip()
    # Supabase muestra la cadena con «[YOUR-PASSWORD]»; los corchetes confundirían al analizador de URL.
    falta_clave = re.search(r'\[YOUR-PASSWORD\]', cadena, re.I) is not None
    cadena = re.sub(r'\[YOUR-PASSWORD\]', 'CLAVE-PENDIENTE', cadena, flags=re.I)
    try:
        u = urlsplit(cadena)
        puerto = u.port or 5432
    except ValueError:
        fallar('la cadena de conexión no tiene un formato válido (debe empezar con postgresql://)')
    if u.scheme not in ('postgres', 'postgresql') or not u.hostname or not u.username:
        fallar('la cadena de conexión no tiene un formato válido (debe empezar con postgresql://)')
    if puerto == 6543:
        fallar('esa es la cadena del «transaction pooler» (puerto 6543): copia la del Session pooler (puerto 5432)')
    usuario = unquote(u.username)
    base = unquote(u.path.lstrip('/')) or 'postgres'
    pedido = parse_qs(u.query).get('sslmode', [None])[0]
    # TLS (A-79): siempre verify-full con el certificado raíz, salvo la excepción de pruebas locales.
    if sanear.excepcion_local(u.hostname):
        tls = [('sslmode', 'disable')]
        print('AVISO: excepción de PRUEBA LOCAL sin TLS (servidor de loopback). Nunca para Supabase.')
    else:
        cert = os.path.realpath(os.path.expanduser(args.certificado or os.path.join(carpeta, 'supabase-ca.crt')))
        sanear.validar_certificado(cert)  # antes de pedir la contraseña
        tls = [('sslmode', 'verify-full'), ('sslrootcert', cert)]
        if pedido and pedido != 'verify-full':
            print(f'AVISO: la cadena traía sslmode={pedido}; se usará sslmode=verify-full (verifica el servidor).')
    clave = '' if falta_clave or not u.password else unquote(u.password)
    if not clave:
        clave = preguntar('Escribe o pega la contraseña de la base (no se verá) y pulsa Enter: ')
    if not clave:
        fallar('la contraseña está vacía')
    if any(c in clave for c in '\r\n\0'):
        fallar('la contraseña tiene un carácter no válido')

    ruta_srv = os.path.join(carpeta, 'pg_service.conf')
    cp = configparser.ConfigParser(interpolation=None, strict=False)
    cp.optionxform = str
    if os.path.exists(ruta_srv):
        with open(ruta_srv, encoding='utf-8') as f:
            cp.read_file(f)
    if cp.has_section(args.servicio):
        cp.remove_section(args.servicio)
    cp.add_section(args.servicio)
    for k, v in [('host', u.hostname), ('port', str(puerto)), ('dbname', base), ('user', usuario),
                 *tls, ('gssencmode', 'disable'), ('connect_timeout', '20')]:
        cp[args.servicio][k] = v
    buf = io.StringIO()
    cp.write(buf, space_around_delimiters=False)
    escribir_privado(ruta_srv, buf.getvalue())

    ruta_pass = os.path.join(carpeta, 'pgpass')
    clave_linea = ':'.join(escapar_pgpass(x) for x in (u.hostname, str(puerto), base, usuario))
    otras = []
    if os.path.exists(ruta_pass):
        with open(ruta_pass, encoding='utf-8') as f:
            otras = [l.rstrip('\n') for l in f if l.strip() and not l.startswith(clave_linea + ':')]
    escribir_privado(ruta_pass, '\n'.join(otras + [clave_linea + ':' + escapar_pgpass(clave)]) + '\n')

    print(f'Listo: servicio «{args.servicio}» guardado en {carpeta} (pg_service.conf y pgpass, permisos 600).')
    print('La contraseña no se mostró ni quedó en el historial.')


if __name__ == '__main__':
    main()
