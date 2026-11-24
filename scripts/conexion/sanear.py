#!/usr/bin/env python3
"""Conexión segura (A-78): comprueba la configuración y SANEA mensajes de psql/pg_dump.

  sanear.py --comprobar <servicio>   valida pg_service.conf y pgpass (PGSERVICEFILE, PGPASSFILE)
  sanear.py < errores.txt            reescribe el texto quitando contraseña, usuario, servidor,
                                     base, identificador del proyecto y direcciones IP

Lee las rutas de las variables de entorno PGSERVICEFILE y PGPASSFILE; nunca recibe secretos como
argumentos. No imprime ningún valor de esos archivos.
"""
import configparser
import os
import re
import sys
from urllib.parse import quote


def leer_servicios(ruta):
    cp = configparser.ConfigParser(interpolation=None, strict=False)
    cp.optionxform = str  # libpq distingue mayúsculas
    with open(ruta, encoding='utf-8') as f:
        cp.read_file(f)
    return cp


def campos_pgpass(linea):
    """Separa una línea de pgpass en sus 5 campos, respetando \\: y \\\\."""
    campos, actual, i = [], '', 0
    while i < len(linea):
        c = linea[i]
        if c == '\\' and i + 1 < len(linea):
            actual += linea[i + 1]
            i += 2
            continue
        if c == ':' and len(campos) < 4:
            campos.append(actual)
            actual = ''
        else:
            actual += c
        i += 1
    campos.append(actual)
    return campos


def leer_pgpass(ruta):
    filas = []
    with open(ruta, encoding='utf-8') as f:
        for n, linea in enumerate(f, 1):
            linea = linea.rstrip('\n')
            if not linea.strip() or linea.lstrip().startswith('#'):
                continue
            c = campos_pgpass(linea)
            if len(c) != 5:
                raise SystemExit(f'ERROR: la línea {n} de pgpass no tiene el formato servidor:puerto:base:usuario:contraseña')
            filas.append(c)
    return filas


def comprobar(servicio):
    try:
        cp = leer_servicios(os.environ['PGSERVICEFILE'])
    except (configparser.Error, UnicodeDecodeError) as e:
        raise SystemExit(f'ERROR: pg_service.conf no se puede leer ({type(e).__name__})')
    if not cp.has_section(servicio):
        raise SystemExit(f'ERROR: pg_service.conf no tiene la sección [{servicio}]')
    sec = cp[servicio]
    if 'password' in sec:
        raise SystemExit('ERROR: pg_service.conf no debe contener la contraseña: va solo en pgpass')
    faltan = [k for k in ('host', 'port', 'dbname', 'user') if not sec.get(k)]
    if faltan:
        raise SystemExit(f'ERROR: a la sección [{servicio}] de pg_service.conf le falta: {", ".join(faltan)}')
    if sec.get('port') == '6543':
        raise SystemExit('ERROR: el puerto 6543 es el «transaction pooler»; usa el Session pooler (puerto 5432)')
    filas = leer_pgpass(os.environ['PGPASSFILE'])
    def coincide(patron, valor):
        return patron == '*' or patron == valor
    if not any(coincide(h, sec['host']) and coincide(p, sec['port']) and coincide(d, sec['dbname'])
               and coincide(u, sec['user']) and pw for h, p, d, u, pw in filas):
        raise SystemExit(f'ERROR: pgpass no tiene una contraseña para el servicio [{servicio}]')


def secretos():
    valores = set()
    try:
        cp = leer_servicios(os.environ.get('PGSERVICEFILE', ''))
        for sec in cp.sections():
            for k in ('host', 'hostaddr', 'user', 'dbname', 'password'):
                if cp[sec].get(k):
                    valores.add((cp[sec][k], k))
    except (OSError, configparser.Error, UnicodeDecodeError):
        pass
    try:
        for h, _p, d, u, pw in leer_pgpass(os.environ.get('PGPASSFILE', '')):
            for v, k in ((h, 'host'), (d, 'dbname'), (u, 'user'), (pw, 'password')):
                if v and v != '*':
                    valores.add((v, k))
    except (OSError, SystemExit, UnicodeDecodeError):
        pass
    extra = set()
    for v, k in valores:
        if k == 'user' and '.' in v:  # postgres.<project-ref>: el ref identifica el proyecto
            extra.add((v.split('.', 1)[1], 'ref'))
        if k == 'password':
            extra.add((quote(v, safe=''), 'password'))
    valores |= extra
    # Los valores genéricos (p. ej. la base «postgres») no se tapan: no identifican nada.
    return sorted((x for x in valores if len(x[0]) >= 4 and x[0] not in ('postgres', 'localhost')),
                  key=lambda x: -len(x[0]))


ETIQUETA = {'password': '<contraseña>', 'user': '<usuario>', 'host': '<servidor>', 'hostaddr': '<servidor>',
            'dbname': '<base>', 'ref': '<proyecto>'}
IP = re.compile(r'\b(?:\d{1,3}\.){3}\d{1,3}\b|\b(?:[0-9a-fA-F]{1,4}:){4,7}[0-9a-fA-F]{1,4}\b'
                r'|\b[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4})*::(?:[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4})*)?\b')


def sanear(texto):
    for valor, tipo in secretos():
        texto = texto.replace(valor, ETIQUETA[tipo])
    return IP.sub('<ip>', texto)


def main():
    if len(sys.argv) == 3 and sys.argv[1] == '--comprobar':
        comprobar(sys.argv[2])
    elif len(sys.argv) == 1:
        sys.stdout.write(sanear(sys.stdin.read()))
    else:
        raise SystemExit(__doc__)


if __name__ == '__main__':
    main()
